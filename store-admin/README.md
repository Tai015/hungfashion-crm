# Hung Fashion CRM

Hệ thống CRM quản lý cửa hàng thời trang, gồm giao diện web, API, PostgreSQL và Kafka.

## Chức năng

- Đăng nhập và phân quyền theo vai trò: ADMIN, QL_NHAN_SU, QL_KHO, QL_BAN_HANG, QL_KHACH_HANG, KHACH_HANG.
- Quản lý sản phẩm, nhà cung cấp, nhân viên, khách hàng, đơn hàng, phản hồi và khảo sát.
- Khách hàng có thể đính kèm tối đa 4 ảnh/video cho mỗi đánh giá sản phẩm (25 MB mỗi tệp).
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

Ảnh/video đánh giá được lưu trong `server/uploads/feedback` và chỉ chủ đánh giá cùng vai trò ADMIN/QL_KHACH_HANG được xem. Khi triển khai lên máy chủ, hãy gắn thư mục này với persistent volume và sao lưu riêng; migration `010_feedback_attachments.sql` tạo bảng metadata trong PostgreSQL.

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
| `DEMO_PAYMENT` | Bật trang xác nhận thanh toán mô phỏng khi đặt `true`; mặc định `false` |
| `PUBLIC_BASE_URL` | URL gốc mà điện thoại truy cập được, dùng để tạo liên kết QR demo; ví dụ `http://192.168.1.10:5000` hoặc URL tunnel HTTPS |
| `JWT_SECRET` | Khóa ký token đăng nhập |
| `POSTGRES_HOST`, `POSTGRES_PORT` | Máy chủ và cổng PostgreSQL |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database và tài khoản PostgreSQL |
| `POSTGRES_SSL` | Bật TLS khi kết nối PostgreSQL bên ngoài, ví dụ Aiven |
| `POSTGRES_CA_PATH` | Đường dẫn CA PEM; tương đối từ thư mục dự án, bắt buộc khi bật `POSTGRES_SSL=true` |
| `KAFKA_BROKER` | Địa chỉ Kafka, mặc định local là `localhost:9092` |
| `KAFKA_BROKERS` | Danh sách broker, phân cách bằng dấu phẩy; ưu tiên hơn KAFKA_BROKER |
| `KAFKA_SSL_CA` | Chứng chỉ CA PEM cho TLS; dùng chuỗi \\n cho ký tự xuống dòng |
| `KAFKA_SSL_CERT` / `KAFKA_SSL_KEY` | Cặp chứng chỉ và khóa PEM khi nhà cung cấp yêu cầu mutual TLS |
| `KAFKA_SSL_CA_PATH` / `KAFKA_SSL_CERT_PATH` / `KAFKA_SSL_KEY_PATH` | Đường dẫn chứng chỉ TLS; đường dẫn tương đối tính từ thư mục dự án, được ưu tiên hơn giá trị PEM trực tiếp |
| `KAFKA_UI_PORT` | Cổng Kafka UI, mặc định `8080` |
| `TRUST_PROXY_HOPS` | Số proxy tin cậy để lấy IP client; local `0`, Railway `1` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Cửa sổ giới hạn login/đăng ký, mặc định `900000` ms |
| `AUTH_LOGIN_RATE_LIMIT_MAX` | Số lần login tối đa trong cửa sổ, mặc định `10` |
| `AUTH_REGISTER_RATE_LIMIT_MAX` | Số lần đăng ký tối đa theo IP trong cửa sổ, mặc định `10` |
| `CHAT_UPLOAD_DIR` | Thư mục lưu ảnh chat; mặc định `server/uploads/chat` khi chạy local |
| `ENABLE_DATABASE_BROWSER` | Bật/tắt API xem bảng database |
| `ENABLE_DATABASE_RESTORE` | Bật/tắt API phục hồi database |
| `DEBUG_CHAT_SSE` | In số kết nối SSE đang mở khi bật `true` |
| `PYTHON_EXECUTABLE` | Lệnh hoặc đường dẫn đến Python |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | Đường dẫn đến công cụ sao lưu/phục hồi PostgreSQL |

Các giá trị trong `.env.example` dành cho môi trường phát triển local. Hãy thay đổi thông tin xác thực trước khi triển khai.

## Triển khai demo lên Railway

Repo đã có `Dockerfile`, `railway.json` và `railway.env.example`. Railway sẽ build web React và API vào cùng một service; PostgreSQL và Kafka là hai service riêng.

