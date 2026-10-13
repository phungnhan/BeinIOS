# Có gì mới ở BeinGroup

Mỗi bản một mục, bản mới nhất ở trên. Dashboard tự hiện các mục mới sau khi cập nhật (bấm "Có gì mới" ở cuối trang để xem lại).

## v0.30.0 — 13/10/2026
- **Đội admin** trong Báo cáo tháng: mỗi admin đã duyệt vào, từ chối, xoá, cấm, gỡ cấm, gán / gỡ admin, đổi cài đặt bao nhiêu lần trong tháng — lấy từ nhật ký hoạt động của Beincom nên tính **cả việc làm thẳng trên web**, ở mọi group bạn quản trị trong community. Kèm danh sách ai đổi cài đặt / quyền admin gì, lúc nào. Có trong bản chữ để sao chép / gửi Telegram.
- **Chống đầy bộ nhớ**: addon xin quyền lưu trữ không giới hạn (không hỏi thêm khi cài) — community đông, lịch sử dài cũng không bị mất dữ liệu vì đầy 10 MB. Tự kiểm tra có mục **Bộ nhớ của addon** (dung lượng, phần lớn nhất); phần Sao lưu ghi dung lượng đang dùng.
- Tự kiểm tra có thêm mục **Nhật ký việc của admin**.

## v0.29.0 — 13/10/2026
- **Dọn tài khoản triệt để**: hộp dọn tự tìm thêm **mọi bài cũ còn hiện** của người đó trong community (không chỉ bài addon đã quét); từng bài / bình luận có ô tick để bỏ những mục không muốn ẩn. Nút 🧹 Dọn có cả ở Hồ sơ vi phạm dù người đó không còn bài gần đây.
- **Tìm & dọn bài** (Bài viết): tìm trong mọi bài còn hiện của community theo từ khoá hoặc link (vd `t.me/`, tên miền lừa đảo), 7 / 30 / 90 ngày hoặc mọi lúc; tick từng bài rồi ẩn. Không bài nào được chọn sẵn; bài của bạn, của admin và thành viên tin cậy được đánh dấu giữ. Có nút dọn nhanh người đăng nhiều bài khớp nhất.
- Lưu ý: **bài đã ẩn không hiện lại được** — Beincom không có lệnh hiện lại (kể cả trên web), nên mọi chỗ ẩn hàng loạt đều cho xem trước và chọn từng mục; Chạy thử vẫn chặn mọi thao tác.
- **Bộ quy tắc mẫu chống lừa đảo** (Quy tắc & cài đặt): từ khoá vi phạm, từ khoá cần xem, phát hiện liên hệ riêng; link rút gọn là tuỳ chọn. Xem trước, sửa danh sách, thấy ngay bao nhiêu bài / bình luận gần đây đổi đánh giá rồi mới thêm.
- Quy tắc bài viết mới: **Từ khoá cần xem** và **Có liên hệ riêng** (số điện thoại, link Zalo / Telegram / WhatsApp) — đánh dấu Cần xem, không tự ẩn.
- **Xuất / Nhập quy tắc**: tải tệp chỉ có quy tắc (chung và riêng từng group) để gửi admin khác dùng.
- **Nhắc việc chờ lâu** (mặc định bật, 24 giờ): yêu cầu tham gia và bài chờ duyệt chờ quá số giờ chọn được thì thông báo (và Telegram), mỗi việc một lần; Việc cần làm có nhãn ⏳ và bộ lọc **Chờ lâu**.

## v0.28.0 — 11/10/2026
- **Việc đầu tuần gộp lại**: sáng thứ Hai (và đầu tháng) có nhiều việc cùng lúc thì chỉ một thông báo và một tin Telegram; ô **Việc đầu tuần** ở Tổng quan liệt kê từng việc với nút mở thẳng, đánh dấu việc đã làm.
- **Gọn Dashboard**: tab có từ 4 thẻ có **mục lục nhanh** ở đầu (bấm là tới thẻ); mỗi thẻ có nút **thu gọn** (nhớ trên máy này), **Thu gọn / Mở tất cả**.
- **Sao lưu kèm lịch sử số liệu** (tuỳ chọn): hiệu quả bài, các lần nhắc người mới, số thành viên theo ngày, nhật ký thao tác — khôi phục thì gộp với dữ liệu đang có, đổi máy không mất số liệu.
- **Báo cáo sử dụng** (Nhật ký): addon tự đếm tính năng nào được dùng, cài đặt đang bật, lỗi, kết quả tự kiểm tra — ẩn danh (không tên group, thành viên, nội dung). Sao chép / Gửi về Telegram để gửi tác giả, hoặc — nếu bạn **đồng ý** (hỏi một lần, xem trước đúng nội dung) — addon tự gửi mỗi tuần về bảng tính của tác giả. Tắt bất cứ lúc nào.

