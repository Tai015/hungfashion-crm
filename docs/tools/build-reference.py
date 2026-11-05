from pathlib import Path
import re

root = Path(__file__).resolve().parents[2]
sql_dir = root / 'store-admin' / 'server' / 'sql'
out = root / 'docs' / 'report'
base = (sql_dir / 'schema.sql').read_text(encoding='utf-8')
seed_marker = '-- ============================================================\n--  SEED DATA'
base_schema = base.split(seed_marker)[0].rstrip() + '\n'
migrations = sorted((sql_dir / 'migrations').glob('*.sql'))
parts = [base_schema] + [f'\n-- ===== Migration {p.name} =====\n' + p.read_text(encoding='utf-8') for p in migrations]
all_sql = '\n'.join(parts)
parse_sql = re.sub(r'--[^\n]*', '', all_sql)

def split_top(s):
    out, start, depth, quote = [], 0, 0, False
    for i, c in enumerate(s):
        if c == "'": quote = not quote
        elif not quote:
            if c == '(': depth += 1
            elif c == ')': depth -= 1
            elif c == ',' and depth == 0:
                out.append(s[start:i]); start = i + 1
    out.append(s[start:])
    return out

# Collect CREATE TABLE blocks and the additive ALTER TABLE columns/constraints.
tables = {}
for m in re.finditer(r'CREATE TABLE IF NOT EXISTS\s+(?:"([^"]+)"|(\w+))\s*\(', parse_sql, re.I):
    name = m.group(1) or m.group(2)
    i, depth, quote = m.end(), 1, False
    j = i
    while j < len(parse_sql) and depth:
        c = parse_sql[j]
        if c == "'": quote = not quote
        elif not quote:
            if c == '(': depth += 1
            elif c == ')': depth -= 1
        j += 1
    body = parse_sql[i:j-1]
    table = tables.setdefault(name, {'columns': [], 'constraints': []})
    if table['columns']: continue
    for raw in split_top(body):
        x = raw.strip()
        if not x: continue
        if re.match(r'^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\s*\(|CHECK\s*\()', x, re.I):
            table['constraints'].append(' '.join(x.split()))
        else:
            col = re.match(r'^"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(.+)$', x, re.S)
            if col: table['columns'].append((col.group(1), ' '.join(col.group(2).split())))

