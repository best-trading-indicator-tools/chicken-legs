import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import type Stripe from "stripe";
import { Pool, type PoolClient } from "pg";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ engine: undefined as unknown as PGlite, stripe: undefined as unknown as Stripe }));

vi.mock("../src/lib/db", async (original) => {
  const actual = await original<typeof import("../src/lib/db")>();
  if (process.env.TEST_DATABASE_URL) return actual;
  function adapter(target: PGlite | Transaction) {
    return {
      query: async (sql: string, params?: unknown[]) => {
        // Embedded PG has a single connection. Real advisory/row contention is
        // separately covered by the optional TEST_DATABASE_URL suite.
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ locked: true }], rowCount: 1 };
        if (sql.includes("pg_advisory_unlock") || sql.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 1 };
        const result = await target.query(sql, params);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
      },
      release: () => {},
    };
  }
  return {
    ...actual,
    db: () => ({ ...adapter(state.engine), connect: async () => adapter(state.engine) }) as unknown as Pool,
    transaction: <T>(work: (client: PoolClient) => Promise<T>) => state.engine.transaction((tx) => work(adapter(tx) as unknown as PoolClient)),
  };
});
vi.mock("../src/lib/server-config", async (original) => {
  const actual = await original<typeof import("../src/lib/server-config")>();
  return { ...actual, getStripe: () => state.stripe };
});

import { createCheckout, getAuctionSnapshot } from "../src/lib/auctions";
import { recordStripeEvent, runWorker } from "../src/lib/payment-worker";
import { campaign } from "../src/lib/campaign";
import type { CheckoutInput } from "../src/lib/auction-domain";

let sessions: Map<string, Stripe.Checkout.Session>;
let intents: Map<string, Stripe.PaymentIntent>;
let refunds: Map<string, Stripe.Refund>;
let idempotency: Map<string, string>;
let loseSessionResponse = false;
let loseRefundResponse = false;
const fake = <T>(value: unknown): T => value as T;
const testUrl = process.env.TEST_DATABASE_URL;
const testSchema = testUrl ? `service_test_${randomUUID().replaceAll("-", "")}` : "public";
let servicePool: Pool | undefined;
let directPool: Pool | undefined;
let serviceDatabaseUrl = "postgres://embedded-test-only";

function mockStripe() {
  sessions = new Map(); intents = new Map(); refunds = new Map(); idempotency = new Map();
  return fake<Stripe>({
    checkout: { sessions: {
      create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams, options: { idempotencyKey: string }) => {
        const existing = idempotency.get(options.idempotencyKey);
        if (existing) return sessions.get(existing);
        const id = `cs_test_${randomUUID().replaceAll("-", "")}`;
        const session = fake<Stripe.Checkout.Session>({ id, status: "open", payment_status: "unpaid", metadata: params.metadata, client_reference_id: params.client_reference_id, amount_total: params.line_items![0].price_data!.unit_amount, currency: "usd", payment_intent: null, url: `https://checkout.stripe.com/${id}` });
        sessions.set(id, session); idempotency.set(options.idempotencyKey, id);
        if (loseSessionResponse) { loseSessionResponse = false; throw new Error("simulated network response lost"); }
        return session;
      }),
      retrieve: vi.fn(async (id: string) => sessions.get(id)),
      expire: vi.fn(async (id: string) => { const session = sessions.get(id)!; session.status = "expired"; return session; }),
    } },
    paymentIntents: { retrieve: vi.fn(async (id: string) => intents.get(id)), cancel: vi.fn(async (id: string) => { const intent = intents.get(id)!; intent.status = "canceled"; return intent; }) },
    refunds: {
      create: vi.fn(async (params: Stripe.RefundCreateParams, options: { idempotencyKey: string }) => {
        const existing = idempotency.get(options.idempotencyKey);
        if (existing) return refunds.get(existing);
        const id = `re_${randomUUID()}`;
        const refund = fake<Stripe.Refund>({ id, amount: params.amount, charge: params.charge, status: "succeeded", metadata: params.metadata });
        refunds.set(id, refund); idempotency.set(options.idempotencyKey, id);
        for (const intent of intents.values()) if ((intent.latest_charge as Stripe.Charge).id === params.charge) (intent.latest_charge as Stripe.Charge).amount_refunded = params.amount!;
        if (loseRefundResponse) { loseRefundResponse = false; throw new Error("simulated network response lost"); }
        return refund;
      }),
      list: vi.fn(async ({ charge }: { charge: string }) => ({ data: [...refunds.values()].filter((refund) => refund.charge === charge), has_more: false })),
      retrieve: vi.fn(async (id: string) => refunds.get(id)),
    },
    events: { list: vi.fn(async () => ({ data: [], has_more: false })) },
  });
}

