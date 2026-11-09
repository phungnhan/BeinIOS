// Dashboard → avatar góc trên: Hồ sơ cá nhân — đầu thẻ (ảnh bìa, avatar, tên, giới thiệu), ô số liệu, bốn thẻ: Thông tin
// (trang cá nhân Beincom + tài khoản), Quản trị, Hoạt động 30 ngày, Addon. Nội dung dựng bằng BG.selfProfile (lib/self.js),
// dùng chung với trang Chat và BeinIOS. Mở thẳng bằng địa chỉ #…&me=1.

// Thông tin trang cá nhân Beincom: nền đọc khi mở hồ sơ (user/me/profile — có email, số điện thoại nên không lưu), nhớ 5 phút
const selfInfo = { info: null, at: 0, error: '', loading: false };
const SELF_INFO_FRESH = 5 * 60e3;
// Thẻ -> các mục của BG.selfProfile (theo key)
const ME_TABS = [
  ['info', 'Thông tin', ['info', 'account']],
  ['admin', 'Quản trị', ['admin']],
  ['activity', 'Hoạt động', ['activity']],
  ['addon', 'Addon', ['addon']],
];
let meTab = 'info';

async function selfProfileData() {
  const { settings, chatOverviewCache, log, ...parts } = await chrome.storage.local.get(['settings', 'chatOverviewCache', 'log', ...BG.STATE_KEYS]);
  const state = BG.joinState(parts);
  return BG.selfProfile({
    me: state.me,
    chatMe: chatOverviewCache?.me,
    groups: state.snapshot?.groups || [],
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    lastScan: state.lastScan,
    lastResult: state.lastResult,
    info: selfInfo.info,
    log: log || [],
    version: chrome.runtime.getManifest().version,
  });
}

