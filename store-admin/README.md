# Hung Fashion CRM

Hệ thống CRM quản lý cửa hàng thời trang, gồm giao diện web, API, PostgreSQL và Kafka.

## Chức năng

- Đăng nhập và phân quyền theo vai trò: ADMIN, QL_NHAN_SU, QL_KHO, QL_BAN_HANG, QL_KHACH_HANG, KHACH_HANG.
- Quản lý sản phẩm, nhà cung cấp, nhân viên, khách hàng, đơn hàng, phản hồi và khảo sát.
- Xem báo cáo bán hàng và khách hàng.
- Ghi nhận sự kiện người dùng và giao dịch qua Kafka; PostgreSQL lưu dữ liệu sự kiện và outbox.
- Nhập catalog thời trang từ dữ liệu HTML công khai bằng scraper Python.

## Công nghệ

- Frontend: React, Vite.
- Backend: Node.js, Express.
- Cơ sở dữ liệu: PostgreSQL.
- Hàng đợi sự kiện: Kafka.
- Scraper: Python, Requests, Beautiful Soup.

## Yêu cầu

- Node.js và npm.
- Docker Desktop và Docker Compose.
- Python 3 cùng pip để tải và chuẩn hóa catalog.
- PostgreSQL client tools (`pg_dump`, `pg_restore`) cho chức năng sao lưu/phục hồi.

## Cài đặt và chạy lần đầu

Thực hiện các lệnh dưới đây tại thư mục `store-admin`.

### 1. Cài đặt cấu hình

```powershell
npm install
Copy-Item server/.env.example server/.env
```

Mở `server/.env`, kiểm tra cấu hình PostgreSQL và Kafka. Đổi `JWT_SECRET` thành chuỗi bí mật riêng trước khi sử dụng ngoài môi trường local.

### 2. Khởi động PostgreSQL và Kafka

```powershell
docker compose --env-file server/.env up -d postgres kafka
```

Chờ các container khởi động xong rồi tiếp tục.

### 3. Tạo schema và dữ liệu demo

```powershell
npm run db:migrate --workspace server
npm run seed
```

`db:migrate` tạo schema và áp dụng các migration chưa chạy. `seed` lấy catalog, sau đó tạo dữ liệu demo cho các bảng theo thứ tự khóa ngoại. Có thể chạy `seed` nhiều lần; chương trình kiểm tra dữ liệu hiện có để tránh tạo bản ghi trùng.

Trang xem database chạy qua nút **Xem database** trong launcher. Trang này không yêu cầu đăng nhập; API chỉ trả dữ liệu khi được gọi từ máy local và `ENABLE_DATABASE_BROWSER=true`. Không bật tùy chọn này trên máy chủ có thể truy cập từ mạng công cộng.

### 4. Chạy ứng dụng

