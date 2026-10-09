# BeinGroup — Quản lý Group Beincom (Chrome/Edge, MV3)

Gom **yêu cầu tham gia**, **bài chờ duyệt**, **bài mới vi phạm** và **danh sách thành viên** của mọi Group/Community bạn quản trị trên https://group.beincom.com vào một Dashboard. Addon chấm từng mục theo quy tắc của bạn, rồi cho duyệt, từ chối, ẩn bài, xoá / gán admin / cấm thành viên hàng loạt, và xử lý **báo cáo vi phạm**. Addon còn soạn và đăng bài, hẹn giờ đăng vào nhiều group cùng lúc, và thống kê thành viên, bài viết theo ngày. Dữ liệu chỉ lưu trong trình duyệt của bạn.

Tác giả: **Kai | Crypto Life**

## Cài đặt
1. Mở `chrome://extensions` (hoặc `edge://extensions`), bật **Developer mode**.
2. Bấm **Load unpacked** → chọn thư mục `D:\CryptoLife\BeinGroup`. Khi cập nhật bản mới thì bấm ↻ (Reload) ở thẻ addon.
3. Đăng nhập Beincom trên chính trình duyệt đó bằng tài khoản admin group.
4. Addon mặc định bật **Chạy thử**: bấm Duyệt / Từ chối / Ẩn bài chỉ ghi nhật ký, chưa gửi lên Beincom. Thử quy tắc cho ổn rồi tắt Chạy thử ở Dashboard → Cài đặt.

## Chức năng (theo tab của Dashboard)
Dashboard chia thành các tab. Số trên tab là việc đang chờ. Địa chỉ trang nhớ tab đang mở (`#tab=…`). Bảng dài cuộn trong khung của nó và **tên cột luôn hiện** ở trên cùng.

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
  - **Hồ sơ vi phạm**: mỗi người một hồ sơ, gom từ mọi community bạn quản trị. Addon tự ghi khi:
    - bạn ẩn bài, từ chối bài, từ chối yêu cầu tham gia, xoá hoặc cấm thành viên qua addon (cả tự xử lý; chạy thử thì không);
    - nhật ký hoạt động Beincom có người bị xoá, bị cấm, bị từ chối vào — kể cả do admin khác làm trên web (mỗi lần quét đọc trang mới nhất của từng group);
    - có báo cáo của người dùng (báo cáo bị bỏ qua thì gỡ khỏi hồ sơ), bài bị Beincom gắn cờ, bài đã bị ẩn trong group, bài mới vi phạm quy tắc bài viết.

    Cùng một lần xoá / cấm ghi từ addon và từ nhật ký Beincom chỉ tính một lần. Điểm: bị cấm 5, bị xoá 3, nội dung bị ẩn 2, còn lại 1. Danh sách xếp theo điểm, lọc **Tái phạm** (≥ 2 lần) / **Từng bị xoá / cấm**, tìm theo tên, bấm **Chi tiết** để xem từng lần (lúc nào, ở group nào, bài gì, lý do, ai làm), **Xoá hồ sơ** để quên một người, **Xuất CSV**. Mỗi người giữ 30 sự kiện gần nhất, tối đa 500 người.
  - Người có hồ sơ có huy hiệu **⚠ số lần** cạnh tên (đỏ nếu từng bị xoá / cấm) ở yêu cầu tham gia, danh sách thành viên và mọi bảng bài viết; bấm để mở hồ sơ.