const input = (name: string, slotId: CheckoutInput["slotId"] = "left-quad"): CheckoutInput => ({ slotId, sponsorName: name, email: `${name.toLowerCase()}@example.com`, website: `https://${name.toLowerCase()}.example.com`, termsAccepted: true });

async function pump() {
  await state.engine.query("UPDATE jobs SET run_after=now()-interval '1 minute' WHERE state='queued'");
  await runWorker(20);
}

async function pay(session: Stripe.Checkout.Session, timestamp = Math.floor(Date.now() / 1000), override: Partial<Stripe.PaymentIntent> = {}) {
  const id = `pi_${randomUUID()}`;
  const amount = session.amount_total!;
  const settlement = Math.round(amount * 0.9);
  const fee = Math.round(amount * 0.0315);
  const intent = fake<Stripe.PaymentIntent>({
    id, status: "succeeded", amount_received: amount, currency: "usd", livemode: false, metadata: session.metadata,
    latest_charge: { id: `ch_${randomUUID()}`, disputed: false, currency: "usd", amount_captured: amount, amount_refunded: 0, balance_transaction: { id: `txn_${id}`, amount: settlement, currency: "eur", fee, net: settlement - fee, exchange_rate: 0.9, fee_details: [{ type: "stripe_fee", amount: fee, currency: "eur" }] } },
    ...override,
  });
  intents.set(id, intent); session.payment_intent = id; session.payment_status = "paid"; session.status = "complete";
  const event = fake<Stripe.Event>({ id: `evt_${randomUUID()}`, type: "payment_intent.succeeded", created: timestamp, livemode: false, data: { object: intent } });
  await recordStripeEvent(event);
  await pump();
  return event;
}

