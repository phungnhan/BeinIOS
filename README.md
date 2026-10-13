# BeinGroup — Quản lý Group Beincom (Chrome/Edge, MV3)

Gom **yêu cầu tham gia**, **bài chờ duyệt**, **bài mới vi phạm** và **danh sách thành viên** của mọi Group/Community bạn quản trị trên https://group.beincom.com vào một Dashboard. Addon chấm từng mục theo quy tắc của bạn, rồi cho duyệt, từ chối, ẩn bài, xoá / gán admin / cấm thành viên hàng loạt, và xử lý **báo cáo vi phạm**. Addon còn soạn và đăng bài, hẹn giờ đăng vào nhiều group cùng lúc, và thống kê thành viên, bài viết theo ngày. Dữ liệu chỉ lưu trong trình duyệt của bạn.

Tác giả: **Kai | Crypto Life**

## Cài đặt
1. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
2. Bấm **Load unpacked** → chọn thư mục `D:\CryptoLife\BeinGroup`. Khi cập nhật bản mới thì bấm ↻ (Reload) ở thẻ addon.
3. Đăng nhập Beincom trên chính trình duyệt đó bằng tài khoản admin group.
4. Addon mặc định bật **Chạy thử**: bấm Duyệt / Từ chối / Ẩn bài chỉ ghi nhật ký, chưa gửi lên Beincom. Thử quy tắc cho ổn rồi tắt Chạy thử ở Dashboard → Cài đặt.

### Gửi cho admin khác
```
node tools/pack.mjs
```
- Tạo `dist/BeinGroup-v<phiên bản>.zip`: trong là thư mục `BeinGroup/` chỉ gồm tệp addon cần để chạy, kèm `CHANGELOG.md` và `HUONG-DAN-CAI.html` (hướng dẫn cài / cập nhật / gỡ bằng tiếng Việt cho người không rành kỹ thuật; mở được từ chân Dashboard). Không có mã kiểm thử, công cụ, README.
- Trước khi ghi, công cụ kiểm tra mọi tệp mà `manifest.json`, các trang HTML, `importScripts` của service worker và `BG.PARTS` nhắc tới đều có trong gói, và `CHANGELOG.md` có mục cho phiên bản trong manifest.
- Thử chính gói đó trên addon thật: giải nén rồi chạy `node test/e2e/addon.e2e.mjs <thư mục BeinGroup vừa giải nén>`.
- **Báo cáo sử dụng của các admin**: làm theo `tools/HUONG-DAN-THU-THAP.md` để tạo nơi nhận (Google Sheet + Apps Script, 5 phút), lưu link vào `tools/usage-url.txt` hoặc chạy `node tools/pack.mjs --usage-url <link>` — link chỉ gắn vào bản trong tệp `.zip`, link sai dạng thì công cụ dừng.
- Mỗi bản mới: tăng `version` trong `manifest.json` và thêm mục `## vX.Y.Z — ngày` ở đầu `CHANGELOG.md` (có test kiểm tra). Người nhận cập nhật bằng cách chép đè vào **đúng thư mục cũ** rồi bấm ↻ — cài từ thư mục khác thì trình duyệt coi là addon mới (mất cài đặt, phải khôi phục từ bản sao lưu).

## Chức năng (theo tab của Dashboard)
Dashboard chia thành các tab. Số trên tab là việc đang chờ. Địa chỉ trang nhớ tab đang mở (`#tab=…`). Bảng dài cuộn trong khung của nó và **tên cột luôn hiện** ở trên cùng.

Nút **↻ Tải lại** bên phải thanh tab chỉ tải dữ liệu của tab đang xem, nhanh hơn **Quét ngay** (quét toàn bộ). Tải lại không gửi thông báo và không tự xử lý yêu cầu tham gia.

| Tab | Tải lại gì |
|---|---|
| Tổng quan | Thông tin group, yêu cầu tham gia, số bài chờ duyệt (không đọc bài viết) |
| Thành viên | Như Tổng quan, cộng danh sách thành viên hoặc nhật ký vào/rời đang xem |
| Bài viết | Hàng chờ duyệt bài và bài mới đăng (không đọc yêu cầu tham gia) |
| Báo cáo | Mục đang xem (người dùng báo cáo / gắn cờ tự động / đã ẩn) của group đang chọn, rồi cập nhật số đếm trên tab và icon |
| Đăng bài | Bài đã hẹn giờ (cả Article) |
| Thống kê | Tính lại số liệu |

Tab Quy tắc & cài đặt và Nhật ký chỉ dùng dữ liệu trong máy nên không có nút.

- **Tổng quan**
  - **Việc cần làm** (đầu tab): gom việc đang chờ ở mọi tab thành một danh sách. Việc gấp lên trước (đợt spam, báo cáo, bài Beincom gắn cờ, bài / bình luận vi phạm, bài chờ duyệt dính quy tắc, yêu cầu gợi ý từ chối), mới nhất trước; rồi tới hàng chờ (bài chờ duyệt, yêu cầu tham gia: chờ lâu nhất trước); cuối cùng là bài chưa ai trả lời.
    - Mỗi việc có nút xử lý ngay (Duyệt, Từ chối, Ẩn, Trả lời, Bình luận, Bỏ qua, Xem), vẫn qua hộp xác nhận như ở các tab. Lọc Gấp / Thành viên / Bài viết / Bình luận.
    - Phím tắt: **J / K** chọn việc, **1, 2, 3** bấm nút tương ứng, **O** mở trên web. Xử lý xong một việc thì tự chọn việc kế tiếp.
    - Popup có link **Mở hộp việc**.
  - Các ô số liệu: group đang quản trị, yêu cầu tham gia, bài chờ duyệt, bài mới vi phạm, báo cáo vi phạm, lần quét gần nhất. Bấm ô để mở tab tương ứng.
  - Bảng **Group bạn quản trị**: số thành viên, đang bật hay tắt duyệt thành viên và duyệt bài, số việc đang chờ (cột **Báo cáo** = báo cáo chờ xử lý + bài bị gắn cờ), link mở thẳng trang Beincom.
  - Group con nằm ngay dưới group gốc cùng community, thụt lề theo cấp. Bấm một dòng để mở tab Thành viên của group đó.
  - **Tóm tắt hoạt động** (7 / 30 ngày): thành viên tăng / giảm, duyệt / từ chối, xoá / cấm, kiểm duyệt bài, báo cáo đã xử lý, bình luận đã ẩn, bài và bình luận vi phạm phát hiện, bài đăng qua addon, thao tác lỗi, người vi phạm nhiều nhất. **Sao chép** thành đoạn chữ để gửi các admin khác, hoặc **Tải tệp .txt**.
    - Lấy từ nhật ký addon, số thành viên addon ghi sau mỗi lần quét và hồ sơ vi phạm; việc làm thẳng trên web Beincom không có trong nhật ký addon.
    - Sáng thứ Hai (sau 8 giờ) có thông báo tóm tắt tuần trước (tắt được ở Cài đặt).
  - **Cài đặt group**: bảng mỗi group một dòng với 5 cài đặt — Duyệt thành viên, Câu hỏi gia nhập, Chỉ người được mời, Ẩn danh sách thành viên, Duyệt bài (đọc lúc mở Tổng quan / bấm Tải lại).
    - Bấm một ô để đổi riêng group đó, hoặc tích nhiều group, chọn cài đặt rồi **Bật / Tắt cho đã chọn**. Group không đủ quyền hoặc đã đúng trạng thái thì tự bỏ qua.
    - Ô bị khoá có ghi lý do: không có quyền (theo lần quét), Beincom khoá, hoặc **Duyệt bài** cần quyền chủ / admin community.
    - ⚠ **Tắt Duyệt thành viên**: Beincom tự **duyệt** mọi yêu cầu đang chờ; hộp xác nhận ghi rõ mỗi group bao nhiêu yêu cầu sẽ được duyệt.
- **Thành viên**
  - **Duyệt thành viên**: mỗi yêu cầu có ảnh, tên, huy hiệu, câu trả lời câu hỏi gia nhập và đánh giá theo quy tắc. Duyệt hoặc từ chối từng người hay hàng loạt.
  - **Danh sách**: tìm theo tên hoặc username; group gốc sắp xếp được theo mới vào trước hoặc admin trước. Ngày vào và số group đã vào chỉ có ở group gốc.
  - Thao tác (chỉ hiện khi có quyền): **Gán / gỡ admin group**, **Xoá** (ở group gốc là xoá khỏi community), **Cấm** khỏi community (cần quyền admin community).
  - **Bị cấm**: danh sách người bị cấm của community (lý do, lúc cấm), **Gỡ cấm** từng người hoặc hàng loạt. Chỉ chủ / admin community (admin group bị Beincom từ chối). Gỡ cấm thì người đó xin vào lại được; hồ sơ vi phạm vẫn giữ.
  - **Xuất CSV** toàn bộ danh sách, tải 100 người mỗi lần, bấm lại để dừng. File không có email.
  - **Vào / rời gần đây**: từ nhật ký hoạt động của group, có số người vào/rời trong 24 giờ và 7 ngày. Sự kiện mới kể từ lần xem trước có viền tím.
  - **Hồ sơ vi phạm**: mỗi người một hồ sơ, gom từ mọi community bạn quản trị. Nút **Cấm ở mọi community** cấm người đó ở tất cả community bạn là chủ / admin (một lệnh cấm mỗi community, có chọn lý do). Addon tự ghi khi:
    - bạn ẩn bài, từ chối bài, từ chối yêu cầu tham gia, xoá hoặc cấm thành viên qua addon (cả tự xử lý; chạy thử thì không);
    - nhật ký hoạt động Beincom có người bị xoá, bị cấm, bị từ chối vào — kể cả do admin khác làm trên web (mỗi lần quét đọc trang mới nhất của từng group);
    - có báo cáo của người dùng (báo cáo bị bỏ qua thì gỡ khỏi hồ sơ), bài bị Beincom gắn cờ, bài đã bị ẩn trong group, bài mới vi phạm quy tắc bài viết.

    Cùng một lần xoá / cấm ghi từ addon và từ nhật ký Beincom chỉ tính một lần. Điểm: bị cấm 5, bị xoá 3, nội dung bị ẩn 2, còn lại 1. Danh sách xếp theo điểm, lọc **Tái phạm** (≥ 2 lần) / **Từng bị xoá / cấm**, tìm theo tên, bấm **Chi tiết** để xem từng lần (lúc nào, ở group nào, bài gì, lý do, ai làm), **Xoá hồ sơ** để quên một người, **Xuất CSV**. Mỗi người giữ 30 sự kiện gần nhất, tối đa 500 người.
  - Người có hồ sơ có huy hiệu **⚠ số lần** cạnh tên (đỏ nếu từng bị xoá / cấm) ở yêu cầu tham gia, danh sách thành viên và mọi bảng bài viết; bấm để mở hồ sơ.