## v0.27.0 — 11/10/2026
- **Tự kiểm tra mỗi ngày** (mặc định bật, chỉ đọc): lần quét tự động đầu tiên mỗi ngày kiểm tra mọi community bạn quản trị và chỉ báo (kèm Telegram) khi một tính năng hôm trước còn chạy mà nay bị lỗi — thường do Beincom vừa thay đổi.
- **Bài thảo luận hằng tuần** (Đăng bài): kho 20 câu hỏi mồi (sửa / thêm được, có trong bản sao lưu), xoay vòng không lặp lại ở một group trong 8 tuần, soạn vào ô Đăng bài kèm giờ gợi ý theo hiệu quả bài của bạn. Sáng thứ Hai có thể soạn sẵn và báo (mặc định tắt) — addon không tự đăng. Bảng **Hiệu quả từng câu** cho biết câu nào kéo được tương tác.
- **Bắt đầu nhanh**: người mới cài được hướng dẫn 3 bước — kết nối Beincom, tự kiểm tra, chọn tính năng (Chạy thử bật sẵn). Mở lại ở cuối Dashboard.

## v0.26.0 — 11/10/2026
- **Tự kiểm tra** (Nhật ký): bấm một nút, addon gọi thử (chỉ đọc) các API mà từng tính năng dùng với community / group đã chọn và báo mục nào dùng được, mục nào bỏ qua vì không có quyền, mục nào lỗi. **Sao chép kết quả** hoặc **Gửi về Telegram** để gửi người hỗ trợ.
- **Nhắc người mới hằng tuần** (Thống kê → Thành viên mới có ở lại không, mặc định tắt): sáng thứ Hai addon soạn sẵn bài nhắc những người mới còn ở lại nhưng chưa đăng bài / bình luận và báo cho bạn; bạn tự mở, sửa rồi đăng hoặc hẹn giờ. Mỗi người được nhắc tối đa một lần trong 30 ngày.
- **Hiệu quả các lần nhắc**: addon ghi lại ai được nhắc trong bài đã đăng, bấm **Đo hiệu quả** để xem bao nhiêu người bắt đầu đăng bài / bình luận sau khi được nhắc, bao nhiêu người đã rời. Danh sách người mới có dấu "Đã nhắc".

## v0.25.0 — 11/10/2026
- **Có gì mới**: sau khi cập nhật, Dashboard tự hiện những thay đổi của các bản mới; xem lại bất cứ lúc nào ở cuối trang.
- **Đóng gói để chia sẻ**: tệp `.zip` kèm hướng dẫn cài / cập nhật bằng tiếng Việt cho các admin khác.
- Sắp xếp lại mã bên trong cho gọn (không đổi cách dùng).

## v0.24.0 — 11/10/2026
- **Báo cáo tháng** (Thống kê): thành viên đầu → cuối tháng, số vào / rời, người mới còn ở lại bao nhiêu, bài viết và tương tác so với tháng trước, bài nổi bật, người đăng tích cực, việc kiểm duyệt. Sao chép, tải tệp hoặc gửi về Telegram. Đầu tháng có thông báo nhắc.
- **Thành viên mới có ở lại không?** (Thống kê): người vào trong 30 / 60 / 90 ngày còn ở lại bao nhiêu, rời sau bao lâu, ai đã đăng bài / bình luận; danh sách người chưa thấy hoạt động và nút soạn bài nhắc họ.
- Sửa: bấm thông báo "việc đầu tuần" giờ mở thẳng công cụ chào thành viên mới.

## v0.23.0 — 11/10/2026
- **Lỗi kỹ thuật** (Nhật ký): addon tự ghi lỗi khi chạy và lỗi Beincom trả về; bấm **Sao chép báo cáo** để gửi người hỗ trợ (không chứa mật khẩu, token hay nội dung bài).
- Lệnh nào hỏng giữa chừng thì Dashboard báo ngay thay vì chờ mãi.
- Sửa: tab Thống kê không còn tràn ngang trên điện thoại.

