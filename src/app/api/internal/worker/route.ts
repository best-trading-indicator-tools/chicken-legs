import { runWorker } from "@/lib/payment-worker";
import { errorResponse, requireWorkerAuth } from "@/lib/http";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  try {
    requireWorkerAuth(request);
    const result = await runWorker();
    if (!result.busy) await db().query("INSERT INTO audit_log (action,details) VALUES ('scheduled_recovery_completed',$1)", [JSON.stringify(result)]);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  catch (error) { return errorResponse(error); }
}
// Supports a scheduler that sends authenticated GET requests (such as Vercel).
export const GET = POST;
