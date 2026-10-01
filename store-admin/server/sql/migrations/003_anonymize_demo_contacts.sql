WITH demo_customers(old_email, display_name) AS (
  VALUES
    ('minhanh@example.com', 'Khách mẫu 01'),
    ('quocbao@example.com', 'Khách mẫu 02'),
    ('thuha@example.com', 'Khách mẫu 03'),
    ('duclong@example.com', 'Khách mẫu 04'),
    ('ngoclinh@example.com', 'Khách mẫu 05'),
    ('giahuy@example.com', 'Khách mẫu 06'),
    ('thanhmai@example.com', 'Khách mẫu 07'),
    ('nhatnam@example.com', 'Khách mẫu 08')
)
UPDATE customer AS target
SET full_name = demo.display_name,
    gender = NULL,
    date_of_birth = NULL,
    phone = NULL,
    email = NULL,
    address = NULL
FROM demo_customers AS demo
WHERE target.email = demo.old_email;

WITH demo_employees(old_email, display_name) AS (
  VALUES
    ('minhquan.staff@example.com', 'Nhân viên mẫu 01'),
    ('thaovy.staff@example.com', 'Nhân viên mẫu 02'),
    ('hoangphuc.staff@example.com', 'Nhân viên mẫu 03')
)
UPDATE employee AS target
SET full_name = demo.display_name,
    gender = NULL,
    phone = NULL,
    email = NULL,
    address = NULL
FROM demo_employees AS demo
WHERE target.email = demo.old_email;

UPDATE supplier
SET contact_name = NULL,
    phone = NULL,
    email = NULL,
    address = NULL
WHERE supplier_name IN ('Công ty Vải Việt', 'NCC Thời Trang Á Đông');

UPDATE account
SET email = NULL,
    phone = NULL
WHERE username IN ('admin01', 'manager01', 'employee01', 'customer01');
