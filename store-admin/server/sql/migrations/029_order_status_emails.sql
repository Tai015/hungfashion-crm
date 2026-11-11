-- Allow one durable email per order lifecycle event.
ALTER TABLE order_confirmation_email
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(40) NOT NULL DEFAULT 'order_confirmation';

ALTER TABLE order_confirmation_email
  DROP CONSTRAINT IF EXISTS order_confirmation_email_order_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS order_confirmation_email_order_event_uidx
  ON order_confirmation_email (order_id, event_type);

CREATE INDEX IF NOT EXISTS order_confirmation_email_event_queue_idx
  ON order_confirmation_email (status, next_attempt_at, email_id)
  WHERE status IN ('queued', 'failed', 'sending');

ALTER TABLE order_confirmation_email_attempt
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(40) NOT NULL DEFAULT 'order_confirmation';
