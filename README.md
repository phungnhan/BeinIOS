# BeinGroup — Quản lý Group Beincom (Chrome/Edge, MV3)

Gom **yêu cầu tham gia**, **bài chờ duyệt**, **bài mới vi phạm** và **danh sách thành viên** của mọi Group/Community bạn quản trị trên https://group.beincom.com vào một Dashboard. Addon chấm từng mục theo quy tắc của bạn, rồi cho duyệt, từ chối, ẩn bài, xoá / gán admin / cấm thành viên hàng loạt, và xử lý **báo cáo vi phạm**. Addon còn soạn và đăng bài, hẹn giờ đăng vào nhiều group cùng lúc, và thống kê thành viên, bài viết theo ngày. Dữ liệu chỉ lưu trong trình duyệt của bạn.

Tác giả: **Kai | Crypto Life**

## Cài đặt
1. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
2. Bấm **Load unpacked** → chọn thư mục `D:\CryptoLife\BeinGroup`. Khi cập nhật bản mới thì bấm ↻ (Reload) ở thẻ addon.
3. Đăng nhập Beincom trên chính trình duyệt đó bằng tài khoản admin group.
4. Addon mặc định bật **Chạy thử**: bấm Duyệt / Từ chối / Ẩn bài chỉ ghi nhật ký, chưa gửi lên Beincom. Thử quy tắc cho ổn rồi tắt Chạy thử ở Dashboard → Cài đặt.

## Chức năng (theo tab của Dashboard)
Dashboard chia thành các tab. Số trên tab là việc đang chờ. Địa chỉ trang nhớ tab đang mở (`#tab=…`).

Nút **↻ Tải lại** bên phải thanh tab chỉ tải dữ liệu của tab đang xem, nhanh hơn **Quét ngay** (quét toàn bộ). Tải lại không gửi thông báo và không tự xử lý yêu cầu tham gia.

| Tab | Tải lại gì |
|---|---|
| Tổng quan | Thông tin group, yêu cầu tham gia, số bài chờ duyệt (không đọc bài viết) |
| Thành viên | Như Tổng quan, cộng danh sách thành viên hoặc nhật ký vào/rời đang xem |
| Bài viết | Hàng chờ duyệt bài và bài mới đăng (không đọc yêu cầu tham gia) |
| Báo cáo | Mục đang xem (người dùng báo cáo / gắn cờ tự động / đã ẩn) của group đang chọn, rồi cập nhật số đếm trên tab và icon |
| Đăng bài | Bài đã hẹn giờ |
| Thống kê | Tính lại số liệu |

Tab Quy tắc & cài đặt và Nhật ký chỉ dùng dữ liệu trong máy nên không có nút.

- **Tổng quan**
  - Các ô số liệu: group đang quản trị, yêu cầu tham gia, bài chờ duyệt, bài mới vi phạm, báo cáo vi phạm, lần quét gần nhất. Bấm ô để mở tab tương ứng.
  - Bảng **Group bạn quản trị**: số thành viên, đang bật hay tắt duyệt thành viên và duyệt bài, số việc đang chờ (cột **Báo cáo** = báo cáo chờ xử lý + bài bị gắn cờ), link mở thẳng trang Beincom.
  - Group con nằm ngay dưới group gốc cùng community, thụt lề theo cấp. Bấm một dòng để mở tab Thành viên của group đó.
- **Thành viên**
  - **Duyệt thành viên**: mỗi yêu cầu có ảnh, tên, huy hiệu, câu trả lời câu hỏi gia nhập và đánh giá theo quy tắc. Duyệt hoặc từ chối từng người hay hàng loạt.
  - **Danh sách**: tìm theo tên hoặc username; group gốc sắp xếp được theo mới vào trước hoặc admin trước. Ngày vào và số group đã vào chỉ có ở group gốc.
  - Thao tác (chỉ hiện khi có quyền): **Gán / gỡ admin group**, **Xoá** (ở group gốc là xoá khỏi community), **Cấm** khỏi community (cần quyền admin community).
  - **Xuất CSV** toàn bộ danh sách, tải 100 người mỗi lần, bấm lại để dừng. File không có email.
  - **Vào / rời gần đây**: từ nhật ký hoạt động của group, có số người vào/rời trong 24 giờ và 7 ngày. Sự kiện mới kể từ lần xem trước có viền tím.
