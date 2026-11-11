-- Soft deletion / privacy-preserving anonymization for customer records.
-- Keep customer_id stable so orders, feedback, surveys and other history remain linked.
ALTER TABLE customer
  ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX customer_active_records_idx
  ON customer (customer_id)
  WHERE deleted_at IS NULL;
