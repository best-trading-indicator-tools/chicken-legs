# Verification report

Updated 22 September 2026. This records executed checks, not a claim that live
payments or deployment are ready.

## Automated checks

- TypeScript type check: passed.
- Next.js production build: passed.
- Dependency audit: zero reported vulnerabilities at installation.
- Domain/HTTP tests: 53 passed, including exact doubling, deadline boundaries,
  fee/FX arithmetic, unsafe URLs, disabled checkout and webhook signatures.
- Embedded PostgreSQL + simulated Stripe: 10 passed. Tests execute the actual
  migration, reservation logic and worker, including two takeovers/refunds,
  duplicate events, response loss, reservation expiry, missing fees and a late
  payment requiring a full refund. The new ankle tests verify independent
  $1,000 starting bids, doubling, and exactly one fee-adjusted takeover refund.
  Migration/replay checks preserve existing sponsors, bid history, reservations,
  refunds, jobs and paused state while adding the two ankle slots.
- Isolated PostgreSQL 17.11 verification: **66 tests passed, zero skipped**.
  The service/worker suite used the actual PostgreSQL pool and transactions;
  separate connections exercised row/advisory locks and reservation contention.
  Stripe responses remained simulated. The isolated test cluster was stopped
  after verification and did not change the app's local environment.

## Site-wide readability — latest verification

- Initial rendered-page scan found 119 visible text fragments below 14px.
- Replaced the 6–13px styles with shared type sizes: at least 14px for labels,
  16px for body text and form fields, and larger prices/countdown figures.
- Audited 50 rendered states at widths 320, 390, 640, 768, 1024, 1280 and 1440px.
  These cover both photo views, expanded FAQs, all dialogs, long sponsor names,
  populated bid history, availability errors and the payment notice.
- No visible text below 14px, form/input placeholder text below 16px, page overflow
  or unintended horizontal clipping was found in the final scan. Screen-reader-only
  instructions and intentionally scrollable history tables were handled separately.
- Photo labels wrap within the viewer; complete sponsor names remain available
  through accessible labels and the sponsor list. Desktop/mobile screens were
  visually reviewed.
- All 183 existing browser interaction assertions passed after the changes:
  89 photo-viewer, 36 campaign-page, 51 sponsor-list and 7 modal keyboard checks.
- TypeScript and production build passed. Test fixtures were removed afterward.

## Sponsor-list modal verification

The View the Sponsors button opens a Meet the sponsors dialog. **94 browser
assertions passed** for this change: 51 sponsor-list checks, 7 keyboard/backdrop
checks and 36 existing campaign-page checks. TypeScript and the production build
also passed.

- All eight occupied zones display their sponsor, website, logo/fallback and
  accepted bid amount, independently of the doubled next takeover price.
- Unclaimed zones are omitted; no sponsor rows or visitor counts are fabricated.
- Empty, initial loading and API-error states remain distinct; retry recovers.
- Desktop and 320/390px mobile views fit without horizontal overflow. Long brand
  names wrap and the last sponsor remains reachable through the scrollable list.
- Enter opens the dialog; native modal focus excludes background controls.
  Escape, close button and backdrop dismiss it and restore focus.
- Background scrolling locks while open; choosing a spot returns focus to the
  selected zone. Broken logos preserve the sponsor name and website link.
- Existing zone selection, rules, checkout dialogs and preview payment blocking
  continue to work. Browser-only sponsor fixtures were removed after testing.

The original iCloud checkout's stale Git index was synchronized with the already
published photo commit without changing working files. Code/model assets are
tracked; source photos and environment credentials remain ignored.

## Browser checks — current photo viewer

The V2 image replacement passed **89 focused photo-viewer assertions**. The
36 campaign-page checks were last passed with the sponsor modal update above.
Desktop was checked at 1440×1000; responsive checks covered 320, 390 and 768px
widths. Photo-viewer checks covered:

- The exact front/back photo derivatives load uncropped with their original aspect ratio.
- Four front markers cover quads/ankles; four back markers cover hamstrings/calves.
- All eight markers and list items select their matching auction and $1,000 checkout.
- Front/Back buttons and focused left/right arrows change photographs. The
  original focus-only shortcut was subsequently replaced as verified below.
