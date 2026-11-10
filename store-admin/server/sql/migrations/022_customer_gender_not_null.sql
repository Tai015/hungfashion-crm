-- Enforce a non-null customer gender after the legacy NULL values were normalized in migration 021.
UPDATE customer
SET gender = 'Other'
WHERE gender IS NULL;

ALTER TABLE customer
  ALTER COLUMN gender SET DEFAULT 'Other',
  ALTER COLUMN gender SET NOT NULL;
