-- Chuẩn hóa giới tính khách hàng: hồ sơ cũ chưa có thông tin được xếp vào "Other".
-- Cột vẫn cho phép NULL về mặt dữ liệu cũ chỉ trước migration; sau migration dùng DEFAULT.
UPDATE customer
SET gender = 'Other'
WHERE gender IS NULL;

ALTER TABLE customer
  ALTER COLUMN gender SET DEFAULT 'Other';
