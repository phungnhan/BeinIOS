# Có gì mới ở BeinFusion

Mỗi bản một mục, bản mới nhất ở trên. Dashboard tự hiện các mục mới sau khi cập nhật (bấm "Có gì mới" ở cuối trang để xem lại).

## v0.54.0 — 22/10/2026
- **✨ Trả lời bình luận bằng AI**: chọn nhiều bình luận ở **Bình luận mới** (hoặc mở một bài → **✨ Trả lời hàng loạt bằng AI**), AI viết nháp một câu trả lời cho từng bình luận theo nội dung bài. Hai cách:
  - **AI trên web (chép – dán)**, không cần khoá API: addon soạn sẵn đề bài, chép và mở Claude / ChatGPT / Gemini; bạn dán vào trang chat, gửi, chép câu trả lời rồi bấm **📋 Dán** (hoặc Ctrl + V vào ô) — addon điền nháp vào từng bình luận. Addon không tự điều khiển trang chat (điều khoản các trang này cấm truy cập tự động).
  - **Khoá API Claude**: tự động hoàn toàn.
  - Xem, sửa, bỏ chọn từng câu rồi bấm **Trả lời tất cả**: có hộp xác nhận, gửi lần lượt như nút Trả lời, có nút **Dừng**. Bình luận spam / lừa đảo được AI đề nghị bỏ qua.
  - Câu trả lời ngắn gọn, thân thiện, không trùng lặp giữa các bình luận; bình luận chỉ có icon / emoji (hoặc ảnh GIF) thì AI trả lời bằng icon.
  - Chọn giọng văn (thân thiện / trang trọng / ngắn gọn) và thêm ghi chú cho AI mỗi lần.
  - Khoá API Claude (không bắt buộc): **Cài đặt → ✨ Trả lời bình luận bằng AI** (mô hình Opus 5.5 / Sonnet 5.5 / Haiku 5.5, hướng dẫn thêm, nút Kiểm tra). Khoá chỉ lưu trong trình duyệt này, không có trong sao lưu / đồng bộ. Hộp báo chi phí ước tính sau mỗi lần tạo.

## v0.53.1 — 21/10/2026
- **Trang Chat**: tin nhắn riêng với chính mình đổi tên thành **Nhật ký của tôi** (trước là "Nhật ký cá nhân"), cùng tên với mục Nhật ký của tôi trong Hồ sơ cá nhân của BeinIOS.

## v0.53.0 — 21/10/2026
- **Hồ sơ cá nhân** của tài khoản đang đăng nhập.
  - **Cách mở**:
    - **Dashboard**: bấm avatar mới ở góc trên bên phải.
    - **Chat**: bấm tên mình, dòng tài khoản cuối danh sách (BeinFusion theme), hoặc avatar ở góc trên (Silk).
  - **Tài khoản**: tên đăng nhập, mã Beincom (có nút Chép), kết nối Chat.
  - **Quyền quản trị** theo từng cộng đồng: vai trò cao nhất (Chủ sở hữu / Admin community / Admin group), số group con đang quản trị, link mở trang cộng đồng.
  - **Addon**: lần quét gần nhất, chu kỳ tự quét, Chạy thử.
  - **Link** tới trang cá nhân trên Beincom.
  - Lần quét lưu thêm ảnh đại diện và dấu xác minh của tài khoản (không lưu email hay thông tin khác).

## v0.52.0 — 21/10/2026
- **Mã QR ngắn qua proxy của BeinIOS** (Cài đặt → 📱 BeinIOS → Chuyển đăng nhập sang BeinIOS).
  - **Vì sao cần**: đăng nhập Beincom thật dài hơn 4.000 ký tự, không vừa một mã QR. Chép đoạn chữ sang iPhone qua Ghi chú hay tin nhắn thì hay bị chèn xuống dòng.
  - **Cách làm**: addon mã hoá đăng nhập ngay trên máy tính (AES-GCM) rồi gửi bản mã hoá lên proxy của bạn. Mã QR chỉ chứa mã số, khoá giải mã và địa chỉ proxy, nên rất nhỏ và dễ quét.
  - **Trên iPhone**: quét mã → trang BeinIOS tự lấy về và giải mã → bấm Chép → mở BeinIOS → Dán từ addon.
  - **Cài lần đầu**: trong hộp, mở mục **Proxy của BeinIOS**, điền địa chỉ + khoá proxy như ở BeinIOS. Khoá chỉ lưu ở máy này, không có trong sao lưu hay đồng bộ.
  - **An toàn**: khoá giải mã không gửi lên proxy. Proxy chỉ giữ bản mã hoá: lấy một lần là xoá, tự xoá sau 5 phút.
  - **Cần**: proxy BeinIOS bản 2.1.0 trở lên (Cloudflare tự dựng lại khi repo BeinIOS cập nhật).

## v0.51.0 — 16/10/2026
- **Chuyển đăng nhập sang BeinIOS** (Cài đặt → 📱 BeinIOS). BeinIOS là BeinFusion chạy như ứng dụng trên iPhone, tại https://phungnhan.github.io/BeinIOS/.
  - **Cách dùng**: bấm nút, quét mã QR bằng Camera iPhone, mở link, bấm Chép, rồi dán ở BeinIOS → Cài đặt → Dán từ addon. Có thể bấm **Chép** ngay trên máy tính rồi tự chuyển đoạn chữ sang iPhone.
  - **Nên lấy từ cửa sổ ẩn danh**: BeinIOS có phiên riêng, không giành phiên với trình duyệt đang dùng. Cần bật "Cho phép ở chế độ ẩn danh" cho addon.
  - **Quyền**: addon chỉ xin quyền đọc cookie Beincom khi bấm lần đầu, gồm cả `beincom.com` (phiên đăng nhập là cookie chung của cả miền).
  - **Cookie gửi đi**: chỉ cookie phiên của Beincom, Chat và máy chủ đăng nhập; bỏ cookie thống kê.
  - **An toàn**: không gửi cookie đi đâu, không lưu lại. Mã tự ẩn sau 2 phút hoặc khi đóng hộp.
  - **Mã QR tạo ngay trong addon**, không dùng dịch vụ ngoài. Đăng nhập dài quá cho mã QR thì dùng nút Chép.

