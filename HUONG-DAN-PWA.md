# 📱 Hướng dẫn sử dụng BeinIOS — PWA & Cloudflare Proxy

**BeinIOS** là phiên bản Web App độc lập (Progressive Web App - PWA) được chuyển đổi từ addon **BeinFusion** (BeinGroup). Ứng dụng hoạt động mượt mà trên **iPhone 13** (và mọi thiết bị iOS/Android/PC) mà **không cần cài đặt qua App Store hay Sideload cáp USB**.

---

## 🏗️ Kiến trúc hoạt động

```
[iPhone 13 (Màn hình chính)]
        │
        ▼ (Mở BeinIOS PWA)
┌──────────────────────────────────────────────┐
│  BeinIOS App Shell (index.html)              │
│  ├─ 💬 Trò chuyện: chat.html (Giao diện Silk)│
│  └─ 📊 Quản trị: dashboard.html              │
└──────────────────────┬───────────────────────┘
                       │ (Fetch Interceptor)
                       ▼
┌──────────────────────────────────────────────┐
│  Cloudflare Worker Proxy                     │
│  (Xử lý CORS, thêm x-application & Cookie)   │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────┐
│  Hệ thống máy chủ Beincom                    │
│  (api.beincom.com, group.beincom.com)        │
└──────────────────────────────────────────────┘
```

---

## ⚡ BƯỚC 1: Dựng Cloudflare Worker Proxy (Mất 2 phút)

Do trình duyệt trên điện thoại có cơ chế bảo mật chặn CORS khi gọi API từ domain khác, Proxy này đóng vai trò trung gian chuyển tiếp an toàn:

1. Đăng nhập [dash.cloudflare.com](https://dash.cloudflare.com) (tài khoản miễn phí).
2. Vào **Workers & Pages** → Bấm **Create application** → **Create Worker**.
3. Đặt tên (ví dụ: `beinios-proxy`) → Bấm **Deploy**.
4. Bấm **Edit code**, xóa hết code cũ và dán toàn bộ nội dung từ file [`cloudflare-proxy/worker.js`](cloudflare-proxy/worker.js) vào.
5. Bấm **Save and deploy**.
6. Lưu lại đường link Worker của bạn, có dạng:
   `https://beinios-proxy.<subdomain>.workers.dev`

---

## 🚀 BƯỚC 2: Triển khai BeinIOS lên GitHub Pages (Miễn phí)

1. Mở repository **`phungnhan/BeinIOS`** trên GitHub.
2. Vào tab **Settings** → Menu bên trái chọn **Pages**.
3. Tại mục **Build and deployment**:
   * **Source:** Chọn `Deploy from a branch`.
   * **Branch:** Chọn nhánh `main` / thư mục `/ (root)`.
   * Bấm **Save**.
4. Chờ 1–2 phút, GitHub Pages sẽ cấp cho bạn một đường link HTTPS:
   👉 **`https://phungnhan.github.io/BeinIOS/`**

---

## 📲 BƯỚC 3: Cài đặt lên iPhone 13 (Không cần cáp, không cần máy tính)

1. Mở trình duyệt **Safari** trên iPhone 13 và truy cập vào link GitHub Pages của bạn:
   `https://phungnhan.github.io/BeinIOS/`
2. Bấm vào nút **Chia sẻ (Share)** ở thanh công cụ dưới đáy Safari (biểu tượng hình vuông có mũi tên chỉ lên).
3. Cuộn xuống và chọn: **"Thêm vào Màn hình chính" (Add to Home Screen)**.
4. Đặt tên là **BeinIOS** và bấm **Thêm (Add)**.
5. Biểu tượng **BeinIOS** sẽ xuất hiện ngay trên màn hình chính iPhone của bạn như một ứng dụng Native thực thụ!

---

## 🔑 BƯỚC 4: Kết nối tài khoản Beincom

1. Bấm mở icon **BeinIOS** từ màn hình chính iPhone 13 (ứng dụng mở toàn màn hình, không có thanh địa chỉ Safari).
2. Bấm vào biểu tượng **⚙️ Cài đặt & Proxy** ở góc trên bên phải (hoặc ở tab dưới đáy).
3. **Dán địa chỉ Cloudflare Proxy URL** đã tạo ở Bước 1.
4. **Dán Token hoặc Cookie đăng nhập** của tài khoản Beincom.
5. Bấm **"Kiểm tra kết nối & Lưu"**:
   * Hệ thống sẽ kiểm tra độ trễ (latency ms) và thông báo xanh: *Proxy hoạt động tốt!*
   * Ứng dụng sẽ tự động tải lại và bạn có thể bắt đầu Chat, duyệt bài, kiểm duyệt nhóm ngay lập tức!
