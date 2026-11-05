# Flow phục hồi database

Tài liệu này áp dụng cho dự án `store-admin`, dùng PostgreSQL trong Docker Compose. Các lệnh bên dưới chạy trong PowerShell tại thư mục `D:\HTTTDN\store-admin`.

## 1. Chọn đúng cách xử lý

| Tình trạng | Cách xử lý |
|---|---|
| Web/API không phản hồi, Docker hoặc PostgreSQL đang tắt | Khởi động dịch vụ ở mục 2. Chưa cần restore/reset database. |
| Database còn chạy nhưng dữ liệu bị mất/sai, có file backup `.dump` | Restore file backup ở mục 4. Thao tác thay thế dữ liệu hiện tại. |
| Muốn xóa database local và dựng lại từ đầu | Dùng reset ở mục 5. Reset tạo backup tự động trước khi xóa. |
| Chỉ muốn cập nhật cấu trúc database | Chạy migration ở mục 6; không reset database. |

Kafka là hàng đợi sự kiện, không phải nơi lưu database chính. Nếu Kafka tắt, trước hết khởi động Kafka và để hệ thống xử lý outbox; không restore PostgreSQL chỉ vì Kafka chưa chạy.

## 2. Khi Docker hoặc PostgreSQL chưa chạy

Mở Docker Desktop, sau đó kiểm tra và khởi động các service cần thiết:

```powershell
docker compose --env-file server/.env ps
docker compose --env-file server/.env up -d postgres kafka
```

Chờ PostgreSQL khỏe mạnh rồi kiểm tra API:

```powershell
docker compose --env-file server/.env ps
Invoke-RestMethod http://localhost:5000/api/health
```

Nếu API chưa chạy, mở terminal tại `store-admin` và chạy:

```powershell
npm run dev
```

Chỉ chuyển sang restore khi database thật sự cần khôi phục từ backup.

## 3. Tạo backup trước khi phục hồi

Nếu database hiện tại còn truy cập được, tạo một bản backup trước khi thay thế dữ liệu:

```powershell
npm run db:backup
```

Script lưu file custom-format `.dump` trong `store-admin/backups/`. Nó đọc cấu hình từ `server/.env` (nếu thiếu giá trị thì dùng `server/.env.example`) và chỉ cho phép backup/restore trực tiếp khi `POSTGRES_HOST` là `localhost`, `127.0.0.1` hoặc `::1`.

Giữ file backup ở vị trí an toàn. Không xóa hoặc ghi đè file backup duy nhất.

## 4. Restore từ file `.dump`

### Cách A: giao diện Cài đặt (Admin)

1. Đăng nhập bằng tài khoản Admin và mở **Cài đặt hệ thống**.
2. Chọn file `.dump` đáng tin cậy (tối đa 512 MB).
3. Nhập chính xác tên database đang hiển thị để xác nhận.
4. Chọn **Phục hồi và thay thế dữ liệu**.

Mặc định chức năng này bị tắt. Chỉ khi thật sự cần dùng, đặt `ENABLE_DATABASE_RESTORE=true` trong `server/.env`, rồi khởi động lại backend. Endpoint restore yêu cầu đăng nhập Admin; không bật chức năng này trên môi trường có người dùng không đáng tin cậy. Sau khi phục hồi xong, nên tắt lại bằng `ENABLE_DATABASE_RESTORE=false` và khởi động lại backend.

Giao diện kiểm tra phần mở rộng, dung lượng, tên database xác nhận và định dạng PostgreSQL custom trước khi nạp. Restore thay thế dữ liệu hiện có; file upload tạm được xóa sau thao tác.

### Cách B: dòng lệnh

Kiểm tra đường dẫn file tồn tại, rồi chạy với đúng tên file:

```powershell
pg_restore --list .\backups\ten-file.dump
npm run db:restore -- .\backups\ten-file.dump
```

Ví dụ, thay `ten-file.dump` bằng tên file backup thực tế. Lệnh restore dùng `--clean --if-exists --no-owner`; các object tương ứng trong database đích bị thay thế. Kiểm tra lại host, port, tên database trong `server/.env` trước khi chạy. Không chạy restore vào database khác với mục tiêu dự định.

Nếu máy chưa cài PostgreSQL client tools, cài/cấu hình `PG_RESTORE_PATH` hoặc dùng **Cách A**. Script CLI cũng thử dùng Docker container `store-postgres` khi `pg_restore` trên máy không chạy được.

### Sau khi restore

1. Chạy migration để áp dụng các migration mới hơn file backup:

   ```powershell
   npm run db:migrate --workspace server
   ```

2. Khởi động lại API nếu cần và kiểm tra `http://localhost:5000/api/health`.
3. Đăng nhập Admin, kiểm tra một số màn hình/dữ liệu quan trọng và xem log backend.
4. Chỉ chạy `npm run seed` nếu muốn bổ sung dữ liệu demo. Seed không phải bước bắt buộc sau mọi lần restore.

## 5. Reset database local từ đầu

Reset sẽ xóa database hiện tại, tạo lại schema và chạy migration. Script chỉ cho phép host local, từ chối database hệ thống và tạo backup trước khi xóa.

Trước tiên xem database đích; lệnh này chưa xóa dữ liệu:

```powershell
npm run db:reset
```

Đọc kỹ host và tên database được in ra. Chỉ tiếp tục nếu đúng database local cần làm mới:

```powershell
npm run db:reset -- --yes
```

Sau khi reset thành công, nếu cần dữ liệu demo:

```powershell
npm run seed
```

Không dùng reset để sửa lỗi kết nối Docker hoặc thay cho restore từ một backup có dữ liệu cần giữ.

## 6. Chỉ chạy migration

Khi database đang hoạt động và cần áp dụng cấu trúc mới mà không xóa dữ liệu:

```powershell
npm run db:migrate --workspace server
```

Migration runner chỉ chạy các migration chưa áp dụng và lưu lịch sử trong `store_admin_schema_migrations`.

## 7. Nếu quy trình thất bại

- Xác nhận Docker Desktop đang chạy và container `store-postgres` ở trạng thái healthy.
- Kiểm tra `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER` trong `server/.env`; không chia sẻ hoặc ghi mật khẩu vào tài liệu/log.
- Kiểm tra file `.dump` có dung lượng lớn hơn 0 và `pg_restore --list` đọc được danh sách nội dung.
- Đọc thông báo đầy đủ của lệnh/API trước khi thử lại. Nếu restore lỗi giữa chừng bằng CLI, database có thể đã bị thay đổi một phần; dừng ghi dữ liệu và khôi phục lại từ một backup hợp lệ.
- Giữ nguyên các file backup cho đến khi đã xác nhận ứng dụng hoạt động bình thường sau phục hồi.

## Ghi nhớ

- `db:backup`: tạo file `.dump` trong `backups/`.
- `db:restore`: thay thế object/dữ liệu trong database đích bằng nội dung file dump.
- `db:reset -- --yes`: tạo backup tự động rồi drop/create database local và chạy migration.
- `db:migrate`: chỉ cập nhật schema bằng migration chưa chạy.
- `seed`: tạo dữ liệu demo; không phải thao tác phục hồi backup.
