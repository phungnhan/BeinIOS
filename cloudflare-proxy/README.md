# 🌐 Hướng dẫn dựng Cloudflare Worker Proxy cho BeinIOS

Proxy này giúp ứng dụng **BeinIOS (PWA)** gọi được toàn bộ API của Beincom (`api.beincom.com`, `group.beincom.com`, `chat.beincom.com`) mà **không bao giờ bị trình duyệt chặn CORS**.

---

## ⚡ Cách 1: Triển khai siêu nhanh qua Web Dashboard (Không cần cài đặt, mất 2 phút)

1. Đăng nhập vào trang quản trị Cloudflare: [dash.cloudflare.com](https://dash.cloudflare.com) (tạo tài khoản miễn phí nếu chưa có).
2. Ở thanh menu bên trái, chọn **Workers & Pages** → Bấm **Create application** (hoặc **Create Worker**).
3. Đặt tên cho Worker (ví dụ: `beinios-proxy`) → Bấm **Deploy**.
4. Sau khi tạo xong, bấm vào nút **Edit code** (Chỉnh sửa mã).
5. Xóa hết toàn bộ code mặc định trong ô biên tập, copy toàn bộ nội dung trong tệp [`worker.js`](worker.js) và dán vào.
6. Bấm nút **Deploy** (hoặc **Save and deploy**) ở góc trên bên phải.
7. **Lấy địa chỉ Proxy của bạn:**
   * Địa chỉ có dạng: `https://beinios-proxy.<ten-subdomain-cua-ban>.workers.dev`
   * Mở link này trên trình duyệt, nếu thấy hiện thông báo `{"status": "ok", "service": "BeinIOS Cloudflare Proxy"}` là thành công 100%!

---

## 💻 Cách 2: Triển khai bằng dòng lệnh (Terminal / CLI)

Nếu bạn đã quen dùng dòng lệnh trên máy tính:

```bash
cd "d:/KaiBrain/BeinIOS/cloudflare-proxy"

# 1. Đăng nhập tài khoản Cloudflare (chỉ cần làm lần đầu)
npx wrangler login

# 2. Triển khai Worker lên Cloudflare
npx wrangler deploy
```

Terminal sẽ in ra đường link worker của bạn, ví dụ:
`https://beinios-proxy.<subdomain>.workers.dev`

---

## 📱 Sử dụng với BeinIOS PWA

1. Mở ứng dụng **BeinIOS** (trên iPhone 13 hoặc trình duyệt máy tính).
2. Bấm vào biểu tượng **⚙️ Cài đặt & Proxy** ở góc trên màn hình.
3. Dán địa chỉ Cloudflare Worker của bạn vào ô **Cloudflare Proxy URL**.
4. Dán Token hoặc Cookie đăng nhập Beincom của bạn vào ô **Token / Cookie**.
5. Bấm **Kiểm tra kết nối & Lưu**: Hệ thống sẽ test độ trễ (latency) và báo kết nối thành công!
