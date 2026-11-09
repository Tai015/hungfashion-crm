-- Keep historical rows: invalid/non-UUID legacy event identifiers become NULL.
-- No foreign keys are added so the event mirror remains decoupled from live records.
ALTER TABLE transactions
  ALTER COLUMN event_id TYPE UUID
  USING CASE
    WHEN event_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN event_id::uuid
    ELSE NULL
  END;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS order_id BIGINT,
  ADD COLUMN IF NOT EXISTS payment_id BIGINT,
  ADD COLUMN IF NOT EXISTS customer_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_event_id_unique_idx
  ON transactions (event_id);

CREATE INDEX IF NOT EXISTS transactions_order_id_idx
  ON transactions (order_id);