- **Bài viết**
  - **Duyệt bài** (community bật duyệt bài và bạn quản trị group gốc): bài chờ duyệt kèm nội dung đầy đủ và đánh giá theo quy tắc bài viết. Duyệt hoặc từ chối kèm lý do gửi người đăng; từ chối một bài thì lý do được điền sẵn.
  - **Bài mới đăng**: 20 bài mới nhất của mỗi group sau mỗi lần quét, chấm theo quy tắc. Mục **Cần xử lý** gồm bài vi phạm và bài cần xem.
    - **Xoá bài**: chỉ với **bài của chính bạn**. Beincom không cho admin xoá bài của người khác.
    - **Ẩn bài**: với bài người khác, gỡ khỏi các group bạn quản trị, có chọn lý do. Addon chưa hiện lại được bài đã ẩn.
    - **Bỏ qua**: chỉ ẩn khỏi danh sách của addon.
    - **📌 Ghim**: chọn các group (bạn quản trị, bài được đăng vào) để ghim hoặc bỏ ghim; mỗi group tối đa 5 bài, group đã đủ thì bị khoá.
    - **⚙ Cài đặt**: bật / tắt bình luận, cảm xúc, đánh dấu Quan trọng (có hạn chọn sẵn). Admin đổi được cả bài của người khác.
    - **✎ Sửa** (chỉ bài của chính bạn): mở bài trong tab Đăng bài với đủ nội dung, ảnh / video / tệp đang có, nhắc tên, xem trước link, tag, series, cài đặt. Nơi đăng giữ nguyên. Thêm hoặc bỏ ảnh được; ảnh mới tải lên khi bấm **Lưu thay đổi**. Bài đang viết dở được cất lại và trả về khi lưu xong hoặc bấm **Huỷ sửa**.
  - **Bài đang ghim**: chọn group để xem các bài đang ghim (x/5) và bỏ ghim.
  - **Bình luận mới** (bật "Quét bình luận mới"): mỗi lần quét đọc 25 bình luận gốc mới nhất của tối đa 8 bài có số bình luận tăng, cùng trả lời của tối đa 10 bình luận có trả lời mới; chấm theo quy tắc bài viết của group (kể cả quy tắc riêng).
    - Lọc Cần xử lý / Tất cả / Đã bỏ qua / Đã ẩn. **Ẩn** bình luận (như nút Ẩn của admin trên web, có lý do), **Bỏ qua**, **Mở ↗** tới đúng bình luận.
    - Bình luận mới vi phạm: có thông báo, cộng vào số trên icon và ô "Bài, bình luận vi phạm", ghi vào hồ sơ vi phạm của người viết.
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
- **Thống kê** (chọn community hoặc group, 7 / 30 / 90 ngày)
  - Ô số liệu: thành viên hiện tại, số người vào / rời, bài mới, lượt cảm xúc và bình luận.
  - Biểu đồ số thành viên, vào / rời mỗi ngày, bài mới mỗi ngày. Rê chuột xem số liệu từng ngày; có bảng số liệu và xuất CSV.
  - **Bài nổi bật** (theo cảm xúc + bình luận) và **Người đăng tích cực**.
  - Nguồn số liệu:
    - **Chủ / admin community**: số liệu chính thức của Beincom (thành viên và số bài theo ngày).
    - **Admin group**: addon tự tính từ nhật ký hoạt động, bài trên các group bạn quản trị, và số thành viên addon ghi lại sau mỗi lần quét. Biểu đồ số thành viên chỉ có từ ngày cài addon.