- **Bài viết**
  - **Duyệt bài** (community bật duyệt bài và bạn quản trị group gốc): bài chờ duyệt kèm nội dung đầy đủ và đánh giá theo quy tắc bài viết. Duyệt hoặc từ chối kèm lý do gửi người đăng; từ chối một bài thì lý do được điền sẵn.
  - **Bài mới đăng**: 20 bài mới nhất của mỗi group sau mỗi lần quét, chấm theo quy tắc. Mục **Cần xử lý** gồm bài vi phạm và bài cần xem.
    - **Xoá bài**: chỉ với **bài của chính bạn**. Beincom không cho admin xoá bài của người khác.
    - **Ẩn bài**: với bài người khác, gỡ khỏi các group bạn quản trị, có chọn lý do. Addon chưa hiện lại được bài đã ẩn.
    - **Bỏ qua**: chỉ ẩn khỏi danh sách của addon.
- **Báo cáo**
  - **Người dùng báo cáo** (chỉ **chủ / admin community**, chọn group gốc): bài viết, article, bình luận bị thành viên báo cáo, kèm tác giả, lý do và số lượt báo cáo theo từng lý do. Bấm **Ai đã báo cáo?** để xem người báo cáo.
    - **Bỏ qua**: đánh dấu nội dung không vi phạm.
    - **Ẩn**: ẩn nội dung khỏi community. Bình luận bị ẩn cũng biến mất khỏi bài.
    - Lọc **Chờ xử lý** / **Tất cả**; bình luận có link mở bài chứa bình luận đó.
  - **Gắn cờ tự động** (admin group trở lên): bài hệ thống kiểm duyệt của Beincom phát hiện có dấu hiệu vi phạm, kèm loại vi phạm. **Ẩn bài** gỡ bài khỏi các group bạn quản trị; lý do được chọn sẵn theo loại vi phạm.
  - **Đã ẩn**: bài đã bị ẩn trong group (chỉ xem).
  - Mỗi lần quét, addon đếm báo cáo chờ xử lý và bài bị gắn cờ (xem phần Thông báo). Mở một mục ở tab này thì số đếm cập nhật theo danh sách vừa đọc; xử lý xong mục nào thì mục đó được trừ ngay.