- Marker positions follow the contained image bounds at each tested viewport.
- No horizontal overflow; mobile selection and checkout dialogs work.
- Broken sponsor logos fall back to the brand name; a sponsored fixture retains
  the $2,000 takeover price. Browser fixtures were removed after testing.
- Failed photos hide their markers while the list, checkout and other view remain usable.
- Each placement opens its matching checkout dialog; Escape dismissal and
  disabled preview payment controls work.
- Eight honest, empty auction records are returned with no invented sponsors or bids.
- No canvas, WebGL context or Blender/GLTF downloads; no JavaScript errors.

Desktop front/back and mobile framing were visually reviewed. Reference captures
and verification scripts are kept locally under `output/playwright/`.

## Running background — 22 September 2026

- Added the confirmed half-marathon and long-distance sprinting background to
  the backstory. The hero now says “My first marathon” instead of “Zero training.”
- Verified both statements in Chromium at 1440px and 390px widths, with no
  horizontal overflow. Reviewed desktop/mobile backstory screenshots.
- The production build and TypeScript passed.

## Optional background music — 22 September 2026

- Added an icon-only 48px music toggle in the website header on desktop and
  mobile. Music starts off after loading or refreshing the
  page; no audio request occurs until the first activation.
- Real Chromium playback checks passed: the supplied track plays, pauses,
  resumes from its position, and loops after seeking to the end. Enter and Space
  operate the button, and its pressed state follows playback. Default volume is
  40% in browsers supporting programmatic volume.
- A blocked audio request displayed a retry message and recovered when unblocked.
  A delayed request could be cancelled without later starting playback or showing
  a false failure. Browser request fixtures were removed after verification.
- Playback and pause passed at 390×844 and 320×740, and again at desktop and
  320px widths after moving the control into the header. Header layouts passed
  at 1440, 1280, 768, 390, 381 and 320px without overlap or horizontal overflow.
  Desktop/mobile screenshots were reviewed under `output/playwright/music-header-*.png`.
  These were browser viewport checks, not physical-device tests.
- Replaced the soundtrack with `assets/private/music/CHICKEN BANANA.mp3`.
  Its public derivative, `public/audio/chicken-banana.mp3`, strips source
  metadata and uses a new URL to avoid cached audio. The 3,167,920-byte file
  retains all 131.935782 seconds of 192 kbps, 44.1 kHz stereo audio; decoded PCM
  SHA-256 hashes match. The source remains private and unchanged.
- Browser playback confirmed the Chicken Banana URL and duration, silent initial load, and
  working play/pause through the header control.
- The production build and TypeScript passed. No payment behavior changed.

## Photo arrow controls — 21 September 2026

- Left/right keys switch views while the photograph is visible, without first
  focusing it. Browser checks passed with focus on the page, viewer, Front/Back
  controls and a placement marker. Switching from a marker preserves focus in
  the viewer; a keypress switches once and held-key repeats do not cause flicker.
- Both clickable arrow buttons passed at 1440, 390 and 320px with no horizontal
  overflow. Mobile controls were visually reviewed in
  `output/playwright/photo-arrow-controls-*.png`.
- Native input, textarea, select, range and editable-text fixtures retained normal
  arrow behavior. All three actual dialogs paused photo shortcuts; caret movement
  in the sponsorship form worked. Fixtures were removed and the field was cleared.
- Offscreen photos stayed unchanged. Synthetic modifier/composition and already
  handled events were ignored without preventing their default behavior.
- The production build and TypeScript passed. No payment was submitted.

## Current photo assets

- Current sources: `assets/private/V2/vuedefaceV2.png` and
  `assets/private/V2/vuededosV2.png`, replacing the original front/back pair.
- Resized WebP derivatives are 918×1600 each: 229,916 bytes front and 200,244 bytes
  back (430,160 bytes combined). Appearance and composition are preserved.
- All eight marker positions were realigned to the new poses. Front ankle markers
  sit on the exposed skin above the socks. No additional side photos are needed.
- Metadata inspection found no EXIF, XMP or ICC payload in either derivative.
- Original PNGs and credentials remain excluded from Git.
- TypeScript and the production build passed after the photo replacement.
- Verification ran in a clean local checkout because iCloud offloaded files in
  the working folder. Payment code did not change; the earlier backend test
  results above remain the recorded backend verification.