## v0.50.0 — 15/10/2026
- **Ô viết bình luận (khung thread) đủ chức năng như ô gõ tin chính**:
  - **Aa** để hiện / ẩn thanh định dạng: đậm, nghiêng, gạch, link, mã, trích dẫn, danh sách. Thanh mặc định ẩn cho gọn; addon nhớ lựa chọn của bạn.
  - **Xem trước** bình luận như sau khi gửi.
  - **Câu trả lời mẫu** (nút, hoặc gõ / ở đầu ô).
  - **Đính kèm tệp**: chọn tệp, dán ảnh, hoặc kéo thả vào khung bình luận; tối đa 10 tệp, mỗi tệp 25 MB, tải lên ngay. Bình luận có tệp chờ máy chủ xong mới hiện, rồi tự đọc lại để có ảnh.
  - **Biểu tượng cảm xúc** chèn vào đúng ô bình luận.
  - Đổi sang thread khác hoặc đóng khung thì tệp đang chờ được bỏ.
- Hộp biểu cảm / độ ưu tiên mở hẳn phía trên khung gõ, không che chữ đang gõ và tệp đính kèm.

## v0.49.0 — 15/10/2026
- **Giao diện mới cho trang Chat: BeinFusion Silk (Lụa).** Bấm nút **Giao diện** (bảng màu, ở đầu danh sách bên trái) để chọn **BeinFusion theme** (mặc định, như cũ) hoặc **BeinFusion Silk (Lụa)**.
  - Silk có **thanh cộng đồng** bên trái: Tất cả, Tin nhắn riêng, Thread đang theo dõi, ảnh từng cộng đồng (chấm đỏ khi có tin chưa đọc, số khi có người nhắc tên bạn). Nút Giao diện, Dashboard và ảnh tài khoản ở góc phải hàng tiêu đề của cột danh sách.
  - Bấm một cộng đồng thì cột bên cạnh chỉ còn kênh của cộng đồng đó, theo cây group con. Mở một cuộc trò chuyện ở mục khác (từ thông báo, kết quả tìm) thì tự chuyển sang mục của nó.
  - Nền xám tím rất nhạt, bề mặt trắng, một màu nhấn. Ô soạn tin nổi và gọn: thanh định dạng, nút độ ưu tiên hiện khi bấm Aa.
  - Tuỳ chỉnh riêng cho Silk:
    - Chế độ màu (theo hệ thống / sáng / tối), màu nhấn (6 màu + tự chọn; màu quá nhạt thì chữ màu nhấn tự đậm lên cho rõ).
    - Kiểu tin: Bong bóng, hoặc Phẳng (tên + chữ như Slack, tin của bạn cũng nằm bên trái).
    - Mật độ (thoáng / gọn), cỡ chữ (nhỏ / vừa / lớn), font (**Be Vietnam Pro** — font làm riêng cho tiếng Việt, gói sẵn trong addon, hoặc font hệ thống), độ rộng tin (vừa / toàn màn hình), hiện ảnh đại diện, hiện giờ từng tin.
  - Lựa chọn lưu trong máy và áp ngay khi mở trang, không nháy giao diện cũ. Trên điện thoại, thanh cộng đồng nằm dưới đáy màn hình.
  - Mọi phần của trang Chat theo kiểu Silk, cả sáng lẫn tối: trang Thread đang theo dõi (thread chưa đọc nền nhấn nhạt), khung bình luận / tìm tin / tin ghim, hồ sơ người, hộp hỏi, hộp biểu cảm, gợi ý @tên, xem ảnh, lời mời trò chuyện.
  - Font Be Vietnam Pro gói trong thư mục `fonts/` (12 tệp woff2, ~185 KB: 4 độ đậm × tiếng Việt / Latin mở rộng / Latin; trình duyệt chỉ tải phần cần). Giấy phép SIL Open Font License, kèm `fonts/OFL.txt`.
  - Silk được làm một lần ở bản này. Các bản sau chỉ cập nhật BeinFusion theme; Silk chỉ được chỉnh khi có yêu cầu.

## v0.48.0 — 15/10/2026
- **Addon đổi tên thành BeinFusion** (trước đây là BeinGroup). Tên mới có ở thanh công cụ trình duyệt, Dashboard, cửa sổ nhỏ, trang Chat, thông báo và tin Telegram ("BeinFusion: …"), tệp xuất ra (`beinfusion-sao-luu-….json`, `beinfusion-nhat-ky-….csv`…) và tệp cài (`BeinFusion-v….zip`).
- Không mất gì khi cập nhật: cài đặt, quy tắc, nhật ký, hồ sơ, ảnh đã lưu vẫn giữ nguyên. Tệp sao lưu cũ của BeinGroup vẫn khôi phục được.
- Cập nhật bản mới: chép đè vào **đúng thư mục addon cũ**, kể cả khi thư mục đó vẫn tên BeinGroup. Đừng tải thư mục mới thành một addon thứ hai, vì trình duyệt sẽ coi đó là addon khác với dữ liệu trống.
- Giao diện trang Chat hiện tại từ nay có tên **BeinFusion theme** (mặc định).

