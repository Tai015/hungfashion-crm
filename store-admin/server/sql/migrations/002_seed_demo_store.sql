INSERT INTO customer (
  full_name, gender, date_of_birth, phone, email, address,
  loyalty_point, customer_tier, registered_at
)
SELECT seed.full_name, seed.gender, seed.date_of_birth, seed.phone, seed.email,
       seed.address, seed.loyalty_point, seed.customer_tier, NOW() - seed.registered_ago
FROM (VALUES
  ('Khách mẫu 01', NULL::gender_type, NULL::date, NULL, 'demo-customer-01@example.invalid', NULL, 1240, 'Silver', INTERVAL '100 days'),
  ('Khách mẫu 02', NULL::gender_type, NULL, NULL, 'demo-customer-02@example.invalid', NULL, 2580, 'Gold', INTERVAL '200 days'),
  ('Khách mẫu 03', NULL::gender_type, NULL, NULL, 'demo-customer-03@example.invalid', NULL, 550, 'Regular', INTERVAL '35 days'),
  ('Khách mẫu 04', NULL::gender_type, NULL, NULL, 'demo-customer-04@example.invalid', NULL, 5930, 'VIP', INTERVAL '360 days'),
  ('Khách mẫu 05', NULL::gender_type, NULL, NULL, 'demo-customer-05@example.invalid', NULL, 1890, 'Silver', INTERVAL '150 days'),
  ('Khách mẫu 06', NULL::gender_type, NULL, NULL, 'demo-customer-06@example.invalid', NULL, 80, 'New', INTERVAL '5 days'),
  ('Khách mẫu 07', NULL::gender_type, NULL, NULL, 'demo-customer-07@example.invalid', NULL, 3290, 'Gold', INTERVAL '240 days'),
  ('Khách mẫu 08', NULL::gender_type, NULL, NULL, 'demo-customer-08@example.invalid', NULL, 720, 'Regular', INTERVAL '60 days')
) AS seed(full_name, gender, date_of_birth, phone, email, address, loyalty_point, customer_tier, registered_ago)
WHERE NOT EXISTS (SELECT 1 FROM customer existing WHERE existing.email = seed.email);

INSERT INTO employee (full_name, gender, phone, email, address, position, hire_date)
SELECT seed.full_name, seed.gender, seed.phone, seed.email, seed.address, seed.position, seed.hire_date
FROM (VALUES
  ('Nhân viên mẫu 01', NULL::gender_type, NULL, 'demo-staff-01@example.invalid', NULL, 'Quản lý bán hàng', DATE '2023-03-01'),
  ('Nhân viên mẫu 02', NULL::gender_type, NULL, 'demo-staff-02@example.invalid', NULL, 'Nhân viên bán hàng', DATE '2024-06-15'),
  ('Nhân viên mẫu 03', NULL::gender_type, NULL, 'demo-staff-03@example.invalid', NULL, 'Quản lý kho', DATE '2022-11-20')
) AS seed(full_name, gender, phone, email, address, position, hire_date)
WHERE NOT EXISTS (SELECT 1 FROM employee existing WHERE existing.email = seed.email);

INSERT INTO customer_interest (customer_id, interest)
SELECT customer.customer_id, seed.interest
FROM (VALUES
  ('demo-customer-01@example.invalid', 'Áo thun'),
  ('demo-customer-02@example.invalid', 'Quần jean'),
  ('demo-customer-03@example.invalid', 'Váy'),
  ('demo-customer-05@example.invalid', 'Áo sơ mi'),
  ('demo-customer-07@example.invalid', 'Áo khoác')
) AS seed(email, interest)
JOIN customer ON customer.email = seed.email
WHERE NOT EXISTS (
  SELECT 1 FROM customer_interest existing
  WHERE existing.customer_id = customer.customer_id AND existing.interest = seed.interest
);

