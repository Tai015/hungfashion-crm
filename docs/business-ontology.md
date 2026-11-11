# Business Ontology — Hung Fashion

> **Trạng thái:** bản mô tả nghiệp vụ theo mã nguồn hiện tại trên `main` sau khi merge PR #39.
>
> **Phạm vi:** chuẩn hóa thuật ngữ, đối tượng, quan hệ, vòng đời, quy tắc và ranh giới hành động cho báo cáo/CRM và các tích hợp AI trong tương lai. Đây là tài liệu mô tả hệ thống, không phải đặc tả cho một AI agent đã được triển khai.

## 1. Mục đích và nguyên tắc

Business Ontology là lớp ngữ nghĩa giúp nhân viên, báo cáo và phần mềm hiểu thống nhất:

- **Đối tượng nào** đang được nói đến (khách hàng, sản phẩm, đơn hàng, thanh toán...).
- **Các đối tượng liên hệ ra sao** và đâu là nguồn dữ liệu có thẩm quyền.
- **Trạng thái nào** hợp lệ, điều kiện chuyển trạng thái và quy tắc tính toán.
- **Ai được xem hoặc thực hiện hành động nào**, trong ngữ cảnh nào.
- **Sự kiện nào đã xảy ra**, ai thực hiện và kết quả ra sao.

Nguyên tắc thiết kế:

1. Database và business service hiện hành là căn cứ; không tự giả định nghiệp vụ chưa có trong code.
2. Không đồng nhất sự kiện kỹ thuật, lịch sử tương tác khách hàng và nhật ký kiểm toán.
3. Không suy ra doanh thu từ tổng giá trị đơn hàng nếu chưa xét trạng thái đơn và thanh toán.
4. Mọi thao tác ghi phải đi qua API/service có xác thực, phân quyền và kiểm tra quy tắc; AI (nếu bổ sung) không được truy cập/ghi DB trực tiếp.
5. Những điểm chưa được xác minh hoặc chưa được triển khai phải được ghi rõ là khoảng trống.

## 2. Thuật ngữ nghiệp vụ chuẩn

| Thuật ngữ | Định nghĩa |
|---|---|
| Tài khoản (Account) | Danh tính đăng nhập, gắn với một vai trò và trạng thái tài khoản. |
| Khách hàng (Customer) | Hồ sơ CRM của người mua; có thể liên kết tài khoản, đơn hàng, phản hồi, khảo sát và điểm thành viên. |
| Nhân viên (Employee) | Hồ sơ nhân sự được liên kết với tài khoản; có thể được gán vào đơn hàng, nhập kho, hội thoại hoặc xử lý phản hồi. |
| Sản phẩm (Product) | Mặt hàng được kinh doanh, thuộc danh mục và có thể mang thương hiệu. |
| Phiên bản sản phẩm (Product Variant) | Đơn vị bán/kiểm kho cụ thể của sản phẩm, ví dụ tổ hợp size/màu hoặc biến thể mặc định. |
| Tồn kho (Stock) | Số lượng hiện có ở cấp biến thể; không phải số lượng tổng hợp độc lập ở cấp sản phẩm. |
| Phiếu kho (Import Receipt) | Chứng từ nhập, xuất hoặc điều chỉnh kho, có các dòng chi tiết theo biến thể. |
| Khuyến mãi (Promotion) | Quy tắc giảm giá theo phần trăm hoặc số tiền, có điều kiện và thời hạn. |
| Ưu đãi khách hàng (User Promotion) | Quan hệ ghi nhận một mã khuyến mãi được cấp/lưu trong ví của khách hàng và trạng thái sử dụng. |
| Đơn hàng (Order) | Giao dịch mua hàng của khách hàng hoặc đơn được nhân viên xử lý; gồm các dòng sản phẩm, giá và trạng thái. |
| Thanh toán (Payment) | Bản ghi phương thức, số tiền và trạng thái thanh toán cho đơn hàng. |
| Sự kiện giao dịch (Transaction Event) | Dữ liệu sự kiện phục vụ theo dõi/đồng bộ, không thay thế bản ghi Payment hoặc Order. |
| Phản hồi (Feedback) | Ý kiến/đánh giá của khách hàng về sản phẩm, dịch vụ, nhân viên, khiếu nại hoặc đề xuất. |
| Khảo sát (Survey) | Bộ câu hỏi có đối tượng, lời mời, phản hồi và câu trả lời. |
| Hội thoại CSKH (Conversation) | Luồng hỗ trợ giữa khách hàng và nhân viên, chứa các tin nhắn. |
| Điểm thành viên (Loyalty Points) | Số dư điểm có thể dùng và điểm tích lũy trọn đời dùng xác định hạng thành viên. |
| Lịch sử tương tác (Customer Interaction Timeline) | Dòng thời gian tổng hợp từ các nguồn nghiệp vụ/sự kiện hiện có; không phải nhật ký kiểm toán đầy đủ. |
| Nhật ký kiểm toán (Audit Log) | Bản ghi ai thực hiện hành động nào trên đối tượng nào, khi nào và kết quả HTTP ra sao. |
| Sự kiện người dùng (User Event) | Dữ liệu hành vi/tương tác như đăng nhập, xem trang hoặc điều hướng; không tự chứng minh một thay đổi nghiệp vụ đã được commit. |

