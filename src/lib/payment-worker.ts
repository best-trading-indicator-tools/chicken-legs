import "server-only";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { AuctionError, paymentDecision, refundAfterFees } from "./auction-domain";
import { db, enqueue, transaction, type ReservationRow, type SlotRow } from "./db";
import { ensureStripeSession } from "./auctions";
import { getStripe, paymentMode } from "./server-config";

class RetryLater extends Error {
  constructor(public code: string, public seconds = 60) { super(code); }
}

const supportedEvents = new Set([
  "checkout.session.completed", "checkout.session.expired", "payment_intent.succeeded",
  "charge.updated", "charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed",
  "refund.created", "refund.updated", "refund.failed",
]);

export async function recordStripeEvent(event: Stripe.Event): Promise<void> {
  if (!supportedEvents.has(event.type)) return;
  if (event.livemode !== (paymentMode() === "live")) throw new AuctionError("MODE_MISMATCH", "Webhook mode does not match this environment.");
  await transaction(async (client) => {
    await client.query("INSERT INTO stripe_events (id,type,created,payload) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [event.id, event.type, event.created, JSON.stringify(event)]);
    await enqueue(client, "event", event.id);
  });
}

async function findSuccessEvent(reservation: ReservationRow, intentId: string): Promise<Stripe.Event> {
  const stored = (await db().query("SELECT payload FROM stripe_events WHERE type='payment_intent.succeeded' AND payload->'data'->'object'->>'id'=$1 ORDER BY created LIMIT 1", [intentId])).rows[0];
  if (stored) return stored.payload as Stripe.Event;
  // Recover dropped webhook deliveries using Stripe's authoritative event time.
  // Never use charge creation, Session creation or local arrival time as success.
  const stripe = getStripe();
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page++) {
    const events = await stripe.events.list({ type: "payment_intent.succeeded", created: { gte: Math.floor(reservation.created_at.getTime() / 1000) - 5 }, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    for (const event of events.data) {
      if ((event.data.object as Stripe.PaymentIntent).id === intentId) {
        if (event.livemode !== (paymentMode() === "live")) throw new AuctionError("EVENT_REVIEW", "Payment environment mismatch.", 503);
        await recordStripeEvent(event);
        return event;
      }
    }
    if (!events.has_more) break;
    startingAfter = events.data.at(-1)!.id;
  }
  throw new RetryLater("WAITING_FOR_SUCCESS_EVENT");
}

async function acceptPayment(reservation: ReservationRow, session: Stripe.Checkout.Session, intent: Stripe.PaymentIntent, event: Stripe.Event): Promise<void> {
  const eventIntent = event.data.object as Stripe.PaymentIntent;
  if (event.type !== "payment_intent.succeeded" || eventIntent.id !== intent.id || event.livemode !== intent.livemode) throw new AuctionError("EVENT_REVIEW", "Payment event identity mismatch.", 503);
  if (intent.latest_charge) {
    const charge = typeof intent.latest_charge === "string" ? await getStripe().charges.retrieve(intent.latest_charge) : intent.latest_charge;
    if (charge.disputed || charge.amount_refunded > 0) {
      await transaction(async (client) => {
        await client.query("UPDATE auction_slots SET needs_review=true WHERE id=$1", [reservation.slot_id]);
        await client.query("UPDATE reservations SET state='review',payment_intent_id=$2 WHERE id=$1 AND state='pending'", [reservation.id, intent.id]);
      });
      throw new AuctionError("PAYMENT_REVIEW", "Disputed or previously refunded payment requires review.", 503);
    }
  }
  await transaction(async (client) => {
    const slot = (await client.query<SlotRow>("SELECT * FROM auction_slots WHERE id=$1 FOR UPDATE", [reservation.slot_id])).rows[0];
    const current = (await client.query<ReservationRow>("SELECT * FROM reservations WHERE id=$1 FOR UPDATE", [reservation.id])).rows[0];
    if (["accepted", "refunding"].includes(current.state)) return;
    if (current.state === "review" || slot.needs_review) throw new AuctionError("PAYMENT_REVIEW", "Placement requires review.", 503);
    const decision = paymentDecision({
      status: intent.status, sessionPaid: session.payment_status === "paid", amountReceived: intent.amount_received,
      currency: intent.currency, successEventCreated: event.created, expectedAmount: current.amount,
      expectedVersion: current.slot_version, slotVersion: slot.version, reservationOwnsSlot: slot.reservation_id === current.id,
      metadataMatches: intent.metadata.reservation_id === current.id && intent.metadata.slot_id === current.slot_id && intent.metadata.slot_version === String(current.slot_version) &&
        session.client_reference_id === current.id && session.metadata?.reservation_id === current.id && session.currency === "usd" && session.amount_total === current.amount &&
        intent.livemode === (paymentMode() === "live"),
    });
    await client.query("UPDATE reservations SET payment_intent_id=$2 WHERE id=$1", [current.id, intent.id]);
    if (decision === "refund") {
      await client.query("UPDATE reservations SET state='refunding' WHERE id=$1", [current.id]);
      await client.query("UPDATE auction_slots SET reservation_id=NULL WHERE id=$1 AND reservation_id=$2", [current.slot_id, current.id]);
      const refundId = randomUUID();
      await client.query("INSERT INTO refund_obligations (id,reservation_id,payment_intent_id,reason) VALUES ($1,$2,$3,'invalid_payment') ON CONFLICT (reservation_id) DO NOTHING", [refundId, current.id, intent.id]);
      await enqueue(client, "refund", current.id);
      await client.query("INSERT INTO audit_log (action,entity_id,details) VALUES ('payment_refund_required',$1,$2)", [current.id, JSON.stringify({ successEventId: event.id })]);
      return;
    }
    if (slot.current_bid_id) {
      const previous = (await client.query("UPDATE bids SET status='outbid' WHERE id=$1 RETURNING reservation_id,payment_intent_id", [slot.current_bid_id])).rows[0];
      await client.query("INSERT INTO refund_obligations (id,reservation_id,payment_intent_id,reason) VALUES ($1,$2,$3,'outbid') ON CONFLICT (reservation_id) DO NOTHING", [randomUUID(), previous.reservation_id, previous.payment_intent_id]);
      await enqueue(client, "refund", previous.reservation_id);
    }
    const bidId = randomUUID();
    const paidAt = new Date(event.created * 1000);
    await client.query("INSERT INTO bids (id,reservation_id,slot_id,amount,sponsor_name,sponsor_website,logo_url,payment_intent_id,success_event_id,accepted_at,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'current')", [bidId, current.id, current.slot_id, current.amount, current.sponsor_name, current.sponsor_website, current.logo_url, intent.id, event.id, paidAt]);
    await client.query("UPDATE auction_slots SET current_bid_id=$2,current_amount=$3,version=version+1,reservation_id=NULL WHERE id=$1", [current.slot_id, bidId, current.amount]);
    await client.query("UPDATE reservations SET state='accepted',accepted_at=$2 WHERE id=$1", [current.id, paidAt]);
    await client.query("INSERT INTO audit_log (action,entity_id,details) VALUES ('bid_accepted',$1,$2)", [current.id, JSON.stringify({ successEventId: event.id, amount: current.amount })]);
  });
}

async function reconcileReservation(id: string, suppliedEvent?: Stripe.Event): Promise<void> {
  const reservation = (await db().query<ReservationRow>("SELECT * FROM reservations WHERE id=$1", [id])).rows[0];
  if (!reservation || ["accepted", "refunding", "review"].includes(reservation.state)) return;
  // Even expired rows are reconciled when a payment event arrives; a late or
  // invalid payment must receive a tracked refund, not be silently ignored.
  if (reservation.state === "expired" && !suppliedEvent) return;
  let session = await ensureStripeSession(reservation);
  const stripe = getStripe();
  if (session.status === "open" && reservation.release_after.getTime() <= Date.now()) {
    try { session = await stripe.checkout.sessions.expire(session.id, {}, { idempotencyKey: `expire:${reservation.id}` }); }
    catch { session = await stripe.checkout.sessions.retrieve(session.id); }
  }
  if (session.payment_status === "paid" && session.payment_intent) {
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
    const intent = await stripe.paymentIntents.retrieve(intentId);
    const event = suppliedEvent?.type === "payment_intent.succeeded" ? suppliedEvent : await findSuccessEvent(reservation, intentId);
    await acceptPayment(reservation, session, intent, event);
    return;
  }
  if (session.status === "expired") {
    // Never unlock while a PaymentIntent can still settle. Cancellation failure
    // means leave the slot reserved and reconcile on the next attempt.
    if (session.payment_intent) {
      const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
      let intent = await stripe.paymentIntents.retrieve(intentId);
      if (intent.status === "succeeded") throw new RetryLater("SESSION_SETTLEMENT_PENDING");
      if (intent.status !== "canceled") {
        try { intent = await stripe.paymentIntents.cancel(intentId, {}, { idempotencyKey: `cancel:${reservation.id}` }); }
        catch { throw new RetryLater("PAYMENT_CANCELLATION_PENDING"); }
      }
      if (intent.status !== "canceled") throw new RetryLater("PAYMENT_CANCELLATION_PENDING");
    }
    await transaction(async (client) => {
      await client.query("SELECT id FROM auction_slots WHERE id=$1 FOR UPDATE", [reservation.slot_id]);
      await client.query("UPDATE reservations SET state='expired' WHERE id=$1 AND state='pending'", [id]);
      await client.query("UPDATE auction_slots SET reservation_id=NULL WHERE id=$1 AND reservation_id=$2 AND EXISTS (SELECT 1 FROM reservations WHERE id=$2 AND state='expired')", [reservation.slot_id, id]);
    });
    return;
  }
  throw new RetryLater("CHECKOUT_OPEN", 45);
}

interface RefundRow {
  id: string; reservation_id: string; payment_intent_id: string;
  reason: "outbid" | "invalid_payment";
  state: string; amount: number | null; fee_amount: number | null;
  stripe_refund_id: string | null; submitted_at: Date | null;
}

async function reconcileRefund(reservationId: string, refreshProviderStatus = false): Promise<void> {
  const obligation = (await db().query<RefundRow>("SELECT * FROM refund_obligations WHERE reservation_id=$1", [reservationId])).rows[0];
  if (!obligation || obligation.state === "review" || (obligation.state === "succeeded" && !refreshProviderStatus)) return;
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(obligation.payment_intent_id, { expand: ["latest_charge.balance_transaction"] });
  if (!intent.latest_charge || typeof intent.latest_charge === "string") throw new RetryLater("CHARGE_PENDING");
  const charge = intent.latest_charge;
  if (charge.disputed) throw new AuctionError("DISPUTE_REVIEW", "Disputed payment cannot be refunded automatically.", 503);
  const bid = (await db().query("SELECT disputed FROM bids WHERE reservation_id=$1", [reservationId])).rows[0];
  if (bid?.disputed) throw new AuctionError("DISPUTE_REVIEW", "Dispute history needs reconciliation before refunding.", 503);
  let refund: Stripe.Refund | undefined;
  if (obligation.stripe_refund_id) refund = await stripe.refunds.retrieve(obligation.stripe_refund_id);
  else {
    // Recover a successful submission whose response/DB update was lost.
    const previous = await stripe.refunds.list({ charge: charge.id, limit: 100 });
    if (previous.has_more) throw new AuctionError("REFUND_REVIEW", "Refund history requires manual review.", 503);
    refund = previous.data.find((item) => item.metadata?.obligation_id === obligation.id);
    if (!refund && previous.data.some((item) => item.status !== "failed" && item.status !== "canceled")) throw new AuctionError("REFUND_REVIEW", "Existing manual or partial refund requires reconciliation.", 503);
  }
  if (!refund) {
    if (obligation.submitted_at && Date.now() - obligation.submitted_at.getTime() > 23 * 60 * 60_000) throw new AuctionError("REFUND_REVIEW", "Refund idempotency window has elapsed; reconcile before retrying.", 503);
    let amount = obligation.amount;
    if (amount === null) {
      let feeAmount = 0;
      let feeEvidence = null;
      if (obligation.reason === "outbid") {
        if (process.env.STRIPE_PRICING_MODEL !== "standard" || charge.currency !== "usd") throw new AuctionError("FEE_REVIEW", "Unconfigured pricing or currency.", 503);
        if (!charge.balance_transaction || typeof charge.balance_transaction === "string") {
          await db().query("UPDATE refund_obligations SET state='waiting_for_fee',updated_at=now() WHERE id=$1", [obligation.id]);
          throw new RetryLater("WAITING_FOR_FEE", 120);
        }
        feeEvidence = charge.balance_transaction;
        const calculated = refundAfterFees(charge.amount_captured, feeEvidence);
        feeAmount = calculated.feeUsdCents;
        amount = calculated.refundUsdCents;
      } else amount = charge.amount_captured;
      if (!amount || amount <= 0) throw new AuctionError("REFUND_REVIEW", "No captured payment to refund.", 503);
      await db().query("UPDATE refund_obligations SET amount=$2,fee_amount=$3,fee_evidence=$4,updated_at=now() WHERE id=$1", [obligation.id, amount, feeAmount, feeEvidence ? JSON.stringify(feeEvidence) : null]);
    }
    if (charge.amount_refunded !== 0) throw new AuctionError("REFUND_REVIEW", "Prior refund requires reconciliation.", 503);
    await db().query("UPDATE refund_obligations SET state='submitted',submitted_at=COALESCE(submitted_at,now()),updated_at=now() WHERE id=$1", [obligation.id]);
    refund = await stripe.refunds.create({ charge: charge.id, amount, metadata: { obligation_id: obligation.id, reservation_id: reservationId, reason: obligation.reason } }, { idempotencyKey: `refund:${obligation.id}` });
  }
  // Keep a durable ID even if a provider response requires operator review.
  await db().query("UPDATE refund_obligations SET stripe_refund_id=$2,updated_at=now() WHERE id=$1", [obligation.id, refund.id]);
  const storedAmount = obligation.amount ?? (await db().query("SELECT amount FROM refund_obligations WHERE id=$1", [obligation.id])).rows[0].amount;
  if (refund.amount !== storedAmount || (typeof refund.charge === "string" ? refund.charge : refund.charge?.id) !== charge.id) throw new AuctionError("REFUND_REVIEW", "Refund identity or amount mismatch.", 503);
  if (refund.status === "failed" || refund.status === "canceled") {
    // Banks can return a refund after Stripe initially reports success. Persist
    // the failure even when this check runs from an event job, not a refund job.
    await db().query("UPDATE refund_obligations SET state='review',error_code='REFUND_FAILED',updated_at=now() WHERE id=$1", [obligation.id]);
    throw new AuctionError("REFUND_FAILED", "Stripe refund failed; manual reconciliation required.", 503);
  }
  await db().query("UPDATE refund_obligations SET state=$2,error_code=NULL,updated_at=now() WHERE id=$1", [obligation.id, refund.status === "succeeded" ? "succeeded" : "pending"]);
  if (refund.status !== "succeeded") throw new RetryLater("REFUND_PENDING", 180);
}

async function processEvent(id: string): Promise<void> {
  const row = (await db().query("SELECT payload FROM stripe_events WHERE id=$1", [id])).rows[0];
  if (!row) return;
  const event = row.payload as Stripe.Event;
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object as Stripe.PaymentIntent;
    if (intent.metadata.campaign === "chicken-legs-2026" && intent.metadata.reservation_id) await reconcileReservation(intent.metadata.reservation_id, event);
  } else if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.campaign === "chicken-legs-2026" && session.metadata.reservation_id) {
      await db().query("UPDATE reservations SET session_id=$2 WHERE id=$1 AND session_id IS NULL", [session.metadata.reservation_id, session.id]);
      await reconcileReservation(session.metadata.reservation_id, event);
    }
  } else if (event.type.startsWith("charge.dispute.")) {
    const dispute = event.data.object as Stripe.Dispute;
    const intentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
    if (intentId) await transaction(async (client) => {
      await client.query("UPDATE bids SET disputed=true WHERE payment_intent_id=$1", [intentId]);
      await client.query("UPDATE auction_slots SET needs_review=true WHERE current_bid_id IN (SELECT id FROM bids WHERE payment_intent_id=$1)", [intentId]);
      await client.query("UPDATE refund_obligations SET state='review',error_code='DISPUTE_REVIEW',updated_at=now() WHERE payment_intent_id=$1 AND state<>'succeeded'", [intentId]);
      await client.query("INSERT INTO audit_log (action,entity_id,details) VALUES ('dispute_review',$1,$2)", [intentId, JSON.stringify({ eventId: id })]);
    });
  } else if (event.type.startsWith("refund.")) {
    const refund = event.data.object as Stripe.Refund;
    if (refund.metadata?.reservation_id) await reconcileRefund(refund.metadata.reservation_id, true);
  }
  // charge.updated is durably recorded; the existing waiting-for-fee job retries.
}

