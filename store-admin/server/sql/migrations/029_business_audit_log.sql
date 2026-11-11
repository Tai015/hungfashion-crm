-- Durable business audit trail, separate from Kafka user_events.
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id BIGINT,
  actor_username TEXT NOT NULL DEFAULT 'unknown',
  actor_role TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  object_type TEXT NOT NULL,
  object_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  http_method VARCHAR(10) NOT NULL,
  http_status SMALLINT NOT NULL CHECK (http_status BETWEEN 100 AND 599),
  route TEXT NOT NULL,
  request_id UUID,
  changed_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_occurred_at_idx
  ON audit_logs (occurred_at DESC, audit_id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx
  ON audit_logs (actor_account_id, occurred_at DESC, audit_id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_object_idx
  ON audit_logs (object_type, object_id, occurred_at DESC, audit_id DESC);
CREATE INDEX IF NOT EXISTS audit_logs_outcome_idx
  ON audit_logs (outcome, occurred_at DESC, audit_id DESC);

-- Audit history is append-only through application APIs; no update/delete endpoint is exposed.
