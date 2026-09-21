import { AuctionError } from "@/lib/auction-domain";
import { getStripe } from "@/lib/server-config";
import { recordStripeEvent } from "@/lib/payment-worker";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !process.env.DATABASE_URL) throw new AuctionError("NOT_CONFIGURED", "Webhooks are not configured.", 503);
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new AuctionError("INVALID_SIGNATURE", "Stripe signature required.");
    if (Number(request.headers.get("content-length") || 0) > 1_048_576) throw new AuctionError("REQUEST_TOO_LARGE", "Event exceeds maximum size.", 413);
    const raw = await request.text();
    if (raw.length > 1_048_576) throw new AuctionError("REQUEST_TOO_LARGE", "Event exceeds maximum size.", 413);
    let event;
    try { event = getStripe().webhooks.constructEvent(raw, signature, secret); }
    catch { throw new AuctionError("INVALID_SIGNATURE", "Invalid Stripe signature."); }
    // Acknowledge only once the event and durable work have committed.
    await recordStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) { return errorResponse(error); }
}