## 3. Mô hình đối tượng và quan hệ

### 3.1 Danh tính và CRM

- `Role` 1—N `Account`; quyền chi tiết được cấu hình qua `Role Permission` N—N `Permission`.
- `Account` có thể liên kết tối đa một `Customer` hoặc một `Employee` qua `account_id` duy nhất ở từng hồ sơ.
- `Customer` N—N `Interest` qua `Customer Interest`.
- `Customer` có thể liên quan đến nhiều `Order`, `Feedback`, `Survey Response`, `Survey Invitation`, `Conversation`, `User Promotion` và `Loyalty Point Transaction`.
- Hồ sơ khách hàng có cơ chế xóa mềm/anonymize: giữ `customer_id` để bảo toàn liên kết lịch sử; không diễn giải thao tác xóa hồ sơ là xóa toàn bộ lịch sử giao dịch.

### 3.2 Danh mục, sản phẩm và kho

- `Category` có quan hệ cha—con tự tham chiếu.
- `Brand` 1—N `Product`; `Category` 1—N `Product`.
- `Product` 1—N `Product Variant`; sản phẩm phải có biến thể để quản lý số lượng bán/kho. Migration tạo biến thể mặc định cho sản phẩm cũ chưa có biến thể.
- `Size` và `Color` có thể mô tả biến thể; biến thể mặc định có thể không gắn size/màu.
- `Product` 1—N `Product Image`.
- `Product` N—N `Supplier` qua `Product Supplier` (migration 026); không nên tiếp tục mô hình hóa một nhà cung cấp duy nhất trên sản phẩm.
- `Supplier` 1—N `Import Receipt`; `Employee` có thể phụ trách phiếu; `Import Receipt` 1—N `Import Detail`; mỗi dòng chi tiết tham chiếu một `Product Variant`.
- Số lượng tồn được lưu ở `product_variant.quantity`. Khi báo cáo tồn theo sản phẩm, cần tổng hợp các biến thể, không cộng thêm một trường tồn kho sản phẩm giả định.

### 3.3 Bán hàng và thanh toán

- `Customer` 1—N `Order` (đơn có thể không còn customer liên kết khi hồ sơ bị xóa/ẩn danh).
- `Employee` có thể được gán xử lý nhiều `Order`.
- `Order` 1—N `Order Detail`; mỗi dòng tham chiếu một `Product Variant`.
- `Order` có tối đa một `Payment` theo unique constraint hiện tại.
- `Order` có thể tham chiếu một `Promotion`; `User Promotion` biểu diễn mã đã cấp/lưu cho khách hàng.
- Giá và số lượng tại `Order Detail` là dữ liệu chốt của dòng hàng tại thời điểm đặt; không tính lại đơn cũ bằng giá bán hiện tại của Product/Variant.
- `Payment` và `Transaction Event` là hai khái niệm khác nhau: Payment là trạng thái thanh toán nghiệp vụ; Transaction là lịch sử sự kiện phục vụ truy vết/đồng bộ.

### 3.4 Chăm sóc khách hàng và khảo sát

