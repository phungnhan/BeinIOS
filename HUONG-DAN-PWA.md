# BeinIOS: dùng BeinFusion trên iPhone như một ứng dụng

BeinIOS chạy nguyên mã của addon **BeinFusion** (Dashboard, trang Chat, phần chạy nền) trong trình duyệt, dưới dạng webapp (PWA). Trên iPhone, thêm webapp vào Màn hình chính là dùng được như một ứng dụng: không cần App Store, không cần máy Mac.

Địa chỉ: **https://phungnhan.github.io/BeinIOS/**

## Cách hoạt động

```
iPhone (biểu tượng BeinIOS)
  index.html: khung ứng dụng
    ├─ thanh dưới: Chat · Quản trị · Cài đặt
    ├─ chat.html, dashboard.html  (giữ nguyên của addon)
    └─ pwa-worker.js: luồng nền (SharedWorker), chạy background.js của addon
         ├─ IndexedDB: kho dữ liệu chung, thay chrome.storage
         └─ mọi lệnh tới Beincom
              │  kèm khoá proxy + cookie đăng nhập
              ▼
         Cloudflare proxy của bạn (cloudflare-proxy/worker.js)
              ▼
         api / chat / auth .beincom.com
```

- **`pwa-shim.js` thay các API `chrome.*` mà chỉ addon mới có:**
  - lệnh từ trang được gửi tới luồng nền;
  - hẹn giờ quét chạy bằng bộ đếm giờ;
  - thông báo của addon hiện trong ứng dụng, hoặc thành thông báo hệ thống;
  - số việc chờ hiện trên tab Quản trị và trên biểu tượng ứng dụng.
- **Link giữa Chat và Dashboard mở ngay trong khung.** Trên iPhone, cửa sổ mới sẽ mở ra Safari, mà Safari không có dữ liệu của ứng dụng.
- **Cookie Beincom có thể hết hạn.** Khi Beincom báo hết phiên, webapp tự làm mới phiên một lần, giống web Beincom. Cookie mới được lưu lại.

## Bước 1: dựng Cloudflare proxy

Làm theo [cloudflare-proxy/README.md](cloudflare-proxy/README.md). Mất khoảng 5 phút, gói miễn phí là đủ. Ghi lại **địa chỉ proxy** và **khoá `PROXY_KEY`**.

## Bước 2: GitHub Pages

Repo `phungnhan/BeinIOS` → **Settings** → **Pages**:

- **Source:** `Deploy from a branch`
- **Branch:** `main`, thư mục `/ (root)`

Mỗi lần đẩy mã mới, ứng dụng tự nhận bản mới khi mở lại (`sw.js` lấy bản trên mạng trước, chỉ dùng bản đã lưu khi mất mạng).

## Bước 3: cài lên iPhone

1. Mở **Safari** và vào `https://phungnhan.github.io/BeinIOS/`.
2. Bấm **Chia sẻ** → **Thêm vào Màn hình chính** → **Thêm**.
3. Từ nay mở BeinIOS từ biểu tượng trên Màn hình chính. Dữ liệu của ứng dụng tách riêng với Safari.

## Bước 4: proxy và đăng nhập Beincom

Lần đầu mở, ứng dụng tự hiện **Cài đặt › Proxy & Login**. Dán **địa chỉ proxy** và **khoá proxy** trước. Sau này vào lại trang này bằng tab **Cài đặt** → **Proxy & Login**, hoặc bấm nút **Login** (mũi tên vào cửa) ở góc trên trang Chat / Quản trị.

### Cách nhanh: nút trong addon BeinFusion trên máy tính (bản 0.51.0 trở lên)

1. Trên máy tính, mở **cửa sổ ẩn danh** và đăng nhập `group.beincom.com`. Muốn dùng Chat thì mở thêm `chat.beincom.com`.
   - Addon phải được bật **Cho phép ở chế độ ẩn danh**: trang Tiện ích → BeinFusion → Chi tiết.
   - Dùng cửa sổ ẩn danh để BeinIOS có phiên riêng, không giành phiên với trình duyệt bạn đang dùng.
