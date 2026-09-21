/** Shared, public campaign configuration. Amounts are integer USD cents. */
export const campaign = {
  title: "I'm selling my chicken legs.",
  currency: "usd",
  startingBidCents: 100_000,
  biddingClosesAt: "2026-11-01T22:59:00Z",
  raceDate: "2026-11-08",
  raceDistanceKm: 42.195,
  timezone: "Europe/Paris",
  eventName: "Nice–Cannes Marathon",
  termsVersion: "2026-09-21",
} as const;

export const slots = [
  { id: "left-quad", label: "Left quad", muscle: "quad", side: "left", view: "front" },
  { id: "right-quad", label: "Right quad", muscle: "quad", side: "right", view: "front" },
  { id: "left-hamstring", label: "Left hamstring", muscle: "hamstring", side: "left", view: "back" },
  { id: "right-hamstring", label: "Right hamstring", muscle: "hamstring", side: "right", view: "back" },
  { id: "left-calf", label: "Left calf", muscle: "calf", side: "left", view: "back" },
  { id: "right-calf", label: "Right calf", muscle: "calf", side: "right", view: "back" },
] as const;

export type SlotId = (typeof slots)[number]["id"];
export const slotIds = slots.map((slot) => slot.id) as [SlotId, ...SlotId[]];
export const formatUsd = (cents: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0,
}).format(cents / 100);

export const refundDisclosure = "If another sponsor outbids you, we'll automatically initiate a refund of your original USD payment, less Stripe's original itemized fees. Fees recorded in EUR are converted to USD using your original payment's exchange rate, rounded to the nearest cent. We absorb later exchange-rate changes and conversion costs that are not separately itemized. Refunds can take time to reach your bank.";

export interface PublicBid {
  id: string;
  sponsorName: string;
  website: string;
  amountCents: number;
  acceptedAt: string;
  status: "current" | "outbid";
}

export interface PublicSlot {
  id: SlotId;
  label: string;
  muscle: string;
  side: "left" | "right";
  view: "front" | "back";
  currentBidCents: number;
  nextBidCents: number | null;
  sponsor: { name: string; website: string; logoUrl: string | null } | null;
  history: PublicBid[];
  reserved: boolean;
}

export interface AuctionSnapshot {
  mode: "preview" | "sandbox" | "live";
  paymentsEnabled: boolean;
  closed: boolean;
  slots: PublicSlot[];
  currentTotalCents: number;
}