- **Bài viết**
  - **Duyệt bài** (community bật duyệt bài và bạn quản trị group gốc): bài chờ duyệt kèm nội dung đầy đủ và đánh giá theo quy tắc bài viết. Duyệt hoặc từ chối kèm lý do gửi người đăng; từ chối một bài thì lý do được điền sẵn.
  - **Bài mới đăng**: 20 bài mới nhất của mỗi group sau mỗi lần quét, chấm theo quy tắc. Mục **Cần xử lý** gồm bài vi phạm và bài cần xem.
    - Mục **Chưa ai trả lời**: bài đăng đã hơn 6 giờ (đổi ở Cài đặt → Theo dõi: 3 / 6 / 12 / 24 giờ; trong 7 ngày) mà chưa có bình luận nào (không tính bài của bạn), thường là câu hỏi của thành viên. Nút **💬 Bình luận** ở mỗi bài để trả lời ngay.
    - **Xoá bài**: chỉ với **bài của chính bạn**. Beincom không cho admin xoá bài của người khác.
    - **Ẩn bài**: với bài người khác, gỡ khỏi các group bạn quản trị, có chọn lý do. Bài đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).
    - **Bỏ qua**: chỉ ẩn khỏi danh sách của addon.
    - **📌 Ghim**: chọn các group (bạn quản trị, bài được đăng vào) để ghim hoặc bỏ ghim; mỗi group tối đa 5 bài, group đã đủ thì bị khoá.
    - **⚙ Cài đặt**: bật / tắt bình luận, cảm xúc, đánh dấu Quan trọng (có hạn chọn sẵn). Admin đổi được cả bài của người khác.
    - **✎ Sửa** (chỉ bài của chính bạn): mở bài trong tab Đăng bài với đủ nội dung, ảnh / video / tệp đang có, nhắc tên, xem trước link, tag, series, cài đặt. Nơi đăng giữ nguyên. Thêm hoặc bỏ ảnh được; ảnh mới tải lên khi bấm **Lưu thay đổi**. Bài đang viết dở được cất lại và trả về khi lưu xong hoặc bấm **Huỷ sửa**.
  - **Bài đang ghim**: chọn group để xem các bài đang ghim (x/5) và bỏ ghim.
  - **Đợt spam** (đầu tab, chỉ hiện khi có): cùng một link (hoặc cùng nội dung từ 25 ký tự) từ **3 tài khoản trở lên trong 6 giờ**, tính trên bài mới và bình luận mới đã quét. Không tính bài của chính bạn và link tới tên miền cho phép.
    - Mỗi đợt: link / nội dung, số tài khoản, số bài và bình luận, thời gian, danh sách người (kèm huy hiệu hồ sơ vi phạm).
    - **Ẩn cả đợt** (một lần cho cả bài lẫn bình luận), **Cấm tên miền** (thêm vào Tên miền cấm của quy tắc chung), **Bỏ qua**.
    - Đợt mới có thông báo (mỗi đợt một lần, tắt được ở Cài đặt → Báo đợt spam).
  - **Bình luận mới** (bật "Quét bình luận mới"): mỗi lần quét đọc 25 bình luận gốc mới nhất của tối đa 8 bài có số bình luận tăng, cùng trả lời của tối đa 10 bình luận có trả lời mới; chấm theo quy tắc bài viết của group (kể cả quy tắc riêng).
    - Lọc Cần xử lý / Tất cả / Đã bỏ qua / Đã ẩn. **Ẩn** bình luận (như nút Ẩn của admin trên web, có lý do), **Bỏ qua**, **Mở ↗** tới đúng bình luận.
    - **Trả lời** ngay trong addon (dưới tên tài khoản của bạn): điền sẵn @tên người viết; trả lời của một trả lời thì gửi vào bình luận gốc như web. Gõ @username để nhắc tên người đăng bài hoặc người đã bình luận; bình luận vừa gửi hiện luôn trong danh sách.
    - Bình luận mới vi phạm: có thông báo, cộng vào số trên icon và ô "Bài, bình luận vi phạm", ghi vào hồ sơ vi phạm của người viết.
  - **Lọc bài / bình luận**: ô Lọc ở Bài mới đăng và Bình luận mới — `@tên` theo người đăng, `#TAG` theo tag, hoặc chữ bất kỳ (không cần dấu). Lọc xong bấm "Chọn tất cả đang hiện" rồi Ẩn / Bỏ qua cả loạt.
  - **🧹 Dọn tài khoản**: nút dưới tên người đăng (Bài mới đăng, Bình luận mới, Hồ sơ vi phạm — ở đây luôn có nút), ở Tìm & dọn bài, hoặc trong tin Telegram có nút. Hộp dọn liệt kê bài / bình luận gần đây còn hiện của người đó rồi **tự tìm thêm mọi bài cũ còn hiện** trong các community bạn quản trị (tìm như trang Tìm kiếm của web, tối đa 200 bài mới nhất mỗi community); mỗi mục có ô tick (chọn sẵn hết, bỏ tick mục không muốn ẩn). Lý do chọn được, tuỳ chọn **cấm luôn** ở mọi community bạn là chủ / admin. Không dọn được chính mình; nhật ký ghi "Dọn tài khoản".
  - **Tìm & dọn bài**: gõ từ khoá hoặc link (vd `t.me/`, `airdrop`, một tên miền lừa đảo), chọn community và khoảng thời gian (7 / 30 / 90 ngày, mọi lúc) → danh sách mọi bài còn hiện khớp (tối đa 200 bài mới nhất mỗi community). Không bài nào được chọn sẵn; bài của bạn, admin group và thành viên tin cậy có nhãn **giữ** và không nằm trong "Chọn tất cả". Tick bài rồi **Ẩn đã chọn** (có lý do, tối đa 200 bài một lần); "Đăng nhiều nhất" có nút 🧹 dọn cả tài khoản. Nhật ký ghi "Tìm & dọn".
  - **Bài đã ẩn không hiện lại được**: Beincom chỉ có lệnh ẩn, không có lệnh hiện lại (trang "Nội dung đã ẩn" của web cũng chỉ để xem). Vì vậy mọi chỗ ẩn hàng loạt đều cho xem trước từng mục; Chạy thử chặn mọi thao tác.
  - **Quản lý tag** (theo community, cuối tab): danh sách tag kèm số bài đang dùng, tìm tag, **Xem bài ↗** (trang tìm các bài gắn tag đó trong community, như bấm tag trên web), **Tạo tag**, **Đổi tên**, **Xoá**.
    - Giống web Beincom: tên tag 3–32 ký tự, tự viết hoa, không trùng tag đã có; chỉ **đổi tên / xoá được tag chưa gắn vào bài nào** (tag đã dùng thì nút bị khoá).
    - Cần quyền quản lý tag của community (thường chủ hoặc admin community); không có quyền thì chỉ xem. Thao tác có hỏi lại, theo Chạy thử, ghi nhật ký.
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
  - Đăng ngay hoặc **hẹn giờ** (ít nhất 5 phút sau). Khi hẹn giờ, nút **⏱ Giờ tốt nhất** gợi ý 3 thời điểm sắp tới theo bài 30 ngày của community đang chọn; bấm là điền vào ô giờ đăng. Hẹn giờ dùng chức năng có sẵn của Beincom, nên không cần mở trình duyệt lúc tới giờ.
  - **Chào thành viên mới**: chọn group và 7 / 14 / 30 ngày, bấm **Tìm người mới** (group gốc: danh sách thành viên mới vào trước, bỏ admin; group con: nhật ký vào / rời, bỏ người đã rời). Tick chọn người (người có hồ sơ vi phạm bỏ chọn sẵn), bấm **Soạn bài chào**: addon điền bài chào có @tên từng người (tối đa 50 người được nhắc) vào ô soạn bài, bạn xem lại rồi Đăng hoặc Hẹn giờ.
    - **Mẫu bài chào** sửa được, dùng `{so_nguoi}`, `{danh_sach}`, `{group}`.
    - Sáng thứ Hai (sau 8 giờ) có thông báo nhắc; bấm vào thì mở thẳng công cụ này và tìm người mới (tắt ở Cài đặt → Nhắc chào thành viên mới).
  - **Vinh danh thành viên tích cực**: chọn group (group gốc tính cả các group con bạn quản trị), 7 / 30 ngày, Top 3 / 5 / 10, bấm **Tìm người tích cực**. Addon đọc bài trong khoảng (như tab Thống kê) và bình luận addon đã đọc, xếp theo điểm = 5 × số bài + số bình luận đã viết + nửa số cảm xúc bài nhận được (bỏ tài khoản của bạn).
    - Bảng có số bài, bình luận đã viết, cảm xúc và bình luận nhận được; tick chọn người rồi **Soạn bài vinh danh**: bài có huy chương cho 3 người đầu và @tên từng người được điền vào ô soạn bài.
    - **Mẫu bài vinh danh** sửa được (`{danh_sach}`, `{so_nguoi}`, `{group}`). Thông báo sáng thứ Hai nhắc cả chào thành viên mới lẫn vinh danh.
  - **Đăng dưới tên group**: khi chọn đúng một group mà bạn có quyền tạo bài của admin, tick "Đăng dưới tên group" để bài hiện với tên và ảnh của group (như nút trên web). Beincom còn phải bật tính năng này cho tài khoản; chưa bật thì addon báo lỗi rõ.
  - **Bài đăng định kỳ**: khi hẹn giờ, chọn **Lặp lại** (hằng ngày, hằng tuần, 2 tuần một lần, hằng tháng) và số bài (2–30).
    - Addon đặt trước từng bài hẹn giờ trên Beincom ngay lúc bấm, nên tới giờ Beincom tự đăng dù máy đang tắt. Hộp xác nhận ghi lịch đăng từng bài.
    - Giữ nguyên giờ trong ngày; hằng tháng ngày 31 thì tháng ngắn đăng ngày cuối tháng.
    - Ảnh / video / tệp được tải lên riêng cho từng bài. Hạn **Quan trọng** tính theo giờ đăng của từng bài.
    - Một bài lỗi thì dừng, báo đã hẹn được bao nhiêu bài.
    - Ở **Bài đã hẹn giờ**, bài trong chuỗi có nhãn 🔁 k/N. **Huỷ cả chuỗi** xoá các bài còn đang chờ của chuỗi đó.
  - Tự lưu nháp. **Mẫu bài**: lưu, dùng lại, xoá.
  - **Bài đã hẹn giờ**:
    - Giờ đăng, thời gian còn lại, lúc tạo; bài hẹn giờ lỗi có nhãn đỏ.
    - Nội dung đã định dạng (thu gọn, bấm để xem hết), ảnh thu nhỏ, thẻ xem trước link, video / tệp, tag, series, người được nhắc tên.
    - Cài đặt khác mặc định: Quan trọng đến lúc nào, tắt bình luận, tắt cảm xúc.
    - Đổi giờ, huỷ (xoá bài; chỉ bài của chính bạn).
    - **Sửa** (bài thường hẹn giờ của chính bạn): mở bài trong khung soạn, đổi nội dung, ảnh / video / tệp, tag, series, cài đặt và giờ đăng rồi **Lưu bài hẹn giờ**; Beincom vẫn tự đăng tới giờ.
    - Có cả **Article** hẹn giờ: hiện tiêu đề, tóm tắt, ảnh bìa; huỷ thì xoá đúng Article.
    - **Lịch nội dung**: đổi cách xem **Danh sách | Tuần | Tháng** (giờ Việt Nam, tuần bắt đầu Thứ Hai), ◀ ▶ và **Hôm nay** để chuyển.
      - Mỗi ngày hiện các bài hẹn giờ (🔁 là bài định kỳ, viền đỏ là bài hẹn giờ lỗi); ô tháng hiện 3 bài, bấm "+N bài nữa" để xem tuần đó.
      - Bấm một bài: về dạng danh sách, cuộn tới bài đó để đổi giờ hoặc huỷ.
      - **+** ở một ngày: khung Soạn bài chuyển sang Hẹn giờ vào ngày đó, lúc giờ nên đăng của ngày (nếu đã tính) hoặc 20:00.
      - **⏱ giờ nên đăng mỗi ngày** theo bài 30 ngày của community đang chọn ở khung Soạn bài (như nút Giờ tốt nhất).
  - **Nhập nhiều bài từ CSV**: soạn lịch đăng trong Excel / Google Sheets rồi hẹn giờ một lần (tối đa 100 bài mỗi tệp).
    - Cột bắt buộc: `noi_dung`, `group` (tên group, "Community > Group" hoặc id; nhiều group cách nhau `;` hoặc `|`), `gio_dang` (giờ Việt Nam: `15/10/2026 20:00`, `2026-10-15 20:00`…). Cột tuỳ chọn: `quan_trong`, `tat_binh_luan` (có / không). Tên cột có dấu hay không đều được.
    - Đọc được dấu phẩy hoặc chấm phẩy, ô có xuống dòng, tệp UTF-8 hoặc bảng mã Windows của Excel. **Tải tệp mẫu** có sẵn tên group của bạn. Kéo thả tệp vào thẻ cũng được.
    - Bản xem trước báo lỗi từng dòng (thiếu nội dung, group không có hoặc tên trùng, giờ không đọc được, đã qua…) và cảnh báo (dính quy tắc bài viết, trùng giờ cùng group). Dòng lỗi bị bỏ qua.
    - Hẹn lần lượt từng bài (nghỉ theo cài đặt giữa hai thao tác, ít nhất 1 giây); lỗi đăng nhập hoặc 3 bài lỗi liên tiếp thì dừng, bấm lại để hẹn tiếp các bài còn lại.
  - **Article & Series**:
    - **Soạn Article** giống web Beincom: tiêu đề (≤ 64 ký tự), tóm tắt (≤ 255), **ảnh bìa** (bắt buộc), **chuyên mục** (ít nhất một), nội dung (≤ 100.000 ký tự), thêm vào series, gắn tag, đăng ngay hoặc **hẹn giờ**, đăng dưới tên group.
    - **Trình soạn thảo** có thanh công cụ: đậm, nghiêng, gạch chân, gạch ngang, mã, tiêu đề H1 / H2 / H3, danh sách, trích dẫn, kẻ ngang, link, 🖼 ảnh, 🎬 video, ▦ bảng, @ nhắc tên; phím tắt Ctrl+B / I / U / K; chế độ **Soạn / Soạn + xem trước / Xem trước** (xem trước cập nhật khi gõ).
    - Bên dưới là Markdown, ai quen có thể gõ thẳng: `#`/`##`/`###` tiêu đề, `**đậm**`, `*nghiêng*`, `~~gạch~~`, `++gạch chân++`, `` `mã` ``, `- danh sách`, `1. đánh số`, `> trích dẫn`, `---`, `[chữ](link)`, bảng `| a | b |` (dòng thứ hai `|---|---|`); một dòng chỉ có link YouTube / Vimeo thành video nhúng. Addon tự chuyển sang định dạng trình soạn thảo Article của Beincom. Có **Xem trước** và đếm từ / ký tự.
    - **🖼 Ảnh** trong thân bài: chèn vào chỗ con trỏ (tối đa 30 ảnh, mỗi ảnh ≤ 25 MB), tải lên Beincom lúc bấm Đăng (Chạy thử thì không tải). Ảnh không lưu trong nháp: mở lại Dashboard thì phải chọn lại.
    - **@nhắc tên**: gõ @ để chọn người trong các group đã chọn (giống khung soạn bài); chỉ người được chọn từ ô gợi ý mới thành nhắc tên.
    - **Tạo Series**: tên (≤ 64), mô tả (≤ 255), ảnh bìa, đánh dấu Quan trọng, tạo dưới tên group.
    - Nháp chữ tự lưu; ảnh bìa thì không (chọn lại sau khi mở lại Dashboard).
