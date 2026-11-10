-- Preserve historical records while allowing inactive employee profiles to be removed.
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
