// Trang Chat — danh sách bên trái: tin nhắn riêng / lời mời (tab), Thread, cộng đồng (đã ghim trước), tìm / lọc, Xem thêm;
// trạng thái trống / chưa bật / lỗi.

// ---------- Danh sách cuộc trò chuyện ----------

const asDm = (c) => ({ ...c, kind: 'dm', teamTitle: '' });
const asReq = (c) => ({ ...c, kind: 'dm', req: true, teamTitle: '' });
function allChats() {
  return [...S.dms.map(asDm), ...S.requests.map(asReq), ...S.teams.flatMap((t) => t.channels.map((c) => ({ ...c, kind: 'ch', teamTitle: t.title, teamIcon: t.icon || '' })))];
}

// Dòng phụ của lời mời trò chuyện / lời mời bạn gửi đi
const REQ_STATUS = { pending: 'Lời mời đang chờ', spammed: 'Lời mời bị xếp vào Spam', ignored: 'Bạn đã bỏ qua' };
function contactNote(c) {
  const k = c.contact;
  if (!k) return '';
  if (k.incoming) return REQ_STATUS[k.status] || 'Lời mời trò chuyện';
  if (k.sent) return 'Bạn đã gửi lời mời';
  if (k.ignoredByOther) return 'Lời mời của bạn bị bỏ qua';
  return '';
}
const findChat = (id) => allChats().find((c) => c.id === id) || null;
// Tin nhắn riêng chưa có tên (lần đọc nhanh chỉ lấy tên người của các tin gần nhất): tạm hiện @tên tài khoản
// Nhật ký cá nhân (nhắn cho chính mình): dòng phụ
const SELF_SUB = 'Ghi chú của riêng bạn';
const chatTitle = (c) => c.title || (c.kind === 'dm' || c.type === 'D' ? (c.other?.username ? '@' + c.other.username : 'Tin nhắn riêng') : 'Kênh chat');

function matches(c) {
  if (S.filter === 'unread' && !c.unread && !c.mentions) return false;
  if (S.filter === 'dm' && c.kind !== 'dm') return false;
  if (!S.q) return true;
  const q = BG.norm(S.q);
  return BG.norm(`${chatTitle(c)} ${c.other?.username || ''} ${c.teamTitle}`).includes(q);
}

// Ảnh community nhỏ ở đầu mục cộng đồng (ẩn nếu không tải được)
function teamIconEl(src) {
  const img = el('img', { class: 'sec-icon', alt: '', loading: 'lazy' });
  img.addEventListener('error', () => img.remove());
  setImgSrc(img, src);
  return img;
}

function listItem(c) {
  const dm = c.kind === 'dm';
  const unread = c.unread > 0 || c.mentions > 0;
  return el(
    'button',
    { type: 'button', class: 'item' + (S.sel?.id === c.id ? ' sel' : '') + (unread ? ' unread' : ''), 'aria-current': S.sel?.id === c.id ? 'true' : null, onclick: () => openChat(c.id) },
    dm ? avatar({ name: chatTitle(c), chatId: c.other?.chatId, pictureAt: c.other?.pictureAt }) : avatar({ name: chatTitle(c), seed: c.id, channel: true, locked: c.type === 'P', src: c.main ? c.teamIcon : '' }),
    el('span', { class: 'item-main' }, el('span', { class: 'item-title' }, el('span', { class: 'nm' }, chatTitle(c)), dm && !c.self ? badges(c.other) : null), S.sel?.id !== c.id && draftOf(c.id) ? el('span', { class: 'item-sub draft' }, '✏ Nháp: ' + draftOf(c.id).replace(/\s+/g, ' ').slice(0, 60)) : el('span', { class: 'item-sub' }, dm ? (c.self ? SELF_SUB : c.type === 'G' ? 'Nhóm chat' : [c.other?.username ? '@' + c.other.username : contactNote(c) ? '' : 'Tin nhắn riêng', contactNote(c)].filter(Boolean).join(' · ')) : c.purpose || c.teamTitle)),
    el('span', { class: 'item-side' }, el('span', { class: 'item-time' }, shortTime(c.lastPostAt)), c.mentions ? el('span', { class: 'badge at' }, '@' + c.mentions) : c.unread ? el('span', { class: 'badge' }, c.unread > 99 ? '99+' : c.unread) : null),
  );
}

