# 00. Kiểm kê hệ thống từ mã nguồn

> Snapshot kiểm kê chỉ dựa trên mã nguồn, SQL trong repository và seed script. Không truy vấn database đang chạy. Các thông tin doanh nghiệp bên ngoài sản phẩm thời trang là giả định cần xác nhận.

## 1. Kiến trúc và vai trò

- Frontend: React + Vite, JavaScript, `store-admin/client`; dùng hash routes theo vai trò trong `client/src/App.jsx`. API: Express tại `server/src/index.js`. PostgreSQL qua `pg`; Kafka qua KafkaJS.
- Sáu vai trò trong schema/seed: `ADMIN`, `QL_NHAN_SU`, `QL_KHO`, `QL_BAN_HANG`, `QL_KHACH_HANG`, `KHACH_HANG`. Không thấy vai trò nghiệp vụ bổ sung trong SQL seed.
- Bản ghi vai trò và quyền có trong schema baseline; quyền thực tế được enforce chủ yếu bằng middleware tại `server/src/index.js` và kiểm tra bổ sung trong route.

| Vai trò | Màn hình chính trong frontend | Quyền API theo mount |
|---|---|---|
| ADMIN | Tổng quan, Báo cáo, Tài khoản, Khách hàng, Đơn hàng, Sản phẩm, Nhân viên, Tồn kho, Khuyến mãi, Phản hồi, Khảo sát, Chat CSKH, Nhật ký, Cài đặt | Quản trị tài khoản, nhân viên, CRM, kho, đơn, sản phẩm, khuyến mãi, phản hồi, khảo sát, báo cáo, cấu hình; đọc catalog |
| QL_NHAN_SU | Tổng quan, Báo cáo, Nhân viên | Nhân viên và báo cáo |
| QL_KHO | Tổng quan, Báo cáo, Sản phẩm, Tồn kho | Đọc sản phẩm; sửa sản phẩm và quản lý tồn kho |
| QL_BAN_HANG | Tổng quan, Báo cáo, Đơn hàng, Khuyến mãi | Đơn hàng, khuyến mãi; đọc sản phẩm |
| QL_KHACH_HANG | Tổng quan, Báo cáo, Khách hàng, Chat CSKH, Phản hồi, Khảo sát | CRM, chat, feedback, survey và báo cáo |
| KHACH_HANG | Catalog, Giỏ hàng, Thanh toán, Đơn của tôi, Voucher, Loyalty, Hồ sơ, Phản hồi, Khảo sát, Chat | Các luồng self-service được giới hạn theo route và chủ thể; một số trang khách là trong `CustomerPortal.jsx` |

## 2. Danh sách API

Các route dưới đây được ghép từ `server/src/index.js` và `server/src/routes/*.js`. “Vai trò mount” là quyền middleware ở cấp router; các handler có kiểm tra quyền/chủ sở hữu chi tiết được ghi chú riêng. API dùng JWT trừ đăng nhập/đăng ký, health và hai trang demo payment; route demo chỉ hoạt động khi cờ bật.

