// Dashboard — tab Quy tắc & cài đặt chia mục (như Cài đặt của iPhone / BeinIOS): cột trái là danh sách mục kèm trạng thái nhanh,
// bên phải chỉ hiện mục đang chọn. Không đổi cấu trúc thẻ cũ (BeinIOS nhúng trang với ?embed=settings và tự chia mục theo cấu
// trúc đó): chỉ gắn data-set-sec cho từng phần rồi ẩn phần không thuộc mục đang chọn (.set-off). Trang nhúng giữ nguyên.
// Nạp sau dash/icons.js (icSvg). Mở thẳng một mục: dashboard.html#tab=settings&sec=tg, hoặc showSettingsSec('tg').
const SET_SECTIONS = [
  ['Quản trị', [['scan', 'Hoạt động & quét', 'activity'], ['auto', 'Tự xử lý', 'bot'], ['watch', 'Theo dõi & nhắc việc', 'bell'], ['rules', 'Quy tắc thành viên', 'users'], ['postRules', 'Quy tắc bài viết', 'news']]],
  ['Tích hợp', [['chat', 'Chat Beincom', 'message'], ['tg', 'Telegram', 'send'], ['ai', 'Trợ lý AI', 'sparkles']]],
  ['Dữ liệu', [['backup', 'Sao lưu & đồng bộ', 'save'], ['beinios', 'BeinIOS (iPhone)', 'phone']]],
  ['Hiển thị', [['look', 'Giao diện', 'eye']]],
  ['Trợ giúp', [['help', 'Hướng dẫn', 'help']]],
];
const SET_LABEL = Object.fromEntries(SET_SECTIONS.flatMap(([, items]) => items.map(([k, label]) => [k, label])));
const SET_EMBED = new URLSearchParams(location.search).has('embed');
let settingsSec = '';

// Mỗi phần của tab thuộc mục nào (giống pwa-ui.js của BeinIOS); phần không gắn được mục nào thì test báo
function tagSettings() {
  const tag = (e, secs) => e && (e.dataset.setSec = secs);
  const col = document.querySelector('.rules-col');
  tag(col, 'rules postRules');
  for (const ch of col?.children || []) tag(ch, { 'rules-scope': 'rules postRules', rules: 'rules', 'post-rules': 'postRules' }[ch.id] || '');
  const card = $('settings');
  const own = Object.keys(SET_LABEL).filter((k) => k !== 'rules' && k !== 'postRules');
  tag(card, own.join(' '));
  for (const ch of card.children) {
    const c = ch.classList;
    if (c.contains('card-head')) tag(ch, own.join(' '));
    else if (ch.id === 'master-row') tag(ch, 'scan');
    else if (ch.id === 'settings-group') {
      tag(ch, 'scan auto');
      let sec = 'scan';
      for (const x of ch.children) {
        if (x.classList.contains('auto-title')) sec = 'auto';
        tag(x, sec);
      }
    } else
      tag(ch, c.contains('watch-group') ? 'watch' : c.contains('chat-group') ? 'chat' : c.contains('tg-group') ? 'tg' : c.contains('ai-group') ? 'ai' : c.contains('sync-group') || c.contains('backup-group') ? 'backup' : ch.id === 'beinios-group' ? 'beinios' : ch.id === 'look-set' ? 'look' : ch.id === 'help-set' ? 'help' : '');
  }
  // Nhóm một mình trong mục: tên nhóm trùng tên mục (tiêu đề thẻ đã ghi) nên ẩn
  const groups = [...card.children].filter((x) => x.classList.contains('group') && x.id !== 'settings-group');
  for (const g of groups) g.classList.toggle('set-solo', !groups.some((o) => o !== g && o.dataset.setSec === g.dataset.setSec));
}

