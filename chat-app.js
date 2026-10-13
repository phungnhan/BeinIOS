// BeinGroup — trang Chat: danh sách cuộc trò chuyện (tin nhắn riêng, kênh chat theo community), đọc / gửi / trả lời / xoá tin.
// Mọi lệnh đi qua service worker (bg/chat.js: chatOverview, chatPosts, chatSend, chatView, chatDeleteMsg), dùng phiên đăng nhập
// Beincom như web. Nội dung tin chỉ nằm trong trang này, không lưu lại. Khi trang đang mở và đang xem: kênh đang mở đọc tin mới
// mỗi 4 giây, danh sách mỗi 30 giây. Tin nhắn dựng bằng phần tử DOM (không chèn HTML) nên nội dung lạ không chạy được.

const POLL_MS = 4000;
const LIST_MS = 30000;
const PAGE = 40;
const GROUP_GAP = 5 * 60e3;
const CLOSED_KEY = 'beingroup-chat-closed';
// Danh sách lần mở trước (tên, số chưa đọc — không có nội dung tin) trong bộ nhớ phiên của trình duyệt: mở lại là hiện ngay
const CACHE_KEY = 'chatOverviewCache';
// Bên trái hiện trước 8 tin nhắn riêng gần nhất và 5 cộng đồng (đã ghim trước, rồi có tin mới nhất); còn lại sau "Xem thêm"
const SHOW_DMS = 8;
const SHOW_TEAMS = 5;

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

const S = {
  on: false,
  me: null,
  teams: [],
  dms: [],
  sel: null,
  posts: new Map(),
  hasMore: false,
  loadingOlder: false,
  polling: false,
  sending: false,
  filter: 'all',
  q: '',
  reply: null,
  dividerId: '',
  lastSync: 0,
  lastView: 0,
  newBelow: 0,
  error: '',
  closed: new Set(),
  more: new Set(), // nhóm đang mở "Xem thêm": 'dm', 'teams'
  loaded: false,
};
try {
  S.closed = new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) || '[]'));
} catch {}

async function call(type, extra = {}) {
  try {
    return (await chrome.runtime.sendMessage({ type, ...extra })) || { status: 'error', message: 'Không có phản hồi' };
  } catch (e) {
    return { status: 'error', message: String(e?.message || e) };
  }
}

