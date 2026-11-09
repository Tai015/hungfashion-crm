-- Preserve pre-existing text event identifiers before enforcing UUID format.
-- No foreign keys are added so the event mirror remains decoupled from live records.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS legacy_event_id TEXT;

UPDATE transactions
SET legacy_event_id = event_id
WHERE event_id IS NOT NULL
  AND event_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
  ALTER COLUMN event_id TYPE UUID
  USING CASE
    WHEN event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN event_id::uuid
    ELSE NULL
  END;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS order_id INTEGER,
  ADD COLUMN IF NOT EXISTS payment_id INTEGER,
  ADD COLUMN IF NOT EXISTS customer_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_event_id_unique_idx
  ON transactions (event_id);

CREATE INDEX IF NOT EXISTS transactions_order_id_idx
  ON transactions (order_id);

  AND legacy_event_id IS NULL;

ALTER TABLE transactions
  ALTER COLUMN event_id TYPE UUID
  USING CASE
    WHEN event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN event_id::uuid
    ELSE NULL
  END;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS order_id INTEGER,
  ADD COLUMN IF NOT EXISTS payment_id INTEGER,
  ADD COLUMN IF NOT EXISTS customer_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_event_id_unique_idx
  ON transactions (event_id);

CREATE INDEX IF NOT EXISTS transactions_order_id_idx
  ON transactions (order_id);