- **Quy tắc & cài đặt**: quy tắc lọc thành viên, quy tắc bài viết, cài đặt addon (công tắc tổng, chạy thử, thông báo, quét bài mới, quét báo cáo vi phạm, ghi hồ sơ vi phạm, chu kỳ quét, nghỉ giữa hai thao tác, tự xử lý yêu cầu tham gia).
  - **Quy tắc riêng cho từng group**: ở **Áp dụng quy tắc cho**, chọn một group rồi bấm **Dùng quy tắc riêng cho group này**.
    - Addon chép quy tắc đang dùng thành bản riêng; sửa ở hai thẻ quy tắc bên dưới chỉ áp dụng cho group đó.
    - Quy tắc riêng của community (group gốc) dùng luôn cho các group con chưa có quy tắc riêng.
    - Group chưa có quy tắc riêng thì xem được quy tắc đang dùng (chỉ đọc). **Bỏ quy tắc riêng** để quay về quy tắc của community hoặc quy tắc chung.
    - Chấm yêu cầu tham gia, bài chờ duyệt, bài mới, tự xử lý và số trên icon đều theo quy tắc của group. Bài đăng vào nhiều group lấy kết quả nặng nhất.
  - **Sao lưu cài đặt**: **Tải bản sao lưu** tạo tệp JSON gồm cài đặt, quy tắc (chung và riêng), mẫu bài; tuỳ chọn kèm hồ sơ vi phạm. Không chứa mật khẩu hay phiên đăng nhập.
    - **Khôi phục từ tệp…**: hộp xác nhận ghi rõ các mục sẽ thay; hồ sơ vi phạm thì gộp thêm, không trùng.
    - Bản sao lưu đang tắt Chạy thử thì addon hỏi có giữ Chạy thử không (mặc định giữ). Tệp lạ / sai kiểu bị bỏ qua.
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
| **Cần xem** | Không có ảnh đại diện, chưa trả lời câu hỏi bắt buộc, câu trả lời ngắn hơn số ký tự tối thiểu, chưa xác minh (nếu bật), hoặc **có hồ sơ vi phạm** (từng bị cấm, xoá, ẩn bài… — nên người có hồ sơ không bao giờ được tự duyệt) |
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
- **Bình luận**: `GET content/comments?postId=…&limit=25` (bình luận gốc, mới nhất trước); trả lời: thêm `parentId={id bình luận}`; ẩn: `POST content/comments/{id}/hide` với `{ reasonType }`.
- **Đăng dưới tên group**: bản nháp tạo bằng `POST content/manage/groups/{groupId}/posts` thay cho `POST content/posts`, các bước sau như bài thường.
- **Bài đã hẹn giờ**: `GET content/manage/groups/{groupId gốc}/contents/scheduled`; đổi giờ: `PUT content/contents/{id}/reschedule`; huỷ: `DELETE content/posts/{id}`.
- **Cài đặt group**: đọc `GET group/groups/{id}/settings`; đổi `PUT group/groups/{id}/settings` với một khoá snake_case (vd `{ id, is_join_approval: false }`); Duyệt bài: `PUT group/communities/{communityId}/content-settings` với `{ group_id, content_approval: { value }, is_update_all: false }`. Quyền lấy từ `group/me/permissions` (`edit_join_setting`, `edit_privacy`).
- **Ghim**: `GET content/contents/pinned-content/groups/{groupId}`; ghim / bỏ ghim: `PUT content/contents/pinned-content/{contentId}` với `{ pinGroupIds, unpinGroupIds }` (kiểm tra giới hạn 5 bài trước).
- **Cài đặt bài**: `PUT content/contents/{id}/setting` với `{ canComment, canReact, isImportant, importantExpiredAt }`.
- **Sửa bài đã đăng**: đọc `GET content/contents/{id}`; lưu `PUT content/posts/{id}` với `{ audience, content, media, mentions, linkPreview, tags, series }` (như web, không kèm setting; không còn link thì gửi `{ domain: '', url: '' }` để xoá thẻ cũ); cài đặt đổi thì gọi thêm API cài đặt.
- **Xoá bài của mình**: `DELETE content/posts/{id}`. Addon biết bài nào của bạn nhờ `GET user/me/profile`, gọi không kèm header phiên bản.
- **Thống kê** (đọc khi mở tab):
  - `GET group/manage/communities/{communityId}/stats/member-count` và `GET content/stats/communities/{groupId gốc}/contents/daily-counts`: số liệu chính thức cho chủ / admin community.
  - Không có số liệu chính thức thì addon tự tính từ `activity-logs` (tối đa 6 trang × 50 sự kiện), `content/timeline` (tối đa 8 trang × 20 bài mỗi group) và số thành viên ghi sau mỗi lần quét (giữ 120 ngày).
- Thao tác hàng loạt chạy từng mục một, nghỉ 1–5 giây giữa hai mục (chỉnh được).
- **Tốc độ**: một lần quét ~5–6 giây với 5 group (trước ~23 giây):
  - Các group, bài mới, chi tiết bài chờ duyệt, bài hẹn giờ, tag / series, thống kê đọc song song, tối đa 4 lệnh cùng lúc (không dồn quá nhiều vào Beincom).
  - Báo cáo: hỏi Beincom **số báo cáo chờ xử lý** trước (`content-reports/count`, dưới 1 giây); bằng 0 thì không gọi API danh sách vốn treo 15–25 giây ở community chưa có báo cáo.