| Method | Đường dẫn | Vai trò/điều kiện | Mục đích |
|---|---|---|---|
| GET | `/api/accounts` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 51 trong `store-admin/server/src/routes/account.js` |
| GET | `/api/accounts/roles/all` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 93 trong `store-admin/server/src/routes/account.js` |
| GET | `/api/accounts/:id` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 103 trong `store-admin/server/src/routes/account.js` |
| POST | `/api/accounts` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 119 trong `store-admin/server/src/routes/account.js` |
| PATCH | `/api/accounts/:id/status` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 144 trong `store-admin/server/src/routes/account.js` |
| PATCH | `/api/accounts/:id/role` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 179 trong `store-admin/server/src/routes/account.js` |
| DELETE | `/api/accounts/:id` | ADMIN | Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền; khai báo dòng 220 trong `store-admin/server/src/routes/account.js` |
| POST | `/api/auth/register` | Công khai: đăng ký/đăng nhập; `/me` cần JWT | Xác thực, hồ sơ cá nhân; khai báo dòng 100 trong `store-admin/server/src/routes/auth.js` |
| POST | `/api/auth/login` | Công khai: đăng ký/đăng nhập; `/me` cần JWT | Xác thực, hồ sơ cá nhân; khai báo dòng 180 trong `store-admin/server/src/routes/auth.js` |
| GET | `/api/auth/me` | Công khai: đăng ký/đăng nhập; `/me` cần JWT | Xác thực, hồ sơ cá nhân; khai báo dòng 215 trong `store-admin/server/src/routes/auth.js` |
| PUT | `/api/auth/me` | Công khai: đăng ký/đăng nhập; `/me` cần JWT | Xác thực, hồ sơ cá nhân; khai báo dòng 225 trong `store-admin/server/src/routes/auth.js` |
| GET | `/api/chat/events` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 170 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/chat/media/:attachmentId` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 231 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/chat/my-conversation/unread-count` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 309 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/chat/my-conversation` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 333 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/chat/my-conversation/messages` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 360 trong `store-admin/server/src/routes/chat.js` |
| POST | `/api/chat/my-conversation/messages` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 379 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/chat` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 453 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/chat/:id/messages` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 499 trong `store-admin/server/src/routes/chat.js` |
| POST | `/api/chat/:id/messages` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 519 trong `store-admin/server/src/routes/chat.js` |
| PATCH | `/api/chat/:id` | CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại | Chat, tệp đính kèm, trạng thái, SSE; khai báo dòng 578 trong `store-admin/server/src/routes/chat.js` |
| GET | `/api/customers` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 7 trong `store-admin/server/src/routes/customer.js` |
| GET | `/api/customers/stats/overview` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 58 trong `store-admin/server/src/routes/customer.js` |
| GET | `/api/customers/:id` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 103 trong `store-admin/server/src/routes/customer.js` |
| POST | `/api/customers` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 131 trong `store-admin/server/src/routes/customer.js` |
| PUT | `/api/customers/:id` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 173 trong `store-admin/server/src/routes/customer.js` |
| PATCH | `/api/customers/:id/tier` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 222 trong `store-admin/server/src/routes/customer.js` |
| PATCH | `/api/customers/:id/account-status` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 238 trong `store-admin/server/src/routes/customer.js` |
| DELETE | `/api/customers/:id` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 264 trong `store-admin/server/src/routes/customer.js` |
| GET | `/api/customers/:id/orders` | ADMIN, QL_KHACH_HANG | Quản lý CRM và thống kê khách; khai báo dòng 330 trong `store-admin/server/src/routes/customer.js` |
| GET | `/pay/demo/:token` | Công khai khi `DEMO_PAYMENT=true`; giới hạn tốc độ | Trang xác nhận thanh toán demo; không phải thanh toán thật; khai báo dòng 72 trong `store-admin/server/src/routes/demo-payment.js` |
| POST | `/pay/demo/:token/confirm` | Công khai khi `DEMO_PAYMENT=true`; giới hạn tốc độ | Trang xác nhận thanh toán demo; không phải thanh toán thật; khai báo dòng 80 trong `store-admin/server/src/routes/demo-payment.js` |
| GET | `/api/employees` | ADMIN, QL_NHAN_SU | Hồ sơ nhân viên; khai báo dòng 13 trong `store-admin/server/src/routes/employee.js` |
| POST | `/api/employees` | ADMIN, QL_NHAN_SU | Hồ sơ nhân viên; khai báo dòng 48 trong `store-admin/server/src/routes/employee.js` |
| PUT | `/api/employees/:id` | ADMIN, QL_NHAN_SU | Hồ sơ nhân viên; khai báo dòng 71 trong `store-admin/server/src/routes/employee.js` |
| GET | `/api/feedbacks/mine` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 45 trong `store-admin/server/src/routes/feedback.js` |
| GET | `/api/feedbacks` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 78 trong `store-admin/server/src/routes/feedback.js` |
| GET | `/api/feedbacks/stats` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 145 trong `store-admin/server/src/routes/feedback.js` |
| GET | `/api/feedbacks/stats/rating` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 161 trong `store-admin/server/src/routes/feedback.js` |
| GET | `/api/feedbacks/media/:attachmentId` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 177 trong `store-admin/server/src/routes/feedback.js` |
| GET | `/api/feedbacks/:id` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 202 trong `store-admin/server/src/routes/feedback.js` |
| POST | `/api/feedbacks` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 223 trong `store-admin/server/src/routes/feedback.js` |
| PATCH | `/api/feedbacks/:id/reply` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 323 trong `store-admin/server/src/routes/feedback.js` |
| PATCH | `/api/feedbacks/:id/status` | POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG | Phản hồi, đính kèm, trả lời, trạng thái, thống kê; khai báo dòng 343 trong `store-admin/server/src/routes/feedback.js` |
| GET | `/api/inventory` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 16 trong `store-admin/server/src/routes/inventory.js` |
| GET | `/api/inventory/suppliers` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 69 trong `store-admin/server/src/routes/inventory.js` |
| POST | `/api/inventory/suppliers` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 117 trong `store-admin/server/src/routes/inventory.js` |
| PATCH | `/api/inventory/suppliers/:id` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 133 trong `store-admin/server/src/routes/inventory.js` |
| GET | `/api/inventory/receipts` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 151 trong `store-admin/server/src/routes/inventory.js` |
| GET | `/api/inventory/receipts/:id` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 199 trong `store-admin/server/src/routes/inventory.js` |
| POST | `/api/inventory/receipts` | ADMIN, QL_KHO | Tồn kho, nhà cung cấp, phiếu kho; khai báo dòng 227 trong `store-admin/server/src/routes/inventory.js` |
| GET | `/api/loyalty/me` | KHACH_HANG | Điểm khách hàng hiện tại; khai báo dòng 6 trong `store-admin/server/src/routes/loyalty.js` |
| GET | `/api/orders/mine` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 115 trong `store-admin/server/src/routes/order.js` |
| GET | `/api/orders/mine/:id` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 156 trong `store-admin/server/src/routes/order.js` |
| GET | `/api/orders/customers` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 195 trong `store-admin/server/src/routes/order.js` |
| GET | `/api/orders` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 216 trong `store-admin/server/src/routes/order.js` |
| GET | `/api/orders/:id` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 277 trong `store-admin/server/src/routes/order.js` |
| POST | `/api/orders` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 315 trong `store-admin/server/src/routes/order.js` |
| PATCH | `/api/orders/:id/status` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 576 trong `store-admin/server/src/routes/order.js` |
| PATCH | `/api/orders/:id/payment` | ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình | Đơn, thanh toán và khách chọn tại quầy; khai báo dòng 660 trong `store-admin/server/src/routes/order.js` |
| GET | `/api/products/categories` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 9 trong `store-admin/server/src/routes/product.js` |
| GET | `/api/products/brands` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 24 trong `store-admin/server/src/routes/product.js` |
| POST | `/api/products/categories` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 36 trong `store-admin/server/src/routes/product.js` |
| GET | `/api/products/sizes` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 54 trong `store-admin/server/src/routes/product.js` |
| GET | `/api/products/colors` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 60 trong `store-admin/server/src/routes/product.js` |
| GET | `/api/products` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 68 trong `store-admin/server/src/routes/product.js` |
| GET | `/api/products/:id` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 151 trong `store-admin/server/src/routes/product.js` |
| POST | `/api/products` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 178 trong `store-admin/server/src/routes/product.js` |
| PUT | `/api/products/:id` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 226 trong `store-admin/server/src/routes/product.js` |
| PATCH | `/api/products/:id` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 227 trong `store-admin/server/src/routes/product.js` |
| DELETE | `/api/products/:id` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 230 trong `store-admin/server/src/routes/product.js` |
| POST | `/api/products/:id/variants` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 246 trong `store-admin/server/src/routes/product.js` |
| PATCH | `/api/products/variants/:variantId/quantity` | GET công khai; ghi: ADMIN, QL_KHO | Catalog, danh mục và biến thể; khai báo dòng 262 trong `store-admin/server/src/routes/product.js` |
| GET | `/api/promotions` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 32 trong `store-admin/server/src/routes/promotion.js` |
| GET | `/api/promotions/validate/:code` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 73 trong `store-admin/server/src/routes/promotion.js` |
| POST | `/api/promotions` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 92 trong `store-admin/server/src/routes/promotion.js` |
| PATCH | `/api/promotions/:id` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 111 trong `store-admin/server/src/routes/promotion.js` |
| GET | `/api/promotions/mine` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 134 trong `store-admin/server/src/routes/promotion.js` |
| GET | `/api/promotions/user/:customerId` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 162 trong `store-admin/server/src/routes/promotion.js` |
| POST | `/api/promotions/assign` | ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate | Khuyến mãi và phân bổ voucher; khai báo dòng 183 trong `store-admin/server/src/routes/promotion.js` |
| GET | `/api/reports/summary` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 30 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/dashboard` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 104 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/revenue` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 176 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/top-products` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 214 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/attention` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 251 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/customer-ages` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 273 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/customer-segments` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 306 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/interests` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 334 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/reports/audit-logs` | ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG | Báo cáo tổng hợp; khai báo dòng 355 trong `store-admin/server/src/routes/report.js` |
| GET | `/api/settings/status` | ADMIN | Seed, scraper, cấu hình và backup/restore có cờ bảo vệ; khai báo dòng 251 trong `store-admin/server/src/routes/settings.js` |
| GET | `/api/settings/catalog-products` | ADMIN | Seed, scraper, cấu hình và backup/restore có cờ bảo vệ; khai báo dòng 271 trong `store-admin/server/src/routes/settings.js` |
| POST | `/api/settings/scrape` | ADMIN | Seed, scraper, cấu hình và backup/restore có cờ bảo vệ; khai báo dòng 284 trong `store-admin/server/src/routes/settings.js` |
| POST | `/api/settings/seed` | ADMIN | Seed, scraper, cấu hình và backup/restore có cờ bảo vệ; khai báo dòng 325 trong `store-admin/server/src/routes/settings.js` |
| GET | `/api/settings/database/backup` | ADMIN | Seed, scraper, cấu hình và backup/restore có cờ bảo vệ; khai báo dòng 345 trong `store-admin/server/src/routes/settings.js` |
| POST | `/api/settings/database/restore` | ADMIN | Seed, scraper, cấu hình và backup/restore có cờ bảo vệ; khai báo dòng 420 trong `store-admin/server/src/routes/settings.js` |
| GET | `/api/surveys/mine` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 114 trong `store-admin/server/src/routes/survey.js` |
| GET | `/api/surveys` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 149 trong `store-admin/server/src/routes/survey.js` |
| GET | `/api/surveys/:id/recipients-preview` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 202 trong `store-admin/server/src/routes/survey.js` |
| GET | `/api/surveys/:id` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 236 trong `store-admin/server/src/routes/survey.js` |
| POST | `/api/surveys` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 305 trong `store-admin/server/src/routes/survey.js` |
| PATCH | `/api/surveys/:id` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 353 trong `store-admin/server/src/routes/survey.js` |
| PATCH | `/api/surveys/:id/status` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 433 trong `store-admin/server/src/routes/survey.js` |
| POST | `/api/surveys/:id/send` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 452 trong `store-admin/server/src/routes/survey.js` |
| POST | `/api/surveys/:id/respond` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 531 trong `store-admin/server/src/routes/survey.js` |
| GET | `/api/surveys/:id/results` | ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond | Tạo/gửi khảo sát, trả lời, xem thống kê; khai báo dòng 675 trong `store-admin/server/src/routes/survey.js` |
| GET | `/api/health` | Công khai | Health API (trả cờ database browser) |
| POST | `/api/events/user` | JWT hợp lệ | Ghi event người dùng vào outbox; giới hạn request theo IP |
| POST | `/api/events/transaction` | JWT hợp lệ | Ghi transaction event vào outbox; giới hạn request theo IP |
| GET | `/api/events/outbox-status` | Hiện không gắn `requireAuth` trong index | Trạng thái số event chờ |
| GET | `/api/events/status` | Hiện không gắn `requireAuth` trong index | Trạng thái kết nối Kafka |
| GET | `/api/database/tables` | Chỉ khi `ENABLE_DATABASE_BROWSER=true` và socket loopback | Liệt kê bảng/đếm cột |
| GET | `/api/database/tables/:tableName/rows` | Cùng điều kiện database browser | Đọc tối đa 100 dòng/trang từ bảng `public` |
| GET, POST | `/pay/demo/:token` và `/pay/demo/:token/confirm` | Công khai khi `DEMO_PAYMENT=true`; token ngẫu nhiên, giới hạn tốc độ | Trang xác nhận demo; token không chứa mã đơn; POST cập nhật thanh toán/idempotent |

