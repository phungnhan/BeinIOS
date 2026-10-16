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

## Bước 4: proxy và cookie đăng nhập

Lần đầu mở, ứng dụng tự hiện **Cài đặt**.

1. Dán **địa chỉ proxy** và **khoá proxy**.
2. **Lấy cookie trên máy tính** (Chrome / Edge):
   1. Mở **cửa sổ ẩn danh** và đăng nhập `group.beincom.com`.
   2. Bấm F12 → thẻ **Network**, gõ `api.beincom.com` vào ô lọc, rồi tải lại trang.
   3. Chuột phải một dòng (ví dụ `permissions`) → **Copy** → **Copy as cURL (bash)**.
   4. Muốn dùng Chat: mở `chat.beincom.com` trong cùng cửa sổ, lọc `chat.beincom.com/api` và chép một dòng như trên.
   5. Đóng cửa sổ ẩn danh. **Đừng bấm Đăng xuất**, vì đăng xuất làm cookie hết hiệu lực. Dùng cửa sổ ẩn danh để BeinIOS có phiên riêng, không giành phiên với trình duyệt bạn đang dùng.
3. **Chuyển đoạn cURL sang iPhone** qua kênh riêng của bạn, ví dụ Ghi chú iCloud hoặc tin nhắn gửi chính mình. Dán vào ô **Beincom**; đoạn của chat dán vào ô **Chat**. Dán xong thì xoá tin hoặc ghi chú dùng để chuyển.
4. Bấm **Lưu & kiểm tra**. Ứng dụng kiểm tra proxy, khoá, phiên Beincom và Chat. Kết quả chỉ hiện số đếm, không hiện tên.

Mọi thứ ổn thì ứng dụng quét Beincom lần đầu và hiện dữ liệu ở tab **Quản trị**.

Khi phiên hết hạn hẳn: chấm ở tab **Cài đặt** chuyển đỏ, Dashboard báo "Phiên đăng nhập Beincom hết hạn". Lấy cookie mới theo bước 2 rồi dán lại.

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
| `index.html` | Khung ứng dụng: thanh dưới, Cài đặt, thông báo, huy hiệu |
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

- **1.0.0 (16/10/2026).** Chạy thật phần nền của addon:
  - SharedWorker, có dự phòng Worker thường;
  - kho IndexedDB dùng chung;
  - cookie riêng cho Beincom / Chat, nhận dạng cURL;
  - tự làm mới phiên khi Beincom báo hết hạn;
  - proxy có khoá, chỉ nhận trang của bạn, chỉ chuyển header cần, không ghi nhật ký;
  - service worker lấy bản mới trước;
  - thông báo trong ứng dụng và thông báo hệ thống; huy hiệu;
  - link mở trong khung.
