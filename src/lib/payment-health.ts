export interface PaymentHealthCounts {
  reviewJobs: number;
  overdueJobs: number;
  stalledReservations: number;
  refundReviews: number;
  overdueRefunds: number;
  disputedSlots: number;
}

export function paymentHealth(counts: PaymentHealthCounts, lastRecoveryAt: string | null, now = Date.now()) {
  const issues: string[] = [];
  const lastRecovery = lastRecoveryAt ? Date.parse(lastRecoveryAt) : NaN;
  if (!Number.isFinite(lastRecovery) || now - lastRecovery > 10 * 60_000) issues.push("RECOVERY_WORKER_INACTIVE");
  if (counts.reviewJobs) issues.push("JOBS_NEED_REVIEW");
  if (counts.overdueJobs) issues.push("JOBS_OVERDUE");
  if (counts.stalledReservations) issues.push("RESERVATIONS_STALLED");
  if (counts.refundReviews) issues.push("REFUNDS_NEED_REVIEW");
  if (counts.overdueRefunds) issues.push("REFUNDS_PENDING_OVER_24H");
  if (counts.disputedSlots) issues.push("PLACEMENTS_NEED_REVIEW");
  return { healthy: issues.length === 0, issues, lastRecoveryAt, ...counts };
}
