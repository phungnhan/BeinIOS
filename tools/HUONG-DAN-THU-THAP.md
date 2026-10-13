# Thu thập báo cáo sử dụng từ các admin (dành cho tác giả)

Addon có thể tự gửi **báo cáo sử dụng ẩn danh** mỗi tuần về một Google Sheet của bạn — chỉ khi admin bấm **Đồng ý** (hỏi một lần, tắt được bất cứ lúc nào ở Nhật ký → Báo cáo sử dụng). Báo cáo gồm: phiên bản, trình duyệt, số ngày có dùng, số community / group (không tên), cài đặt đang bật, tính năng dùng bao nhiêu lần, số thao tác, lỗi kỹ thuật (đường dẫn đã bỏ id), kết quả tự kiểm tra, một mã cài đặt ngẫu nhiên và ghi chú admin tự điền. Không có tên group, tên thành viên, nội dung bài, mật khẩu hay token.

## 1. Tạo nơi nhận (làm một lần, khoảng 5 phút)

1. Vào [sheets.new](https://sheets.new) bằng tài khoản Google của bạn, đặt tên bảng, ví dụ **BeinGroup — báo cáo sử dụng**.
2. Menu **Tiện ích mở rộng → Apps Script**. Xoá mã mẫu, dán toàn bộ nội dung tệp `tools/usage-collector.gs`, bấm **Lưu**.
3. Bấm **Triển khai → Tùy chọn triển khai mới** (Deploy → New deployment) → biểu tượng bánh răng → **Ứng dụng web** (Web app):
   - **Thực thi dưới tên**: Tôi (Me)
   - **Người có quyền truy cập**: Bất kỳ ai (Anyone)
4. Bấm **Triển khai**, cấp quyền khi Google hỏi (chọn tài khoản → Nâng cao → Đi tới dự án → Cho phép). Script chỉ ghi vào chính bảng tính này.
5. Chép **URL ứng dụng web** dạng `https://script.google.com/macros/s/…/exec`.
6. Thử: mở URL đó trên trình duyệt, thấy dòng *"BeinGroup: nơi nhận báo cáo sử dụng đang chạy."* là được.

## 2. Gắn vào gói addon

- Lưu URL vào tệp `tools/usage-url.txt` (một dòng), rồi chạy `node tools/pack.mjs`; hoặc chạy `node tools/pack.mjs --usage-url <URL>`.
- Công cụ báo *"Báo cáo sử dụng: gửi về …"* là gói đã có nơi nhận. Mã nguồn không đổi (link chỉ gắn vào bản trong tệp `.zip`).
- Gửi tệp `.zip` cho các admin như thường. Lần đầu mở Dashboard (hoặc ở bước 3 của Bắt đầu nhanh), addon hỏi họ có đồng ý gửi không, kèm xem trước đúng nội dung sẽ gửi.
- Muốn thử trên máy mình mà không đóng gói lại: mở trang Dashboard → F12 → Console, chạy `chrome.storage.local.set({ usageEndpoint: '<URL>' })` rồi tải lại trang.

## 3. Xem số liệu

- Mỗi báo cáo là một dòng ở trang **Báo cáo** (tự tạo ở lần nhận đầu tiên): nhận lúc, mã cài đặt, phiên bản, trình duyệt, dùng từ ngày, số ngày có dùng, số community / group, đang bật, tính năng dùng, thao tác (tổng / tự động / Telegram / bấm tay / lỗi), lỗi kỹ thuật, tự kiểm tra, ghi chú.
- Cùng **mã cài đặt** = cùng một máy. Lọc theo phiên bản để biết lỗi của bản nào; cột *Mục tự kiểm tra lỗi* cho biết API nào của Beincom đang hỏng ở máy người dùng.
- Mỗi máy gửi tối đa một lần mỗi 6 giờ (script tự bỏ lần gửi dồn); addon gửi 7 ngày một lần, lỗi thì thử lại sau 1 ngày.

## 4. Sửa script sau này

Sửa mã trong Apps Script, rồi **Triển khai → Quản lý các bản triển khai → ✏ Chỉnh sửa → Phiên bản: Mới → Triển khai**. Làm như vậy URL giữ nguyên, không cần gửi lại gói addon. (Nếu tạo *triển khai mới* thì sẽ ra URL khác.)

## Lưu ý

- URL nằm trong tệp addon nên ai có gói cũng thấy được; script chỉ nhận đúng dạng báo cáo của BeinGroup, giới hạn độ dài, chặn công thức trong ô, nên kẻ xấu cùng lắm chỉ thêm được dòng rác — xoá đi là xong.
- Nếu muốn dừng thu thập: trong Apps Script **Quản lý các bản triển khai → Lưu trữ** (archive). Addon gửi không được sẽ chỉ ghi lỗi ở máy người dùng, không làm phiền họ.
