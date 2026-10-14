// Trang Chat — áp giao diện đã chọn ngay lúc mở trang, trước khi vẽ (không nháy giao diện mặc định). Đọc bản tính sẵn mà
// chat/look.js lưu ở localStorage: thuộc tính trên <html> (ui, style, density…) và biến màu cho nền sáng / tối.
(() => {
  try {
    const x = JSON.parse(localStorage.getItem('beingroup-chat-look') || 'null');
    if (!x || !x.data) return;
    const root = document.documentElement;
    const dark = x.mode === 'dark' || (x.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    Object.assign(root.dataset, x.data, { scheme: dark ? 'dark' : 'light' });
    for (const [k, v] of Object.entries((dark ? x.dark : x.light) || {})) root.style.setProperty(k, v);
  } catch {}
})();
