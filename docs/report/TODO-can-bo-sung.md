# Danh sách thông tin nhóm cần bổ sung trước khi nộp

Các mục dưới đây cần xác nhận từ nhóm/đơn vị thực tế; dữ liệu seed không thay thế bằng chứng khảo sát, thông tin nhóm hay ảnh nghiệm thu.

## Thông tin nhóm và doanh nghiệp

- [ ] Họ tên giảng viên hướng dẫn/chấm; xác nhận đơn vị doanh nghiệp, tên pháp lý, địa chỉ, năm thành lập, quy mô, cơ cấu tổ chức và mô hình kinh doanh thực tế.
- [ ] Danh sách thành viên tối đa 5 người: MSSV, họ tên, phần trăm đóng góp, điểm tự đánh giá và chữ ký.
- [ ] Nội dung từng thành viên đã thực hiện và người chịu trách nhiệm cho từng hạng mục trong kế hoạch 10 tuần.

## Khảo sát HTTT thực tế

- [ ] Phát phiếu khảo sát trong `02-khao-sat.tex` cho người có hiểu biết về quy trình/hệ thống hiện tại.
- [ ] Ghi số người được mời, số phiếu hợp lệ, thời gian và phương thức khảo sát; lưu câu trả lời thật và bằng chứng đồng ý sử dụng dữ liệu.
- [ ] Điền số lượng/tỷ lệ theo từng câu hỏi, nêu cách tính mẫu số, tổng kết và kết luận dựa trên kết quả thật. Không dùng seed/demo làm kết quả khảo sát.

## Ảnh giao diện

- [ ] Chụp và rà soát ảnh thật; tránh thông tin cá nhân không cần thiết, token, mật khẩu, file cấu hình hoặc chứng thư.

Các ảnh được tự động nhúng khi đặt đúng tên tại `docs/report/images/`:

- [ ] `docs/report/images/4.1.png` — ADMIN, Tổng quan sau khi tải dữ liệu demo.
- [ ] `docs/report/images/4.2.png` — Tài khoản; danh sách và hộp thoại xác nhận phân quyền/khóa.
- [ ] `docs/report/images/4.3.png` — Sản phẩm; bộ lọc và kết quả.
- [ ] `docs/report/images/4.4.png` — Tồn kho/Nhà cung cấp; lọc liên hệ.
- [ ] `docs/report/images/4.5.png` — Khách hàng CRM; bảng và bộ lọc.
- [ ] `docs/report/images/4.6.png` — Phản hồi và trạng thái xử lý.
- [ ] `docs/report/images/4.7.png` — Quản lý khảo sát và kết quả.
- [ ] `docs/report/images/4.8.png` — Hồ sơ khách hàng demo.
- [ ] `docs/report/images/4.9.png` — Khách gửi đánh giá sản phẩm.
- [ ] `docs/report/images/4.10.png` — Khách trả lời khảo sát.
- [ ] `docs/report/images/4.11.png` — Chat CSKH giữa khách và nhân viên.
- [ ] `docs/report/images/5.1.png` — Kiến trúc môi trường triển khai đã cấu hình; không lộ thông tin truy cập.
- [ ] `docs/report/images/5.2.png` — QR demo và trang xác nhận ghi rõ đây không phải giao dịch thật.

## Bàn giao dữ liệu và định dạng

- [x] Seed idempotent có tài khoản theo mọi role, mật khẩu chỉ lấy từ `SEED_DEMO_PASSWORD`, không in giá trị; dữ liệu hồ sơ dùng tên/địa chỉ giả, điện thoại giả và email `.local`.
- [x] Seed bổ sung event giao dịch, loyalty, khuyến mãi đã gán, chat, hội thoại và payment demo; dữ liệu checkout/token và file đính kèm thật vẫn chỉ phát sinh khi sử dụng luồng tương ứng.
- [x] Tạo `database/schema.sql` (schema-only) và `database/demo-data.sql` (data-only) từ database PostgreSQL local tạm; nạp tuần tự vào DB rỗng và khớp số dòng trên 40/40 bảng.
- [x] Dump data có hash bcrypt của tài khoản demo; không có mật khẩu dạng rõ. Nếu phát hành dump, chia sẻ mật khẩu demo qua kênh riêng và chỉ dùng mật khẩu dành cho demo.
- [x] Diễn tập `pg_dump`/`pg_restore` trên container local tạm và ghi ngày, lệnh, thời gian, đối chiếu row count vào chương cài đặt/vận hành.
- [x] Kết xuất đủ 5 sơ đồ Mermaid thành PDF và nhúng vào báo cáo.
- [x] Biên dịch báo cáo bằng XeLaTeX hai lượt sau khi cập nhật sơ đồ và nội dung.
- [ ] Nhóm đọc toàn bộ PDF, xác nhận mục lục/tham chiếu, bảng, số trang, chú thích và các placeholder ảnh trước khi nộp.
- [ ] Hoàn thành `submission/SUBMISSION-CHECKLIST.md`, tạo PDF và source archive theo quy định môn học.

## Khoảng trống schema cần nhóm xác nhận

- [ ] Rubric yêu cầu “tasks”, nhưng schema hiện tại không có bảng/nghiệp vụ task. Nhóm xác nhận đây không thuộc phạm vi hoặc bổ sung yêu cầu qua thay đổi schema riêng; không tự tạo bảng chỉ để lấp dữ liệu demo.
- [ ] Các phản hồi/chat chưa có tệp đính kèm seed: file cần được tạo/lưu qua luồng upload thật. Không tạo URL giả hoặc giả metadata như thể tệp tồn tại.
