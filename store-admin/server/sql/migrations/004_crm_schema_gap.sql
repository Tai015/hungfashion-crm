-- Bổ sung các thành phần CRM còn thiếu cho database cũ.

CREATE TABLE IF NOT EXISTS permission (
  permission_id   SERIAL       PRIMARY KEY,
  permission_code VARCHAR(80)  NOT NULL UNIQUE,
  description     TEXT
);

CREATE TABLE IF NOT EXISTS role_permission (
  role_id       INT NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  permission_id INT NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO role (role_name, description) VALUES
  ('ADMIN',          'Quản trị toàn bộ hệ thống'),
  ('QL_NHAN_SU',     'Quản lý nhân sự'),
  ('QL_KHO',         'Quản lý kho'),
  ('QL_BAN_HANG',    'Quản lý bán hàng'),
  ('QL_KHACH_HANG',  'Quản lý khách hàng (CRM)'),
  ('KHACH_HANG',     'Khách hàng')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO permission (permission_code, description) VALUES
  ('account.manage',   'Thêm, xóa, khóa/mở và phân quyền tài khoản'),
  ('product.manage',   'Quản lý sản phẩm, danh mục, thương hiệu'),
  ('supplier.manage',  'Quản lý nhà cung cấp'),
  ('inventory.manage', 'Phiếu nhập/xuất và tồn kho'),
  ('order.manage',     'Đơn hàng và thanh toán'),
  ('customer.manage',  'Khách hàng, phản hồi, khảo sát CRM'),
  ('hr.manage',        'Hồ sơ nhân sự'),
  ('report.view',      'Xem báo cáo thống kê'),
  ('catalog.browse',   'Xem sản phẩm'),
  ('profile.update',   'Sửa thông tin cá nhân'),
  ('feedback.create',  'Gửi phản hồi sản phẩm'),
  ('survey.respond',   'Nhận và trả lời khảo sát')
ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM role r
JOIN permission p ON
  (r.role_name = 'ADMIN')
  OR (r.role_name = 'QL_NHAN_SU' AND p.permission_code IN ('hr.manage', 'report.view'))
  OR (r.role_name = 'QL_KHO' AND p.permission_code IN ('inventory.manage', 'product.manage', 'supplier.manage', 'report.view'))
  OR (r.role_name = 'QL_BAN_HANG' AND p.permission_code IN ('order.manage', 'product.manage', 'report.view'))
  OR (r.role_name = 'QL_KHACH_HANG' AND p.permission_code IN ('customer.manage', 'report.view'))
  OR (r.role_name = 'KHACH_HANG' AND p.permission_code IN ('catalog.browse', 'profile.update', 'feedback.create', 'survey.respond'))
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS brand (
  brand_id    SERIAL       PRIMARY KEY,
  brand_name  VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

ALTER TABLE product ADD COLUMN IF NOT EXISTS brand_id INT REFERENCES brand(brand_id);
ALTER TABLE product ADD COLUMN IF NOT EXISTS supplier_id INT REFERENCES supplier(supplier_id);
CREATE INDEX IF NOT EXISTS product_brand_idx ON product(brand_id);
CREATE INDEX IF NOT EXISTS product_supplier_idx ON product(supplier_id);

ALTER TABLE product_variant
  ADD COLUMN IF NOT EXISTS selling_price NUMERIC(15,2);

CREATE TABLE IF NOT EXISTS product_image (
  image_id      SERIAL       PRIMARY KEY,
  product_id    INT          NOT NULL REFERENCES product(product_id) ON DELETE CASCADE,
  image_url     TEXT         NOT NULL,
  is_primary    BOOLEAN      NOT NULL DEFAULT FALSE,
  display_order SMALLINT     NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS product_image_product_idx ON product_image(product_id);

INSERT INTO product_image (product_id, image_url, is_primary, display_order)
SELECT product_id, image_url, TRUE, 1
FROM product
WHERE image_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM product_image existing WHERE existing.product_id = product.product_id
  );

CREATE TABLE IF NOT EXISTS interest (
  interest_id   SERIAL       PRIMARY KEY,
  interest_name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO interest (interest_name) VALUES
  ('Áo thun'), ('Áo sơ mi'), ('Áo khoác'), ('Quần jean'),
  ('Quần kaki'), ('Váy'), ('Phụ kiện'), ('Giày dép')
ON CONFLICT (interest_name) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_interest'
      AND column_name = 'interest'
  ) THEN
    INSERT INTO interest (interest_name)
    SELECT DISTINCT interest FROM customer_interest
    WHERE interest IS NOT NULL
    ON CONFLICT (interest_name) DO NOTHING;

    CREATE TABLE IF NOT EXISTS customer_interest_map (
      customer_id INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
      interest_id INT NOT NULL REFERENCES interest(interest_id) ON DELETE CASCADE,
      PRIMARY KEY (customer_id, interest_id)
    );

    INSERT INTO customer_interest_map (customer_id, interest_id)
    SELECT ci.customer_id, i.interest_id
    FROM customer_interest ci
    JOIN interest i ON i.interest_name = ci.interest
    ON CONFLICT DO NOTHING;

    DROP TABLE customer_interest;
    ALTER TABLE customer_interest_map RENAME TO customer_interest;
    CREATE INDEX IF NOT EXISTS customer_interest_cust_idx ON customer_interest(customer_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS survey_invitation (
  invitation_id SERIAL        PRIMARY KEY,
  survey_id     INT           NOT NULL REFERENCES survey(survey_id) ON DELETE CASCADE,
  customer_id   INT           NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  invited_by    INT           REFERENCES employee(employee_id) ON DELETE SET NULL,
  status        VARCHAR(20)   NOT NULL DEFAULT 'Sent'
                  CHECK (status IN ('Sent', 'Opened', 'Completed')),
  invited_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (survey_id, customer_id)
);
CREATE INDEX IF NOT EXISTS survey_invitation_customer_idx ON survey_invitation(customer_id);
