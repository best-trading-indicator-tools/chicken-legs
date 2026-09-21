import { describe, expect, it } from "vitest";
import { campaign, slots } from "../src/lib/campaign";
import { assertOpen, checkoutSchema, isClosed, nextBidCents, paymentDecision, refundAfterFees, safePublicUrl, type FeeEvidence, type PaymentEvidence } from "../src/lib/auction-domain";

describe("campaign and pricing", () => {
  it("has six independent permanent anatomical slots", () => {
    expect(new Set(slots.map((s) => s.id)).size).toBe(6);
    expect(slots.filter((s) => s.side === "left")).toHaveLength(3);
    expect(slots.filter((s) => s.side === "right")).toHaveLength(3);
  });
  it("starts at $1,000 and exactly doubles each accepted bid", () => {
    expect([0, 100_000, 200_000, 400_000].map(nextBidCents)).toEqual([100_000, 200_000, 400_000, 800_000]);
  });
  it.each([-1, 0.01, NaN, Infinity, Number.MAX_SAFE_INTEGER])("rejects invalid or overflowing money: %s", (amount) => expect(() => nextBidCents(amount)).toThrow());
  it("stops before the processor payment ceiling", () => expect(() => nextBidCents(51_200_000)).toThrow());
  it("closes exactly at the Paris cutoff", () => {
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(campaign.biddingClosesAt))).toBe("23:59");
    expect(isClosed(new Date("2026-11-01T22:58:59.999Z"))).toBe(false);
    expect(() => assertOpen(new Date("2026-11-01T22:59:00Z"))).toThrow();
    expect(isClosed(new Date("2026-11-01T23:00:00Z"))).toBe(true);
  });
});

describe("payment evidence", () => {
  const paid: PaymentEvidence = { status: "succeeded", sessionPaid: true, amountReceived: 200_000, currency: "usd", successEventCreated: Date.parse("2026-11-01T22:58:59Z") / 1000, expectedAmount: 200_000, expectedVersion: 1, slotVersion: 1, reservationOwnsSlot: true, metadataMatches: true };
  it("accepts verified pre-cutoff payment even when processed after cutoff", () => expect(paymentDecision(paid)).toBe("accept"));
  it.each([
    { currency: "eur" }, { amountReceived: 1 }, { slotVersion: 2 },
    { reservationOwnsSlot: false }, { metadataMatches: false },
    { successEventCreated: Date.parse(campaign.biddingClosesAt) / 1000 },
  ])("requires full refund for invalid or late paid evidence: %j", (change) => expect(paymentDecision({ ...paid, ...change })).toBe("refund"));
  it("does not mistake pending settlement for a refundable paid bid", () => expect(() => paymentDecision({ ...paid, status: "processing" })).toThrow());
  it("waits when success-event time is missing", () => expect(() => paymentDecision({ ...paid, successEventCreated: 0 })).toThrow());
});

describe("original Stripe fee and FX policy", () => {
  const eur: FeeEvidence = { id: "txn_test", amount: 90_000, currency: "eur", fee: 3_150, net: 86_850, exchange_rate: "0.9", fee_details: [{ amount: 2_700, currency: "eur", type: "stripe_fee" }, { amount: 450, currency: "eur", type: "tax" }] };
  it("converts only eligible EUR fees into USD using the original rate", () => expect(refundAfterFees(100_000, eur)).toEqual({ feeUsdCents: 3_000, refundUsdCents: 97_000 }));
  it("uses half-up rounding at a half cent", () => {
    const evidence = { ...eur, amount: 80_000, fee: 2, net: 79_998, exchange_rate: "0.8", fee_details: [{ amount: 2, currency: "eur", type: "stripe_fee" }] };
    expect(refundAfterFees(100_000, evidence)).toEqual({ feeUsdCents: 3, refundUsdCents: 99_997 });
  });
  it("handles same-currency settlement without an FX fee", () => {
    expect(refundAfterFees(100_000, { ...eur, amount: 100_000, net: 96_850, currency: "usd", exchange_rate: null, fee_details: [{ amount: 3_150, currency: "usd", type: "stripe_fee" }] })).toEqual({ feeUsdCents: 3_150, refundUsdCents: 96_850 });
  });
  it.each([
    { exchange_rate: null }, { exchange_rate: 0 }, { exchange_rate: "NaN" },
    { currency: "gbp" }, { net: 1 }, { amount: 91_000, net: 87_850 },
    { fee_details: [] }, { fee_details: [{ amount: 3_150, currency: "usd", type: "stripe_fee" }] },
    { fee_details: [{ amount: 3_150, currency: "eur", type: "unknown_fee" }] },
  ])("fails closed for missing/inconsistent evidence: %j", (change) => expect(() => refundAfterFees(100_000, { ...eur, ...change })).toThrow());
});

describe("checkout validation", () => {
  const input = { slotId: "left-quad", sponsorName: "Example", email: "sponsor@example.com", website: "https://example.com", termsAccepted: true };
  it("accepts the disclosed fixed-currency request", () => expect(checkoutSchema.parse(input).slotId).toBe("left-quad"));
  it.each([{ amount: 1 }, { currency: "eur" }, { termsAccepted: false }, { slotId: "left-arm" }, { sponsorName: "<script>" }])("rejects client-side tampering: %j", (change) => expect(checkoutSchema.safeParse({ ...input, ...change }).success).toBe(false));
  it.each(["javascript:alert(1)", "http://example.com", "https://localhost", "https://127.0.0.1", "https://10.0.0.1", "https://foo.local", "https://user:password@example.com", "https://example.com:8443"]) ("rejects unsafe public URL %s", (url) => expect(safePublicUrl(url)).toBe(false));
});
