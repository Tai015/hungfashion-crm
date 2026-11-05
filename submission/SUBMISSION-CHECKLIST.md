# Checklist đóng gói nộp bài

## Báo cáo
- [ ] Thay toàn bộ `[CẦN BỔ SUNG: ...]` bằng dữ liệu đã được nhóm/cán bộ xác minh.
- [ ] Xác nhận tên pháp lý và thông tin doanh nghiệp; phân biệt dữ kiện thật với suy luận từ seed.
- [ ] Điền kế hoạch 15 tuần, thành viên/MSSV, phân công, phần trăm đóng góp, tự đánh giá và chữ ký.
- [ ] Thu thập và tổng hợp khảo sát thật; lưu bằng chứng/mẫu theo quy định môn học.
- [ ] Render 5 sơ đồ Mermaid sang PDF/SVG có thể nhúng và rà soát tên thực thể/luồng.
- [ ] Chụp ảnh giao diện thật cho các vị trí 4.1–4.11, 5.1–5.2; che dữ liệu cá nhân/định danh hạ tầng.
- [ ] Ghi test, build, benchmark và restore drill chỉ sau khi chạy thật; kèm ngày, môi trường, người thực hiện, kết quả.
- [ ] Biên dịch `docs/report/main.tex` bằng XeLaTeX hai lượt; kiểm tra mục lục, danh sách hình/bảng, chú thích, số trang, lề, bảng bị tràn và mọi link.
- [ ] Đọc PDF từ đầu đến cuối; bỏ TODO, ô placeholder, nguồn Mermaid chưa render và nội dung suy luận chưa xác nhận khỏi bản nộp cuối.

## Source và dữ liệu
- [ ] Chỉ đưa mã nguồn/tài liệu cần thiết theo yêu cầu học phần; kiểm tra giấy phép thư viện và thông tin trích dẫn.
- [ ] Loại khỏi archive: `node_modules`, `.git`, mọi `.env`, `certs`, private keys, token, dump/backup database, log có PII, file tải lên thật và dữ liệu khách thật.
- [ ] Không đưa mật khẩu/hashes tài khoản demo vào README, báo cáo, ảnh hoặc archive.
- [ ] Kiểm tra `git status` và rà soát nội dung archive sau khi tạo.

## Tạo ZIP trên Windows (PowerShell)
Từ thư mục gốc repository, nếu máy có 7-Zip, tạo archive từ danh sách file được Git theo dõi để tránh đưa file môi trường/backup chưa được kiểm soát. Lệnh này chỉ đóng gói các file đã được Git track; hãy commit/stage các tài liệu cần nộp trước khi chạy và kiểm tra ZIP sau đó:

```powershell
git archive --format=zip --output=HungFashionCRM-source.zip HEAD
```

`git archive HEAD` chỉ lấy nội dung đã commit; hãy commit các file cần nộp trước. Trước khi tạo ZIP, kiểm tra các file đang được Git theo dõi để chắc rằng không có cấu hình bí mật hoặc dữ liệu nhạy cảm. Mở ZIP và xác nhận không có `.env`, `certs`, `node_modules`, backup hoặc PII.