- **Đăng bài → Bài thảo luận hằng tuần**: câu hỏi mồi để thành viên (nhất là người mới) có chủ đề trả lời.
  - Kho câu hỏi (khoá `promptBank`, có trong bản sao lưu): 20 câu mặc định về crypto; sửa trong ô chữ (mỗi dòng một câu, `{group}` = tên group), **Khôi phục kho mặc định**. Câu giữ nguyên khi sửa vẫn giữ lịch sử dùng.
  - **✍ Soạn ngay**: chọn câu chưa dùng ở group trong 8 tuần, ít dùng nhất (dùng hết thì quay vòng), điền vào ô Đăng bài và hẹn giờ theo **giờ có tương tác tốt nhất theo bài của bạn** (Hiệu quả bài đã đăng, từ 3 bài; chưa đủ thì 20 giờ thứ Tư).
  - **Mỗi sáng thứ Hai soạn sẵn** (mặc định tắt, một group): thông báo, ô **Bài thảo luận tuần này** có **Mở trong ô Đăng bài**, **Đổi câu khác**, **Bỏ qua tuần này**. Addon không tự đăng.
  - Bài đăng / hẹn giờ thật từ câu hỏi được ghi vào lịch sử câu đó; bảng **Hiệu quả từng câu** lấy lượt xem, cảm xúc, bình luận ở Hiệu quả bài đã đăng (điểm = cảm xúc + 2 × bình luận).
- **Thống kê** (chọn community hoặc group, 7 / 30 / 90 ngày)
  - Ô số liệu: thành viên hiện tại, số người vào / rời, bài mới, lượt cảm xúc và bình luận.
  - Biểu đồ số thành viên, vào / rời mỗi ngày, bài mới mỗi ngày. Rê chuột xem số liệu từng ngày; có bảng số liệu và xuất CSV.
  - **Bài nổi bật** (theo cảm xúc + bình luận) và **Người đăng tích cực**.
  - **Giờ đăng tốt nhất**: bảng nhiệt 7 ngày × 24 giờ (giờ Việt Nam) theo tương tác trung bình mỗi bài (cảm xúc + 2 × bình luận) và 3 khung giờ nên đăng (mỗi ngày một khung). Ô ít bài được kéo về mức trung bình chung để một bài may mắn không lấn át.
  - Nguồn số liệu:
    - **Chủ / admin community**: số liệu chính thức của Beincom (thành viên và số bài theo ngày).
    - **Admin group**: addon tự tính từ nhật ký hoạt động, bài trên các group bạn quản trị, và số thành viên addon ghi lại sau mỗi lần quét. Biểu đồ số thành viên chỉ có từ ngày cài addon.
- **Thống kê → Báo cáo tháng**: chọn community / group và tháng (tháng này tới hôm nay, hoặc 2 tháng trước), bấm **Tạo báo cáo** (chỉ đọc). So với tháng trước:
  - **Thành viên** đầu → cuối tháng, số người vào / rời (suy ra từ số hiện tại và nhật ký vào / rời — dùng được cả khi chỉ là admin group).
  - **Người mới trong tháng**: còn ở lại bao nhiêu %, tự rời / bị xoá / bị cấm, đã đăng bài, có bình luận, chưa thấy hoạt động.
  - **Bài viết** trong tháng (số do Beincom đếm), lượt xem, cảm xúc, bình luận; **bài nổi bật**, **người đăng tích cực** (đánh dấu người mới).
  - **Kiểm duyệt qua addon** (duyệt / từ chối, ẩn, xoá, cấm, báo cáo đã xử lý — theo nhật ký addon, chỉ các group trong phạm vi), người vi phạm nhiều nhất, bài đăng qua addon và hiệu quả trung bình.
  - **📋 Sao chép**, **Tải tệp .txt** hoặc **Gửi về Telegram** (chat đã cài) để chia sẻ với các admin khác.
  - Đầu tháng (7 ngày đầu, từ 8 giờ sáng ngày 1) addon thông báo nhắc xem báo cáo tháng trước (tắt được ở cài đặt **Báo cáo tháng**; Telegram gửi kèm loại tin "Tóm tắt tuần / báo cáo tháng"). Bấm thông báo thì mở thẳng báo cáo.
- **Thống kê → Thành viên mới có ở lại không?**: chọn community / group và 30 / 60 / 90 ngày, bấm **Phân tích** (chỉ đọc):
  - Số người mới, **còn ở lại** bao nhiêu %, ở lại qua **7 ngày đầu** / **30 ngày đầu** (chỉ tính người đã vào đủ lâu), người rời thường rời sau bao lâu.
  - **Đã đăng bài** (Beincom tìm bài theo người đăng, chỉ bài sau khi vào) và **có bình luận** (trong các bình luận addon đã đọc khi quét); **chưa thấy hoạt động** = còn ở lại nhưng chưa đăng / bình luận.
  - Bảng theo **tuần vào**: số người mới, còn ở lại, có hoạt động.
  - Danh sách từng người (lọc Chưa thấy hoạt động / Có hoạt động / Đã rời) với tình trạng "Tự rời sau 3 ngày", "Bị xoá trong ngày đầu"…; **Xuất CSV**.
  - **✉ Soạn bài nhắc người chưa hoạt động**: điền bài có @tên những người còn ở lại nhưng im lặng (tối đa 50 người được nhắc; bỏ người đã được nhắc trong 30 ngày) vào ô Đăng bài, bạn xem lại rồi Đăng hoặc Hẹn giờ.
  - **Mỗi sáng thứ Hai soạn sẵn bài nhắc** (mặc định tắt, bật cho một group): lần quét tự động sáng thứ Hai đọc người vào trong 30 ngày, chọn người còn ở lại, chưa thấy hoạt động, đã vào ít nhất 3 ngày, chưa được nhắc trong 30 ngày, rồi thông báo. Ô **Bài nhắc tuần này đã soạn sẵn** có **Mở trong ô Đăng bài** / **Bỏ qua tuần này**. Addon không tự đăng.
  - Bài nhắc đăng / hẹn giờ thật được ghi lại (chỉ những người còn được nhắc tên trong bài sau khi bạn sửa). **Hiệu quả các lần nhắc**: bấm **↻ Đo hiệu quả** để đọc (chỉ đọc) bài của người được nhắc từ lúc nhắc, bình luận addon đã thấy, ai đã rời. Người đã được nhắc có dấu **Đã nhắc** trong danh sách.