- `Feedback` có thể gắn Customer, Product, Order và Employee xử lý; tệp đính kèm thuộc Feedback.
- `Survey` 1—N `Survey Question`; câu hỏi có thể có nhiều `Survey Option`.
- `Survey` N—N `Customer` qua `Survey Invitation`; một khách hàng có tối đa một `Survey Response` cho một khảo sát theo unique constraint.
- `Survey Response` 1—N `Survey Answer`; câu trả lời có thể tham chiếu option hoặc lưu văn bản.
- `Customer` 1—N `Conversation`; hội thoại có thể được gán cho Employee; `Conversation` 1—N `Chat Message`; người gửi tin nhắn là Account.
- `Customer Interaction Timeline` là view tổng hợp nhiều nguồn: user events, đơn hàng, transaction events, feedback, khảo sát, điểm, ưu đãi và hội thoại/tin nhắn. Không được coi mọi dòng timeline là một audit record.

## 4. Vòng đời và trạng thái nghiệp vụ

Các giá trị dưới đây lấy từ enum/check constraint trong schema và migration. Không tự tạo trạng thái mới khi tích hợp.

| Đối tượng | Trạng thái/loại hiện có | Ý nghĩa |
|---|---|---|
| Account | `Active`, `Blocked`, `Pending` | Tài khoản hoạt động, bị chặn hoặc chờ xử lý. |
| Order | `Pending` → `Confirmed` → `Processing` → `Shipped` → `Delivered`; kết thúc khác: `Cancelled`, `Refunded` | Trạng thái đơn. Chuỗi là luồng tham khảo; API phải xác nhận chuyển trạng thái hợp lệ. |
| Payment | `Pending`, `Paid`, `Failed`, `Refunded` | Trạng thái thanh toán, độc lập với trạng thái vận chuyển/đơn hàng. |
| Promotion | `Percent`, `FixedAmount` | Kiểu tính giảm giá; hiệu lực còn phụ thuộc active, ngày, min order, giới hạn lượt. |
| User Promotion | `Available`, `Used`, `Expired` | Trạng thái mã trong ví khách hàng. |
| Feedback | `New`, `Processing`, `Resolved`, `Rejected` | Tiếp nhận và xử lý phản hồi. |
| Survey | `Draft`, `Active`, `Closed` | Trạng thái phát hành khảo sát. |
| Conversation | `Open`, `Resolved`, `Closed` | Trạng thái hỗ trợ CSKH. |
| Import Receipt | `Import`, `Export`, `Adjustment` | Loại nghiệp vụ kho. |
| Survey Invitation | `Sent`, `Opened`, `Completed` | Trạng thái lời mời khảo sát. |

**Lưu ý:** Không suy luận rằng `Delivered` đồng nghĩa `Paid`, hoặc `Paid` đồng nghĩa `Delivered`. Hai trục trạng thái phải được đọc riêng.

## 5. Quy tắc nghiệp vụ và định nghĩa chỉ số

### 5.1 Đơn hàng và doanh thu

- Tổng tiền đơn (`order.total_amount`) là giá trị đơn sau các khoản giảm được lưu trên đơn; không tự động là doanh thu đã thu.
- Theo helper báo cáo hiện tại `VALID_PAID_ORDER_SQL`, đơn được tính vào tập đơn đã thanh toán hợp lệ khi: trạng thái đơn không phải `Cancelled`/`Refunded`; tồn tại Payment `Paid`; và không tồn tại Payment `Refunded`.
- Vì vậy cần phân biệt rõ:
  - **Giá trị đơn đặt:** tổng giá trị các đơn theo tiêu chí lọc, chưa khẳng định đã thu.
  - **Doanh thu đơn đã thanh toán hợp lệ:** tổng giá trị đơn thỏa điều kiện truy vấn nêu trên.
  - **Tiền thanh toán:** số tiền trên các bản ghi Payment theo trạng thái/method.
  - **Tiền thực thu COD:** chỉ được khẳng định khi hệ thống có bằng chứng xác nhận đã thu; không coi đơn COD vừa tạo là đã thu.
- Khi báo cáo phải nêu khoảng thời gian, múi giờ `Asia/Ho_Chi_Minh`, trạng thái được tính, cách xử lý hoàn tiền và đơn hủy.
- Không tính đơn `Cancelled` hoặc `Refunded` vào doanh thu đã thanh toán hợp lệ theo helper trên.

### 5.2 Giá, giảm giá và khuyến mãi