### Các tham số lọc/tìm kiếm đã xác nhận trong handler

- Sản phẩm `GET /api/products`: `search`, `category_id`, `brand_id`, `supplier_id`, `min_price`, `max_price`, `page`, `limit`, `sort` (`created_at`, `name`, `price`, `category`), `order` (`asc`, `desc`).
- Nhà cung cấp `GET /api/inventory/suppliers`: `search`, `contact_filter` (`all`, `has_email`, `no_email`, `has_phone`, `no_phone`), `sort` (`name`, `contact`, `created`), `order`, `page`, `limit`.
- Khách hàng `GET /api/customers`: `search`, `tier`, `gender`, `page`, `limit`.
- Tồn kho `GET /api/inventory`: `search`, `category_id`, `low_stock`, `page`, `limit`; phiếu kho có `type`, `from`, `to`, `page`, `limit`.
- Đơn hàng `GET /api/orders`: `status`, `channel`, `customer_id`, `from`, `to`, `page`, `limit`.
- Khuyến mãi `GET /api/promotions`: `active`, `promo_type`, `page`, `limit`; `active=true/false` có lọc theo cờ và ngày hiện tại trong handler hiện tại.

## 3. Cơ sở dữ liệu từ SQL trong repository

Nguồn duy nhất: `server/sql/schema.sql` và migrations `001`–`015`; không dùng database đang chạy. Bản hợp nhất để nộp nằm ở `database/schema.sql`. Schema baseline có 35 bảng; migration bổ sung các bảng CRM, chat, loyalty và demo payment. Danh sách cột/types/constraints/FK dưới đây là snapshot DDL rút từ đúng các file này. Indexes được liệt kê theo bảng.

### `store_admin_schema_migrations`

