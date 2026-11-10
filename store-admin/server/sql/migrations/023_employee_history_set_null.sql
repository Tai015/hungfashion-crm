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

-- Capture the employee name automatically for all future records as well.
CREATE OR REPLACE FUNCTION snapshot_import_receipt_employee_name() RETURNS trigger AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    SELECT full_name INTO NEW.employee_name_snapshot
    FROM employee WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_snapshot_import_receipt_employee_name ON import_receipt;
CREATE TRIGGER trg_snapshot_import_receipt_employee_name
BEFORE INSERT OR UPDATE OF employee_id ON import_receipt
FOR EACH ROW EXECUTE FUNCTION snapshot_import_receipt_employee_name();

CREATE OR REPLACE FUNCTION snapshot_promotion_creator_name() RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT full_name INTO NEW.created_by_name_snapshot
    FROM employee WHERE employee_id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_snapshot_promotion_creator_name ON promotion;
CREATE TRIGGER trg_snapshot_promotion_creator_name
BEFORE INSERT OR UPDATE OF created_by ON promotion
FOR EACH ROW EXECUTE FUNCTION snapshot_promotion_creator_name();

CREATE OR REPLACE FUNCTION snapshot_feedback_employee_name() RETURNS trigger AS $$
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    SELECT full_name INTO NEW.employee_name_snapshot
    FROM employee WHERE employee_id = NEW.employee_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_snapshot_feedback_employee_name ON feedback;
CREATE TRIGGER trg_snapshot_feedback_employee_name
BEFORE INSERT OR UPDATE OF employee_id ON feedback
FOR EACH ROW EXECUTE FUNCTION snapshot_feedback_employee_name();

CREATE OR REPLACE FUNCTION snapshot_survey_creator_name() RETURNS trigger AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT full_name INTO NEW.created_by_name_snapshot
    FROM employee WHERE employee_id = NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_snapshot_survey_creator_name ON survey;
CREATE TRIGGER trg_snapshot_survey_creator_name
BEFORE INSERT OR UPDATE OF created_by ON survey
FOR EACH ROW EXECUTE FUNCTION snapshot_survey_creator_name();
