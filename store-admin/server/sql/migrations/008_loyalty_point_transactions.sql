ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_discount NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS loyalty_point_transaction (
  loyalty_transaction_id BIGSERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES "order"(order_id) ON DELETE SET NULL,
  transaction_type VARCHAR(32) NOT NULL CHECK (transaction_type IN (
    'OpeningBalance', 'Earned', 'Redeemed', 'RedeemedReturned', 'EarnReversed'
  )),
  points_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS loyalty_point_transaction_customer_created_idx
  ON loyalty_point_transaction(customer_id, created_at DESC, loyalty_transaction_id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_point_transaction_order_type_idx
  ON loyalty_point_transaction(order_id, transaction_type)
  WHERE order_id IS NOT NULL;

INSERT INTO loyalty_point_transaction (customer_id, transaction_type, points_delta, balance_after, note)
SELECT customer_id, 'OpeningBalance', loyalty_point, loyalty_point, 'Số dư điểm trước khi bật lịch sử giao dịch'
FROM customer
WHERE loyalty_point <> 0
ON CONFLICT DO NOTHING;
