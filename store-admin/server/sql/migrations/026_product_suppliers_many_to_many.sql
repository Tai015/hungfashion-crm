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

DROP INDEX IF EXISTS product_supplier_idx;
ALTER TABLE product DROP COLUMN IF EXISTS supplier_id;

CREATE INDEX IF NOT EXISTS product_supplier_supplier_idx
  ON product_supplier(supplier_id);

COMMIT;
