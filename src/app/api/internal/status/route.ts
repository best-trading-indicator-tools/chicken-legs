import { db } from "@/lib/db";
import { errorResponse, requireWorkerAuth } from "@/lib/http";
import { paymentHealth, type PaymentHealthCounts } from "@/lib/payment-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try {
    requireWorkerAuth(request);
    const results = await Promise.all([
      db().query("SELECT * FROM campaign_state"),
      db().query("SELECT id,current_amount,version,needs_review,reservation_id FROM auction_slots ORDER BY id"),
      db().query("SELECT id,kind,state,attempts,error_code,run_after FROM jobs WHERE state<>'done' ORDER BY run_after LIMIT 100"),
      db().query("SELECT id,reason,state,amount,fee_amount,error_code,updated_at FROM refund_obligations ORDER BY created_at DESC LIMIT 100"),
      db().query<PaymentHealthCounts & { lastRecoveryAt: Date | null }>(`SELECT
        (SELECT max(created_at) FROM audit_log WHERE action='scheduled_recovery_completed') AS "lastRecoveryAt",
        (SELECT count(*)::int FROM jobs WHERE state='review') AS "reviewJobs",
        (SELECT count(*)::int FROM jobs WHERE (state='queued' AND run_after<now()-interval '15 minutes') OR (state='running' AND locked_until<now()-interval '10 minutes')) AS "overdueJobs",
        (SELECT count(*)::int FROM reservations WHERE state='pending' AND release_after<now()-interval '15 minutes') AS "stalledReservations",
        (SELECT count(*)::int FROM refund_obligations WHERE state='review') AS "refundReviews",
        (SELECT count(*)::int FROM refund_obligations WHERE state NOT IN ('succeeded','review') AND created_at<now()-interval '24 hours') AS "overdueRefunds",
        (SELECT count(*)::int FROM auction_slots WHERE needs_review) AS "disputedSlots"`),
    ]);
    const { lastRecoveryAt, ...counts } = results[4].rows[0];
    return Response.json({ campaign: results[0].rows[0], slots: results[1].rows, jobs: results[2].rows, refunds: results[3].rows,
      health: paymentHealth(counts, lastRecoveryAt?.toISOString() ?? null) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