- Cột: `version` VARCHAR(32) PRIMARY KEY; `name` TEXT NOT NULL; `applied_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `user_events`

- Cột: `id` BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY; `payload` JSONB NOT NULL; `source` TEXT NOT NULL; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `event_id` TEXT; `session_id` TEXT; `event_type` TEXT; `page` TEXT; `section` TEXT; `action` TEXT; `source_check` TEXT; `occurred_at` TIMESTAMPTZ; `user_id` TEXT.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: user_events_created_at_idx(created_at DESC); user_events_type_occurred_idx(event_type, occurred_at DESC); user_events_event_id_unique_idx(event_id).

### `transactions`

- Cột: `id` BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY; `payload` JSONB NOT NULL; `source` TEXT NOT NULL; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `event_id` TEXT; `session_id` TEXT; `event_type` TEXT; `transaction_id` TEXT; `benchmark_run_id` TEXT; `amount` NUMERIC(15,2); `currency` TEXT; `status` TEXT; `item_count` INTEGER; `page` TEXT; `action` TEXT; `producer_source` TEXT; `occurred_at` TIMESTAMPTZ; `user_id` TEXT.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: transactions_created_at_idx(created_at DESC); transactions_type_occurred_idx(event_type, occurred_at DESC); transactions_transaction_id_idx(transaction_id); transactions_event_id_unique_idx(event_id).

### `outbox_events`

- Cột: `event_id` TEXT PRIMARY KEY; `topic` TEXT NOT NULL CHECK (topic IN ('user-events', 'transaction-events')); `partition_key` TEXT; `payload` JSONB NOT NULL; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `published_at` TIMESTAMPTZ.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: outbox_events_unpublished_idx(created_at, event_id); outbox_events_unpublished_idx(created_at, event_id).

### `role`

- Cột: `role_id` SERIAL PRIMARY KEY; `role_name` VARCHAR(50) NOT NULL UNIQUE; `description` TEXT.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `permission`

- Cột: `permission_id` SERIAL PRIMARY KEY; `permission_code` VARCHAR(80) NOT NULL UNIQUE; `description` TEXT.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `role_permission`

- Cột: `role_id` INT NOT NULL REFERENCES role(role_id) ON DELETE CASCADE; `permission_id` INT NOT NULL REFERENCES permission(permission_id) ON DELETE CASCADE.
- Ràng buộc/khóa: PRIMARY KEY (role_id, permission_id).
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `account`

- Cột: `account_id` SERIAL PRIMARY KEY; `role_id` INT NOT NULL REFERENCES role(role_id); `username` VARCHAR(100) NOT NULL UNIQUE; `password_hash` VARCHAR(255) NOT NULL; `email` VARCHAR(150) UNIQUE; `phone` VARCHAR(20); `status` account_status NOT NULL DEFAULT 'Active'; `last_login` TIMESTAMPTZ; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: account_role_idx(role_id); account_status_idx(status); account_created_at_idx(created_at DESC); account_email_idx(email); account_role_idx(role_id); account_status_idx(status); account_created_at_idx(created_at DESC); account_email_idx(email); account_username_lower_uidx(LOWER(username)).

### `employee`

- Cột: `employee_id` SERIAL PRIMARY KEY; `account_id` INT UNIQUE REFERENCES account(account_id) ON DELETE SET NULL; `full_name` VARCHAR(150) NOT NULL; `gender` gender_type; `date_of_birth` DATE; `phone` VARCHAR(20); `email` VARCHAR(150); `address` TEXT; `position` VARCHAR(100); `hire_date` DATE NOT NULL DEFAULT CURRENT_DATE; `is_active` BOOLEAN NOT NULL DEFAULT TRUE; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: employee_active_idx(is_active); employee_name_idx(full_name); employee_active_idx(is_active); employee_name_idx(full_name).

### `customer`

- Cột: `customer_id` SERIAL PRIMARY KEY; `account_id` INT UNIQUE REFERENCES account(account_id) ON DELETE SET NULL; `full_name` VARCHAR(150) NOT NULL; `gender` gender_type; `date_of_birth` DATE; `phone` VARCHAR(20); `email` VARCHAR(150); `address` TEXT; `loyalty_point` INT NOT NULL DEFAULT 0; `customer_tier` VARCHAR(20) NOT NULL DEFAULT 'New'; `registered_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: customer_tier_idx(customer_tier); customer_phone_idx(phone); customer_gender_idx(gender); customer_dob_idx(date_of_birth); customer_email_idx(email); customer_name_idx(full_name); customer_tier_idx(customer_tier); customer_phone_idx(phone); customer_gender_idx(gender); customer_dob_idx(date_of_birth); customer_email_idx(email); customer_name_idx(full_name).

### `interest`

- Cột: `interest_id` SERIAL PRIMARY KEY; `interest_name` VARCHAR(100) NOT NULL UNIQUE.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `customer_interest`

- Cột: `customer_id` INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE; `interest_id` INT NOT NULL REFERENCES interest(interest_id) ON DELETE CASCADE.
- Ràng buộc/khóa: PRIMARY KEY (customer_id, interest_id).
- Index: customer_interest_cust_idx(customer_id); customer_interest_interest_idx(interest_id); customer_interest_cust_idx(customer_id); customer_interest_interest_idx(interest_id); customer_interest_cust_idx(customer_id).

### `brand`

- Cột: `brand_id` SERIAL PRIMARY KEY; `brand_name` VARCHAR(150) NOT NULL UNIQUE; `description` TEXT; `is_active` BOOLEAN NOT NULL DEFAULT TRUE.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: brand_active_idx(is_active); brand_active_idx(is_active).

### `category`

- Cột: `category_id` SERIAL PRIMARY KEY; `category_name` VARCHAR(100) NOT NULL UNIQUE; `description` TEXT; `parent_id` INT REFERENCES category(category_id); `is_active` BOOLEAN NOT NULL DEFAULT TRUE.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: category_parent_idx(parent_id); category_active_idx(is_active); category_parent_idx(parent_id); category_active_idx(is_active).

### `product`

