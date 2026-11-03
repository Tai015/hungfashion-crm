CREATE TABLE account_sessions (
  session_id UUID PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES account(account_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT account_sessions_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX account_sessions_active_account_idx
  ON account_sessions (account_id, expires_at)
  WHERE revoked_at IS NULL;