beforeAll(async () => {
  if (!testUrl) { state.engine = new PGlite(); await state.engine.waitReady; return; }
  const url = new URL(testUrl);
  url.searchParams.set("options", `-c search_path=${testSchema}`);
  serviceDatabaseUrl = url.toString();
  directPool = new Pool({ connectionString: serviceDatabaseUrl });
  await directPool.query(`CREATE SCHEMA ${testSchema}`);
  vi.stubEnv("DATABASE_URL", serviceDatabaseUrl);
  servicePool = (await import("../src/lib/db")).db();
  state.engine = fake<PGlite>({
    query: async (sql: string, params?: unknown[]) => {
      const result = await directPool!.query(sql, params);
      return { rows: result.rows, affectedRows: result.rowCount };
    },
    exec: (sql: string) => directPool!.query(sql),
    close: async () => {},
  });
}, 60_000);
afterAll(async () => {
  if (servicePool) await servicePool.end();
  if (directPool) { await directPool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`); await directPool.end(); }
  else await state.engine.close();
}, 30_000);
beforeEach(async () => {
  vi.stubEnv("DATABASE_URL", serviceDatabaseUrl);
  vi.stubEnv("APP_URL", "https://chicken.example.com");
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_no_network");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake_no_network");
  vi.stubEnv("WORKER_SECRET", "test-only-worker-secret-32-characters");
  vi.stubEnv("STRIPE_PRICING_MODEL", "standard");
  state.stripe = mockStripe(); loseSessionResponse = false; loseRefundResponse = false;
  await state.engine.exec(`DROP SCHEMA ${testSchema} CASCADE; CREATE SCHEMA ${testSchema};`);
  await state.engine.exec(await readFile(new URL("../database/001_auctions.sql", import.meta.url), "utf8"));
  await state.engine.exec(await readFile(new URL("../database/002_front_ankles.sql", import.meta.url), "utf8"));
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe(`durable auction integration (${testUrl ? "multi-connection PostgreSQL" : "embedded PostgreSQL"}, mocked Stripe)`, () => {
  it("upgrades the six-slot database idempotently without changing sponsors, reservations or refunds", async () => {
    await state.engine.exec(`DROP SCHEMA ${testSchema} CASCADE; CREATE SCHEMA ${testSchema};`);
    await state.engine.exec(await readFile(new URL("../database/001_auctions.sql", import.meta.url), "utf8"));
    for (const name of ["Original", "Winner"]) {
      await createCheckout(input(name), randomUUID(), name);
      await pay([...sessions.values()].at(-1)!);
    }
    await createCheckout(input("Pending", "right-calf"), randomUUID(), "pending");
    await state.engine.query("UPDATE campaign_state SET paused=true");
    const legacySlots = (await state.engine.query("SELECT * FROM auction_slots ORDER BY id")).rows;
    expect(legacySlots).toHaveLength(6);
    const tables = ["campaign_state", "reservations", "bids", "refund_obligations", "stripe_events", "jobs", "audit_log"];
    const before = await Promise.all(tables.map(async (table) => (await state.engine.query(`SELECT * FROM ${table} ORDER BY id`)).rows));

    await state.engine.exec(await readFile(new URL("../database/002_front_ankles.sql", import.meta.url), "utf8"));
    // The normal runner always starts with 001, including on an upgraded DB.
    for (const filename of ["001_auctions.sql", "002_front_ankles.sql"]) {
      await state.engine.exec(await readFile(new URL(`../database/${filename}`, import.meta.url), "utf8"));
    }

    for (const [index, table] of tables.entries()) {
      expect((await state.engine.query(`SELECT * FROM ${table} ORDER BY id`)).rows).toEqual(before[index]);
    }
    expect((await state.engine.query("SELECT * FROM auction_slots WHERE id NOT IN ('left-ankle','right-ankle') ORDER BY id")).rows).toEqual(legacySlots);
    const snapshot = await getAuctionSnapshot();
    expect(snapshot.slots).toHaveLength(8);
    expect(snapshot.slots.filter((slot) => slot.muscle === "ankle")).toEqual([
      expect.objectContaining({ id: "left-ankle", currentBidCents: 0, nextBidCents: 100_000, sponsor: null, history: [], reserved: false }),
      expect.objectContaining({ id: "right-ankle", currentBidCents: 0, nextBidCents: 100_000, sponsor: null, history: [], reserved: false }),
    ]);
    expect(snapshot.currentTotalCents).toBe(200_000);
    expect(snapshot.paymentsEnabled).toBe(false);
    await expect(state.engine.query("INSERT INTO auction_slots (id) VALUES ('left-arm')")).rejects.toThrow();
  });

  it("accepts independent front ankle bids and refunds only the displaced ankle sponsor", async () => {
    for (const [name, slotId] of [["Left", "left-ankle"], ["Right", "right-ankle"], ["Takeover", "left-ankle"]] as const) {
      await createCheckout(input(name, slotId), randomUUID(), name);
      const session = [...sessions.values()].at(-1)!;
      expect(session.metadata?.slot_id).toBe(slotId);
      expect(session.amount_total).toBe(name === "Takeover" ? 200_000 : 100_000);
      await pay(session);
    }
    const snapshot = await getAuctionSnapshot();
    const left = snapshot.slots.find((slot) => slot.id === "left-ankle")!;
    const right = snapshot.slots.find((slot) => slot.id === "right-ankle")!;
    expect(left.sponsor?.name).toBe("Takeover");
    expect(left.currentBidCents).toBe(200_000);
    expect(left.nextBidCents).toBe(400_000);
    expect(left.history).toHaveLength(2);
    expect(left.history.find((bid) => bid.sponsorName === "Left")?.status).toBe("outbid");
    expect(left.history.find((bid) => bid.sponsorName === "Takeover")?.status).toBe("current");
    expect(right.sponsor?.name).toBe("Right");
    expect(right.currentBidCents).toBe(100_000);
    expect(right.nextBidCents).toBe(200_000);
    expect(right.history).toHaveLength(1);
    expect([...refunds.values()].map((refund) => refund.amount)).toEqual([96_500]);
    expect((await state.engine.query("SELECT r.slot_id, o.reason, o.state FROM refund_obligations o JOIN reservations r ON r.id=o.reservation_id")).rows).toEqual([{ slot_id: "left-ankle", reason: "outbid", state: "succeeded" }]);
    expect(snapshot.currentTotalCents).toBe(300_000);
    for (const slot of snapshot.slots.filter((slot) => slot.muscle !== "ankle")) {
      expect(slot.currentBidCents).toBe(0);
      expect(slot.nextBidCents).toBe(100_000);
      expect(slot.history).toEqual([]);
    }
  });

  it("accepts $1K → $2K → $4K with exactly one original-fee refund per takeover", async () => {
    for (const name of ["One", "Two", "Three"]) {
      await createCheckout(input(name), randomUUID(), name);
      await pay([...sessions.values()].at(-1)!);
    }
    const snapshot = await getAuctionSnapshot();
    const slot = snapshot.slots.find((slot) => slot.id === "left-quad")!;
    expect(slot.currentBidCents).toBe(400_000);
    expect(slot.nextBidCents).toBe(800_000);
    expect(slot.sponsor?.name).toBe("Three");
    expect(slot.history.map((bid) => bid.amountCents).sort()).toEqual([100_000, 200_000, 400_000]);
    expect(slot.history.filter((bid) => bid.status === "current")).toHaveLength(1);
    expect([...refunds.values()].map((refund) => refund.amount).sort((a, b) => a - b)).toEqual([96_500, 193_000]);
    expect(snapshot.currentTotalCents).toBe(400_000);
    expect(snapshot.slots.find((slot) => slot.id === "right-quad")!.nextBidCents).toBe(100_000);
    expect(JSON.stringify(snapshot)).not.toContain("@example.com");
    expect(JSON.stringify(snapshot)).not.toContain("pi_");
  });

  it("serializes competing reservations and keeps different placements independent", async () => {
    const results = await Promise.allSettled([createCheckout(input("One"), randomUUID(), "one"), createCheckout(input("Two"), randomUUID(), "two")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await createCheckout(input("Three", "right-calf"), randomUUID(), "three");
    expect(sessions.size).toBe(2);
  });

  it("recovers Session creation after a lost response without creating a second Session", async () => {
    const key = randomUUID();
    loseSessionResponse = true;
    await expect(createCheckout(input("One"), key, "one")).rejects.toThrow("simulated");
    await pump();
    const retried = await createCheckout(input("One"), key, "one");
    expect(sessions.size).toBe(1);
    expect(retried.url).toBe([...sessions.values()][0].url);
  });

  it("duplicate and replayed payment events do not create extra bids or refunds", async () => {
    await createCheckout(input("One"), randomUUID(), "one");
    const event = await pay([...sessions.values()][0]);
    await recordStripeEvent(event);
    await recordStripeEvent({ ...event, id: `evt_${randomUUID()}` });
    await pump();
    expect((await state.engine.query("SELECT * FROM bids")).rows).toHaveLength(1);
    expect((await state.engine.query("SELECT * FROM refund_obligations")).rows).toHaveLength(0);
  });

  it("reconciles a lost refund response instead of refunding twice", async () => {
    await createCheckout(input("One"), randomUUID(), "one"); await pay([...sessions.values()][0]);
    await createCheckout(input("Two"), randomUUID(), "two");
    loseRefundResponse = true;
    await pay([...sessions.values()][1]);
    expect(refunds.size).toBe(1);
    await pump();
    expect(refunds.size).toBe(1);
    expect((await state.engine.query<{ state: string }>("SELECT state FROM refund_obligations")).rows[0].state).toBe("succeeded");
    expect(state.stripe.refunds.create).toHaveBeenCalledTimes(1);
  });

  it("fully refunds a payment at the exact cutoff without awarding the spot", async () => {
    await createCheckout(input("Late"), randomUUID(), "late");
    await pay([...sessions.values()][0], Date.parse(campaign.biddingClosesAt) / 1000);
    expect((await state.engine.query("SELECT * FROM bids")).rows).toHaveLength(0);
    expect([...refunds.values()][0].amount).toBe(100_000);
    expect((await getAuctionSnapshot()).slots[0].sponsor).toBeNull();
  });

  it("does not release a timed-out reservation until Stripe confirms expiry", async () => {
    await createCheckout(input("One"), randomUUID(), "one");
    await state.engine.query("UPDATE reservations SET release_after=now()-interval '1 minute'");
    vi.mocked(state.stripe.checkout.sessions.expire).mockRejectedValueOnce(new Error("network unavailable"));
    await pump();
    expect((await getAuctionSnapshot()).slots[0].reserved).toBe(true);
    await pump();
    expect((await getAuctionSnapshot()).slots[0].reserved).toBe(false);
    expect([...sessions.values()][0].status).toBe("expired");
  });

  it("waits for original fee data without guessing or issuing a refund", async () => {
    await createCheckout(input("One"), randomUUID(), "one"); await pay([...sessions.values()][0]);
    const charge = [...intents.values()][0].latest_charge as Stripe.Charge;
    charge.balance_transaction = null;
    await createCheckout(input("Two"), randomUUID(), "two"); await pay([...sessions.values()][1]);
    expect(refunds.size).toBe(0);
    expect((await state.engine.query<{ state: string }>("SELECT state FROM refund_obligations")).rows[0].state).toBe("waiting_for_fee");
    expect((await getAuctionSnapshot()).slots[0].sponsor?.name).toBe("Two");
  });
});