/** Run from an authenticated scheduler every minute. No client-triggered work. */
export async function runWorker(maxJobs = 10): Promise<{ processed: number; busy: boolean }> {
  const lease = await db().connect();
  let acquired = false;
  let processed = 0;
  const started = Date.now();
  try {
    acquired = (await lease.query("SELECT pg_try_advisory_lock(742019112) AS locked")).rows[0].locked;
    if (!acquired) return { processed: 0, busy: true };
    // One worker per campaign prevents concurrent refund/dispute processing.
    // Queue leases still survive a crashed process and reclaim interrupted jobs.
    while (processed < maxJobs && Date.now() - started < 40_000) {
      const job = (await db().query("UPDATE jobs SET state='running',locked_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=(SELECT id FROM jobs WHERE (state='queued' AND run_after<=now()) OR (state='running' AND locked_until<now()) ORDER BY CASE WHEN kind='event' THEN 0 ELSE 1 END,run_after LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *")).rows[0];
      if (!job) break;
      try {
        if (job.kind === "event") await processEvent(job.entity_id);
        else if (job.kind === "reservation") await reconcileReservation(job.entity_id);
        else await reconcileRefund(job.entity_id);
        await db().query("UPDATE jobs SET state='done',locked_until=NULL,error_code=NULL WHERE id=$1", [job.id]);
      } catch (error) {
        const review = error instanceof AuctionError || (!(error instanceof RetryLater) && job.attempts >= 12);
        const code = error instanceof AuctionError || error instanceof RetryLater ? error.code : "PROVIDER_OR_DATABASE_ERROR";
        const seconds = error instanceof RetryLater ? error.seconds : Math.min(300, 2 ** Math.min(job.attempts, 8));
        await db().query("UPDATE jobs SET state=$2,locked_until=NULL,error_code=$3,run_after=now()+($4 * interval '1 second') WHERE id=$1", [job.id, review ? "review" : "queued", code, seconds]);
        if (review && job.kind === "refund") await db().query("UPDATE refund_obligations SET state='review',error_code=$2,updated_at=now() WHERE reservation_id=$1 AND state<>'succeeded'", [job.entity_id, code]);
        if (review) await db().query("INSERT INTO audit_log (action,entity_id,details) VALUES ('job_review',$1,$2)", [job.entity_id, JSON.stringify({ kind: job.kind, code })]);
      }
      processed++;
    }
    return { processed, busy: false };
  } finally {
    if (acquired) await lease.query("SELECT pg_advisory_unlock(742019112)");
    lease.release();
  }
}
