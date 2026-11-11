-- Repair installations where order_confirmation_email existed before 027
-- and CREATE TABLE IF NOT EXISTS therefore did not add the payload column.
-- Keep it nullable so legacy queue rows remain intact; new application inserts
-- continue to provide a complete JSONB snapshot.
ALTER TABLE order_confirmation_email
  ADD COLUMN IF NOT EXISTS payload JSONB;
