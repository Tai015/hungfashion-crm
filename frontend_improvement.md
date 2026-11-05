# Đánh giá và đề xuất cải thiện frontend

## Phạm vi kiểm tra

- Frontend React/Vite chạy tại `http://127.0.0.1:5173/`.
- Chạy lệnh build `npm run build --workspace client`.
- Kiểm tra trang đăng nhập/đăng ký trên trình duyệt, thao tác chuyển biểu mẫu và hiện/ẩn mật khẩu.
- Thử hiển thị giao diện ở viewport rộng 390px.
- Backend tại `localhost:5000` không hoạt động trong lần kiểm tra, nên chưa xác nhận được các luồng cần API và dữ liệu thật.

## Kết quả hiện tại

- Build frontend thành công.
- Trang đăng nhập và đăng ký hiển thị; có thể chuyển đổi giữa hai biểu mẫu.
- Nút hiện/ẩn mật khẩu hoạt động.
- Các trường bắt buộc và ràng buộc cơ bản được khai báo: email, tên đăng nhập và độ dài mật khẩu.
- Ở viewport 390px, không thấy nội dung tràn ngang trên màn hình đăng nhập/đăng ký.
- Khi thử đăng nhập mà backend không sẵn sàng, giao diện hiển thị lỗi HTTP 500 và giữ người dùng ở trang đăng nhập.

## Đề xuất cải thiện

### Ưu tiên cao

- [ ] **Cải thiện độ tương phản của biểu mẫu xác thực:** chữ mô tả, nhãn và placeholder hiện khá nhạt trên thẻ nền mờ. Tăng độ tương phản giữa chữ với nền, đồng thời kiểm tra trạng thái focus và disabled.
- [ ] **Hiển thị lỗi kết nối thân thiện hơn:** phân biệt lỗi không kết nối được backend với thông tin đăng nhập sai hoặc lỗi máy chủ. Tránh thông báo chung như “Yêu cầu thất bại (500)” khi có thể hướng dẫn người dùng thử lại sau.
- [ ] **Kiểm thử giao diện sau đăng nhập:** xác nhận các vai trò và trang quản trị hoạt động trên dữ liệu thật khi backend, PostgreSQL và Kafka sẵn sàng.

### Ưu tiên trung bình

- [ ] **Giảm kích thước bundle:** build hiện cảnh báo một JavaScript bundle khoảng 1.276 kB sau minify, lớn hơn ngưỡng cảnh báo 500 kB. Xem xét lazy-load các màn hình, tách các thư viện/nhóm tính năng lớn và đo lại kích thước sau thay đổi.
- [ ] **Kiểm tra responsive toàn diện:** thử thêm các viewport di động, máy tính bảng và màn hình rộng trên dashboard, bảng dữ liệu, biểu mẫu và menu điều hướng; phép thử hiện tại chỉ bao phủ trang xác thực ở 390px.
- [ ] **Đánh giá tài nguyên bên ngoài:** giao diện tải font và hình nền từ dịch vụ bên ngoài. Kiểm tra trạng thái khi không có mạng, độ ổn định tải và phương án dự phòng phù hợp.

## Giới hạn kiểm thử

- Chưa xác minh đăng nhập thành công, đăng ký tài khoản hoặc bất kỳ trang nào cần API vì backend không chạy; yêu cầu đăng nhập thử trả HTTP 500.
- Lần kiểm tra này không xác nhận nghiệp vụ CRUD, phân quyền, báo cáo, đơn hàng, kho, khảo sát hoặc phản hồi với dữ liệu thật.
- Kết quả build không thay thế kiểm thử chức năng trên toàn bộ luồng nghiệp vụ.