- **Đăng bài**
  - Chọn một hoặc nhiều group (một bài hiện ở mọi group đã chọn).
  - **Trình soạn thảo** có thanh công cụ:
    - Định dạng: **đậm**, *nghiêng*, gạch ngang, code, tiêu đề, danh sách gạch đầu dòng / đánh số, trích dẫn, đường kẻ, chèn link.
    - Bôi đen rồi bấm để định dạng, bấm lại để bỏ. Phím tắt Ctrl+B / Ctrl+I / Ctrl+K; Ctrl+Z hoàn tác được.
    - Ba chế độ xem: **Soạn**, **Soạn + xem trước**, **Xem trước**.
    - Addon chèn đúng ký hiệu markdown mà trình soạn thảo Beincom dùng.
  - Tối đa 3000 ký tự, có đếm ký tự, cảnh báo nếu bài dính quy tắc bài viết của chính bạn.
  - **Nhắc tên**: gõ `@` rồi vài chữ để tìm người trong các group đã chọn (giống web), ↑ ↓ để chọn, Enter / Tab để chèn `@username`, Esc để đóng. Phần xem trước tô màu người được nhắc. Khi đăng chỉ gửi những người còn trong bài; nháp và mẫu bài nhớ người đã chọn.
  - **Xem trước link**: addon lấy thông tin (tiêu đề, mô tả, ảnh) của link cuối cùng trong bài và hiện thẻ xem trước; bấm × để không đính kèm. Giống web, thẻ chỉ hiện và chỉ được gửi khi bài không có ảnh / video / tệp.
  - **Tag và series**: chọn tối đa 5 tag (của community) và 3 series (có các group đã chọn trong phạm vi), giống web. Gõ để lọc, ↑ ↓ và Enter để thêm, × hoặc Backspace để bỏ. Đổi group mà tag / series không còn dùng được thì mục đó chuyển đỏ và addon không cho đăng tới khi bỏ ra. Trước khi tạo bài, addon hỏi Beincom tag / series có hợp lệ không. Nháp và mẫu bài nhớ tag / series.
  - **Ảnh, video, tệp đính kèm** (giới hạn như web Beincom; mỗi bài chỉ một loại):
    - Ảnh: tối đa 10, mỗi ảnh ≤ 25 MB (jpg, png, gif, webp, heic, avif, bmp, svg).
    - Video: 1, ≤ 300 MB.
    - Tệp: tối đa 25, mỗi tệp ≤ 5 MB (pdf, Word, Excel, PowerPoint, OpenDocument, txt, csv, zip, html).
    - Chọn file thì hiện ảnh thu nhỏ / tên tệp, bấm × để bỏ. File chỉ giữ trong lúc mở trang, không lưu vào nháp.
    - File được tải lên Beincom **lúc bấm Đăng** (có thanh tiến độ), rồi mới đăng bài. Đang Chạy thử thì không tải gì lên, nhật ký ghi số file.
    - Một file lỗi thì dừng, không đăng; bấm Đăng lần nữa để thử lại (file đã tải xong không tải lại).
    - Có thể đăng bài chỉ có ảnh / video / tệp, không cần chữ.
  - Tuỳ chọn cho bình luận, cho thả cảm xúc, đánh dấu **Quan trọng** với hạn như trên Beincom: không hết hạn, 1 ngày, 3 ngày, 1 tuần, 2 tuần, 1 tháng, 3 tháng, 6 tháng, 1 năm, hoặc tự chọn ngày giờ. Hạn tính từ lúc bài được đăng (giờ hẹn nếu hẹn giờ).
  - Đăng ngay hoặc **hẹn giờ** (ít nhất 5 phút sau). Hẹn giờ dùng chức năng có sẵn của Beincom, nên không cần mở trình duyệt lúc tới giờ.
  - Tự lưu nháp. **Mẫu bài**: lưu, dùng lại, xoá.
  - **Bài đã hẹn giờ**:
    - Giờ đăng, thời gian còn lại, lúc tạo; bài hẹn giờ lỗi có nhãn đỏ.
    - Nội dung đã định dạng (thu gọn, bấm để xem hết), ảnh thu nhỏ, thẻ xem trước link, video / tệp, tag, series, người được nhắc tên.
    - Cài đặt khác mặc định: Quan trọng đến lúc nào, tắt bình luận, tắt cảm xúc.
    - Đổi giờ, huỷ (xoá bài; chỉ bài của chính bạn).
- **Thống kê** (chọn community hoặc group, 7 / 30 / 90 ngày)
  - Ô số liệu: thành viên hiện tại, số người vào / rời, bài mới, lượt cảm xúc và bình luận.
  - Biểu đồ số thành viên, vào / rời mỗi ngày, bài mới mỗi ngày. Rê chuột xem số liệu từng ngày; có bảng số liệu và xuất CSV.
  - **Bài nổi bật** (theo cảm xúc + bình luận) và **Người đăng tích cực**.
  - Nguồn số liệu:
    - **Chủ / admin community**: số liệu chính thức của Beincom (thành viên và số bài theo ngày).
    - **Admin group**: addon tự tính từ nhật ký hoạt động, bài trên các group bạn quản trị, và số thành viên addon ghi lại sau mỗi lần quét. Biểu đồ số thành viên chỉ có từ ngày cài addon.