INSERT INTO product (category_id, product_name, description, import_price, selling_price)
SELECT category.category_id, seed.product_name, seed.description, seed.import_price, seed.selling_price
FROM (VALUES
  ('Áo thun', 'Áo thun cotton basic', 'Cotton mềm, phom regular, phù hợp mặc hằng ngày.', 95000, 195000),
  ('Áo thun', 'Áo thun oversized Urban', 'Phom rộng trẻ trung, chất cotton dày vừa.', 120000, 249000),
  ('Áo sơ mi', 'Áo sơ mi linen Breeze', 'Vải linen thoáng mát, kiểu dáng tối giản.', 210000, 389000),
  ('Quần jean', 'Quần jean straight fit', 'Denim co giãn nhẹ, phom suông cổ điển.', 300000, 549000),
  ('Quần kaki', 'Quần kaki Everyday', 'Vải kaki bền, dễ phối đồ công sở và dạo phố.', 255000, 469000),
  ('Váy', 'Chân váy midi Pleated', 'Chân váy xếp ly dài qua gối.', 230000, 429000),
  ('Áo khoác', 'Áo khoác gió Windline', 'Áo khoác nhẹ có lớp lót, tiện đi mưa nhỏ.', 380000, 699000),
  ('Phụ kiện', 'Túi tote Canvas', 'Túi canvas dày, quai đeo chắc chắn.', 70000, 159000)
) AS seed(category_name, product_name, description, import_price, selling_price)
CROSS JOIN LATERAL (
  SELECT category_id FROM category
  WHERE category_name = seed.category_name AND is_active = TRUE
  ORDER BY category_id LIMIT 1
) AS category
WHERE NOT EXISTS (SELECT 1 FROM product existing WHERE existing.product_name = seed.product_name);

INSERT INTO product_variant (product_id, size_id, color_id, sku, quantity)
SELECT product.product_id, size.size_id, color.color_id, seed.sku, seed.quantity
FROM (VALUES
  ('Áo thun cotton basic', 'M', 'Đen', 'HF-TS001-BLK-M', 24),
  ('Áo thun cotton basic', 'L', 'Trắng', 'HF-TS001-WHT-L', 16),
  ('Áo thun oversized Urban', 'L', 'Xanh Navy', 'HF-TS002-NVY-L', 12),
  ('Áo thun oversized Urban', 'XL', 'Đen', 'HF-TS002-BLK-XL', 10),
  ('Áo sơ mi linen Breeze', 'M', 'Trắng', 'HF-SH001-WHT-M', 14),
  ('Áo sơ mi linen Breeze', 'L', 'Xanh Navy', 'HF-SH001-NVY-L', 12),
  ('Quần jean straight fit', '30', 'Đen', 'HF-JN001-BLK-30', 18),
  ('Quần jean straight fit', '32', 'Xanh Navy', 'HF-JN001-NVY-32', 12),
  ('Quần kaki Everyday', '30', 'Be', 'HF-KH001-BEI-30', 15),
  ('Quần kaki Everyday', '32', 'Xanh Navy', 'HF-KH001-NVY-32', 10),
  ('Chân váy midi Pleated', 'S', 'Be', 'HF-SK001-BEI-S', 12),
  ('Chân váy midi Pleated', 'M', 'Đen', 'HF-SK001-BLK-M', 8),
  ('Áo khoác gió Windline', 'M', 'Xanh Navy', 'HF-JK001-NVY-M', 9),
  ('Áo khoác gió Windline', 'L', 'Đen', 'HF-JK001-BLK-L', 11),
  ('Túi tote Canvas', 'S', 'Nâu', 'HF-AC001-BRN-S', 20),
  ('Túi tote Canvas', 'M', 'Đen', 'HF-AC001-BLK-M', 14)
) AS seed(product_name, size_name, color_name, sku, quantity)
JOIN product ON product.product_name = seed.product_name
JOIN size ON size.size_name = seed.size_name
CROSS JOIN LATERAL (
  SELECT color_id FROM color
  WHERE color_name = seed.color_name
  ORDER BY color_id LIMIT 1
) AS color
WHERE NOT EXISTS (SELECT 1 FROM product_variant existing WHERE existing.sku = seed.sku);

CREATE TEMP TABLE demo_order_seed (
  note TEXT,
  customer_email TEXT,
  employee_email TEXT,
  sku TEXT,
  quantity INT,
  days_ago INT,
  order_status order_status,
  order_channel TEXT
) ON COMMIT DROP;

