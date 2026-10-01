CREATE TABLE IF NOT EXISTS outbox_events (
  event_id      TEXT PRIMARY KEY,
  topic         TEXT NOT NULL CHECK (topic IN ('user-events', 'transaction-events')),
  partition_key TEXT,
  payload       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS outbox_events_unpublished_idx
  ON outbox_events (created_at, event_id)
  WHERE published_at IS NULL;

ALTER TABLE user_events
  ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_events_event_id_unique_idx
  ON user_events (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_event_id_unique_idx
  ON transactions (event_id);
