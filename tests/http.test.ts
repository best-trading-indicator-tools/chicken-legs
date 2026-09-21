import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("../src/lib/payment-worker", () => ({ recordStripeEvent: vi.fn(), runWorker: vi.fn() }));

import { GET as auctions } from "../src/app/api/auctions/route";
import { POST as checkout } from "../src/app/api/checkout/route";
import { GET as status } from "../src/app/api/checkout/status/route";
import { POST as webhook } from "../src/app/api/stripe/webhook/route";
import { GET as operations } from "../src/app/api/internal/status/route";
import { after } from "next/server";
import { recordStripeEvent, runWorker } from "../src/lib/payment-worker";

beforeEach(() => {
  // These are fake test values, never financial API requests. Explicitly clear
  // inherited environment settings so unit tests cannot use real credentials.
  for (const name of ["DATABASE_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "CHECKOUT_ENABLED", "WORKER_SECRET", "LIVE_PAYMENTS_CONFIRMED"]) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("preview API and payment boundaries", () => {
  it("returns eight empty placements with no fictional sponsors or revenue", async () => {
    const response = await auctions();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.mode).toBe("preview");
    expect(body.paymentsEnabled).toBe(false);
    expect(body.currentTotalCents).toBe(0);
    expect(body.slots).toHaveLength(8);
    for (const slot of body.slots) {
      expect(slot.sponsor).toBeNull();
      expect(slot.history).toEqual([]);
      expect(slot.nextBidCents).toBe(100_000);
    }
  });
  it("refuses checkout when payment configuration is incomplete", async () => {
    const response = await checkout(new Request("http://localhost/api/checkout", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("PAYMENTS_DISABLED");
  });
  it("a return URL cannot manufacture a verified payment", async () => {
    const response = await status(new Request("http://localhost/api/checkout/status?session_id=cs_test_fake123456789"));
    expect(await response.json()).toEqual({ status: "unknown" });
  });
  it("denies unauthenticated operations before accessing the database", async () => {
    vi.stubEnv("WORKER_SECRET", "x".repeat(32));
    const response = await operations(new Request("http://localhost/api/internal/status"));
    expect(response.status).toBe(401);
  });
});

describe("Stripe webhook trust boundary", () => {
  const secret = "whsec_fake_unit_test_only";
  const event = { id: "evt_unit", object: "event", type: "payment_intent.succeeded", livemode: false, created: 1_790_000_000, data: { object: { id: "pi_unit", object: "payment_intent" } } };
  function configure() {
    vi.stubEnv("DATABASE_URL", "postgres://not-used-in-unit-tests");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake_unit_test_only");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  }
  it("rejects absent and forged signatures without queueing any work", async () => {
    configure();
    for (const signature of ["", "t=1,v1=forged"]) {
      const response = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: JSON.stringify(event) }));
      expect(response.status).toBe(400);
    }
    expect(recordStripeEvent).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });
  it("queues a correctly signed raw body before acknowledging", async () => {
    configure();
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));
    expect(response.status).toBe(200);
    expect(recordStripeEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_unit" }));
    expect(after).toHaveBeenCalledOnce();
    expect(runWorker).not.toHaveBeenCalled();
    const work = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await work();
    expect(runWorker).toHaveBeenCalledOnce();
  });
  it("does not acknowledge an event when durable storage fails", async () => {
    configure();
    vi.mocked(recordStripeEvent).mockRejectedValueOnce(new Error("private database error"));
    const payload = JSON.stringify(event);
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database error");
    expect(after).not.toHaveBeenCalled();
  });
  it("preserves the acknowledgement when post-response work fails", async () => {
    configure();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.mocked(runWorker).mockRejectedValueOnce(new Error("private provider credentials"));
      const payload = JSON.stringify(event);
      const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
      const response = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));
      const work = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
      await expect(work()).resolves.toBeUndefined();
      expect(response.status).toBe(200);
      expect(log).toHaveBeenCalledWith("Payment worker interrupted; durable jobs await the next scheduled run.");
    } finally { log.mockRestore(); }
  });
});