- Cột: `product_id` SERIAL PRIMARY KEY; `category_id` INT NOT NULL REFERENCES category(category_id); `brand_id` INT REFERENCES brand(brand_id); `product_name` VARCHAR(200) NOT NULL; `description` TEXT; `import_price` NUMERIC(15,2) NOT NULL CHECK (import_price >= 0); `selling_price` NUMERIC(15,2) NOT NULL CHECK (selling_price >= 0); `image_url` TEXT; `is_active` BOOLEAN NOT NULL DEFAULT TRUE; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `supplier_id` INT REFERENCES supplier(supplier_id).
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: product_category_idx(category_id); product_brand_idx(brand_id); product_active_idx(is_active); product_price_idx(selling_price); product_created_at_idx(created_at DESC); product_name_idx(to_tsvector('simple', product_name)); product_supplier_idx(supplier_id); product_category_idx(category_id); product_brand_idx(brand_id); product_supplier_idx(supplier_id); product_active_idx(is_active); product_price_idx(selling_price); product_created_at_idx(created_at DESC); product_name_idx(to_tsvector('simple', product_name)); product_brand_idx(brand_id); product_supplier_idx(supplier_id).

### `size`

- Cột: `size_id` SERIAL PRIMARY KEY; `size_name` VARCHAR(20) NOT NULL UNIQUE.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `color`

- Cột: `color_id` SERIAL PRIMARY KEY; `color_name` VARCHAR(50) NOT NULL UNIQUE; `hex_code` CHAR(7).
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `product_variant`

- Cột: `variant_id` SERIAL PRIMARY KEY; `product_id` INT NOT NULL REFERENCES product(product_id) ON DELETE CASCADE; `size_id` INT NOT NULL REFERENCES size(size_id); `color_id` INT NOT NULL REFERENCES color(color_id); `sku` VARCHAR(100) UNIQUE; `quantity` INT NOT NULL DEFAULT 0 CHECK (quantity >= 0); `selling_price` NUMERIC(15,2) CHECK (selling_price IS NULL OR selling_price >= 0); `is_active` BOOLEAN NOT NULL DEFAULT TRUE.
- Ràng buộc/khóa: UNIQUE (product_id, size_id, color_id).
- Index: variant_product_idx(product_id); variant_size_idx(size_id); variant_color_idx(color_id); variant_active_idx(is_active); variant_product_idx(product_id); variant_size_idx(size_id); variant_color_idx(color_id); variant_active_idx(is_active).

### `supplier`

- Cột: `supplier_id` SERIAL PRIMARY KEY; `supplier_name` VARCHAR(200) NOT NULL; `contact_name` VARCHAR(150); `phone` VARCHAR(20); `email` VARCHAR(150); `address` TEXT; `is_active` BOOLEAN NOT NULL DEFAULT TRUE; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: supplier_name_idx(supplier_name); supplier_active_idx(is_active); supplier_name_idx(supplier_name); supplier_active_idx(is_active).

### `product_image`

- Cột: `image_id` SERIAL PRIMARY KEY; `product_id` INT NOT NULL REFERENCES product(product_id) ON DELETE CASCADE; `image_url` TEXT NOT NULL; `is_primary` BOOLEAN NOT NULL DEFAULT FALSE; `display_order` SMALLINT NOT NULL DEFAULT 1.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: product_image_product_idx(product_id); product_image_product_idx(product_id); product_image_product_idx(product_id).

### `import_receipt`

- Cột: `receipt_id` SERIAL PRIMARY KEY; `supplier_id` INT REFERENCES supplier(supplier_id); `employee_id` INT REFERENCES employee(employee_id); `receipt_type` receipt_type NOT NULL DEFAULT 'Import'; `note` TEXT; `total_amount` NUMERIC(15,2) NOT NULL DEFAULT 0; `receipt_date` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: receipt_date_idx(receipt_date DESC); receipt_supplier_idx(supplier_id); receipt_employee_idx(employee_id); receipt_date_idx(receipt_date DESC); receipt_supplier_idx(supplier_id); receipt_employee_idx(employee_id).

### `import_detail`

- Cột: `detail_id` SERIAL PRIMARY KEY; `receipt_id` INT NOT NULL REFERENCES import_receipt(receipt_id) ON DELETE CASCADE; `variant_id` INT NOT NULL REFERENCES product_variant(variant_id); `quantity` INT NOT NULL CHECK (quantity > 0); `unit_price` NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0).
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: import_detail_receipt_idx(receipt_id); import_detail_variant_idx(variant_id); import_detail_receipt_idx(receipt_id); import_detail_variant_idx(variant_id).

### `promotion`

- Cột: `promotion_id` SERIAL PRIMARY KEY; `code` VARCHAR(50) NOT NULL UNIQUE; `name` VARCHAR(200) NOT NULL; `promo_type` promotion_type NOT NULL DEFAULT 'Percent'; `value` NUMERIC(10,2) NOT NULL CHECK (value > 0); `min_order` NUMERIC(15,2) NOT NULL DEFAULT 0; `max_discount` NUMERIC(15,2); `usage_limit` INT; `used_count` INT NOT NULL DEFAULT 0; `start_date` DATE NOT NULL; `end_date` DATE NOT NULL; `is_active` BOOLEAN NOT NULL DEFAULT TRUE; `created_by` INT REFERENCES employee(employee_id); `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: CHECK (end_date >= start_date).
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `user_promotion`

- Cột: `user_promo_id` SERIAL PRIMARY KEY; `customer_id` INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE; `promotion_id` INT NOT NULL REFERENCES promotion(promotion_id) ON DELETE CASCADE; `status` user_promo_status NOT NULL DEFAULT 'Available'; `assigned_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `used_at` TIMESTAMPTZ.
- Ràng buộc/khóa: UNIQUE (customer_id, promotion_id).
- Index: user_promo_customer_idx(customer_id); user_promo_status_idx(status).

### `order`