// Ảnh đại diện: ảnh Beincom nếu có, không thì chữ cái đầu (màu theo mã tài khoản)
const selfHue = (p) => [...String(p.id || p.name || '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
function selfAvatar(p, size) {
  const name = p.name || p.username || '?';
  const w = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const box = el('span', { class: 'me-av', style: `--s: ${size}px; --h: ${selfHue(p)}` }, ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase());
  if (p.avatar) {
    const img = el('img', { alt: '', src: p.avatar });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

async function renderMeBtn() {
  const btn = $('me-btn');
  if (!btn) return;
  const me = data.state?.me;
  btn.hidden = !me;
  if (!me) return;
  const p = { id: me.id, name: me.fullname || me.username, username: me.username, avatar: me.avatar };
  btn.title = `${p.name || 'Tài khoản'} — Hồ sơ cá nhân`;
  btn.replaceChildren(selfAvatar(p, 32));
}

const meIcon = (name) => el('span', { class: 'ic' }, icSvg(name));
function meCopy(label, value) {
  const what = label.toLowerCase();
  return el('button', { type: 'button', class: 'me-copy', title: 'Chép ' + what, 'aria-label': 'Chép ' + what, onclick: () => navigator.clipboard.writeText(value).then(() => toast('Đã chép ' + what)) }, meIcon('clipboard'));
}

// Một mục: tiêu đề nhỏ, ghi chú, các dòng nhãn / giá trị (2 cột khi đủ rộng; dòng có link hoặc giá trị dài chiếm cả hàng)
function meSection(s) {
  const rows = s.rows.map((r) => {
    const label = r.href ? el('a', { href: r.href, target: '_blank', rel: 'noopener noreferrer' }, r.label) : r.label;
    return el(
      'div',
      { class: 'me-row' + (r.href || r.value.length > 34 ? ' wide' : '') },
      el('span', { class: 'me-k' }, label),
      el('span', { class: 'me-vl' }, el('span', { class: 'me-v' + (r.tone ? ' ' + r.tone : '') }, r.value), r.copy ? meCopy(r.label, r.value) : null),
    );
  });
  return el('section', { class: 'me-sec', 'data-key': s.key }, el('h4', {}, s.title), s.note ? el('p', { class: 'muted small' }, s.note) : null, rows.length ? el('div', { class: 'me-rows' }, rows) : null);
}

async function renderSelf() {
  const p = await selfProfileData();
  const link = p.links[0];
  // Đầu thẻ: ảnh bìa (Beincom có thì dùng, không thì dải màu theo tài khoản), avatar, tên, @tên đăng nhập, giới thiệu
  const cover = el('div', { class: 'me-cover', style: `--h: ${selfHue(p)}` });
  if (p.cover) {
    const img = el('img', { alt: '', src: p.cover });
    img.addEventListener('error', () => img.remove());
    cover.append(img);
  }
  const sub = el('span', { class: 'me-sub' }, p.username ? el('span', {}, '@' + p.username) : null, p.username ? meCopy('Tên đăng nhập', '@' + p.username) : null);
  // replaceChildren in null thành chữ "null": chỉ đưa phần có thật
  $('me-head').replaceChildren(
    ...[
    cover,
    el(
      'div',
      { class: 'me-id' },
      selfAvatar(p, 76),
      el('div', { class: 'me-who' }, el('b', {}, p.name || 'Tài khoản Beincom', p.verified ? el('span', { class: 'me-vb', title: 'Đã xác minh' }, '✓') : null), sub, p.summary ? el('span', { class: 'muted small' }, p.summary) : null),
      el(
        'div',
        { class: 'me-acts' },
        el('button', { type: 'button', class: 'ghost sm', title: 'Đọc lại thông tin từ Beincom', disabled: selfInfo.loading, onclick: () => loadSelfInfo(true) }, selfInfo.loading ? 'Đang tải…' : 'Tải lại'),
        link ? el('a', { class: 'me-link', href: link.href, target: '_blank', rel: 'noopener noreferrer', title: link.label }, 'Trang Beincom ↗') : null,
      ),
    ),
    p.bio ? el('p', { class: 'me-bio' }, p.bio) : null,
    ].filter(Boolean),
  );
  // Ô số liệu
  $('me-stats').replaceChildren(...p.stats.map((x) => el('div', { class: 'me-stat' + (x.tone ? ' ' + x.tone : ''), title: x.hint || '' }, el('b', {}, x.value), el('small', {}, x.label))));
  // Thẻ: chỉ hiện thẻ có nội dung (Hoạt động cần nhật ký)
  const keys = new Set(p.sections.map((s) => s.key));
  const tabs = ME_TABS.filter(([id, , ks]) => id === 'info' || ks.some((k) => keys.has(k)));
  if (!tabs.some(([id]) => id === meTab)) meTab = 'info';
  $('me-tabs').replaceChildren(
    ...tabs.map(([id, label]) =>
      el(
        'button',
        {
          type: 'button',
          role: 'tab',
          class: 'me-tab' + (id === meTab ? ' on' : ''),
          'aria-selected': id === meTab ? 'true' : 'false',
          onclick: () => {
            meTab = id;
            renderSelf();
          },
        },
        label,
      ),
    ),
  );
  const want = tabs.find(([id]) => id === meTab)[2];
  const body = want.map((k) => p.sections.find((s) => s.key === k)).filter(Boolean).map(meSection);
  // Thông tin cá nhân chưa có: đang đọc / lỗi (bấm Tải lại)
  if (meTab === 'info' && !keys.has('info')) {
    const msg = selfInfo.error ? `Chưa đọc được trang cá nhân trên Beincom: ${selfInfo.error}. Bấm Tải lại để thử lại.` : 'Đang đọc trang cá nhân trên Beincom…';
    body.unshift(el('section', { class: 'me-sec', 'data-key': 'info' }, el('h4', {}, 'Thông tin cá nhân'), el('p', { class: 'muted small' + (selfInfo.error ? ' err-text' : '') }, msg)));
  }
  $('me-body').replaceChildren(...body);
}

async function loadSelfInfo(force = false) {
  if (selfInfo.loading || (!force && selfInfo.info && Date.now() - selfInfo.at < SELF_INFO_FRESH)) return;
  Object.assign(selfInfo, { loading: true, error: '' });
  if ($('me-card').open) renderSelf();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'selfInfo' });
    if (r?.status === 'ok') Object.assign(selfInfo, { info: r.info, at: Date.now() });
    else selfInfo.error = r?.status === 'need_login' ? 'phiên đăng nhập Beincom đã hết hạn' : r?.message || 'có lỗi';
  } catch (e) {
    selfInfo.error = String(e?.message || e);
  }
  selfInfo.loading = false;
  if ($('me-card').open) renderSelf();
}

async function openSelf() {
  await renderSelf();
  if (!$('me-card').open) $('me-card').showModal();
  loadSelfInfo();
}

$('me-btn').addEventListener('click', openSelf);
if (new URLSearchParams(location.hash.slice(1)).get('me')) setTimeout(openSelf, 0);
