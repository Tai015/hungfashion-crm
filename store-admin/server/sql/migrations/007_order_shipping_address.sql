ALTER TABLE "order"
  ADD COLUMN IF NOT EXISTS shipping_address TEXT;
