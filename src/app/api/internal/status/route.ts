import { db } from "@/lib/db";
import { errorResponse, requireWorkerAuth } from "@/lib/http";

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
    ]);
    return Response.json({ campaign: results[0].rows[0], slots: results[1].rows, jobs: results[2].rows, refunds: results[3].rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