- **Quy tắc & cài đặt**: quy tắc lọc thành viên, quy tắc bài viết, cài đặt addon (công tắc tổng, chạy thử, thông báo, quét bài mới, quét báo cáo vi phạm, chu kỳ quét, nghỉ giữa hai thao tác, tự xử lý yêu cầu tham gia).
- **Nhật ký**: mọi thao tác (bấm tay, tự động, chạy thử, lỗi) kèm lý do và giờ đăng; lọc theo thành viên / bài viết; xuất CSV hoặc JSON.
- Mọi thao tác ghi đều có hộp xác nhận ghi rõ số mục, group và đang chạy thử hay gửi thật.
- **Thông báo và huy hiệu**:
  - Số trên icon = yêu cầu tham gia + bài chờ duyệt + bài mới vi phạm + báo cáo chờ xử lý + bài bị Beincom gắn cờ (một bài vừa vi phạm quy tắc vừa bị gắn cờ chỉ đếm một lần). `OFF` = đã tắt addon, `!` = cần đăng nhập lại.
  - Có thông báo khi có yêu cầu mới, khi số bài chờ duyệt tăng, khi có bài mới vi phạm, khi có báo cáo vi phạm mới hoặc bài mới bị Beincom gắn cờ. Lần quét đầu chỉ ghi nhận, không báo. Bấm thông báo để mở thẳng tab liên quan.
  - Quét khi mở trình duyệt, rồi theo chu kỳ (15 phút – 4 giờ).

## Quy tắc lọc thành viên
Mỗi yêu cầu được xếp vào một trong ba mức:

| Mức | Khi nào |
|---|---|
| **Gợi ý từ chối** | Tài khoản bị vô hiệu hoá, hoặc tên / username / câu trả lời chứa **từ khoá cấm** (không phân biệt hoa thường và dấu: `kiem tien` khớp `Kiếm Tiền`) |
| **Cần xem** | Không có ảnh đại diện, chưa trả lời câu hỏi bắt buộc, câu trả lời ngắn hơn số ký tự tối thiểu, hoặc chưa xác minh (nếu bật) |
| **Gợi ý duyệt** | Đạt mọi quy tắc |

**Username luôn duyệt** và **Username luôn từ chối** thắng mọi quy tắc khác.

## Quy tắc bài viết
Dùng chung cho Duyệt bài và Bài mới đăng:

| Mức | Khi nào |
|---|---|
| **Gợi ý từ chối** / **Vi phạm** | Bài (cả link xem trước) chứa **từ khoá cấm**, hoặc có link tới **tên miền cấm**. Tên miền con cũng tính: cấm `t.me` thì chặn cả `www.t.me`. |
| **Cần xem** | Có link ra ngoài các **tên miền cho phép** (chỉ khi bật, mặc định cho phép `beincom.com`) |
| **Gợi ý duyệt** / **Không vi phạm** | Không dính quy tắc nào |

Addon nhận ra link dạng `https://…`, `www.…` và tên miền trần có đuôi phổ biến (`t.me/…`, `bit.ly/…`, `abc.vn`…). Đổi quy tắc là đánh giá cập nhật ngay, không cần quét lại.

## Tự xử lý (mặc định tắt, chỉ cho thành viên)
Dashboard → Cài đặt có hai tuỳ chọn, chạy sau mỗi lần quét khi addon đang bật:
- **Tự duyệt "Gợi ý duyệt"**
- **Tự từ chối "Gợi ý từ chối"**

"Cần xem" không bao giờ tự xử lý. **Bài viết không bao giờ tự duyệt, từ chối hay ẩn**: bạn luôn phải bấm. Khi bật Chạy thử, mỗi yêu cầu chỉ được ghi nhật ký một lần. Bật tự xử lý lúc đã tắt Chạy thử (hoặc ngược lại) đều phải xác nhận lại.

