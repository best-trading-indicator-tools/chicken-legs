# Verification report

Updated 21 September 2026. This records executed checks, not a claim that live
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

## Sponsor-list modal — latest verification

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
- Front/Back buttons and focused left/right arrows change photographs; arrow keys
  outside the viewer do not change the selected view.
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

A real Stripe sandbox Checkout → webhook → takeover → refund test still requires
sandbox credentials and a configured endpoint. Hosted PostgreSQL, production
webhook/worker scheduling, job monitoring, seller/support/cancellation/tax terms,
and final artwork management must be configured before opening real payments.
