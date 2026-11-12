HUNG FASHION CRM — TÀI LIỆU BÀN GIAO ĐỒ ÁN

THÔNG TIN NHÓM
Tên nhóm: [CẦN BỔ SUNG]
Lớp / giảng viên: [CẦN BỔ SUNG]
Thành viên, MSSV, phân công và tỷ lệ đóng góp: [CẦN BỔ SUNG]
Doanh nghiệp khảo sát: [CẦN BỔ SUNG — xác nhận với đơn vị, không suy đoán từ dữ liệu mẫu]

MÔ TẢ
Ứng dụng quản trị cửa hàng thời trang gồm quản lý tài khoản và phân quyền theo vai trò,
hồ sơ khách hàng/nhân viên, sản phẩm và tồn kho, đơn hàng, báo cáo, phản hồi, khảo sát,
chat và một số luồng CRM. Nhánh chức năng đối chiếu là CRM. Dữ liệu trong seed là dữ liệu
giả lập. Thanh toán QR hiện ở chế độ DEMO, không kết nối ngân hàng. Chưa có chấm công,
lương, nghỉ phép hoặc module công việc/task.

CÔNG NGHỆ
- Giao diện: React, Vite.
- API: Node.js, Express.
- CSDL: PostgreSQL; cấu trúc nền tại server/sql/schema.sql, migrations 001–017.
- Sự kiện: Kafka/outbox; Docker Compose phục vụ môi trường local.
- Báo cáo: docs/report/main.tex, biên dịch bằng XeLaTeX.

CHẠY LOCAL (PowerShell)
1. Cài Node.js/npm 22 và Docker Desktop.
2. Mở terminal tại thư mục store-admin.
3. npm ci
4. Sao chép server/.env.example thành server/.env; cấu hình kết nối local và JWT_SECRET riêng.
5. docker compose --env-file server/.env up -d postgres kafka
6. npm run db:migrate --workspace server
7. (Tùy chọn) Có data/clean/products.json, đặt SEED_TARGET=local và SEED_DEMO_PASSWORD
   trong môi trường terminal, rồi chạy npm run seed. Chỉ seed vào database local/test.
8. npm run dev

Tài khoản demo được tạo bởi scripts/seed.mjs; mật khẩu do người chạy seed đặt qua
SEED_DEMO_PASSWORD, không được lưu trong tài liệu. Tên đăng nhập: admin, admin2,
qlnhansu, qlkho, qlbanhang, qlkhachhang, khach1, khach2, khach3 và demo_khach_khoa
(tài khoản này bị khóa). Vai trò và email mẫu được liệt kê trong Phụ lục báo cáo.

BUILD VÀ BÁO CÁO
- npm run build
- Biên dịch báo cáo từ docs/report: xelatex -interaction=nonstopmode -halt-on-error main.tex
  (chạy hai lượt để cập nhật mục lục và tham chiếu).
- SQL dump database/schema.sql và database/demo_data.sql là snapshot migration 015;
  migrations 016–017 bổ sung account_sessions và thông tin IP phiên.

TRƯỚC KHI NỘP
Điền các mục [CẦN BỔ SUNG], xác minh thông tin doanh nghiệp, kết quả khảo sát và ảnh giao diện.
Kiểm tra việc rubric yêu cầu module task: repository hiện chưa cài đặt module/bảng này.
Không phát hành file .env, mật khẩu, token, certificate, private key hoặc dữ liệu cá nhân.