- Cột: `order_id` SERIAL PRIMARY KEY; `customer_id` INT REFERENCES customer(customer_id) ON DELETE SET NULL; `employee_id` INT REFERENCES employee(employee_id) ON DELETE SET NULL; `promotion_id` INT REFERENCES promotion(promotion_id); `order_status` order_status NOT NULL DEFAULT 'Pending'; `subtotal` NUMERIC(15,2) NOT NULL DEFAULT 0; `discount_amt` NUMERIC(15,2) NOT NULL DEFAULT 0; `total_amount` NUMERIC(15,2) NOT NULL DEFAULT 0; `note` TEXT; `shipping_address` TEXT; `order_channel` VARCHAR(50) NOT NULL DEFAULT 'InStore'; `ordered_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `loyalty_points_redeemed` INTEGER NOT NULL DEFAULT 0; `loyalty_discount` NUMERIC(15,2) NOT NULL DEFAULT 0.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: order_customer_idx(customer_id); order_status_idx(order_status); order_date_idx(ordered_at DESC); order_employee_idx(employee_id); order_customer_idx(customer_id); order_status_idx(order_status); order_date_idx(ordered_at DESC); order_employee_idx(employee_id).

### `order_detail`

- Cột: `detail_id` SERIAL PRIMARY KEY; `order_id` INT NOT NULL REFERENCES "order"(order_id) ON DELETE CASCADE; `variant_id` INT NOT NULL REFERENCES product_variant(variant_id); `quantity` INT NOT NULL CHECK (quantity > 0); `unit_price` NUMERIC(15,2) NOT NULL CHECK (unit_price >= 0); `subtotal` NUMERIC(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: order_detail_order_idx(order_id); order_detail_variant_idx(variant_id); order_detail_order_idx(order_id); order_detail_variant_idx(variant_id).

### `payment`

- Cột: `payment_id` SERIAL PRIMARY KEY; `order_id` INT NOT NULL UNIQUE REFERENCES "order"(order_id) ON DELETE CASCADE; `method` payment_method NOT NULL DEFAULT 'Cash'; `status` payment_status NOT NULL DEFAULT 'Pending'; `amount` NUMERIC(15,2) NOT NULL CHECK (amount >= 0); `transaction_ref` VARCHAR(200); `paid_at` TIMESTAMPTZ; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: payment_order_idx(order_id); payment_status_idx(status); payment_order_idx(order_id); payment_status_idx(status).

### `feedback`

- Cột: `feedback_id` SERIAL PRIMARY KEY; `customer_id` INT REFERENCES customer(customer_id) ON DELETE SET NULL; `product_id` INT REFERENCES product(product_id) ON DELETE SET NULL; `order_id` INT REFERENCES "order"(order_id) ON DELETE SET NULL; `employee_id` INT REFERENCES employee(employee_id) ON DELETE SET NULL; `feedback_type` feedback_type NOT NULL DEFAULT 'Product'; `rating` SMALLINT CHECK (rating BETWEEN 1 AND 5); `content` TEXT NOT NULL; `reply` TEXT; `status` feedback_status NOT NULL DEFAULT 'New'; `replied_at` TIMESTAMPTZ; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: feedback_product_requires_product_and_rating CHECK ( feedback_type <> 'Product' OR (product_id IS NOT NULL AND rating IS NOT NULL) ).
- Index: feedback_customer_idx(customer_id); feedback_status_idx(status); feedback_product_idx(product_id); feedback_rating_idx(rating); feedback_created_at_idx(created_at DESC); feedback_customer_idx(customer_id); feedback_status_idx(status); feedback_product_idx(product_id); feedback_rating_idx(rating); feedback_created_at_idx(created_at DESC).

### `feedback_attachment`

- Cột: `attachment_id` BIGSERIAL PRIMARY KEY; `feedback_id` INTEGER NOT NULL REFERENCES feedback(feedback_id) ON DELETE CASCADE; `media_url` TEXT NOT NULL; `media_type` VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')); `mime_type` VARCHAR(100) NOT NULL; `original_name` TEXT NOT NULL; `file_size` BIGINT NOT NULL CHECK (file_size > 0); `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: feedback_attachment_feedback_idx(feedback_id, attachment_id); feedback_attachment_feedback_idx(feedback_id, attachment_id).

### `survey`

- Cột: `survey_id` SERIAL PRIMARY KEY; `created_by` INT REFERENCES employee(employee_id) ON DELETE SET NULL; `title` VARCHAR(300) NOT NULL; `description` TEXT; `target_gender` gender_type; `target_tier` VARCHAR(20); `min_age` INT; `max_age` INT; `status` survey_status NOT NULL DEFAULT 'Draft'; `start_date` DATE; `end_date` DATE; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `target_interest_id` INTEGER REFERENCES interest(interest_id) ON DELETE SET NULL; `reward_promotion_id` INTEGER REFERENCES promotion(promotion_id) ON DELETE SET NULL.
- Ràng buộc/khóa: survey_age_range_check CHECK ( (min_age IS NULL OR min_age >= 0) AND (max_age IS NULL OR max_age >= 0) AND (min_age IS NULL OR max_age IS NULL OR min_age <= max_age) ); survey_date_range_check CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date).
- Index: survey_status_idx(status); survey_created_at_idx(created_at DESC); survey_status_idx(status); survey_created_at_idx(created_at DESC).

### `survey_question`

- Cột: `question_id` SERIAL PRIMARY KEY; `survey_id` INT NOT NULL REFERENCES survey(survey_id) ON DELETE CASCADE; `question_text` TEXT NOT NULL; `question_type` question_type NOT NULL DEFAULT 'SingleChoice'; `display_order` SMALLINT NOT NULL DEFAULT 1; `is_required` BOOLEAN NOT NULL DEFAULT TRUE.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: sq_survey_idx(survey_id); sq_survey_idx(survey_id).

### `survey_option`

