import { z } from "zod";
import { createCheckout } from "@/lib/auctions";
import { AuctionError, checkoutSchema } from "@/lib/auction-domain";
import { appOrigin, requirePayments } from "@/lib/server-config";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try {
    requirePayments();
    if (request.headers.get("origin") !== appOrigin()) throw new AuctionError("INVALID_ORIGIN", "Start checkout from the sponsorship website.", 403);
    if (!request.headers.get("content-type")?.includes("application/json")) throw new AuctionError("INVALID_REQUEST", "A JSON request is required.");
    const key = z.string().uuid().safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new AuctionError("INVALID_REQUEST", "A unique checkout request ID is required.");
    if (Number(request.headers.get("content-length") || 0) > 8192) throw new AuctionError("REQUEST_TOO_LARGE", "Checkout details are too large.", 413);
    const text = await request.text();
    if (text.length > 8192) throw new AuctionError("REQUEST_TOO_LARGE", "Checkout details are too large.", 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new AuctionError("INVALID_REQUEST", "Invalid JSON request."); }
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) throw new AuctionError("INVALID_DETAILS", parsed.error.issues[0]?.message || "Check your sponsor details.");
    // Only trust the hosting platform's sanitized client IP header. Self-hosted
    // installs share a conservative limit until their trusted proxy is configured.
    const identity = process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
    return Response.json(await createCheckout(parsed.data, key.data, identity), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