function showSettingsSec(sec) {
  if (SET_EMBED) return;
  if (!SET_LABEL[sec]) sec = 'scan';
  settingsSec = sec;
  for (const e of document.querySelectorAll('[data-set-sec]')) e.classList.toggle('set-off', !e.dataset.setSec.split(' ').includes(sec));
  for (const b of $('set-nav').querySelectorAll('button[data-sec]')) {
    b.classList.toggle('active', b.dataset.sec === sec);
    b.setAttribute('aria-current', String(b.dataset.sec === sec));
  }
  const h2 = $('settings').querySelector(':scope > .card-head > h2');
  if (h2) h2.textContent = SET_LABEL[sec];
  // Thẻ trong tab này không gập (đã chia mục)
  for (const c of document.querySelectorAll('.rules-col > .card, #settings')) c.classList.remove('folded');
  try {
    localStorage.setItem('beingroup-set-sec', sec);
  } catch {}
  if (currentTab === 'settings') {
    writeHash();
    window.scrollTo(0, 0);
  }
}

// Trạng thái nhanh bên phải mỗi mục, đọc từ chính các ô trong trang (đã phản ánh cài đặt đã lưu)
function setNavStatus() {
  const nav = $('set-nav');
  if (!nav) return;
  const on = (id) => !!$(id)?.checked;
  const put = (k, text, warn = false) => {
    const em = nav.querySelector(`[data-sec="${k}"] em`);
    if (!em) return;
    em.textContent = text;
    em.classList.toggle('warn', warn);
  };
  put('scan', !on('active') ? 'Đang tắt' : on('dryRun') ? 'Chạy thử' : $('intervalMin').selectedOptions[0]?.text || '', !on('active') || on('dryRun'));
  put('auto', ['autoApprove', 'autoDecline', 'autoHideSpam', 'autoApprovePosts'].some(on) ? 'Bật' : 'Tắt');
  put('chat', on('chatEnabled') ? 'Bật' : 'Tắt');
  put('tg', on('tg-enabled') ? 'Bật' : 'Tắt');
  put('ai', BG.validAiKey($('ai-key').value) ? 'Khoá API' : 'Chép – dán');
  put('backup', on('syncSettings') ? 'Đồng bộ' : '');
  put('look', document.querySelector('input[name="dashUi"]:checked')?.value === 'modern' ? 'Hiện đại' : 'Cổ điển');
}

if (SET_EMBED) $('set-nav')?.remove();
else {
  const nav = $('set-nav');
  nav.replaceChildren(
    ...SET_SECTIONS.flatMap(([label, items]) => [
      el('div', { class: 'set-nav-label', text: label }),
      ...items.map(([k, name, ic]) =>
        el('button', { type: 'button', class: 'set-nav-item', 'data-sec': k }, el('span', { class: 'set-nav-ic', 'aria-hidden': 'true' }, icSvg(ic)), el('span', { class: 'set-nav-name', text: name }), el('em')),
      ),
    ]),
  );
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sec]');
    if (b) showSettingsSec(b.dataset.sec);
  });
  // ↑ ↓ chuyển mục khi đang ở danh sách
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...nav.querySelectorAll('button[data-sec]')];
    const i = items.findIndex((b) => b.dataset.sec === settingsSec) + (e.key === 'ArrowDown' ? 1 : -1);
    const b = items[(i + items.length) % items.length];
    e.preventDefault();
    showSettingsSec(b.dataset.sec);
    b.focus();
  });
  document.querySelector('main').classList.add('set-view');
  tagSettings();
  let saved = '';
  try {
    saved = localStorage.getItem('beingroup-set-sec') || '';
  } catch {}
  showSettingsSec(hashParams().get('sec') || saved || 'scan');
  let pending = 0;
  const refresh = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(setNavStatus);
  };
  document.addEventListener('change', refresh, true);
  document.addEventListener('input', refresh, true);
  chrome.storage.onChanged.addListener(() => setTimeout(refresh, 50));
  setTimeout(setNavStatus, 300);
}