1. Tạo project Railway, thêm service PostgreSQL và deploy template Apache Kafka trong **cùng project/environment**. Đặt tên service Kafka là `kafka`, đợi Kafka báo deploy thành công; dùng private network, không cần mở TCP proxy công khai.
2. Thêm app service. Có thể nối app service với GitHub repo hoặc deploy trực tiếp từ máy bằng Railway CLI. Khi dùng GitHub, vì ứng dụng nằm trong thư mục con, đặt **Root Directory** thành `/store-admin`. Khi dùng CLI, chạy terminal tại thư mục `store-admin`, liên kết project/service bằng `railway link`, rồi deploy bằng `railway up`. Cả hai cách đều build từ `Dockerfile` trong thư mục này.
3. Trong Variables của app service, tạo `JWT_SECRET` bằng chuỗi ngẫu nhiên dài; thêm các biến PostgreSQL tham chiếu service Postgres và Kafka:

   ```text
   POSTGRES_HOST=${{Postgres.PGHOST}}
   POSTGRES_PORT=${{Postgres.PGPORT}}
   POSTGRES_DB=${{Postgres.PGDATABASE}}
   POSTGRES_USER=${{Postgres.PGUSER}}
   POSTGRES_PASSWORD=${{Postgres.PGPASSWORD}}
   KAFKA_BROKER=${{kafka.RAILWAY_PRIVATE_DOMAIN}}:9092
   ENABLE_DATABASE_BROWSER=false
   ENABLE_DATABASE_RESTORE=false
   SERVE_CLIENT=true
   FEEDBACK_UPLOAD_DIR=/data/feedback
   CHAT_UPLOAD_DIR=/data/chat
   TRUST_PROXY_HOPS=1
   AUTH_RATE_LIMIT_WINDOW_MS=900000
   AUTH_LOGIN_RATE_LIMIT_MAX=10
   AUTH_REGISTER_RATE_LIMIT_MAX=10
   ```

   `TRUST_PROXY_HOPS=1` giúp rate limit nhận đúng IP người dùng phía sau proxy Railway. Nếu đặt tên service database khác `Postgres`, đổi phần `Postgres` trong các reference cho khớp. Giữ tên Kafka là `kafka` hoặc sửa reference cho khớp chính xác.
4. Thêm **Volume** cho app service, mount vào `/data`. Ảnh/video đánh giá lưu ở `/data/feedback`, ảnh chat lưu ở `/data/chat`; cả hai còn lại sau khi app được deploy lại.
5. Deploy app, rồi tạo public domain trong Railway Networking. Migrations được áp dụng tự động khi API khởi động. Kafka là broker đơn nên phù hợp demo/traffic nhỏ; không có dự phòng HA.
6. Seed dữ liệu demo vào PostgreSQL local hoặc Aiven bằng lựa chọn tường minh `SEED_TARGET`. Không chạy seed trong Railway nếu chưa chủ động chọn database đích và sao lưu dữ liệu trước.

`railway.env.example` là mẫu tham khảo, không phải file secret tự nạp. Không commit mật khẩu database, `JWT_SECRET` thật, `SEED_DEMO_PASSWORD` hoặc thông tin tài khoản ngân hàng. Chi phí Railway phụ thuộc mức sử dụng tài nguyên và gói tài khoản.

### Thanh toán DEMO (không có tiền thật)

Để trình diễn QR mà không kết nối ngân hàng, đặt `DEMO_PAYMENT=true` và cấu hình `PUBLIC_BASE_URL` thành địa chỉ mà điện thoại có thể mở. Với máy tính và điện thoại cùng Wi-Fi, tìm IPv4 LAN của máy chạy API (ví dụ `192.168.1.10`) rồi đặt `PUBLIC_BASE_URL=http://192.168.1.10:5000`. API tự bind `0.0.0.0` khi bật demo để thiết bị khác trong mạng truy cập được; nếu Windows Firewall hỏi, cho phép Node.js trên mạng riêng. Khi dùng tunnel, đặt URL HTTPS gốc của tunnel. Khởi động lại API sau khi đổi biến.

Trong checkout, chọn **Thanh toán bằng QR** khi `DEMO_PAYMENT=true`. Mã QR được tạo cục bộ trong trình duyệt và mở trang tự xác nhận mang nhãn **DEMO - không phải giao dịch thật**. Không có ngân hàng, SePay hay tiền thật tham gia. Token ngẫu nhiên 32 byte chỉ lưu dạng SHA-256 trong database và hết hạn sau 15 phút. Checkout tự kiểm tra trạng thái mỗi 5 giây; khi nhân viên xác nhận thanh toán thủ công hoặc trang demo xác nhận, checkout đổi sang màn hình thành công. Khi `DEMO_PAYMENT=false`, hai route `/pay/demo/...` trả 404 và API từ chối tạo đơn QR mới; khách có thể chọn tiền mặt. Nhân viên vẫn xác nhận thủ công các đơn chờ hiện có qua màn hình quản lý.

