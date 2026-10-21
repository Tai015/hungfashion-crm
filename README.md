# Hướng dẫn cài đặt và phát triển hệ thống "Hung Fashion"

## 1. Tổng quan về dự án
Đây là ứng dụng quản trị chuỗi bán lẻ thời trang "Hung Fashion", được xây dựng theo kiến trúc **Event-Driven** (Kafka + Outbox Pattern) nhằm đảm bảo khả năng mở rộng, độ tin cậy cao và quản lý tập trung dữ liệu hiệu quả.

## 2. Cài đặt môi trường

### 2.1. Cài đặt hệ thống (Một lần)

#### 2.1.1. Các thư mục chính
- `store-admin/server/` - Ứng dụng Node.js (backend)
- `store-admin/client/` - Ứng dụng React (frontend)

#### 2.1.2. Bắt buộc sử dụng phiên bản Node.js tối thiểu
Tất cả các hoạt động cần `node` (npm, post-install, dev, start) đều được thực hiện **bởi Claude Code** (hoặc là bạn, nhưng bắt buộc phải có `node`).

**Các bước cài đặt hệ thống (thực hiện một lần):**

1.  **Cài đặt các thư viện**
    
    Từ thư mục gốc (`d:\HTTTDN`), chạy lệnh:
    ```bash
    cd store-admin/server && npm install
    cd client && npm install  # đây là nơi bạn đã cài đặt jspdf/jspdf-autotable
    ```

2.  **Cấu hình PostgreSQL**

    **Dữ liệu đầu vào:**
    - Hostname: `localhost`
    - Cổng: `5432`
    - Tên DB: `postgres`
    - Tài khoản: `postgres`
    - Mật khẩu: `admin123`

    **Tạo cơ sở dữ liệu (SQL Server):**
    ```sql
    CREATE DATABASE store_admin;
    ```

    **Cấu hình file `.env` trong `store-admin/server/`:**
    ```env
    # PostgreSQL
    POSTGRES_HOST=localhost
    POSTGRES_PORT=5432
    POSTGRES_DB=store_admin
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=admin123

    # Khóa JWT
    JWT_SECRET=HungFashionSecretKey1234567890123456789012345678

    # Kafka broker
    KAFKA_BROKER=localhost:9092

    # Cấu hình khác (không bắt buộc)
    PORT=5000
    ENABLE_DATABASE_BROWSER=true
    EVENT_RATE_LIMIT_WINDOW_MS=1000
    EVENT_RATE_LIMIT_MAX=1200
    OUTBOX_MAX_BACKLOG=10000
    ```

3.  **Tạo database schema** (chỉ thực hiện **một lần**)

    **Chạy lệnh trong thư mục `store-admin/server/src/`:**
    ```bash
    npm run db:baseline
    ```
    *Ghi chú:* Lần đầu tiên bạn chạy lệnh này, nó sẽ áp dụng **schema ban đầu** (`schema.sql`), tạo toàn bộ các bảng cần thiết.

4.  **Khởi động server:**
    
    **Trong thư mục `store-admin/server/`:**
    ```bash
    npm start
    ```

5.  **Khởi động client (frontend):**

    **Trong thư mục `client/`:**
    ```bash
    npm run dev
    ```

    *Lược đồ khởi động:*

    ```mermaid
graph TD
    subgraph "Backend (Node.js)"
        DB[(PostgreSQL)] --> Outbox[(outbox_events)]
        Outbox --> Relay[(Outbox Relay Service)]
        Relay --> Kafka{Kafka Broker}
    end
    Frontend --> API[Node.js API]
    API --> Outbox
    ```

## 3. Chức năng chính

### 3.1. Chức năng nội bộ

| Module | API | Mô tả |
| :--- | :--- | :--- |
| **Auth** | `/api/auth/me` | Xác thực phiên đăng nhập; trả về thông tin tài khoản người dùng |
| **Tài khoản** | `/api/accounts/*` | CRUD tài khoản người dùng (Admin) |
| **Nhân sự** | `/api/employees/*` | CRUD hồ sơ nhân viên (Admin & QL_NHAN_SU) |
| **Khách hàng** | `/api/customers/*` | CRM - CRUD khách hàng (Admin & QL_KHACH_HANG) |
| **Sản phẩm** | `/api/products/*` | CRUD sản phẩm (Admin & QL_KHO) |
| **Kho** | `/api/inventory/*` | Quản lý tồn kho (Admin & QL_KHO) |
| **Đơn hàng** | `/api/orders/*` | Tạo, xử lý đơn hàng (Admin & QL_BAN_HANG) |
| **Khuyến mãi** | `/api/promotions/*` | Tạo và quản lý mã giảm giá |
| **Phản hồi** | `/api/feedbacks/*` | Phản hồi về sản phẩm (Admin & QL_KHACH_HANG) |
| **Khảo sát** | `/api/surveys/*` | Khảo sát ý kiến khách hàng |
| **Báo cáo** | `/api/reports/*` | Dashboard KPI, doanh thu, phân khúc khách hàng |
| **Cài đặt** | `/api/settings/*` | Cấu hình hệ thống (Admin) |
| **Nhật ký** | `/api/reports/audit-logs` | Xem nhật ký hoạt động người dùng (Kafka) |