- Cột: `option_id` SERIAL PRIMARY KEY; `question_id` INT NOT NULL REFERENCES survey_question(question_id) ON DELETE CASCADE; `option_text` VARCHAR(300) NOT NULL; `display_order` SMALLINT NOT NULL DEFAULT 1.
- Ràng buộc/khóa: survey_option_question_option_unique UNIQUE (question_id.
- Index: so_question_idx(question_id); so_question_idx(question_id).

### `survey_response`

- Cột: `response_id` SERIAL PRIMARY KEY; `survey_id` INT NOT NULL REFERENCES survey(survey_id) ON DELETE CASCADE; `customer_id` INT REFERENCES customer(customer_id) ON DELETE SET NULL; `submitted_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: UNIQUE (survey_id, customer_id).
- Index: sr_survey_idx(survey_id); sr_survey_idx(survey_id).

### `survey_invitation`

- Cột: `invitation_id` SERIAL PRIMARY KEY; `survey_id` INT NOT NULL REFERENCES survey(survey_id) ON DELETE CASCADE; `customer_id` INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE; `invited_by` INT REFERENCES employee(employee_id) ON DELETE SET NULL; `status` VARCHAR(20) NOT NULL DEFAULT 'Sent' CHECK (status IN ('Sent', 'Opened', 'Completed')); `invited_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: UNIQUE (survey_id, customer_id).
- Index: survey_invitation_customer_idx(customer_id); survey_invitation_survey_idx(survey_id); survey_invitation_customer_idx(customer_id); survey_invitation_survey_idx(survey_id); survey_invitation_customer_idx(customer_id).

### `survey_answer`

- Cột: `answer_id` SERIAL PRIMARY KEY; `response_id` INT NOT NULL REFERENCES survey_response(response_id) ON DELETE CASCADE; `question_id` INT NOT NULL REFERENCES survey_question(question_id); `option_id` INT REFERENCES survey_option(option_id); `answer_text` TEXT.
- Ràng buộc/khóa: survey_answer_option_question_fk FOREIGN KEY (question_id.
- Index: sa_response_idx(response_id); sa_question_idx(question_id); sa_response_idx(response_id); sa_question_idx(question_id).

### `customer_interest_map`

- Cột: `customer_id` INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE; `interest_id` INT NOT NULL REFERENCES interest(interest_id) ON DELETE CASCADE.
- Ràng buộc/khóa: PRIMARY KEY (customer_id, interest_id).
- Index: Không thấy CREATE INDEX riêng trong nguồn SQL đã rà.

### `conversation`

- Cột: `conversation_id` SERIAL PRIMARY KEY; `customer_id` INT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE; `assigned_to` INT REFERENCES employee(employee_id) ON DELETE SET NULL; `subject` VARCHAR(300) NOT NULL DEFAULT 'Hỗ trợ khách hàng'; `status` VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Resolved', 'Closed')); `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: idx_conversation_customer_id(customer_id); idx_conversation_status(status); idx_conversation_updated_at(updated_at DESC).

### `chat_message`

- Cột: `message_id` SERIAL PRIMARY KEY; `conversation_id` INT NOT NULL REFERENCES conversation(conversation_id) ON DELETE CASCADE; `sender_account_id` INT NOT NULL REFERENCES account(account_id) ON DELETE CASCADE; `content` TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000); `sent_at` TIMESTAMPTZ NOT NULL DEFAULT NOW(); `is_read` BOOLEAN NOT NULL DEFAULT FALSE.
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: idx_chat_message_conv_id(conversation_id); idx_chat_message_sent_at(sent_at ASC).

### `loyalty_point_transaction`

- Cột: `loyalty_transaction_id` BIGSERIAL PRIMARY KEY; `customer_id` INTEGER NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE; `order_id` INTEGER REFERENCES "order"(order_id) ON DELETE SET NULL; `transaction_type` VARCHAR(32) NOT NULL CHECK (transaction_type IN ( 'OpeningBalance', 'Earned', 'Redeemed', 'RedeemedReturned', 'EarnReversed' )); `points_delta` INTEGER NOT NULL; `balance_after` INTEGER NOT NULL; `note` TEXT; `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: PK/FK thể hiện trực tiếp tại khai báo cột.
- Index: loyalty_point_transaction_customer_created_idx(customer_id, created_at DESC, loyalty_transaction_id DESC); loyalty_point_transaction_order_type_idx(order_id, transaction_type).

### `chat_message_attachment`

- Cột: `attachment_id` BIGSERIAL PRIMARY KEY; `message_id` INTEGER NOT NULL REFERENCES chat_message(message_id) ON DELETE CASCADE; `storage_name` VARCHAR(100) NOT NULL UNIQUE; `original_name` VARCHAR(255) NOT NULL; `mime_type` VARCHAR(50) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')); `file_size` BIGINT NOT NULL CHECK (file_size > 0); `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW().
- Ràng buộc/khóa: chat_message_attachment_mime_type_check CHECK (mime_type IN ( 'image/jpeg'; chat_message_attachment_mime_type_check CHECK (mime_type IN ( 'image/jpeg'.
- Index: chat_message_attachment_message_idx(message_id, attachment_id).

### Quan hệ nghiệp vụ chính

- `account` gắn một-một tùy chọn với `employee` hoặc `customer`; `role` và `permission` liên kết nhiều-nhiều qua `role_permission`.
- `product` thuộc `category`, có thể gắn `brand`/`supplier`; `product_variant` kết hợp `size` và `color`; `product_image` lưu nhiều ảnh.
- `import_receipt` có `import_detail`; đơn `order` có `order_detail` và `payment`; item tham chiếu `product_variant`; order có thể liên kết customer, employee, promotion.
- CRM: `customer_interest` (và bảng map cũ `customer_interest_map` do migration 004), `feedback`/`feedback_attachment`, survey/question/option/invitation/response/answer, loyalty point transactions.
- Chat: `customer`–`conversation`–`chat_message`–`chat_message_attachment`; lưu metadata tệp, file nằm trên filesystem uploads.
- Event: `outbox_events` → Kafka; consumer ghi cấu trúc vào `user_events`/`transactions`, idempotency theo `event_id`; demo QR dùng `demo_payment_tokens` gắn order và lưu hash token.

## 4. Sự kiện, thanh toán, vận hành

- Topic Kafka trong code: `user-events`, `transaction-events`; consumer group: `store-admin-group`. Producer outbox dùng `FOR UPDATE SKIP LOCKED`, relay có retry/backoff và dọn event đã publish sau 7 ngày. Delivery có thể lặp; consumer dùng `ON CONFLICT (event_id) DO NOTHING`.
- `POST /api/events/transaction` yêu cầu `eventId`; `enqueueEvent` ghi outbox. Consumer chuẩn hóa payload thành cột trong `transactions`. Payment demo ghi `payment_completed` trong transaction cập nhật thanh toán theo code hiện có; cần xác minh môi trường Kafka riêng trước khi demo.
- Demo QR tạo token dùng một lần, hash lưu trong `demo_payment_tokens`, hết hạn 15 phút. Trang HTML công khai POST confirm; không tích hợp ngân hàng, không nhận tiền thật.
- Backup/restore app nằm trong `server/src/routes/settings.js`, router chỉ cho ADMIN. Restore phụ thuộc `ENABLE_DATABASE_RESTORE`; database browser phụ thuộc `ENABLE_DATABASE_BROWSER` và chỉ nhận loopback. Không bật hai cờ này trong môi trường dùng chung.
- Migration runner `server/src/migrations.js`: lúc khởi động API; advisory lock; baseline `000`; chạy file migration theo tên phiên bản trong transaction. Seed `npm run seed` kiểm tra DB local trừ khi cờ riêng được bật trong môi trường chạy seed; script phụ thuộc catalog JSON đã chuẩn hóa.

## 5. Seed accounts (username và role; không ghi mật khẩu)

Nguồn: `store-admin/scripts/seed.mjs`. Tài khoản demo được tạo/cập nhật bởi script seed. Không suy ra mật khẩu trong tài liệu.

| Username | Vai trò |
|---|---|
| `admin`, `admin2` | ADMIN |
| `qlnhansu` | QL_NHAN_SU |
| `qlkho` | QL_KHO |
| `qlbanhang` | QL_BAN_HANG |
| `qlkhachhang` | QL_KHACH_HANG |
| `khach1`, `khach2`, `khach3` | KHACH_HANG |
| `demo_khach_khoa` | KHACH_HANG (Blocked) |

## 6. Kiểm kê giao diện theo role

`client/src/App.jsx` định tuyến nhân viên theo `#/admin/*`, `#/crm/*`, `#/nhansu/*`, `#/kho/*`, `#/banhang/*`; nội dung là view chung nhưng role navigation tách riêng. Người mua dùng `CustomerPortal.jsx` với `#/khach-hang/*`. Do đó hệ thống có dashboard/điều hướng riêng theo nhóm quyền, không phải các frontend build độc lập.

| Module/màn hình | ADMIN | QL_NHAN_SU | QL_KHO | QL_BAN_HANG | QL_KHACH_HANG | KHACH_HANG |
|---|---|---|---|---|---|---|
| Tổng quan, báo cáo | Có | Có | Có | Có | Có | Không (portal riêng) |
| Tài khoản | Có | — | — | — | — | — |
| Nhân viên | Có | Có | — | — | — | — |
| Sản phẩm | Có | — | Có | — | — | xem catalog |
| Tồn kho/nhà cung cấp/phiếu kho | Có | — | Có | — | — | — |
| Đơn hàng | Có | — | — | Có | — | đơn của mình/đặt/hủy |
| Khuyến mãi | Có | — | — | Có | CRM phân bổ | voucher của mình |
| Khách hàng, phản hồi, khảo sát, chat | Có | — | — | — | Có | hồ sơ, gửi feedback, khảo sát, chat |
| Cài đặt, nhật ký | Có | — | — | — | — | — |

## 7. Đối chiếu rubric và phạm vi đồ án

| Rubric | Hiện trạng theo code | Đánh giá tài liệu |
|---|---|---|
| I.1 Giới thiệu doanh nghiệp (5đ) | Dữ liệu/seed cho cửa hàng thời trang; không có bằng chứng pháp nhân, quy mô hoặc tổ chức thật | Một phần; cần xác nhận |
| I.2 Khảo sát HTTT (5đ) | Không thấy kết quả khảo sát thực tế trong repository | Chưa có; chỉ chuẩn bị câu hỏi/mẫu |
| I.3 Phân tích (10đ) | Module/route/DB đủ căn cứ để mô tả sơ đồ | Có thể mô hình hóa; cần đối chiếu nghiệp vụ người dùng |
| I.4 Thiết kế CSDL (5đ) | SQL schema/migrations hiện hữu | Có |
| I.4 Thiết kế giao diện (5đ) | React views và role navigation hiện hữu | Có; ảnh chụp phải bổ sung |
| I.5 Cài đặt, bảo trì, hướng dẫn (5đ) | Docker Compose, migration, Kafka relay, user guide có thể lập; vận hành Aiven phụ thuộc cấu hình triển khai | Một phần; runbook vận hành phải xác nhận |
| I.6 Tổng kết (5đ) | Đánh giá được theo chức năng đã code | Có, kèm hạn chế |
| II.1 CSDL: bảng (10đ) | Schema + migrations | Có theo DDL; seed không phủ mọi bảng |
| II.1 Backup/restore (5đ) | Scripts/routes và hướng dẫn dùng pg_dump/pg_restore | Một phần; cần lịch/owner và restore drill thực tế |
| II.2 Admin UI (20đ) | Account roles, product/inventory/suppliers filters, admin views; HR/kho/sales/CRM menus theo role | Một phần; yêu cầu sắp xếp/lọc supplier/product phụ thuộc kiểm tra từng view |
| III.4 CRM (30đ, lựa chọn) | Khách, account lock, feedback, báo cáo tuổi/sở thích, survey/invitations/results, customer self-service, chat | Một phần đến có; chi tiết feature matrix trong Chương 4, một số hạn chế ghi rõ |
| III.3 HRM / III.5 MRP | Không thấy leave/payroll/attendance; MRP công thức sản xuất không có | Chưa có; không chọn làm phần III |

## 8. Giả định cần xác nhận

Catalog/seed mô tả sản phẩm quần áo và phụ kiện cùng hoạt động bán lẻ, vì vậy báo cáo tạm giả định “Hung Fashion” là cửa hàng/doanh nghiệp bán lẻ thời trang đa kênh. Đây là suy luận từ dữ liệu repository, không phải thông tin pháp lý hay khảo sát doanh nghiệp.

## 9. Những điểm thiếu/không thể suy ra từ source

- Không có bằng chứng khảo sát thật, thông tin pháp nhân, số lượng nhân sự thực, nhóm sinh viên/giảng viên và kết quả kiểm thử chấp nhận người dùng.
- Seed JS không thể chuyển nguyên trạng thành SQL độc lập vì tạo hash tài khoản, gọi scraper/normalize và dùng tệp `data/clean/products.json`; script cũng không phủ mọi bảng (ví dụ event, chat, payment demo token phụ thuộc thao tác). Xem `TODO-can-bo-sung.md`.
- PDF học phần trong repo là phiếu đánh giá, cỡ giấy Letter; không tìm thấy mẫu định dạng báo cáo A4. Báo cáo dùng thông số trình bày do yêu cầu người dùng đưa ra.