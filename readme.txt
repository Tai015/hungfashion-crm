HUNG FASHION CRM — GHI CHÚ BÀN GIAO

Mục tiêu: Báo cáo giữa kỳ môn Hệ thống thông tin doanh nghiệp. Nhánh đối chiếu mục III được chọn là CRM (30 điểm) vì code có khách hàng, phản hồi, khảo sát, chat và báo cáo CRM.

CÀI ĐẶT LOCAL
1. Mở PowerShell tại thư mục store-admin.
2. npm install
3. Chuẩn bị server/.env cục bộ bằng cách tham khảo server/.env.example; không commit .env.
4. npm run dev:local
5. Migration: npm run db:migrate --workspace server
6. Seed (local/test, cần data/clean/products.json): npm run seed
7. Build: npm run build
8. Test: cd server; npm test

BÁO CÁO
- Nguồn LaTeX: docs/report/main.tex
- Biên dịch từ thư mục docs/report bằng XeLaTeX, chạy hai lượt:
  xelatex -interaction=nonstopmode -halt-on-error main.tex
- Sơ đồ nguồn ở docs/report/diagrams/*.mmd; render PDF bằng Mermaid CLI trước bản nộp cuối.
- SQL để tra cứu: database/schema.sql; dữ liệu tham chiếu: database/demo_data.sql.
- Kiểm kê API/schema: docs/report/00-inventory.md.
- Các thông tin cần bổ sung: docs/report/TODO-can-bo-sung.md.
- Checklist bàn giao: submission/SUBMISSION-CHECKLIST.md.

CẦN BỔ SUNG TRƯỚC KHI NỘP
Tên nhóm, đề tài chính thức, giảng viên/lớp, thành viên/MSSV/đóng góp/chữ ký; thông tin doanh nghiệp đã xác nhận; kết quả khảo sát thật; ảnh giao diện thật; ảnh kiến trúc; kết quả test, build và restore drill; quota Kafka đã xác minh; kiểm tra mọi ô [CẦN BỔ SUNG]. Không đưa mật khẩu, token, certificate, private key, .env hoặc database dump vào tài liệu/gói nộp.

Thanh toán QR hiện là DEMO, không kết nối ngân hàng và không nhận tiền thật. Không dùng dữ liệu seed làm kết quả khảo sát.