INSERT INTO demo_order_seed VALUES
  ('DEMO-SEED-2026-001', 'demo-customer-01@example.invalid', 'demo-staff-02@example.invalid', 'HF-TS001-BLK-M', 2, 1, 'Delivered', 'Website'),
  ('DEMO-SEED-2026-002', 'demo-customer-02@example.invalid', 'demo-staff-01@example.invalid', 'HF-JN001-BLK-30', 1, 3, 'Delivered', 'InStore'),
  ('DEMO-SEED-2026-003', 'demo-customer-03@example.invalid', 'demo-staff-02@example.invalid', 'HF-SK001-BEI-S', 1, 5, 'Delivered', 'Website'),
  ('DEMO-SEED-2026-004', 'demo-customer-04@example.invalid', 'demo-staff-01@example.invalid', 'HF-JK001-NVY-M', 1, 8, 'Delivered', 'InStore'),
  ('DEMO-SEED-2026-005', 'demo-customer-05@example.invalid', 'demo-staff-02@example.invalid', 'HF-SH001-WHT-M', 2, 10, 'Shipped', 'Website'),
  ('DEMO-SEED-2026-006', 'demo-customer-06@example.invalid', 'demo-staff-01@example.invalid', 'HF-TS002-NVY-L', 1, 12, 'Shipped', 'InStore'),
  ('DEMO-SEED-2026-007', 'demo-customer-07@example.invalid', 'demo-staff-02@example.invalid', 'HF-KH001-BEI-30', 1, 15, 'Processing', 'Website'),
  ('DEMO-SEED-2026-008', 'demo-customer-08@example.invalid', 'demo-staff-01@example.invalid', 'HF-AC001-BRN-S', 2, 18, 'Confirmed', 'InStore'),
  ('DEMO-SEED-2026-009', 'demo-customer-01@example.invalid', 'demo-staff-02@example.invalid', 'HF-TS001-WHT-L', 1, 22, 'Delivered', 'Website'),
  ('DEMO-SEED-2026-010', 'demo-customer-02@example.invalid', 'demo-staff-01@example.invalid', 'HF-JN001-NVY-32', 1, 27, 'Delivered', 'InStore');

INSERT INTO "order" (
  customer_id, employee_id, order_status, subtotal, discount_amt,
  total_amount, note, order_channel, ordered_at
)
SELECT customer.customer_id, employee.employee_id, seed.order_status,
       product.selling_price * seed.quantity, 0,
       product.selling_price * seed.quantity, seed.note, seed.order_channel,
       NOW() - seed.days_ago * INTERVAL '1 day'
FROM demo_order_seed seed
JOIN customer ON customer.email = seed.customer_email
JOIN employee ON employee.email = seed.employee_email
JOIN product_variant variant ON variant.sku = seed.sku
JOIN product ON product.product_id = variant.product_id
WHERE NOT EXISTS (SELECT 1 FROM "order" existing WHERE existing.note = seed.note);

INSERT INTO order_detail (order_id, variant_id, quantity, unit_price)
SELECT customer_order.order_id, variant.variant_id, seed.quantity, product.selling_price
FROM demo_order_seed seed
JOIN "order" customer_order ON customer_order.note = seed.note
JOIN product_variant variant ON variant.sku = seed.sku
JOIN product ON product.product_id = variant.product_id
WHERE NOT EXISTS (
  SELECT 1 FROM order_detail existing
  WHERE existing.order_id = customer_order.order_id AND existing.variant_id = variant.variant_id
);

INSERT INTO payment (order_id, method, status, amount, transaction_ref, paid_at)
SELECT customer_order.order_id,
       CASE WHEN customer_order.order_id % 2 = 0 THEN 'BankTransfer'::payment_method ELSE 'Cash'::payment_method END,
       'Paid'::payment_status,
       customer_order.total_amount,
       'DEMO-PAY-' || customer_order.note,
       customer_order.ordered_at + INTERVAL '2 hours'
FROM "order" customer_order
JOIN demo_order_seed seed ON seed.note = customer_order.note
ON CONFLICT (order_id) DO NOTHING;

INSERT INTO feedback (customer_id, product_id, order_id, feedback_type, rating, content, status)
SELECT customer.customer_id, product.product_id, customer_order.order_id,
       seed.feedback_type, seed.rating, seed.content, seed.status
