# Cloudflare proxy cho BeinIOS

Webapp BeinIOS chạy trên GitHub Pages nên trình duyệt không cho gọi thẳng Beincom: Beincom chỉ cho phép trang `group.beincom.com` đọc kết quả (CORS). Proxy này là một Cloudflare Worker của riêng bạn. Nó nhận lệnh của webapp, chuyển tới Beincom kèm cookie đăng nhập, rồi trả kết quả lại cho webapp.

Gói miễn phí của Cloudflare là đủ (100.000 lượt gọi mỗi ngày).

## An toàn

Proxy có một số lớp bảo vệ:

- **Khoá bí mật `PROXY_KEY`.** Mọi lệnh phải kèm đúng khoá. Người khác biết địa chỉ proxy cũng không dùng được.
- **`ALLOWED_ORIGIN`.** Chỉ trang của bạn (ví dụ `https://phungnhan.github.io`) đọc được kết quả.
- **Chỉ chuyển tới máy chủ Beincom.** Danh sách gồm `api`, `group`, `chat`, `upload`, `auth` `.beincom.com`. Với `auth.beincom.com`, proxy chỉ cho làm mới phiên. Proxy không cho đăng nhập bằng mật khẩu.
- **Chỉ chuyển các header cần thiết.** Proxy không giả `Origin`/`Referer` của Beincom và không đi theo chuyển hướng.
- **Không ghi nhật ký, không lưu gì.** Trong lệnh có cookie đăng nhập, nên phải tắt observability: `wrangler.toml` đã có `enabled = false`. Nếu tạo Worker trên web, tắt Logs như ở bước 4 bên dưới.

Cookie mới mà Beincom gửi về (Set-Cookie) được trả cho webapp trong header `x-bein-set-cookie`. Webapp cập nhật cookie đã lưu theo header này, nhờ đó phiên đăng nhập không hết hạn sớm.

## Cách 1: tạo trên web (không cần cài gì)

1. **Tạo Worker.**
   1. Đăng nhập [dash.cloudflare.com](https://dash.cloudflare.com).
   2. Vào **Workers & Pages** → **Create** → **Create Worker**.
   3. Đặt tên `beinios-proxy` → **Deploy**.
2. **Dán mã.**
   1. Bấm **Edit code** và xoá hết mã mẫu.
   2. Dán toàn bộ tệp [`worker.js`](worker.js) → **Deploy**.
3. **Đặt khoá và trang được phép.** Vào **Settings** → **Variables and Secrets** → **Add**:
   - `ALLOWED_ORIGIN`, kiểu **Text**: `https://phungnhan.github.io`. Ghi địa chỉ trang, không ghi đường dẫn `/BeinIOS/`.
   - `PROXY_KEY`, kiểu **Secret**: một chuỗi ngẫu nhiên dài từ 32 ký tự trở lên. Có thể lấy từ trình tạo mật khẩu, hoặc mở F12 → Console và gõ `crypto.randomUUID() + crypto.randomUUID()`. Giữ kỹ chuỗi này để dán vào webapp.
4. **Tắt nhật ký.** Vào **Settings** → **Observability**, tắt **Workers Logs** nếu đang bật.
5. **Kiểm tra.** Mở `https://beinios-proxy.<tên của bạn>.workers.dev/health` trên trình duyệt. Thấy `"status": "ok"` là proxy đã chạy.

## Cách 2: dòng lệnh

Chạy trong thư mục `cloudflare-proxy`:

```bash
npx wrangler login
```

```bash
npx wrangler secret put PROXY_KEY
```

```bash
npx wrangler deploy
```

- `npx wrangler login` chỉ cần chạy lần đầu.
- `npx wrangler secret put PROXY_KEY` hỏi khoá rồi lưu khoá ở Cloudflare, không ghi vào tệp nào.
- Trước khi deploy, sửa `ALLOWED_ORIGIN` trong `wrangler.toml` nếu trang của bạn khác `https://phungnhan.github.io`.

## Cách 3: nối repo GitHub (tự cập nhật proxy mỗi lần đẩy mã)

Khi tạo Worker bằng **Import a repository** và chọn repo `BeinIOS`, Cloudflare mặc định đưa **cả repo** lên làm trang tĩnh. Khi đó, mở `/` thấy trang BeinIOS, còn `/health` trả 404 trống: proxy **không** chạy. Sửa như sau:

1. Vào Worker → **Settings** → **Build** → **Build configuration**, đặt **Root directory** là `cloudflare-proxy`. Giữ lệnh deploy `npx wrangler deploy`.
2. **Save**, rồi chạy lại bản dựng: vào **Deployments** → **Retry build**, hoặc đẩy mã mới lên.
3. Vào **Settings** → **Variables and Secrets**, thêm `PROXY_KEY` kiểu **Secret**. `ALLOWED_ORIGIN` đã có sẵn trong `wrangler.toml`.

Tên Worker phải trùng `name` trong `wrangler.toml` (`beinios-proxy`). Nếu bạn đặt tên khác, sửa `name` trong tệp cho khớp.

Mở `https://beinios-proxy.<tài khoản>.workers.dev/health`, thấy `"service": "BeinIOS proxy"` là đúng.

## Dùng với BeinIOS

Mở BeinIOS → **Cài đặt**, dán địa chỉ proxy và khoá `PROXY_KEY`, rồi làm tiếp theo [HUONG-DAN-PWA.md](../HUONG-DAN-PWA.md).

## Proxy trả lỗi

Webapp đọc mã trong header `x-bein-proxy-error` và báo ở Cài đặt:

| Mã | Nghĩa |
|---|---|
| (không có mã, 404) | Địa chỉ không phải proxy BeinIOS. Ví dụ: Worker chạy cả repo (xem Cách 3), là Cloudflare Pages, hoặc dán sai địa chỉ |
| `setup` | Chưa đặt `PROXY_KEY` hoặc `ALLOWED_ORIGIN` |
| `key` | Sai khoá |
| `origin` | Trang gọi không có trong `ALLOWED_ORIGIN` |
| `host` / `auth` | Địa chỉ không được phép |
| `upstream` | Không kết nối được Beincom |
| `redirect` | Beincom trả chuyển hướng: phiên hỏng, hoặc Beincom đổi đường dẫn |
