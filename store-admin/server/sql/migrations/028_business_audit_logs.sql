-- Business audit trail: immutable snapshots of who changed which business object and the outcome.
CREATE TABLE IF NOT EXISTS business_audit_logs (
  audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id INTEGER,
  actor_username TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  request_id UUID,
  status_code INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  source TEXT NOT NULL DEFAULT 'api',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS business_audit_logs_occurred_idx
  ON business_audit_logs (occurred_at DESC, audit_id DESC);
CREATE INDEX IF NOT EXISTS business_audit_logs_actor_idx
  ON business_audit_logs (actor_account_id, occurred_at DESC)
  WHERE actor_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS business_audit_logs_entity_idx
  ON business_audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_audit_logs_action_idx
  ON business_audit_logs (action, occurred_at DESC);
