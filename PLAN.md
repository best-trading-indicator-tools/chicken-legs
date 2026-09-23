# Chicken Legs — implementation plan

Status: live Stripe checkout is enabled at https://www.chickenlegs.wtf. The existing Vercel team is on Pro, with native one-minute payment recovery and an independent GitHub health monitor. All 102 automated checks passed; real Stripe test checkouts, doubling, fee-adjusted refunds, delayed/failed refunds, disputes, 3-D Secure, signed webhooks and missing-delivery recovery were verified in an isolated hosted environment. Production launched with eight empty slots and no test bids.
Updated: 23 September 2026.

## Confirmed brief

| Item | Decision |
| --- | --- |
| Campaign | “I'm selling my chicken legs.” Personal coach/chiropractor versus the internet; put the legs to the test. |
| Browser tab title | Sponsor my Legs — David Attias' Marathon |
| Section order | Hero → campaign stats → “Leg day. Pay day.” explanation → roast backstory → personal gallery → bid history → FAQ. Keep the stats and sponsorship explanation directly below the hero on desktop and mobile. |
| Event | Full 42.195 km Marathon des Alpes-Maritimes Nice–Cannes, Sunday 8 November 2026. |
| Running background | The runner has never even run a half marathon, but is used to sprinting and uphill stair running with a 15 kg weighted vest. Explain this training background in the backstory, emphasizing the actual training experience. Call the event his first marathon in the hero, replacing the earlier “Zero training” wording. |
| Personal gallery | Show two photos and three training videos from `assets/private/gallery-david/` after the roast backstory. Remove “Hi, I’m David” and “The legs in question”; keep “Out in the sun” in the top row. Use a responsive photo grid with full rows and an accessible full-screen viewer with video controls, previous/next buttons, arrow keys, and photo swiping on mobile. Publish optimized derivatives with source metadata removed; keep originals private. Videos load on opening, play muted, and have no audio tracks. The optional background music stays independent. |
| Placements | Eight independent auctions: left/right quad, left/right hamstring, left/right calf, left/right front ankle. Left/right refers to the runner's body. |
| Starting price | USD $1,000 for each unclaimed placement. |
| Takeovers | Exactly double the last accepted payment: $1,000 → $2,000 → $4,000 → $8,000. |
| Outbid sponsor | Automatically refunded minus the original recorded Stripe fee, with the USD/EUR treatment described below. |
| Sponsor benefits | Final winner's temporary logo tattoo on race day; sponsor mentions in public bid history. Previous accepted sponsors remain in that history. |
| Closing time | 1 November 2026 at 23:59 Europe/Paris, represented as `2026-11-01T22:59:00Z`. |
| Stripe account | France; customers pay USD, account settles in EUR. |
| Presentation | Use only `assets/private/V2/vuedefaceV2.png` and `assets/private/V2/vuededosV2.png` for the public front/back photo viewer. Preserve the supplied appearance. Eight clickable sponsorship hotspots; photos automatically switch front/back every three seconds once both images are loaded and the viewer is visible. Provide a pause/resume button; pause on hover, keyboard focus, hidden tabs and open dialogs. Manual view changes or spot selections stop autoplay until resumed. Respect reduced-motion preferences. Front/Back and arrow buttons still switch views. Left/right keyboard shortcuts work while the photo is on screen, without first focusing it, and pause for typing or open dialogs. |
| Typography | Body copy and form controls use 16px text; compact labels never fall below 14px. Apply the same scale across the whole site, dialogs and mobile layouts. Wrap/reflow content instead of shrinking it. |
| Roast backstory | Show the supplied `assets/private/Chicken legs roasts 800X800.png` collage after the campaign stats and sponsorship explanation, explaining how the comments motivated the runner to show the world how strong his legs are. This 800×800 source replaces the initial 256×256 image. Keep the original private and publish a metadata-free WebP derivative. |
| Music | Use `assets/private/music/CHICKEN BANANA.mp3` for an optional looping soundtrack. A music icon in the website header starts off and only downloads/plays the track after a visitor turns it on. Keep the source private and publish a metadata-free audio derivative. |
| Repository | `best-trading-indicator-tools/chicken-legs`; commit and push each completed task directly to `main`, without pull requests. |

The user added the two front ankle placements after the original six-spot setup. All eight use the same independent starting-price and takeover rules.

The earlier “semi-marathon” wording is superseded by the confirmed full marathon. Do not invent follower counts, social-post promises, bids, sponsor logos, visitor numbers, or race results.

