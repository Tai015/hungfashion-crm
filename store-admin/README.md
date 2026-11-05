# Hung Fashion CRM

Ứng dụng quản lý cửa hàng thời trang gồm trang mua sắm dành cho khách, khu vực quản trị dành cho nhân viên, API, PostgreSQL và Kafka.

## Chức năng

- **Khách vãng lai:** xem danh mục sản phẩm trước khi đăng nhập.
- **Khách hàng:** đăng ký tài khoản, chọn sở thích mua sắm, đặt hàng và theo dõi đơn.
- **Nhân viên và quản trị:** đăng nhập qua trang nhân viên, làm việc theo quyền được cấp.
- **Quản lý kho:** quản lý nhà cung cấp, phiếu nhập/xuất, số lượng và giá nhập; xem báo cáo biến động kho, giá trị tồn, hàng sắp hết và nhập theo nhà cung cấp.
- **Quản lý nhân sự:** quản lý hồ sơ nhân viên và xem thống kê theo trạng thái, chức vụ/vai trò, tháng vào làm. Đồ án chưa có chấm công, lương hoặc nghỉ phép.
- **Các vai trò khác:** quản lý bán hàng, khách hàng, sản phẩm, đơn hàng, khuyến mãi, phản hồi, khảo sát và hỗ trợ khách hàng theo quyền.
- **Báo cáo:** lọc theo thời gian, xem bảng/biểu đồ và xuất CSV tùy vai trò.
- **Vận hành:** lưu dữ liệu trên PostgreSQL, truyền sự kiện qua Kafka, sao lưu/phục hồi database và đóng gói trình khởi chạy Electron cho Windows.

## Vai trò

| Vai trò | Phạm vi chính |
|---|---|
| ADMIN | Toàn bộ hệ thống |
| QL_NHAN_SU | Hồ sơ nhân viên và báo cáo nhân sự |
| QL_KHO | Kho, phiếu nhập/xuất và báo cáo kho |
| QL_BAN_HANG | Đơn hàng, khuyến mãi và báo cáo bán hàng |
| QL_KHACH_HANG | Hồ sơ khách hàng, phản hồi, khảo sát và hỗ trợ |
| KHACH_HANG | Mua sắm và quản lý thông tin khách hàng |

Trang đăng nhập khách hàng và trang đăng nhập nhân viên là hai luồng riêng. Tài khoản nhân viên không được xác thực như tài khoản khách hàng.

## Công nghệ và yêu cầu

- Node.js 22 trở lên và npm.
- Docker Desktop với Docker Compose để chạy PostgreSQL và Kafka local.
- Python 3 và pip khi cần cào catalog.
- PostgreSQL client tools (`pg_dump`, `pg_restore`) cho sao lưu/phục hồi.
- Windows để tạo bộ cài Electron NSIS.

## Chạy local lần đầu

Các lệnh dưới đây chạy từ thư mục `store-admin`.

### 1. Cài đặt

```powershell
npm ci
Copy-Item server/.env.example server/.env
```

Mở `server/.env`. Thay `JWT_SECRET` bằng giá trị riêng. Kiểm tra `LOCAL_URL`, `LOCAL_HOST`, `PORT` và cấu hình PostgreSQL/Kafka.

### 2. Khởi động dịch vụ và tạo schema

Mở Docker Desktop, sau đó chạy:

```powershell
docker compose --env-file server/.env up -d postgres kafka
npm run db:migrate --workspace server
```

### 3. Tạo dữ liệu demo (tùy chọn)

Seed yêu cầu mật khẩu demo được nhập vào terminal. Với catalog đã có trong `data/clean/products.json`, chạy:

```powershell
$env:SEED_TARGET = 'local'
$env:SEED_DEMO_PASSWORD = Read-Host 'Mật khẩu tài khoản demo'
$env:SEED_USE_EXISTING_CATALOG = 'true'
npm run seed
```

Nếu chưa có catalog sạch, cài thư viện Python và bỏ biến `SEED_USE_EXISTING_CATALOG` để seed gọi scraper:

```powershell
python -m pip install -r server/settings/requirements.txt
Remove-Item Env:SEED_USE_EXISTING_CATALOG -ErrorAction SilentlyContinue
npm run seed
```

