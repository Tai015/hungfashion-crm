# Các chức năng còn thiếu / cần hoàn thiện

Tài liệu này tổng hợp các khoảng trống quan sát được khi rà giao diện và API hiện có của đồ án. Đây là đánh giá theo mã nguồn hiện tại, không thay thế yêu cầu chính thức của đề tài. Một số chức năng đã có API nhưng chưa thấy luồng thao tác tương ứng trên giao diện.

## Ưu tiên cao — hoàn thiện quy trình mua hàng

- [ ] **Giỏ hàng và đặt hàng cho khách:** trang khách hàng hiện xem, tìm kiếm và sắp xếp sản phẩm; chưa thấy thao tác thêm vào giỏ, quản lý số lượng, nhập địa chỉ giao hàng hoặc xác nhận đơn.
- [ ] **Theo dõi đơn hàng phía khách:** chưa thấy trang lịch sử đơn hàng, xem chi tiết, trạng thái giao hàng hoặc hủy đơn. API quản lý đơn hiện có nhưng giao diện đơn hàng chỉ dành cho nhân viên bán hàng.
- [ ] **Thanh toán trực tuyến:** chưa thấy luồng chọn phương thức thanh toán hoặc tích hợp cổng thanh toán. Backend có API cập nhật trạng thái thanh toán, nhưng chưa thấy giao diện sử dụng API này.
- [ ] **Quản lý đơn hàng trên giao diện nhân viên:** hiện có danh sách đơn, cập nhật trạng thái và xuất hóa đơn PDF; chưa thấy thao tác tạo đơn mới hoặc cập nhật trạng thái thanh toán trên màn hình.

## Ưu tiên trung bình — hoàn thiện nghiệp vụ quản lý

- [ ] **Nhập/xuất kho:** màn hình kho hiện xem danh sách phiếu; chưa thấy giao diện tạo phiếu nhập hoặc phiếu xuất, nhập chi tiết sản phẩm/số lượng và xác nhận giao dịch.
- [ ] **Quản lý nhà cung cấp:** chưa thấy màn hình thêm, sửa hoặc tra cứu nhà cung cấp. Hiện thông tin nhà cung cấp được dùng trong màn hình sản phẩm và phiếu kho.
- [ ] **Quản lý nhân viên:** màn hình hiện hiển thị danh sách nhân viên; chưa thấy giao diện thêm hoặc chỉnh sửa nhân viên, dù API có các thao tác tương ứng.
- [ ] **Quản lý khuyến mãi:** màn hình hiện hiển thị danh sách chương trình; chưa thấy giao diện tạo/sửa khuyến mãi hoặc phân bổ mã khuyến mãi cho khách hàng.
- [ ] **Ví ưu đãi của khách hàng:** chưa thấy trang khách xem các khuyến mãi được phân bổ hoặc áp dụng mã vào đơn hàng.

## Ưu tiên bổ sung — hoàn thiện trải nghiệm và quyền truy cập

- [ ] **Lịch sử tương tác của khách:** chưa thấy trang khách xem lại phản hồi đã gửi, câu trả lời từ cửa hàng hoặc các đơn mua trước đó.
- [ ] **Điểm thưởng và lịch sử tích điểm:** dự án có nghiệp vụ/hạng khách hàng, nhưng chưa thấy giao diện cho khách xem điểm, lịch sử tích lũy hoặc đổi ưu đãi.
- [ ] **Menu tác nghiệp cho quản trị viên:** menu ADMIN hiện chưa hiển thị các màn hình nhân viên, kho, phiếu kho, đơn hàng và khuyến mãi, dù một số API cho phép vai trò ADMIN truy cập. Cần xác nhận đây là chủ đích phân quyền hay cần bổ sung lối truy cập.

## Ghi chú về phạm vi hiện có

- Đã có giao diện quản lý sản phẩm và khách hàng; không liệt kê các thao tác CRUD này là còn thiếu.
- Đã có trang khách xem sản phẩm, cập nhật hồ sơ, gửi phản hồi và làm khảo sát.
- Đã có giao diện nhân viên xem đơn, cập nhật trạng thái đơn và xuất PDF hóa đơn.
- Các API tạo đơn, tạo phiếu kho, quản lý nhân viên/khuyến mãi và trạng thái thanh toán đã hiện diện ở backend; các mục liên quan phía trên chủ yếu là khoảng trống giao diện và quy trình sử dụng.

Tham chiếu: [giao diện phân quyền](./store-admin/client/src/App.jsx), [cổng khách hàng](./store-admin/client/src/CustomerPortal.jsx), [màn hình tác nghiệp](./store-admin/client/src/views/OperationsView.jsx), [các API backend](./store-admin/server/src/routes).