let toastTimer = 0;
function toast(text, kind = '') {
  const t = $('toast');
  t.textContent = text;
  t.className = 'toast ' + kind;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

// ---------- Ảnh đại diện, màu, giờ ----------

const GRADIENTS = [
  ['#8f63ff', '#5b2fe0'],
  ['#ff7a59', '#e0436b'],
  ['#2bb8a3', '#16807a'],
  ['#4f8cff', '#2a5bd7'],
  ['#f5a524', '#d9711c'],
  ['#e05ab8', '#9b3dd1'],
  ['#3fbf6f', '#1f8a4c'],
  ['#5c6bc0', '#3949ab'],
];
const hash = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const grad = (s) => {
  const [a, b] = GRADIENTS[hash(s) % GRADIENTS.length];
  return `--av: linear-gradient(135deg, ${a}, ${b})`;
};
const nameColor = (s) => `--name: hsl(${hash(s) % 360} 62% 50%)`;
function initials(name) {
  const w = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

function avatar({ name, chatId = '', pictureAt = 0, seed = '', channel = false, locked = false, size = '' }) {
  const a = el('div', { class: `avatar ${channel ? 'ch' : ''} ${size}`, style: grad(seed || chatId || name), 'aria-hidden': 'true' }, initials(name));
  if (chatId && !channel) {
    const img = el('img', { src: BG.chatAvatarUrl(chatId, pictureAt), alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    a.append(img);
  }
  if (locked) a.append(el('span', { class: 'lock' }, svgLock()));
  return a;
}

function svg(path) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  s.append(p);
  return s;
}
const svgLock = () => svg('M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V8a3 3 0 0 0-6 0v2Z');
const svgChevron = () => svg('M7 9.6 12 14.6 17 9.6 18.4 11 12 17.4 5.6 11 7 9.6Z');
const svgPin = () => svg('M14.5 2.5 21.5 9.5 20 11l-1.4-.6-3.9 3.9.3 3.7-1.5 1.5-4.2-4.2L4.5 20.1l-.6-.6 4.8-4.8-4.2-4.2L6 9l3.7.3 3.9-3.9L13 4l1.5-1.5Z');
const svgFile = () => svg('M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V9h5.5L13 3.5Z');

const pad = (n) => String(n).padStart(2, '0');
const hm = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const dayKey = (t) => new Date(t).toDateString();
const WEEKDAYS = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
function dayLabel(t) {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === y.toDateString()) return 'Hôm qua';
  return `${WEEKDAYS[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function shortTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (d.toDateString() === new Date().toDateString()) return hm(t);
  if (Date.now() - t < 6 * 864e5) return ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}
const fullTime = (t) => new Date(t).toLocaleString('vi-VN');
const sizeText = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

// ---------- Nội dung tin: link, @nhắc tên, **đậm**, `mã` ----------

const RICH = /(https?:\/\/[^\s<>"']+)|(@[a-z0-9._-]+)|(\*\*[^*\n]+\*\*)|(`[^`\n]+`)/gi;
function rich(text) {
  const frag = document.createDocumentFragment();
  const me = String(S.me?.username || '').toLowerCase();
  let last = 0;
  for (const m of String(text).matchAll(RICH)) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const [t, url, at, bold, code] = m;
    if (url) {
      const clean = url.replace(/[.,!?;:)]+$/, '');
      frag.append(el('a', { href: clean, target: '_blank', rel: 'noopener noreferrer' }, clean), url.slice(clean.length));
    } else if (at) {
      const who = at.slice(1).toLowerCase();
      frag.append(el('span', { class: 'mention' + (who === me || ['all', 'channel', 'here'].includes(who) ? ' mine' : '') }, at));
    } else if (bold) frag.append(el('b', {}, bold.slice(2, -2)));
    else if (code) frag.append(el('code', {}, code.slice(1, -1)));
    else frag.append(t);
    last = m.index + t.length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
const mentionsMe = (text) => {
  const me = String(S.me?.username || '').toLowerCase();
  return !!me && new RegExp(`(^|[^\\w.-])@(${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|all|channel|here)\\b`, 'i').test(text);
};

// ---------- Danh sách cuộc trò chuyện ----------

function allChats() {
  return [...S.dms.map((c) => ({ ...c, kind: 'dm', teamTitle: '' })), ...S.teams.flatMap((t) => t.channels.map((c) => ({ ...c, kind: 'ch', teamTitle: t.title })))];
}
const findChat = (id) => allChats().find((c) => c.id === id) || null;
// Tin nhắn riêng chưa có tên (lần đọc nhanh chỉ lấy tên người của các tin gần nhất): tạm hiện @tên tài khoản
const chatTitle = (c) => c.title || (c.kind === 'dm' || c.type === 'D' ? (c.other?.username ? '@' + c.other.username : 'Tin nhắn riêng') : 'Kênh chat');

function matches(c) {
  if (S.filter === 'unread' && !c.unread && !c.mentions) return false;
  if (S.filter === 'dm' && c.kind !== 'dm') return false;
  if (!S.q) return true;
  const q = BG.norm(S.q);
  return BG.norm(`${chatTitle(c)} ${c.other?.username || ''} ${c.teamTitle}`).includes(q);
}

function listItem(c) {
  const dm = c.kind === 'dm';
  const unread = c.unread > 0 || c.mentions > 0;
  return el(
    'button',
    { type: 'button', class: 'item' + (S.sel?.id === c.id ? ' sel' : '') + (unread ? ' unread' : ''), 'aria-current': S.sel?.id === c.id ? 'true' : null, onclick: () => openChat(c.id) },
    dm ? avatar({ name: chatTitle(c), chatId: c.other?.chatId, pictureAt: c.other?.pictureAt }) : avatar({ name: chatTitle(c), seed: c.id, channel: true, locked: c.type === 'P' }),
    el('span', { class: 'item-main' }, el('span', { class: 'item-title' }, chatTitle(c)), el('span', { class: 'item-sub' }, dm ? (c.type === 'G' ? 'Nhóm chat' : c.other?.username ? '@' + c.other.username : 'Tin nhắn riêng') : c.purpose || c.teamTitle)),
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

function section(key, title, items, { limit = 0, label = '', pinned = false } = {}) {
  if (!items.length) return null;
  const closed = S.closed.has(key) && !S.q && S.filter === 'all';
  // Đang tìm / lọc thì hiện đủ; không thì giới hạn (tin nhắn riêng: 8 gần nhất)
  const cut = limit && !S.q && S.filter === 'all' && !S.more.has(key) ? limit : 0;
  const shown = cut ? items.slice(0, cut) : items;
  const more = limit && !S.q && S.filter === 'all' ? moreBtn(key, items.length - shown.length, label) : null;
  return el(
    'div',
    { class: 'sec' + (closed ? ' closed' : '') },
    el(
      'button',
      {
        type: 'button',
        class: 'sec-head',
        'aria-expanded': String(!closed),
        onclick: () => {
          S.closed.has(key) ? S.closed.delete(key) : S.closed.add(key);
          try {
            localStorage.setItem(CLOSED_KEY, JSON.stringify([...S.closed]));
          } catch {}
          renderList();
        },
      },
      svgChevron(),
      el('span', { class: 'sec-title' }, title),
      pinned ? el('span', { class: 'pin', title: 'Cộng đồng bạn đã ghim trên Beincom' }, svgPin()) : null,
    ),
    el('div', { class: 'sec-items' }, ...shown.map(listItem), more),
  );
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
  const parts = [section('dm', 'Tin nhắn riêng', S.dms.map((c) => ({ ...c, kind: 'dm', teamTitle: '' })).filter(matches), { limit: SHOW_DMS, label: 'tin nhắn riêng' })];
  if (S.filter !== 'dm') {
    // Cộng đồng: nền đã xếp (đã ghim trước theo thứ tự ghim, rồi có tin mới nhất); hiện 5, còn lại sau "Xem thêm"
    const all = !!S.q || S.filter !== 'all' || S.more.has('teams');
    const teams = S.teams.map((t) => [t, t.channels.map((c) => ({ ...c, kind: 'ch', teamTitle: t.title })).filter(matches)]).filter(([, l]) => l.length);
    for (const [t, list] of all ? teams : teams.slice(0, SHOW_TEAMS)) parts.push(section('t:' + t.id, t.title, list, { pinned: t.pinned }));
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
  for (const id of ['conv-head', 'msgs', 'composer', 'jump']) $(id).hidden = true;
}

// ---------- Mở cuộc trò chuyện, tin nhắn ----------

function sortedPosts() {
  return [...S.posts.values()].sort((a, b) => a.createAt - b.createAt);
}

function addPosts(list) {
  for (const p of list || []) {
    S.posts.set(p.id, p);
    S.lastSync = Math.max(S.lastSync, p.updateAt || 0, p.createAt || 0, p.editAt || 0);
  }
}

async function openChat(id, { fromHash = false } = {}) {
  const c = findChat(id);
  if (!c) return;
  S.sel = c;
  S.posts = new Map();
  S.hasMore = false;
  S.reply = null;
  S.newBelow = 0;
  S.lastSync = 0;
  S.dividerId = '';
  if (!fromHash) history.replaceState(null, '', location.href.split('#')[0] + '#c=' + encodeURIComponent(c.id));
  $('app').classList.add('open');
  $('empty').hidden = true;
  for (const x of ['conv-head', 'msgs', 'composer']) $(x).hidden = false;
  $('jump').hidden = true;
  renderHead();
  renderReply();
  renderList();
  $('msg-list').replaceChildren(el('div', { class: 'sys' }, 'Đang tải tin nhắn…'));
  $('older').hidden = true;
  applyComposer(c);
  // Tin đã tải trước lúc mở trang (song song với danh sách) thì dùng luôn
  const pre = S.prefetch?.id === c.id ? S.prefetch.promise : null;
  S.prefetch = null;
  const r = await (pre || call('chatPosts', { channelId: c.id, perPage: PAGE }));
  if (S.sel?.id !== c.id) return;
  if (r.status !== 'ok') {
    $('msg-list').replaceChildren(el('div', { class: 'sys' }, 'Không tải được tin nhắn: ' + (r.message || 'lỗi')));
    return;
  }
  addPosts(r.posts);
  S.hasMore = r.hasMore;
  // Vạch "Tin chưa đọc": trước tin thứ `unread` tính từ cuối (tin của người khác)
  if (c.unread) {
    const others = sortedPosts().filter((p) => !p.system && p.user.chatId !== S.me?.chatId);
    S.dividerId = others[Math.max(0, others.length - c.unread)]?.id || '';
  }
  renderMsgs({ scroll: S.dividerId ? 'divider' : 'bottom' });
  markRead(true);
  if (!fromHash) $('text').focus();
}

// Ô gõ tin theo quyền của kênh. Quyền chưa rõ (canPost = null, lần đọc nhanh): cho gõ, Beincom tự từ chối nếu không được
function applyComposer(c) {
  const canPost = c.kind === 'dm' || c.canPost !== false;
  $('text').disabled = !canPost;
  $('text').placeholder = canPost ? (c.kind === 'dm' ? `Nhắn cho ${chatTitle(c)}…` : `Nhắn vào ${chatTitle(c)}…`) : 'Bạn chỉ xem được kênh này';
  $('hint').textContent = canPost ? 'Enter để gửi · Shift + Enter xuống dòng' : 'Beincom không cho tài khoản của bạn gửi tin vào kênh này.';
  updateSend();
}

function renderHead() {
  const c = S.sel;
  const dm = c.kind === 'dm';
  $('conv-avatar').replaceWith(Object.assign(dm ? avatar({ name: chatTitle(c), chatId: c.other?.chatId, pictureAt: c.other?.pictureAt, size: 'lg' }) : avatar({ name: chatTitle(c), seed: c.id, channel: true, locked: c.type === 'P', size: 'lg' }), { id: 'conv-avatar' }));
  $('conv-title').textContent = chatTitle(c);
  $('conv-sub').textContent = dm ? (c.type === 'G' ? 'Nhóm chat' : c.other?.username ? '@' + c.other.username + ' · tin nhắn riêng' : 'Tin nhắn riêng') : [c.teamTitle, c.type === 'P' ? 'kênh riêng' : 'kênh chung', c.canDelete ? 'bạn là admin kênh' : ''].filter(Boolean).join(' · ');
  const team = dm ? (S.dmTeamName || '') : S.teams.find((t) => t.channels.some((x) => x.id === c.id))?.name || '';
  $('conv-web').href = BG.chatUrl(team, c.id);
}

function nearBottom() {
  const m = $('msgs');
  return m.scrollHeight - m.scrollTop - m.clientHeight < 140;
}

function renderMsgs({ scroll = 'auto' } = {}) {
  const box = $('msgs');
  const fromBottom = box.scrollHeight - box.scrollTop;
  const stick = scroll === 'auto' ? nearBottom() : false;
  const list = sortedPosts();
  const meId = S.me?.chatId;
  const out = [];
  let prev = null;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const next = list[i + 1];
    if (!prev || dayKey(prev.createAt) !== dayKey(p.createAt)) out.push(el('div', { class: 'day' }, dayLabel(p.createAt)));
    if (p.id === S.dividerId) out.push(el('div', { class: 'unread-line' }, 'Tin chưa đọc'));
    if (p.system) {
      out.push(el('div', { class: 'sys' }, p.message || 'Thông báo của hệ thống'));
      prev = p;
      continue;
    }
    const same = (a, b) => a && b && !a.system && !b.system && a.user.chatId === b.user.chatId && Math.abs(b.createAt - a.createAt) < GROUP_GAP && dayKey(a.createAt) === dayKey(b.createAt) && b.id !== S.dividerId;
    const first = !same(prev, p);
    const last = !same(p, next);
    out.push(messageEl(p, { first, last, mine: p.user.chatId === meId }));
    prev = p;
  }
  $('msg-list').replaceChildren(...(out.length ? out : [el('div', { class: 'sys' }, 'Chưa có tin nhắn nào. Hãy gửi lời chào 👋')]));
  $('older').hidden = !S.hasMore;
  $('older').disabled = S.loadingOlder;
  $('older').textContent = S.loadingOlder ? 'Đang tải…' : 'Tải tin cũ hơn';
  if (scroll === 'bottom' || stick) box.scrollTop = box.scrollHeight;
  else if (scroll === 'divider') document.querySelector('.unread-line')?.scrollIntoView({ block: 'center' });
  else box.scrollTop = box.scrollHeight - fromBottom;
  updateJump();
}

function messageEl(p, { first, last, mine }) {
  const name = p.user.fullname || p.user.username || 'Người dùng';
  const canDel = !p.deleted && (mine || S.sel?.canDelete);
  const root = p.rootId ? S.posts.get(p.rootId) : null;
  const bubble = el('div', { class: 'bubble' });
  if (p.deleted) bubble.append('Tin nhắn đã bị xoá');
  else {
    if (p.rootId) {
      bubble.append(
        el(
          'span',
          { class: 'quote', title: 'Tới tin được trả lời', onclick: () => root && flashTo(root.id) },
          root ? [el('b', {}, root.user.fullname || root.user.username), ': ', root.deleted ? 'tin đã xoá' : String(root.message || (root.files.length ? '📎 tệp' : '')).replace(/\*\*|`/g, '').replace(/\s+/g, ' ').slice(0, 90)] : 'Trả lời một tin trong chuỗi',
        ),
      );
    }
    if (p.message) bubble.append(rich(p.message));
    if (p.files.length) bubble.append(filesEl(p.files, p));
    bubble.append(el('span', { class: 'meta', title: fullTime(p.createAt) }, p.editAt ? 'đã sửa · ' : '', hm(p.createAt)));
  }
  const tools = p.deleted
    ? null
    : el(
        'div',
        { class: 'tools' },
        el('button', { type: 'button', onclick: () => startReply(p) }, 'Trả lời'),
        p.message ? el('button', { type: 'button', onclick: () => copyMsg(p) }, 'Sao chép') : null,
        canDel ? el('button', { type: 'button', class: 'del', onclick: () => deleteMsg(p, mine) }, 'Xoá') : null,
      );
  return el(
    'div',
    { class: `msg${mine ? ' me' : ''}${first ? ' first' : ''}${last ? ' last' : ''}${p.deleted ? ' deleted' : ''}${!mine && mentionsMe(p.message) ? ' mentioned' : ''}`, id: 'm-' + p.id },
    mine ? null : avatar({ name, chatId: p.user.chatId, pictureAt: p.user.pictureAt, size: 'sm' }),
    el('div', { class: 'msg-col' }, first && !mine ? el('div', { class: 'msg-name', style: nameColor(p.user.chatId) }, name, el('time', { title: fullTime(p.createAt) }, hm(p.createAt))) : null, bubble),
    tools,
  );
}

// Ảnh và tệp đính kèm. Nhiều ảnh trong một tin: lưới gọn (tối đa 4 ô, ô cuối "+N"); bấm ảnh để phóng to ngay trong trang
const ALBUM_MAX = 4;
function filesEl(files, post) {
  const web = $('conv-web').href;
  const pics = files.filter(isImage);
  const shot = (f, more = 0) => {
    const open = (e) => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return; // Ctrl / Shift / chuột giữa: mở tab như link thường
      e.preventDefault();
      openViewer(post?.id, f.id);
    };
    const style = [f.mini ? `--mini: url("${miniSrc(f)}")` : '', f.width && f.height ? `--ar: ${f.width} / ${f.height}` : ''].filter(Boolean).join('; ');
    const box = el('a', { class: 'shot' + (f.url ? '' : ' mini-only'), href: f.url || web, target: '_blank', rel: 'noopener noreferrer', title: (f.name ? f.name + ' — ' : '') + 'Bấm để phóng to', onclick: open, style: style || null }, more ? el('span', { class: 'more' }, '+' + more) : null);
    if (f.url) {
      const img = el('img', { src: f.url, alt: f.name, loading: 'lazy', draggable: 'false', width: pics.length === 1 && f.width && f.height ? Math.min(280, f.width) : null });
      img.addEventListener('error', () => img.remove());
      box.prepend(img);
    }
    return box;
  };
  const n = Math.min(pics.length, ALBUM_MAX);
  return el(
    'div',
    { class: 'files' },
    pics.length ? el('div', { class: 'album' + (n > 1 ? ' grid n' + n : '') }, pics.slice(0, n).map((f, k) => shot(f, k === n - 1 && pics.length > n ? pics.length - n : 0))) : null,
    files
      .filter((f) => !isImage(f))
      .map((f) => el('a', { class: 'file-chip', href: f.url || web, target: '_blank', rel: 'noopener noreferrer', title: 'Mở tệp' }, svgFile(), el('span', {}, f.name || 'Tệp'), f.size ? el('small', {}, sizeText(f.size)) : null)),
  );
}

// ---------- Xem ảnh phóng to (ngay trong trang; nhiều ảnh thì chuyển qua lại như playlist) ----------

const isImage = (f) => /^image\//.test(f.mime || '') && !!(f.url || f.mini);
const miniSrc = (f) => (f.mini ? 'data:image/jpeg;base64,' + f.mini.replace(/[^A-Za-z0-9+/=]/g, '') : '');
const V = { list: [], i: 0, zoom: false, swipe: null, swiped: false };

// Mọi ảnh của cuộc trò chuyện đang mở (cũ → mới)
function chatImages() {
  return sortedPosts()
    .filter((p) => !p.deleted && !p.system)
    .flatMap((p) => (p.files || []).filter(isImage).map((f) => ({ ...f, post: p })));
}

function openViewer(postId, fileId) {
  V.list = chatImages();
  V.i = Math.max(0, V.list.findIndex((x) => x.post.id === postId && x.id === fileId));
  if (!V.list.length) return;
  V.zoom = false;
  renderViewer();
  if (!$('viewer').open) $('viewer').showModal();
  $('v-close').focus();
}

function showImage(k) {
  if (k < 0 || k >= V.list.length || k === V.i) return;
  V.i = k;
  V.zoom = false;
  renderViewer();
}

function renderViewer() {
  const f = V.list[V.i];
  if (!f) return $('viewer').close();
  const n = V.list.length;
  $('v-name').textContent = f.name || 'Ảnh';
  $('v-meta').textContent = `${f.post.user.fullname || f.post.user.username || 'Người dùng'} · ${fullTime(f.post.createAt)}`;
  $('v-count').textContent = n > 1 ? `${V.i + 1} / ${n}` : '';
  // Ảnh chỉ có bản xem trước (máy chủ không cho link ảnh gốc): mở cuộc trò chuyện trên web
  $('v-open').href = f.url || $('conv-web').href;
  $('v-open').title = f.url ? 'Mở ảnh trong tab mới' : 'Mở trên web Beincom để xem ảnh gốc';
  $('v-prev').hidden = $('v-next').hidden = n < 2;
  $('v-prev').disabled = V.i === 0;
  $('v-next').disabled = V.i === n - 1;
  const stage = $('v-stage');
  stage.classList.remove('zoomed', 'can-zoom');
  stage.scrollTo(0, 0);
  const img = el('img', { src: f.url || miniSrc(f), alt: f.name || 'Ảnh', class: f.url ? null : 'blur', draggable: 'false' });
  // Ảnh lớn hơn khung: bấm vào ảnh để xem đúng cỡ
  img.addEventListener('load', () => stage.classList.toggle('can-zoom', !!f.url && (img.naturalWidth > img.clientWidth + 1 || img.naturalHeight > img.clientHeight + 1)));
  img.addEventListener('error', () => {
    if (f.mini && !img.classList.contains('blur')) {
      img.src = miniSrc(f);
      img.classList.add('blur');
    }
  });
  stage.replaceChildren(...[img, f.url ? null : el('p', { class: 'v-note' }, 'Đây là ảnh xem trước — bấm Mở tab mới để xem ảnh gốc trên web Beincom.')].filter(Boolean));
  const thumbs = $('v-thumbs');
  thumbs.hidden = n < 2;
  if (n > 1) {
    thumbs.replaceChildren(
      ...V.list.map((x, k) =>
        el('button', { type: 'button', class: 'v-thumb' + (k === V.i ? ' on' : ''), title: `Ảnh ${k + 1}${x.name ? ': ' + x.name : ''}`, 'aria-label': `Ảnh ${k + 1}`, 'aria-current': k === V.i ? 'true' : null, onclick: () => showImage(k) }, el('img', { src: x.url || miniSrc(x), alt: '', loading: 'lazy', draggable: 'false' })),
      ),
    );
    thumbs.children[V.i]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  // Tải trước ảnh hai bên để chuyển cho nhanh
  for (const k of [V.i - 1, V.i + 1]) if (V.list[k]?.url) new Image().src = V.list[k].url;
}

function flashTo(id) {
  const n = $('m-' + id);
  if (!n) return;
  n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  n.classList.remove('flash');
  void n.offsetWidth;
  n.classList.add('flash');
}

function updateJump() {
  const show = !!S.sel && !nearBottom();
  $('jump').hidden = !show;
  if (!show) S.newBelow = 0;
  $('jump-n').textContent = S.newBelow ? `${S.newBelow} tin mới` : '';
}

// ---------- Trả lời, sao chép, xoá ----------

function startReply(p) {
  S.reply = p;
  renderReply();
  $('text').focus();
}
function renderReply() {
  const p = S.reply;
  $('reply').hidden = !p;
  $('reply-text').textContent = p ? `Trả lời ${p.user.fullname || p.user.username}: ${String(p.message || '📎 tệp').replace(/\s+/g, ' ').slice(0, 100)}` : '';
}

async function copyMsg(p) {
  try {
    await navigator.clipboard.writeText(p.message);
    toast('Đã sao chép tin nhắn.');
  } catch {
    toast('Không sao chép được', 'err');
  }
}

function ask({ title, text, note, ok = 'Xoá' }) {
  const d = $('ask');
  $('ask-title').textContent = title;
  $('ask-text').textContent = text;
  $('ask-note').textContent = note || '';
  $('ask-ok').textContent = ok;
  d.returnValue = '';
  d.showModal();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

async function deleteMsg(p, mine) {
  const name = p.user.fullname || p.user.username || 'người dùng';
  const ok = await ask({
    title: mine ? 'Xoá tin nhắn của bạn?' : `Xoá tin nhắn của ${name}?`,
    text: String(p.message || '📎 tệp').replace(/\s+/g, ' ').slice(0, 200),
    note: mine ? 'Tin bị xoá với mọi người, không khôi phục được.' : 'Tin bị xoá khỏi kênh với mọi người, không khôi phục được. Việc kiểm duyệt này theo Chạy thử và được ghi Nhật ký.',
  });
  if (!ok) return;
  const r = await call('chatDeleteMsg', { postId: p.id, channelId: S.sel.id, own: mine, groupName: chatTitle(S.sel), snippet: p.message, user: { id: p.user.id, username: p.user.username, fullname: p.user.fullname } });
  if (r.status !== 'ok') return toast(r.message || (r.errors || []).join('; ') || 'Không xoá được', 'err');
  if (r.dryRun) return toast('Chạy thử: đã ghi vào Nhật ký, chưa xoá trên Beincom.');
  if (r.failed) return toast('Không xoá được: ' + (r.errors || []).join('; '), 'err');
  S.posts.set(p.id, { ...p, deleted: true });
  renderMsgs({ scroll: 'keep' });
  toast('Đã xoá tin nhắn.');
}

// ---------- Gửi tin ----------

function autosize() {
  const t = $('text');
  t.style.height = 'auto';
  t.style.height = Math.min(160, t.scrollHeight) + 'px';
  updateSend();
}
function updateSend() {
  $('send').disabled = S.sending || $('text').disabled || !$('text').value.trim();
}

async function sendMsg(e) {
  e?.preventDefault();
  const c = S.sel;
  const text = $('text').value.trim();
  if (!c || !text || S.sending) return;
  S.sending = true;
  updateSend();
  const r = await call('chatSend', { channelId: c.id, message: text, rootId: S.reply?.rootId || S.reply?.id || '' });
  S.sending = false;
  if (r.status !== 'ok') {
    updateSend();
    return toast(r.message || 'Gửi tin lỗi', 'err');
  }
  $('text').value = '';
  S.reply = null;
  renderReply();
  autosize();
  if (S.sel?.id === c.id) {
    addPosts([r.post]);
    renderMsgs({ scroll: 'bottom' });
  }
  const it = findChat(c.id);
  if (it) bumpChat(c.id, { lastPostAt: r.post?.createAt || Date.now() });
  renderList();
}

// Cập nhật một mục trong danh sách (số chưa đọc, giờ tin cuối)
function bumpChat(id, patch) {
  const upd = (c) => (c.id === id ? Object.assign(c, patch) : c);
  S.dms.forEach(upd);
  for (const t of S.teams) t.channels.forEach(upd);
}

// Đánh dấu đã đọc (như web khi mở kênh); tối đa mỗi 3 giây
async function markRead(force = false) {
  const c = S.sel;
  if (!c || document.hidden || (!force && Date.now() - S.lastView < 3000)) return;
  S.lastView = Date.now();
  bumpChat(c.id, { unread: 0, mentions: 0 });
  renderList();
  await call('chatView', { channelId: c.id });
}

// ---------- Tải lại ----------

async function loadOlder() {
  const c = S.sel;
  const oldest = sortedPosts()[0];
  if (!c || !S.hasMore || S.loadingOlder || !oldest) return;
  S.loadingOlder = true;
  renderMsgs({ scroll: 'keep' });
  const r = await call('chatPosts', { channelId: c.id, before: oldest.id, perPage: PAGE });
  S.loadingOlder = false;
  if (S.sel?.id !== c.id) return;
  if (r.status !== 'ok') return toast('Không tải được tin cũ: ' + (r.message || 'lỗi'), 'err');
  addPosts(r.posts);
  S.hasMore = r.hasMore && r.posts.length > 0;
  renderMsgs({ scroll: 'keep' });
}

async function pollChat() {
  const c = S.sel;
  if (!c || S.polling || document.hidden || !S.lastSync) return;
  S.polling = true;
  const r = await call('chatPosts', { channelId: c.id, since: S.lastSync });
  S.polling = false;
  if (S.sel?.id !== c.id || r.status !== 'ok') return;
  const changed = r.posts.filter((p) => {
    const o = S.posts.get(p.id);
    return !o || o.message !== p.message || o.deleted !== p.deleted || o.editAt !== p.editAt;
  });
  if (!changed.length) return;
  const incoming = changed.filter((p) => !S.posts.has(p.id) && !p.system && p.user.chatId !== S.me?.chatId).length;
  const stick = nearBottom();
  addPosts(r.posts);
  renderMsgs({ scroll: stick ? 'bottom' : 'keep' });
  if (incoming) {
    if (!stick) S.newBelow += incoming;
    updateJump();
    bumpChat(c.id, { lastPostAt: Math.max(...r.posts.map((p) => p.createAt)) });
    if (document.hasFocus()) markRead();
  }
}

// quick: nền chỉ đọc một lượt (tên người của các tin nhắn riêng gần nhất, quyền đã nhớ) để danh sách hiện ngay;
// lần đọc đủ chạy ngay sau đó và điền nốt
async function loadOverview({ quiet = false, quick = false } = {}) {
  const r = await call('chatOverview', { quick });
  if (r.status === 'off') {
    S.on = false;
    S.loaded = true;
    renderList();
    renderMe();
    return showEmpty('Kết nối Chat Beincom', 'Trang Chat dùng chính phiên đăng nhập Beincom của bạn để đọc và gửi tin nhắn. Bấm nút dưới đây và cho phép addon kết nối chat.beincom.com.', { enable: true });
  }
  S.on = true;
  if (r.status !== 'ok') {
    S.loaded = true;
    S.error = r.message || 'Không đọc được chat';
    renderMe();
    if (!quiet) {
      renderList();
      showEmpty('Chưa kết nối được chat', S.error, { web: r.status === 'need_login' });
    }
    return;
  }
  applyOverview(r);
  afterOverview();
  try {
    await chrome.storage.session?.set({ [CACHE_KEY]: { at: Date.now(), me: S.me, teams: S.teams, dms: S.dms, dmTeam: r.dmTeam } });
  } catch {}
  return r;
}

// Lần đọc nhanh thiếu tên người / quyền của một số cuộc trò chuyện: giữ cái đã biết (danh sách lần trước, lần đọc đủ)
function applyOverview(r) {
  const old = new Map([...S.dms, ...S.teams.flatMap((t) => t.channels)].map((c) => [c.id, c]));
  const keep = (c) => {
    const o = old.get(c.id);
    if (!o) return c;
    const x = { ...c };
    if (!x.title && o.title) x.title = o.title;
    if (x.other && !x.other.username && o.other?.username) x.other = o.other;
    if (x.canPost == null && o.canPost != null) Object.assign(x, { canPost: o.canPost, canDelete: o.canDelete });
    return x;
  };
  S.on = true;
  S.loaded = true;
  S.error = '';
  S.me = r.me;
  S.teams = (r.teams || []).map((t) => ({ ...t, channels: (t.channels || []).map(keep) }));
  S.dms = (r.dms || []).map(keep);
  S.dmTeamName = r.dmTeam?.name || '';
}

function afterOverview() {
  // Đang xem kênh thì coi như đã đọc
  if (S.sel && !document.hidden) bumpChat(S.sel.id, { unread: 0, mentions: 0 });
  if (S.sel) {
    const was = S.sel;
    S.sel = Object.assign(findChat(S.sel.id) || S.sel, { kind: S.sel.kind, teamTitle: S.sel.teamTitle });
    // Lần đọc đủ mới biết quyền / tên: cập nhật đầu trang, ô gõ, nút Xoá
    if (was.canPost !== S.sel.canPost || was.canDelete !== S.sel.canDelete || was.title !== S.sel.title) {
      renderHead();
      applyComposer(S.sel);
      if (was.canDelete !== S.sel.canDelete && S.posts.size) renderMsgs({ scroll: 'keep' });
    }
  }
  renderMe();
  renderList();
  if (!S.sel) {
    const want = new URLSearchParams(location.hash.slice(1)).get('c');
    if (want && findChat(want)) openChat(want, { fromHash: true });
    else showEmpty('Chọn một cuộc trò chuyện', 'Tin nhắn riêng và kênh chat của các group bạn tham gia ở bên trái. Tin mới tự hiện khi trang đang mở.');
  }
}

// ---------- Sự kiện ----------

$('v-close').addEventListener('click', () => $('viewer').close());
$('v-prev').addEventListener('click', () => showImage(V.i - 1));
$('v-next').addEventListener('click', () => showImage(V.i + 1));
$('v-goto').addEventListener('click', () => {
  const id = V.list[V.i]?.post.id;
  $('viewer').close();
  if (id) flashTo(id);
});
$('viewer').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') showImage(V.i - 1);
  else if (e.key === 'ArrowRight') showImage(V.i + 1);
  else if (e.key === 'Home') showImage(0);
  else if (e.key === 'End') showImage(V.list.length - 1);
  else return;
  e.preventDefault();
});
$('viewer').addEventListener('close', () => {
  V.zoom = false;
  $('v-stage').replaceChildren();
});
// Bấm ra ngoài ảnh: đóng. Bấm vào ảnh lớn: xem đúng cỡ (bấm lại để thu về vừa khung)
$('v-stage').addEventListener('click', (e) => {
  const stage = $('v-stage');
  if (V.swiped) return void (V.swiped = false);
  if (e.target === stage) return $('viewer').close();
  if (e.target.tagName !== 'IMG' || !stage.classList.contains('can-zoom')) return;
  const img = e.target;
  const rx = e.offsetX / img.clientWidth;
  const ry = e.offsetY / img.clientHeight;
  V.zoom = !V.zoom;
  stage.classList.toggle('zoomed', V.zoom);
  if (V.zoom) stage.scrollTo(rx * img.clientWidth - stage.clientWidth / 2, ry * img.clientHeight - stage.clientHeight / 2);
});
// Vuốt ngang (điện thoại) hoặc kéo chuột: ảnh trước / sau
$('v-stage').addEventListener('pointerdown', (e) => {
  V.swipe = V.zoom ? null : { x: e.clientX, y: e.clientY };
});
$('v-stage').addEventListener('pointerup', (e) => {
  if (!V.swipe) return;
  const dx = e.clientX - V.swipe.x;
  const dy = e.clientY - V.swipe.y;
  V.swipe = null;
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
  V.swiped = true;
  setTimeout(() => (V.swiped = false), 400);
  showImage(V.i + (dx < 0 ? 1 : -1));
});

$('composer').addEventListener('submit', sendMsg);
$('text').addEventListener('input', autosize);
$('text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) sendMsg(e);
  if (e.key === 'Escape' && S.reply) {
    S.reply = null;
    renderReply();
  }
});
$('reply-x').addEventListener('click', () => {
  S.reply = null;
  renderReply();
  $('text').focus();
});
$('older').addEventListener('click', loadOlder);
$('msgs').addEventListener('scroll', () => {
  if ($('msgs').scrollTop < 60) loadOlder();
  updateJump();
});
$('jump').addEventListener('click', () => {
  $('msgs').scrollTo({ top: $('msgs').scrollHeight, behavior: 'smooth' });
  S.newBelow = 0;
  updateJump();
});
$('back').addEventListener('click', () => {
  S.sel = null;
  $('app').classList.remove('open');
  history.replaceState(null, '', location.href.split('#')[0]);
  renderList();
});
$('q').addEventListener('input', () => {
  S.q = $('q').value.trim();
  renderList();
});
for (const b of document.querySelectorAll('#filters button')) {
  b.addEventListener('click', () => {
    S.filter = b.dataset.f;
    renderList();
  });
}
$('btn-enable').addEventListener('click', async () => {
  if ($('btn-enable').dataset.mode === 'web') return window.open(BG.SITE + '/chat-home', '_blank');
  let granted = false;
  try {
    granted = (await chrome.permissions.contains({ origins: [BG.CHAT_ORIGIN] })) || (await chrome.permissions.request({ origins: [BG.CHAT_ORIGIN] }));
  } catch {}
  if (!granted) return toast('Cần cho phép addon kết nối chat.beincom.com', 'err');
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...BG.DEFAULT_SETTINGS, ...settings, chatEnabled: true } }); // trang đọc lại khi cài đặt đổi
});
window.addEventListener('focus', () => {
  if (S.sel) markRead();
  pollChat();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    pollChat();
    loadOverview({ quiet: true });
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const on = !!changes.settings.newValue?.chatEnabled;
  if (on === S.on) return;
  if (!on) {
    S.sel = null;
    $('app').classList.remove('open');
  }
  loadOverview();
});

async function start() {
  const want = new URLSearchParams(location.hash.slice(1)).get('c');
  if (want && /^\w+$/.test(want)) S.prefetch = { id: want, promise: call('chatPosts', { channelId: want, perPage: PAGE }) };
  let cached = null;
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (settings?.chatEnabled) cached = (await chrome.storage.session?.get(CACHE_KEY))?.[CACHE_KEY] || null;
  } catch {}
  if (cached) {
    applyOverview(cached);
    afterOverview();
  } else renderList(); // khung chờ
  const r = await loadOverview({ quiet: !!cached, quick: true });
  // Đọc nhanh xong thì đọc đủ (tên mọi tin nhắn riêng, quyền vai trò) mà không chặn trang
  if (r?.status === 'ok' && r.quick) loadOverview({ quiet: true });
}

setInterval(pollChat, POLL_MS);
setInterval(() => !document.hidden && loadOverview({ quiet: true }), LIST_MS);
start();