## v0.47.0 — 14/10/2026
- **Trang Chat nhanh hơn.** Đo thật từ máy bạn: mỗi lệnh đọc chat của Beincom mất 0,1–0,7 giây và dao động thất thường; một trang 40 tin nặng khoảng 0,4 MB. Phần addon tự vẽ chỉ mất vài chục mili giây. Vì vậy bản này tập trung vào bớt phải chờ mạng:
  - **Mở lại cuộc trò chuyện vừa xem hiện ngay**: tin được nhớ trong bộ nhớ của trang (15 cuộc trò chuyện gần nhất; không ghi ra máy, đóng trang là mất), rồi chỉ đọc phần mới.
  - **Tải trước khi rê chuột** (hoặc chọn bằng phím Tab) vào một mục ở danh sách: lúc bấm thì tin đã có sẵn. Lướt chuột qua nhanh thì không tải; tối đa 2 cuộc trò chuyện cùng lúc.
  - Lúc trang rảnh, tải sẵn **3 cuộc trò chuyện còn tin chưa đọc** mới nhất. Tải trước chỉ đọc, không đánh dấu đã đọc.
  - **Bình luận (thread)**: rê chuột vào "N bình luận" là tải trước; mở lại thread vừa xem hiện ngay.
  - **Tin và bình luận chỉ có chữ hiện ngay khi gửi** (mờ, ghi "Đang gửi…"). Ô gõ trống ngay để gõ tiếp; các tin gửi lần lượt đúng thứ tự gõ. Gửi lỗi thì tin tạm biến mất, chữ được đưa lại vào ô gõ kèm thông báo. Tin có tệp vẫn chờ gửi xong như cũ.
  - Gửi tin, sửa tin, thả biểu cảm, theo dõi thread **gọi thẳng chat Beincom**. Trước đây sau mỗi lần nền của addon khởi động lại (hoặc 5 phút không gọi), addon phải dò api.beincom.com trước khi gửi, mất thêm 0,1–2,6 giây. Chat chưa nhận phiên (401: tin chưa được tạo) thì mới đổi đường, nên không bao giờ gửi một tin hai lần.
  - **Danh sách cuộc trò chuyện lần trước được lưu trong máy**: mở trang Chat lần đầu sau khi bật lại trình duyệt cũng hiện danh sách ngay, không phải chờ khung xám. Chỉ lưu tên cuộc trò chuyện, số chưa đọc, giờ tin cuối; không có nội dung tin.
  - Ảnh và cấp của cộng đồng con đọc cùng lúc với tên người và quyền, không nối đuôi nhau.
- Lệnh của trang Chat chạy quá 5 giây được ghi vào **Nhật ký → Lỗi kỹ thuật** (chỉ tên lệnh và thời gian, không có nội dung). Lỗi JavaScript của trang Chat cũng được ghi. Nếu vẫn thấy chậm, bấm **Sao chép báo cáo** ở đó để biết chậm ở đâu.

## v0.46.0 — 14/10/2026
- **Tin của bạn trong trang Chat dễ nhìn hơn**: bong bóng nền tím nhạt, chữ màu thường thay cho khối tím đậm chữ trắng. Khung trích tin trả lời, @tên, link, mã, ảnh biểu cảm Beincom đều rõ, cả ở giao diện tối.
- Sửa **tin trả lời của bạn bị tràn trong khung bình luận**: trả lời một bình luận dài làm bong bóng rộng hơn khung, mất chữ bên trái và hiện thanh cuộn ngang. Khung trích nay tự xuống dòng (tối đa 2 dòng), không bao giờ rộng hơn bong bóng.
- **Khung bình luận kéo rộng được**: kéo cạnh trái của khung (cả khung Tìm tin nhắn, Tin đã ghim) sang trái / phải.
  - Độ rộng được nhớ cho lần sau. Bấm đúp vào cạnh để về cỡ mặc định. Khi đang chọn cạnh, phím ← → cũng đổi được độ rộng.
  - Khung luôn chừa chỗ cho cuộc trò chuyện.
- **Nút Phóng to** (⤢) trên đầu khung bình luận: khung phủ cả phần cuộc trò chuyện, chữ dàn rộng dễ đọc. Bấm lại (⤡) để thu nhỏ; đóng khung thì lần mở sau về cỡ thường.
- Thanh định dạng ở ô chat không còn nút đè lên nhau khi cuộc trò chuyện hẹp (lúc khung bình luận đang mở); thiếu chỗ thì cuộn ngang.

## v0.45.0 — 14/10/2026
- **Cộng đồng con trong trang Chat hiện theo cây**, giống cây thư mục:
  - Kênh chính của cộng đồng ở trên cùng. Mỗi group con nằm ngay dưới group cha, thụt vào một nấc, có đường nối (├ └ │) từ ảnh của group cha.
  - Dòng phụ ghi **Group con** hoặc **thuộc <tên group cha>** (group cấp 3 trở xuống), kèm mô tả kênh nếu có.
  - Cùng một cấp vẫn xếp theo tin mới nhất. Group con có group cha bạn chưa tham gia thì treo thẳng dưới kênh chính.
  - Đang tìm hoặc lọc thì bỏ đường nối, chỉ giữ dòng "↳ thuộc …" để vẫn biết kênh nằm ở đâu.
- **Ảnh group con**: kênh của group con giờ hiện ảnh của group (như trên web), cả ở danh sách và đầu cuộc trò chuyện. Group chưa có ảnh thì giữ chữ cái đầu.
  - Ảnh, cấp và group cha đọc từ thông tin group (chỉ đọc) lúc tải đủ danh sách, rồi ghi nhớ trong máy 3 ngày. Lần mở sau hiện ngay.
- **Dashboard → Cài đặt → 💬 Chat Beincom**: thêm dòng **Ảnh trang Chat đã lưu trong máy** (số ảnh, dung lượng) và nút **Xoá ảnh đã lưu**. Xoá xong, trang Chat tự tải lại ảnh khi cần.