// Nút "Xem thêm N …" / "Thu gọn" dưới một nhóm
function moreBtn(key, hidden, label) {
  const open = S.more.has(key);
  if (!hidden && !open) return null;
  return el(
    'button',
    {
      type: 'button',
      class: 'more-btn',
      'aria-expanded': String(open),
      onclick: () => {
        open ? S.more.delete(key) : S.more.add(key);
        renderList();
      },
    },
    open ? 'Thu gọn' : `Xem thêm ${hidden} ${label}`,
  );
}

function toggleSec(key) {
  S.closed.has(key) ? S.closed.delete(key) : S.closed.add(key);
  try {
    localStorage.setItem(CLOSED_KEY, JSON.stringify([...S.closed]));
  } catch {}
  renderList();
}

// Tab Tin nhắn riêng / Lời mời (nhớ trong máy)
function setDmTab(tab, render = true) {
  S.dmTab = tab === 'req' ? 'req' : 'dm';
  S.closed.delete('dm');
  try {
    localStorage.setItem(DMTAB_KEY, S.dmTab);
  } catch {}
  if (render) renderList();
}

// tabs: [[mã, tên, số, có tin chưa đọc]] — đầu mục là các tab (bấm mũi tên để thu gọn)
// after: phần tử thêm cuối mục (vd nút xem lời mời đã bỏ qua)
function section(key, title, items, { limit = 0, label = '', pinned = false, tabs = null, tab = '', empty = '', moreKey = key, after = null, icon = '' } = {}) {
  if (!items.length && !tabs) return null;
  const closed = S.closed.has(key) && !S.q && S.filter === 'all';
  // Đang tìm / lọc thì hiện đủ; không thì giới hạn (tin nhắn riêng: 8 gần nhất)
  const cut = limit && !S.q && S.filter === 'all' && !S.more.has(moreKey) ? limit : 0;
  const shown = cut ? items.slice(0, cut) : items;
  const more = limit && !S.q && S.filter === 'all' ? moreBtn(moreKey, items.length - shown.length, label) : null;
  const head = tabs
    ? el(
        'div',
        { class: 'sec-head tabs' },
        el('button', { type: 'button', class: 'sec-tog', 'aria-expanded': String(!closed), 'aria-label': closed ? 'Mở rộng' : 'Thu gọn', onclick: () => toggleSec(key) }, svgChevron()),
        el(
          'div',
          { class: 'sec-tabs', role: 'tablist' },
          tabs.map(([k, name, n, hot]) => el('button', { type: 'button', role: 'tab', class: 'tab' + (k === tab ? ' on sec-title' : '') + (hot ? ' hot' : ''), 'aria-selected': String(k === tab), onclick: () => setDmTab(k) }, name, n ? el('span', { class: 'sec-n' }, String(n)) : null)),
        ),
      )
    : el('button', { type: 'button', class: 'sec-head', 'aria-expanded': String(!closed), onclick: () => toggleSec(key) }, svgChevron(), icon ? teamIconEl(icon) : null, el('span', { class: 'sec-title' }, title), pinned ? el('span', { class: 'pin', title: 'Cộng đồng bạn đã ghim trên Beincom' }, svgPin()) : null);
  return el('div', { class: 'sec' + (closed ? ' closed' : '') }, head, el('div', { class: 'sec-items' }, ...shown.map(listItem), items.length ? more : el('div', { class: 'sec-empty' }, empty), after));
}

// Lời mời đã bỏ qua / bị xếp vào Spam: ẩn sau nút "Xem thêm" (như tin nhắn riêng cũ)
const isDeclined = (c) => c.contact?.status === 'ignored' || c.contact?.status === 'spammed';
// Lời mời mới: có tin chưa đọc (số cạnh tab Lời mời chỉ đếm những lời mời này)
const isNewReq = (c) => !isDeclined(c) && !!(c.unread || c.mentions);