## Sponsorship action visibility — 21 September 2026

- Moved the selected spot’s Claim action beside the panel heading, before the
  eight-row list. It is visible without scrolling at 1440×900 and 1280×720.
  Tablet keeps the heading/action beside the list; mobile places it above.
- All eight row prices open their matching sponsorship dialog directly on
  desktop and mobile, with the correct $1,000 opening amount. Enter and Space
  work, Escape restores focus, and preview payment submission stays disabled.
- No horizontal overflow at 1440, 1280, 1024, 390 or 320px. Panel screenshots are
  local under `output/playwright/bid-action-*.png`.
- **69 browser assertions passed**: 63 interaction/layout checks plus six checks
  using browser-only auction fixtures. The fixtures verified the clicked spot’s
  $4,000 takeover price independently of the previous selection and blocked
  reserved, price-limit, closed and API-error states. No checkout requests were
  sent, and all browser fixtures were removed afterward.
- The production build, including TypeScript checks, passed. No server payment
  configuration changed; live bidding remains disabled.

## Roast backstory — 21 September 2026

- Fixed desktop story alignment: previously, at 1440×900 the collage began at
  y=93 while the story began at y=1161. Both now begin at y=93. The original posts
  occupy their own row below the story/collage and stack on mobile.
- Responsive layout checks passed at 1440, 1280, 1024, 768, 390 and 320px. The
  story introduction is visible alongside the collage on desktop; content stacks
  in order on mobile with no horizontal overflow. Fresh `#the-story` page loads
  showed the heading immediately at 1440 and 390px, and both video previews loaded.
- Full landing-page interaction checks passed in Chromium at 390×844 and 320×740:
  the hero sponsorship link, sponsor/rules dialogs, front/back photos, all eight
  opening-price buttons and their matching dialogs, and all four FAQ disclosures.
  Page sections and dialogs fit horizontally. Preview payment submission remained
  disabled, and zero checkout POST requests were sent. These were browser viewport
  checks, not physical-device tests. The production build and TypeScript passed.
- Reviewed desktop/mobile captures under `output/playwright/story-aligned-*.png`,
  `story-source-posts-desktop.png`, `story-direct-link-*.png`, and
  `landing-*-mobile-*.png`; full mobile captures are `landing-mobile-*.png`.
- Enabled attached media in both X embeds. Both posts contain videos; their
  preview images and players loaded at 1440 and 320px without horizontal overflow.
  Desktop/mobile captures were visually reviewed. The production build and
  TypeScript passed. Captures: `output/playwright/roast-tweet-media-*.png`.
- Added the second source post (September 18) alongside the first (September 13),
  with separate date labels and replies links. Both live embeds and their source
  URLs passed browser checks at 1440 and 320px without horizontal overflow; both
  source fallbacks remained available when X was blocked. Only one copy of X's
  widget script loads. The production build and TypeScript passed.
  Captures: `output/playwright/roast-two-posts-*.png`.
- Embedded the user's original tweet below the collage in X's dark theme, with
  a persistent “Read the replies” source link. The post text
  and attribution were verified against X's oEmbed response.
- The live X embed loaded at 1440, 768, 390 and 320px; both the page and the
  iframe content fit without horizontal overflow. Desktop/mobile captures were
  visually reviewed. Blocking X's script kept the source text and two working
  source links visible at 320px. The production build and TypeScript passed.
  Captures: `output/playwright/roast-tweet-*.png`.
- Removed the redundant “Read a few of the roasts” expandable quotes. A rendered
  page check confirmed they are absent while the collage and full-size link remain;
  the production build and TypeScript passed after removal.
- The new backstory is the first section after the hero and preserves the existing
  `#the-story` navigation target without duplicating the story further down the page.
- Browser checks passed at 1440, 1024, 768, 390 and 320px: the supplied collage
  loads at its original aspect ratio, there is no horizontal overflow, and body
  copy stays at 16px. Desktop and mobile captures were visually reviewed.
- The image opens in a separate tab, the
  comeback link returns to sponsorships, and the existing checkout dialog opens
  and dismisses normally. No payment was submitted and no browser errors appeared.
- Type checking and the production build passed. Payment code was not changed;
  the earlier backend verification remains the applicable record.
