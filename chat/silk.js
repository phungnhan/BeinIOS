// Trang Chat — BeinFusion Silk (Lụa): thanh cộng đồng bên trái (Tất cả, Tin nhắn riêng, Thread, ảnh từng cộng đồng) và cột
// danh sách theo mục đang chọn; Giao diện, Dashboard, tài khoản ở góc phải hàng tiêu đề của cột danh sách (người dùng chọn
// để ở trên, 15/10/2026). Chỉ chạy khi chọn Silk ở bảng Giao diện.
// Silk làm một lần (v0.49.0): các bản sau không tự cập nhật theo code mới, chỉ khi được yêu cầu.

const SPACE_KEY = 'beingroup-chat-space';
let silkSpaceId = (() => {
  try {
    return localStorage.getItem(SPACE_KEY) || 'all';
  } catch {
    return 'all';
  }
})();

const isSilk = () => document.documentElement.dataset.ui === 'silk';

// Mục đang chọn: 'dm' | mã team | '' (tất cả — như BeinFusion theme). Đang tìm thì tìm khắp nơi
function silkSpace() {
  if (!isSilk() || S.q) return '';
  if (silkSpaceId === 'dm') return 'dm';
  return S.teams.some((t) => t.id === silkSpaceId) ? silkSpaceId : '';
}

function setSpace(id) {
  silkSpaceId = id;
  try {
    localStorage.setItem(SPACE_KEY, id);
  } catch {}
  renderList();
  $('list').scrollTop = 0;
}

// Mở một cuộc trò chuyện ở mục khác (thông báo, kết quả tìm, địa chỉ): chuyển sang mục của nó
function silkFollow(c) {
  if (!isSilk() || !c || silkSpaceId === 'all') return;
  const want = c.kind === 'dm' ? 'dm' : c.teamId || '';
  if (want && want !== silkSpace()) {
    silkSpaceId = want;
    try {
      localStorage.setItem(SPACE_KEY, want);
    } catch {}
  }
}

// Phần danh sách của mục đang chọn
function silkParts(sp) {
  if (sp === 'dm') return [dmSection()];
  const t = S.teams.find((x) => x.id === sp);
  const tree = S.filter === 'all';
  const list = BG.chatTreeOrder(t.channels.map((c) => ({ ...c, kind: 'ch', teamTitle: t.title, teamIcon: t.icon || '', tree })), t.communityId).filter(matches);
  return [section('t:' + t.id, t.title, list, { icon: t.icon, open: true })];
}

const RAIL_ICON = {
  all: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5ZM13 5.5A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5ZM4 14.5A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5ZM13 14.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5Z',
  dm: 'M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 20.5l1.6-5.2A8.4 8.4 0 1 1 21 11.5Z',
  threads: 'M14 9.5a2 2 0 0 1-2 2H7l-4 3.5V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2Zm4-1h1a2 2 0 0 1 2 2V20l-4-3.5h-5a2 2 0 0 1-2-2v-1',
  dash: 'M4 4h6.5v6.5H4ZM13.5 4H20v6.5h-6.5ZM4 13.5h6.5V20H4ZM13.5 13.5H20V20h-6.5Z',
};

function railBadge(n, kind = '') {
  return n ? el('span', { class: 'rail-badge ' + kind }, kind === 'dot' ? '' : n > 99 ? '99+' : String(n)) : null;
}

