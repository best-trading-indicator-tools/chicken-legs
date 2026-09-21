import "server-only";
import Stripe from "stripe";
import { AuctionError } from "./auction-domain";

export function appOrigin(): string {
  const value = process.env.APP_URL;
  if (!value) throw new AuctionError("NOT_CONFIGURED", "Canonical application URL is not configured.", 503);
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new AuctionError("NOT_CONFIGURED", "Application URL must use HTTPS.", 503);
  }
  return url.origin;
}

export function paymentMode(): "preview" | "sandbox" | "live" {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.DATABASE_URL) return "preview";
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY) ? "live" : "sandbox";
}

export function paymentsConfigured(): boolean {
  try {
    appOrigin();
    return process.env.CHECKOUT_ENABLED === "true" && Boolean(process.env.DATABASE_URL) &&
      /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || "") &&
      Boolean(process.env.STRIPE_WEBHOOK_SECRET) && (process.env.WORKER_SECRET?.length || 0) >= 32 &&
      process.env.STRIPE_PRICING_MODEL === "standard" &&
      (paymentMode() !== "live" || process.env.LIVE_PAYMENTS_CONFIRMED === "true");
  } catch { return false; }
}

export function requirePayments(): void {
  if (!paymentsConfigured()) throw new AuctionError("PAYMENTS_DISABLED", "Sponsorship checkout is not open yet. No payment has been taken.", 503);
}

let stripe: Stripe | undefined;
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new AuctionError("NOT_CONFIGURED", "Payments are not configured.", 503);
  // stripe-node pins the API version shipped with the locked SDK. Set the webhook
  // endpoint to that same version; do not silently opt into future versions.
  return stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 15_000 });
}
