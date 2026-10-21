// BeinIOS — chỉnh trang Chat / Quản trị của addon cho điện thoại khi chạy trong khung ứng dụng (index.html).
// Không sửa mã addon (giữ được bản cập nhật từ addon gốc); pwa-shim.js nạp tệp này cùng pwa-ui.css:
//   - Chat: nút Dashboard (đầu danh sách ở BeinFusion theme; cạnh avatar ở Silk) đổi thành nút Login → Cài đặt › Proxy & Login
//     (thanh dưới đã có tab Quản trị); số tin chưa đọc hiện trên tab Chat của thanh dưới; dòng tài khoản / avatar mở
//     Cài đặt › Tài khoản (kiểu Telegram).
//   - Quản trị: góc trên bên phải có cụm Login + avatar (avatar mở Cài đặt › Tài khoản); ẩn nút "💬 Chat" (thanh dưới đã
//     có); bỏ tab "Quy tắc & cài đặt" — nội dung chuyển vào Cài đặt của ứng dụng.
//   - dashboard.html?embed=settings (trong Cài đặt › một nhóm): chỉ hiện nhóm cài đặt / quy tắc đang chọn
//     (BeinEmbed.show), giữ nguyên ô cài đặt thật của addon nên đủ chức năng, lưu như cũ.
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
    // Dòng tài khoản (BeinFusion theme) / avatar (Silk): mở trang Tài khoản kiểu Telegram của ứng dụng thay hộp Hồ sơ
    // cá nhân của addon (chặn ở pha bắt trước khi tới trình xử lý của addon)
    const toAccount = (e) => {
      if (!e.target.closest?.('#me, .space-me')) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      shell.setup('account');
    };
    document.addEventListener('click', toAccount, true);
    document.addEventListener('keydown', toAccount, true);
    // Khung ứng dụng đổi # khi trang đã mở (Nhật ký của tôi, bấm thông báo): trang Chat chỉ đọc # lúc mở -> mở theo #
    window.addEventListener('hashchange', () => {
      const h = new URLSearchParams(location.hash.slice(1));
      if (h.get('c') && typeof window.openChat === 'function') window.openChat(h.get('c'), { fromHash: true });
      else if (h.has('threads') && typeof window.showThreads === 'function') window.showThreads({ fromHash: true });
    });
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

  // ---------- Cài đặt › một nhóm (dashboard.html?embed=settings) ----------
  if (page === 'dash' && new URLSearchParams(location.search).get('embed') === 'settings') {
    root.dataset.beinEmbed = 'settings';
    const tag = (el, secs) => el && (el.dataset.beinSec = secs);
    const show = (sec) => {
      for (const el of document.querySelectorAll('[data-bein-sec]')) el.classList.toggle('bein-off', !el.dataset.beinSec.split(' ').includes(sec));
      root.dataset.beinSection = sec;
      window.scrollTo(0, 0);
    };
    window.BeinEmbed = { show };
    const start = () => {
      // Mỗi phần của tab Quy tắc & cài đặt thuộc nhóm nào (phần mới / lạ: ẩn)
      const col = document.querySelector('.rules-col');
      tag(col, 'rules postRules');
      for (const ch of col?.children || []) tag(ch, { 'rules-scope': 'rules postRules', rules: 'rules', 'post-rules': 'postRules' }[ch.id] || '');
      const card = document.getElementById('settings');
      tag(card, 'scan auto watch chat tg backup');
      for (const ch of card?.children || []) {
        const c = ch.classList;
        if (c.contains('card-head')) tag(ch, 'scan auto watch chat tg backup');
        else if (ch.id === 'master-row') tag(ch, 'scan');
        else if (ch.id === 'settings-group') {
          tag(ch, 'scan auto');
          let sec = 'scan';
          for (const x of ch.children) {
            if (x.classList.contains('auto-title')) sec = 'auto';
            tag(x, sec);
          }
        } else tag(ch, c.contains('watch-group') ? 'watch' : c.contains('chat-group') ? 'chat' : c.contains('tg-group') ? 'tg' : c.contains('sync-group') || c.contains('backup-group') ? 'backup' : '');
      }
      if (typeof window.showTab === 'function') window.showTab('settings');
      // Dòng ô tích có chữ lẫn phần phụ (vd "Kèm hồ sơ vi phạm (chưa có)"): gói phần chữ lại để công tắc nằm gọn bên phải
      for (const lb of document.querySelectorAll('#settings label.check')) {
        const rest = [...lb.childNodes].filter((n) => n.nodeName !== 'INPUT' && (n.nodeType !== Node.TEXT_NODE || n.textContent.trim()));
        if (rest.length < 2) continue;
        const span = document.createElement('span');
        span.append(...[...lb.childNodes].filter((n) => n.nodeName !== 'INPUT'));
        lb.append(span);
      }
      // Thẻ đang thu gọn (đặt ở Dashboard): mở ra ở đây, không lưu lại
      for (const c of document.querySelectorAll('main .card.folded')) typeof window.setFolded === 'function' ? window.setFolded(c, false, { save: false }) : c.classList.remove('folded');
      show(shell.embedSection?.() || 'scan');
      // Hộp tự mở (Bắt đầu, Có gì mới, hỏi gửi báo cáo) để trang Quản trị lo — ở đây đóng lại
      const quiet = () => document.querySelectorAll('dialog[open]').forEach((d) => ['onboard', 'whatsnew', 'usage-consent'].includes(d.id) && d.close());
      quiet();
      new MutationObserver(quiet).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
      shell.embedReady?.();
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
    who.setAttribute('aria-label', 'Hồ sơ cá nhân');
    who.append(PWA.avatarEl(me, 30));
    const dot = document.createElement('i');
    dot.className = 'bein-dot' + (bad ? ' bad' : logged ? '' : ' off');
    who.append(dot);
    box.replaceChildren(loginButton('bein-icon'), who);
  }
  const startDash = () => {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    const box = document.createElement('div');
    box.className = 'bein-acct';
    bar.querySelector('.brand')?.after(box);
    // Addon có avatar Hồ sơ cá nhân (#me-btn, bản 0.53.0+): Login + avatar đó; addon cũ: avatar riêng. Bấm avatar: trang
    // Tài khoản kiểu Telegram của ứng dụng (chặn ở pha bắt, không mở hộp Hồ sơ cá nhân của addon)
    const meBtn = document.getElementById('me-btn');
    if (meBtn) box.append(loginButton('bein-icon'), meBtn);
    else renderAcct(box);
    box.addEventListener(
      'click',
      (e) => {
        if (!e.target.closest('.me-btn, .bein-me')) return;
        e.preventDefault();
        e.stopPropagation();
        shell.setup('account');
      },
      true,
    );
    // Tab "Quy tắc & cài đặt" chuyển vào Cài đặt của ứng dụng: chỗ nào trong Quản trị mở tab đó -> mở Cài đặt
    const setTab = document.querySelector('#tabs [data-tab="settings"]');
    if (setTab) {
      const away = () => {
        if (setTab.getAttribute('aria-selected') !== 'true') return;
        window.showTab?.('overview');
        shell.setup('main');
      };
      new MutationObserver(away).observe(setTab, { attributes: true, attributeFilter: ['aria-selected'] });
      away();
    }
    // Tài khoản / trạng thái đổi (dán đăng nhập mới, Chat tải xong, hết phiên) -> vẽ lại
    if (!meBtn) {
      PWA.page.store.onChanged.addListener((ch, area) => {
        if ((area === 'pwa' && ch.config) || (area === 'local' && ch.chatOverviewCache)) renderAcct(box);
      });
    }
    // Thanh trên cao / thấp hơn -> thanh tab dính ngay dưới (dashboard.js đo lại khi resize)
    new ResizeObserver(() => window.dispatchEvent(new Event('resize'))).observe(bar);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startDash);
  else startDash();
})();
