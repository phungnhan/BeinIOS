// BeinIOS — chỉnh trang Chat / Quản trị của addon cho điện thoại khi chạy trong khung ứng dụng (index.html).
// Không sửa mã addon (giữ được bản cập nhật từ addon gốc); pwa-shim.js nạp tệp này cùng pwa-ui.css:
//   - Chat: nút Dashboard (đầu danh sách ở BeinFusion theme; cạnh avatar ở Silk) đổi thành nút Login → Cài đặt › Proxy & Login
//     (thanh dưới đã có tab Quản trị); số tin chưa đọc hiện trên tab Chat của thanh dưới.
//   - Quản trị: góc trên bên phải có cụm Login + avatar như Chat; ẩn nút "💬 Chat" (thanh dưới đã có).
(() => {
  const PWA = window.BeinPWA;
  let shell = null;
  try {
    shell = window.top.BeinShell || null;
  } catch {}
  if (!PWA?.page?.inShell || !shell) return;
  const page = /\/chat\.html$/.test(location.pathname) ? 'chat' : /\/dashboard\.html$/.test(location.pathname) ? 'dash' : '';
  if (!page) return;
  const root = document.documentElement;
  root.dataset.host = 'beinios';
  root.dataset.beinPage = page;

  const NS = 'http://www.w3.org/2000/svg';
  // Icon nét vẽ (hợp cả BeinFusion theme lẫn Silk): Login = mũi tên vào cửa
  function strokeIcon(paths, size = 20) {
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
    for (const d of paths) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      svg.append(p);
    }
    return svg;
  }
  const LOGIN = ['M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 8l4 4-4 4', 'M14 12H4'];

  function loginButton(cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls + ' bein-login';
    b.title = 'Proxy & Login';
    b.setAttribute('aria-label', 'Proxy & Login');
    b.append(strokeIcon(LOGIN, cls === 'space-btn' ? 20 : 22));
    b.addEventListener('click', () => shell.setup('login'));
    return b;
  }

  // ---------- Chat ----------
  if (page === 'chat') {
    const swap = () => {
      for (const a of document.querySelectorAll('.head-actions a[href="dashboard.html"], .space-actions a[href="dashboard.html"]')) {
        a.replaceWith(loginButton(a.classList.contains('space-btn') ? 'space-btn' : 'icon-btn'));
      }
    };
    const start = () => {
      swap();
      // Silk vẽ lại cụm nút mỗi khi đổi mục -> đổi lại
      const sh = document.getElementById('space-head');
      if (sh) new MutationObserver(swap).observe(sh, { childList: true, subtree: true });
      // Số tin chưa đọc -> tab Chat ở thanh dưới
      const cnt = document.getElementById('cnt-unread');
      const badge = () => shell.setChatBadge?.(cnt?.textContent.trim() || '');
      if (cnt) {
        new MutationObserver(badge).observe(cnt, { childList: true, characterData: true, subtree: true });
        badge();
      }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
    return;
  }

  // ---------- Quản trị ----------
  async function renderAcct(box) {
    const me = await PWA.me().catch(() => null);
    const cfg = PWA.page.net.config;
    const bad = cfg?.status && !cfg.status.ok;
    const logged = !!Object.keys(cfg?.jars?.api || {}).length;
    const who = document.createElement('button');
    who.type = 'button';
    who.className = 'bein-me';
    who.title = (me?.name || 'Tài khoản') + (bad ? ' — phiên đăng nhập có vấn đề' : logged ? ' — đã đăng nhập' : ' — chưa đăng nhập');
    who.setAttribute('aria-label', 'Cài đặt tài khoản');
    who.append(PWA.avatarEl(me, 30));
    const dot = document.createElement('i');
    dot.className = 'bein-dot' + (bad ? ' bad' : logged ? '' : ' off');
    who.append(dot);
    who.addEventListener('click', () => shell.setup('main'));
    box.replaceChildren(loginButton('bein-icon'), who);
  }
  const startDash = () => {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const box = document.createElement('div');
    box.className = 'bein-acct';
    bar.querySelector('.brand')?.after(box);
    renderAcct(box);
    // Tài khoản / trạng thái đổi (dán đăng nhập mới, Chat tải xong, hết phiên) -> vẽ lại
    PWA.page.store.onChanged.addListener((ch, area) => {
      if ((area === 'pwa' && ch.config) || (area === 'local' && ch.chatOverviewCache)) renderAcct(box);
    });
    // Thanh trên cao / thấp hơn -> thanh tab dính ngay dưới (dashboard.js đo lại khi resize)
    new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(bar);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDash);
  else startDash();
})();