2. Mở Dashboard của addon → **Cài đặt** → 📱 BeinIOS → **Chuyển đăng nhập sang BeinIOS**. Lần đầu bấm, addon xin quyền đọc cookie Beincom.
3. Lần đầu: trong hộp đó mở mục **Proxy của BeinIOS**, điền đúng địa chỉ và khoá proxy như ở BeinIOS → **Lưu & tạo mã ngắn**. Khoá chỉ lưu ở máy tính đó, không có trong sao lưu.
4. Addon hiện **mã QR ngắn**. Quét bằng **Camera iPhone**, mở trang, rồi bấm **Chép**.
   - Đăng nhập thật rất dài (hơn 4.000 ký tự), không vừa một mã QR. Vì vậy addon **mã hoá đăng nhập ngay trên máy tính** (AES-GCM) và gửi bản mã hoá lên proxy của bạn. Mã QR chỉ chứa mã số, khoá giải mã và địa chỉ proxy.
   - Khoá giải mã nằm sau dấu `#` của link, nên không gửi lên proxy hay GitHub. Proxy chỉ giữ bản mã hoá: lấy một lần là xoá, tự xoá sau 5 phút.
   - Trang `nhap.html` lấy bản mã hoá về, giải mã ngay trên iPhone, rồi xoá mã khỏi thanh địa chỉ.
   - Chưa điền proxy mà đăng nhập dài quá cho mã QR thì addon báo. Khi đó bấm **Chép** trên máy tính rồi tự chuyển đoạn chữ sang iPhone, và xoá bản trung chuyển sau khi dán.
5. Mở BeinIOS từ Màn hình chính → **Cài đặt** → **Dán từ addon**. iPhone hỏi "Dán" thì bấm **Dán**.
6. Đóng cửa sổ ẩn danh. **Đừng bấm Đăng xuất**, vì đăng xuất làm phiên hết hiệu lực.

Addon chép đủ ba nhóm cookie: Beincom, Chat, và máy chủ đăng nhập `auth.beincom.com`. Có nhóm cuối thì BeinIOS tự làm mới phiên được.

### Cách khác: dán cURL từ F12 (không cần addon)

1. Mở **cửa sổ ẩn danh** và đăng nhập `group.beincom.com`.
2. Bấm F12 → thẻ **Network**, gõ `api.beincom.com` vào ô lọc, rồi tải lại trang.
3. Chuột phải một dòng (ví dụ `permissions`) → **Copy** → **Copy as cURL (bash)**.
4. Muốn dùng Chat: mở `chat.beincom.com` trong cùng cửa sổ, lọc `chat.beincom.com/api` và chép một dòng như trên.
5. Chuyển đoạn cURL sang iPhone, rồi dán vào ô **Beincom** / **Chat** trong mục **Cách khác** ở Cài đặt.

Cuối cùng bấm **Lưu & kiểm tra**. Ứng dụng kiểm tra proxy, khoá, phiên Beincom và Chat. Kết quả chỉ hiện số đếm, không hiện tên.

Mọi thứ ổn thì ứng dụng quét Beincom lần đầu và hiện dữ liệu ở tab **Quản trị**.

Khi phiên hết hạn hẳn: chấm ở tab **Cài đặt** chuyển đỏ, Dashboard báo "Phiên đăng nhập Beincom hết hạn". Chuyển đăng nhập lại theo bước 4.

## Bước 5: thông báo (không bắt buộc)

Vào **Cài đặt** → **Bật thông báo**. Trên iPhone, nút này chỉ có tác dụng khi mở ứng dụng từ biểu tượng trên Màn hình chính. Khi ứng dụng đang mở, thông báo hiện ở đầu màn hình; bấm vào sẽ tới đúng tab liên quan.

## Giới hạn so với addon trên máy tính

- **Chỉ chạy khi ứng dụng đang mở.** iPhone dừng ứng dụng chạy ngầm nên không quét định kỳ, không báo, không gửi Telegram khi đã đóng. Mở lại thì ứng dụng quét ngay. Muốn theo dõi liên tục thì vẫn dùng addon trên máy tính.
- **Không đăng nhập bằng mật khẩu trong ứng dụng.** Proxy cố ý không cho, đăng nhập Beincom cũng cần captcha. Phải dùng cookie theo bước 4.
- **Dữ liệu tách với addon trên máy tính.** Muốn mang quy tắc và cài đặt sang: trên máy tính dùng Dashboard → Cài đặt → **Sao lưu**, rồi **Khôi phục** ở BeinIOS. Đồng bộ qua tài khoản Chrome chỉ có trong addon.
- **Link tới trang Beincom mở ra Safari.** Ví dụ hồ sơ người dùng hay bài gốc.
- **Chưa thử với Beincom thật:**
  - tải ảnh / video lên bài viết, vì kho lưu trữ của Beincom có thể chặn trang khác;
  - đường làm mới phiên `auth.beincom.com/v1/auth/public/http/refresh-session`, lấy từ mã của web Beincom.

## An toàn

