BEGIN;

-- A product can be supplied by multiple vendors. Preserve the legacy
-- product.supplier_id relationship before removing the single-supplier column.
CREATE TABLE IF NOT EXISTS product_supplier (
  product_id  INT NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  supplier_id INT NOT NULL REFERENCES supplier(supplier_id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, supplier_id)
);

INSERT INTO product_supplier (product_id, supplier_id)
SELECT product_id, supplier_id
FROM product
WHERE supplier_id IS NOT NULL
ON CONFLICT (product_id, supplier_id) DO NOTHING;

-- Backfill supplier relationships from historical effective import receipts.
-- Receipts are recorded as effective on creation; cancelled/draft states do not exist
-- in the current schema. Keep these links even if a receipt is later voided.
INSERT INTO product_supplier (product_id, supplier_id)
SELECT DISTINCT pv.product_id, ir.supplier_id
FROM import_receipt ir
JOIN import_detail id ON id.receipt_id = ir.receipt_id
JOIN product_variant pv ON pv.variant_id = id.variant_id
WHERE ir.receipt_type = 'Import'
  AND ir.supplier_id IS NOT NULL
ON CONFLICT (product_id, supplier_id) DO NOTHING;

DROP INDEX IF EXISTS product_supplier_idx;
ALTER TABLE product DROP COLUMN IF EXISTS supplier_id;

CREATE INDEX IF NOT EXISTS product_supplier_supplier_idx
  ON product_supplier(supplier_id);

COMMIT;
