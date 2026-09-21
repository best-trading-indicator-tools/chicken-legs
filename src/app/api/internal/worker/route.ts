import { runWorker } from "@/lib/payment-worker";
import { errorResponse, requireWorkerAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request): Promise<Response> {
  try { requireWorkerAuth(request); return Response.json(await runWorker(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
// Supports a scheduler that sends authenticated GET requests (such as Vercel).
export const GET = POST;