- `public/images/chicken-legs-roasts-800.webp` is a lossless, 125,862-byte derivative
  of `assets/private/Chicken legs roasts 800X800.png`, replacing the initial
  256×256 image. The new filename prevents reuse of the old cached image; both
  collage links and the intrinsic dimensions now reference the 800×800 asset.
  EXIF, XMP and ICC metadata are absent, and the original remains ignored.
- The 800×800 replacement passed a decoded-pixel equality check against its PNG
  source, desktop/mobile image-loading and link checks, and the production build
  with TypeScript. Updated captures: `output/playwright/roast-story-800-*.png`.
- Review captures are local under `output/playwright/roast-story-final-*.png`.

## Archived Blender asset — earlier verification

The user rejected this likeness. These assets are no longer loaded by the campaign page.

- Full-body source and 960×1280 front/back/oblique renders visually reviewed.
- Editable Blender source plus optimized 3,606,924-byte GLB.
- 109,515 triangles, 19 material draws, two embedded authored textures.
- Eight correctly named leg-placement anchors and external placement metadata.
- Khronos glTF validation: zero errors, zero warnings, zero informational issues.
- Front ankle patches sit on exposed skin above the socks. All 161 existing
  Blender body objects are unchanged; GLB geometry and textures are byte-identical
  to the six-anchor version.
- Source photos and credentials are not packed into public assets.
- The model is an artistic reference-based character, not a scan or an exact
  facial reconstruction. Source/licensing details are documented alongside the
  Blender scripts.

## Financial integration limits

The supplied live Stripe key authenticated successfully against the read-only
account endpoint; account country/currency matched France/EUR. No real charge,
refund, payout or financial mutation was used for testing.

### Actual Stripe sandbox verification — 21 September 2026

The supplied test key authenticated against the same France account as the live
key. Testing used an isolated local PostgreSQL database, Stripe-hosted Checkout
in Chromium, and Stripe CLI forwarding signed provider webhooks at the SDK's
`2026-08-26.dahlia` API version. All payments and refunds below were in test mode.

| Accepted payment | Original EUR Stripe fee | Original EUR per USD rate | Deducted USD fee | Successful USD refund |
| --- | --- | --- | --- | --- |
| $1,000 | €46.01 | 0.871598 | $52.79 | $947.21 |
| $2,000 | €91.76 | 0.871598 | $105.28 | $1,894.72 |
| $4,000 | Current winner | — | — | No refund owed |

- Actual $1,000 → $2,000 → $4,000 takeovers passed. Stripe confirmed exactly one
  successful refund per displaced sponsor. Fee deductions were independently
  recalculated from the original balance transactions using decimal rounding.
- The API exposes a $4,000 current total, three historical bids, the third sponsor
  as winner, and an $8,000 next price. Refunds do not inflate the current total.
- Replaying a real signed success event twice did not create duplicate bids or
  refunds. A forged signature returned HTTP 400.
- Stripe's declined-card test returned a visible decline and created no accepted
  bid. Explicit session expiration delivered a signed event and released the
  right-quad reservation without affecting the current left-quad sponsor.
- The final takeover and refund completed through post-response webhook processing
  with the local polling worker disabled, verifying the immediate processing path.
- The updated suite passed **67/67 tests** against real PostgreSQL; type checking
  and the production build passed. Unit/integration tests still simulate Stripe;
  the browser/provider checks above are separate.
- The separate production Neon database has eight slots, zero bids and zero jobs.
  No test sponsors or payment records were copied into it.

Production deployment `f23ba38` was verified at https://chicken-legs.vercel.app:
the database-backed API returns eight empty spots, the worker rejects anonymous
requests with HTTP 401 and succeeds with its bearer secret, and the webhook
rejects missing signatures while acknowledging a valid signed non-payment probe.
The probe created no payment/event records. The authenticated operations endpoint
reported zero pending jobs and refunds. These checks do not establish actual
Stripe-to-production delivery; the live endpoint remains disabled pending launch.

Pending production verification: provider webhook delivery, scheduled worker and
job monitoring. Public seller/support/cancellation/tax details and artwork
management remain operational follow-ups. A sandbox does not prove live settlement
timing, insufficient-balance refunds or every issuer/dispute scenario.
