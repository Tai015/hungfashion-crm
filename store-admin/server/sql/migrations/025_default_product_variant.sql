ALTER TABLE product_variant
  ALTER COLUMN size_id DROP NOT NULL,
  ALTER COLUMN color_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_variant_default_attributes_check'
      AND conrelid = 'product_variant'::regclass
  ) THEN
    ALTER TABLE product_variant
      ADD CONSTRAINT product_variant_default_attributes_check
      CHECK (NOT is_default OR (size_id IS NULL AND color_id IS NULL));
  END IF;
END $;

CREATE UNIQUE INDEX IF NOT EXISTS variant_one_default_per_product_idx
  ON product_variant(product_id) WHERE is_default = TRUE;

-- Preserve existing variant IDs, quantities, order details and stock receipt links.
INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity, is_default)
SELECT p.product_id, NULL, NULL, 'DEFAULT-' || p.product_id::text, 0, TRUE
FROM product p
WHERE NOT EXISTS (SELECT 1 FROM product_variant pv WHERE pv.product_id = p.product_id);
