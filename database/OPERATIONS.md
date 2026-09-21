# Payment operations

This implementation is disabled until configured. Unit tests use synthetic data;
PostgreSQL tests require `TEST_DATABASE_URL`. A real sandbox payment, webhook,
takeover and refund round trip is still a launch requirement. A supplied live key
is not a substitute for sandbox credentials. No financial API call is part of
`npm test`.

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
5. Poll authenticated `/api/internal/status` for review jobs, stalled reservations,
   disputed placements and refund status. Alert on review jobs and worker
   inactivity. Do not switch on checkout before scheduling and monitoring work.

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
Do not manually refund a payment without reconciling its existing obligation.

Outstanding before real launch: configure/test real PostgreSQL and a Stripe
sandbox; complete full payment/concurrency/dispute recovery tests; add an
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