### 3.2. End-to-end cho Mã khuyến mãi (Promotion)

1.  **Validate Promotion:**
    - `GET /api/promotions/validate/:code`
    - Kiểm tra tính hợp lệ: trạng thái, thời hạn, lượt sử dụng.

2.  **Áp dụng khuyến mãi vào đơn hàng:**
    - Khi tạo đơn (`POST /api/orders`), gọi `calcOrderTotals(items, promotions)` (đã có sẵn trong domain logic).

3.  **Xuất hóa đơn PDF:**
    - Dữ liệu đơn hàng được tải lên (sử dụng thư viện `jspdf`).
    - Xuất thành file PDF (`HoaDon_{order_id}.pdf`) mà người dùng có thể tải xuống.

## 4. Cấu trúc mã nguồn

```
store-admin/
├── server/ (Node.js)
│   ├── src/
│   │   ├── auth.js
│   │   ├── db.js
│   │   ├── domain/        (pricing.js, order-status.js, ...)
│   │   ├── routes/       (auth.js, employee.js, order.js, promotion.js, ...)
│   │   ├── migrations.js
│   │   └── outbox-relay.js
│   ├── sql/             (schema.sql, migrations/*.sql)
│   └── package.json
├── client/ (React)
│   ├── src/
│   │   ├── App.jsx                (Root Component)
│   │   ├── components/            (StatusBadge, NavItem, Spinner)
│   │   ├── utils/                 (pdfGenerator.js, telemetry.js)
│   │   ├── views/                 (OrderDetailView, ...) 
│   │   └── api.js                 (Central API client)
│   └── package.json
├── README.md
└── other-files
```

## 5. Các thành phần được đánh dấu

*   **Event-Driven:** Sử dụng Outbox Pattern và Kafka để xử lý bất đồng bộ.
*   **RBAC:** Phân quyền theo vai trò `role` (`ADMIN`, `QL_KHO`, `QL_BAN_HANG`, ...).
*   **State Machine:** Luồng trạng thái đơn hàng (`Pending → Confirmed → Processing → Shipped → Delivered`).

## 6. Lỗi thường gặp

| Lỗi | Nguyên nhân | Hướng dẫn khắc phục |
| :--- | :--- | :--- |
| `ERR_POSTGRES_NOT_FOUND` | PostgreSQL hoặc database không tồn tại | Kiểm tra `POSTGRES_HOST`, `POSTGRES_DB`; xác nhận việc tạo cơ sở dữ liệu `store_admin` |
| `JWT_SECRET must be configured` | `JWT_SECRET` trong `.env` ngắn < 32 ký tự | Đặt `JWT_SECRET` với độ dài >= 32 |
| `Kafka broker not available` | Docker hoặc Kafka chưa sẵn sàng | Đảm bảo Kafka broker đã sẵn sàng (`localhost:9092`) |

## 7. Bảng tra cứu các file README khác (nếu có)

| File | Mục đích |
| :--- | :--- |
| `server/README.md` | Chi tiết cài đặt backend |
| `client/README.md` | Hướng dẫn phát triển frontend |

## 8. Xem thêm tài liệu tham khảo

- [Kafka - Apache Kafka](https://kafka.apache.org/)
- [Outbox Pattern](https://www.youtube.com/watch?v=Y_wXFJgBVIY)
- [JSPDF - jsPDF](https://parall.axlight.com/jsPDF/docs.php)
- [React-Vite](https://vitejs.dev/guide/)
- [Node.js + PostgreSQL + Docker](https://www.postgresql.org/docs/current/) **và** Docker Compose

---

**Lưu ý:** Các bước cài đặt cần thiết được thực hiện một lần trong quá trình triển khai hệ thống ban đầu. Sau khi chạy `db:baseline`, toàn bộ các bước tiếp theo sẽ tự động hóa toàn bộ!

**Hướng dẫn này được sử dụng cho các môi trường học tập, kiểm thử và triển khai thực tế.