- `Percent` là giảm theo phần trăm; `FixedAmount` là giảm số tiền.
- Promotion có mã duy nhất, ngày bắt đầu/kết thúc, mức tối thiểu đơn, giới hạn giảm tối đa và giới hạn lượt dùng (nếu được cấu hình).
- Mã hợp lệ phải đang active, nằm trong thời hạn và chưa hết lượt.
- Khách hàng cần có bản ghi User Promotion trạng thái Available khi kiểm tra mã theo luồng khách hàng.
- Schema Order hiện có một `promotion_id`; chưa đủ căn cứ để khẳng định có cơ chế cộng dồn nhiều chương trình khuyến mãi trên cùng một đơn. Không hứa hẹn stacking nếu chưa triển khai và kiểm thử.

### 5.3 Kho và giá vốn

- Số lượng tồn là số lượng ở biến thể.
- Phiếu kho có dòng số lượng dương và đơn giá không âm; loại phiếu phân biệt Import/Export/Adjustment.
- `product.import_price` và `product.selling_price` tồn tại; `product_variant.selling_price` có thể ghi đè giá bán ở cấp biến thể.
- Khi xác định giá bán áp dụng, cần dùng đúng logic của API đặt hàng (giá biến thể nếu có, nếu không thì giá sản phẩm) và lưu snapshot vào Order Detail.
- Chưa có căn cứ trong tài liệu này để khẳng định báo cáo lợi nhuận đã phân bổ giá vốn theo từng lô nhập, phí vận chuyển, chi phí vận hành hoặc chi phí khuyến mãi.

### 5.4 Điểm thành viên

- Phân biệt `points_balance` (số dư có thể sử dụng) và `lifetime_points` (điểm tích lũy trọn đời để xét hạng).
- Hạng được tính bởi hàm `customer_tier_for_points`: New < 1.000; Regular từ 1.000; Silver từ 5.000; Gold từ 20.000; VIP từ 100.000 điểm.
- Sổ `loyalty_point_transaction` lưu loại biến động, số điểm thay đổi và số dư sau giao dịch.
- Không cộng điểm chỉ vì đơn được tạo; phải tuân theo quy tắc ghi nhận điểm của luồng thanh toán/đơn hàng.

### 5.5 CRM và dữ liệu khách hàng

- Hồ sơ khách hàng bị xóa/ẩn danh không đồng nghĩa xóa đơn, thanh toán và dấu vết nghiệp vụ.
- Timeline khách hàng là dữ liệu tổng hợp để nhân viên hiểu quá trình tương tác; nó không chứng minh đầy đủ mọi thay đổi hồ sơ hoặc mọi thao tác của nhân viên.
- Thông tin cá nhân, thông tin đăng nhập, token và bí mật không nên xuất hiện trong bản ghi audit hoặc câu trả lời AI nếu không cần thiết và không được phép.

## 6. Phân quyền và ranh giới hành động

### 6.1 Mô hình quyền

- Vai trò và quyền được biểu diễn bằng `role`, `permission`, `role_permission`.
- Tài khoản có trạng thái; việc xác thực thành công không thay thế kiểm tra vai trò/quyền trên từng endpoint.
- Khách hàng chỉ được thao tác trên dữ liệu thuộc tài khoản/Customer của mình theo điều kiện endpoint.
- Nhân viên và quản trị viên chỉ được thao tác trong phạm vi quyền được backend cấp. Không dựa vào việc ẩn nút hoặc ẩn URL ở giao diện làm biện pháp bảo mật.

### 6.2 Ma trận hành động mức nghiệp vụ

| Nhóm hành động | Khách hàng | Nhân viên | Quản trị viên |
|---|---|---|---|
| Xem/cập nhật hồ sơ của chính mình | Có, theo API | Không áp dụng | Theo quyền quản trị |
| Xem/tạo đơn của chính mình | Có, theo API | Xử lý theo quyền | Quản trị theo quyền |
| Quản lý sản phẩm/kho | Không | Theo quyền được cấp | Theo quyền được cấp |
| Quản lý khuyến mãi/khảo sát | Tham gia/nhận mã theo API | Theo quyền được cấp | Theo quyền được cấp |
| Xử lý phản hồi/hội thoại | Gửi và xem của mình | Theo phân công/quyền | Theo quyền được cấp |
| Xem audit log toàn hệ thống | Không | Chỉ nếu được cấp rõ ràng | Endpoint audit hiện được giới hạn Admin |