## v0.44.7 — 14/10/2026
- **Trang Chat tải ảnh nhanh hơn**: avatar, ảnh cộng đồng và ảnh biểu cảm Beincom được lưu trong máy. Lần sau hiện ngay, không chờ mạng.
  - Ai đổi avatar / cộng đồng đổi ảnh thì addon tự tải bản mới và xoá bản cũ.
  - Ảnh biểu cảm kiểm tra lại sau 7 ngày. Biểu cảm ở hàng nhanh được tải sẵn khi mở trang.
- **Ảnh cộng đồng** trong trang Chat: có ở đầu mỗi mục cộng đồng bên trái, ở kênh chính của cộng đồng, và ở đầu cuộc trò chuyện.
- Biểu tượng của thanh nút trên tin đổi sang cùng một bộ, nét đều nhau (sao chép, thùng rác cân với các biểu tượng khác).
- Ảnh biểu cảm Beincom không tải được thì hiện emoji gần nghĩa thay cho ô ảnh hỏng.
- **Dashboard**:
  - Thanh tab con (Đợt spam, Duyệt bài, Bài mới đăng…) dính ngay dưới thanh tab lớn khi cuộn. Bấm một tab con thì thẻ dừng ngay dưới, không bị che.
  - Tên trong danh sách **Thành viên** (cả danh sách Bị cấm) bấm được để mở cửa sổ Hồ sơ.

## v0.44.6 — 14/10/2026
- **Thanh nút khi rê chuột vào tin nằm sát bong bóng**: tin của bạn thì ngay bên trái bong bóng, tin người khác thì ngay bên phải. Thiếu chỗ (khung bình luận đang mở, màn hình hẹp) thì nằm ngay trên bong bóng. Trước đây thanh bám theo cả hàng nên có lúc nằm rất xa tin.

## v0.44.5 — 14/10/2026
- Sửa **tin trả lời** cho giống hệt web Beincom:
  - Tin gửi đi giờ kèm mã tin được trả lời (`quoted_post_id`) và đúng định dạng link như web.
  - Không còn thẻ xem trước "BEINCOM | CHAT" dưới tin trả lời. Máy chủ tạo thẻ này cho link tin trả lời trong tin nhắn riêng; web không hiện nó, addon nay cũng ẩn.
  - Khung trích ghi thêm số tệp khi tin được trả lời có ảnh / tệp.

## v0.44.4 — 14/10/2026
- **Cửa sổ Bài viết & bình luận**: Article (và bài dài) mở ra giống thẻ xem trước, cuối có **Xem thêm ▾**. Bấm thì tải và hiện cả bài, bấm **Thu gọn ▴** để về phần xem trước.
- **Nút khi rê chuột vào tin** (cuộc trò chuyện và khung bình luận) đổi thành biểu tượng một màu: thả biểu cảm, trả lời, bình luận, sửa, sao chép, ghim, xoá. Rê chuột vào biểu tượng thì hiện ngay ghi chú.
- **Trả lời trích tin** như web Beincom: nút ↩ Trả lời ở mỗi tin và mỗi bình luận. Ô gõ hiện dòng "Trả lời …" (Esc hoặc ✕ để huỷ). Tin gửi đi là tin trả lời đúng kiểu Beincom, nên trên web cũng hiện khung trích. Trong khung bình luận, trả lời vẫn nằm trong thread.

## v0.44.3 — 14/10/2026
- **Đọc cả bài** (Dashboard): thẻ Article và chữ bị cắt ở danh sách chỉ là phần xem trước. Bấm 💬 Bình luận thì cửa sổ Bài viết & bình luận tải bài đầy đủ.
  - Article dựng như trên web: tiêu đề mục, đoạn văn, chữ đậm / nghiêng, link, danh sách, trích dẫn, ảnh, bảng.
  - Bài thường hiện toàn bộ chữ.
- **Trang Chat hiện tin giống Beincom hơn**:
  - **Tin trả lời**: không còn đoạn mã `[](bein.mm.reply)…`. Đầu tin có khung trích "↩ Tên người" cùng nội dung tin được trả lời; bấm khung để tới tin đó. Tin được trả lời không có sẵn thì addon tự đọc thêm (chỉ đọc). Sửa tin trả lời của mình vẫn giữ là tin trả lời.
  - **Link Beincom chưa có tên** (bài viết, Article, tin chat, community / group): hiện tên bài hoặc tên tin (đọc thêm, có ghi nhớ) thay cho đường dẫn dài; rê chuột thấy đường dẫn.
  - **Link trong dấu `< >`** không còn hiện dấu ngoặc.
  - **Link ngoài** có thẻ xem trước (tiêu đề, mô tả, ảnh) như web.

## v0.44.2 — 14/10/2026
- **Bài Article hiện như thẻ trên web** (Bài mới đăng, Duyệt bài, Tìm & dọn, cửa sổ Bài viết & bình luận…).
  - Thẻ có ảnh bìa, tiêu đề, tóm tắt, số phút đọc, tag, số cảm xúc và bình luận.
  - Trước đây phần nội dung hiện cả chuỗi mã của trình soạn Article; nay là chữ thường. Bài đã quét trước đó cũng hiện đúng.
  - Link nằm trong chữ của Article (vd chữ "nhóm" gắn link t.me) vẫn bị quy tắc bài viết xét như bài thường.
- **Lời mời trò chuyện** (trang Chat):
  - Số cạnh tab **Lời mời** chỉ hiện khi có lời mời mới (còn tin chưa đọc).
  - Lời mời bạn đã bỏ qua hoặc bị xếp vào Spam được ẩn; bấm **Xem thêm … lời mời đã bỏ qua / spam** để xem, như danh sách tin nhắn riêng.

