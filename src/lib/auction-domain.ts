import Decimal from "decimal.js";
import { z } from "zod";
import { campaign, slotIds } from "./campaign";

// Conservative application ceiling; account/provider limits may be lower.
export const MAX_PAYMENT_CENTS = 99_999_999;
export const RESERVATION_MS = 10 * 60 * 1000;
export const closesAt = new Date(campaign.biddingClosesAt);

export class AuctionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export function nextBidCents(current: number): number {
  if (!Number.isSafeInteger(current) || current < 0) throw new AuctionError("INVALID_AMOUNT", "Invalid stored amount.");
  const next = current === 0 ? campaign.startingBidCents : current * 2;
  if (!Number.isSafeInteger(next) || next > MAX_PAYMENT_CENTS) throw new AuctionError("BID_LIMIT", "This placement has reached its online payment limit.", 409);
  return next;
}

export function isClosed(now: Date = new Date()): boolean { return now.getTime() >= closesAt.getTime(); }

export function assertOpen(now: Date = new Date()): void {
  if (isClosed(now)) throw new AuctionError("AUCTION_CLOSED", "Bidding closed on 1 November 2026 at 23:59 Paris time.", 409);
}

export function safePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      host.includes(".") && !host.endsWith(".local") && !host.endsWith(".localhost") &&
      !host.endsWith(".internal") && !/^\d+(\.\d+){3}$/.test(host) && !host.includes(":") && host !== "localhost";
  } catch { return false; }
}

export const checkoutSchema = z.object({
  slotId: z.enum(slotIds),
  sponsorName: z.string().trim().min(2).max(80).refine((v) => !/[\x00-\x1f<>]/.test(v), "Use plain text for your sponsor name."),
  email: z.string().trim().email().max(254).transform((s) => s.toLowerCase()),
  website: z.string().trim().max(2048).refine(safePublicUrl, "Enter a public HTTPS website URL."),
  logoUrl: z.union([z.literal(""), z.string().trim().max(2048).refine(safePublicUrl, "Enter a public HTTPS logo URL.")]).optional(),
  termsAccepted: z.literal(true),
}).strict();

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface PaymentEvidence {
  status: string;
  sessionPaid: boolean;
  amountReceived: number;
  currency: string;
  successEventCreated: number;
  expectedAmount: number;
  expectedVersion: number;
  slotVersion: number;
  reservationOwnsSlot: boolean;
  metadataMatches: boolean;
}

export function paymentDecision(evidence: PaymentEvidence): "accept" | "refund" {
  if (!Number.isInteger(evidence.successEventCreated) || evidence.successEventCreated <= 0) {
    throw new AuctionError("MISSING_PAYMENT_EVIDENCE", "Verified payment-success timestamp is required.", 503);
  }
  if (evidence.status !== "succeeded" || !evidence.sessionPaid) throw new AuctionError("PAYMENT_PENDING", "Payment has not settled.", 503);
  if (evidence.currency !== "usd" || evidence.amountReceived !== evidence.expectedAmount ||
      !evidence.metadataMatches || evidence.successEventCreated * 1000 >= closesAt.getTime() ||
      evidence.expectedVersion !== evidence.slotVersion || !evidence.reservationOwnsSlot) return "refund";
  return "accept";
}

export interface FeeEvidence {
  id: string;
  amount: number;
  currency: string;
  fee: number;
  net: number;
  exchange_rate: number | string | null;
  fee_details: Array<{ amount: number; currency: string; type: string }>;
}

/** Disclosed policy: original itemized stripe_fee only; no guessed FX surcharge. */
export function refundAfterFees(capturedUsdCents: number, evidence: FeeEvidence): { feeUsdCents: number; refundUsdCents: number } {
  const review = (message: string): never => { throw new AuctionError("FEE_REVIEW", message, 503); };
  if (!Number.isSafeInteger(capturedUsdCents) || capturedUsdCents <= 0) review("Invalid captured amount.");
  if (!["usd", "eur"].includes(evidence.currency)) review("Unconfigured settlement currency.");
  if (!Number.isSafeInteger(evidence.amount) || evidence.amount <= 0 || !Number.isSafeInteger(evidence.fee) || evidence.fee < 0 || evidence.net !== evidence.amount - evidence.fee) review("Inconsistent balance transaction.");
  let sum = 0;
  let eligible = 0;
  for (const fee of evidence.fee_details) {
    if (!Number.isSafeInteger(fee.amount) || fee.amount < 0 || fee.currency !== evidence.currency) review("Inconsistent fee currencies or amounts.");
    if (!["stripe_fee", "tax", "application_fee", "payment_method_passthrough_fee"].includes(fee.type)) review("Unknown fee structure requires review.");
    sum += fee.amount;
    if (fee.type === "stripe_fee") eligible += fee.amount;
  }
  if (sum !== evidence.fee) review("Itemized fees do not match the recorded fee.");
  let rate = new Decimal(1);
  if (evidence.currency === "eur") {
    if (evidence.exchange_rate === null) review("Original USD/EUR exchange rate is not available yet.");
    try { rate = new Decimal(evidence.exchange_rate!); } catch { review("Invalid original exchange rate."); }
    if (!rate.isFinite() || !rate.isPositive()) review("Invalid original exchange rate.");
  } else if (evidence.exchange_rate !== null && !new Decimal(evidence.exchange_rate).equals(1)) review("Unexpected same-currency exchange rate.");
  const expectedSettlement = new Decimal(capturedUsdCents).mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (Math.abs(expectedSettlement - evidence.amount) > 1) review("Original exchange rate does not reconcile to captured amount.");
  const feeUsdCents = new Decimal(eligible).div(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
  if (!Number.isSafeInteger(feeUsdCents) || feeUsdCents >= capturedUsdCents) review("Fee consumes the entire payment.");
  return { feeUsdCents, refundUsdCents: capturedUsdCents - feeUsdCents };
}
