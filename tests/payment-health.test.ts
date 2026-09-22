import { describe, expect, it } from "vitest";
import { paymentHealth, type PaymentHealthCounts } from "../src/lib/payment-health";

const counts: PaymentHealthCounts = { reviewJobs: 0, overdueJobs: 0, stalledReservations: 0, refundReviews: 0, overdueRefunds: 0, disputedSlots: 0 };
const now = Date.parse("2026-09-22T10:00:00Z");
describe("payment operations health", () => {
  it("accepts a recent successful scheduled recovery with no unresolved issues", () => {
    expect(paymentHealth(counts, "2026-09-22T09:59:00Z", now).healthy).toBe(true);
  });
  it.each([null, "invalid", "2026-09-22T09:49:59Z"])("detects a missing or stale worker heartbeat: %s", heartbeat => {
    expect(paymentHealth(counts, heartbeat, now).issues).toContain("RECOVERY_WORKER_INACTIVE");
  });
  it.each(Object.keys(counts) as Array<keyof PaymentHealthCounts>)("alerts on %s even when the scheduler is running", key => {
    expect(paymentHealth({ ...counts, [key]: 1 }, new Date(now).toISOString(), now).healthy).toBe(false);
  });
});
