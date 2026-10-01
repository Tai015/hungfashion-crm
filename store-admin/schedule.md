# Lịch sử và kế hoạch Store Admin

Ngày cập nhật: 01/10/2026

## Tổng quan đồ án

- Giao diện React/Vite gồm bảng tổng quan, khách hàng, sản phẩm, phản hồi và khảo sát.
- API Express kết nối PostgreSQL cho tài khoản, khách hàng, sản phẩm, kho, đơn hàng, khuyến mãi, phản hồi, khảo sát và báo cáo.
- PostgreSQL có schema, bộ chạy migration, bảng hành vi/giao dịch dạng cột và bảng outbox làm hàng đợi sự kiện bền vững.
- Kafka nhận hai topic `user-events` và `transaction-events`; consumer lưu sự kiện vào PostgreSQL. Kafka UI dùng để xem topic và message.
- Electron launcher hỗ trợ mở ứng dụng local, trình duyệt database và Kafka UI.
- Docker Compose quản lý PostgreSQL, Kafka, Kafka UI và các volume đặt tên.
- Script `scripts/kafka-load-test.mjs` tạo tải giao dịch, đo tốc độ/độ trễ và đối chiếu DB theo `benchmarkRunId`.

## Công việc đã hoàn thành hôm 1/10/2026

### Giao diện và dữ liệu mẫu

- Chuẩn hóa thanh tìm kiếm/bộ lọc cho khách hàng, sản phẩm và phản hồi; thêm lọc sản phẩm theo danh mục, nút xóa lọc và bố cục phù hợp màn hình nhỏ.
- Dashboard hiển thị thời điểm tải dữ liệu gần nhất.
- Tạo dữ liệu mẫu có liên kết giữa khách hàng, nhân viên, sản phẩm/biến thể, đơn hàng, thanh toán, phản hồi và khảo sát.
- Ẩn danh dữ liệu mẫu: tên dạng mẫu, không lưu số điện thoại/địa chỉ/ngày sinh; tài khoản và nhà cung cấp mẫu không còn thông tin liên hệ.

### PostgreSQL và migration

- Chuyển `user_events` và `transactions` từ một cột `payload JSONB` sang các cột hành vi/giao dịch riêng; chuyển dữ liệu event cũ sang cấu trúc mới.
- Thêm `event_id` duy nhất để consumer bỏ qua message gửi trùng.
- Thêm và áp dụng migration `006_outbox_events.sql`: bảng outbox, khóa chống trùng, partition key và partial index cho sự kiện chưa gửi.
- Tách việc thử lại khi chờ PostgreSQL khỏi migration: chỉ thử lại `SELECT 1`; migration chạy một lần để lỗi SQL báo ngay.
- Đặt `PORT` mặc định là `5000`, kiểm tra giá trị port và bỏ việc nạp `.env.example` trực tiếp trong `index.js`.

### Kafka và độ tin cậy

- API chỉ ghi sự kiện vào PostgreSQL outbox rồi trả `202`; request không gửi Kafka trực tiếp và không ghi dự phòng thẳng vào bảng sự kiện.
- Bộ chuyển tiếp dùng producer idempotent, lấy lô bằng `FOR UPDATE SKIP LOCKED`, gửi `userId` làm khóa phân vùng, chỉ đánh dấu `published_at` sau khi Kafka xác nhận và thử lại với thời gian chờ tăng dần đến khoảng 30 giây.
- Consumer ghi bản ghi có cột rõ ràng bằng `ON CONFLICT (event_id) DO NOTHING`.
- Thêm giới hạn tốc độ, giới hạn số sự kiện đang chờ, endpoint `GET /api/events/outbox-status` và dọn outbox đã gửi sau 7 ngày.
- Compose có healthcheck cho Kafka; Kafka UI đợi broker sẵn sàng. Đã bỏ bind mount `schema.sql`; API migration runner tạo schema khi database rỗng.
- Benchmark dùng `PORT`/`API_URL`, chờ consumer ghi DB và so sánh số dòng theo `benchmarkRunId`.

## Kết quả kiểm thử