Ví dụ kiểm tra bằng curl (thực hiện trên database thử nghiệm; tạo `$TOKEN` bằng cách đặt một đơn chuyển khoản trong checkout demo):

```sh
export BASE='http://localhost:5000'
export TOKEN='<token lấy từ demo_payment_url trong response tạo đơn>'

# GET chỉ trả trang; dùng truy vấn SQL ở dưới để xác nhận used_at vẫn NULL.
curl -i "$BASE/pay/demo/$TOKEN"

# Xác nhận lần đầu: HTTP 200, success=true. Gọi lại vẫn HTTP 200 và không cộng điểm/ghi audit lần nữa.
curl -i -X POST "$BASE/pay/demo/$TOKEN/confirm"
curl -i -X POST "$BASE/pay/demo/$TOKEN/confirm"

# Mã ngẫu nhiên không tồn tại: HTTP 404.
curl -i "$BASE/pay/demo/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
```

Để kiểm tra GET không đổi trạng thái, tính SHA-256 của token ở máy local và kiểm tra trước/sau GET:

```sh
TOKEN_HASH=$(node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$TOKEN")
psql "$DATABASE_URL" -c "SELECT used_at FROM demo_payment_tokens WHERE token_hash='$TOKEN_HASH';"
curl -i "$BASE/pay/demo/$TOKEN"
psql "$DATABASE_URL" -c "SELECT used_at FROM demo_payment_tokens WHERE token_hash='$TOKEN_HASH';"
```

Kiểm tra token hết hạn trên database thử nghiệm bằng `UPDATE demo_payment_tokens SET expires_at=NOW()-INTERVAL '1 minute' WHERE token_hash='<TOKEN_HASH>';`, rồi POST confirm phải trả HTTP 410. Đặt `DEMO_PAYMENT=false`, khởi động lại server và gọi GET/POST trên cùng route: cả hai phải trả HTTP 404.

## Database và migration

`server/sql/schema.sql` là cấu trúc nền ban đầu, bao gồm các dữ liệu danh mục cần thiết như vai trò, quyền, danh mục sản phẩm, size, màu và sở thích. Các migration hiện có được đánh số liên tục:

| Version | Tên file | Mục đích |
|---|---|---|
| 001 | `001_create_indexes.sql` | Index phục vụ lọc, tìm kiếm và báo cáo |
| 002 | `002_structure_event_records.sql` | Chuyển dữ liệu sự kiện cũ sang các cột có cấu trúc |
| 003 | `003_outbox_events.sql` | Outbox và khóa chống xử lý trùng sự kiện |
| 004 | `004_crm_schema_gap.sql` | Bổ sung các thành phần CRM cho schema cũ |
| 005 | `005_crm_integrity_constraints.sql` | Ràng buộc phản hồi và câu trả lời khảo sát |
| 006 | `006_chat.sql` | Hội thoại hỗ trợ và tin nhắn |
| 007 | `007_order_shipping_address.sql` | Địa chỉ giao hàng của đơn hàng |
| 008 | `008_loyalty_point_transactions.sql` | Lịch sử giao dịch điểm thưởng |
| 009 | `009_survey_target_interest_reward.sql` | Lọc khảo sát theo sở thích và mã thưởng |
| 010 | `010_feedback_attachments.sql` | Metadata ảnh/video đính kèm đánh giá sản phẩm |
| 011 | `011_username_case_insensitive.sql` | Username duy nhất, không phân biệt chữ hoa/thường |
| 012 | `012_chat_image_attachments.sql` | Metadata ảnh đính kèm tin nhắn chat |
| 013 | `013_chat_video_attachments.sql` | Cho phép metadata video đính kèm tin nhắn chat |
| 014 | `014_demo_payment_tokens.sql` | Token một lần, hết hạn cho thanh toán demo |

Dữ liệu chat hỗ trợ tối đa 4 tệp mỗi tin nhắn: ảnh JPG/PNG/WebP/GIF tối đa 5 MB mỗi ảnh và video MP4/WebM tối đa 25 MB mỗi video. Máy chủ kiểm tra chữ ký tệp; chỉ khách sở hữu hội thoại và nhân viên CSKH được tải nội dung.