## Cách hoạt động
Chi tiết từng API nằm trong [API.md](API.md). Tóm tắt:
- **Quét** (chỉ đọc):
  - `GET group/me/permissions`
  - `GET group/groups/{id}`
  - `GET group/groups/{id}/join-requests`
  - `GET group/groups/{id}/membership-questions`
  - `GET content/manage/communities/{groupId gốc}/approval-contents/count`
  - `GET content/manage/communities/{groupId gốc}/approval-contents`, và chi tiết từng bài (tối đa 30 bài mới mỗi lần quét; bài đã tải thì dùng lại)
  - `GET content/timeline/{id}?limit=20`
  - Báo cáo (nếu bật **Quét báo cáo vi phạm**; đọc song song với phần bài viết):
    - `GET content/manage/groups/{id}/contents/flagged?limit=20` cho mọi group đang quản trị
    - `GET content/manage/communities/{groupId gốc}/content-reports?limit=50` cho community bạn làm chủ / admin, chờ tối đa 15 giây
- **Duyệt / từ chối thành viên**: `PUT group/groups/{id}/joining-requests/{requestId}/approve` hoặc `/decline`
- **Duyệt / từ chối bài**: `PUT content/contents/approval-contents/{contentId}` với `{ status: "APPROVED" }` hoặc `{ status: "REJECTED", rejectionReason: { reason } }`
- **Ẩn bài**: `POST content/contents/{contentId}/hide` với `{ reasonType, groupIds }`
- **Báo cáo** (khi mở tab):
  - `GET content/manage/communities/{groupId gốc}/content-reports` (tối đa 4 trang × 50 báo cáo; chờ tối đa 25 giây) và `…/content-reports/{reportId}` (người báo cáo)
  - Bỏ qua / ẩn: `PUT content/manage/communities/{groupId gốc}/content-reports/{targetId}/status` với `{ status: "IGNORED" }` hoặc `{ status: "HID" }`
  - `GET content/manage/groups/{groupId}/contents/flagged` và `/hidden`; ẩn bài gắn cờ dùng API Ẩn bài ở trên
- **Thành viên** (đọc khi mở Dashboard, không lưu lại; không phải chờ lần quét đang chạy):
  - `GET group/manage/communities/{communityId}/members` (group gốc)
  - `GET group/groups/{id}/users` (group con, và danh sách admin của group gốc)
  - `GET group/groups/{id}/activity-logs`
- **Xoá / gán admin / cấm**:
  - `PUT group/groups/{id}/users/remove` với `{ user_ids }`
  - `PUT group/groups/{id}/assign-admin` hoặc `/revoke-admin` với `{ user_id }`
  - `POST group/communities/{communityId}/users/{userId}/ban` với `{ reason }`

  API nhóm `group/` nhận tên trường snake_case.
- **Đăng bài**: `POST content/posts` (tạo nháp) → `PUT content/posts/{id}/publish`, hoặc `/schedule` kèm `scheduledAt`. Bước sau lỗi thì xoá bản nháp vừa tạo (`DELETE content/posts/{id}`).
- **Tải file lên** (lúc bấm Đăng, trước khi tạo bài; trang Dashboard gửi nội dung file, background gọi các API cần đăng nhập):
  - Ảnh: `POST upload/images/` → gửi file lên kho lưu trữ theo `presigned_post` (không kèm cookie) → `GET upload/images/{id}?wait=true`.
  - Video: như ảnh với `upload/videos/` (kèm `x-version-id`), chờ tối đa 10 phút.
  - Tệp: `POST upload/files/` → gửi file tới `upload/files/{id}` (kèm cookie, `upload_type=post_file`).
  - Kết quả đưa vào `media.images` / `videos` / `files` của bài.
