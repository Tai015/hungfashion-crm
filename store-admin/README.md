# Store Admin Analytics Platform

Ứng dụng web quản lý cửa hàng thời gian thực với:

- ReactJS frontend
- Express + PostgreSQL backend
- Thu thập hành vi người dùng và giao dịch bằng Kafka
- Bảng dashboard theo dõi doanh thu, đơn hàng, hoạt động người dùng

## Cấu trúc

- `client/`: giao diện React
- `server/`: API và xử lý Kafka/PostgreSQL

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

## Desktop launcher trong VS Code

Mở workspace `D:\HTTTDN` trong VS Code rồi nhấn F5 và chọn `Store Admin Launcher`. VS Code tự chạy `npm install` trước khi mở launcher.

Chọn **Mở bản local** để khởi động PostgreSQL/Kafka bằng Docker, chạy frontend/API và mở dashboard trong trình duyệt mặc định. Chọn **Xem database** để duyệt bảng PostgreSQL. Chọn **Xem Kafka** để mở Kafka UI, xem/filter topic và message. Hoặc nhập URL để mở bản đã deploy trong trình duyệt. Máy cần Node.js/npm, Docker Desktop đang chạy và Internet để tải dependencies cùng Docker images lần đầu.

Để tạo bằng chứng throughput/continuity cho Kafka, mở web bằng launcher rồi chạy benchmark tại thư mục `store-admin`:

```bash
npm run benchmark:kafka -- 5 30
```

Lệnh trên gửi 5 transaction events/giây trong 30 giây qua API thật. Terminal benchmark ghi số accepted/failed, throughput và latency; terminal API ghi `kafka_pipeline_metrics` mỗi 5 giây cho producer và consumer. Kafka UI hiển thị message ở topic `transaction-events`, còn PostgreSQL xác nhận số event consumer đã persist.

## Môi trường

Server đọc `server/.env`; nếu file này chưa có thì dùng giá trị local trong `server/.env.example`. Tạo bản riêng để tùy chỉnh cấu hình hoặc password:

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

- Dashboard tổng quan
- Danh sách đơn hàng
- Theo dõi page view và thao tác menu/report qua Kafka topic `user-events`
- Mô phỏng giao dịch gửi vào Kafka topic `transaction-events`; website bán hàng có thể gọi endpoint này sau checkout thành công
- Lưu dữ liệu lên PostgreSQL thông qua Kafka consumer