## v0.44.1 — 14/10/2026
- **Hồ sơ trên Dashboard**: bấm tên một người ở các bảng (bài, bình luận, thành viên, báo cáo…), bấm huy hiệu ⚠, hoặc nút "⚠ Hồ sơ trên Dashboard" ở trang Chat để mở **cửa sổ Hồ sơ**.
  - Có cả người chưa từng vi phạm (trước đây nút này chỉ mở danh sách Hồ sơ vi phạm, người chưa vi phạm thì trống).
  - Cửa sổ có: tình trạng (vi phạm, giống admin, đang xin vào group nào); hồ sơ vi phạm; bài, bình luận và tin chat addon đã thấy; thao tác của admin với người này (theo Nhật ký).
  - Nút **Tìm bài** còn hiện trong các community bạn quản trị (chỉ đọc). Nút **🧹 Dọn tài khoản**, **Cấm ở mọi community**, **Xoá hồ sơ vi phạm**, và "Xem trong danh sách Hồ sơ vi phạm".

## v0.44.0 — 14/10/2026
- **Cửa sổ Bài viết & bình luận** (tab Bài viết): bấm **💬 Bình luận** ở một bài (nút có số bình luận), hoặc **Trả lời** ở Bình luận mới, để mở cửa sổ lớn.
  - Cửa sổ có đủ nội dung bài và các bình luận đọc thẳng từ Beincom, cũ → mới, trả lời nằm dưới bình luận gốc. Có **Xem N trả lời** và **Xem bình luận cũ hơn**.
  - Mỗi bình luận có Trả lời (điền sẵn @tên), Ẩn, 🧹 Dọn tài khoản, Mở ↗.
  - Ô viết bình luận ở cuối cửa sổ, Ctrl + Enter để gửi. Bình luận vừa gửi hiện ngay.
  - Thẻ **Bình luận mới** chuyển lên ngay dưới Bài mới đăng.
- **Biểu cảm trong Chat giống Beincom**:
  - Sửa lỗi thả biểu cảm: addon gửi lệnh tới sai địa chỉ (`v4/reactions`), nay gửi đúng `v5/reactions` như web.
  - Biểu cảm riêng của Beincom (tim tím, tên lửa, ngón cái… và linh vật Bamzo) hiện bằng ảnh của Beincom thay vì chữ `:bic_…:`, cả dưới tin và trong chữ của tin.
  - Hộp chọn biểu cảm: hàng nhanh gồm biểu cảm bạn vừa dùng rồi các biểu cảm Beincom hay dùng nhất. Bấm … để xem đủ ba nhóm Beincom, Bamzo, Biểu tượng. Bộ emoji ở ô gõ có thêm nhóm Beincom và Bamzo.
- Sửa: bấm ảnh trong khung bình luận (thread) nay mở đúng ảnh đó và chuyển qua lại giữa các ảnh của thread. "Tới tin nhắn" nháy đúng bình luận.

## v0.43.0 — 14/10/2026
- **Tự kiểm tra có thêm nhóm Chat Beincom** (Nhật ký → Tự kiểm tra, khi đã bật Chat). Addon gọi thử, chỉ đọc, từng phần mà trang Chat và lần quét dùng:
  - đăng nhập chat, danh sách cộng đồng và kênh, số tin đã đọc;
  - nhắc tên và thread chưa đọc (kiểm tra nhanh mỗi phút);
  - vai trò và quyền (nút Xoá tin, Ghim);
  - tin nhắn bị báo cáo, tin trong kênh, bình luận (thread);
  - biểu cảm, tin đã ghim, gợi ý @tên, thread đang theo dõi.

  Mục nào hỏng thì biết ngay, kèm lý do. Nếu chat chưa nhận phiên đăng nhập, chỉ báo một dòng.