- Kiểm tra cú pháp Node.js, diagnostics, bản build client, cấu hình Compose, migration chạy lặp an toàn và `git diff --check` đều đạt. Build có cảnh báo gói JavaScript lớn hơn 500 kB, không liên quan thay đổi này.
- Tạo database tạm rỗng, chạy mốc khởi tạo và migration đến `006`, xác nhận có outbox và 8 sản phẩm mẫu; sau đó đã xóa database tạm.
- Kafka và PostgreSQL báo healthy; Kafka UI đang chạy.
- Gửi trùng `eventId`: request sau nhận `duplicate: true`, DB chỉ có một bản ghi.
- Khi tắt Kafka, API vẫn nhận sự kiện và trả `202`; sau khi Kafka hoạt động lại, bộ chuyển tiếp gửi sự kiện đang chờ và consumer ghi vào DB.
- Kiểm thử giới hạn tốc độ: hai request đầu trả `202`, request vượt ngưỡng trả `429`. Khi hàng đợi đầy, request mới trả `503`.
- Kiểm thử tải ngắn: 6 sự kiện được nhận và cả 6 đều được ghi vào PostgreSQL với cùng `benchmarkRunId`.
- Event thử nghiệm đã được dọn; outbox không còn sự kiện chờ. API test ở cổng `5001/5002` đã dừng. Volume PostgreSQL hiện tại và dữ liệu mẫu được giữ nguyên.

## Đánh giá mục tiêu tiếp theo: làm sạch DB và bắt đầu dữ liệu thật

Mục tiêu này **khả thi và hợp lý trước khi nạp dữ liệu thật**, nhưng phải thực hiện như một đợt reset có kiểm soát. DB hiện có dữ liệu mẫu và lịch sử migration đến `006`; xóa DB/volume sẽ xóa dữ liệu, không chỉ dựng lại cấu trúc.

Có một điểm cần xử lý trước: PostgreSQL hiện ghi nhận migration `001_remove_legacy_checksum_state.sql`, nhưng file `001` không có trong `server/sql/migrations/`. Các file hiện có bắt đầu từ `002_seed_demo_store.sql`, sau đó là `003`–`006`. Migration `002` nạp dữ liệu demo; `003/004` ẩn danh và dọn thông tin liên hệ demo. Cần tách rõ dữ liệu mẫu dùng phát triển khỏi dữ liệu thật.

`schema.sql` cũng có dữ liệu khởi tạo như role, account mẫu, danh mục, size, màu và nhà cung cấp. Trước khi nhập dữ liệu thật, cần phân loại phần nào là dữ liệu tham chiếu bắt buộc và phần nào chỉ phục vụ demo.

## Kế hoạch đề xuất cho lần reset

1. Xác nhận phạm vi reset: chỉ PostgreSQL hay cả message Kafka. Tạo backup trước. Không chạy `docker compose down -v` nếu cần giữ Kafka, vì lệnh đó xóa cả volume `postgres_data` lẫn `kafka_data`.
2. Chốt cấu trúc cuối cùng: bảng nghiệp vụ, bảng sự kiện dạng cột, outbox, khóa duy nhất, index và bảng theo dõi migration.
3. Sắp xếp lại lịch sử migration thành chuỗi rõ ràng. Có thể giữ `000` làm mốc schema ban đầu, tiếp theo tạo `001` cho cấu trúc event chuẩn hóa và `002` cho outbox; chuyển dữ liệu demo sang bước nạp riêng. Đối chiếu version trong DB và các file trước khi bỏ lịch sử cũ.
4. Tách dữ liệu demo khỏi schema/migration dùng cho dữ liệu thật. Không tự nạp tài khoản/khách hàng demo vào DB thật.
5. Dựng thử trên database tạm rỗng, chạy migration từ đầu, kiểm tra bảng/index/khóa ngoại và xác nhận API khởi động. Chỉ reset DB đang dùng sau khi backup và bản dựng thử đạt.
6. Chuẩn bị dữ liệu thật: xác nhận nguồn và quyền sử dụng, ánh xạ cột, encoding, khóa chống trùng, dữ liệu thiếu/sai và cách xử lý thông tin cá nhân. Nạp vào vùng staging trước, đối chiếu số lượng và khóa ngoại rồi mới chuyển vào bảng chính.
7. Kiểm tra nhanh API, dashboard, DB browser, Kafka/outbox và chạy benchmark nhỏ; đối chiếu số liệu trước khi coi lần nạp hoàn tất.

Chưa xóa database/volume và chưa nạp dữ liệu thật trong phiên này. Cần backup, phạm vi reset rõ ràng và bộ dữ liệu thật kèm ánh xạ cột trước khi thực hiện thao tác phá hủy hoặc import.
