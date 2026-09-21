import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { campaign, slots, type AuctionSnapshot, type PublicBid, type PublicSlot } from "./campaign";
import { assertOpen, AuctionError, closesAt, isClosed, nextBidCents, RESERVATION_MS, type CheckoutInput } from "./auction-domain";
import { db, enqueue, transaction, type ReservationRow, type SlotRow } from "./db";
import { appOrigin, getStripe, paymentMode, paymentsConfigured, requirePayments } from "./server-config";

export function emptySnapshot(): AuctionSnapshot {
  return { mode: "preview", paymentsEnabled: false, closed: isClosed(), currentTotalCents: 0,
    slots: slots.map((slot) => ({ ...slot, currentBidCents: 0, nextBidCents: campaign.startingBidCents, sponsor: null, history: [], reserved: false })) };
}

export async function getAuctionSnapshot(): Promise<AuctionSnapshot> {
  if (!process.env.DATABASE_URL) return emptySnapshot();
  // Read all public auction state from a single snapshot: never show a new
  // total alongside an old winner while a takeover transaction commits.
  return transaction(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const slotRows = (await client.query<SlotRow>("SELECT * FROM auction_slots")).rows;
    const bidRows = (await client.query("SELECT id,slot_id,sponsor_name,sponsor_website,logo_url,amount,accepted_at,status FROM bids ORDER BY accepted_at DESC")).rows;
    const paused = (await client.query("SELECT paused FROM campaign_state WHERE id=true")).rows[0]?.paused ?? true;
    const publicSlots: PublicSlot[] = slots.map((slot) => {
      const row = slotRows.find((item) => item.id === slot.id);
      if (!row) throw new AuctionError("DATABASE_NOT_READY", "Auction setup is incomplete.", 503);
      const history: PublicBid[] = bidRows.filter((bid) => bid.slot_id === slot.id).map((bid) => ({ id: bid.id, sponsorName: bid.sponsor_name, website: bid.sponsor_website, amountCents: bid.amount, acceptedAt: bid.accepted_at.toISOString(), status: bid.status }));
      const winner = bidRows.find((bid) => bid.id === row.current_bid_id);
      let next: number | null = null;
      try { next = nextBidCents(row.current_amount); } catch { /* Explicit payment ceiling. */ }
      return { ...slot, currentBidCents: row.current_amount, nextBidCents: next, sponsor: winner ? { name: winner.sponsor_name, website: winner.sponsor_website, logoUrl: winner.logo_url } : null, history, reserved: Boolean(row.reservation_id || row.needs_review) };
    });
    return { mode: paymentMode(), paymentsEnabled: paymentsConfigured() && !paused && !isClosed(), closed: isClosed(), slots: publicSlots, currentTotalCents: publicSlots.reduce((sum, slot) => sum + slot.currentBidCents, 0) };
  });
}