// Tin nhắn riêng và Lời mời trò chuyện: hai tab cạnh nhau. Đang tìm / lọc Chưa đọc thì gộp cả hai (lời mời có ghi chú)
function dmSection() {
  const dms = S.dms.map(asDm).filter(matches);
  const reqs = S.requests.map(asReq).filter(matches);
  if (S.q || S.filter === 'unread') return section('dm', 'Tin nhắn riêng', [...dms, ...reqs].sort((a, b) => (b.lastPostAt || 0) - (a.lastPostAt || 0)));
  const req = S.dmTab === 'req';
  const fresh = S.requests.filter(isNewReq).length;
  const active = reqs.filter((c) => !isDeclined(c));
  const declined = reqs.filter(isDeclined);
  const showOld = S.more.has('reqold');
  return section('dm', 'Tin nhắn riêng', req ? (showOld ? [...active, ...declined] : active) : dms, {
    limit: req ? SHOW_REQS : SHOW_DMS,
    label: req ? 'lời mời' : 'tin nhắn riêng',
    moreKey: req ? 'req' : 'dm',
    tabs: [
      ['dm', 'Tin nhắn riêng', 0, false],
      ['req', 'Lời mời', fresh, fresh > 0],
    ],
    tab: req ? 'req' : 'dm',
    empty: req ? (declined.length ? 'Không có lời mời mới.' : 'Không có lời mời trò chuyện nào. Lời mời là tin nhắn riêng từ người chưa kết nối với bạn.') : 'Chưa có tin nhắn riêng.',
    after: req && declined.length ? moreBtn('reqold', showOld ? 0 : declined.length, 'lời mời đã bỏ qua / spam') : null,
  });
}

function renderList() {
  const box = $('list');
  const all = allChats();
  const unreadN = all.filter((c) => c.unread || c.mentions).length;
  $('cnt-unread').textContent = unreadN ? unreadN : '';
  document.title = (unreadN ? `(${unreadN}) ` : '') + 'BeinGroup Chat';
  for (const b of document.querySelectorAll('#filters button')) b.classList.toggle('on', b.dataset.f === S.filter);
  if (!S.loaded && !S.error) return box.replaceChildren(...skeleton());
  if (!S.on || S.error) return box.replaceChildren();
  const parts = [threadsEntry(), dmSection()];
  if (S.filter !== 'dm') {
    // Cộng đồng: nền đã xếp (đã ghim trước theo thứ tự ghim, rồi có tin mới nhất); hiện 5, còn lại sau "Xem thêm"
    const all = !!S.q || S.filter !== 'all' || S.more.has('teams');
    const teams = S.teams.map((t) => [t, t.channels.map((c) => ({ ...c, kind: 'ch', teamTitle: t.title, teamIcon: t.icon || '' })).filter(matches)]).filter(([, l]) => l.length);
    for (const [t, list] of all ? teams : teams.slice(0, SHOW_TEAMS)) parts.push(section('t:' + t.id, t.title, list, { pinned: t.pinned, icon: t.icon }));
    if (!S.q && S.filter === 'all') parts.push(moreBtn('teams', teams.length - Math.min(teams.length, SHOW_TEAMS), 'cộng đồng'));
  }
  const shown = parts.filter(Boolean);
  box.replaceChildren(...(shown.length ? shown : [el('div', { class: 'list-empty' }, S.q ? 'Không có cuộc trò chuyện nào khớp.' : S.filter === 'unread' ? 'Đã đọc hết 🎉' : 'Chưa có cuộc trò chuyện nào.')]));
}

// Khung chờ lúc mới mở trang (chưa có danh sách lần trước)
function skeleton() {
  return Array.from({ length: 7 }, (_, i) => el('div', { class: 'item skel', 'aria-hidden': 'true', style: `--d:${i * 60}ms` }, el('span', { class: 'sk-av' }), el('span', { class: 'item-main' }, el('span', { class: 'sk-line' }), el('span', { class: 'sk-line short' }))));
}

function renderMe() {
  const m = S.me;
  $('me').replaceChildren(...(m ? [avatar({ name: m.fullname || m.username, chatId: m.chatId, pictureAt: m.pictureAt, size: 'sm' }), el('div', { class: 'who' }, el('b', {}, m.fullname || m.username), el('span', {}, '@' + m.username)), el('span', { class: 'dot' + (S.error ? ' off' : ''), title: S.error ? 'Mất kết nối chat' : 'Đang kết nối' })] : []));
}

// ---------- Trạng thái trống / chưa bật / lỗi ----------

function showEmpty(title, text, { enable = false, web = false } = {}) {
  $('empty').hidden = false;
  $('empty-title').textContent = title;
  $('empty-text').textContent = text;
  $('btn-enable').hidden = !enable && !web;
  $('btn-enable').textContent = enable ? 'Kết nối Chat Beincom' : 'Mở chat trên web Beincom';
  $('btn-enable').dataset.mode = enable ? 'enable' : 'web';
  for (const id of ['conv-head', 'msgs', 'composer', 'jump', 'req-bar', 'tview']) $(id).hidden = true;
  S.view = '';
}
