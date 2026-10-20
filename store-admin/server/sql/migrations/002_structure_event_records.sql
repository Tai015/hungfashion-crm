-- Chuyển payload sự kiện cũ thành các cột có cấu trúc.
ALTER TABLE user_events
  ADD COLUMN event_id TEXT,
  ADD COLUMN session_id TEXT,
  ADD COLUMN event_type TEXT,
  ADD COLUMN page TEXT,
  ADD COLUMN section TEXT,
  ADD COLUMN action TEXT,
  ADD COLUMN source_check TEXT,
  ADD COLUMN occurred_at TIMESTAMPTZ;

UPDATE user_events
SET event_id = payload->>'eventId',
    session_id = payload->>'sessionId',
    event_type = COALESCE(NULLIF(payload->>'eventType', ''), NULLIF(payload->>'event', ''), 'unknown'),
    page = payload->>'page',
    section = payload->>'section',
    action = payload->>'event',
    source_check = payload->>'sourceCheck',
    occurred_at = CASE
      WHEN payload->>'occurredAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (payload->>'occurredAt')::timestamptz
      ELSE created_at
    END;

ALTER TABLE user_events
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN occurred_at SET DEFAULT NOW(),
  ALTER COLUMN occurred_at SET NOT NULL,
  DROP COLUMN payload;

CREATE INDEX user_events_type_occurred_idx
  ON user_events (event_type, occurred_at DESC);

ALTER TABLE transactions
  ADD COLUMN event_id TEXT,
  ADD COLUMN session_id TEXT,
  ADD COLUMN event_type TEXT,
  ADD COLUMN transaction_id TEXT,
  ADD COLUMN benchmark_run_id TEXT,
  ADD COLUMN amount NUMERIC(15,2),
  ADD COLUMN currency TEXT,
  ADD COLUMN status TEXT,
  ADD COLUMN item_count INTEGER,
  ADD COLUMN page TEXT,
  ADD COLUMN action TEXT,
  ADD COLUMN producer_source TEXT,
  ADD COLUMN occurred_at TIMESTAMPTZ;

UPDATE transactions
SET event_id = payload->>'eventId',
    session_id = payload->>'sessionId',
    event_type = COALESCE(NULLIF(payload->>'eventType', ''), NULLIF(payload->>'event', ''), 'unknown'),
    transaction_id = payload->>'transactionId',
    benchmark_run_id = payload->>'benchmarkRunId',
    amount = CASE
      WHEN payload->>'amount' ~ '^[+-]?[0-9]+([.][0-9]+)?$'
        THEN (payload->>'amount')::numeric
      ELSE NULL
    END,
    currency = payload->>'currency',
    status = payload->>'status',
    item_count = CASE
      WHEN payload->>'itemCount' ~ '^[0-9]+$' THEN (payload->>'itemCount')::integer
      ELSE NULL
    END,
    page = payload->>'page',
    action = payload->>'event',
    producer_source = payload->>'source',
    occurred_at = CASE
      WHEN payload->>'occurredAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        THEN (payload->>'occurredAt')::timestamptz
      ELSE created_at
    END;

ALTER TABLE transactions
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN occurred_at SET DEFAULT NOW(),
  ALTER COLUMN occurred_at SET NOT NULL,
  DROP COLUMN payload;

CREATE INDEX transactions_type_occurred_idx
  ON transactions (event_type, occurred_at DESC);
CREATE INDEX transactions_transaction_id_idx
  ON transactions (transaction_id);