Seed local chỉ chấp nhận PostgreSQL trên máy local. Xem thêm phần [Seed an toàn](#seed-an-toàn) trước khi ghi vào database từ xa.

### 4. Chạy web và API

```powershell
npm run dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:5000>
- Health check: <http://localhost:5000/api/health>
- Kafka UI (khởi động riêng): <http://localhost:8080>

Để chạy Kafka UI: `docker compose --env-file server/.env up -d kafka-ui`.

Trang đăng nhập nhân viên thường ở `#/nhan-vien/login`; trang khách hàng ở `#/khach-hang/login`. Khi đang ở trang đăng nhập nhân viên chưa đăng nhập, có thể đổi hash URL sang trang khách hàng để chuyển màn hình.

## Tài khoản demo

Sau khi seed, các tài khoản dùng mật khẩu đã nhập ở bước trên:

| Vai trò | Tên đăng nhập | Email |
|---|---|---|
| ADMIN | `admin` | `admin@hungfashion.local` |
| ADMIN dự phòng | `admin2` | `admin2@hungfashion.local` |
| QL_NHAN_SU | `qlnhansu` | `nhansu@hungfashion.local` |
| QL_KHO | `qlkho` | `kho@hungfashion.local` |
| QL_BAN_HANG | `qlbanhang` | `banhang@hungfashion.local` |
| QL_KHACH_HANG | `qlkhachhang` | `crm@hungfashion.local` |
| KHACH_HANG | `khach1`, `khach2`, `khach3` | `khach1@hungfashion.local`, `khach2@hungfashion.local`, `khach3@hungfashion.local` |

Mật khẩu được băm trước khi lưu. Đây là tài khoản phục vụ demo; không dùng lại mật khẩu hoặc tài khoản demo trong môi trường thật.

## Đóng gói Electron trên Windows

Electron là trình khởi chạy. Các nút **Mở bản local** và **Mở deploy** mở trang đăng nhập nhân viên/quản trị trong trình duyệt mặc định.

1. Điền `DEPLOY_URL` trong `server/.env` nếu muốn nút **Mở deploy** mở website đã triển khai.
2. Cài dependency và tạo bộ cài:

```powershell
npm ci
npm run package:win
```

3. Gửi file `.exe` trong thư mục `release` cho người dùng Windows.

Trình đóng gói chỉ đưa URL deploy vào cấu hình Electron; các bí mật khác trong `.env` không được nhúng vào bộ cài. Khi đổi website deploy, tạo lại bộ cài. Ứng dụng chưa ký chứng thư phát hành có thể hiển thị cảnh báo SmartScreen.

Nút **Mở bản local** cần Docker Desktop và các biến `LOCAL_URL`, `LOCAL_HOST`, `PORT` hợp lệ trong `server/.env`. Nút **Xem database** chỉ bật khi `ENABLE_DATABASE_BROWSER=true`; không bật chức năng này trên máy chủ công khai.

## Cấu hình môi trường

Bản mẫu ở [server/.env.example](./server/.env.example). Tạo `server/.env` từ file mẫu; không commit file `.env` hoặc bí mật thật.

| Biến | Mục đích |
|---|---|
| `PORT` | Cổng API, local mặc định 5000 |
| `LOCAL_URL` | Địa chỉ giao diện local Electron mở |
| `LOCAL_HOST` | Host API local mà Electron kiểm tra |
| `DEPLOY_URL` | Website Electron mở khi chọn **Mở deploy** |
| `JWT_SECRET` | Khóa ký phiên đăng nhập; thay bằng chuỗi bí mật riêng |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Kết nối PostgreSQL |
| `POSTGRES_SSL`, `POSTGRES_CA_PATH` | TLS và CA khi dùng PostgreSQL từ xa |
| `KAFKA_BROKER`, `KAFKA_BROKERS` | Địa chỉ broker Kafka |
| `KAFKA_SSL_CA_PATH`, `KAFKA_SSL_CERT_PATH`, `KAFKA_SSL_KEY_PATH` | TLS Kafka nếu nhà cung cấp yêu cầu |
| `TRUST_PROXY_HOPS` | Số proxy tin cậy để Express lấy IP client; phải khớp cấu hình máy chủ |
| `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_LOGIN_RATE_LIMIT_MAX`, `AUTH_REGISTER_RATE_LIMIT_MAX` | Giới hạn thử đăng nhập và đăng ký |
| `FEEDBACK_UPLOAD_DIR`, `CHAT_UPLOAD_DIR` | Thư mục lưu tệp tải lên |
| `ENABLE_DATABASE_BROWSER`, `ENABLE_DATABASE_RESTORE` | Bật/tắt chức năng xem và phục hồi database |
| `PYTHON_EXECUTABLE` | Lệnh hoặc đường dẫn Python dùng cho scraper |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Đường dẫn công cụ sao lưu/phục hồi PostgreSQL |
| `DEMO_PAYMENT`, `PUBLIC_BASE_URL` | Bật thanh toán mô phỏng và URL điện thoại dùng để mở trang xác nhận |

IP đăng nhập được dùng để phát hiện cùng tài khoản truy cập từ IP khác. Nếu đổi số proxy tin cậy, hãy xác nhận với cấu hình reverse proxy. Phiên đã tạo trước khi bật lưu IP có thể cần đăng nhập lại một lần.

## Triển khai

Ứng dụng có Dockerfile ở thư mục gốc. Khi dùng GitHub với dịch vụ triển khai, đặt **Root Directory** thành `store-admin` để build đúng Dockerfile. Cấu hình PostgreSQL, Kafka, `JWT_SECRET`, `TRUST_PROXY_HOPS` và persistent volume cho dữ liệu tải lên theo môi trường triển khai. Không bật xem/phục hồi database trên dịch vụ công khai.

Với Railway, tạo PostgreSQL, Kafka và app trong cùng project; kết nối private network cho Kafka, mount volume vào `/data`, rồi cấu hình các biến môi trường của app. Migrations được áp dụng khi API khởi động.

### Lưu tệp tải lên

Ảnh/video đánh giá và tệp chat nằm trong các thư mục được đặt bởi `FEEDBACK_UPLOAD_DIR` và `CHAT_UPLOAD_DIR`. Khi deploy, dùng persistent volume và sao lưu riêng thư mục này cùng database. Giới hạn và loại tệp được kiểm tra ở API.

## Database và migration

- Schema khởi tạo: `server/sql/schema.sql`.
- Migration: `server/sql/migrations/`; API tự áp dụng migration chưa chạy khi khởi động.
- Áp dụng migration thủ công: `npm run db:migrate --workspace server`.
- Backup: `npm run db:backup`.
- Restore: `npm run db:restore -- backups/<ten-file>.dump`.
- Reset database local: `npm run db:reset`, xem lại host/database và chỉ xác nhận nếu chấp nhận xóa dữ liệu.

Tạo migration mới với version tiếp theo khi thay đổi schema. Backup trước khi reset hoặc restore. Không dùng lệnh reset với dữ liệu môi trường thật.

## Seed an toàn

Script seed yêu cầu chọn đích rõ ràng bằng `SEED_TARGET`:

- `local`: chỉ cho phép PostgreSQL loopback.
- `aiven`: yêu cầu cấu hình SSL và CA cho kết nối từ xa.

Trước khi seed vào database từ xa, sao lưu dữ liệu, kiểm tra host/database và chỉ đặt `SEED_TARGET=aiven` khi thật sự muốn ghi vào Aiven. Nhập `SEED_DEMO_PASSWORD` qua biến môi trường của terminal; không lưu mật khẩu vào README hoặc Git.

Cào mới catalog bằng `npm run catalog:scrape -- --force`. Scraper tuân thủ robots.txt và có khoảng nghỉ giữa các request.

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Chạy giao diện và API ở chế độ phát triển |
| `npm run build` | Build giao diện React |
| `npm run start` | Chạy API |
| `npm run db:migrate --workspace server` | Áp dụng migration |
| `npm run db:backup` / `npm run db:restore -- <file>` | Sao lưu/phục hồi PostgreSQL |
| `npm run db:reset` | Xem lại đích reset local |
| `npm run seed` | Tạo dữ liệu demo |
| `npm run catalog:scrape -- --force` | Cào lại catalog |
| `npm run benchmark:kafka -- 5 30` | Benchmark khoảng 5 giao dịch/giây trong 30 giây |

## Giấy phép

Đồ án học tập. Liên hệ chủ dự án trước khi tái sử dụng hoặc phân phối lại.
