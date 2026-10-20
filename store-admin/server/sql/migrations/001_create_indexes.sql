-- Tạo index phục vụ tìm kiếm, lọc, sắp xếp và báo cáo CRM.

-- Tài khoản / nhân sự
CREATE INDEX IF NOT EXISTS account_role_idx ON account(role_id);
CREATE INDEX IF NOT EXISTS account_status_idx ON account(status);
CREATE INDEX IF NOT EXISTS account_created_at_idx ON account(created_at DESC);
CREATE INDEX IF NOT EXISTS account_email_idx ON account(email);
CREATE INDEX IF NOT EXISTS employee_active_idx ON employee(is_active);
CREATE INDEX IF NOT EXISTS employee_name_idx ON employee(full_name);

-- Khách hàng, sở thích, báo cáo độ tuổi/giới tính
CREATE INDEX IF NOT EXISTS customer_tier_idx ON customer(customer_tier);
CREATE INDEX IF NOT EXISTS customer_phone_idx ON customer(phone);
CREATE INDEX IF NOT EXISTS customer_gender_idx ON customer(gender);
CREATE INDEX IF NOT EXISTS customer_dob_idx ON customer(date_of_birth);
CREATE INDEX IF NOT EXISTS customer_email_idx ON customer(email);
CREATE INDEX IF NOT EXISTS customer_name_idx ON customer(full_name);
CREATE INDEX IF NOT EXISTS customer_interest_cust_idx ON customer_interest(customer_id);
CREATE INDEX IF NOT EXISTS customer_interest_interest_idx ON customer_interest(interest_id);

-- Danh mục, thương hiệu, nhà cung cấp, sản phẩm
CREATE INDEX IF NOT EXISTS category_parent_idx ON category(parent_id);
CREATE INDEX IF NOT EXISTS category_active_idx ON category(is_active);
CREATE INDEX IF NOT EXISTS brand_active_idx ON brand(is_active);
CREATE INDEX IF NOT EXISTS supplier_name_idx ON supplier(supplier_name);
CREATE INDEX IF NOT EXISTS supplier_active_idx ON supplier(is_active);
CREATE INDEX IF NOT EXISTS product_category_idx ON product(category_id);
CREATE INDEX IF NOT EXISTS product_brand_idx ON product(brand_id);
CREATE INDEX IF NOT EXISTS product_supplier_idx ON product(supplier_id);
CREATE INDEX IF NOT EXISTS product_active_idx ON product(is_active);
CREATE INDEX IF NOT EXISTS product_price_idx ON product(selling_price);
CREATE INDEX IF NOT EXISTS product_created_at_idx ON product(created_at DESC);
CREATE INDEX IF NOT EXISTS product_name_idx ON product USING GIN (to_tsvector('simple', product_name));
CREATE INDEX IF NOT EXISTS variant_product_idx ON product_variant(product_id);
CREATE INDEX IF NOT EXISTS variant_size_idx ON product_variant(size_id);
CREATE INDEX IF NOT EXISTS variant_color_idx ON product_variant(color_id);
CREATE INDEX IF NOT EXISTS variant_active_idx ON product_variant(is_active);
CREATE INDEX IF NOT EXISTS product_image_product_idx ON product_image(product_id);

-- Kho, đơn hàng
CREATE INDEX IF NOT EXISTS receipt_date_idx ON import_receipt(receipt_date DESC);
CREATE INDEX IF NOT EXISTS receipt_supplier_idx ON import_receipt(supplier_id);
CREATE INDEX IF NOT EXISTS receipt_employee_idx ON import_receipt(employee_id);
CREATE INDEX IF NOT EXISTS import_detail_receipt_idx ON import_detail(receipt_id);
CREATE INDEX IF NOT EXISTS import_detail_variant_idx ON import_detail(variant_id);
CREATE INDEX IF NOT EXISTS order_customer_idx ON "order"(customer_id);
CREATE INDEX IF NOT EXISTS order_status_idx ON "order"(order_status);
CREATE INDEX IF NOT EXISTS order_date_idx ON "order"(ordered_at DESC);
CREATE INDEX IF NOT EXISTS order_employee_idx ON "order"(employee_id);
CREATE INDEX IF NOT EXISTS order_detail_order_idx ON order_detail(order_id);
CREATE INDEX IF NOT EXISTS order_detail_variant_idx ON order_detail(variant_id);
CREATE INDEX IF NOT EXISTS payment_order_idx ON payment(order_id);
CREATE INDEX IF NOT EXISTS payment_status_idx ON payment(status);

-- Phản hồi, khảo sát
CREATE INDEX IF NOT EXISTS feedback_customer_idx ON feedback(customer_id);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback(status);
CREATE INDEX IF NOT EXISTS feedback_product_idx ON feedback(product_id);
CREATE INDEX IF NOT EXISTS feedback_rating_idx ON feedback(rating);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS survey_status_idx ON survey(status);
CREATE INDEX IF NOT EXISTS survey_created_at_idx ON survey(created_at DESC);
CREATE INDEX IF NOT EXISTS sq_survey_idx ON survey_question(survey_id);
CREATE INDEX IF NOT EXISTS so_question_idx ON survey_option(question_id);
CREATE INDEX IF NOT EXISTS sr_survey_idx ON survey_response(survey_id);
CREATE INDEX IF NOT EXISTS survey_invitation_customer_idx ON survey_invitation(customer_id);
CREATE INDEX IF NOT EXISTS survey_invitation_survey_idx ON survey_invitation(survey_id);
CREATE INDEX IF NOT EXISTS sa_response_idx ON survey_answer(response_id);
CREATE INDEX IF NOT EXISTS sa_question_idx ON survey_answer(question_id);
