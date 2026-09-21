# Chicken Legs

An interactive photo sponsorship site for the full Nice–Cannes marathon on **8 November 2026**.
Eight independent leg placements start at **$1,000 USD**. Each takeover doubles
the price. Bidding closes **1 November 2026, 23:59 Europe/Paris**.

## Run locally

```sh
npm ci
cp .env.example .env.local # only if a local environment file does not already exist
npm run dev
```

Open [localhost:3000](http://localhost:3000). With no database/payment setup,
the site runs an honest preview: eight empty spots, no fabricated sponsors and
disabled checkout. Source photos belong in ignored `assets/private/`.

The viewer uses `vuedefaceV2.png` and `vuededosV2.png` from ignored
`assets/private/V2/`. These replace the earlier front/back photos.
Click a leg marker or choose from the sponsorship list. Front/Back buttons and
focused **← / →** keys switch views. Images keep their original composition;
only resized, metadata-free WebP copies are public.

**View the Sponsors** opens a list of current sponsors with their zones, linked
brand names/logos and accepted bid amounts. Previous sponsors stay in the ledger.

## Project files

- `src/components/campaign-page.tsx` — campaign, sponsorship panel, rules, history and checkout form.
- `src/components/sponsor-dialog.tsx` — current sponsors, zones and accepted bid amounts.
- `src/components/photo-viewer.tsx` — front/back photographs and eight responsive placement markers.
- `public/images/runner-{front,back}.webp` — optimized copies of the two selected photos.
- `src/lib/campaign.ts` — public campaign dates, currency and permanent slot IDs.
- `src/lib/auctions.ts` — transactional reservation and server-priced Checkout.
- `src/lib/payment-worker.ts` — verified acceptance, takeovers, refund obligations and reconciliation.
- `database/001_auctions.sql` — original PostgreSQL schema and seed slots.
- `database/002_front_ankles.sql` — additive front ankle migration; preserves existing bids.
- `scripts/blender/build_legs.py` — reproducible Blender asset authoring.
- `assets/model/chicken-legs.blend` — editable Blender source.
- `public/models/chicken-legs.glb` — web model; metadata in `placements.json`.
- `public/images/legs-{front,back,preview}.png` — Blender renders and browser fallbacks.

The earlier Blender scripts, source model and exports remain archived. They are
not loaded by the campaign page. The photo viewer preserves the supplied likeness.

## Database

The backend uses PostgreSQL through the `pg` driver. It stores accepted bids,
current sponsors, checkout reservations, refund obligations, webhook events and
worker jobs. Transactions and row locks coordinate competing bids.

Set `DATABASE_URL` and apply the migrations before connecting a real campaign.
Without it, `/api/auctions` returns an empty preview and checkout stays disabled.
There is no SQLite file or browser-only bid database.

## Payments

The browser cannot set prices or declare a winner. The backend confirms the
successful Stripe payment, atomically changes the sponsor and creates the
previous sponsor's refund obligation. Worker retries use permanent idempotency
keys and retain an audit trail. A reservation is released only after Stripe's
Session/payment state has been reconciled.

Customers pay USD; the French account settles EUR. Normal takeover refunds
deduct only the original separately itemized Stripe fees, converted at the
original payment's rate. Later FX differences remain with the merchant. Missing
fee evidence, disputes and ambiguous refund states require reconciliation.

See [database/OPERATIONS.md](database/OPERATIONS.md) for configuration, required
webhook events, the authenticated worker schedule and remaining launch work.
The local live key was checked with a read-only account request. It is not
committed. No live financial test transaction has been made.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Tests use synthetic Stripe responses and isolated PostgreSQL data. They do not
load `.env.local` or make live Stripe calls. Optional real PostgreSQL contention
tests use a separate `TEST_DATABASE_URL`; never point it at production.

Browser check artifacts live under ignored `output/playwright/`.
See [TESTING.md](TESTING.md) for the actual verification report and limits.

## Publishing

Completed tasks are committed and pushed directly to `main`. No pull requests.
Original reference media, credentials, local tools and test artifacts stay out
of Git. The editable model and optimized public assets are versioned.