function checkoutParams(id: string, input: CheckoutInput, amount: number, version: number): Stripe.Checkout.SessionCreateParams {
  const origin = appOrigin();
  const metadata = { campaign: "chicken-legs-2026", reservation_id: id, slot_id: input.slotId, slot_version: String(version) };
  return {
    mode: "payment", payment_method_types: ["card"], adaptive_pricing: { enabled: false },
    client_reference_id: id, customer_email: input.email, metadata,
    payment_intent_data: { metadata },
    // Default Stripe expiry (24h) is intentional. Our worker explicitly expires
    // the session after ten minutes. Parameters must stay identical on retries.
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amount, product_data: { name: `Chicken Legs — ${slots.find((s) => s.id === input.slotId)!.label}`, description: "Race-day temporary logo tattoo; sponsor mention in public bid history. Takeovers refund the previous sponsor less original itemized Stripe fees." } } }],
    success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled&slot=${input.slotId}`,
    custom_text: { submit: { message: "USD payment. If outbid, your original payment is refunded less original itemized Stripe fees; EUR fees use the original payment exchange rate. Your sponsorship is confirmed after payment verification." } },
  };
}

export async function createCheckout(input: CheckoutInput, requestKey: string, networkIdentity: string): Promise<{ url: string }> {
  requirePayments();
  assertOpen();
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const reservation = await transaction(async (client): Promise<ReservationRow> => {
    // A repeated request key must serialize even when the first INSERT has not committed.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [requestKey]);
    const existing = (await client.query<ReservationRow>("SELECT * FROM reservations WHERE request_key=$1", [requestKey])).rows[0];
    if (existing) {
      if (existing.request_hash !== requestHash) throw new AuctionError("KEY_REUSED", "This checkout request was already used for different details.", 409);
      if (existing.state !== "pending") throw new AuctionError("CHECKOUT_COMPLETE", "This checkout is no longer open.", 409);
      return existing;
    }
    const state = (await client.query("SELECT paused FROM campaign_state WHERE id=true FOR SHARE")).rows[0];
    if (!state || state.paused) throw new AuctionError("AUCTION_PAUSED", "Bidding is temporarily paused.", 409);
    const slot = (await client.query<SlotRow>("SELECT * FROM auction_slots WHERE id=$1 FOR UPDATE", [input.slotId])).rows[0];
    assertOpen(); // Recheck after waiting for the lock.
    if (!slot || slot.needs_review) throw new AuctionError("PLACEMENT_REVIEW", "This placement is temporarily unavailable.", 409);
    if (slot.reservation_id) throw new AuctionError("PLACEMENT_RESERVED", "Someone is checking out for this placement. Please try again shortly.", 409);
    // Rate limiting is transactional and persistent across serverless instances.
    for (const identity of [`network:${networkIdentity}`, `email:${input.email}`]) {
      const key = createHash("sha256").update(`${process.env.WORKER_SECRET}:${identity}`).digest("hex");
      const limit = (await client.query("INSERT INTO request_limits (key) VALUES ($1) ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN request_limits.window_start < now()-interval '10 minutes' THEN 1 ELSE request_limits.attempts+1 END, window_start=CASE WHEN request_limits.window_start < now()-interval '10 minutes' THEN now() ELSE request_limits.window_start END RETURNING attempts", [key])).rows[0];
      if (limit.attempts > 5) throw new AuctionError("RATE_LIMITED", "Please wait a few minutes before starting another checkout.", 429);
    }
    const pending = await client.query("SELECT id FROM reservations WHERE sponsor_email=$1 AND state='pending'", [input.email]);
    if (pending.rowCount) throw new AuctionError("CHECKOUT_IN_PROGRESS", "You already have an open checkout. Complete it before reserving another spot.", 409);
    const id = randomUUID();
    const amount = nextBidCents(slot.current_amount);
    const releaseAfter = new Date(Math.min(Date.now() + RESERVATION_MS, closesAt.getTime()));
    const inserted = (await client.query<ReservationRow>("INSERT INTO reservations (id,request_key,request_hash,slot_id,slot_version,amount,sponsor_name,sponsor_email,sponsor_website,logo_url,terms_version,checkout_params,release_after) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *", [id, requestKey, requestHash, input.slotId, slot.version, amount, input.sponsorName, input.email, input.website, input.logoUrl || null, campaign.termsVersion, JSON.stringify(checkoutParams(id, input, amount, slot.version)), releaseAfter])).rows[0];
    await client.query("UPDATE auction_slots SET reservation_id=$2 WHERE id=$1", [input.slotId, id]);
    // If the process dies before/after the API call, this job recovers via the
    // same Stripe idempotency key and immutable checkout_params.
    await enqueue(client, "reservation", id, new Date(Date.now() + 60_000));
    return inserted;
  });
  if (reservation.release_after.getTime() <= Date.now()) throw new AuctionError("CHECKOUT_EXPIRED", "This checkout is being closed. Please try again shortly.", 409);
  const session = await ensureStripeSession(reservation);
  if (session.status !== "open" || !session.url) throw new AuctionError("CHECKOUT_COMPLETE", "This checkout is no longer open.", 409);
  return { url: session.url };
}

export async function ensureStripeSession(reservation: ReservationRow): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  if (reservation.session_id) return stripe.checkout.sessions.retrieve(reservation.session_id);
  // Stripe can prune idempotency keys after 24h. Never blindly create again.
  if (Date.now() - reservation.created_at.getTime() > 23 * 60 * 60_000) throw new AuctionError("SESSION_REVIEW", "Session identity requires manual reconciliation.", 503);
  const session = await stripe.checkout.sessions.create(reservation.checkout_params, { idempotencyKey: `checkout:${reservation.id}` });
  await db().query("UPDATE reservations SET session_id=$2 WHERE id=$1 AND (session_id IS NULL OR session_id=$2)", [reservation.id, session.id]);
  return session;
}