- **Nhắc tên**: `GET user/users/mentionable?group_ids=a,b&key=…` (không kèm header phiên bản). Body bài có `mentions: { username: { id, avatar, name, fullname, isVerified } }`, nội dung ghi `@username`.
- **Tag / series**: `GET content/tags?groupIds[]=<group gốc>&offset=…` và `GET content/series?groupIds[]=<group>&offset=…` (25 mục mỗi trang); trước khi đăng: `POST content/contents/validate-series-tags` với `{ groups, series, tags }`. Body bài chỉ gửi id.
- **Xem trước link**: `GET group/url-metadata?url=…` (link ngoài) hoặc `GET content/contents/{id}/link-preview` (bài / article / series trên Beincom). Body bài có `linkPreview: { url, domain, title, image, description }`.
- **Bài đã hẹn giờ**: `GET content/manage/groups/{groupId gốc}/contents/scheduled`; đổi giờ: `PUT content/contents/{id}/reschedule`; huỷ: `DELETE content/posts/{id}`.
- **Xoá bài của mình**: `DELETE content/posts/{id}`. Addon biết bài nào của bạn nhờ `GET user/me/profile`, gọi không kèm header phiên bản.
- **Thống kê** (đọc khi mở tab):
  - `GET group/manage/communities/{communityId}/stats/member-count` và `GET content/stats/communities/{groupId gốc}/contents/daily-counts`: số liệu chính thức cho chủ / admin community.
  - Không có số liệu chính thức thì addon tự tính từ `activity-logs` (tối đa 6 trang × 50 sự kiện), `content/timeline` (tối đa 8 trang × 20 bài mỗi group) và số thành viên ghi sau mỗi lần quét (giữ 120 ngày).
- Thao tác hàng loạt chạy từng mục một, nghỉ 1–5 giây giữa hai mục (chỉnh được).
- API nội dung (`content/…`) của Beincom chỉ nhận tối đa 25 mục mỗi trang; addon đọc nhiều trang khi cần. API nhóm (`group/…`) nhận 50–100.
- Xoá / ẩn / duyệt / huỷ hẹn giờ một bài mà Beincom báo "Content not found" (bài đã bị xoá trên web): addon tính là xong, bỏ bài khỏi danh sách và ghi "Bài không còn trên Beincom" vào nhật ký.
- **Xác thực**: header `x-application: BIC_GROUP`, `x-platform: WEB`, cookie của beincom.com. Gọi trực tiếp bị chặn thì addon mở tạm một tab Beincom ở nền rồi gọi trong tab đó, giống addon Beincom Check-in.

## Kiểm thử
```
node --test "test/*.test.js"
```
- `test/common.test.js`: quy tắc thành viên và bài viết, nhận link, quyền, đường dẫn, xuất CSV, xem trước markdown (an toàn với HTML), ghép số liệu thống kê.
- `test/upload.test.js`: luồng tải ảnh / video / tệp với kho lưu trữ giả lập (thứ tự trường, lỗi S3, không đọc được phản hồi, tệp kèm cookie, hết phiên).
- `test/background.test.js`: chạy `background.js` thật với `chrome.*` và API Beincom giả lập. Kiểm tra:
  - Quét, thông báo, chạy thử, hết phiên đăng nhập, phân trang
  - Duyệt / từ chối thành viên và bài (đúng body), lỗi, tự xử lý
  - Tải chi tiết bài chờ duyệt, gộp bài mới, ẩn bài, bỏ qua
  - Danh sách thành viên (phân trang, tìm, sắp xếp), nhật ký vào/rời, xoá / gán admin / cấm (đúng body), quyền
  - Đăng ngay, hẹn giờ (đúng body), kiểm tra trước khi đăng, xoá nháp khi lỗi, đổi giờ, huỷ
  - Nhận ra tài khoản đang đăng nhập, chỉ xoá bài của mình
  - Tải lại từng phần: mỗi phần chỉ gọi đúng API của nó, giữ dữ liệu phần kia, không thông báo
  - Thống kê: số liệu chính thức và tự tính, lịch sử số thành viên
  - Báo cáo: chỉ admin community đọc được báo cáo người dùng, Beincom không trả lời thì dừng sau 25 giây, bỏ qua / ẩn (đúng body, chạy thử không gửi), ẩn bài gắn cờ
  - Tag / series: tải theo group gốc (kể cả bản cũ chưa lưu group gốc), đủ các trang, kiểm tra hợp lệ trước khi tạo nháp, báo tên mục không hợp lệ
  - Nhắc tên và xem trước link: đúng API / header, chỉ gửi người còn trong bài, không gửi xem trước khi có ảnh
  - Tải file: xin chỗ tải lên đúng API / body / header, chờ xử lý (lỗi, chưa xong, quá lâu), đăng bài kèm ảnh, chạy thử không tải
  - Quét báo cáo: đếm đúng, lần sau báo cái mới (bài gắn cờ ở nhiều group báo một lần), API treo không làm hỏng lần quét, tắt thì không gọi API, xử lý xong thì trừ số đếm, mở tab thì cập nhật số đếm và không báo lại

