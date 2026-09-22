# Payment operations

Live checkout was enabled on 22 September 2026 after the hosted Stripe test suite,
native Vercel recovery and independent health monitoring passed; see `TESTING.md`.
Production uses the user-approved Neon database in Frankfurt and launched with
eight empty slots. Test data stayed in a separate database. Unit tests use
synthetic Stripe responses; PostgreSQL tests require `TEST_DATABASE_URL`.
No financial API call is part of `npm test`.

1. Provision PostgreSQL; supply `DATABASE_URL` through a local ignored environment
   file or the deployment secret manager. Run `database/migrate.ts` with that
   environment loaded. `TEST_DATABASE_URL` must identify a separate test database.
2. Configure `APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, a random
   `WORKER_SECRET` of at least 32 characters, `STRIPE_PRICING_MODEL=standard`, and
   `CHECKOUT_ENABLED=true`. Live keys additionally require
   `LIVE_PAYMENTS_CONFIRMED=true`; leave this false during verification.
3. Use the Stripe API version pinned by the installed/locked stripe-node package
   for the webhook destination. Subscribe `/api/stripe/webhook` to
   `checkout.session.completed`, `checkout.session.expired`,
   `payment_intent.succeeded`, `charge.updated`, `charge.dispute.created`,
   `charge.dispute.updated`, `charge.dispute.closed`, `refund.created`,
   `refund.updated`, and `refund.failed`.
   Restricted keys need Checkout create/read/expire, PaymentIntent read/cancel,
   Charge and balance-transaction read, Refund create/read, and Events read
   permissions. Events read is used to recover missing success webhooks and
   their authoritative payment-completion timestamps.
4. Schedule `/api/internal/worker` every minute with
   `Authorization: Bearer <WORKER_SECRET>`. Both GET and POST work. A dedicated
   server-side scheduler must send this header; do not put it in browser code.
   The worker processes up to ten jobs or about forty seconds per invocation.
   On Vercel, set `CRON_SECRET` equal to `WORKER_SECRET`; Vercel sends the matching
   bearer header. The existing team is now on Pro and `vercel.json` schedules
   this route every minute. Each completed scheduled run records an audit heartbeat;
   webhook-triggered runs do not count as proof that the scheduler is working.
   Verified Stripe webhooks also start `runWorker()` with Next.js `after()` after
   committing the event. This makes normal confirmations and refunds prompt;
   it does not replace the scheduler for abandoned checkouts and delayed retries.
5. Poll authenticated `/api/internal/status` for review jobs, stalled reservations,
   disputed placements and refund status. Alert on review jobs and worker
   inactivity. Its `health` report flags a missing/older-than-ten-minute worker
   heartbeat, review jobs, overdue work, stalled reservations, disputed placements
   and refunds pending over 24 hours. The independent GitHub Actions workflow
   `.github/workflows/payment-monitor.yml` checks this report every five minutes
   (GitHub can delay scheduled runs). Set the repository secret
   `PAYMENT_WORKER_SECRET` to the worker secret, manually verify the workflow, then
   set repository variable `PAYMENT_MONITOR_ENABLED=true`. A failed check produces
   a failed workflow run; operators should enable GitHub failed-workflow
   notifications. Recovery itself runs on Vercel, independently of GitHub.
   Do not switch on checkout before scheduling and monitoring work.

The public APIs never expose billing emails, Stripe identifiers or fee evidence.
Return pages query `/api/checkout/status?session_id=...`; they cannot confirm a
payment. Sessions default to Stripe's 24-hour automatic expiry; the worker
explicitly expires them after ten minutes or at closing and verifies payment
state before releasing the placement. If the worker is down, a spot remains
reserved. Availability is sacrificed rather than risking a second charge.

`CHECKOUT_ENABLED=false` stops new requests while allowing webhook/refund recovery.
To pause at the database level, an operator can set `campaign_state.paused=true`.
Never delete a reservation, event, refund obligation or idempotency key to retry a
payment. The entire successful-payment acceptance and refund creation commit in
one transaction. Refunds use one permanent key per obligation. Unknown fee
structures, disputes, prior manual refunds and ambiguous requests older than the
Stripe idempotency retention window are deliberately routed to review.

The original fee calculation is stored with the raw balance transaction. A valid
outbid sponsor loses only itemized `stripe_fee` amounts converted using the
original rate. Invalid or late paid attempts receive full captured-amount refunds.
Missing fee data waits. Unexpected currency, IC+ fees, missing original rate,
inconsistent itemization, refund failures and disputes need operator review.
A refund that Stripe initially reports as successful can subsequently fail;
its provider event refreshes the recorded state and flags it for review. The
current sponsor remains valid and no replacement refund is submitted automatically.
Do not manually refund a payment without reconciling its existing obligation.

Outstanding operations work: add an
authenticated operator interface and reviewed job-recovery workflow; secure
sponsor-edit/upload access and artwork export; configure production logs,
alerting, backups, secrets, and public support/seller/cancellation/tax terms.
Logo inputs currently accept public HTTPS URLs only and do not upload, fetch or
approve artwork. The request limiter trusts Vercel's sanitized client IP header;
self-hosted deployments share a conservative network bucket until a trusted
proxy integration is configured.

Use a persistent PostgreSQL connection for the worker's session advisory lock.
Transaction-pooling proxies cannot preserve that lock; configure the database URL
with session pooling or a direct connection. Unrelated Stripe Dashboard edits
and manual refunds require reconciliation. Do not declare winners final until
the closing-time queue and all pre-cutoff payments are reconciled.

The Neon integration supplies prefixed `CHICKEN_` variables because an empty
`DATABASE_URL` already existed on Vercel. The application's production
`DATABASE_URL` uses the direct/unpooled connection with full TLS verification,
preserving the worker's session advisory lock. Preview configuration is separate.
The enabled live webhook uses API version `2026-08-26.dahlia` at
`https://www.chickenlegs.wtf/api/stripe/webhook`, matching the canonical APP_URL.
Never test cards against live keys. A signed non-financial production probe passed;
actual payment/provider round trips were tested only in the isolated sandbox.

Neon's free compute allowance is finite. Frequent polling keeps its compute awake;
monitor the project's usage before its allowance is exhausted and choose an
appropriate database plan or event-driven scheduler for sustained operation.