- **Thống kê → Hiệu quả bài đã đăng qua addon**: mọi bài và Article đăng / hẹn giờ thật qua addon (cả bài định kỳ, nhập CSV) được đo **lượt xem, cảm xúc, bình luận** sau 24 giờ và sau 7 ngày (tự động ở các lần quét), kèm số hiện tại khi bấm **↻ Cập nhật số liệu**. Có trung bình mỗi bài, sắp xếp Mới nhất / Hiệu quả nhất (điểm = cảm xúc + 2 × bình luận), và **giờ đăng hiệu quả theo chính bài của bạn** (từ 3 bài có số liệu). Chỉ đọc; giữ 300 bài gần nhất, không có trong sao lưu.
- **Quy tắc & cài đặt**: quy tắc lọc thành viên, quy tắc bài viết, cài đặt addon (công tắc tổng, chạy thử, thông báo, quét bài mới, quét báo cáo vi phạm, ghi hồ sơ vi phạm, chu kỳ quét, nghỉ giữa hai thao tác, tự xử lý yêu cầu tham gia).
  - **Quy tắc riêng cho từng group**: ở **Áp dụng quy tắc cho**, chọn một group rồi bấm **Dùng quy tắc riêng cho group này**.
    - Addon chép quy tắc đang dùng thành bản riêng; sửa ở hai thẻ quy tắc bên dưới chỉ áp dụng cho group đó.
    - Quy tắc riêng của community (group gốc) dùng luôn cho các group con chưa có quy tắc riêng.
    - Group chưa có quy tắc riêng thì xem được quy tắc đang dùng (chỉ đọc). **Bỏ quy tắc riêng** để quay về quy tắc của community hoặc quy tắc chung.
    - Chấm yêu cầu tham gia, bài chờ duyệt, bài mới, tự xử lý và số trên icon đều theo quy tắc của group. Bài đăng vào nhiều group lấy kết quả nặng nhất.
  - **Gửi thông báo về Telegram** (mặc định tắt): thông báo của addon gửi thêm vào Telegram qua bot của chính bạn, mỗi tin có link mở trên Beincom; vẫn gửi khi đã tắt thông báo trên máy tính.
    - Tạo bot với @BotFather, dán token, bấm **Lấy chat ID** (sau khi đã bấm Start với bot), **Gửi thử**, rồi **Lưu**. Addon xin quyền kết nối `api.telegram.org` lúc bấm (quyền tuỳ chọn, không có khi cài).
    - Chọn loại tin: đợt spam / tự ẩn, báo cáo / gắn cờ, bài / bình luận vi phạm, yêu cầu tham gia / bài chờ duyệt (mặc định tắt), từ khoá / bài bỏ ngỏ, tóm tắt tuần, cần đăng nhập lại. Tuỳ chọn không gửi 23:00 – 7:00 (trừ đợt spam và cần đăng nhập).
    - Token chỉ lưu trong trình duyệt này: không có trong tệp sao lưu, không đồng bộ.
    - **Kèm nút xử lý ngay trong tin** (mặc định tắt): mỗi việc mới là một tin riêng có nút, thay cho tin gộp — tối đa 10 tin mỗi lần quét, còn lại gom thành một tin "còn N việc".
      - Yêu cầu tham gia: **✅ Duyệt / ❌ Từ chối** (kèm câu trả lời câu hỏi gia nhập và gợi ý theo quy tắc). Bài chờ duyệt: **✅ Duyệt bài**. Bài / bình luận vi phạm: **🙈 Ẩn / Bỏ qua** (link cấm / link ngoài ẩn với lý do Spam). Đợt spam: **🙈 Ẩn cả đợt / Bỏ qua đợt**. Tin nào cũng có nút **Mở trên Beincom**.
      - Addon đọc nút bấm mỗi 30 giây khi trình duyệt đang mở, rồi chạy đúng thao tác như bấm trong Dashboard (cùng hàng đợi với lần quét). Đang **Chạy thử** thì chỉ ghi nhật ký và giữ nút để bấm lại. Nhật ký ghi nguồn **Telegram**.
      - Xong thì tin được sửa: thêm dòng kết quả và giờ, bỏ các nút xử lý. Bấm lại, việc đã xử lý trên Dashboard / web, hoặc việc quá 7 ngày đều không làm gì thêm.
      - Chỉ nhận nút bấm trong đúng chat đã cài; nếu chat là nhóm Telegram thì mọi thành viên nhóm đều bấm được.
  - **Đồng bộ giữa các máy** (mặc định tắt): cài đặt, quy tắc chung và riêng, mẫu bài chào / vinh danh đi theo tài khoản Chrome / Edge sang máy khác có cài BeinGroup (chrome.storage.sync). Bật lần đầu mà tài khoản đã có bản đồng bộ từ máy khác thì addon hỏi lấy bản nào.
    - Không đồng bộ: công tắc bật addon, công tắc đồng bộ (thuộc từng máy), mẫu bài đăng, hồ sơ vi phạm. Mục nào quá 8 KB (giới hạn của trình duyệt, vd quy tắc riêng của rất nhiều group) thì bỏ qua và ghi rõ — dùng Sao lưu.
  - **Sao lưu cài đặt**: **Tải bản sao lưu** tạo tệp JSON gồm cài đặt, quy tắc (chung và riêng), mẫu bài, kho câu hỏi thảo luận; tuỳ chọn kèm hồ sơ vi phạm và **lịch sử số liệu** (hiệu quả bài, các lần nhắc người mới, số thành viên theo ngày, nhật ký thao tác — khôi phục thì gộp với dữ liệu đang có, dữ liệu trong máy được ưu tiên khi trùng). Không chứa mật khẩu hay phiên đăng nhập.
    - **Khôi phục từ tệp…**: hộp xác nhận ghi rõ các mục sẽ thay; hồ sơ vi phạm thì gộp thêm, không trùng.
    - Bản sao lưu đang tắt Chạy thử thì addon hỏi có giữ Chạy thử không (mặc định giữ). Tệp lạ / sai kiểu bị bỏ qua.
- **Theo dõi** (Cài đặt → 🔔 Theo dõi):
  - **Từ khoá cần để ý** (không phải vi phạm, vd "lừa đảo", "mất tiền", tên dự án): bài / bình luận mới nhắc tới thì có thông báo và hiện ở Việc cần làm (trong 3 ngày) với nút Bình luận / Trả lời / Bỏ qua.
  - **Nhắc bài chưa ai trả lời**: bài của thành viên quá số giờ đã chọn mà chưa có bình luận thì thông báo, mỗi bài một lần.
  - **Nhắc việc chờ lâu** (mặc định bật, 24 giờ; chọn 6 / 12 / 24 / 48 giờ): yêu cầu tham gia và bài chờ duyệt đã chờ quá số giờ thì thông báo một lần (kèm Telegram, loại "Yêu cầu tham gia, bài chờ duyệt…"), bấm mở Việc cần làm lọc sẵn **Chờ lâu**. Việc quá hạn có nhãn ⏳ chờ X giờ / ngày. Việc đã xử lý (kể cả trên web) tự rơi khỏi danh sách.
- **Nhật ký**: mọi thao tác (bấm tay, tự động, chạy thử, lỗi) kèm lý do và giờ đăng; lọc theo thành viên / bài viết; xuất CSV hoặc JSON.
- **Nhật ký → Tự kiểm tra**: chọn community / group, bấm **▶ Chạy kiểm tra**. Addon gọi thử (chỉ GET, khoảng 5–20 giây) khoảng 20 API đọc mà các tính năng dùng: đăng nhập, quyền, thông tin group, yêu cầu tham gia, thành viên, nhật ký (cả theo ngày), bài mới, tìm bài theo thời gian, bình luận, bài chờ duyệt, báo cáo, bài gắn cờ, bài hẹn giờ, tag và quyền tag, series, chuyên mục Article, tìm người để nhắc tên, bài ghim, cài đặt group, danh sách bị cấm, thống kê chính thức, bot Telegram (`getMe`, không gửi tin).
  - Mỗi mục: **Dùng được** (kèm số liệu ngắn), **Bỏ qua** (tài khoản không có quyền / chưa bật — tính năng tương ứng sẽ ẩn) hoặc **Lỗi** (Beincom trả dữ liệu khác trước, 404, không kết nối…). Không ghi vào Lỗi kỹ thuật.
  - **Tự kiểm tra mỗi ngày** (công tắc trong thẻ, mặc định bật): lần quét tự động thành công đầu tiên mỗi ngày kiểm tra mọi community đang quản trị (tối đa 5), so với lần trước (khoá `selfCheckAuto`) và chỉ thông báo khi một mục hôm trước **Dùng được** nay **Lỗi** (loại tin Telegram "Tự kiểm tra: tính năng ngừng chạy"); bấm thông báo mở tab Nhật ký, thẻ hiện luôn kết quả đó. Lần đầu chỉ ghi mốc.
  - **📋 Sao chép kết quả** hoặc **Gửi về Telegram** (chat đã cài): bản chữ kèm phiên bản addon, trình duyệt, mã HTTP và đường dẫn API của mục lỗi. Kết quả lần gần nhất lưu ở khoá `selfCheck`.
- **Việc đầu tuần**: lần quét có từ 2 việc định kỳ trở lên (tóm tắt tuần, nhắc chào thành viên mới, bài nhắc người mới, bài thảo luận, báo cáo tháng) thì gộp **một** thông báo và một tin Telegram (loại "Tóm tắt tuần / báo cáo tháng"); chỉ một việc thì thông báo như cũ. Ô **Việc đầu tuần** đầu tab Tổng quan (khoá `periodicDigest`, hiện 7 ngày) có nút mở thẳng từng việc, đánh dấu đã làm, **Ẩn**.
- **Mục lục nhanh, thu gọn thẻ**: tab có từ 4 thẻ có hàng nút tên thẻ ở đầu (bấm là tới thẻ, thẻ đang thu gọn thì mở ra), **Thu gọn tất cả / Mở tất cả**. Mỗi thẻ có nút ▾ thu gọn chỉ còn tiêu đề; nhớ trên trình duyệt này (localStorage).
- **Nhật ký → Báo cáo sử dụng**: addon đếm trong máy số lần dùng từng tính năng mỗi ngày (khoá `usage`, 60 ngày, chỉ loại lệnh). Báo cáo 30 ngày gồm: phiên bản, trình duyệt, số ngày có dùng, số community / group (không tên), cài đặt đang bật, tính năng dùng nhiều, số thao tác (tự động / Telegram / bấm tay / lỗi), lỗi kỹ thuật (đường dẫn đã bỏ id), kết quả tự kiểm tra gần nhất, ghi chú tuỳ chọn. Không có tên group, tên thành viên, nội dung bài. **Sao chép**, **Gửi về Telegram** hoặc **Tải tệp .txt** rồi tự gửi tác giả.
  - **Tự gửi mỗi tuần (chỉ khi admin đồng ý)**: gói addon có nơi nhận (Google Apps Script của tác giả, `tools/usage-collector.gs`, gắn khi đóng gói) thì lần đầu mở Dashboard — hoặc ở bước 3 của Bắt đầu nhanh (mặc định không tick) — addon hỏi một lần, kèm xem trước đúng nội dung sẽ gửi. Đồng ý: xin quyền gọi `script.google.com` / `script.googleusercontent.com` (quyền tuỳ chọn), tạo mã cài đặt ngẫu nhiên, gửi lần đầu, sau đó 7 ngày một lần sau lần quét tự động (lỗi thì thử lại sau 1 ngày; khoá `usageConsent`, `usageSent`). Bật / tắt và **Gửi ngay** ở thẻ Báo cáo sử dụng. Gói không có nơi nhận thì không hỏi, không gửi.
- **Bắt đầu nhanh**: lần đầu mở Dashboard sau khi cài (chưa có nhật ký, chưa xem "Có gì mới") hiện hướng dẫn 3 bước: (1) kết nối Beincom — thấy bao nhiêu group, Mở Beincom / Quét lại; (2) Tự kiểm tra một community; (3) chọn tính năng (tóm tắt / báo cáo, tự kiểm tra mỗi ngày, nhắc chào, bài nhắc người mới, bài thảo luận, tự ẩn spam, tự duyệt) và có giữ Chạy thử không (bật sẵn), chọn group cho bài nhắc / bài thảo luận. Mở lại ở chân trang (**Bắt đầu nhanh**).
- **Có gì mới**: sau khi cập nhật addon, lần đầu mở Dashboard hiện các mục mới của `CHANGELOG.md` (từ bản đã xem tới bản đang chạy, tối đa 5 bản); bấm **Có gì mới** ở chân trang để xem lại 3 bản gần nhất. Cài mới thì không hiện. Bản đã xem lưu ở khoá `seenVersion`.
  - **Lỗi kỹ thuật**: addon tự ghi lỗi JavaScript (nền, Dashboard, cửa sổ nhỏ) và lỗi Beincom trả về khi gọi API (đường dẫn, mã HTTP, mã lỗi, câu báo). Lỗi giống nhau trong 30 phút gộp một dòng (×N), giữ 200 dòng. Bấm **Sao chép báo cáo** để dán cho người hỗ trợ (kèm phiên bản addon và trình duyệt). Không ghi nội dung bài, body gửi đi, mật khẩu hay token (token Telegram trong đường dẫn bị che); hết phiên đăng nhập (401) và bài đã bị xoá trên web không tính là lỗi. Lệnh nào hỏng giữa chừng thì Dashboard nhận câu báo "Lỗi trong addon … — xem Nhật ký → Lỗi kỹ thuật" thay vì chờ mãi. Chỉ lưu trong máy, không có trong sao lưu.
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
| **Cần xem** | Không có ảnh đại diện, chưa trả lời câu hỏi bắt buộc, câu trả lời ngắn hơn số ký tự tối thiểu, chưa xác minh (nếu bật), hoặc **có hồ sơ vi phạm** (từng bị cấm, xoá, ẩn bài… — nên người có hồ sơ không bao giờ được tự duyệt) |
| **Gợi ý duyệt** | Đạt mọi quy tắc |