```powershell
npm run dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:5000>
- Kiểm tra API: <http://localhost:5000/api/health>
- Kafka UI (nếu khởi động thêm dịch vụ `kafka-ui`): <http://localhost:8080>

Khởi động Kafka UI bằng lệnh:

```powershell
docker compose --env-file server/.env up -d kafka-ui
```

## Cấu hình môi trường

Server và các script đọc `server/.env`. File mẫu nằm tại [server/.env.example](./server/.env.example).

| Biến | Ý nghĩa |
|---|---|
| `PORT` | Cổng API, mặc định `5000` |
| `JWT_SECRET` | Khóa ký token đăng nhập |
| `POSTGRES_HOST`, `POSTGRES_PORT` | Máy chủ và cổng PostgreSQL |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database và tài khoản PostgreSQL |
| `KAFKA_BROKER` | Địa chỉ Kafka, mặc định local là `localhost:9092` |
| `KAFKA_UI_PORT` | Cổng Kafka UI, mặc định `8080` |
| `ENABLE_DATABASE_BROWSER` | Bật/tắt API xem bảng database |
| `ENABLE_DATABASE_RESTORE` | Bật/tắt API phục hồi database |
| `PYTHON_EXECUTABLE` | Lệnh hoặc đường dẫn đến Python |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Đường dẫn đến công cụ sao lưu/phục hồi PostgreSQL |

Các giá trị trong `.env.example` dành cho môi trường phát triển local. Hãy thay đổi thông tin xác thực trước khi triển khai.

## Database và migration

`server/sql/schema.sql` là cấu trúc nền ban đầu, bao gồm các dữ liệu danh mục cần thiết như vai trò, quyền, danh mục sản phẩm, size, màu và sở thích. Các migration hiện có được đánh số liên tục:

| Version | Tên file | Mục đích |
|---|---|---|
| 001 | `001_create_indexes.sql` | Index phục vụ lọc, tìm kiếm và báo cáo |
| 002 | `002_structure_event_records.sql` | Chuyển dữ liệu sự kiện cũ sang các cột có cấu trúc |
| 003 | `003_outbox_events.sql` | Outbox và khóa chống xử lý trùng sự kiện |
| 004 | `004_crm_schema_gap.sql` | Bổ sung các thành phần CRM cho schema cũ |
| 005 | `005_crm_integrity_constraints.sql` | Ràng buộc phản hồi và câu trả lời khảo sát |

Dữ liệu demo về tài khoản, nhà cung cấp, sản phẩm, khách hàng, đơn hàng, phản hồi và khảo sát được tạo bởi `npm run seed`. Như vậy schema/migration chịu trách nhiệm về cấu trúc; script seed chịu trách nhiệm về dữ liệu dùng để chạy thử.

Migration runner lưu version đã áp dụng trong bảng `store_admin_schema_migrations` và tự chạy migration mới khi khởi động API. Khi thay đổi cấu trúc database, hãy tạo migration mới với version tiếp theo, ví dụ `006_add_product_color.sql`.

### Reset database

Reset xóa database hiện tại, tạo lại schema và áp dụng migration. Script chỉ chấp nhận PostgreSQL chạy trên `localhost` hoặc `127.0.0.1`, đồng thời tạo file backup trước khi xóa.

Trước tiên xem database đích:

```powershell
npm run db:reset
```

Chỉ tiếp tục khi tên database và host hiển thị đúng, đồng thời bạn chấp nhận xóa dữ liệu hiện có:

```powershell
npm run db:reset -- --yes
npm run seed
```

Lịch sử migration trong phiên bản này đã được sắp xếp lại. Database đã chạy lịch sử migration cũ cần được backup và reset trước khi dùng chuỗi migration mới. Lệnh reset tạo bản backup tự động trong `backups/`.

### Sao lưu và phục hồi

```powershell
npm run db:backup
npm run db:restore -- backups/<ten-file>.dump
```

Backup được lưu trong `backups/`. Phục hồi sẽ thay thế schema và dữ liệu hiện tại; chỉ dùng file backup đáng tin cậy. Có thể đặt đường dẫn công cụ PostgreSQL bằng `PG_DUMP_PATH` và `PG_RESTORE_PATH`.

## Cào catalog và seed

Scraper Python tải các trang sản phẩm HTML của [Fashion Studio](https://fashion-studio.dicoding.dev/), kiểm tra robots.txt, dùng User-Agent nhận diện rõ ràng và chờ 1,5 giây giữa các request. Quy mô catalog được giới hạn cho mục đích demo. Python lưu cache kết quả tại `data/raw/fashion-studio-products.json` và dữ liệu đã chuẩn hóa tại `data/clean/products.json`. Khi robots.txt từ chối hoặc trang nguồn gặp lỗi, scraper dừng và báo lỗi để xử lý trước khi thử lại.

Cài các thư viện Python:

```powershell
python -m pip install -r server/settings/requirements.txt
```

Nếu lệnh `python` không trỏ đến interpreter phù hợp, đặt đường dẫn trong `PYTHON_EXECUTABLE` ở `server/.env`.

Các lệnh catalog:

```powershell
npm run catalog:scrape
npm run catalog:scrape -- --force
npm run seed
```

Lệnh `--force` tải catalog lại từ nguồn. Nút **Cào và nhập sản phẩm** trong phần Cài đặt chạy cùng pipeline và cập nhật sản phẩm, biến thể, hình ảnh, danh mục, thương hiệu trong database.

## Tài khoản chạy thử

Sau khi chạy `npm run seed`, các tài khoản sau dùng chung mật khẩu `Demo@12345`.

| Vai trò | Email | Tên đăng nhập |
|---|---|---|
| ADMIN | `admin@hungfashion.local` | `admin` |
| ADMIN dự phòng | `admin2@hungfashion.local` | `admin2` |
| QL_NHAN_SU | `nhansu@hungfashion.local` | `qlnhansu` |
| QL_KHO | `kho@hungfashion.local` | `qlkho` |
| QL_BAN_HANG | `banhang@hungfashion.local` | `qlbanhang` |
| QL_KHACH_HANG | `crm@hungfashion.local` | `qlkhachhang` |
| KHACH_HANG | `khach1@hungfashion.local` | `khach1` |
| KHACH_HANG | `khach2@hungfashion.local` | `khach2` |
| KHACH_HANG | `khach3@hungfashion.local` | `khach3` |

Mật khẩu được băm trước khi lưu trong PostgreSQL. Đây là thông tin đăng nhập demo; không dùng cho môi trường thật.

## Kafka và kiểm thử tải

Ứng dụng sử dụng hai topic:

- `user-events`
- `transaction-events`

Sự kiện được ghi vào outbox trước, sau đó relay chuyển đến Kafka. Trạng thái outbox xem tại `GET /api/events/outbox-status`. Có thể chạy benchmark khi API, PostgreSQL và Kafka đang hoạt động:

```powershell
npm run benchmark:kafka -- 5 30
```

Lệnh mẫu gửi khoảng 5 giao dịch mỗi giây trong 30 giây. Địa chỉ API có thể được thay đổi bằng biến `API_URL`.

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy frontend và API ở chế độ phát triển |
| `npm run build` | Build frontend |
| `npm run start` | Chạy API |
| `npm run db:migrate --workspace server` | Áp dụng migration chưa chạy |
| `npm run db:backup` | Sao lưu PostgreSQL |
| `npm run db:restore -- backups/<ten-file>.dump` | Phục hồi từ file backup |
| `npm run db:reset` | Xem database đích và hướng dẫn reset |
| `npm run seed` | Cào/chuẩn hóa catalog và tạo dữ liệu demo |
| `npm run benchmark:kafka -- 5 30` | Chạy benchmark Kafka |