Ma trận này là mô tả nguyên tắc; danh sách quyền hiệu lực phải được đối chiếu với permission seed và middleware/API ở thời điểm triển khai. Không dùng bảng này thay cho kiểm tra backend.

### 6.3 Quy tắc cho AI/automation trong tương lai

**Được phép khi đã có xác thực và quyền đọc phù hợp:**
- Trả lời câu hỏi tổng hợp từ API báo cáo.
- Giải thích trạng thái đơn/thanh toán, số lượng tồn, phản hồi và khảo sát.
- Nêu nguồn dữ liệu, bộ lọc, thời điểm và định nghĩa chỉ số.

**Cần xác nhận người dùng và gọi business API có phân quyền:**
- Tạo/cập nhật đơn, thay đổi trạng thái, điều chỉnh tồn kho.
- Tạo hoặc sửa khuyến mãi/khảo sát.
- Chặn/mở tài khoản, cập nhật hồ sơ hoặc xử lý phản hồi.
- Hoàn tiền, ghi nhận thanh toán hoặc thực hiện hành động tài chính.

**Không được phép:**
- Truy cập DB trực tiếp để bỏ qua business rules.
- Tự nâng quyền hoặc dùng token/phiên của người khác.
- Tự suy diễn đã thu tiền, đã giao hàng, đã hoàn tiền hoặc đã xử lý khi không có trạng thái/sự kiện xác nhận.
- Tiết lộ password hash, token, thông tin bí mật hoặc dữ liệu cá nhân vượt quá phạm vi quyền.
- Tạo dữ liệu nghiệp vụ giả để trả lời một câu hỏi báo cáo.

## 7. Sự kiện, lịch sử và khả năng truy vết

Ba lớp dữ liệu cần được giữ tách biệt:

| Lớp | Mục tiêu | Nguồn hiện có | Giới hạn |
|---|---|---|---|
| Customer Interaction Timeline | Nhìn lại tương tác của một khách hàng | View `customer_interaction_timeline` tổng hợp từ user_events, transactions, orders, feedback, survey, loyalty, promotion và chat | Không phải audit đầy đủ; phụ thuộc dữ liệu nguồn và các loại sự kiện đã được đưa vào view. |
| Transaction/Event Stream | Theo dõi sự kiện nghiệp vụ/kỹ thuật và đồng bộ | `transactions`, `user_events`, `outbox_events`; outbox dùng event_id và chống ghi trùng theo event_id | Payload/sự kiện không thay thế trạng thái chuẩn ở Order/Payment; cần đối chiếu nguồn phát và thời điểm. |
| Business Audit Log | Truy vết hành động ghi: actor, action, object, thời điểm, outcome, request ID | Migration 033, middleware audit, endpoint audit và giao diện lịch sử hoạt động được thêm trong PR #39 | Ghi nhận request mutation và các trường thay đổi được allowlist; chưa phải snapshot before/after toàn bộ và chưa được chứng minh chống sửa ở tầng DB. |

Audit log không nên lưu password, token, cookie hoặc dữ liệu nhạy cảm. Khi điều tra lỗi, dùng Request ID để liên kết audit entry với structured application logs.

## 8. Câu hỏi nghiệp vụ chuẩn và cách diễn giải

| Câu hỏi | Dữ liệu cần kết hợp | Điều kiện bắt buộc khi trả lời |
|---|---|---|
| Doanh thu tháng này là bao nhiêu? | Order + Payment | Nêu rõ dùng đơn đã thanh toán hợp lệ hay tổng giá trị đơn; áp dụng múi giờ và loại trừ hủy/hoàn. |
| Đơn nào chưa thanh toán? | Order + Payment | Không coi trạng thái Shipped/Delivered là đã thanh toán. |
| Sản phẩm nào sắp hết hàng? | Product + Variant | Tổng hợp quantity theo biến thể; ngưỡng low-stock hiện đặt ở domain types là 5, cần ghi rõ ngưỡng. |
| Khách hàng nào mua nhiều nhất? | Customer + Order + Payment | Nêu tiêu chí xếp hạng: tổng chi tiêu đơn hợp lệ, số đơn hay số tiền thanh toán. |
| Khách hàng đã tương tác với cửa hàng ra sao? | Customer Interaction Timeline | Phân biệt sự kiện truy cập, đặt hàng, thanh toán, phản hồi, khảo sát và CSKH. |
| Ai đã thay đổi dữ liệu này? | Business Audit Log + application logs | Trả về actor, hành động, đối tượng, thời điểm, outcome và request ID nếu có. |
| Khuyến mãi có dùng được không? | Promotion + User Promotion + Order | Kiểm tra active, thời hạn, min order, usage limit và trạng thái mã của khách hàng. |