**Username luôn duyệt** và **Username luôn từ chối** thắng mọi quy tắc khác.

## Quy tắc bài viết
Dùng chung cho Duyệt bài, Bài mới đăng và Bình luận:

| Mức | Khi nào |
|---|---|
| **Gợi ý từ chối** / **Vi phạm** | Bài (cả link xem trước) chứa **từ khoá cấm**, hoặc có link tới **tên miền cấm**. Tên miền con cũng tính: cấm `t.me` thì chặn cả `www.t.me`. |
| **Cần xem** | Chứa **từ khoá cần xem**; có **liên hệ riêng** (khi bật: số điện thoại Việt Nam, link Zalo / Telegram / WhatsApp); có link ra ngoài các **tên miền cho phép** (khi bật, mặc định cho phép `beincom.com`) |
| **Gợi ý duyệt** / **Không vi phạm** | Không dính quy tắc nào |

Addon nhận ra link dạng `https://…`, `www.…` và tên miền trần có đuôi phổ biến (`t.me/…`, `bit.ly/…`, `abc.vn`…). Đổi quy tắc là đánh giá cập nhật ngay, không cần quét lại.

- **🛡 Bộ mẫu chống lừa đảo** (thẻ "Áp dụng quy tắc cho"): gộp vào quy tắc đang sửa (chung, hoặc riêng group đang chọn) — 14 từ khoá vi phạm (gửi trước nhận sau, cam kết lợi nhuận, claim airdrop tại, đồng bộ ví…), 25 từ khoá cần xem (inbox, kèo vip, x100, seed phrase, private key… — hay có cả trong bài cảnh báo nên chỉ Cần xem), bật Liên hệ riêng; link rút gọn (bit.ly, tinyurl.com…) vào tên miền cấm là tuỳ chọn, mặc định không chọn vì có thể bị Tự ẩn spam. Hộp xem trước cho bỏ phần, sửa danh sách và báo bao nhiêu bài / bình luận gần đây sẽ thành Vi phạm / Cần xem; chỉ thêm mục chưa có.
- **Xuất quy tắc**: tệp JSON (cùng định dạng sao lưu) chỉ có quy tắc thành viên, quy tắc bài viết và quy tắc riêng từng group — gửi admin khác, họ bấm **Nhập quy tắc…** (như Khôi phục: xem trước, thay quy tắc hiện tại).

## Tự xử lý (mặc định tắt)
Dashboard → Cài đặt có ba tuỳ chọn, chạy sau mỗi lần quét khi addon đang bật:
- **Tự duyệt "Gợi ý duyệt"** (yêu cầu tham gia)
- **Tự từ chối "Gợi ý từ chối"** (yêu cầu tham gia)
- **Tự duyệt bài của thành viên tin cậy**: bài chờ duyệt **đạt mọi quy tắc bài viết** của người trong danh sách **Thành viên tin cậy**, hoặc (tuỳ chọn) người đã được duyệt ít nhất 3 / 5 / 10 bài qua addon (Dashboard, Telegram, tự duyệt) và chưa bị từ chối bài nào. Người có hồ sơ vi phạm không bao giờ được tự duyệt. Tối đa 20 bài mỗi lần quét. Ở hàng chờ duyệt bài: nhãn **⭐ Tin cậy**, nút **⭐** để thêm người đăng vào danh sách.
- **Tự ẩn spam có link cấm**: bài và bình luận **mới** (chưa thấy ở lần quét trước) có link tới **Tên miền cấm** của quy tắc bài viết (chung hoặc riêng của group) bị ẩn với lý do Spam.
  - Chỉ xét tên miền cấm; dính từ khoá cấm hay link ngoài thì vẫn chờ bạn xử lý.
  - Không ẩn bài / bình luận của chính bạn; tối đa 20 mục mỗi lần quét; lần đầu quét (hoặc lần đầu đọc bình luận) chỉ ghi nhận.
  - Nhật ký ghi "Addon tự xử lý" kèm tên miền; người bị ẩn được ghi vào hồ sơ vi phạm; có thông báo số mục đã ẩn.

"Cần xem" không bao giờ tự xử lý. Bài chờ duyệt không bao giờ tự duyệt hay từ chối. Khi bật Chạy thử, mỗi mục chỉ được ghi nhật ký một lần. Bật tự xử lý lúc đã tắt Chạy thử (hoặc ngược lại) đều phải xác nhận lại.

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
    - `GET content/manage/communities/{groupId gốc}/content-reports/count` cho community bạn làm chủ / admin; chỉ khi khác 0 mới đọc `…/content-reports?limit=25` (chờ tối đa 15 giây)
  - Hồ sơ vi phạm (nếu bật **Ghi hồ sơ vi phạm**): `GET group/groups/{id}/activity-logs?limit=50&page=1&sort=desc` cho mọi group đang quản trị
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
- **Bị cấm / gỡ cấm**: `GET group/communities/{communityId}/banned-members?limit&offset`; gỡ: `POST group/communities/{communityId}/users/{userId}/unban` với `{ community_id, user_id }`.
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
- **Bình luận**: `GET content/comments?postId=…&limit=25` (bình luận gốc, mới nhất trước); trả lời: thêm `parentId={id bình luận}`; ẩn: `POST content/comments/{id}/hide` với `{ reasonType }`; viết: `POST content/comments` hoặc `POST content/comments/{id}/reply` với `{ postId, content, media, mentions }`.
- **Người mới**: group gốc `GET group/manage/communities/{communityId}/members?sort=joined_at:desc` (dừng khi gặp người vào trước khoảng ngày); group con `GET group/groups/{id}/activity-logs` (sự kiện vào / rời).
- **Đăng dưới tên group**: bản nháp tạo bằng `POST content/manage/groups/{groupId}/posts` thay cho `POST content/posts`, các bước sau như bài thường.
- **Bài đã hẹn giờ**: `GET content/manage/groups/{groupId gốc}/contents/scheduled?type=POST` và `type=ARTICLE`; đổi giờ: `PUT content/contents/{id}/reschedule`; huỷ: `DELETE content/posts/{id}` (Article: `DELETE content/articles/{id}`).
- **Article**: chuyên mục `GET content/category?name=`; ảnh bìa tải như ảnh bài viết với `resource: 'article:cover'`; `POST content/articles` (hoặc `content/manage/groups/{groupId}/articles` khi đăng dưới tên group) tạo nháp → `PUT content/articles/{id}/publish` hoặc `/schedule` với `{ audience: { groupIds, userIds }, categories, series, tags, title, summary, coverMedia: { id }, content, mentions, wordCount, scheduledAt? }`. `content` là chuỗi JSON các khối của trình soạn thảo (`p`, `h1`–`h3`, `ul`/`ol` > `li` > `lic`, `blockquote`, `hr`, `a { url }`, `media_embed { url }`; chữ đậm / nghiêng… là thuộc tính của đoạn chữ; mỗi khối có `id` 21 ký tự). Bước sau lỗi thì xoá nháp.
- **Series**: ảnh bìa với `resource: 'series:cover'`; `POST content/series` (hoặc `content/manage/groups/{groupId}/series`) với `{ title, summary, setting: { isImportant, importantExpiredAt, canComment, canReact, canShare }, coverMedia: { id }, audience: { groupIds } }`.
- **Cài đặt group**: đọc `GET group/groups/{id}/settings`; đổi `PUT group/groups/{id}/settings` với một khoá snake_case (vd `{ id, is_join_approval: false }`); Duyệt bài: `PUT group/communities/{communityId}/content-settings` với `{ group_id, content_approval: { value }, is_update_all: false }`. Quyền lấy từ `group/me/permissions` (`edit_join_setting`, `edit_privacy`).
- **Ghim**: `GET content/contents/pinned-content/groups/{groupId}`; ghim / bỏ ghim: `PUT content/contents/pinned-content/{contentId}` với `{ pinGroupIds, unpinGroupIds }` (kiểm tra giới hạn 5 bài trước).
- **Cài đặt bài**: `PUT content/contents/{id}/setting` với `{ canComment, canReact, isImportant, importantExpiredAt }`.
- **Dọn tài khoản**: ẩn từng bài `POST content/contents/{id}/hide` và bình luận `POST content/comments/{id}/hide` như Ẩn thường, cấm như Cấm ở mọi community; chạy lần lượt trong một lần.
- **Tìm bài cũ của một người / Tìm & dọn bài** (chỉ đọc, như trang Tìm kiếm của web): `GET content/contents?actors[]=<id>&groupId=<group gốc>&isIncludedInnerGroups=true&limit=25&after=…` hoặc `…?keyword=<từ khoá>&groupId=…&startTime=<ISO>…` (kết quả không có bài đã ẩn); admin group để đánh dấu giữ: `GET group/groups/{id}/users?limit=100&offset=0`. Ẩn như Ẩn bài.
- **Hiệu quả bài**: `GET content/contents/{id}` → `totalUsersSeen` (lượt xem), `reactionsCount`, `commentsCount`, `publishedAt`; bài đã xoá thì đánh dấu, bài chưa tới giờ thì theo giờ hẹn mới.
- **Quản lý tag**: đọc `GET content/tags?groupIds[]=<group gốc>&offset=…`, quyền `GET group/me/permissions/can-cud-tags/community/{communityId}`; tạo `POST content/tags` với `{ name, groupId }`, đổi tên `PUT content/tags/{id}` với `{ name }`, xoá `DELETE content/tags/{id}`. Xem bài theo tag: `https://group.beincom.com/search?tags=["TÊN"]&group={…}`.
- **Sửa bài hẹn giờ**: đọc `GET content/contents/{id}` (bài của mình, trạng thái `WAITING_SCHEDULE` / `SCHEDULE_FAILED`); lưu bằng `PUT content/posts/{id}/schedule` với đủ body như lúc hẹn giờ (nội dung, file, cài đặt, `scheduledAt` mới) — web cũng sửa bài hẹn giờ như vậy.
- **Article: ảnh, bảng, nhắc tên**: ảnh tải với `resource: 'article:content'`, khối `{ type: 'img', url }`; bảng `table > tr > th/td > p`; nhắc tên `{ type: 'mention', value: username, data: { id, avatar, name, fullname, username } }` và `mentions: { username: data }` trong body (cấu trúc ảnh và bảng đối chiếu với Article có sẵn; nhắc tên đọc từ mã web).
- **Sửa bài đã đăng**: đọc `GET content/contents/{id}`; lưu `PUT content/posts/{id}` với `{ audience, content, media, mentions, linkPreview, tags, series }` (như web, không kèm setting; không còn link thì gửi `{ domain: '', url: '' }` để xoá thẻ cũ); cài đặt đổi thì gọi thêm API cài đặt.
- **Xoá bài của mình**: `DELETE content/posts/{id}`. Addon biết bài nào của bạn nhờ `GET user/me/profile`, gọi không kèm header phiên bản.
- **Thống kê** (đọc khi mở tab):
  - `GET group/manage/communities/{communityId}/stats/member-count` và `GET content/stats/communities/{groupId gốc}/contents/daily-counts`: số liệu chính thức cho chủ / admin community.
  - Không có số liệu chính thức thì addon tự tính từ `activity-logs` (tối đa 6 trang × 50 sự kiện), `content/timeline` (tối đa 8 trang × 20 bài mỗi group) và số thành viên ghi sau mỗi lần quét (giữ 120 ngày).