- **Câu trả lời mẫu trong Chat**:
  - Gõ **/** ở đầu ô chat (hoặc bấm nút câu mẫu cạnh nút Aa) để hiện danh sách câu soạn sẵn. Gõ thêm vài chữ để lọc, không cần dấu: "/luadao" ra câu cảnh báo lừa đảo. Chọn bằng mũi tên, Enter hoặc Tab để chèn. Dùng được cả ở ô bình luận thread.
  - Có sẵn 5 câu cho admin: nội quy, cảnh báo lừa đảo, chào người mới, đã xoá quảng cáo, cảm ơn đã báo.
  - Mục **Sửa câu trả lời mẫu…** cuối danh sách mở hộp để thêm, sửa, xoá câu, thêm câu từ ô đang gõ, hoặc khôi phục bộ mặc định.
  - Câu mẫu lưu trong máy và có trong bản sao lưu.

## v0.42.1 — 14/10/2026
- **Nhật ký cá nhân** (trang Chat): tin nhắn riêng với chính mình hiện tên "Nhật ký cá nhân" với ảnh đại diện của tài khoản bạn (trước đây chỉ ghi "Tin nhắn riêng"). Không có huy hiệu hay nút hồ sơ, và không bị tính là tin nhắn mới.
- **Popup mở nhanh hơn**:
  - Popup vẽ ngay số của lần mở trước rồi cập nhật, và chỉ nạp phần mã cần thiết.
  - Phần nền tính số trên icon không còn đọc cả nhật ký (nhanh gấp đôi khi nhật ký lớn).
  - Nếu popup vẫn mở chậm hơn 1,5 giây, addon ghi một dòng "Popup mở chậm" ở Nhật ký → Lỗi kỹ thuật, kèm thời gian từng phần, để tìm nguyên nhân.

## v0.42.0 — 14/10/2026
- **Tin nhắn chat bị báo cáo** (chủ / admin community, cần bật Chat Beincom):
  - Tab **Báo cáo** có thêm loại **Tin nhắn chat**, như mục "Tin nhắn bị báo cáo" ở trang quản trị của web. Mỗi tin có kênh, nội dung, tệp đính kèm, người gửi, lý do và số lượt báo cáo, lúc báo cáo đầu tiên.
  - **Ẩn** (ẩn tin khỏi kênh chat) hoặc **Bỏ qua** (giữ tin, đóng báo cáo), từng tin hoặc chọn nhiều. Theo Chạy thử, ghi Nhật ký. Tin bị ẩn được ghi vào hồ sơ vi phạm của người gửi. Có nút **Dọn tài khoản** khi báo cáo kèm mã Beincom của người gửi.
  - Mỗi lần quét, addon đọc danh sách này ở mọi community bạn làm chủ / admin. Có báo cáo mới thì có thông báo (Telegram loại "Báo cáo / gắn cờ"); bấm thông báo để mở thẳng mục này. Số tin được cộng vào huy hiệu tab Báo cáo, số trên icon và popup. **Việc cần làm** có từng tin, kèm nút Ẩn tin / Bỏ qua.
- **Báo tin nhắn riêng, nhắc tên, bình luận thread nhanh hơn**: addon kiểm tra nhẹ mỗi phút, không chờ tới lần quét. Mỗi lần chỉ vài lệnh đọc tới chat.beincom.com và không đọc nội dung tin nhắn. Lần quét và lần kiểm tra nhanh dùng chung mốc nên không báo trùng. Tắt ở Quy tắc & cài đặt → 💬 Chat Beincom → **Kiểm tra nhanh mỗi phút**.
- Bên trong: mã trang Chat tách thành nhiều tệp nhỏ trong thư mục `chat/`. Giao diện không đổi.

## v0.41.0 — 14/10/2026
- **Biểu cảm dưới tin** (trang Chat):
  - Mỗi tin hiện các biểu cảm và số lượt; biểu cảm bạn đã thả được tô màu. Rê chuột vào để xem ai đã thả.
  - Bấm một biểu cảm để thả / bỏ. Nút **😊** (rê chuột vào tin) hoặc **+** mở hộp chọn: 8 biểu cảm nhanh, bấm … để xem thêm.
- **Tìm tin nhắn**: nút 🔍 ở đầu cuộc trò chuyện mở khung tìm **Kênh này / Mọi nơi**. Kết quả ghi rõ kênh, có nút **Mở**: tới đúng tin (bình luận thì mở khung bình luận và nháy tin đó). Gõ ở ô tìm bên trái rồi **Enter** cũng tìm trong tin nhắn ở mọi nơi.
- **Báo bình luận mới ở thread bạn theo dõi** khi trang Chat đang đóng: sau mỗi lần quét có thông báo (và Telegram loại "Tin nhắn riêng, nhắc tên trong chat") — số thread, số lần nhắc bạn, tên người tham gia, không kèm nội dung. Bấm để mở trang Thread đang theo dõi. Bật / tắt ở Quy tắc & cài đặt → 💬 Chat Beincom.

## v0.40.0 — 14/10/2026
- **Bấm tên người trong trang Chat** (tên hoặc ảnh đại diện ở tin nhắn, ở bình luận, đầu tin nhắn riêng) để mở hồ sơ:
  - Tên, huy hiệu, link trang cá nhân, nút nhắn riêng (nếu đã có tin nhắn riêng với người đó).
  - **Hồ sơ vi phạm** addon đã ghi nhận: tóm tắt và 3 lần gần nhất.
  - **Tìm bài** của người này còn hiện trong các community bạn quản trị.
  - Admin kênh: **xoá một lần các tin của người này** đang hiện trong kênh (theo Chạy thử, ghi Nhật ký).
  - **🧹 Dọn tài khoản…** mở thẳng hộp Dọn tài khoản trên Dashboard (ẩn bài / bình luận, tuỳ chọn cấm). **Hồ sơ trên Dashboard** mở thẳng hồ sơ vi phạm.
- **Ghim tin**: admin kênh (và trong tin nhắn riêng) có nút **Ghim / Bỏ ghim** khi rê chuột vào tin; tin đã ghim có nhãn. Nút 📌 ở đầu cuộc trò chuyện (có số tin đã ghim) mở khung **Tin nhắn đã ghim**, có nút Tới tin nhắn. Ghim theo Chạy thử và ghi Nhật ký.
- **Gợi ý @tên khi gõ** (ô gõ và ô bình luận): gõ @ và vài chữ thì hiện người trong kênh (kèm huy hiệu). Mũi tên chọn, Enter / Tab chèn, Esc đóng. Ở kênh có thêm @all / @channel / @here.
- **Sửa tin của mình**: nút **Sửa** (hoặc bấm mũi tên lên khi ô gõ trống), Enter lưu, Esc huỷ; tin hiện "đã sửa".
- **Bản nháp**: chữ đang gõ được giữ riêng cho từng cuộc trò chuyện và từng thread khi chuyển qua lại. Danh sách bên trái ghi "✏ Nháp: …". Nháp chỉ lưu trong máy, tự xoá sau 7 ngày.
- Sửa: Nhật ký ghi "Xoá tin chat" thay vì chữ "delete".

## v0.39.0 — 14/10/2026
- **Thread đang theo dõi** trong trang Chat, như nút "Thread" trên web Beincom:
  - Mục **Thread** ở đầu danh sách bên trái, có số thread có bình luận chưa đọc (đỏ khi có người nhắc tên bạn).
  - Bấm vào: danh sách các tin bạn đang theo dõi ở mọi cộng đồng và tin nhắn riêng, mới nhất trước. Mỗi tin có kênh, người viết, đoạn đầu tin, người tham gia, số bình luận, số bình luận mới / số lần nhắc tên.
  - Lọc **Tất cả / Chưa đọc**, nút đọc lại.
  - Bấm một thread: mở cuộc trò chuyện và khung bình luận của tin đó; số chưa đọc giảm.
  - Mở thẳng bằng địa chỉ `chat.html#threads`. Dùng được trên điện thoại.

## v0.38.0 — 14/10/2026
- **Thread (bình luận) trong trang Chat**, như web Beincom: mỗi tin nhắn có thể bình luận và theo dõi như một nhóm chat nhỏ.
  - Cuộc trò chuyện chỉ hiện tin gốc. Tin có bình luận có thanh dưới tin: ảnh người tham gia, **N bình luận**, **Theo dõi / Đang theo dõi**.
  - Bấm "N bình luận" (hoặc nút **Bình luận** khi rê chuột vào tin) để mở khung bình luận bên phải. Khung có tin gốc, các bình luận, ô viết bình luận (Enter gửi, phím tắt định dạng như ô gõ chính) và nút Theo dõi. Trên điện thoại, khung phủ cả màn hình.
  - Bình luận mới tự hiện trong khung đang mở và cộng vào số bình luận. Mở khung là đánh dấu đã đọc thread, như web.
- **Huy hiệu cạnh tên** như web: **tích xác minh** (hồ sơ phụ đã xác minh màu xám), **kim cương** cho tài khoản Premium. Có ở tin nhắn, danh sách tin nhắn riêng và đầu cuộc trò chuyện.

## v0.37.0 — 14/10/2026
- **Bộ gõ tin nhắn mới** trong trang Chat, như web Beincom:
  - **Thanh định dạng**: in đậm, in nghiêng, gạch ngang, chèn link, mã, trích dẫn, danh sách, danh sách số. Bấm lại thì bỏ định dạng. Phím tắt như web: Ctrl + B / I, Ctrl + Shift + X, Ctrl + Alt + K / C, Ctrl + Shift + 7 / 8 / 9. Shift + Enter trong danh sách tự thêm mục kế tiếp. Ctrl + Z hoàn tác được.
  - Nút **Aa** ẩn / hiện thanh định dạng (nhớ trong máy).
  - **Độ ưu tiên của tin nhắn**: Tiêu chuẩn / Quan trọng / Khẩn cấp. Tin có độ ưu tiên hiện nhãn QUAN TRỌNG / KHẨN CẤP.
  - **Xem trước** (biểu tượng con mắt, Ctrl + Alt + P): xem tin sẽ hiện thế nào trước khi gửi.
  - **Đính kèm tệp**: chọn tệp, dán ảnh, hoặc kéo thả vào cuộc trò chuyện. Tối đa 10 tệp, mỗi tệp 25 MB. Tệp tải lên ngay; gửi chỉ có tệp cũng được.
  - **Emoji**: hay dùng (nhớ trong máy), mặt cười, cử chỉ, trái tim, crypto.
- **Tin nhắn hiện đúng định dạng**: trích dẫn, danh sách, khối mã, gạch ngang, nghiêng, link có chữ, tiêu đề.
- **Lời mời** thành tab nằm cạnh **Tin nhắn riêng** (có số lời mời, sáng lên khi có lời mời chưa đọc; nhớ tab đang chọn). Tìm hoặc lọc Chưa đọc thì hiện cả hai.

## v0.36.0 — 14/10/2026
- **Lời mời trò chuyện tách riêng** (Beincom gọi là "Yêu cầu nhắn tin": tin nhắn riêng từ người chưa kết nối với bạn, như tin nhắn từ người lạ):
  - Trang Chat có mục riêng **Lời mời trò chuyện**, có số lời mời, nằm dưới Tin nhắn riêng. Mỗi lời mời ghi rõ đang chờ, bị Beincom xếp vào Spam, hay bạn đã bỏ qua.
  - Mở một lời mời: thanh **Chấp nhận / Bỏ qua** phía trên ô gõ. Bỏ qua có hỏi lại.
  - Trả lời một lời mời là chấp nhận lời mời đó (như web Beincom). Lời mời chuyển sang Tin nhắn riêng.
  - Lời mời bạn gửi đi vẫn nằm trong Tin nhắn riêng, ghi "Bạn đã gửi lời mời"; chưa gõ tiếp được cho tới khi người nhận chấp nhận.
  - Thông báo, Việc cần làm và thẻ Tin nhắn chat cũng ghi riêng lời mời trò chuyện với tin nhắn riêng.

## v0.35.0 — 14/10/2026
- **Xem ảnh phóng to trong trang Chat**: bấm ảnh trong tin nhắn thì ảnh phóng to ngay trong trang, không mở tab mới.
  - Muốn mở tab thì bấm nút **Mở tab mới** trong khung xem. Ctrl + bấm vẫn mở tab như trước.
  - Nhiều ảnh thì xem **như playlist**: dải ảnh nhỏ phía dưới, nút ‹ ›, phím ← → (Home / End về đầu / cuối), vuốt ngang trên điện thoại. Gồm mọi ảnh của cuộc trò chuyện, cũ đến mới.
  - Ảnh lớn hơn màn hình: bấm vào ảnh để xem đúng cỡ, bấm lại để thu về.
  - **Tới tin nhắn**: đóng khung và nhảy tới tin có ảnh đó. Esc hoặc ✕ để đóng.
- **Tin có nhiều ảnh** hiện gọn thành lưới: tối đa 4 ô, ô cuối ghi "+N" nếu còn ảnh.
- Sửa: ảnh chỉ có bản xem trước (không có link ảnh gốc) trước đây không hiện trong tin.

## v0.34.0 — 14/10/2026
- **Mở nhanh hơn**:
  - **Popup** (bấm nút addon trên trình duyệt) hiện số liệu ngay: nền ghi sẵn một gói số đếm nhỏ sau mỗi lần quét / xử lý, popup chỉ đọc gói này thay vì đọc cả kết quả quét rồi chấm lại từng bài.
  - **Trang Chat**: đọc mọi thứ trong một lượt song song. Lần đầu chỉ lấy tên người của 8 tin nhắn riêng gần nhất (và tin nhắn riêng còn chưa đọc), quyền dùng bản đã nhớ. Phần còn lại đọc ngay sau mà không bắt trang chờ. Các lệnh của trang Chat không còn đọc cả kết quả quét / nhật ký mỗi lần.
- **Bên trái trang Chat gọn hơn**:
  - Hiện trước **8 tin nhắn riêng** gần nhất (biết ngay ai đang nhắn).
  - Hiện **5 cộng đồng**: cộng đồng bạn đã **ghim** trên Beincom lên đầu (có biểu tượng ghim, theo thứ tự ghim), rồi cộng đồng có tin mới nhất.
  - Còn lại sau nút **Xem thêm** / **Thu gọn**. Khi tìm hoặc lọc thì hiện đủ.
  - Khung chờ lúc mới mở.

## v0.33.0 — 14/10/2026
- **💬 Trang Chat** (nút 💬 Chat trên Dashboard và popup; bấm thông báo tin nhắn riêng cũng mở trang này): đọc và nhắn tin ngay trong addon.
  - Bên trái: tìm, lọc Tất cả / Chưa đọc / Tin nhắn riêng; tin nhắn riêng và kênh chat theo từng community, số tin chưa đọc, số lần nhắc tên.
  - Cuộc trò chuyện: bong bóng tin (tin của bạn bên phải), ảnh đại diện, chia theo ngày, vạch "Tin chưa đọc", link, @nhắc tên (tô sáng khi nhắc bạn), ảnh / tệp đính kèm, trích dẫn tin được trả lời.
  - Gõ tin (Enter gửi, Shift + Enter xuống dòng), **Trả lời**, **Sao chép**, **Xoá** (tin của bạn; tin người khác nếu bạn là admin kênh — theo Chạy thử, ghi Nhật ký). Tải tin cũ hơn khi cuộn lên; tin mới tự hiện khi trang đang mở. Kênh chỉ xem thì không gõ được.
  - Mở nhanh: hiện ngay danh sách lần trước, đọc mọi kênh trong một lượt, ghi nhớ quyền và tên người.
  - Giao diện sáng / tối theo máy, dùng được trên điện thoại. Nội dung tin chỉ hiện trong trang, addon không lưu lại.

## v0.32.0 — 14/10/2026
- **💬 Chat Beincom** (bật ở Quy tắc & cài đặt → Chat Beincom; addon xin quyền kết nối chat.beincom.com lúc bật, dùng chính phiên đăng nhập của bạn):
  - **Tin nhắn chat** (tab Bài viết): sau mỗi lần quét, tin mới trong kênh chat của các group bạn quản trị được chấm theo quy tắc bài viết (từ khoá, link cấm, liên hệ riêng, bộ mẫu chống lừa đảo); báo **đợt spam trong chat** (cùng link từ nhiều tài khoản) và người nhắn có **tên giống admin**. Nút **Xoá tin** (ở kênh bạn là admin — xoá là mất hẳn, có xác nhận, theo Chạy thử), **Bỏ qua**, **Cấm** người gửi.
  - **Tin nhắn riêng chưa đọc, nhắc tên**: thông báo / Telegram khi có tin nhắn riêng mới hoặc bạn được nhắc tên trong kênh — chỉ tên người gửi, addon không đọc nội dung tin nhắn riêng. Có ở Việc cần làm.
  - **Đăng bài: Gửi kèm vào kênh chat** — đăng ngay thì gửi thêm một tin (lời nhắn hoặc câu đầu của bài + link bài) vào kênh chat của từng group.
  - **Báo cáo tháng** có số tin chat tháng này / tháng trước, số người nhắn, người nhắn nhiều nhất.

## v0.31.0 — 14/10/2026
- **Thao tác hàng loạt không bị đứt giữa chừng**: ẩn / duyệt / xoá / cấm nhiều mục được chia thành nhiều đợt nhỏ (trình duyệt dừng phần chạy nền nếu một lệnh quá 5 phút); có **thanh tiến độ** (vd "Đang gửi lên Beincom: 37/120") và nút **Dừng**. Mỗi mục làm xong được ghi ngay — nếu trình duyệt vẫn tắt giữa chừng, lần sau addon ghi bù vào Nhật ký và đánh dấu bài đã ẩn.
- **🛡 Bảo vệ community** (tab Thành viên, mặc định bật): sau mỗi lần quét addon xem ai vừa vào (chỉ đọc) và báo ngay (kèm Telegram):
  - **Tài khoản giống admin**: tên / username giống admin của community (kể cả viết lách 0→o, 1→i, chữ Kirin…) hoặc tự nhận "Admin", "Hỗ trợ", "CSKH" — nút Cấm ở mọi community, Xoá khỏi group, Không phải. Nút **Tìm trong toàn bộ thành viên** để tìm cả người đã vào từ trước.
  - **Đợt vào ồ ạt**: từ 30 người vào trong 60 phút (đổi được) — thường là tài khoản ảo trước một đợt spam. Nút **Bật Duyệt thành viên**, xem danh sách người vừa vào, chọn người không có ảnh rồi xoá / cấm.
- Quy tắc lọc thành viên mới: **Mạo danh admin** — yêu cầu tham gia có tên giống admin thì Gợi ý từ chối (tên ngắn trùng tên admin, tên gần giống: Cần xem).

## v0.30.1 — 13/10/2026
- Nút **↑ Lên đầu trang** ở góc dưới phải mọi tab (hiện khi đã cuộn xuống).
- Đổi tab giờ mở tab mới từ đầu trang (trước đây giữ vị trí cuộn của tab cũ).

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