## 9. Khoảng trống và việc cần xác minh

Các mục sau không được xem là đã hoàn thiện chỉ vì có tên trong ontology:

1. **Snapshot audit before/after:** PR #39 ghi nhận trường thay đổi được allowlist; chưa lưu snapshot đầy đủ trước/sau cho mọi thực thể.
2. **Audit coverage:** cần rà soát từng endpoint mutation để xác nhận middleware ghi nhận đúng actor, object và outcome; các thao tác nền/worker cần correlation phù hợp.
3. **Audit integrity/retention:** chưa có bằng chứng về chính sách lưu trữ, phân quyền DB chống sửa/xóa, archive hoặc cảnh báo audit bị gián đoạn.
4. **Customer timeline completeness:** view là tập hợp các nguồn đã chọn, không phải nhật ký toàn diện mọi thay đổi thông tin khách hàng.
5. **Promotion stacking:** schema Order hiện gắn một promotion_id; chưa mô tả được nhiều khuyến mãi cộng dồn.
6. **Refund model:** cần kiểm tra quy trình hoàn tiền thực tế, một đơn có thể có nhiều lần thanh toán/hoàn tiền hay không; schema hiện tại có unique payment theo order.
7. **Profit reporting:** cần xác định quy tắc giá vốn, hoàn hàng, phí vận chuyển, chiết khấu và chi phí khác trước khi gọi một chỉ số là lợi nhuận.
8. **Permission matrix:** cần sinh ma trận cuối cùng từ permission seed + route middleware, không dựa vào tên vai trò suy đoán.
9. **State transition contract:** cần tài liệu hóa các chuyển trạng thái được API cho phép và các tác dụng phụ (email, stock, loyalty, transaction event).
10. **Data quality/lineage:** cần định nghĩa cách xử lý dữ liệu thiếu, duplicate event, timezone, soft-deleted customer và các bản ghi lịch sử cũ.

## 10. Nguồn triển khai tham chiếu

Các điểm mô hình trong tài liệu này được đối chiếu với các thành phần sau của repository:

- `store-admin/server/sql/schema.sql` — schema nền, enum và quan hệ cốt lõi.
- `store-admin/server/sql/migrations/006_chat.sql` — hội thoại và tin nhắn CSKH.
- `store-admin/server/sql/migrations/008_loyalty_point_transactions.sql` và `024_customer_lifetime_points_and_tiers.sql` — sổ điểm và hạng thành viên.
- `store-admin/server/sql/migrations/019_customer_interaction_timeline_view.sql` và `032_customer_order_status_timeline.sql` — timeline tương tác khách hàng.
- `store-admin/server/sql/migrations/025_default_product_variant.sql` — biến thể mặc định.
- `store-admin/server/sql/migrations/026_product_suppliers_many_to_many.sql` — quan hệ sản phẩm/nhà cung cấp.
- `store-admin/server/sql/migrations/030_customer_soft_delete.sql` — xóa mềm hồ sơ khách hàng.
- `store-admin/server/src/domain/reporting.js` — điều kiện đơn thanh toán hợp lệ cho báo cáo.
- `store-admin/server/src/domain/types.js` — trạng thái đơn, quy tắc điểm mặc định và ngưỡng tồn thấp.
- `store-admin/server/src/transaction-events.js` và `outbox-writer.js` — phát/ghi sự kiện giao dịch và chống trùng event.
- `store-admin/server/src/audit-logging.js`, `routes/report.js` và `client/src/views/AuditLogView.jsx` — audit log sau PR #39.

---
**Quy tắc cập nhật tài liệu:** khi schema, migration, API hoặc permission thay đổi, cập nhật ontology cùng PR tương ứng. Nếu code và tài liệu mâu thuẫn, ghi nhận sai lệch và xác minh hành vi runtime trước khi sửa định nghĩa nghiệp vụ.