function renderSilk() {
  if (!isSilk()) return void $('rail').replaceChildren();
  const sp = silkSpace() || 'all';
  const unread = (list) => list.filter((c) => c.unread > 0 || c.mentions > 0).length;
  const btn = (id, label, kids, { on = false, onclick = () => setSpace(id), cls = '' } = {}) =>
    el('button', { type: 'button', class: 'rail-btn ' + cls + (on ? ' on' : ''), 'aria-label': label, title: label, 'aria-current': on ? 'page' : null, onclick }, ...kids);
  const dmN = unread(S.dms) + S.requests.filter(isNewReq).length;
  const teams = S.teams.map((t) => {
    const n = unread(t.channels);
    const at = t.channels.reduce((s, c) => s + (c.mentions || 0), 0);
    const face = t.icon ? el('img', { alt: '', loading: 'lazy' }) : null;
    if (face) {
      face.addEventListener('error', () => face.replaceWith(initials(t.title)));
      setImgSrc(face, t.icon);
    }
    return btn(t.id, t.title + (at ? ` — ${at} lần nhắc tên bạn` : n ? ` — ${n} kênh có tin chưa đọc` : ''), [el('span', { class: 'rail-face', style: grad(t.id) }, face || initials(t.title)), at ? railBadge(at, 'at') : n ? railBadge(1, 'dot') : null], { on: sp === t.id, cls: 'team' });
  });
  $('rail').replaceChildren(
    btn('all', 'Tất cả cuộc trò chuyện', [strokeSvg(RAIL_ICON.all, 22)], { on: sp === 'all' && S.view !== 'threads' }),
    el('span', { class: 'rail-sep', 'aria-hidden': 'true' }),
    btn('dm', 'Tin nhắn riêng' + (dmN ? ` — ${dmN} chưa đọc` : ''), [strokeSvg(RAIL_ICON.dm, 22), railBadge(dmN)], { on: sp === 'dm' }),
    btn('threads', 'Thread đang theo dõi' + (S.threadUnread ? ` — ${S.threadUnread} có bình luận mới` : ''), [strokeSvg(RAIL_ICON.threads, 22), railBadge(S.threadUnread || 0, S.threadMentions ? 'at' : '')], { on: S.view === 'threads', onclick: () => showThreads() }),
    el('span', { class: 'rail-sep', 'aria-hidden': 'true' }),
    el('div', { class: 'rail-teams' }, ...teams),
  );
  renderSpaceHead(sp);
}

// Đầu cột danh sách: tên mục đang chọn
function renderSpaceHead(sp) {
  const t = S.teams.find((x) => x.id === sp);
  const title = sp === 'dm' ? 'Tin nhắn riêng' : t ? t.title : 'Tất cả';
  // Dòng phụ ngắn (cột hẹp, góc phải có 3 nút): số cuộc trò chuyện / số kênh
  const all = S.dms.length + S.teams.reduce((n, x) => n + x.channels.length, 0);
  const sub = sp === 'dm' ? `${S.dms.length} cuộc trò chuyện` : t ? `Cộng đồng · ${t.channels.length} kênh` : `${all} cuộc trò chuyện`;
  let face = null;
  if (t?.icon) {
    face = el('img', { class: 'space-face', alt: '' });
    face.addEventListener('error', () => face.remove());
    setImgSrc(face, t.icon);
  }
  // Góc phải: Giao diện, Dashboard, tài khoản (chấm xanh: đang kết nối chat; đỏ: mất kết nối)
  const me = S.me ? S.me.fullname || S.me.username : '';
  const actions = el(
    'div',
    { class: 'space-actions' },
    el('button', { type: 'button', class: 'space-btn', 'aria-label': 'Giao diện', title: 'Giao diện', 'aria-haspopup': 'dialog', onclick: openLook }, strokeSvg(ICON_PALETTE, 20)),
    el('a', { class: 'space-btn', href: 'dashboard.html', 'aria-label': 'Mở Dashboard', title: 'Mở Dashboard' }, strokeSvg(RAIL_ICON.dash, 20)),
    S.me ? el('button', { type: 'button', class: 'space-me', title: me + (S.error ? ' — mất kết nối chat' : ' — đang kết nối') + ' · Hồ sơ cá nhân', 'aria-label': 'Hồ sơ cá nhân', onclick: () => openPerson(S.me) }, avatar({ name: me, chatId: S.me.chatId, pictureAt: S.me.pictureAt, size: 'sm' }), el('i', { class: 'rail-dot' + (S.error ? ' off' : '') })) : null,
  );
  $('space-head').replaceChildren(face || el('span', { class: 'space-face ic' }, strokeSvg(sp === 'dm' ? RAIL_ICON.dm : RAIL_ICON.all, 18)), el('div', { class: 'space-title' }, el('b', {}, title), el('span', {}, sub)), actions);
}
