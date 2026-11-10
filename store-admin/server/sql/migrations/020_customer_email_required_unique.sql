-- Email khách hàng là định danh bắt buộc để đối chiếu hồ sơ khi đăng ký tài khoản.
-- Không tự tạo email thay thế: nếu dữ liệu cũ thiếu hoặc trùng email sau chuẩn hóa,
-- migration dừng và báo rõ để dữ liệu được xử lý có chủ đích.

DO $$
DECLARE
  missing_count INTEGER;
  duplicate_groups INTEGER;
  sample_duplicates TEXT;
BEGIN
  UPDATE customer
  SET email = LOWER(BTRIM(email))
  WHERE email IS NOT NULL
    AND email IS DISTINCT FROM LOWER(BTRIM(email));

  SELECT COUNT(*) INTO missing_count
  FROM customer
  WHERE email IS NULL OR BTRIM(email) = '';

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Migration 020 bị dừng: có % hồ sơ khách hàng thiếu email. Hãy bổ sung email thực trước khi chạy lại.',
      missing_count;
  END IF;

  SELECT COUNT(*) INTO duplicate_groups
  FROM (
    SELECT LOWER(BTRIM(email))
    FROM customer
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_groups > 0 THEN
    SELECT STRING_AGG(email_group, '; ')
    INTO sample_duplicates
    FROM (
      SELECT FORMAT('%s (customer_id: %s)',
                    LOWER(BTRIM(email)),
                    STRING_AGG(customer_id::TEXT, ', ' ORDER BY customer_id)) AS email_group
      FROM customer
      GROUP BY LOWER(BTRIM(email))
      HAVING COUNT(*) > 1
      ORDER BY LOWER(BTRIM(email))
      LIMIT 10
    ) samples;

    RAISE EXCEPTION
      'Migration 020 bị dừng: có % nhóm email trùng sau chuẩn hóa. Ví dụ: %. Hãy xác minh và xử lý hồ sơ trùng trước khi chạy lại.',
      duplicate_groups,
      COALESCE(sample_duplicates, '(không có dữ liệu mẫu)');
  END IF;
END $$;

ALTER TABLE customer
  ALTER COLUMN email SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_email_unique_idx
  ON customer (LOWER(BTRIM(email)));
