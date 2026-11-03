CREATE TABLE demo_payment_tokens (
  demo_payment_token_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id INT NOT NULL UNIQUE REFERENCES "order" (order_id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX demo_payment_tokens_expiry_idx
  ON demo_payment_tokens (expires_at)
  WHERE used_at IS NULL;
