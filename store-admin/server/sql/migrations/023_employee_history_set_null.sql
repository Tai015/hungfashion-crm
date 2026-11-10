-- Keep the actor's display name in business records after their employee profile is removed.
ALTER TABLE import_receipt ADD COLUMN IF NOT EXISTS employee_name_snapshot VARCHAR(200);
UPDATE import_receipt r
SET employee_name_snapshot = e.full_name
FROM employee e
WHERE r.employee_id = e.employee_id AND r.employee_name_snapshot IS NULL;

ALTER TABLE promotion ADD COLUMN IF NOT EXISTS created_by_name_snapshot VARCHAR(200);
UPDATE promotion p
SET created_by_name_snapshot = e.full_name
FROM employee e
WHERE p.created_by = e.employee_id AND p.created_by_name_snapshot IS NULL;

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS employee_name_snapshot VARCHAR(200);
UPDATE feedback f
SET employee_name_snapshot = e.full_name
FROM employee e
WHERE f.employee_id = e.employee_id AND f.employee_name_snapshot IS NULL;

ALTER TABLE survey ADD COLUMN IF NOT EXISTS created_by_name_snapshot VARCHAR(200);
UPDATE survey s
SET created_by_name_snapshot = e.full_name
FROM employee e
WHERE s.created_by = e.employee_id AND s.created_by_name_snapshot IS NULL;

-- Preserve historical references while allowing inactive employee profiles to be removed.
ALTER TABLE import_receipt
  DROP CONSTRAINT IF EXISTS import_receipt_employee_id_fkey;
ALTER TABLE import_receipt
  ADD CONSTRAINT import_receipt_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES employee(employee_id) ON DELETE SET NULL;

ALTER TABLE promotion
  DROP CONSTRAINT IF EXISTS promotion_created_by_fkey;
ALTER TABLE promotion
  ADD CONSTRAINT promotion_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES employee(employee_id) ON DELETE SET NULL;