## Giới hạn
- Chỉ làm được việc tài khoản có quyền:
  - Admin group duyệt được thành viên và xem được bài chờ duyệt.
  - Thống kê community và báo cáo của người dùng cần quyền admin community. Admin group chỉ xem được bài gắn cờ tự động và bài đã ẩn.
- Group đang **tắt duyệt thành viên** (ví dụ Crypto Life lúc viết addon) thì người xin vào được vào luôn, nên sẽ không có yêu cầu nào để duyệt.
- **Chưa có:**
  - **Báo cáo thành viên** (người dùng báo cáo một tài khoản): web Beincom chưa có giao diện và API cho phần này.
  - **Quét bình luận**: chưa tìm ra API đọc bình luận.
  - **Hiện lại bài đã ẩn**: không thấy API.
- **Danh sách báo cáo**: với community không có báo cáo nào, Beincom có lúc không trả lời (đã gặp ở Food Research và The Heroic Spirit).
  - Ở tab Báo cáo: addon chờ 25 giây rồi báo "Beincom không phản hồi"; bấm ↻ Tải lại để thử lại.
  - Khi quét: chờ 15 giây rồi coi như community đó không có báo cáo. Nếu Beincom cũng treo khi *có* báo cáo thì addon sẽ không đếm được; mở tab Báo cáo để kiểm tra.
- **Gỡ cấm** chưa có trong addon: làm trên Beincom (Admin panel → Thành viên bị cấm).
- **Đăng bài chưa có**:
  - Đăng dưới danh nghĩa group
- **Xoá bài** chỉ được với bài của chính bạn (giới hạn của Beincom). Bài người khác: dùng Ẩn bài.
- **Thống kê khi là admin group** là số tự tính:
  - "Vào / rời" lấy từ nhật ký hoạt động của group đã chọn (tối đa 300 sự kiện gần nhất).
  - "Bài mới" chỉ đếm bài trên các group bạn quản trị; mỗi group đọc tối đa 160 bài.
  - Lượt cảm xúc / bình luận là tổng hiện tại của các bài đăng trong khoảng thời gian, không phải số phát sinh trong khoảng đó.
- Mới chỉ thử với API giả lập (cần thử thật): xoá bài của mình, thống kê với dữ liệu thật, bỏ qua / ẩn báo cáo, danh sách người báo cáo, ẩn bài gắn cờ, **tải ảnh / video / tệp** (luồng đọc từ mã web Beincom, chưa gọi thật lần nào), **đăng bài có nhắc tên và xem trước link** (API tìm người và lấy thông tin link đã gọi thử thật, phần đăng chưa), **đăng bài có tag / series** (API đọc danh sách đã gọi thử thật, kiểm tra hợp lệ và đăng chưa).
- Tải ảnh / video: nếu kho lưu trữ của Beincom không cho trang addon đọc phản hồi (CORS), addon vẫn gửi file rồi hỏi Beincom xem file đã lên chưa; khi đó lỗi của kho lưu trữ (file quá lớn, link hết hạn) chỉ hiện chung là "chưa lên được kho lưu trữ".
- Tải tệp cần gọi API Beincom trực tiếp (kèm cookie); nếu trình duyệt chặn cookie thì tệp không tải lên được.
- Chưa kiểm chứng với dữ liệu thật: cách nhận ra ảnh đại diện mặc định, dạng dữ liệu câu trả lời câu hỏi gia nhập.
- Mỗi lần quét tải tối đa 500 yêu cầu mỗi group và 200 bài chờ duyệt mỗi community. Xử lý bớt rồi quét lại để tải tiếp.
- Chỉ chạy khi trình duyệt đang mở. Beincom đổi API thì cần cập nhật `background.js`.
- Tự động hoá có thể trái Điều khoản sử dụng của Beincom — tự cân nhắc.
