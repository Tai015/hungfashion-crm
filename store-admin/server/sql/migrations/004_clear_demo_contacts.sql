UPDATE customer
SET email = NULL
WHERE email LIKE 'demo-customer-%@example.invalid';

UPDATE employee
SET email = NULL
WHERE email LIKE 'demo-staff-%@example.invalid';

UPDATE supplier
SET supplier_name = CASE
      WHEN supplier_name IN ('Công ty Vải Việt', 'Nhà cung cấp mẫu 01') THEN 'Nhà cung cấp mẫu 01'
      ELSE 'Nhà cung cấp mẫu 02'
    END,
    contact_name = NULL,
    phone = NULL,
    email = NULL,
    address = NULL
WHERE supplier_name IN (
  'Công ty Vải Việt',
  'NCC Thời Trang Á Đông',
  'Nhà cung cấp mẫu 01',
  'Nhà cung cấp mẫu 02'
);

UPDATE account
SET email = NULL,
    phone = NULL
WHERE username IN ('admin01', 'manager01', 'employee01', 'customer01');