- **Báo cáo tháng, thành viên mới có ở lại không** (đọc khi bấm nút, gọi thật 11/10 ở Crypto Life — số người vào trong tháng 9 khớp danh sách thành viên):
  - Nhật ký thành viên: `GET group/groups/{id}/activity-logs?limit=100&page=…&sort=desc&objectType=MEMBER&from=<ms>&to=<ms>` (tối đa 20 trang); sự kiện vào (`join.community.as_member`, `join.group.as_member`, `approve.join_request`, `accept.invitation`), rời (`leave.group`), bị xoá (`remove.member`), bị cấm (`ban.member`).
  - Bài trong tháng: `GET content/contents?groupId=…&isIncludedInnerGroups=true&startTime=<ISO>&endTime=<ISO>&limit=25&after=…` (API của trang Tìm kiếm; `meta.total` là số bài, đọc tối đa 8 trang để tính tương tác). Thời gian phải là ISO (số ms bị từ chối).
  - Tự kiểm tra gọi đúng các đường dẫn trên với `limit=1` (đối chiếu thật 11/10 ở Crypto Life với tài khoản admin group: 22 đường dẫn, 19 trả đúng dạng; `banned-members`, `stats/member-count` trả 403 và `content-reports/count` trả `400 community.not_admin` — đều tính là Bỏ qua).
  - Bài của người mới: thêm `actors[]=<id>` (tối đa 20 người mỗi lần — URL dài hơn bị chặn; `actors=` không có `[]` thì Beincom bỏ qua), tối đa 400 người mới nhất.
- Thao tác hàng loạt chạy từng mục một, nghỉ 1–5 giây giữa hai mục (chỉnh được).
- **Tốc độ**: một lần quét ~5–6 giây với 5 group (trước ~23 giây):
  - Các group, bài mới, chi tiết bài chờ duyệt, bài hẹn giờ, tag / series, thống kê đọc song song, tối đa 4 lệnh cùng lúc (không dồn quá nhiều vào Beincom).
  - Báo cáo: hỏi Beincom **số báo cáo chờ xử lý** trước (`content-reports/count`, dưới 1 giây); bằng 0 thì không gọi API danh sách vốn treo 15–25 giây ở community chưa có báo cáo.
- Lệnh đọc gặp lỗi tạm thời ở máy chủ Beincom (HTTP 502 / 503 / 504) được thử lại tối đa 2 lần (cách 1,5 rồi 3 giây); vẫn lỗi thì báo "Máy chủ Beincom không phản hồi kịp", lần quét sau tự đọc lại. Lệnh ghi không tự thử lại để tránh làm hai lần.
- API nội dung (`content/…`) của Beincom chỉ nhận tối đa 25 mục mỗi trang; addon đọc nhiều trang khi cần. API nhóm (`group/…`) nhận 50–100.
- Xoá / ẩn / duyệt / huỷ hẹn giờ một bài mà Beincom báo "Content not found" (bài đã bị xoá trên web): addon tính là xong, bỏ bài khỏi danh sách và ghi "Bài không còn trên Beincom" vào nhật ký.
- **Telegram**: `sendMessage` (tin, kèm `reply_markup.inline_keyboard` khi bật nút xử lý; nút mang mã `token:act` ≤ 64 byte, việc tương ứng lưu ở khoá `tgActions` 7 ngày), `getUpdates` (Lấy chat ID; đọc nút bấm với `allowed_updates: ["callback_query"]` và `offset` lưu ở `telegramPoll`, alarm 30 giây chỉ khi bật), `answerCallbackQuery`, `editMessageText`.
- **Xác thực**: header `x-application: BIC_GROUP`, `x-platform: WEB`, cookie của beincom.com. Gọi trực tiếp bị chặn thì addon mở tạm một tab Beincom ở nền rồi gọi trong tab đó, giống addon Beincom Check-in.

## Cấu trúc mã
- `background.js` + `bg/`: service worker — quét, gọi API Beincom, thông báo, huy hiệu, mọi thao tác ghi (chạy lần lượt, có chạy thử).
- `common.js` + `lib/`: hàm thuần dùng chung (không gọi `chrome.*` hay mạng), gom trong đối tượng `BG`, có test riêng.
  - `common.js`: lõi — hằng số, cài đặt mặc định, tiện ích, quyền, đường dẫn; tạo `BG` và liệt kê các phần ở `BG.PARTS`.
  - `lib/content.js` (bài viết, bình luận, quy tắc bài, báo cáo, nhắc tên / link, spam), `lib/members.js` (yêu cầu tham gia, hồ sơ vi phạm, chào / vinh danh), `lib/compose.js` (kiểm tra và body bài đăng, đính kèm, tag / series, bài định kỳ, giờ đăng tốt nhất, lịch, nhập CSV, sửa bài, xem trước markdown), `lib/article.js` (Article, Series), `lib/manage.js` (cài đặt group, tag, sao lưu), `lib/reports.js` (tóm tắt tuần, thống kê, hiệu quả bài, người mới, báo cáo tháng), `lib/telegram.js`, `lib/diag.js` (lỗi kỹ thuật).
  - Nạp `common.js` trước rồi `lib/*.js` theo đúng thứ tự `BG.PARTS` (background.js đọc `BG.PARTS`; dashboard.html, popup.html liệt kê sẵn — có test kiểm tra khớp). Mỗi phần lấy hàm của phần nạp trước qua `const { … } = BG` và gắn hàm của mình vào `BG`; trong Node, `require('./common.js')` tự nạp đủ các phần.
- `upload.js`: tải ảnh / video / tệp từ trang Dashboard. `charts.js`: biểu đồ SVG của tab Thống kê.
- `dashboard.html` + `dashboard.css` + script theo tab trong `dash/`, nạp theo thứ tự cuối `dashboard.html` (script thường, dùng chung phạm vi toàn cục):
  - `core.js` (dữ liệu, tiện ích, hộp xác nhận, gửi thao tác, chuyển tab), `ui.js` (ô người dùng / bài dùng ở nhiều tab)
  - `todo.js` (hộp Việc cần làm), `overview.js`, `members.js`, `content.js` (gồm Dọn tài khoản, lọc) + `sweep.js` (Tìm & dọn bài) + `tags.js` (Quản lý tag), `reports.js`, `compose.js` + `attach.js` (đính kèm, nhắc tên, link, tag) + `calendar.js` (lịch nội dung, nhập CSV) + `article.js` (Article & Series) + `welcome.js` (chào thành viên mới) + `shoutout.js` (vinh danh) + `prompts.js` (bài thảo luận hằng tuần), `stats.js` + `monthly.js` (Báo cáo tháng) + `retention.js` (Thành viên mới có ở lại không) + `insights.js` (Hiệu quả bài đã đăng), `settings.js` + `presets.js` (bộ quy tắc mẫu, xuất / nhập quy tắc), `log.js` + `selfcheck.js` (Tự kiểm tra), `whatsnew.js` (Có gì mới), `onboarding.js` (Bắt đầu nhanh), `digest.js` (Việc đầu tuần), `usage.js` (Báo cáo sử dụng), `layout.js` (mục lục nhanh, thu gọn thẻ)
  - `dashboard.js` nạp cuối: sự kiện chung, vẽ lại toàn trang, nạp dữ liệu.
- `background.js` (service worker) chỉ lo lịch chạy, sự kiện và nhận lệnh; phần còn lại trong `bg/` nạp bằng `importScripts`: `core.js` (gọi API, thao tác ghi, thông báo, hồ sơ vi phạm, hàng đợi), `scan.js` (quét, tự ẩn, đợt spam), `actions.js` (thao tác thành viên / bài / bình luận), `compose.js` (đăng bài, file, ghim, sửa bài), `article.js` (Article, Series, chuyên mục), `manage.js` (cài đặt group, sao lưu, thống kê, báo cáo), `sync.js` (đồng bộ cài đặt giữa các máy), `telegram.js` (gửi thông báo về Telegram, nút xử lý trong tin), `insights.js` (đo hiệu quả bài đã đăng; đọc số liệu cho báo cáo tháng, thành viên mới, nhắc người mới), `selfcheck.js` (Tự kiểm tra).
- `popup.html` / `popup.js`: cửa sổ nhỏ khi bấm icon.
- `CHANGELOG.md` (có gì mới từng bản, Dashboard đọc để hiện sau khi cập nhật), `HUONG-DAN-CAI.html` (hướng dẫn cài cho người nhận gói), `tools/pack.mjs` (đóng gói `.zip`), `tools/usage-collector.gs` + `tools/HUONG-DAN-THU-THAP.md` (nơi nhận báo cáo sử dụng của tác giả).
- `test/`: kiểm thử hàm thuần và service worker (`*.test.js`), addon thật (`e2e/`), giao diện với dữ liệu mẫu (`ui/`: `stub.js` giả `chrome.*` và service worker, `harness.mjs` điều khiển Chrome, `scenarios.mjs` các kịch bản, `run.mjs` chạy).

## Kiểm thử
```
node --test "test/*.test.js"
```
Kiểm thử trên addon thật (cần Google Chrome; đặt `CHROME_PATH` nếu cài chỗ khác):
```
node test/e2e/addon.e2e.mjs
```
- Thêm đường dẫn một thư mục để thử addon ở đó (vd. bản giải nén từ `dist/*.zip`).
- Nạp addon vào Chrome headless bằng CDP (`Extensions.loadUnpacked`), kiểm tra service worker có đủ hàm, nạp dữ liệu mẫu (qua hàng đợi của service worker), mở **Dashboard thật** đi qua cả 8 tab và **popup thật**, báo lỗi JavaScript ở mọi trang. Không đăng nhập Beincom, không thao tác gì lên tài khoản.