for m in re.finditer(r'ALTER TABLE\s+(?:"([^"]+)"|(\w+))\s+(.*?);', parse_sql, re.I | re.S):
    name = m.group(1) or m.group(2)
    body = m.group(3)
    table = tables.setdefault(name, {'columns': [], 'constraints': []})
    for a in re.finditer(r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?\s+(.+?)(?=,\s*ADD\s+COLUMN\b|$)', body, re.I | re.S):
        pair = (a.group(1), ' '.join(a.group(2).strip().rstrip(',').split()))
        if pair[0] not in [c[0] for c in table['columns']]: table['columns'].append(pair)
    for a in re.finditer(r'ADD\s+CONSTRAINT\s+([^,;]+)', body, re.I):
        table['constraints'].append(' '.join(a.group(1).split()))

indexes = {}
for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w"]+)\s+ON\s+(?:"([^"]+)"|(\w+))\s*(?:USING\s+(\w+)\s*)?\(([^;]+)\)', parse_sql, re.I):
    indexes.setdefault(m.group(2) or m.group(3), []).append(f"{m.group(1)}({m.group(5).strip()})")


meanings = {
 'id':'Khóa định danh nội bộ', 'account_id':'Liên kết tài khoản', 'customer_id':'Liên kết khách hàng', 'employee_id':'Liên kết nhân viên', 'role_id':'Liên kết vai trò', 'permission_id':'Liên kết quyền', 'product_id':'Liên kết sản phẩm', 'variant_id':'Liên kết biến thể', 'supplier_id':'Liên kết nhà cung cấp', 'category_id':'Liên kết danh mục', 'brand_id':'Liên kết thương hiệu', 'order_id':'Liên kết đơn hàng', 'promotion_id':'Liên kết khuyến mãi', 'receipt_id':'Liên kết phiếu kho', 'detail_id':'Mã dòng chi tiết', 'payment_id':'Mã thanh toán', 'feedback_id':'Liên kết phản hồi', 'attachment_id':'Mã tệp đính kèm', 'survey_id':'Liên kết khảo sát', 'question_id':'Liên kết câu hỏi', 'option_id':'Liên kết lựa chọn', 'response_id':'Liên kết lượt trả lời', 'answer_id':'Mã câu trả lời', 'conversation_id':'Liên kết hội thoại', 'message_id':'Liên kết tin nhắn', 'interest_id':'Liên kết sở thích', 'user_promo_id':'Mã khuyến mãi được cấp', 'loyalty_transaction_id':'Mã giao dịch điểm', 'invitation_id':'Mã lời mời khảo sát', 'token_hash':'Hash token demo', 'event_id':'Mã sự kiện chống ghi trùng', 'transaction_id':'Mã giao dịch nghiệp vụ', 'event_type':'Loại sự kiện', 'source':'Nguồn dữ liệu', 'producer_source':'Nguồn phát sự kiện', 'occurred_at':'Thời điểm nghiệp vụ xảy ra', 'created_at':'Thời điểm tạo bản ghi', 'updated_at':'Thời điểm cập nhật', 'ordered_at':'Thời điểm đặt đơn', 'paid_at':'Thời điểm thanh toán', 'sent_at':'Thời điểm gửi', 'submitted_at':'Thời điểm gửi câu trả lời', 'registered_at':'Thời điểm đăng ký', 'date_of_birth':'Ngày sinh', 'start_date':'Ngày bắt đầu', 'end_date':'Ngày kết thúc', 'expires_at':'Thời điểm hết hạn', 'used_at':'Thời điểm sử dụng', 'published_at':'Thời điểm relay công bố', 'status':'Trạng thái', 'order_status':'Trạng thái đơn hàng', 'payment_status':'Trạng thái thanh toán', 'payment_method':'Phương thức thanh toán', 'method':'Phương thức', 'amount':'Số tiền', 'total_amount':'Tổng tiền', 'subtotal':'Tạm tính', 'discount_amt':'Số tiền giảm', 'quantity':'Số lượng', 'points_delta':'Biến động điểm', 'balance_after':'Số dư điểm sau giao dịch', 'rating':'Điểm đánh giá', 'content':'Nội dung', 'reply':'Phản hồi của cửa hàng', 'email':'Email', 'phone':'Số điện thoại', 'address':'Địa chỉ', 'full_name':'Họ tên', 'username':'Tên đăng nhập', 'password_hash':'Hash mật khẩu', 'role_name':'Tên vai trò', 'permission_code':'Mã quyền', 'description':'Mô tả', 'name':'Tên', 'code':'Mã', 'title':'Tiêu đề', 'note':'Ghi chú', 'is_active':'Cờ hoạt động', 'is_read':'Cờ đã đọc', 'is_primary':'Cờ ảnh chính', 'display_order':'Thứ tự hiển thị', 'mime_type':'Kiểu MIME', 'original_name':'Tên tệp gốc', 'file_size':'Dung lượng byte', 'media_url':'Đường dẫn media', 'image_url':'Đường dẫn ảnh', 'storage_name':'Tên tệp lưu trữ', 'payload':'Nội dung sự kiện JSON', 'partition_key':'Khóa phân vùng Kafka', 'topic':'Kafka topic', 'page':'Trang phát sinh sự kiện', 'section':'Khu vực phát sinh sự kiện', 'action':'Hành động', 'source_check':'Dấu kiểm tra nguồn', 'session_id':'Mã phiên', 'user_id':'Mã người dùng', 'currency':'Đơn vị tiền tệ', 'item_count':'Số mặt hàng', 'benchmark_run_id':'Mã lần benchmark', 'occurred_at':'Thời điểm sự kiện', 'gender':'Giới tính', 'customer_tier':'Hạng khách hàng', 'loyalty_point':'Điểm tích lũy', 'interest_name':'Tên sở thích', 'product_name':'Tên sản phẩm', 'supplier_name':'Tên nhà cung cấp', 'contact_name':'Tên người liên hệ', 'order_channel':'Kênh bán', 'transaction_ref':'Mã tham chiếu giao dịch', 'token_hash':'Mã token đã băm', 'assigned_to':'Nhân viên được phân công', 'sender_account_id':'Tài khoản gửi tin', 'sender_name':'Tên người gửi', 'subject':'Chủ đề hội thoại', 'question_text':'Nội dung câu hỏi', 'question_type':'Loại câu hỏi', 'option_text':'Nội dung lựa chọn', 'answer_text':'Nội dung trả lời', 'target_gender':'Giới tính mục tiêu', 'target_tier':'Hạng mục tiêu', 'min_age':'Tuổi tối thiểu', 'max_age':'Tuổi tối đa', 'reward_promotion_id':'Khuyến mãi thưởng', 'target_interest_id':'Sở thích mục tiêu', 'used_count':'Số lượt đã dùng', 'usage_limit':'Giới hạn lượt dùng', 'promo_type':'Loại ưu đãi', 'value':'Giá trị ưu đãi', 'min_order':'Giá trị đơn tối thiểu', 'max_discount':'Mức giảm tối đa', 'import_price':'Giá nhập', 'selling_price':'Giá bán', 'hex_code':'Mã màu HEX', 'size_name':'Tên kích cỡ', 'color_name':'Tên màu', 'sku':'Mã SKU', 'receipt_type':'Loại phiếu', 'receipt_date':'Ngày lập phiếu', 'hire_date':'Ngày vào làm', 'position':'Chức vụ', 'is_required':'Câu hỏi bắt buộc', 'status':'Trạng thái', 'assigned_at':'Thời điểm phân bổ', 'invited_at':'Thời điểm mời', 'invited_by':'Nhân viên gửi lời mời', 'created_by':'Nhân viên tạo', 'media_type':'Loại media', 'feedback_type':'Loại phản hồi', 'customer_interest_id':'Khóa sở thích khách hàng', 'order_id':'Liên kết đơn hàng', 'version':'Phiên bản sự kiện'
}
def meaning(col):
 if col in meanings: return meanings[col]
 if col.endswith('_id'): return 'Khóa liên kết đến bản ghi liên quan'
 if col.startswith('is_'): return 'Cờ bật/tắt hoặc trạng thái dạng đúng/sai'
 if col.endswith('_at') or col.endswith('_date'): return 'Thời điểm/ngày nghiệp vụ'
 return col.replace('_',' ').capitalize()

def latex(s):
 for a,b in [("\\","\\textbackslash{}"),("&","\\&"),("%","\\%"),("$","\\$"),("#","\\#"),("_","\\_"),("{","\\{"),("}","\\}"),("~","\\textasciitilde{}"),("^","\\textasciicircum{}")]: s=s.replace(a,b)
 return s

# Exact schema copy: baseline DDL, followed by the ordered repository migrations.
(root / 'database' / 'schema.sql').write_text('-- Hung Fashion CRM — schema-only assembly from repository SQL.\n-- Source: server/sql/schema.sql (DDL only) and server/sql/migrations/001–015.\n-- This file is a review/import script, not a live database dump.\n' + '\n'.join(parts), encoding='utf-8')

lines = ['# 00. Kiểm kê hệ thống từ mã nguồn', '', '> Snapshot kiểm kê chỉ dựa trên mã nguồn, SQL trong repository và seed script. Không truy vấn database đang chạy. Các thông tin doanh nghiệp bên ngoài sản phẩm thời trang là giả định cần xác nhận.', '', '## 1. Kiến trúc và vai trò', '', '- Frontend: React + Vite, JavaScript, `store-admin/client`; dùng hash routes theo vai trò trong `client/src/App.jsx`. API: Express tại `server/src/index.js`. PostgreSQL qua `pg`; Kafka qua KafkaJS.', '- Sáu vai trò trong schema/seed: `ADMIN`, `QL_NHAN_SU`, `QL_KHO`, `QL_BAN_HANG`, `QL_KHACH_HANG`, `KHACH_HANG`. Không thấy vai trò nghiệp vụ bổ sung trong SQL seed.', '- Bản ghi vai trò và quyền có trong schema baseline; quyền thực tế được enforce chủ yếu bằng middleware tại `server/src/index.js` và kiểm tra bổ sung trong route.', '', '| Vai trò | Màn hình chính trong frontend | Quyền API theo mount |', '|---|---|---|', '| ADMIN | Tổng quan, Báo cáo, Tài khoản, Khách hàng, Đơn hàng, Sản phẩm, Nhân viên, Tồn kho, Khuyến mãi, Phản hồi, Khảo sát, Chat CSKH, Nhật ký, Cài đặt | Quản trị tài khoản, nhân viên, CRM, kho, đơn, sản phẩm, khuyến mãi, phản hồi, khảo sát, báo cáo, cấu hình; đọc catalog |', '| QL_NHAN_SU | Tổng quan, Báo cáo, Nhân viên | Nhân viên và báo cáo |', '| QL_KHO | Tổng quan, Báo cáo, Sản phẩm, Tồn kho | Đọc sản phẩm; sửa sản phẩm và quản lý tồn kho |', '| QL_BAN_HANG | Tổng quan, Báo cáo, Đơn hàng, Khuyến mãi | Đơn hàng, khuyến mãi; đọc sản phẩm |', '| QL_KHACH_HANG | Tổng quan, Báo cáo, Khách hàng, Chat CSKH, Phản hồi, Khảo sát | CRM, chat, feedback, survey và báo cáo |', '| KHACH_HANG | Catalog, Giỏ hàng, Thanh toán, Đơn của tôi, Voucher, Loyalty, Hồ sơ, Phản hồi, Khảo sát, Chat | Các luồng self-service được giới hạn theo route và chủ thể; một số trang khách là trong `CustomerPortal.jsx` |', '', '## 2. Danh sách API', '', 'Các route dưới đây được ghép từ `server/src/index.js` và `server/src/routes/*.js`. “Vai trò mount” là quyền middleware ở cấp router; các handler có kiểm tra quyền/chủ sở hữu chi tiết được ghi chú riêng. API dùng JWT trừ đăng nhập/đăng ký, health và hai trang demo payment; route demo chỉ hoạt động khi cờ bật.', '', '| Method | Đường dẫn | Vai trò/điều kiện | Mục đích |', '|---|---|---|---|']

routes = {
'account':('ADMIN','Tài khoản, danh sách vai trò và thao tác khóa/xóa/phân quyền'),
'auth':('Công khai: đăng ký/đăng nhập; `/me` cần JWT','Xác thực, hồ sơ cá nhân'),
'chat':('CHAT_ROLES; handler phân biệt nhân viên/khách và kiểm chủ hội thoại','Chat, tệp đính kèm, trạng thái, SSE'),
'customer':('ADMIN, QL_KHACH_HANG','Quản lý CRM và thống kê khách'),
'demo-payment':('Công khai khi `DEMO_PAYMENT=true`; giới hạn tốc độ','Trang xác nhận thanh toán demo; không phải thanh toán thật'),
'employee':('ADMIN, QL_NHAN_SU','Hồ sơ nhân viên'),
'feedback':('POST: KHACH_HANG; GET mine/media cho chủ; nghiệp vụ CSKH: ADMIN, QL_KHACH_HANG','Phản hồi, đính kèm, trả lời, trạng thái, thống kê'),
'inventory':('ADMIN, QL_KHO','Tồn kho, nhà cung cấp, phiếu kho'),
'loyalty':('KHACH_HANG','Điểm khách hàng hiện tại'),
'order':('ADMIN, QL_BAN_HANG; KHACH_HANG chỉ `/mine*`, tạo đơn, hủy đơn của mình','Đơn, thanh toán và khách chọn tại quầy'),
'product':('GET công khai; ghi: ADMIN, QL_KHO','Catalog, danh mục và biến thể'),
'promotion':('ADMIN, QL_BAN_HANG, QL_KHACH_HANG; KHACH_HANG chỉ wallet/validate','Khuyến mãi và phân bổ voucher'),
'report':('ADMIN, QL_KHACH_HANG, QL_NHAN_SU, QL_KHO, QL_BAN_HANG','Báo cáo tổng hợp'),
'settings':('ADMIN','Seed, scraper, cấu hình và backup/restore có cờ bảo vệ'),
'survey':('ADMIN, QL_KHACH_HANG; KHACH_HANG chỉ mine, xem survey, respond','Tạo/gửi khảo sát, trả lời, xem thống kê'),
}
for f in sorted((root/'store-admin/server/src/routes').glob('*.js')):
 for i,line in enumerate(f.read_text(encoding='utf-8').splitlines(),1):
  m=re.search(r"(?:router|\w+Router)\.(get|post|put|patch|delete)\(\s*(['\"])(.*?)\2",line)
  if not m: continue
  method,path=m.group(1).upper(),m.group(3)
  mod=f.stem
  if mod=='demo-payment': full=path
  else: full='/api/'+({'auth':'auth','account':'accounts','employee':'employees','customer':'customers','product':'products','inventory':'inventory','order':'orders','promotion':'promotions','feedback':'feedbacks','survey':'surveys','report':'reports','settings':'settings','chat':'chat','loyalty':'loyalty'}[mod])+('' if path=='/' else path)
  role,purpose=routes[mod]
  lines.append(f'| {method} | `{full}` | {role} | {purpose}; khai báo dòng {i} trong `{f.relative_to(root).as_posix()}` |')
lines += [
'| GET | `/api/health` | Công khai | Health API (trả cờ database browser) |',
'| POST | `/api/events/user` | JWT hợp lệ | Ghi event người dùng vào outbox; giới hạn request theo IP |',
'| POST | `/api/events/transaction` | JWT hợp lệ | Ghi transaction event vào outbox; giới hạn request theo IP |',
'| GET | `/api/events/outbox-status` | Hiện không gắn `requireAuth` trong index | Trạng thái số event chờ |',
'| GET | `/api/events/status` | Hiện không gắn `requireAuth` trong index | Trạng thái kết nối Kafka |',
'| GET | `/api/database/tables` | Chỉ khi `ENABLE_DATABASE_BROWSER=true` và socket loopback | Liệt kê bảng/đếm cột |',
'| GET | `/api/database/tables/:tableName/rows` | Cùng điều kiện database browser | Đọc tối đa 100 dòng/trang từ bảng `public` |',
'| GET, POST | `/pay/demo/:token` và `/pay/demo/:token/confirm` | Công khai khi `DEMO_PAYMENT=true`; token ngẫu nhiên, giới hạn tốc độ | Trang xác nhận demo; token không chứa mã đơn; POST cập nhật thanh toán/idempotent |',
'',
'### Các tham số lọc/tìm kiếm đã xác nhận trong handler',
'',
'- Sản phẩm `GET /api/products`: `search`, `category_id`, `brand_id`, `supplier_id`, `min_price`, `max_price`, `page`, `limit`, `sort` (`created_at`, `name`, `price`, `category`), `order` (`asc`, `desc`).',
'- Nhà cung cấp `GET /api/inventory/suppliers`: `search`, `contact_filter` (`all`, `has_email`, `no_email`, `has_phone`, `no_phone`), `sort` (`name`, `contact`, `created`), `order`, `page`, `limit`.',
'- Khách hàng `GET /api/customers`: `search`, `tier`, `gender`, `page`, `limit`.',
'- Tồn kho `GET /api/inventory`: `search`, `category_id`, `low_stock`, `page`, `limit`; phiếu kho có `type`, `from`, `to`, `page`, `limit`.',
'- Đơn hàng `GET /api/orders`: `status`, `channel`, `customer_id`, `from`, `to`, `page`, `limit`.',
'- Khuyến mãi `GET /api/promotions`: `active`, `promo_type`, `page`, `limit`; `active=true/false` có lọc theo cờ và ngày hiện tại trong handler hiện tại.',
'',
'## 3. Cơ sở dữ liệu từ SQL trong repository', '',
'Nguồn duy nhất: `server/sql/schema.sql` và migrations `001`–`015`; không dùng database đang chạy. Bản hợp nhất để nộp nằm ở `database/schema.sql`. Schema baseline có 35 bảng; migration bổ sung các bảng CRM, chat, loyalty và demo payment. Danh sách cột/types/constraints/FK dưới đây là snapshot DDL rút từ đúng các file này. Indexes được liệt kê theo bảng.', '']
for name,t in tables.items():
 cols='; '.join(f'`{c}` {typ}' for c,typ in t['columns'])
 constraints='; '.join(t['constraints']) or 'PK/FK thể hiện trực tiếp tại khai báo cột'
 idx='; '.join(indexes.get(name,[])) or 'Không thấy CREATE INDEX riêng trong nguồn SQL đã rà'
 lines += [f'### `{name}`', '', f'- Cột: {cols}.', f'- Ràng buộc/khóa: {constraints}.', f'- Index: {idx}.', '']
lines += [
'### Quan hệ nghiệp vụ chính', '',
'- `account` gắn một-một tùy chọn với `employee` hoặc `customer`; `role` và `permission` liên kết nhiều-nhiều qua `role_permission`.',
'- `product` thuộc `category`, có thể gắn `brand`/`supplier`; `product_variant` kết hợp `size` và `color`; `product_image` lưu nhiều ảnh.',
'- `import_receipt` có `import_detail`; đơn `order` có `order_detail` và `payment`; item tham chiếu `product_variant`; order có thể liên kết customer, employee, promotion.',
'- CRM: `customer_interest` (và bảng map cũ `customer_interest_map` do migration 004), `feedback`/`feedback_attachment`, survey/question/option/invitation/response/answer, loyalty point transactions.',
'- Chat: `customer`–`conversation`–`chat_message`–`chat_message_attachment`; lưu metadata tệp, file nằm trên filesystem uploads.',
'- Event: `outbox_events` → Kafka; consumer ghi cấu trúc vào `user_events`/`transactions`, idempotency theo `event_id`; demo QR dùng `demo_payment_tokens` gắn order và lưu hash token.',
'',
'## 4. Sự kiện, thanh toán, vận hành', '',
'- Topic Kafka trong code: `user-events`, `transaction-events`; consumer group: `store-admin-group`. Producer outbox dùng `FOR UPDATE SKIP LOCKED`, relay có retry/backoff và dọn event đã publish sau 7 ngày. Delivery có thể lặp; consumer dùng `ON CONFLICT (event_id) DO NOTHING`.',
'- `POST /api/events/transaction` yêu cầu `eventId`; `enqueueEvent` ghi outbox. Consumer chuẩn hóa payload thành cột trong `transactions`. Payment demo ghi `payment_completed` trong transaction cập nhật thanh toán theo code hiện có; cần xác minh môi trường Kafka riêng trước khi demo.',
'- Demo QR tạo token dùng một lần, hash lưu trong `demo_payment_tokens`, hết hạn 15 phút. Trang HTML công khai POST confirm; không tích hợp ngân hàng, không nhận tiền thật.',
'- Backup/restore app nằm trong `server/src/routes/settings.js`, router chỉ cho ADMIN. Restore phụ thuộc `ENABLE_DATABASE_RESTORE`; database browser phụ thuộc `ENABLE_DATABASE_BROWSER` và chỉ nhận loopback. Không bật hai cờ này trong môi trường dùng chung.',
'- Migration runner `server/src/migrations.js`: lúc khởi động API; advisory lock; baseline `000`; chạy file migration theo tên phiên bản trong transaction. Seed `npm run seed` kiểm tra DB local trừ khi cờ riêng được bật trong môi trường chạy seed; script phụ thuộc catalog JSON đã chuẩn hóa.',
'',
'## 5. Seed accounts (username và role; không ghi mật khẩu)', '',
'Nguồn: `store-admin/scripts/seed.mjs`. Tài khoản demo được tạo/cập nhật bởi script seed. Không suy ra mật khẩu trong tài liệu.', '',
'| Username | Vai trò |', '|---|---|',
'| `admin`, `admin2` | ADMIN |', '| `qlnhansu` | QL_NHAN_SU |', '| `qlkho` | QL_KHO |', '| `qlbanhang` | QL_BAN_HANG |', '| `qlkhachhang` | QL_KHACH_HANG |', '| `khach1`, `khach2`, `khach3` | KHACH_HANG |', '| `demo_khach_khoa` | KHACH_HANG (Blocked) |', '',
'## 6. Kiểm kê giao diện theo role', '',
'`client/src/App.jsx` định tuyến nhân viên theo `#/admin/*`, `#/crm/*`, `#/nhansu/*`, `#/kho/*`, `#/banhang/*`; nội dung là view chung nhưng role navigation tách riêng. Người mua dùng `CustomerPortal.jsx` với `#/khach-hang/*`. Do đó hệ thống có dashboard/điều hướng riêng theo nhóm quyền, không phải các frontend build độc lập.', '',
'| Module/màn hình | ADMIN | QL_NHAN_SU | QL_KHO | QL_BAN_HANG | QL_KHACH_HANG | KHACH_HANG |', '|---|---|---|---|---|---|---|',
'| Tổng quan, báo cáo | Có | Có | Có | Có | Có | Không (portal riêng) |',
'| Tài khoản | Có | — | — | — | — | — |',
'| Nhân viên | Có | Có | — | — | — | — |',
'| Sản phẩm | Có | — | Có | — | — | xem catalog |',
'| Tồn kho/nhà cung cấp/phiếu kho | Có | — | Có | — | — | — |',
'| Đơn hàng | Có | — | — | Có | — | đơn của mình/đặt/hủy |',
'| Khuyến mãi | Có | — | — | Có | CRM phân bổ | voucher của mình |',
'| Khách hàng, phản hồi, khảo sát, chat | Có | — | — | — | Có | hồ sơ, gửi feedback, khảo sát, chat |',
'| Cài đặt, nhật ký | Có | — | — | — | — | — |', '',
'## 7. Đối chiếu rubric và phạm vi đồ án', '',
'| Rubric | Hiện trạng theo code | Đánh giá tài liệu |', '|---|---|---|',
'| I.1 Giới thiệu doanh nghiệp (5đ) | Dữ liệu/seed cho cửa hàng thời trang; không có bằng chứng pháp nhân, quy mô hoặc tổ chức thật | Một phần; cần xác nhận |',
'| I.2 Khảo sát HTTT (5đ) | Không thấy kết quả khảo sát thực tế trong repository | Chưa có; chỉ chuẩn bị câu hỏi/mẫu |',
'| I.3 Phân tích (10đ) | Module/route/DB đủ căn cứ để mô tả sơ đồ | Có thể mô hình hóa; cần đối chiếu nghiệp vụ người dùng |',
'| I.4 Thiết kế CSDL (5đ) | SQL schema/migrations hiện hữu | Có |',
'| I.4 Thiết kế giao diện (5đ) | React views và role navigation hiện hữu | Có; ảnh chụp phải bổ sung |',
'| I.5 Cài đặt, bảo trì, hướng dẫn (5đ) | Docker Compose, migration, Kafka relay, user guide có thể lập; vận hành Aiven phụ thuộc cấu hình triển khai | Một phần; runbook vận hành phải xác nhận |',
'| I.6 Tổng kết (5đ) | Đánh giá được theo chức năng đã code | Có, kèm hạn chế |',
'| II.1 CSDL: bảng (10đ) | Schema + migrations | Có theo DDL; seed không phủ mọi bảng |',
'| II.1 Backup/restore (5đ) | Scripts/routes và hướng dẫn dùng pg_dump/pg_restore | Một phần; cần lịch/owner và restore drill thực tế |',
'| II.2 Admin UI (20đ) | Account roles, product/inventory/suppliers filters, admin views; HR/kho/sales/CRM menus theo role | Một phần; yêu cầu sắp xếp/lọc supplier/product phụ thuộc kiểm tra từng view |',
'| III.4 CRM (30đ, lựa chọn) | Khách, account lock, feedback, báo cáo tuổi/sở thích, survey/invitations/results, customer self-service, chat | Một phần đến có; chi tiết feature matrix trong Chương 4, một số hạn chế ghi rõ |',
'| III.3 HRM / III.5 MRP | Không thấy leave/payroll/attendance; MRP công thức sản xuất không có | Chưa có; không chọn làm phần III |', '',
'## 8. Giả định cần xác nhận', '',
'Catalog/seed mô tả sản phẩm quần áo và phụ kiện cùng hoạt động bán lẻ, vì vậy báo cáo tạm giả định “Hung Fashion” là cửa hàng/doanh nghiệp bán lẻ thời trang đa kênh. Đây là suy luận từ dữ liệu repository, không phải thông tin pháp lý hay khảo sát doanh nghiệp.', '',
'## 9. Những điểm thiếu/không thể suy ra từ source', '',
'- Không có bằng chứng khảo sát thật, thông tin pháp nhân, số lượng nhân sự thực, nhóm sinh viên/giảng viên và kết quả kiểm thử chấp nhận người dùng.',
'- Seed JS không thể chuyển nguyên trạng thành SQL độc lập vì tạo hash tài khoản, gọi scraper/normalize và dùng tệp `data/clean/products.json`; script cũng không phủ mọi bảng (ví dụ event, chat, payment demo token phụ thuộc thao tác). Xem `TODO-can-bo-sung.md`.',
'- PDF học phần trong repo là phiếu đánh giá, cỡ giấy Letter; không tìm thấy mẫu định dạng báo cáo A4. Báo cáo dùng thông số trình bày do yêu cầu người dùng đưa ra.',
]
(out/'00-inventory.md').write_text('\n'.join(lines), encoding='utf-8')

# Generate full column dictionary LaTeX appendix from inspected DDL.
def tex_escape(s):
    return latex(s)
parts_tex = [r'\chapter{Từ điển dữ liệu chi tiết}', r'Các kiểu và ràng buộc được trích từ mã SQL repository và migrations 001--015. Ý nghĩa cột mô tả theo tên và vai trò trong truy vấn ứng dụng; khóa ngoại được ghi trong mô tả kiểu/ràng buộc. Đây là lược đồ thiết kế, không phải kết quả truy vấn database.', r'\small']
for name,t in tables.items():
    parts_tex += [r'\section{Bảng '+tex_escape(name)+r'}', r'\begin{longtable}{|p{0.18\textwidth}|p{0.45\textwidth}|p{0.24\textwidth}|}\hline', r'\textbf{Thuộc tính}&\textbf{Kiểu và ràng buộc}&\textbf{Ý nghĩa}\\\hline\endhead']
    for col,typ in t['columns']:
        parts_tex.append(tex_escape(col)+' & '+tex_escape(typ)+' & '+tex_escape(meaning(col))+r'\\\hline')
    for con in t['constraints']:
        parts_tex.append(r'\multicolumn{3}{|p{0.93\textwidth}|}{Ràng buộc: '+tex_escape(con)+r'}\\\hline')
    idx=indexes.get(name,[])
    if idx: parts_tex.append(r'\multicolumn{3}{|p{0.93\textwidth}|}{Index: '+tex_escape('; '.join(idx))+r'}\\\hline')
    parts_tex.append(r'\end{longtable}')
    parts_tex.append(r'\normalsize')
(out/'04-tu-dien-du-lieu.tex').write_text('\n'.join(parts_tex),encoding='utf-8')