FROM (VALUES
  ('demo-customer-01@example.invalid', 'Áo thun cotton basic', 'DEMO-SEED-2026-001', 'Product'::feedback_type, 5, 'Áo mềm, mặc thoải mái và giao hàng nhanh.', 'Resolved'::feedback_status),
  ('demo-customer-02@example.invalid', 'Quần jean straight fit', 'DEMO-SEED-2026-002', 'Product'::feedback_type, 4, 'Form quần đẹp, chất denim co giãn vừa phải.', 'New'::feedback_status),
  ('demo-customer-03@example.invalid', 'Chân váy midi Pleated', 'DEMO-SEED-2026-003', 'Product'::feedback_type, 5, 'Chân váy đúng mô tả, đóng gói cẩn thận.', 'Resolved'::feedback_status),
  ('demo-customer-05@example.invalid', 'Áo sơ mi linen Breeze', 'DEMO-SEED-2026-005', 'Service'::feedback_type, 4, 'Nhân viên tư vấn nhiệt tình.', 'Processing'::feedback_status),
  ('demo-customer-08@example.invalid', 'Túi tote Canvas', 'DEMO-SEED-2026-008', 'Product'::feedback_type, 3, 'Túi đẹp, mong có thêm nhiều màu.', 'New'::feedback_status),
  ('demo-customer-07@example.invalid', 'Áo khoác gió Windline', 'DEMO-SEED-2026-007', 'Suggestion'::feedback_type, 4, 'Nên bổ sung thêm size lớn.', 'New'::feedback_status)
) AS seed(customer_email, product_name, order_note, feedback_type, rating, content, status)
JOIN customer ON customer.email = seed.customer_email
JOIN product ON product.product_name = seed.product_name
JOIN "order" customer_order ON customer_order.note = seed.order_note
WHERE NOT EXISTS (
  SELECT 1 FROM feedback existing
  WHERE existing.order_id = customer_order.order_id AND existing.customer_id = customer.customer_id
);

INSERT INTO survey (created_by, title, description, status, start_date, end_date)
SELECT employee.employee_id, 'Khảo sát trải nghiệm mua sắm tháng 10',
       'Góp ý về chất lượng sản phẩm và trải nghiệm tại Hung Fashion.',
       'Active', CURRENT_DATE - 5, CURRENT_DATE + 25
FROM employee
WHERE employee.email = 'demo-staff-01@example.invalid'
  AND NOT EXISTS (
    SELECT 1 FROM survey WHERE title = 'Khảo sát trải nghiệm mua sắm tháng 10'
  );

INSERT INTO survey_question (survey_id, question_text, question_type, display_order, is_required)
SELECT survey.survey_id, seed.question_text, seed.question_type, seed.display_order, TRUE
FROM survey
CROSS JOIN (VALUES
  ('Bạn hài lòng với chất lượng sản phẩm ở mức nào?', 'Rating'::question_type, 1),
  ('Bạn biết đến cửa hàng qua kênh nào?', 'SingleChoice'::question_type, 2)
) AS seed(question_text, question_type, display_order)
WHERE survey.title = 'Khảo sát trải nghiệm mua sắm tháng 10'
  AND NOT EXISTS (
    SELECT 1 FROM survey_question existing
    WHERE existing.survey_id = survey.survey_id AND existing.question_text = seed.question_text
  );

INSERT INTO survey_option (question_id, option_text, display_order)
SELECT question.question_id, seed.option_text, seed.display_order
FROM survey
JOIN survey_question question ON question.survey_id = survey.survey_id
CROSS JOIN (VALUES
  ('Cửa hàng', 'Cửa hàng', 1),
  ('Mạng xã hội', 'Mạng xã hội', 2),
  ('Bạn bè giới thiệu', 'Bạn bè giới thiệu', 3),
  ('Tìm kiếm trực tuyến', 'Tìm kiếm trực tuyến', 4)
) AS seed(question_text, option_text, display_order)
WHERE survey.title = 'Khảo sát trải nghiệm mua sắm tháng 10'
  AND question.question_text = seed.question_text
  AND NOT EXISTS (
    SELECT 1 FROM survey_option existing
    WHERE existing.question_id = question.question_id AND existing.option_text = seed.option_text
  );