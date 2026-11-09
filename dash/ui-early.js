// Giao diện Dashboard (Cài đặt › Giao diện): đặt ngay trong <head>, trước khi vẽ, để không nháy giao diện cũ. Cài đặt lưu ở
// settings.dashUi; trang nhớ thêm ở localStorage để đọc được ngay (chrome.storage trả chậm hơn) — dash/look.js ghi lại.
try {
  if (localStorage.getItem('beinfusion-ui') === 'modern') document.documentElement.dataset.ui = 'modern';
} catch {}