## v0.22.0 — 11/10/2026
- **Dọn tài khoản**: ẩn một lần mọi bài / bình luận gần đây của một tài khoản spam, tuỳ chọn cấm ở mọi community; có cả nút trong tin Telegram.
- **Lọc** bài mới đăng và bình luận theo @tên, #tag hoặc chữ (không cần dấu).
- **Hiệu quả bài đã đăng qua addon** (Thống kê): lượt xem, cảm xúc, bình luận sau 24 giờ và 7 ngày; giờ đăng hiệu quả theo chính bài của bạn.

## v0.21.0 — 11/10/2026
- **Quản lý tag** (Bài viết): xem tag của community, số bài đang dùng, tạo / đổi tên / xoá tag chưa dùng, mở danh sách bài theo tag.

## v0.20.0 — 10/10/2026
- **Tự duyệt bài của thành viên tin cậy** (mặc định tắt): người trong danh sách hoặc đã được duyệt đủ số bài; nút ⭐ thêm nhanh.
- **Sửa bài đã hẹn giờ** ngay trong addon.
- **Trình soạn thảo Article**: thanh công cụ, xem trước song song, chèn ảnh, bảng, nhắc tên.

## v0.19.0 — 10/10/2026
- **Nút xử lý trong tin Telegram** (mặc định tắt): Duyệt / Từ chối / Ẩn / Bỏ qua ngay trong tin nhắn.

## v0.18.0 — 10/10/2026
- **Lịch nội dung** tuần / tháng và **nhập nhiều bài từ tệp CSV**.
- **Article & Series**: viết, đăng ngay hoặc hẹn giờ, chọn chuyên mục, ảnh bìa.
- Dashboard nhanh hơn: chỉ vẽ tab đang mở.

## v0.17.0 — 09/10/2026
- **Giờ đăng tốt nhất** (Thống kê): bảng nhiệt theo thứ và giờ; nút chọn nhanh giờ đăng khi hẹn giờ.

## v0.16.0 — 09/10/2026
- **Gửi thông báo về Telegram** qua bot của chính bạn (chọn loại tin, tắt về đêm). Token chỉ lưu trong máy.

## v0.15.0 — 09/10/2026
- **Vinh danh thành viên tích cực**, **theo dõi từ khoá**, **nhắc bài chưa ai trả lời**.
- **Đồng bộ cài đặt** giữa các máy dùng chung tài khoản trình duyệt (mặc định tắt).

## v0.14.0 — 09/10/2026
- **Việc cần làm** đầu tab Tổng quan: gom mọi việc cần xử lý, việc gấp lên trước.

## v0.13.0 — 09/10/2026
- **Trả lời bình luận** ngay trong addon; lọc bài chưa ai trả lời.
- **Chào thành viên mới**: tìm người mới vào và soạn sẵn bài chào có @tên.

## v0.12.0 — 09/10/2026
- **Chống spam**: tự ẩn bài / bình luận mới có link tới tên miền cấm (mặc định tắt), phát hiện đợt spam, cấm ở mọi community.

## v0.11.0 — 09/10/2026
- **Quét bình luận** theo quy tắc, **tóm tắt tuần**, **đăng dưới tên group**.

## v0.10.0 — 09/10/2026
- **Quy tắc riêng cho từng group**, **bài đăng định kỳ**, **sao lưu & khôi phục cài đặt**.

## v0.9.0 — 09/10/2026
- **Ghim bài, cài đặt bài, sửa bài đã đăng**; **bật / tắt cài đặt nhiều group một lần**; danh sách **bị cấm** và gỡ cấm.

## v0.8.0 — 08/10/2026
- **Hồ sơ vi phạm** của từng thành viên; quét nhanh hơn khoảng 4 lần.

## v0.7.0 — 08/10/2026
- Nâng cấp **Đăng bài**: ảnh / video / tệp, nhắc tên @, xem trước link, tag và series, danh sách bài hẹn giờ đầy đủ.

## v0.6.0 — 08/10/2026
- Tab **Báo cáo**: báo cáo của người dùng, bài Beincom tự gắn cờ; quét định kỳ báo cáo mới.

## v0.5.0 — 08/10/2026
- **Dashboard** chia tab, **Thống kê** thành viên và bài viết, trình soạn thảo bài có xem trước.

## v0.1.0 – v0.4.0 — 07/10/2026
- Duyệt / từ chối thành viên theo quy tắc, kiểm duyệt bài, quản lý thành viên, đăng và hẹn giờ bài.
