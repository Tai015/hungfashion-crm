-- Separate the redeemable balance from lifetime points used for membership tiers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer' AND column_name='loyalty_point'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='customer' AND column_name='points_balance'
  ) THEN
    ALTER TABLE customer RENAME COLUMN loyalty_point TO points_balance;
  END IF;
END $$;

ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_points INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS customer_lifetime_points_idx ON customer(lifetime_points);

CREATE OR REPLACE FUNCTION customer_tier_for_points(p_points INTEGER)
RETURNS VARCHAR(20)
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN COALESCE(p_points, 0) >= 100000 THEN 'VIP'
    WHEN COALESCE(p_points, 0) >= 20000 THEN 'Gold'
    WHEN COALESCE(p_points, 0) >= 5000 THEN 'Silver'
    WHEN COALESCE(p_points, 0) >= 1000 THEN 'Regular'
    ELSE 'New'
  END::VARCHAR(20);
$$;

-- Snapshot valid paid-order earnings so future refunds can reverse older orders
-- even when their original point-ledger entry is missing.
UPDATE "order" o
SET loyalty_points_earned = FLOOR(GREATEST(COALESCE(p.amount, 0), 0) / 10000)::INTEGER
FROM payment p
WHERE p.order_id = o.order_id
  AND p.status = 'Paid'
  AND o.order_status NOT IN ('Cancelled', 'Refunded')
  AND o.loyalty_points_earned = 0;

WITH order_earnings AS (
  SELECT customer_id, COALESCE(SUM(loyalty_points_earned), 0)::INTEGER AS points
  FROM "order"
  WHERE customer_id IS NOT NULL
  GROUP BY customer_id
),
ledger_earnings AS (
  SELECT customer_id,
         GREATEST(0, COALESCE(SUM(points_delta) FILTER (
           WHERE transaction_type IN ('OpeningBalance', 'Earned', 'EarnReversed')
         ), 0))::INTEGER AS points
  FROM loyalty_point_transaction
  GROUP BY customer_id
),
reconstructed AS (
  SELECT c.customer_id,
         GREATEST(COALESCE(c.points_balance, 0),
                  COALESCE(o.points, 0),
                  COALESCE(l.points, 0))::INTEGER AS lifetime_points
  FROM customer c
  LEFT JOIN order_earnings o USING (customer_id)
  LEFT JOIN ledger_earnings l USING (customer_id)
)
UPDATE customer c
SET lifetime_points = r.lifetime_points,
    customer_tier = customer_tier_for_points(r.lifetime_points),
    updated_at = NOW()
FROM reconstructed r
WHERE r.customer_id = c.customer_id;

CREATE OR REPLACE FUNCTION sync_customer_tier_from_lifetime_points()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND COALESCE(NEW.lifetime_points, 0) = 0
     AND COALESCE(NEW.points_balance, 0) > 0 THEN
    NEW.lifetime_points := NEW.points_balance;
  END IF;
  NEW.customer_tier := customer_tier_for_points(NEW.lifetime_points);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_sync_tier_from_lifetime_points ON customer;
CREATE TRIGGER customer_sync_tier_from_lifetime_points
BEFORE INSERT OR UPDATE OF lifetime_points, customer_tier ON customer
FOR EACH ROW
EXECUTE FUNCTION sync_customer_tier_from_lifetime_points();

UPDATE customer
SET customer_tier = customer_tier_for_points(lifetime_points);