## Reference findings

Inspected [Marc Lou's site](https://hyrox.marclou.com/) in a real browser, including its current and legacy themes, sponsor list, placement detail, and auction rules. Recreate the central rotating 3D subject, clickable placements, prominent sponsorship action, sponsor detail panels, and public history with original Chicken Legs assets and copy. Use a dark stage and bright accents, framing the legs as the main subject.

The reference is now a post-race display. Its current rules offer refunds without fee deductions, unlike the user's screenshot. This project follows the user's explicit fee-deduction rule. The visible site cannot establish how its private backend works.

The [official event website](https://www.marathon06.com/2026/) confirms the event date and offers several distances; the user specifically selected the full marathon.

## Build sequence and completion checks

### 1. Project foundation and rules

Use Next.js with TypeScript for the website and server endpoints, PostgreSQL for auctions, object storage for public approved assets, and a durable database job queue for payment reconciliation/refunds. Use a lightweight React photo viewer for the public presentation. Earlier Blender assets remain archived in the repository and are not loaded by the campaign page. Hosting: the existing Vercel project plus Neon PostgreSQL, selected by the user on 21 September. Source media and environment credentials remain ignored locally.

Create a runnable local app, isolated test configuration, database migrations, campaign configuration, and an example environment file containing placeholders only. Make the eight slot IDs permanent. Store money in integer minor units and calculate every price on the server. Store time in UTC and display the Paris timezone explicitly.

Complete when: local app starts, migrations create exactly eight slots, and tests verify price doubling, currency enforcement, and the cutoff.

### 2. Website and sponsor journey

Build the desktop and mobile page with the campaign story, race date, deadline countdown, actual front/back photographs, view controls, eight matching accessible placement buttons, current sponsor/price, next takeover price, and an expandable bid history.

Flow: choose a spot → review amount and takeover/refund terms → enter sponsor name, website, email and logo → pay through Stripe-hosted Checkout → return to a payment-status page. Display a pending state until the server verifies payment. Cancellation or decline leaves the current sponsor in place.

Each available sponsorship row opens its own details directly, including clicks on
the amount or opening-bid label. Keep the selected spot’s Claim button next to the
panel heading, before the long spot list, so it is visible on desktop.

Keep all previously accepted sponsors in history with brand name, placement, amount, date and current/outbid status. Keep email addresses, Stripe IDs and private billing details private. Count current sponsorship value separately from cumulative payments; refunded bids must not inflate a “raised” total.

Provide secure sponsor management for logo/link edits before branding closes. Validate uploaded files and website URLs. Stop branding edits at the deadline, then reconcile outstanding pre-cutoff payments before freezing the final winning artwork. Add a small authenticated administration page for current sponsors, jobs needing attention, refund status, campaign pause, and tattoo artwork export.

Complete when: each of the eight photo/list selections opens the correct placement; forms, history and pending/cancelled states work on desktop and mobile; keyboard users can complete the same journey.

### 3. Photo viewer and tattoo placements

The user rejected the 3D likeness as artificial and chose photographs. The user supplied replacement V2 images. The current sources are **vuedefaceV2.png and vuededosV2.png**, both in ignored `assets/private/V2/`. They supersede the previous frontview/backview pair. Use these supplied photos directly, preserving the full body and background. Side views are not required for the current front/back interface.

Prepare resized WebP derivatives for the site, preserving composition and appearance and stripping metadata. Keep the original PNGs private. Show the entire photograph without stretching or cropping. Place normalized hotspots on the actual leg positions, accounting for image letterboxing at every viewport size. Anatomical left appears on the viewer's right in the front photo and on the viewer's left in the back photo.

Front exposes quads and front ankles; back exposes hamstrings and calves. All eight remain independent auctions. Selection updates the same sponsorship action and checkout. Preserve sponsor logo/name badges, keyboard access, front/back buttons, and a usable sponsorship list if an image fails. Do not describe photo switching as 3D rotation.

Complete when: both exact supplied views load on desktop/mobile, hotspots align with the visible skin, all eight selections open the correct auction, and no WebGL/model assets are requested.

### 4. Payment, takeover and refund engine

Use Stripe-hosted Checkout with cards/card wallets initially. Keep presentment in USD and disable Adaptive Pricing for this fixed-currency auction. Charge the full takeover amount immediately. An accepted $2,000 sponsor replaces the accepted $1,000 sponsor only after verified payment; the previous sponsor's refund is a separate tracked operation.

For each checkout, lock the slot in a database transaction and create one active reservation for the current price/version. Create the Stripe Session with a stable idempotency key. Do not hold a database transaction open across a network request. Persist enough information to recover a crash between reservation and Session creation.

Use a short reservation window, provisionally 10 minutes, enforced by a worker that explicitly expires the Stripe Session. Stripe's automatic Checkout expiration has a 30-minute minimum. Never release a reservation solely because an application timer ran out: expire/retrieve the actual Session and reconcile any successful payment first. Rate-limit reservation attempts to prevent one visitor monopolizing a slot. [Stripe inventory handling](https://docs.stripe.com/payments/checkout/managing-limited-inventory)

Verify webhook signatures on the raw request body, store events durably, and acknowledge promptly. Make handlers safe for duplicate and out-of-order events. Verify paid status, amount, USD currency, payment identity and slot/version against server-owned records. Atomically accept the winner, append bid history, and enqueue exactly one refund obligation for the displaced sponsor. Never infer payment from the return URL. [Stripe webhook guidance](https://docs.stripe.com/webhooks), [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment)

Refund jobs use stable idempotency keys and unique refund obligations. Reconcile Stripe state after ambiguous network failures before retrying. Track waiting-for-fee, queued, submitted, pending, succeeded and failed states. Retry transient failures; surface persistent failures in admin. A failed refund must not silently roll back a valid new sponsor or issue duplicate repayments. [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)

At closing: stop new checkouts, expire outstanding sessions, accept payments with verified successful completion before the cutoff even if webhook delivery is delayed, and reconcile before declaring winners final. Use the verified Stripe payment-success event timestamp as completion evidence, not Session/Charge creation time or webhook arrival time. Missing timestamp evidence requires reconciliation. Proposed exception policy: invalid, duplicate or late payments receive a full refund with the merchant absorbing fees; the fee deduction applies only to a valid sponsor later outbid.

Disputes pause affected refund submissions/retries for reconciliation so a chargeback and automatic refund cannot cause double reimbursement. A disputed current winner goes into an administration review state; do not silently give away the placement or charge someone again.

Complete when: the $1,000 → $2,000 → $4,000 sequence succeeds in Stripe's sandbox, with the correct sponsor and one correct refund per takeover, including simultaneous attempts and retried webhooks.

### 5. Verification and operational readiness

Test the rules, database transactions, background workers, and real sandbox Checkout/webhook/refund round trip. Test with Playwright in desktop and mobile viewports. Include a production build, type checking, dependency/security checks, accessibility basics and secret checks.

| Test group | Required cases |
| --- | --- |
| Prices | First bid; each exact doubling; independent slots; altered client price/currency; payment limits and integer bounds. |
| Concurrency | Two requests for one slot; different slots concurrently; double submit; Session creation succeeds but response is lost; reservation expiry races with payment. |
| Payments | Success; cancellation; decline; 3-D Secure success/failure; refresh/back; browser closed after payment. |
| Webhooks | Invalid signature; duplicate; out of order; delayed; missing event recovered by reconciliation; worker crash before/after commit. |
| Fees and FX | EUR fee converted to USD using original rate; decimal rounding; missing fee/rate; unsupported pricing; changed refund-time FX; no double counting. |
| Refunds | One per takeover; API timeout after successful submission; pending for insufficient balance; failure and retry; prior partial refund; disputed charge. |
| Deadline | Before, at and after cutoff; Paris-to-UTC conversion; checkout already open; delayed notification of pre-cutoff payment; branding freeze. |
| Interface | All eight placements; front/back; small screen; touch; keyboard; logo validation; empty/history/sold states; no personal billing data in public responses. |
| Photos | Correct supplied images; anatomical left/right; hotspot alignment; loading/failure; keyboard view changes; mobile; no model downloads. |
| Administration | Unauthorized access denied; refund visibility; job recovery; audit trail; final artwork export. |

Maintain a test report distinguishing passed checks, simulated fixtures and tests requiring Stripe credentials. A sandbox does not prove real card settlement timings or live FX costs. No live charge is part of automatic testing.

### 6. Deployment and final campaign assets

After the tested build and final photos are reviewable, configure the selected host, database, storage, domain, HTTPS, production secrets, signed webhook endpoint and scheduled worker. Verify monitoring and reconciliation on the deployed app. Enable real payments only with live configuration and resolved launch details. When repository publication is requested, commit and push directly to `main`.

At closing, produce the eight winning logos with placement names and agreed print dimensions. Keep the public sponsor history available after the auction closes. The site should retain the race story without claiming a finish or result before it occurs.

## Stripe setup needed

A publishable key alone is insufficient. Hosted Checkout redirects do not need a publishable key. The server needs a sandbox restricted key with the required permissions (or a server secret key) and a separate webhook signing secret. Use corresponding live keys only for launch. [Stripe key types](https://docs.stripe.com/keys)

| Environment value | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server-only sandbox `rk_test_…` or `sk_test_…`; later the matching live key. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for the configured endpoint; local CLI and deployed endpoints have different secrets. |
| `DATABASE_URL` | PostgreSQL connection, separately configured for test and production. |
| `APP_URL` | Canonical origin for Stripe return URLs. |
| Worker/admin/storage secrets | Generated/configured during implementation for background jobs, private administration and logo storage. |

The restricted key needs appropriate Checkout Session create/read/expire permissions, PaymentIntent/Charge/balance-transaction reading, and refund create/read permissions. Pin and test the Stripe API version used by both SDK and webhook destination. Put secrets in ignored `.env.local` or the host's secret settings; do not paste them into chat or commit them.

### USD payment / EUR settlement refund policy

Proposed application policy: deduct only eligible Stripe fees recorded for the original payment, converted into USD at that payment's original recorded exchange rate. Explain the rule before checkout and show the final fee/refund breakdown to the affected sponsor.

For the initial direct-card integration, eligible fees are separately itemized `stripe_fee` entries in the original balance transaction. Exclude tax, application fees and other fee types from the deduction. Reconcile the entire breakdown against the aggregate and route unfamiliar structures for review. Currency-conversion costs can be itemized or embedded in the exchange rate: absorb embedded costs instead of inventing an extra percentage or inferring one from market rates. Do not parse arbitrary English fee descriptions to classify fees. [Stripe currency-conversion fee presentation](https://support.stripe.com/questions/understanding-your-currency-conversion-fees)

Retrieve the original successful payment's expanded `latest_charge.balance_transaction`. Fee information can arrive after payment succeeds; wait for `charge.updated` or retry instead of assuming zero. IC+ pricing needs a different fee-report integration and must be identified before launch. [Retrieving fees](https://docs.stripe.com/expand/use-cases)

For a fee reported in EUR and an original rate `r` expressed as EUR per USD:

```text
fee_usd_cents = round_half_up(eligible_fee_eur_cents / r)
refund_usd_cents = original_captured_usd_cents - fee_usd_cents
```

Use decimal arithmetic, validate the original currencies/rate, retain the raw fee evidence, and reconcile previous refunds before submitting anything. Missing or inconsistent data waits for reconciliation rather than guessing. This conversion is our disclosed policy, not a built-in Stripe auction feature. [Balance transaction fields](https://docs.stripe.com/api/balance_transactions/object)

The refund is issued in USD. Differences caused by refund-time exchange rates remain a merchant accounting cost/gain; do not take an additional undisclosed deduction from the former sponsor. Do not blindly subtract EUR cents from USD cents or use a generic percentage fee estimate. [Stripe exchange-rate differences](https://support.stripe.com/questions/amount-of-customer-dispute-is-greater-than-original-charge?locale=en-GB)

Proposed checkout wording: “If another sponsor outbids you, we'll automatically initiate a refund of your original USD payment, less Stripe's original itemized payment and currency-conversion fees. Fees recorded in EUR are converted to USD at the exchange rate from your original payment, rounded to the nearest cent. We absorb later exchange-rate changes and conversion costs that are not separately itemized.”

Stripe can leave refunds pending when the available balance is insufficient. Display “refund initiated/pending” accurately; do not promise instant receipt. Track failures and recovery. [Refund lifecycle](https://docs.stripe.com/refunds)

## Inputs and decisions still needed

- Final presentation sources received: `assets/private/V2/vuedefaceV2.png` and `assets/private/V2/vuededosV2.png`. No additional photos are required for this version.
- Public name/handle, domain, and support contact. These can remain configurable during the build.
- The live Stripe key is stored in ignored `.env.local`; the supplied test key is in ignored `.env.sandbox.local`. Both authenticated against the same France account. Real sandbox takeovers and EUR-fee refunds passed. The user chose to keep the current Vercel team and upgraded it to Pro. Native one-minute recovery is configured in vercel.json, with independent GitHub Actions health monitoring. Both were verified on production before enabling live checkout on 22 September 2026.
- Branding dimensions/print requirements and sponsor-logo acceptance rules before taking real payments.
- Seller/invoicing details and whether advertised prices include applicable taxes. Do not silently add charges to the promised exact doubling.
- Final customer-facing cancellation/non-participation policy. Recommendation: full refund if the promised race-day placement cannot be delivered; ordinary takeover refunds retain the stated fee deduction. This recommendation is not yet a confirmed campaign term.

## Work completed so far

- Fixed a localhost availability outage on 23 September: the long-running development server logged unhandled database network errors and returned 503 while fresh connections and production remained healthy. Restarting restored all eight spots. Added idle-connection error handling, bounded database queries, broken-connection disposal, and browser reconnection/timeout handling. Availability failures no longer display the campaign preview status. All 106 automated tests, TypeScript, the production build and 17 browser recovery checks passed; no payment was submitted.
- Inspected the reference site, sponsor detail and auction rules in a browser.
- Verified the official race date and incorporated the user's distance/deadline/currency answers.
- Researched Stripe keys, fee retrieval, FX, refunds, Checkout reservation expiry, webhooks and idempotency.
- Verified existing GitHub authentication; no supplied token was used.
- Initialized this previously empty folder as its own repository on `main`, pointing to the requested GitHub repository, to avoid touching the enclosing unrelated repository.
- Implemented the Next.js campaign, responsive sponsor selection, bid history, rules/checkout dialogs and interactive sponsorship viewer.
- Added the View the Sponsors modal: current brands, linked logos/names, zones and accepted amounts, with accessible desktop/mobile states.
- Added the backstory with the supplied roast collage, “They roasted my legs. I found my fuel.” motivation copy, and a sponsorship link. It now follows the campaign stats and sponsorship explanation. Removed the redundant expandable comment excerpts at the user’s request; the collage retains descriptive alt text and a full-size image link. Desktop/tablet/mobile browser checks, TypeScript and the production build passed.
- Added both source posts below the collage as dark X embeds with their attached media visible: [September 13](https://x.com/david_attisaas/status/2099147589551788373) and [September 18](https://x.com/david_attisaas/status/2100833699583656270). Each has its own direct link to the replies. Source text excerpts and links remain available if the embeds cannot load.
- Aligned the story text and replies collage at the top of their desktop row, with both source posts in a separate row underneath (stacked on mobile). The video embeds no longer push the story below the visible collage when following `#the-story`.
- Implemented PostgreSQL reservations, server-priced Stripe Checkout, signed webhooks, durable job processing, takeover/refund obligations and exact fee conversion.
- Earlier Blender source and web assets are retained as archived work. The user rejected the reconstructed likeness; the public presentation now uses the exact supplied front/back photographs.
- Passed 66 tests against an isolated real PostgreSQL server with simulated Stripe responses, plus production build, type checking, browser interaction checks and Khronos GLB validation (zero errors/warnings).
- The existing Git integration deploys `main` to https://chicken-legs.vercel.app. Committed and pushed completed tasks directly to `main` as requested, without PRs.
- Created the user-authorized free Neon database in Frankfurt and migrated all eight slots. Production data remains empty; sandbox payments use an isolated local PostgreSQL database.
- Verified real Stripe-hosted sandbox checkout, signed provider webhooks, both takeovers and exactly one successful refund per displaced sponsor. Added immediate post-response worker processing while retaining durable jobs for scheduled recovery. The regression suite now passes all 67 tests on real PostgreSQL.

Blender 4.5.3 is available locally under ignored `output/blender-tool/`. No live payment or refund was used for testing. Read `TESTING.md` and `database/OPERATIONS.md` for precise verification limits and remaining production work, including operator/artwork management and final seller terms.

- Expanded payment regression coverage to 102 passing tests with real PostgreSQL and simulated provider responses. Fixed reconciliation of refunds that fail after initially succeeding; these now require operator review without issuing a second refund. Added worker heartbeat and queue/refund health checks.

- Enabled live checkout after hosted verification, updated APP_URL and the live webhook to the canonical www.chickenlegs.wtf domain, verified automatic recovery and the production monitor, and removed the temporary test deployment. No real-money transaction was used for testing. Customer payment notices now distinguish review, pending refunds, issued refunds and failed refunds.