- **Cookie là chìa khoá tài khoản Beincom.** Chỉ dán trên máy của bạn. **Xoá cookie khỏi máy này** (trong Cài đặt) xoá cookie ngay.
- **Nơi lưu cookie.** Cookie và dữ liệu lưu trong trình duyệt theo địa chỉ `https://phungnhan.github.io`. Mọi trang GitHub Pages khác của bạn cùng địa chỉ này đều đọc được, nên đừng đưa mã của người khác lên GitHub Pages của bạn. Muốn tách hẳn thì gắn tên miền riêng cho BeinIOS.
- **Cookie không lọt vào bản sao lưu.** Cookie nằm ở vùng riêng `pwa`, ngoài `chrome.storage`.
- **Proxy của riêng bạn.** Proxy có khoá, chỉ nhận trang của bạn, không ghi nhật ký. Không chia sẻ địa chỉ và khoá proxy.

## Cho người phát triển

| Tệp | Vai trò |
|---|---|
| `index.html` | Khung ứng dụng: thanh dưới (số tin chưa đọc trên tab Chat, việc chờ trên tab Quản trị), Cài đặt chung + các trang con (Tài khoản, nhóm cài đặt Quản trị / Tích hợp, Proxy & Login), báo bản mới, thông báo, huy hiệu |
| `pwa-ui.js`, `pwa-ui.css` | Chỉnh trang Chat / Quản trị của addon cho điện thoại khi nằm trong khung ứng dụng (không sửa mã addon): nút Login thay nút Dashboard, cụm Login + avatar ở góc trên Quản trị, avatar mở Cài đặt › Tài khoản, `dashboard.html?embed=settings` chỉ hiện một nhóm cài đặt |
| `pwa-shim.js` | Kho IndexedDB, gọi Beincom qua proxy (cookie, làm mới phiên), giả lập `chrome.*` ở trang |
| `pwa-worker.js` | Luồng nền: giả lập `chrome.*` (alarms, notifications, tabs…), chạy `background.js` |
| `sw.js` | Service worker: lấy bản mới trước, dùng bản lưu khi mất mạng; xử lý bấm thông báo |
| `cloudflare-proxy/` | Proxy |

Mã của addon (`background.js`, `bg/`, `lib/`, `chat/`, `dash/`) giữ nguyên. Trang `chat.html` và `dashboard.html` chỉ thêm một dòng `<script src="pwa-shim.js">`. Khi chạy như addon (`chrome-extension://`) hoặc ở trang xem thử (`file://`), dòng này không làm gì.

Lấy bản mới của addon từ repo gốc:

```bash
git fetch upstream
```

```bash
git merge upstream/main
```

Chạy kiểm thử:

```bash
node --test "test/*.test.js"
```

```bash
node test/pwa/pwa.e2e.mjs
```

- `node --test "test/*.test.js"` chạy kiểm thử của addon và `test/pwa.test.js`: kho, cookie, proxy, Cloudflare proxy.
- `node test/pwa/pwa.e2e.mjs` chạy webapp trong Chrome headless, với proxy thật và Beincom giả. Bài này thử:
  - cài đặt và làm mới phiên;
  - quét, Dashboard;
  - Chat;
  - báo → bấm → mở tab;
  - huy hiệu;
  - trình duyệt không có SharedWorker.

## Lịch sử BeinIOS

- **1.5.0 (21/10/2026).** Hồ sơ cá nhân gọn hơn, thêm Trang cá nhân và Nhật ký của tôi:
  - **Tài khoản:** chạm avatar mở trang cá nhân trên Beincom; chạm @tên đăng nhập dưới tên để chép. Bỏ các dòng tên đăng nhập, mã Beincom, Chat Beincom.
  - **Trang cá nhân:** thông tin cơ bản trên Beincom (họ tên, giới tính, ngày sinh, ngôn ngữ, tình trạng quan hệ) và liên hệ (email, số điện thoại, thành phố). Bấm **Sửa** để đổi, **Lưu** gửi thẳng lên Beincom như web Beincom. Tài khoản đã xác minh danh tính không đổi được họ tên, giới tính, ngày sinh; email đổi trên web Beincom.
  - **Nhật ký của tôi:** mở Nhật ký cá nhân của Beincom Chat (tin nhắn cho chính mình) ở tab Chat.
  - **Proxy & Login** chuyển xuống dưới phần Addon.
  - **Thanh dưới** kiểu Telegram: viên nổi nền kính trong nhẹ, icon đen, mục đang mở có nền xám, tab Cài đặt là avatar của bạn. Thanh dưới hiện cả khi đang ở Cài đặt; bấm Chat / Quản trị là sang ngay.
