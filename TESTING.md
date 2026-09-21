# Verification report

Updated 21 September 2026. This records executed checks, not a claim that live
payments or deployment are ready.

## Automated checks

- TypeScript type check: passed.
- Next.js production build: passed.
- Dependency audit: zero reported vulnerabilities at installation.
- Domain/HTTP tests: 51 passed, including exact doubling, deadline boundaries,
  fee/FX arithmetic, unsafe URLs, disabled checkout and webhook signatures.
- Embedded PostgreSQL + simulated Stripe: 8 passed. Tests execute the actual
  migration, reservation logic and worker, including two takeovers/refunds,
  duplicate events, response loss, reservation expiry, missing fees and a late
  payment requiring a full refund.
- Isolated PostgreSQL 17.11 verification: **62 tests passed, zero skipped**.
  The service/worker suite used the actual PostgreSQL pool and transactions;
  separate connections exercised row/advisory locks and reservation contention.
  Stripe responses remained simulated. The isolated test cluster was stopped
  after verification and did not change the app's local environment.

## Browser checks

Playwright checked the site at 1440×1000 and 390×844:

- Each of the six list items selects the correct muscle and front/back view.
- Selection changes the sponsorship action and checkout heading.
- Checkout and rules dialogs open/close; Escape closes checkout.
- A completed preview form still cannot submit a financial payment.
- The public API returns six unclaimed $1,000 spots with no invented bids.
- The server rejects unconfigured checkout independently of the browser.
- FAQ expansion works and mobile has no horizontal overflow.
- Mouse dragging rotates the model; focused left/right arrows turn and up/down
  arrows tilt. Arrow keys outside the viewer retain normal page behavior.
- Front displays quad hotspots; rotating to the back exposes hamstrings/calves.
- Sponsor logo badges select their actual slot; broken logo images fall back
  to the sponsor name. Browser-only fixtures were removed after testing.
- WebGL context-loss fallback preserves front/back images and slot selection.

Final full-body desktop/mobile framing and fallback verification passed.
Reference captures and browser screenshots are kept locally under
`output/playwright/`.

## Blender asset

- Full-body source and 960×1280 front/back/oblique renders visually reviewed.
- Editable Blender source plus optimized 3,606,432-byte GLB.
- 109,515 triangles, 19 material draws, two embedded authored textures.
- Six correctly named leg-placement anchors and external placement metadata.
- Khronos glTF validation: zero errors, zero warnings, zero informational issues.
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
