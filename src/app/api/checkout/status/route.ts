import { db } from "@/lib/db";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try {
    const session = new URL(request.url).searchParams.get("session_id") || "";
    if (!process.env.DATABASE_URL || !/^cs_[a-zA-Z0-9_]{10,250}$/.test(session)) return Response.json({ status: "unknown" }, { headers: { "Cache-Control": "no-store" } });
    const row = (await db().query("SELECT r.state,f.state AS refund_state FROM reservations r LEFT JOIN refund_obligations f ON f.reservation_id=r.id WHERE r.session_id=$1", [session])).rows[0];
    const status = !row ? "unknown" : row.refund_state === "review" ? "refund_review"
      : row.refund_state === "succeeded" ? "refunded" : row.refund_state ? "refunding" : row.state;
    return Response.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