Dữ liệu demo về tài khoản, nhà cung cấp, sản phẩm, khách hàng, đơn hàng, phản hồi và khảo sát được tạo bởi `npm run seed`. Như vậy schema/migration chịu trách nhiệm về cấu trúc; script seed chịu trách nhiệm về dữ liệu dùng để chạy thử.

Migration runner lưu version đã áp dụng trong bảng `store_admin_schema_migrations` và tự chạy migration mới khi khởi động API. Khi thay đổi cấu trúc database, hãy tạo migration mới với version tiếp theo, ví dụ `015_add_product_color.sql`.

Để khởi tạo một database PostgreSQL trống bằng một file SQL, chạy từ thư mục `store-admin`:

```powershell
psql -v ON_ERROR_STOP=1 -h localhost -U store_admin -d store_admin -f server/sql/bootstrap.sql
```

`bootstrap.sql` gồm `schema.sql` và migrations `001`–`013`, đồng thời ghi version migration đã áp dụng. Chỉ chạy file này một lần trên database trống. Migration `014` sẽ được runner tự áp dụng khi API khởi động. Sau đó chạy `npm run seed` để tạo dữ liệu demo; không dùng file bootstrap để cập nhật database đang có dữ liệu.

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

Seed đọc cấu hình PostgreSQL từ `server/.env` và cần `SEED_DEMO_PASSWORD` dài 8–72 byte UTF-8. Nhập mật khẩu vào biến môi trường của PowerShell hiện tại; không ghi mật khẩu thật vào `.env.example` hoặc commit vào Git. Chạy migration trước khi seed. Đặt `SEED_USE_EXISTING_CATALOG=true` nếu đã có catalog chuẩn hóa và muốn bỏ bước cào dữ liệu.

**Seed vào PostgreSQL local** (mặc định; chỉ chấp nhận host loopback):

```powershell
$env:SEED_TARGET = 'local'
$env:SEED_DEMO_PASSWORD = Read-Host 'Mật khẩu tài khoản demo'
$env:SEED_USE_EXISTING_CATALOG = 'true'
npm run seed
```

Đảm bảo `POSTGRES_HOST` là `localhost` hoặc `127.0.0.1`, `POSTGRES_SSL=false`, và PostgreSQL local đang chạy.

**Seed vào Aiven**: sao lưu database trước và xác nhận đúng database đích. Cấu hình `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_SSL=true` và `POSTGRES_CA_PATH` trong `server/.env`. Đường dẫn CA tương đối được tính từ thư mục `store-admin`; kết nối xác minh chứng thư máy chủ.

```powershell
$env:SEED_TARGET = 'aiven'
$env:SEED_DEMO_PASSWORD = Read-Host 'Mật khẩu tài khoản demo'
$env:SEED_USE_EXISTING_CATALOG = 'true'
npm run seed
```

Chỉ đặt `SEED_TARGET=aiven` khi thực sự muốn ghi dữ liệu vào Aiven. Script từ chối host từ xa ở chế độ `local`, và từ chối Aiven nếu SSL/CA chưa được cấu hình.

Các lệnh catalog:

```powershell
npm run catalog:scrape
npm run catalog:scrape -- --force
npm run seed
```

Lệnh `--force` tải catalog lại từ nguồn. Nút **Cào và nhập sản phẩm** trong phần Cài đặt chạy cùng pipeline và cập nhật sản phẩm, biến thể, hình ảnh, danh mục, thương hiệu trong database.

## Tài khoản chạy thử

Sau khi chạy `npm run seed`, các tài khoản dưới đây dùng mật khẩu đã nhập qua `SEED_DEMO_PASSWORD`.

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
| KHACH_HANG (đã khóa, demo) | `demo-khach-khoa@hungfashion.local` | `demo_khach_khoa` |

Mật khẩu được băm trước khi lưu trong PostgreSQL. Đây là thông tin đăng nhập demo; không dùng cho môi trường thật.

Seed cũng tạo hồ sơ `demo-xoa-khach@hungfashion.local` chưa liên kết tài khoản và chưa có lịch sử để thử xóa, cùng hồ sơ `demo-chan-xoa@hungfashion.local` có đơn `SEED-ORDER-DEMO-DELETE-BLOCKER` để thử trường hợp bị chặn xóa. Ba mã khuyến mãi mẫu là `DEMO10`, `DEMO50K` và `SURVEY10`.

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
