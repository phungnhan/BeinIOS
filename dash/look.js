// Dashboard — Cài đặt › Giao diện: Cổ điển (mặc định, dashboard.css) hoặc Hiện đại (dashboard-modern.css, html[data-ui="modern"]:
// thanh mục bên trái trên màn hình rộng, thẻ thoáng, hiệu ứng nhẹ). Đặt sớm ở dash/ui-early.js; ở đây theo cài đặt mỗi lần vẽ.
const DASH_UIS = { classic: 'Cổ điển', modern: 'Hiện đại' };

function applyDashUi(ui) {
  const v = ui === 'modern' ? 'modern' : 'classic';
  const root = document.documentElement;
  if ((root.dataset.ui || 'classic') !== v) {
    if (v === 'modern') root.dataset.ui = v;
    else delete root.dataset.ui;
    // Bố cục đổi: đo lại thanh trên / thanh tab cho các phần dính khi cuộn
    requestAnimationFrame(() => {
      if (typeof syncTopbar === 'function') syncTopbar();
      if (typeof syncSticky === 'function') syncSticky();
    });
  }
  try {
    localStorage.setItem('beinfusion-ui', v);
  } catch {}
  for (const r of document.querySelectorAll('input[name="dashUi"]')) r.checked = r.value === v;
}

for (const r of document.querySelectorAll('input[name="dashUi"]')) {
  r.addEventListener('change', async () => {
    if (!r.checked) return;
    applyDashUi(r.value);
    await saveSettings({ dashUi: r.value });
    toast('Đã chuyển sang giao diện ' + DASH_UIS[r.value] + '.');
  });
}
