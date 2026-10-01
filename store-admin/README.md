# Nền tảng quản lý cửa hàng Store Admin

Ứng dụng quản lý cửa hàng gồm giao diện web, API, PostgreSQL, Kafka và ứng dụng khởi chạy trên máy tính. Các chức năng chính:

- Bảng tổng quan theo dõi doanh thu, đơn hàng, khách hàng và hoạt động.
- Quản lý khách hàng, sản phẩm, phản hồi và khảo sát.
- Ghi nhận sự kiện hành vi và giao dịch qua Kafka; lưu bản ghi có cấu trúc trong PostgreSQL.
- Bảng outbox làm hàng đợi bền vững, tiếp nhận sự kiện kể cả khi Kafka tạm thời chưa sẵn sàng.

## Cấu trúc

- `client/`: giao diện React/Vite.
- `server/`: API Express, kết nối PostgreSQL/Kafka và migration SQL.
- `desktop/`: launcher Electron.
- `scripts/`: benchmark luồng Kafka.
- `docker-compose.yml`: PostgreSQL, Kafka và Kafka UI.

## Khởi chạy nhanh

1. Cài đặt dependencies:
   ```bash
   npm install
   ```

2. Chạy PostgreSQL và Kafka bằng Docker:
   ```bash
   docker compose --env-file server/.env.example up -d postgres kafka
   ```

3. Chạy ứng dụng:
   ```bash
   npm run dev
   ```

4. Truy cập:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5000

## Cơ sở dữ liệu và migration

- `server/sql/schema.sql` là schema ban đầu. Khi API chạy trên database rỗng, migration runner áp dụng file này rồi ghi nhận baseline `000`.
- Docker Compose không mount `schema.sql` vào thư mục init của PostgreSQL; việc khởi tạo schema do API migration runner quản lý.
- Sau khi database đã có dữ liệu, không sửa schema cũ để mong PostgreSQL tự cập nhật. Tạo migration mới trong `server/sql/migrations/`, ví dụ `007_add_product_color.sql`.
- API tự chạy các migration chưa áp dụng khi khởi động. Có thể chạy thủ công bằng `npm run db:migrate --workspace server`.
- Với database cũ chưa có bảng lịch sử migration, chạy `npm run db:baseline --workspace server` một lần. Lệnh này chỉ ghi nhận schema hiện tại, không chạy lại seed.
- Version và tên migration đã chạy được lưu trong `store_admin_schema_migrations`. Không sửa migration đã áp dụng; tạo migration kế tiếp.
- Hiện migration outbox là `006_outbox_events.sql`. Migration này tạo bảng outbox, khóa chống trùng `event_id` và index phục vụ consumer.


1. API kiểm tra `eventId`, áp dụng giới hạn tốc độ và giới hạn số sự kiện đang chờ.
2. API ghi payload vào `outbox_events`, rồi trả HTTP `202`; request không phải chờ Kafka.
3. Bộ chuyển tiếp lấy các dòng chưa gửi theo thứ tự, khóa bằng `FOR UPDATE SKIP LOCKED`, rồi gửi lên topic Kafka với `userId` làm khóa phân vùng.
4. Khi Kafka xác nhận đã nhận message, bộ chuyển tiếp mới cập nhật `published_at`. Nếu gửi lỗi, tiến trình thử lại với thời gian chờ tăng dần; outbox giữ sự kiện để gửi lại.
5. Bộ tiêu thụ ghi các trường sự kiện vào cột riêng trong `user_events` hoặc `transactions`. `event_id` duy nhất giúp bỏ qua message gửi lại.

Topic hiện dùng là `user-events` và `transaction-events`. Trạng thái hàng đợi xem tại `GET /api/events/outbox-status`.

Mặc định API nhận tối đa `1200` sự kiện mỗi địa chỉ IP trong `1000` ms (`EVENT_RATE_LIMIT_MAX`, `EVENT_RATE_LIMIT_WINDOW_MS`) và từ chối thêm khi có `10000` sự kiện chưa gửi (`OUTBOX_MAX_BACKLOG`). Outbox xóa sự kiện đã gửi sau 7 ngày; PostgreSQL vẫn giữ bản ghi đã được consumer xử lý trong các bảng sự kiện.

## Ứng dụng desktop

Mở workspace `D:\HTTTDN` trong VS Code, nhấn F5 và chọn `Store Admin Launcher`. VS Code chạy `npm install` trước khi mở launcher.

- **Mở bản local**: khởi động PostgreSQL/Kafka bằng Docker, chạy frontend/API và mở dashboard.
- **Xem database**: mở trình duyệt các bảng PostgreSQL.
- **Xem Kafka**: mở Kafka UI để xem topic và message.
- Có thể nhập URL để mở bản đã triển khai.

Máy cần Node.js/npm, Docker Desktop và Internet để tải dependencies/images lần đầu.


Mở ứng dụng bằng launcher, sau đó chạy kiểm thử tải từ thư mục `store-admin`:

```bash
npm run benchmark:kafka -- 5 30
```

Lệnh trên gửi 5 giao dịch/giây trong 30 giây qua API thật. Công cụ ghi số request được chấp nhận/thất bại, tốc độ xử lý và độ trễ, rồi đối chiếu số dòng PostgreSQL theo `benchmarkRunId`. API ghi chỉ số producer/consumer mỗi 5 giây; Kafka UI hiển thị message trong topic `transaction-events`. Có thể đặt `API_URL` để kiểm thử API ở địa chỉ/cổng khác.

## Cấu hình môi trường

Server đọc `server/.env`. Nếu chưa có file này, các thiết lập kết nối database trong `server/src/db.js` dùng giá trị mặc định từ `server/.env.example`. Tạo file riêng để tùy chỉnh cấu hình hoặc mật khẩu:

```env
PORT=5000
LOCAL_HOST=127.0.0.1
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=store_admin
POSTGRES_USER=store_admin
POSTGRES_PASSWORD=store_admin_dev
KAFKA_BROKER=localhost:9092
```

## Topics Kafka

- `user-events`
- `transaction-events`

## Tính năng chính

- Dashboard tổng quan doanh thu, khách hàng, phản hồi và đơn hàng.
- Quản lý khách hàng, sản phẩm, phản hồi và khảo sát.
- Theo dõi lượt xem trang và thao tác điều hướng qua topic `user-events`.
- Gửi sự kiện giao dịch qua topic `transaction-events`; consumer lưu giao dịch vào PostgreSQL.
- Dữ liệu mẫu được ẩn danh và nạp bằng migration; không dùng thông tin liên hệ của người thật.
