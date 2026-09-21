BEGIN;
CREATE TABLE IF NOT EXISTS campaign_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO campaign_state (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS auction_slots (
  id text PRIMARY KEY CHECK (id IN ('left-quad','right-quad','left-hamstring','right-hamstring','left-calf','right-calf')),
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  current_bid_id uuid,
  current_amount integer NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  reservation_id uuid,
  needs_review boolean NOT NULL DEFAULT false
);
INSERT INTO auction_slots (id) VALUES ('left-quad'),('right-quad'),('left-hamstring'),('right-hamstring'),('left-calf'),('right-calf') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY,
  request_key uuid UNIQUE NOT NULL,
  request_hash text NOT NULL,
  slot_id text NOT NULL REFERENCES auction_slots(id),
  slot_version integer NOT NULL,
  amount integer NOT NULL CHECK (amount > 0 AND amount <= 99999999),
  currency text NOT NULL DEFAULT 'usd' CHECK (currency = 'usd'),
  sponsor_name text NOT NULL,
  sponsor_email text NOT NULL,
  sponsor_website text NOT NULL,
  logo_url text,
  terms_version text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','refunding','expired','review')),
  session_id text UNIQUE,
  payment_intent_id text UNIQUE,
  checkout_params jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  release_after timestamptz NOT NULL,
  accepted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_email ON reservations (sponsor_email) WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY,
  reservation_id uuid UNIQUE NOT NULL REFERENCES reservations(id),
  slot_id text NOT NULL REFERENCES auction_slots(id),
  amount integer NOT NULL CHECK (amount > 0),
  sponsor_name text NOT NULL,
  sponsor_website text NOT NULL,
  logo_url text,
  payment_intent_id text UNIQUE NOT NULL,
  success_event_id text UNIQUE NOT NULL,
  accepted_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('current','outbid')),
  disputed boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS one_current_bid ON bids(slot_id) WHERE status = 'current';

CREATE TABLE IF NOT EXISTS refund_obligations (
  id uuid PRIMARY KEY,
  reservation_id uuid UNIQUE NOT NULL REFERENCES reservations(id),
  payment_intent_id text UNIQUE NOT NULL,
  reason text NOT NULL CHECK (reason IN ('outbid','invalid_payment')),
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','waiting_for_fee','submitted','pending','succeeded','review')),
  amount integer,
  fee_amount integer,
  fee_evidence jsonb,
  stripe_refund_id text UNIQUE,
  submitted_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  created bigint NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  unique_key text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('event','reservation','refund')),
  entity_id text NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','done','review')),
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(state, run_after);

CREATE TABLE IF NOT EXISTS request_limits (
  key text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  action text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