- Lệnh đọc gặp lỗi tạm thời ở máy chủ Beincom (HTTP 502 / 503 / 504) được thử lại tối đa 2 lần (cách 1,5 rồi 3 giây); vẫn lỗi thì báo "Máy chủ Beincom không phản hồi kịp", lần quét sau tự đọc lại. Lệnh ghi không tự thử lại để tránh làm hai lần.
- API nội dung (`content/…`) của Beincom chỉ nhận tối đa 25 mục mỗi trang; addon đọc nhiều trang khi cần. API nhóm (`group/…`) nhận 50–100.
- Xoá / ẩn / duyệt / huỷ hẹn giờ một bài mà Beincom báo "Content not found" (bài đã bị xoá trên web): addon tính là xong, bỏ bài khỏi danh sách và ghi "Bài không còn trên Beincom" vào nhật ký.
- **Xác thực**: header `x-application: BIC_GROUP`, `x-platform: WEB`, cookie của beincom.com. Gọi trực tiếp bị chặn thì addon mở tạm một tab Beincom ở nền rồi gọi trong tab đó, giống addon Beincom Check-in.

## Cấu trúc mã
- `background.js`: service worker — quét, gọi API Beincom, thông báo, huy hiệu, mọi thao tác ghi (chạy lần lượt, có chạy thử).
- `common.js`: hàm thuần dùng chung (quy tắc, chấm điểm, dựng body API, xuất CSV, sao lưu…), có test riêng.
- `upload.js`: tải ảnh / video / tệp từ trang Dashboard. `charts.js`: biểu đồ SVG của tab Thống kê.
- `dashboard.html` + `dashboard.css` + script theo tab trong `dash/`, nạp theo thứ tự cuối `dashboard.html` (script thường, dùng chung phạm vi toàn cục):
  - `core.js` (dữ liệu, tiện ích, hộp xác nhận, gửi thao tác, chuyển tab), `ui.js` (ô người dùng / bài dùng ở nhiều tab)
  - `overview.js`, `members.js`, `content.js`, `reports.js`, `compose.js` + `attach.js` (đính kèm, nhắc tên, link, tag), `stats.js`, `settings.js`, `log.js`
  - `dashboard.js` nạp cuối: sự kiện chung, vẽ lại toàn trang, nạp dữ liệu.
- `popup.html` / `popup.js`: cửa sổ nhỏ khi bấm icon.

## Kiểm thử
```
node --test "test/*.test.js"
```
- `test/common.test.js`: quy tắc thành viên và bài viết (chung / riêng từng group), nhận link, quyền, đường dẫn, xuất CSV, xem trước markdown (an toàn với HTML), ghép số liệu thống kê, lịch bài định kỳ, đọc / làm sạch tệp sao lưu, bình luận (thu gọn, chọn bài cần đọc, gộp), tóm tắt tuần.
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
  - Hồ sơ vi phạm: ghi từ lần quét (nhật ký Beincom, báo cáo, gắn cờ, vi phạm quy tắc) và từ thao tác qua addon, không ghi trùng, gộp cùng một lần xoá từ hai nguồn, bỏ báo cáo bị bỏ qua, không tự duyệt người có hồ sơ (kể cả người vừa bị cấm trong chính lần quét), tắt thì không đọc / ghi, dựng lần đầu từ nhật ký cũ, xoá hồ sơ
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
- **Bài định kỳ** là các bài hẹn giờ đặt trước (tối đa 30 bài mỗi lần), không phải lặp mãi; hết chuỗi thì tạo chuỗi mới. Danh sách chuỗi chỉ lưu trong trình duyệt này; bài đăng trên máy khác vẫn hiện ở Bài đã hẹn giờ nhưng không có nhãn 🔁.
- Chưa kiểm chứng với dữ liệu thật: cách nhận ra ảnh đại diện mặc định, dạng dữ liệu câu trả lời câu hỏi gia nhập.
- Mỗi lần quét tải tối đa 500 yêu cầu mỗi group và 200 bài chờ duyệt mỗi community. Xử lý bớt rồi quét lại để tải tiếp.
- Chỉ chạy khi trình duyệt đang mở. Beincom đổi API thì cần cập nhật `background.js`.
- Tự động hoá có thể trái Điều khoản sử dụng của Beincom — tự cân nhắc.
