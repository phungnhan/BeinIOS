// BeinGroup — trang Chat (chat.html), phần chung: hằng số, trạng thái S, gọi service worker, thông báo nhỏ, ảnh đại diện,
// biểu tượng, giờ, huy hiệu cạnh tên, dựng nội dung tin (Markdown) bằng phần tử DOM (không chèn HTML).
// Các tệp chat/*.js là script thường dùng chung phạm vi toàn cục, nạp theo thứ tự cuối chat.html; mọi lệnh tới Beincom đi qua
// service worker (bg/chat.js) bằng phiên đăng nhập như web. Nội dung tin chỉ nằm trong trang, không lưu lại.

const POLL_MS = 4000;
const LIST_MS = 30000;
const PAGE = 40;
const GROUP_GAP = 5 * 60e3;
const CLOSED_KEY = 'beingroup-chat-closed';
// Danh sách lần mở trước (tên, số chưa đọc — không có nội dung tin) trong bộ nhớ phiên của trình duyệt: mở lại là hiện ngay
const CACHE_KEY = 'chatOverviewCache';
// Bên trái hiện trước 8 tin nhắn riêng gần nhất, 5 lời mời trò chuyện và 5 cộng đồng (đã ghim trước, rồi có tin mới nhất);
// còn lại sau "Xem thêm"
const SHOW_DMS = 8;
const SHOW_REQS = 5;
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
  requests: [], // lời mời trò chuyện: người chưa kết nối nhắn cho bạn
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
  dmTab: 'dm', // tab Tin nhắn riêng / Lời mời
  thread: null, // thread đang mở: { root, posts, hasNext, loading }
  view: '', // 'threads': trang Thread đang theo dõi
  pinned: null, // tin đã ghim của kênh đang mở
  editing: null, // tin đang sửa (ô gõ chính)
  tEditing: null, // bình luận đang sửa
  tlist: null, // thread đang theo dõi (đã đọc)
  tlistFilter: 'all',
  threadUnread: null, // số thread có bình luận chưa đọc (null: máy chủ không cho biết)
  threadMentions: 0,
  seenReplies: new Set(), // bình luận đã tính vào số bình luận
  loadedAt: 0, // lúc mở cuộc trò chuyện: bình luận sau lúc này mới cộng vào số
  priority: '', // độ ưu tiên của tin đang soạn
  attach: [], // tệp đính kèm đang soạn
  uploading: false,
  preview: false,
  fmt: true,
};
try {
  S.closed = new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) || '[]'));
  S.dmTab = localStorage.getItem('beingroup-chat-dmtab') === 'req' ? 'req' : 'dm';
  S.fmt = localStorage.getItem('beingroup-chat-fmt') !== '0';
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

// Huy hiệu cạnh tên như web: tích xác minh (hồ sơ phụ màu khác), kim cương Premium
const svgVerified = () => svg('M23 12l-2.44-2.79.34-3.69-3.61-.82-1.89-3.2L12 2.96 8.6 1.5 6.71 4.69 3.1 5.5l.34 3.7L1 12l2.44 2.79-.34 3.7 3.61.82L8.6 22.5l3.4-1.47 3.4 1.46 1.89-3.19 3.61-.82-.34-3.69L23 12Zm-12.91 4.72-3.8-3.81 1.48-1.48 2.32 2.33 5.85-5.87 1.48 1.48-7.33 7.35Z');
const svgDiamond = () => svg('M19 3H5L2 9l10 12L22 9l-3-6ZM9.62 8l1.5-3h1.76l1.5 3H9.62ZM11 10v6.68L5.44 10H11Zm2 0h5.56L13 16.68V10Zm6.26-2h-2.65l-1.5-3h2.65l1.5 3ZM6.24 5h2.65l-1.5 3H4.74l1.5-3Z');
function badges(u) {
  if (!u) return [];
  return [
    u.verified ? el('span', { class: 'vb ' + (u.subProfile ? 'sub' : 'ok'), title: u.subProfile ? 'Hồ sơ phụ đã xác minh' : 'Đã xác minh', 'aria-label': u.subProfile ? 'Hồ sơ phụ đã xác minh' : 'Đã xác minh' }, svgVerified()) : null,
    u.premium ? el('span', { class: 'vb pr ' + u.premium, title: u.premium === 'lifetime' ? 'Tài khoản Premium trọn đời' : 'Tài khoản Premium', 'aria-label': 'Tài khoản Premium' }, svgDiamond()) : null,
  ].filter(Boolean);
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

// Markdown của tin (BG.chatMarkdown) -> phần tử trang; link chỉ http(s) / mailto (bộ đọc đã lọc)
function mdNodes(nodes) {
  const me = String(S.me?.username || '').toLowerCase();
  const kids = (n) => mdNodes(n.c || []);
  return (nodes || [])
    .map((n) => {
      switch (n.t) {
        case 'text':
          return document.createTextNode(n.v);
        case 'br':
          return el('br');
        case 'code':
          return el('code', {}, n.v);
        case 'a':
          return el('a', { href: n.href, target: '_blank', rel: 'noopener noreferrer' }, kids(n));
        case 'at': {
          const who = n.v.slice(1).toLowerCase();
          return el('span', { class: 'mention' + (who === me || ['all', 'channel', 'here'].includes(who) ? ' mine' : '') }, n.v);
        }
        case 'b':
        case 'i':
        case 's':
          return el(n.t, {}, kids(n));
        case 'p':
          return el('p', {}, kids(n));
        case 'h':
          return el('p', { class: 'h h' + n.level }, kids(n));
        case 'quote':
          return el('blockquote', {}, kids(n));
        case 'ul':
          return el('ul', {}, n.items.map((it) => el('li', {}, mdNodes(it))));
        case 'ol':
          return el('ol', { start: n.start !== 1 ? n.start : null }, n.items.map((it) => el('li', {}, mdNodes(it))));
        case 'pre':
          return el('pre', {}, el('code', {}, n.v));
        case 'hr':
          return el('hr');
        default:
          return null;
      }
    })
    .filter(Boolean);
}
// Nội dung tin trong bong bóng: một đoạn thì chữ nằm liền với giờ gửi như trước; nhiều khối thì dựng khối
function msgBody(text) {
  const tree = BG.chatMarkdown(text);
  if (tree.length === 1 && tree[0].t === 'p') return mdNodes(tree[0].c);
  return [el('div', { class: 'md' }, mdNodes(tree))];
}
const mentionsMe = (text) => {
  const me = String(S.me?.username || '').toLowerCase();
  return !!me && new RegExp(`(^|[^\\w.-])@(${me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|all|channel|here)\\b`, 'i').test(text);
};