Kiểm thử giao diện (cần Google Chrome, khoảng 20 giây):
```
node test/ui/run.mjs
```
- Mở Dashboard / popup thật với dữ liệu mẫu (`test/ui/stub.js` thay `chrome.*` và service worker) rồi bấm như người dùng, kiểm tra kết quả: mọi tab hiện được, popup, đăng bài có nhắc tên, giờ đăng tốt nhất, lịch tháng / tuần, nhập CSV, trình soạn thảo Article, Article hẹn giờ và Series, sửa bài hẹn giờ, thành viên tin cậy, quản lý tag, lọc bài và dọn tài khoản (tick từng mục, tự tìm bài cũ), Tìm & dọn bài (không chọn sẵn, giữ bài của mình / admin, chọn tất cả, ẩn), bộ mẫu chống lừa đảo (bỏ phần, sửa danh sách, ảnh hưởng, chỉ thêm mục mới) và xuất quy tắc, việc chờ lâu (nhãn ⏳, bộ lọc, mở từ thông báo, đổi số giờ), hiệu quả bài, Telegram có nút, việc cần làm, lỗi kỹ thuật (sao chép báo cáo, ghi lỗi trang, xoá), báo cáo tháng (số liệu, sao chép, gửi Telegram, mở từ thông báo), thành viên mới có ở lại không (ô số liệu, lọc, soạn bài nhắc), mở từ thông báo việc đầu tuần, có gì mới sau khi cập nhật, tự kiểm tra (kết quả, sao chép, gửi Telegram, công tắc mỗi ngày), bài thảo luận hằng tuần (bản soạn sẵn, đổi câu, hẹn giờ theo gợi ý, soạn ngay, sửa kho, bật hằng tuần), bắt đầu nhanh khi cài mới, việc đầu tuần (mở từng việc, đánh dấu, ẩn), mục lục nhanh và thu gọn thẻ (nhớ sau khi mở lại), báo cáo sử dụng (ẩn danh, ghi chú, sao chép, Telegram; hỏi ý với xem trước, đồng ý thì xin quyền và gửi, tắt, không đồng ý thì không gửi; Bắt đầu nhanh mặc định không tick), nhắc người mới (bản soạn sẵn, soạn hằng tuần, đăng kèm danh sách người được nhắc, đo hiệu quả, bỏ qua), màn hình điện thoại 390px không tràn ngang. Lỗi JavaScript trong trang làm kịch bản trượt.
- Chạy một phần: `node test/ui/run.mjs tag` (kịch bản có chữ "tag" trong tên). Thêm `--keep` để giữ trang xem thử ở `test/preview/` (mở tay bằng trình duyệt) kèm ảnh chụp kịch bản lỗi.
- `test/common.test.js`: quy tắc thành viên và bài viết (chung / riêng từng group), nhận link, quyền, đường dẫn, xuất CSV, xem trước markdown (an toàn với HTML), ghép số liệu thống kê, lịch bài định kỳ, đọc / làm sạch tệp sao lưu, bình luận (thu gọn, chọn bài cần đọc, gộp), tóm tắt tuần, phát hiện đợt spam, nhắc tên trong bình luận, tháng theo giờ Việt Nam và nhắc báo cáo đầu tháng, người mới (gộp sự kiện trùng, tự rời / bị xoá / bị cấm / vào lại, ở lại qua 7 / 30 ngày, hoạt động sau khi vào, theo tuần), số thành viên đầu / cuối tháng suy từ nhật ký, báo cáo tháng (phạm vi group, bản chữ), bài chưa ai trả lời, bài chào thành viên mới, thành viên tin cậy (danh sách / số bài được duyệt, đếm từ nhật ký), tên tag (viết hoa, độ dài, trùng), quyền quản lý tag, link tìm bài theo tag, dọn tài khoản và lọc (@tên, #tag, chữ không dấu), hiệu quả bài (số liệu, mốc cần đo, tổng hợp, giờ đăng hiệu quả), giờ đăng tốt nhất, lưới lịch tháng, đọc CSV (dấu phẩy / chấm phẩy, ngoặc kép, xuống dòng trong ô, giờ Việt Nam, bỏ ngày không có thật, tên group trùng, tệp mẫu đọc lại được), Markdown → nội dung Article (các khối, định dạng chữ, link có chữ hai bên, bảng, ảnh, nhắc tên chỉ người đã chọn, xem trước an toàn), kiểm tra và body Article / Series, nút xử lý trong tin Telegram (bàn phím, mã nút ≤ 64 byte, nội dung tin an toàn, kết quả, dọn việc cũ), lỗi kỹ thuật (che token / mật khẩu, rút gọn stack, gộp lỗi giống nhau kể cả khác id, giới hạn số dòng, báo cáo sao chép), có gì mới (so sánh phiên bản, tách mục CHANGELOG, CHANGELOG có mục cho bản trong manifest), nhắc người mới (chọn người, ghi lần nhắc, đo hiệu quả), bài thảo luận (chọn câu xoay vòng, sửa kho giữ lịch sử, giờ gợi ý, hiệu quả từng câu, sao lưu), tự kiểm tra mỗi ngày (mục ngừng chạy), sao lưu kèm lịch sử số liệu (làm sạch, gộp), báo cáo sử dụng (đếm theo ngày, ẩn danh), thứ tự nạp `common.js` + `lib/*.js` khớp ở mọi nơi.
- `test/collector.test.js`: mã Google Apps Script nhận báo cáo sử dụng (tiêu đề một lần, mỗi báo cáo một dòng, mỗi máy tối đa một lần / 6 giờ, từ chối dữ liệu sai dạng, ô không thành công thức, cắt độ dài).
- `test/upload.test.js`: luồng tải ảnh / video / tệp với kho lưu trữ giả lập (thứ tự trường, lỗi S3, không đọc được phản hồi, tệp kèm cookie, hết phiên).
- `test/background.test.js`: chạy `background.js` thật với `chrome.*` và API Beincom giả lập. Kiểm tra:
  - Quét, thông báo, chạy thử, hết phiên đăng nhập, phân trang
  - Duyệt / từ chối thành viên và bài (đúng body), lỗi, tự xử lý
  - Tải chi tiết bài chờ duyệt, gộp bài mới, ẩn bài, bỏ qua
  - Danh sách thành viên (phân trang, tìm, sắp xếp), nhật ký vào/rời, xoá / gán admin / cấm (đúng body), quyền
  - Đăng ngay, hẹn giờ (đúng body), kiểm tra trước khi đăng, xoá nháp khi lỗi, đổi giờ, huỷ
  - Bài định kỳ: mỗi bài một lần hẹn giờ đúng giờ, nhật ký ghi thứ tự, huỷ cả chuỗi một lần (bỏ trùng), đổi giờ vẫn chỉ một bài
  - Quy tắc riêng từng group: tự xử lý và số trên icon theo quy tắc của group (quy tắc của community áp cho group con), bỏ quy tắc riêng thì đếm lại
  - Khôi phục sao lưu: ghi đúng các mục, giữ Chạy thử khi chọn, gộp hồ sơ không trùng, không gọi Beincom
  - Quét bình luận: chỉ đọc bài có bình luận mới, lần đầu chỉ ghi nhận, lần sau báo bình luận vi phạm, đếm vào icon, ghi hồ sơ, tắt thì không đọc; ẩn đúng API / body, chạy thử không gửi, bình luận đã xoá tính là xong
  - Đăng dưới tên group: nháp qua API quản trị group rồi đăng như thường, chỉ một group, cần quyền, Beincom chưa bật thì báo rõ
  - Tự ẩn spam: chỉ mục mới có tên miền cấm (không xét từ khoá), bỏ qua bài của mình, lần đầu chỉ ghi nhận, chạy thử chỉ ghi nhật ký, tắt thì không làm gì
  - Đợt spam: báo một lần mỗi đợt, ẩn cả đợt (bài + bình luận), bỏ qua / hiện lại; cấm ở mọi community đúng API và body
  - Viết bình luận / trả lời: đúng API và body, nhật ký ghi id bình luận mới, hiện ngay trong danh sách, chạy thử không gửi, báo lỗi rõ
  - Tìm người mới: group gốc đọc danh sách thành viên theo ngày vào (bỏ admin), group con đọc nhật ký (bỏ người đã rời), chỉ đọc
  - Theo dõi từ khoá: chỉ báo bài / bình luận mới (không phải của mình, lần đầu quét chỉ ghi nhận); nhắc bài chưa ai trả lời mỗi bài một lần, theo số giờ trong cài đặt
  - Bị cấm: danh sách phân trang, gỡ cấm đúng API và body, admin group bị từ chối
  - Cài đặt group: quyền theo lần quét, đọc nhiều group, bật / tắt hàng loạt đúng API và body, duyệt bài cần admin community, chạy thử không gửi
  - Ghim (giới hạn 5, chỉ group mình quản trị), cài đặt bài, sửa bài (chỉ bài của mình, đúng body, cài đặt đổi mới gọi API cài đặt, chạy thử không gửi)
  - Nhận ra tài khoản đang đăng nhập, chỉ xoá bài của mình
  - Tải lại từng phần: mỗi phần chỉ gọi đúng API của nó, giữ dữ liệu phần kia, không thông báo
  - Thống kê: số liệu chính thức và tự tính, lịch sử số thành viên
  - Báo cáo: chỉ admin community đọc được báo cáo người dùng, Beincom không trả lời thì dừng sau 25 giây, bỏ qua / ẩn (đúng body, chạy thử không gửi), ẩn bài gắn cờ
  - Tag / series: tải theo group gốc (kể cả bản cũ chưa lưu group gốc), đủ các trang, kiểm tra hợp lệ trước khi tạo nháp, báo tên mục không hợp lệ
  - Nhắc tên và xem trước link: đúng API / header, chỉ gửi người còn trong bài, không gửi xem trước khi có ảnh
  - Tải file: xin chỗ tải lên đúng API / body / header, chờ xử lý (lỗi, chưa xong, quá lâu), đăng bài kèm ảnh, chạy thử không tải
  - Telegram có nút: việc mới gửi tin riêng có nút (không gửi tin gộp), tối đa 10 tin + tin "còn N việc", loại tin tắt thì không gửi; bấm Duyệt / Từ chối / Ẩn / Ẩn cả đợt / Duyệt bài gọi đúng API, nhật ký ghi Telegram, tin được sửa; bấm lại, sai chat, mã lạ thì không làm; Chạy thử giữ nút; tắt nút thì như cũ và không đọc nút bấm
  - Dọn tài khoản: ẩn đúng mọi bài / bình luận còn hiện của người đó (đúng API, lý do), cấm ở mọi community khi chọn, không đụng nội dung người khác, không dọn chính mình, không còn gì thì báo; thêm bài cũ tìm được và chỉ ẩn mục được chọn, bỏ bài không phải của người đó
  - Tìm & dọn: mỗi community tìm một lần ở group gốc (keyword / actors[], startTime, tối đa 8 trang), kèm admin group, bỏ bài đã ẩn, từ khoá quá ngắn không gọi API; ẩn đã chọn chỉ ở group mình quản trị, bỏ bài của mình, lý do, nhật ký, Chạy thử
  - Quy tắc: từ khoá cần xem, liên hệ riêng (số điện thoại, Zalo / Telegram / WhatsApp; không nhầm số tiền, mã dài, địa chỉ ví), bộ mẫu chỉ thêm mục mới, tệp quy tắc đọc lại được
  - Việc chờ lâu: quá số giờ, mỗi việc nhắc một lần, việc đã xong rơi khỏi danh sách, quét bấm tay không nhắc
  - Hiệu quả bài: đăng thật thì ghi lại (chạy thử thì không), quét tự động đọc số liệu khi tới mốc 24 giờ / 7 ngày, bài đã xoá đánh dấu, Cập nhật đọc số hiện tại
  - Quản lý tag: đọc đủ các trang và quyền, tạo / đổi tên / xoá đúng API và body (tên viết hoa), tên sai / thiếu tag không gọi API, chạy thử chỉ ghi nhật ký
  - Tự duyệt bài tin cậy: chỉ bài đạt quy tắc của người trong danh sách hoặc đã được duyệt đủ N bài (chưa bị từ chối), có hồ sơ vi phạm / bài vi phạm thì không, nhật ký ghi lý do, chạy thử ghi một lần, tắt thì không làm; duyệt / từ chối trong Dashboard cũng được đếm
  - Sửa bài hẹn giờ: chỉ bài của mình đang hẹn giờ, lưu bằng PUT …/schedule với đủ body và giờ mới, giờ quá gần / thiếu giờ / bài người khác thì không gửi
  - Article có nhắc tên và ảnh: body gửi mentions và khối mention / img, ảnh chưa tải lên thì không gửi, ảnh trong bài tải đúng resource
  - Article: đọc chuyên mục, tạo nháp rồi publish / schedule đúng body (nội dung dạng trình soạn thảo), series / tag kiểm tra trước, dưới tên group, lỗi thì xoá nháp, thiếu dữ liệu thì không gọi API; Series đúng API / body; ảnh bìa đúng resource; bài hẹn giờ gồm Article, huỷ Article xoá đúng chỗ; chạy thử chỉ ghi nhật ký
  - Hồ sơ vi phạm: ghi từ lần quét (nhật ký Beincom, báo cáo, gắn cờ, vi phạm quy tắc) và từ thao tác qua addon, không ghi trùng, gộp cùng một lần xoá từ hai nguồn, bỏ báo cáo bị bỏ qua, không tự duyệt người có hồ sơ (kể cả người vừa bị cấm trong chính lần quét), tắt thì không đọc / ghi, dựng lần đầu từ nhật ký cũ, xoá hồ sơ
  - Thành viên mới có ở lại không: đọc nhật ký thành viên đúng tham số (objectType=MEMBER, from / to, nhiều trang), tìm bài của người mới theo lô ≤ 20 người, không gọi API ghi
  - Việc đầu tuần: nhiều việc định kỳ cùng lần quét gộp một thông báo / một tin Telegram và lưu danh sách; cùng tuần không gộp lại; một việc thì thông báo như cũ
  - Khôi phục sao lưu kèm lịch sử số liệu: gộp hiệu quả bài, lần nhắc, số thành viên, nhật ký với dữ liệu trong máy, không gọi Beincom
  - Báo cáo sử dụng: đếm lệnh Dashboard gửi theo ngày; tự gửi chỉ khi có nơi nhận + đồng ý + có quyền, 7 ngày một lần, lỗi thử lại sau 1 ngày, Gửi ngay, rút lại đồng ý thì thôi; nội dung gửi không có tên group / thành viên
  - Tự kiểm tra mỗi ngày: lần quét tự động đầu ngày kiểm tra mọi community, lần đầu chỉ ghi mốc, hôm sau một mục từ dùng được thành lỗi thì báo một lần (mở tab Nhật ký), cùng ngày không chạy lại, tắt thì không chạy
  - Bài thảo luận: sáng thứ Hai soạn sẵn câu hỏi + giờ gợi ý, thông báo một lần mỗi tuần, không tự đăng; hẹn giờ thật ghi lần dùng câu (chạy thử thì không), tuần sau chọn câu khác
  - Tự kiểm tra: chỉ GET, báo dùng được / bỏ qua theo quyền (không gọi API của mục không có quyền) / lỗi khi Beincom trả dữ liệu khác, 403 là bỏ qua, không ghi Lỗi kỹ thuật, Telegram chỉ hỏi getMe, hết phiên đăng nhập
  - Nhắc người mới: sáng thứ Hai quét tự động soạn sẵn (bỏ người đã hoạt động, mới vào, đã rời, đã được nhắc), thông báo một lần mỗi tuần, không tự đăng; đăng thật ghi người còn được nhắc tên, chạy thử không ghi; đo hiệu quả (đăng bài sau khi nhắc, đã rời); tắt thì không đọc gì
  - Báo cáo tháng: đọc nhật ký từ đầu tháng trước, bài từng tháng theo startTime / endTime, ghép báo cáo (số đầu / cuối tháng, người mới, bài nổi bật, thao tác theo group); tháng chưa tới thì báo; đầu tháng quét tự động nhắc một lần, mở thẳng Thống kê, tắt hoặc quá 7 ngày đầu thì không; gửi báo cáo về Telegram
  - Lỗi kỹ thuật: lỗi API được ghi (bỏ 401 và bài đã xoá), lỗi Dashboard / popup gửi sang được ghi (nơi lạ bị bỏ), lệnh hỏng giữa chừng trả câu báo và ghi lỗi
  - Quét báo cáo: đếm đúng, lần sau báo cái mới (bài gắn cờ ở nhiều group báo một lần), API treo không làm hỏng lần quét, tắt thì không gọi API, xử lý xong thì trừ số đếm, mở tab thì cập nhật số đếm và không báo lại

## Giới hạn
- Chỉ làm được việc tài khoản có quyền:
  - Admin group duyệt được thành viên và xem được bài chờ duyệt.
  - Thống kê community và báo cáo của người dùng cần quyền admin community. Admin group chỉ xem được bài gắn cờ tự động và bài đã ẩn.
- Group đang **tắt duyệt thành viên** (ví dụ Crypto Life lúc viết addon) thì người xin vào được vào luôn, nên sẽ không có yêu cầu nào để duyệt.
- **Chưa có:**
  - **Báo cáo thành viên** (người dùng báo cáo một tài khoản): web Beincom chưa có giao diện và API cho phần này.
  - **Hiện lại bài đã ẩn**: không thấy API.
- **Danh sách báo cáo**: với community không có báo cáo nào, API danh sách của Beincom treo (đã gặp ở Food Research và The Heroic Spirit). Addon đếm trước nên thường không gặp; khi lệnh đếm lỗi thì mới rơi vào trường hợp dưới đây. Khi Beincom đếm 0, tab Báo cáo không tải lại các báo cáo đã xử lý.
  - Ở tab Báo cáo: addon chờ 25 giây rồi báo "Beincom không phản hồi"; bấm ↻ Tải lại để thử lại.
  - Khi quét: chờ 15 giây rồi coi như community đó không có báo cáo. Nếu Beincom cũng treo khi *có* báo cáo thì addon sẽ không đếm được; mở tab Báo cáo để kiểm tra.
- **Xoá bài** chỉ được với bài của chính bạn (giới hạn của Beincom). Bài người khác: dùng Ẩn bài.
- **Thống kê khi là admin group** là số tự tính:
  - "Vào / rời" lấy từ nhật ký hoạt động của group đã chọn (tối đa 300 sự kiện gần nhất).
  - "Bài mới" chỉ đếm bài trên các group bạn quản trị; mỗi group đọc tối đa 160 bài.
  - Lượt cảm xúc / bình luận là tổng hiện tại của các bài đăng trong khoảng thời gian, không phải số phát sinh trong khoảng đó.
- Mới chỉ thử với API giả lập (cần thử thật): xoá bài của mình, thống kê với dữ liệu thật, bỏ qua / ẩn báo cáo, danh sách người báo cáo, ẩn bài gắn cờ, **tải ảnh / video / tệp** (luồng đọc từ mã web Beincom, chưa gọi thật lần nào), **đăng bài có nhắc tên và xem trước link** (API tìm người và lấy thông tin link đã gọi thử thật, phần đăng chưa), **đăng bài có tag / series** (API đọc danh sách đã gọi thử thật, kiểm tra hợp lệ và đăng chưa).
- Tải ảnh / video: nếu kho lưu trữ của Beincom không cho trang addon đọc phản hồi (CORS), addon vẫn gửi file rồi hỏi Beincom xem file đã lên chưa; khi đó lỗi của kho lưu trữ (file quá lớn, link hết hạn) chỉ hiện chung là "chưa lên được kho lưu trữ".
- Tải tệp cần gọi API Beincom trực tiếp (kèm cookie); nếu trình duyệt chặn cookie thì tệp không tải lên được.
- **Quét bình luận** chỉ thấy 25 bình luận gốc mới nhất và 25 trả lời mới nhất của mỗi bình luận, ở bài nằm trong danh sách bài mới; bình luận trong bài cũ hơn thì không đọc. API đọc đã gọi thật; nút Ẩn bình luận chưa.
- **Đăng dưới tên group** cần Beincom bật cờ tính năng cho tài khoản (web ẩn nút khi chưa bật); chưa gọi thật lần nào.
- **Article**: nội dung viết bằng Markdown nên chưa có căn lề, chú thích ảnh, gộp ô bảng (muốn dùng thì sửa tiếp trên web). Cấu trúc nội dung đã đối chiếu với Article có sẵn trên Beincom (chỉ đọc); đăng / hẹn giờ Article, tạo Series, nhắc tên trong Article chưa gọi thật lần nào.
- **Dọn tài khoản / Tìm & dọn bài** tìm bài qua API trang Tìm kiếm của Beincom: mỗi community tối đa 200 bài mới nhất mỗi lần, chỉ bài còn hiện. Bình luận cũ thì không tìm được (chỉ bình luận addon đã đọc khi quét). Tìm theo từ khoá đã gọi thật (chỉ đọc); nút ẩn dùng đúng lệnh Ẩn bài cũ.
- **Bài / bình luận đã ẩn không hiện lại được**: Beincom không có lệnh hiện lại.
- **Báo cáo tháng / thành viên mới**:
  - "Có bình luận" chỉ tính bình luận addon đã đọc khi quét (25 bình luận mới nhất của các bài mới); cảm xúc của người mới thì Beincom không có API để đọc. Người "chưa thấy hoạt động" có thể vẫn đã thả cảm xúc hoặc bình luận ở bài cũ.
  - Số thành viên đầu / cuối tháng suy ra từ nhật ký; nhật ký quá dài (hơn 2.000 sự kiện từ đầu tháng trước tới nay) thì bỏ phần này. Có thể lệch 1–2 người so với số Beincom hiển thị (tài khoản bị vô hiệu…).
  - Lượt xem / cảm xúc / bình luận là tổng hiện tại của các bài đăng trong tháng (tối đa 200 bài mới nhất), không phải số phát sinh trong tháng. Phần kiểm duyệt chỉ có thao tác qua addon.
- **Hiệu quả bài** chỉ đo bài đăng qua addon từ v0.22.0; máy tắt lúc tới mốc thì đo bù ở lần quét sau (ghi số giờ thật lúc đo). Lượt xem là số người đã xem (`totalUsersSeen`) do Beincom trả.
- **Quản lý tag**: Beincom chỉ cho đổi tên / xoá tag chưa gắn vào bài nào; tag đã dùng thì không bỏ được khỏi bài cũ (admin không sửa được bài người khác). Đọc danh sách tag và quyền quản lý tag đã gọi thật (chỉ đọc); tạo / đổi tên / xoá tag chưa gọi thật.
- **Tự duyệt bài tin cậy** chỉ đếm bài duyệt qua addon (bài duyệt trên web không được đếm). **Sửa bài hẹn giờ** chưa gọi thật; Article hẹn giờ thì sửa trên web.
- **Nút xử lý trong Telegram** chỉ chạy khi máy đang mở trình duyệt (addon đọc nút bấm mỗi 30 giây); máy tắt thì bấm nút sẽ được xử lý khi mở lại (Telegram giữ nút bấm 24 giờ). Từ chối bài chờ duyệt cần lý do nên chỉ làm trong Dashboard.
- **Nhập CSV** chỉ cho bài chữ (không ảnh / video / tệp, không tag / series), không đăng dưới tên group; cần giữ Dashboard mở tới khi hẹn xong.
- **Bài định kỳ** là các bài hẹn giờ đặt trước (tối đa 30 bài mỗi lần), không phải lặp mãi; hết chuỗi thì tạo chuỗi mới. Danh sách chuỗi chỉ lưu trong trình duyệt này; bài đăng trên máy khác vẫn hiện ở Bài đã hẹn giờ nhưng không có nhãn 🔁.
- Chưa kiểm chứng với dữ liệu thật: cách nhận ra ảnh đại diện mặc định, dạng dữ liệu câu trả lời câu hỏi gia nhập.
- Mỗi lần quét tải tối đa 500 yêu cầu mỗi group và 200 bài chờ duyệt mỗi community. Xử lý bớt rồi quét lại để tải tiếp.
- Chỉ chạy khi trình duyệt đang mở. Beincom đổi API thì cần cập nhật `background.js`.
- Tự động hoá có thể trái Điều khoản sử dụng của Beincom — tự cân nhắc.