- **1.4.0 (21/10/2026).** Cài đặt phân nhóm rõ, có Hồ sơ cá nhân kiểu Telegram, đi cùng addon BeinFusion 0.53.0:
  - **Tài khoản / Hồ sơ cá nhân** (chạm thẻ tài khoản ở đầu Cài đặt, avatar ở góc trên Quản trị, dòng tài khoản / avatar ở Chat): avatar lớn giữa trang, tên, @tên đăng nhập; thẻ Trang cá nhân trên Beincom; tên đăng nhập, mã Beincom (chạm để chép), Chat; Proxy & Login; quyền quản trị theo từng cộng đồng; trạng thái quét. Cuộn xuống thì tên hiện ở thanh trên như Telegram.
  - Tab **Quy tắc & cài đặt** rời khỏi Quản trị, vào **Cài đặt** thành hai nhóm: **Quản trị** (Hoạt động & quét, Tự xử lý, Theo dõi & nhắc việc, Quy tắc thành viên, Quy tắc bài viết) và **Tích hợp** (Chat Beincom, Telegram, Sao lưu & đồng bộ). Mỗi dòng mở đúng nhóm đó, dùng chính ô cài đặt của addon nên đủ chức năng, lưu như cũ.
  - Cài đặt dùng thẻ bo tròn lớn, dòng cao, icon màu như Cài đặt của Telegram.
  - Mục **Về** hiện phiên bản **addon BeinFusion** (chạm để xem Có gì mới) và **BeinIOS**. Ứng dụng tự kiểm tra bản mới trên GitHub Pages khi mở lại / vào Cài đặt; có bản mới thì báo, chạm để cập nhật.
- **1.3.0 (21/10/2026).** Giao diện điện thoại gọn hơn, đủ chức năng:
  - **Cài đặt** thành trang cài đặt chung kiểu iPhone: thẻ tài khoản (tên, avatar, trạng thái), Proxy & Login, Thông báo, Giao diện Chat, Quy tắc & cài đặt quét, Nhật ký, Tải lại, Hướng dẫn, Phiên bản. Proxy & cookie đăng nhập nằm ở trang con **Proxy & Login**.
  - **Chat**: nút Dashboard (thanh dưới đã có tab Quản trị) đổi thành nút **Login** mở thẳng Proxy & Login, ở cả BeinFusion theme lẫn Silk.
  - **Quản trị**: góc trên bên phải có nút Login + avatar như Chat (avatar cùng màu với Chat). Ẩn nút "💬 Chat" vì đã có tab Chat; số tin chưa đọc hiện trên tab Chat ở thanh dưới. Thanh trên gọn hai hàng.
  - Thanh dưới dùng icon nét mảnh; chấm ở tab Cài đặt chỉ hiện khi cần chú ý (chưa đăng nhập / hết phiên / lỗi proxy).
- **1.2.0 (21/10/2026).** Mã QR ngắn qua proxy (chuyển nhanh):
  - addon mã hoá đăng nhập trên máy tính, gửi bản mã hoá lên proxy;
  - `nhap.html` lấy về và giải mã ngay trên iPhone;
  - proxy 2.1.0 có `/handoff` và Durable Object `HANDOFF`: Cloudflare tự tạo khi dựng, giữ bản mã hoá 5 phút, lấy một lần là xoá;
  - **Dán từ addon** bỏ qua ký tự xuống dòng / khoảng trắng lẫn vào khi chuyển đoạn chữ sang iPhone.
- **1.1.0 (16/10/2026).** Thêm cách đăng nhập bằng addon BeinFusion 0.51.0 (Cài đặt → Chuyển đăng nhập sang BeinIOS):
  - nút **Dán từ addon** trong Cài đặt;
  - trang nhận mã QR `nhap.html`;
  - ô cookie riêng cho máy chủ đăng nhập (`auth.beincom.com`), dùng khi làm mới phiên;
  - cách dán cURL chuyển xuống mục **Cách khác**.
- **1.0.2 (16/10/2026).** Thêm `wrangler.toml` ở gốc repo. Worker nối repo GitHub giờ tự dựng đúng proxy, không còn đưa cả repo lên làm trang tĩnh.
- **1.0.1 (16/10/2026).**
  - Màn hình Cài đặt chỉ đúng nguyên nhân khi proxy sai.
  - Địa chỉ proxy dán thừa đường dẫn được tự rút về địa chỉ gốc.
  - Proxy lên 2.0.1.
- **1.0.0 (16/10/2026).** Chạy thật phần nền của addon:
  - SharedWorker, có dự phòng Worker thường;
  - kho IndexedDB dùng chung;
  - cookie riêng cho Beincom / Chat, nhận dạng cURL;
  - tự làm mới phiên khi Beincom báo hết hạn;
  - proxy có khoá, chỉ nhận trang của bạn, chỉ chuyển header cần, không ghi nhật ký;
  - service worker lấy bản mới trước;
  - thông báo trong ứng dụng và thông báo hệ thống; huy hiệu;
  - link mở trong khung.
