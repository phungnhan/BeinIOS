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

// ---------- Bấm tên người: hồ sơ, vi phạm, xử lý (nối với công cụ quản trị của addon) ----------

const dmWith = (chatId) => (chatId ? [...S.dms, ...S.requests].find((d) => d.other?.chatId === chatId) || null : null);
const svgClose = () => svg('M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z');

async function openPerson(u) {
  if (!u || (!u.chatId && !u.id)) return;
  const d = $('person');
  const me = !!u.chatId && u.chatId === S.me?.chatId;
  const name = u.fullname || u.username || 'Người dùng';
  $('pc-head').replaceChildren(
    avatar({ name, chatId: u.chatId, pictureAt: u.pictureAt, size: 'xl' }),
    el('div', { class: 'pc-who' }, el('b', {}, el('span', { class: 'nm' }, name), ...badges(u)), el('span', {}, [u.username ? '@' + u.username : '', u.verified ? (u.subProfile ? 'hồ sơ phụ đã xác minh' : 'đã xác minh') : '', u.premium ? 'Premium' : ''].filter(Boolean).join(' · '))),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Đóng', title: 'Đóng (Esc)', onclick: () => d.close() }, svgClose()),
  );
  const dm = dmWith(u.chatId);
  const body = [
    el(
      'div',
      { class: 'pc-links' },
      u.username ? el('a', { class: 'pc-btn', href: BG.userUrl(u.username), target: '_blank', rel: 'noopener noreferrer' }, 'Trang cá nhân ↗') : null,
      dm && !me
        ? el('button', { type: 'button', class: 'pc-btn', onclick: () => (d.close(), openChat(dm.id)) }, '✉ Nhắn riêng')
        : null,
    ),
  ];
  if (!me && u.id) {
    const vio = el('div', { class: 'pc-sec' }, el('h4', {}, 'Hồ sơ vi phạm'), el('div', { class: 'muted' }, 'Đang đọc…'));
    const posts = el('div', { class: 'pc-sec' }, el('h4', {}, 'Bài trong các community bạn quản trị'), el('button', { type: 'button', class: 'pc-btn', onclick: (e) => findPersonPosts(u, posts, e.currentTarget) }, 'Tìm bài của người này'));
    body.push(vio, posts);
    // Tin của người này đang hiện trong kênh: admin kênh xoá một lần (theo Chạy thử, ghi Nhật ký)
    const theirs = [...S.posts.values(), ...(S.thread ? S.thread.posts.values() : [])].filter((p, i, a) => p.user.chatId === u.chatId && !p.deleted && !p.system && a.findIndex((x) => x.id === p.id) === i);
    if (S.sel?.canDelete && S.sel.kind === 'ch' && theirs.length) body.push(el('div', { class: 'pc-sec' }, el('h4', {}, 'Trong kênh ' + chatTitle(S.sel)), el('button', { type: 'button', class: 'pc-btn danger', onclick: () => deleteAllOf(u, theirs) }, `Xoá ${theirs.length} tin của người này đang hiện`)));
    const link = (k) => `dashboard.html#tab=${k === 'cleanup' ? 'content' : 'members'}&${k}=${encodeURIComponent(u.id)}&u=${encodeURIComponent(u.username || '')}&n=${encodeURIComponent(u.fullname || '')}`;
    body.push(el('div', { class: 'pc-actions' }, el('a', { class: 'pc-btn danger', href: link('cleanup'), target: '_blank', title: 'Mở Dashboard: chọn bài / bình luận của người này để ẩn, tuỳ chọn cấm ở các community bạn quản trị' }, '🧹 Dọn tài khoản…'), el('a', { class: 'pc-btn', href: link('profile'), target: '_blank' }, '⚠ Hồ sơ trên Dashboard')));
    readViolations(u.id).then((x) => vio.replaceChildren(el('h4', {}, 'Hồ sơ vi phạm'), ...x));
  } else if (!me) body.push(el('p', { class: 'muted' }, 'Không có mã Beincom của người này nên chưa mở được công cụ quản trị.'));
  $('pc-body').replaceChildren(...body.filter(Boolean));
  if (!d.open) d.showModal();
}

// Hồ sơ vi phạm addon ghi nhận (Nhật ký, quét): tóm tắt + 3 lần gần nhất
async function readViolations(userId) {
  let p = null;
  try {
    p = (await chrome.storage.local.get('profiles')).profiles?.users?.[userId] || null;
  } catch {}
  if (!p?.events?.length) return [el('div', { class: 'muted' }, 'Chưa ghi nhận vi phạm nào.')];
  const sum = BG.profileSummary(p);
  return [
    el('div', { class: 'pc-vio' + (sum.severe ? ' bad' : '') }, '⚠ ' + BG.profileText(sum)),
    el('ul', { class: 'pc-events' }, p.events.slice(0, 3).map((e) => el('li', {}, el('b', {}, BG.VIOLATION_TYPES[e.type]?.label || e.type), ` · ${e.group || ''} · ${new Date(e.time).toLocaleDateString('vi-VN')}`, e.snippet ? el('span', { class: 'muted' }, ' — ' + String(e.snippet).slice(0, 80)) : null))),
  ];
}

async function findPersonPosts(u, box, btn) {
  btn.disabled = true;
  btn.textContent = 'Đang tìm…';
  const r = await call('userPosts', { userId: u.id });
  if (r.status !== 'ok') {
    btn.disabled = false;
    btn.textContent = 'Tìm bài của người này';
    return box.append(el('div', { class: 'muted' }, 'Không tìm được: ' + (r.message || 'lỗi')));
  }
  const list = (r.posts || []).slice().sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  btn.remove();
  box.append(
    el('div', {}, list.length ? `${list.length} bài còn hiện${r.truncated ? ' (mới xem 200 bài mới nhất mỗi community)' : ''}:` : 'Không có bài nào còn hiện.'),
    el('ul', { class: 'pc-events' }, list.slice(0, 5).map((p) => el('li', {}, el('a', { href: BG.postUrl(p), target: '_blank', rel: 'noopener noreferrer' }, BG.chatPlain(p.title || p.text || '').slice(0, 80) || 'Bài viết'), p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleDateString('vi-VN')}` : ''))),
  );
}

async function deleteAllOf(u, list) {
  const items = list.slice(0, 50);
  const ok = await ask({ title: `Xoá ${items.length} tin của ${u.fullname || u.username}?`, text: 'Các tin đang hiện trong kênh này (và bình luận đang mở) của người này.', note: 'Tin bị xoá với mọi người, không khôi phục được. Theo Chạy thử và được ghi Nhật ký.' });
  if (!ok) return;
  let done = 0;
  let dry = 0;
  let failed = 0;
  for (const p of items) {
    const r = await call('chatDeleteMsg', { postId: p.id, channelId: S.sel.id, own: false, groupName: chatTitle(S.sel), snippet: p.message, user: { id: u.id, username: u.username, fullname: u.fullname } });
    if (r.status !== 'ok' || r.failed) failed++;
    else if (r.dryRun) dry++;
    else {
      done++;
      if (S.posts.has(p.id)) S.posts.set(p.id, { ...S.posts.get(p.id), deleted: true });
      if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, { ...S.thread.posts.get(p.id), deleted: true });
    }
    if (r.status === 'error' && /quyền/.test(r.message || '')) break;
  }
  renderMsgs({ scroll: 'keep' });
  renderThread();
  $('person').close();
  toast(dry ? `Chạy thử: đã ghi ${dry} tin vào Nhật ký, chưa xoá trên Beincom.` : `Đã xoá ${done} tin${failed ? `, ${failed} tin lỗi` : ''}.`, failed ? 'err' : '');
}

// ---------- Biểu cảm (reaction) dưới tin ----------
// Bấm chip để thả / bỏ biểu cảm của mình; rê chuột xem ai đã thả; nút + (hoặc Biểu cảm khi rê chuột vào tin) để chọn.

const QUICK_REACTS = ['+1', 'heart', 'joy', 'open_mouth', 'cry', 'pray', 'fire', 'tada'];
const reactors = new Map(); // mã tin -> { tên emoji: [tên người] } (đọc khi rê chuột)

function reactsEl(p) {
  const list = (p.reactions || []).filter((r) => r.count > 0);
  if (!list.length || p.deleted) return null;
  const me = S.me?.chatId;
  return el(
    'div',
    { class: 'reacts', onmouseenter: (e) => loadReactors(p, e.currentTarget) },
    list.map((r) => {
      const mine = !!(r.mine || (me && r.top?.includes(me)));
      return el('button', { type: 'button', class: 'rc' + (mine ? ' mine' : ''), 'data-name': r.name, 'aria-pressed': String(mine), title: reactTitle(p.id, r, mine), onclick: () => toggleReaction(p, r.name) }, el('span', { class: 'rc-e' }, BG.chatEmoji(r.name) || `:${r.name}:`), el('span', {}, String(r.count)));
    }),
    el('button', { type: 'button', class: 'rc add', title: 'Thả biểu cảm', 'aria-label': 'Thả biểu cảm', onclick: (e) => openReactPop(p, e.currentTarget) }, '+'),
  );
}

function reactTitle(postId, r, mine) {
  const names = reactors.get(postId)?.[r.name];
  if (names?.length) return `${BG.chatEmoji(r.name) || ':' + r.name + ':'} ${names.join(', ')}`;
  return mine ? (r.count > 1 ? `Bạn và ${r.count - 1} người khác` : 'Bạn') : `${r.count} người`;
}

async function loadReactors(p, row) {
  if (reactors.has(p.id) || row.dataset.loading) return;
  row.dataset.loading = '1';
  const r = await call('chatReactions', { postId: p.id });
  if (r.status !== 'ok') return;
  const me = S.me?.chatId;
  reactors.set(p.id, Object.fromEntries(Object.entries(r.reactions).map(([k, v]) => [k, v.map((u) => (u.chatId === me ? 'Bạn' : u.fullname || 'người dùng'))])));
  // Dòng biểu cảm có thể đã được vẽ lại trong lúc chờ: gắn tên vào các chip đang hiện của tin này
  const id = CSS.escape(p.id);
  for (const b of document.querySelectorAll(`#m-${id} .rc[data-name], #t-${id} .rc[data-name]`)) {
    const x = (p.reactions || []).find((y) => y.name === b.dataset.name);
    if (x) b.title = reactTitle(p.id, x, b.classList.contains('mine'));
  }
}

async function toggleReaction(p, name) {
  const me = S.me?.chatId;
  const cur = S.posts.get(p.id) || S.thread?.posts.get(p.id) || p;
  const r = (cur.reactions || []).find((x) => x.name === name);
  const mine = !!(r && (r.mine || r.top?.includes(me)));
  closeReactPop();
  const res = await call('chatReact', { postId: p.id, emoji: name, add: !mine, meChatId: me });
  if (res.status !== 'ok') return toast(res.message || 'Không thả được biểu cảm', 'err');
  const next = (list) => {
    const out = (list || []).map((x) => ({ ...x, top: [...(x.top || [])] }));
    const x = out.find((y) => y.name === name);
    if (!mine) {
      if (x) Object.assign(x, { count: x.count + 1, mine: true, top: [me, ...x.top] });
      else out.push({ name, count: 1, mine: true, top: [me] });
    } else if (x) Object.assign(x, { count: x.count - 1, mine: false, top: x.top.filter((u) => u !== me) });
    return out.filter((y) => y.count > 0);
  };
  const upd = (m) => (m ? { ...m, reactions: next(m.reactions) } : m);
  if (S.posts.has(p.id)) S.posts.set(p.id, upd(S.posts.get(p.id)));
  if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, upd(S.thread.posts.get(p.id)));
  if (S.thread?.root.id === p.id) S.thread.root = S.posts.get(p.id) || upd(S.thread.root);
  reactors.delete(p.id);
  renderMsgs({ scroll: 'keep' });
  renderThread();
}

function openReactPop(p, btn) {
  const pop = $('react-pop');
  const all = [...new Map(Object.entries(BG.CHAT_EMOJI).map(([k, v]) => [v, k])).entries()].map(([emoji, name]) => [name, emoji]);
  const item = (name) => el('button', { type: 'button', class: 'emo', title: ':' + name + ':', 'aria-label': name, onclick: () => toggleReaction(p, name) }, BG.chatEmoji(name));
  pop.replaceChildren(
    el('div', { class: 'rp-quick' }, QUICK_REACTS.map(item), el('button', { type: 'button', class: 'emo rp-more', title: 'Thêm biểu cảm', 'aria-expanded': 'false', onclick: (e) => (e.currentTarget.remove(), pop.append(el('div', { class: 'emoji-grid' }, all.filter(([n]) => !QUICK_REACTS.includes(n)).map(([n]) => item(n))))) }, '…')),
  );
  pop.hidden = false;
  // Nút chỉ hiện khi rê chuột: không đo được thì lấy bong bóng tin làm mốc; thiếu chỗ phía trên thì hiện bên dưới
  const anchor = btn.getBoundingClientRect().width ? btn : btn.closest('.msg')?.querySelector('.bubble') || btn;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(340, innerWidth - 16);
  pop.style.width = w + 'px';
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - w - 8)))}px`;
  const below = r.top - pop.offsetHeight - 6 < 8;
  pop.style.bottom = below ? '' : `${Math.round(innerHeight - r.top + 6)}px`;
  pop.style.top = below ? `${Math.round(Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8))}px` : '';
  pop.querySelector('button')?.focus();
}
function closeReactPop() {
  $('react-pop').hidden = true;
}

// ---------- Tìm tin nhắn (trong kênh / mọi nơi) ----------

function syncSide() {
  $('app').classList.toggle('thread-open', !$('thread').hidden || !$('pins').hidden || !$('search').hidden);
}

function openSearch(term = '', scope = S.sel ? 'channel' : 'all') {
  closeThread();
  closePins();
  S.sScope = S.sel ? scope : 'all';
  $('search').hidden = false;
  syncSide();
  $('s-q').value = term || $('s-q').value;
  renderSearchScope();
  if ($('s-q').value.trim().length >= 2) runSearch();
  else $('s-list').replaceChildren(el('div', { class: 'list-empty' }, 'Gõ chữ cần tìm rồi Enter.'));
  $('s-q').focus();
}
function closeSearch() {
  $('search').hidden = true;
  syncSide();
}
function renderSearchScope() {
  for (const b of document.querySelectorAll('#s-scope button')) {
    b.classList.toggle('on', b.dataset.s === S.sScope);
    if (b.dataset.s === 'channel') b.disabled = !S.sel;
  }
  $('s-sub').textContent = S.sScope === 'channel' && S.sel ? 'Trong ' + chatTitle(S.sel) : 'Mọi cuộc trò chuyện của bạn';
}

async function runSearch() {
  const q = $('s-q').value.trim();
  if (q.length < 2) return toast('Gõ ít nhất 2 ký tự để tìm', 'warn');
  const c = S.sScope === 'channel' ? S.sel : null;
  const seq = (S.sSeq = (S.sSeq || 0) + 1);
  $('s-list').replaceChildren(...skeleton());
  const r = await call('chatSearch', c ? { terms: q, channelId: c.id, teamId: c.teamId || '' } : { terms: q });
  if (seq !== S.sSeq) return;
  if (r.status !== 'ok') return $('s-list').replaceChildren(el('div', { class: 'list-empty' }, r.message || 'Không tìm được'));
  if (!r.posts.length) return $('s-list').replaceChildren(el('div', { class: 'list-empty' }, `Không có tin nào chứa "${q}".`));
  const meId = S.me?.chatId;
  $('s-list').replaceChildren(
    el('div', { class: 't-sep' }, `${r.posts.length} tin${r.posts.length >= 60 ? ' (60 tin mới nhất)' : ''}`),
    ...r.posts.map((p) => {
      const ch = findChat(p.channelId);
      const where = ch ? (ch.kind === 'dm' ? '✉ ' + chatTitle(ch) : '# ' + [...new Set([chatTitle(ch), ch.teamTitle].filter(Boolean))].join(' · ')) : 'Kênh chat';
      return el('div', { class: 's-item' }, el('div', { class: 's-where' }, where, p.rootId ? ' · bình luận' : '', ' · ', shortTime(p.createAt)), messageEl(p, { first: true, last: true, mine: p.user.chatId === meId, mode: 'search' }));
    }),
  );
}

// Mở một kết quả: tới cuộc trò chuyện, nháy tin; bình luận / tin cũ chưa tải thì mở khung bình luận của tin đó
async function openSearchResult(p) {
  const ch = findChat(p.channelId);
  if (!ch) return toast('Cuộc trò chuyện này không có trong danh sách của bạn', 'err');
  if (innerWidth <= 1180) closeSearch();
  if (S.sel?.id !== ch.id) await openChat(ch.id);
  if (S.sel?.id !== ch.id) return;
  if (!p.rootId && S.posts.has(p.id)) return flashTo(p.id);
  const rootId = p.rootId || p.id;
  const stub = S.posts.get(rootId) || (p.rootId ? { id: rootId, channelId: p.channelId, user: { chatId: '', id: '', username: '', fullname: '' }, createAt: p.createAt, updateAt: 0, editAt: 0, deleted: false, system: false, message: '', rootId: '', replyCount: 0, pinned: false, files: [], participants: [], following: false, reactions: [], stub: true } : p);
  await openThread(stub);
  const n = $('t-' + p.id);
  if (n) {
    n.scrollIntoView({ block: 'center' });
    n.classList.add('flash');
  }
}

// ---------- Ghim tin, tin đã ghim ----------

const canPin = (p) => !!S.sel && !p.deleted && !p.system && (S.sel.canDelete || S.sel.kind === 'dm');

async function togglePin(p) {
  const pin = !p.pinned;
  const r = await call('chatPin', { postId: p.id, pin, groupName: chatTitle(S.sel), snippet: BG.chatPlain(p.message).slice(0, 120), user: { id: p.user.id, username: p.user.username, fullname: p.user.fullname } });
  if (r.status !== 'ok' || r.failed) return toast(r.message || (r.errors || []).join('; ') || 'Không ghim được', 'err');
  if (r.dryRun) return toast('Chạy thử: đã ghi vào Nhật ký, chưa ' + (pin ? 'ghim' : 'bỏ ghim') + ' trên Beincom.');
  const upd = (m) => (m ? { ...m, pinned: pin } : m);
  if (S.posts.has(p.id)) S.posts.set(p.id, upd(S.posts.get(p.id)));
  if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, upd(S.thread.posts.get(p.id)));
  if (S.thread?.root.id === p.id) S.thread.root = S.posts.get(p.id) || upd(S.thread.root);
  S.pinned = pin ? [upd(p), ...(S.pinned || []).filter((x) => x.id !== p.id)] : (S.pinned || []).filter((x) => x.id !== p.id);
  renderPinnedCount();
  renderMsgs({ scroll: 'keep' });
  renderThread();
  if (!$('pins').hidden) renderPins();
  toast(pin ? 'Đã ghim tin nhắn.' : 'Đã bỏ ghim.');
}

async function loadPinned(c) {
  const r = await call('chatPinned', { channelId: c.id });
  if (S.sel?.id !== c.id) return;
  S.pinned = r.status === 'ok' ? r.posts : S.pinned;
  S.pinnedError = r.status === 'ok' ? '' : r.message || 'Không đọc được tin đã ghim';
  renderPinnedCount();
  if (!$('pins').hidden) renderPins();
}

function renderPinnedCount() {
  const n = (S.pinned || []).length;
  $('pinned-n').textContent = n ? String(n) : '';
  $('btn-pinned').classList.toggle('has', n > 0);
}

function openPins() {
  if (!S.sel) return;
  closeThread();
  closeSearch();
  $('pins').hidden = false;
  syncSide();
  $('p-sub').textContent = chatTitle(S.sel);
  renderPins();
  loadPinned(S.sel);
}

function closePins() {
  $('pins').hidden = true;
  syncSide();
}

function renderPins() {
  const list = S.pinned;
  const meId = S.me?.chatId;
  if (!list) return $('p-list').replaceChildren(el('div', { class: 't-sep' }, 'Đang tải…'));
  if (!list.length) return $('p-list').replaceChildren(el('div', { class: 'list-empty' }, S.pinnedError || 'Kênh này chưa có tin nào được ghim.' + (canPin({}) ? ' Rê chuột vào một tin → Ghim.' : '')));
  $('p-list').replaceChildren(...list.map((p) => messageEl(p, { first: true, last: true, mine: p.user.chatId === meId, mode: 'pins' })));
}

// ---------- Gợi ý @tên khi gõ (ô gõ và ô bình luận) ----------

const M = { t: null, items: [], i: 0, q: null, timer: 0, seq: 0, cache: new Map() };

function mentionInput(t) {
  const c = S.sel;
  const q = c && t.selectionStart === t.selectionEnd ? BG.chatMentionQuery(t.value, t.selectionStart) : null;
  if (!q) return closeMention();
  M.t = t;
  M.q = q;
  clearTimeout(M.timer);
  M.timer = setTimeout(() => fetchMentions(c, q), 120);
}

async function fetchMentions(c, q) {
  const key = c.id + ':' + q.term.toLowerCase();
  const seq = ++M.seq;
  let users = M.cache.get(key);
  if (!users) {
    const r = await call('chatMentions', { channelId: c.id, teamId: c.teamId || '', term: q.term });
    if (seq !== M.seq) return;
    users = r.status === 'ok' ? r.users : [];
    if (r.status === 'ok') M.cache.set(key, users);
  }
  if (seq !== M.seq || !M.q) return;
  // @all / @channel / @here chỉ ở kênh (không ở tin nhắn riêng)
  const special = c.kind === 'dm' ? [] : [['all', 'Báo cho mọi người trong kênh'], ['channel', 'Báo cho mọi người trong kênh'], ['here', 'Báo cho người đang trực tuyến']].filter(([k]) => q.term && k.startsWith(q.term.toLowerCase())).map(([k, desc]) => ({ special: k, desc }));
  M.items = [...users.filter((u) => u.chatId !== S.me?.chatId && u.username), ...special].slice(0, 9);
  M.i = 0;
  renderMention();
}

function renderMention() {
  const pop = $('mention-pop');
  if (!M.items.length || !M.t) return closeMention();
  pop.replaceChildren(
    ...M.items.map((u, k) =>
      el(
        'div',
        { role: 'option', class: 'mi' + (k === M.i ? ' on' : ''), 'aria-selected': String(k === M.i), onmousedown: (e) => (e.preventDefault(), pickMention(k)) },
        u.special ? el('span', { class: 'avatar xs mi-at' }, '@') : avatar({ name: u.fullname || u.username, chatId: u.chatId, pictureAt: u.pictureAt, size: 'xs' }),
        el('span', { class: 'mi-name' }, u.special ? '@' + u.special : u.fullname || u.username, ...(u.special ? [] : badges(u))),
        el('span', { class: 'mi-sub' }, u.special ? u.desc : '@' + u.username),
      ),
    ),
  );
  const r = M.t.getBoundingClientRect();
  pop.style.left = `${Math.round(Math.max(8, Math.min(r.left, innerWidth - 328)))}px`;
  pop.style.bottom = `${Math.round(innerHeight - r.top + 8)}px`;
  pop.hidden = false;
}

function closeMention() {
  $('mention-pop').hidden = true;
  M.items = [];
  M.q = null;
  M.seq++;
}

function pickMention(k) {
  const u = M.items[k];
  const t = M.t;
  const q = t && (BG.chatMentionQuery(t.value, t.selectionStart) || M.q);
  if (!u || !t || !q) return closeMention();
  const name = u.special || u.username;
  const end = t.selectionStart;
  closeMention();
  applyEdit({ from: q.start, to: end, text: `@${name} `, selStart: q.start + name.length + 2, selEnd: q.start + name.length + 2 }, t);
}

// Phím trong danh sách gợi ý: lên / xuống, Enter / Tab chọn, Esc đóng
function mentionKey(e) {
  if ($('mention-pop').hidden || !M.items.length) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    M.i = (M.i + (e.key === 'ArrowDown' ? 1 : -1) + M.items.length) % M.items.length;
    renderMention();
  } else if (e.key === 'Enter' || e.key === 'Tab') pickMention(M.i);
  else if (e.key === 'Escape') closeMention();
  else return false;
  e.preventDefault();
  return true;
}

// ---------- Sửa tin của mình; bản nháp theo cuộc trò chuyện / thread (lưu trong máy, 7 ngày) ----------

const DRAFT_KEY = 'beingroup-chat-drafts';
let drafts = {};
try {
  drafts = BG.pruneDrafts(JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'));
} catch {}
let draftTimer = 0;
function setDraft(key, text) {
  if (!key) return;
  if (String(text || '').trim()) drafts[key] = { t: String(text).slice(0, 4000), at: Date.now() };
  else delete drafts[key];
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(BG.pruneDrafts(drafts)));
    } catch {}
  }, 300);
}
const draftOf = (key) => drafts[key]?.t || '';
const threadKey = () => (S.thread && S.sel ? `${S.sel.id}:${S.thread.root.id}` : '');

function startEdit(p, inThread = false) {
  if (inThread) {
    S.tEditing = p;
    $('t-text').value = p.message;
    $('t-edit').hidden = false;
    $('t-edit-text').textContent = 'Sửa bình luận: ' + BG.chatPlain(p.message).slice(0, 100);
    tAutosize();
    return $('t-text').focus();
  }
  if (S.preview) setPreview(false);
  S.editing = p;
  $('text').value = p.message;
  renderReply();
  autosize();
  $('text').focus();
}

function cancelEdit(inThread = false) {
  if (inThread) {
    if (!S.tEditing) return;
    S.tEditing = null;
    $('t-edit').hidden = true;
    $('t-text').value = draftOf(threadKey());
    return tAutosize();
  }
  if (!S.editing) return;
  S.editing = null;
  $('text').value = S.sel ? draftOf(S.sel.id) : '';
  renderReply();
  autosize();
}

async function saveEdit(inThread = false) {
  const p = inThread ? S.tEditing : S.editing;
  const t = $(inThread ? 't-text' : 'text');
  const text = t.value.trim();
  if (!p) return;
  if (!text) return toast('Tin nhắn trống', 'err');
  if (text === String(p.message || '').trim()) return cancelEdit(inThread);
  const r = await call('chatEdit', { postId: p.id, message: text });
  if (r.status !== 'ok') return toast(r.message || 'Không sửa được', 'err');
  const upd = (m) => (m ? { ...m, message: r.post?.message ?? text, editAt: r.post?.editAt || Date.now() } : m);
  if (S.posts.has(p.id)) S.posts.set(p.id, upd(S.posts.get(p.id)));
  if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, upd(S.thread.posts.get(p.id)));
  if (S.thread?.root.id === p.id) S.thread.root = S.posts.get(p.id) || upd(S.thread.root);
  cancelEdit(inThread);
  renderMsgs({ scroll: 'keep' });
  renderThread();
  toast('Đã sửa tin nhắn.');
}

// ---------- Thread đang theo dõi (như nút "Thread" trên web) ----------
// Mục "Thread" đầu danh sách (số thread có bình luận chưa đọc); trang danh sách: Tất cả / Chưa đọc; bấm một thread thì mở
// cuộc trò chuyện và khung bình luận của tin đó.

const svgThreads = () => svg('M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1Zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1Z');

function threadsEntry() {
  const n = S.threadUnread || 0;
  if (S.q || S.filter === 'dm' || (S.filter === 'unread' && !n)) return null;
  return el(
    'button',
    { type: 'button', class: 'tl-entry' + (S.view === 'threads' ? ' sel' : '') + (n ? ' unread' : ''), 'aria-current': S.view === 'threads' ? 'true' : null, onclick: () => showThreads() },
    el('span', { class: 'avatar ch tl-ic', 'aria-hidden': 'true' }, svgThreads()),
    el('span', { class: 'item-main' }, el('span', { class: 'item-title' }, el('span', { class: 'nm' }, 'Thread')), el('span', { class: 'item-sub' }, 'Bình luận ở các tin bạn theo dõi')),
    el('span', { class: 'item-side' }, n ? el('span', { class: 'badge' + (S.threadMentions ? ' at' : ''), title: `${n} thread có bình luận chưa đọc` }, n > 99 ? '99+' : String(n)) : null),
  );
}

async function showThreads({ fromHash = false } = {}) {
  closeThread();
  resetComposer();
  S.sel = null;
  S.view = 'threads';
  if (!fromHash) history.replaceState(null, '', location.href.split('#')[0] + '#threads');
  $('app').classList.add('open');
  for (const id of ['empty', 'conv-head', 'msgs', 'composer', 'jump']) $(id).hidden = true;
  $('tview').hidden = false;
  renderList();
  renderThreads();
  await loadThreads();
}

function hideThreads() {
  S.view = '';
  $('tview').hidden = true;
}

async function loadThreads() {
  if (S.tlistLoading) return;
  S.tlistLoading = true;
  renderThreads();
  const filter = S.tlistFilter;
  const r = await call('chatThreads', { unread: filter === 'unread' });
  S.tlistLoading = false;
  if (S.view !== 'threads') return;
  if (r.status !== 'ok') {
    S.tlistError = r.message || 'Không đọc được thread';
    return renderThreads();
  }
  S.tlistError = '';
  S.tlist = r.threads;
  S.tlistOf = filter;
  if (typeof r.unreadThreads === 'number') S.threadUnread = r.unreadThreads;
  renderThreads();
  renderList();
}

function threadCard(t) {
  const ch = findChat(t.channelId);
  const where = ch ? [...new Set([chatTitle(ch), ch.teamTitle].filter(Boolean))].join(' · ') : 'Kênh chat';
  const u = t.root.user;
  const name = u.fullname || u.username || 'Người dùng';
  const at = t.lastReplyAt || t.root.createAt;
  return el(
    'button',
    { type: 'button', class: 'tcard' + (t.unreadReplies ? ' unread' : ''), onclick: () => openFromThreads(t) },
    avatar({ name, chatId: u.chatId, pictureAt: u.pictureAt, size: 'sm' }),
    el(
      'span',
      { class: 'tc-main' },
      el('span', { class: 'tc-top' }, el('span', { class: 'tc-where' }, ch?.kind === 'dm' ? '✉ ' + where : '# ' + where), el('time', { title: fullTime(at) }, shortTime(at))),
      el('span', { class: 'tc-text' }, el('b', {}, name), ...badges(u), ': ', BG.chatPlain(t.root.message) || (t.root.files?.length ? '📎 tệp' : '')),
      el(
        'span',
        { class: 'tc-meta' },
        t.participants.length ? el('span', { class: 'tbar-people' }, t.participants.slice(0, 3).map((p) => avatar({ name: p.fullname || p.username, chatId: p.chatId, pictureAt: p.pictureAt, size: 'xs' }))) : null,
        el('span', {}, `${t.replyCount} bình luận`),
        t.unreadMentions ? el('span', { class: 'badge at' }, '@' + t.unreadMentions) : t.unreadReplies ? el('span', { class: 'badge' }, `${t.unreadReplies} mới`) : null,
      ),
    ),
  );
}

function renderThreads() {
  const list = $('tv-list');
  for (const b of document.querySelectorAll('#tv-filters button')) b.classList.toggle('on', b.dataset.f === S.tlistFilter);
  $('tv-sub').textContent = S.threadUnread ? `${S.threadUnread} thread có bình luận chưa đọc` : 'Bình luận ở các tin bạn đang theo dõi';
  $('tv-refresh').disabled = !!S.tlistLoading;
  if (S.tlistLoading && (!S.tlist || S.tlistOf !== S.tlistFilter)) return list.replaceChildren(...skeleton());
  if (S.tlistError && !S.tlist) return list.replaceChildren(el('div', { class: 'list-empty' }, S.tlistError));
  const items = (S.tlist || []).filter((t) => S.tlistFilter !== 'unread' || t.unreadReplies > 0);
  if (!items.length) return list.replaceChildren(el('div', { class: 'list-empty' }, S.tlistFilter === 'unread' ? 'Đã đọc hết bình luận 🎉' : 'Bạn chưa theo dõi thread nào. Bấm "Theo dõi" dưới một tin có bình luận để theo dõi.'));
  list.replaceChildren(...items.map(threadCard));
}

async function openFromThreads(t) {
  if (!findChat(t.channelId)) return toast('Kênh này không có trong danh sách chat của bạn — mở trên web Beincom', 'err');
  await openChat(t.channelId);
  if (S.sel?.id === t.channelId) openThread(S.posts.get(t.root.id) || t.root);
}

// Mở thread (từ danh sách hay từ tin): bớt số thread chưa đọc
function threadSeen(rootId) {
  const it = (S.tlist || []).find((x) => x.id === rootId);
  if (!it?.unreadReplies) return;
  it.unreadReplies = 0;
  it.unreadMentions = 0;
  S.threadUnread = Math.max(0, (S.threadUnread || 0) - 1);
  renderList();
}

// ---------- Thread: bình luận của một tin (như web Beincom) ----------
// Trang tin chỉ có tin gốc; bình luận nằm trong thread. Tin có bình luận hiện thanh: người tham gia, "N bình luận", theo dõi.

function threadBar(p) {
  const people = (p.participants || []).slice(0, 3);
  return el(
    'div',
    { class: 'tbar' },
    people.length ? el('span', { class: 'tbar-people' }, people.map((u) => avatar({ name: u.fullname || u.username, chatId: u.chatId, pictureAt: u.pictureAt, size: 'xs' }))) : null,
    el('button', { type: 'button', class: 'tbar-n', onclick: () => openThread(p) }, svg('M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2Zm0 14H6l-2 2V4h16v12Z'), `${p.replyCount} bình luận`),
    el('button', { type: 'button', class: 'tbar-follow' + (p.following ? ' on' : ''), 'aria-pressed': String(!!p.following), title: p.following ? 'Bấm để bỏ theo dõi' : 'Theo dõi để nhận thông báo bình luận mới', onclick: () => toggleFollow(p) }, p.following ? 'Đang theo dõi' : 'Theo dõi'),
  );
}

// Bình luận mới (đọc từ lần trước): cập nhật số bình luận của tin gốc, thêm vào thread đang mở
function addReply(p) {
  const t = S.thread;
  if (t && t.root.id === p.rootId) t.posts.set(p.id, p);
  if (S.seenReplies.has(p.id)) return;
  S.seenReplies.add(p.id);
  const root = S.posts.get(p.rootId);
  if (!root || p.createAt < S.loadedAt) return;
  root.replyCount = (root.replyCount || 0) + 1;
  root.lastReplyAt = Math.max(root.lastReplyAt || 0, p.createAt);
  if (!(root.participants || []).some((u) => u.chatId === p.user.chatId)) root.participants = [...(root.participants || []), p.user].slice(-4);
  if (p.user.chatId === S.me?.chatId) root.following = true; // web tự theo dõi thread mình bình luận
  if (t && t.root.id === root.id) t.root = root;
}

async function openThread(p) {
  const c = S.sel;
  if (!c) return;
  const root = S.posts.get(p.id) || p;
  threadSeen(root.id);
  S.thread = { root, posts: new Map([[root.id, root]]), hasNext: false, loading: true, channelId: c.id };
  $('thread').hidden = false;
  $('t-sub').textContent = chatTitle(c);
  closePins();
  closeSearch();
  syncSide();
  S.tEditing = null;
  $('t-edit').hidden = true;
  $('t-text').value = draftOf(`${c.id}:${root.id}`);
  renderThread();
  tAutosize();
  $('t-text').focus();
  const r = await call('chatThread', { rootId: root.id });
  if (S.thread?.root.id !== root.id) return;
  S.thread.loading = false;
  if (r.status !== 'ok') {
    renderThread();
    return toast(r.message || 'Không đọc được bình luận', 'err');
  }
  for (const x of r.posts) {
    if (x.id === root.id) {
      if (root.stub) S.thread.root = x; // mở từ kết quả tìm: tin gốc chưa có trong cuộc trò chuyện
      continue;
    }
    S.thread.posts.set(x.id, x);
    S.seenReplies.add(x.id);
  }
  S.thread.hasNext = r.hasNext;
  renderThread({ scroll: 'bottom' });
  if (c.teamId) call('chatThreadRead', { teamId: c.teamId, rootId: root.id });
}

async function loadMoreThread() {
  const t = S.thread;
  if (!t || t.loading || !t.hasNext) return;
  const last = [...t.posts.values()].sort((a, b) => a.createAt - b.createAt).pop();
  t.loading = true;
  renderThread();
  const r = await call('chatThread', { rootId: t.root.id, fromPost: last.id, fromCreateAt: last.createAt });
  if (S.thread !== t) return;
  t.loading = false;
  if (r.status === 'ok') {
    for (const x of r.posts) if (x.id !== t.root.id) (t.posts.set(x.id, x), S.seenReplies.add(x.id));
    t.hasNext = r.hasNext;
  } else toast(r.message || 'Không đọc được bình luận', 'err');
  renderThread();
}

function closeThread() {
  S.thread = null;
  S.tEditing = null;
  $('t-edit').hidden = true;
  $('thread').hidden = true;
  syncSide();
  $('t-text').value = '';
}

function renderThread({ scroll = 'keep' } = {}) {
  const t = S.thread;
  if (!t) return;
  const box = $('t-body');
  const stick = scroll === 'bottom' || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const replies = [...t.posts.values()].filter((x) => x.id !== t.root.id).sort((a, b) => a.createAt - b.createAt);
  const meId = S.me?.chatId;
  const out = [messageEl(t.root, { first: true, last: true, mine: t.root.user.chatId === meId, inThread: true })];
  const n = Math.max(t.root.replyCount || 0, replies.length);
  out.push(el('div', { class: 't-sep' }, t.loading && !replies.length ? 'Đang tải bình luận…' : n ? `${n} bình luận` : 'Chưa có bình luận nào — hãy là người đầu tiên.'));
  let prev = null;
  replies.forEach((p, i) => {
    const next = replies[i + 1];
    const same = (a, b) => a && b && a.user.chatId === b.user.chatId && Math.abs(b.createAt - a.createAt) < GROUP_GAP;
    out.push(messageEl(p, { first: !same(prev, p), last: !same(p, next), mine: p.user.chatId === meId, inThread: true }));
    prev = p;
  });
  $('t-list').replaceChildren(...out);
  $('t-more').hidden = !t.hasNext;
  $('t-more').disabled = t.loading;
  $('t-more').textContent = t.loading ? 'Đang tải…' : 'Tải thêm bình luận';
  $('t-follow').textContent = t.root.following ? 'Đang theo dõi' : 'Theo dõi';
  $('t-follow').classList.toggle('on', !!t.root.following);
  $('t-follow').setAttribute('aria-pressed', String(!!t.root.following));
  const canPost = S.sel && $('text').disabled === false;
  $('t-text').disabled = !canPost;
  $('t-text').placeholder = canPost ? 'Viết bình luận…' : 'Bạn không gửi được bình luận ở đây';
  tUpdateSend();
  if (stick) box.scrollTop = box.scrollHeight;
}

async function toggleFollow(p) {
  const c = S.sel;
  if (!c?.teamId) return;
  const root = S.posts.get(p.id) || p;
  const follow = !root.following;
  const r = await call('chatFollow', { teamId: c.teamId, rootId: root.id, follow });
  if (r.status !== 'ok') return toast(r.message || 'Không làm được', 'err');
  root.following = follow;
  if (S.thread?.root.id === root.id) S.thread.root = root;
  renderMsgs({ scroll: 'keep' });
  renderThread();
  toast(follow ? 'Đã theo dõi bình luận của tin này' : 'Đã bỏ theo dõi');
}

function tAutosize() {
  const t = $('t-text');
  t.style.height = 'auto';
  t.style.height = Math.min(160, t.scrollHeight) + 'px';
  tUpdateSend();
}
function tUpdateSend() {
  $('t-send').disabled = !!S.tSending || $('t-text').disabled || !$('t-text').value.trim();
}

async function sendThread(e) {
  e?.preventDefault();
  const t = S.thread;
  const c = S.sel;
  if (S.tEditing) return saveEdit(true);
  const text = $('t-text').value.trim();
  if (!t || !c || !text || S.tSending) return;
  S.tSending = true;
  tUpdateSend();
  const r = await call('chatSend', { channelId: c.id, message: text, rootId: t.root.id });
  S.tSending = false;
  if (r.status !== 'ok') {
    tUpdateSend();
    return toast(r.message || 'Gửi bình luận lỗi', 'err');
  }
  $('t-text').value = '';
  setDraft(`${c.id}:${t.root.id}`, '');
  tAutosize();
  if (r.post && S.thread === t) {
    S.lastSync = Math.max(S.lastSync, r.post.updateAt || 0, r.post.createAt || 0);
    addReply({ ...r.post, createAt: Math.max(r.post.createAt || 0, S.loadedAt) });
    t.posts.set(r.post.id, r.post);
    renderThread({ scroll: 'bottom' });
    renderMsgs({ scroll: 'keep' });
  }
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

// ---------- Danh sách cuộc trò chuyện ----------

const asDm = (c) => ({ ...c, kind: 'dm', teamTitle: '' });
const asReq = (c) => ({ ...c, kind: 'dm', req: true, teamTitle: '' });
function allChats() {
  return [...S.dms.map(asDm), ...S.requests.map(asReq), ...S.teams.flatMap((t) => t.channels.map((c) => ({ ...c, kind: 'ch', teamTitle: t.title })))];
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
    el('span', { class: 'item-main' }, el('span', { class: 'item-title' }, el('span', { class: 'nm' }, chatTitle(c)), dm ? badges(c.other) : null), S.sel?.id !== c.id && draftOf(c.id) ? el('span', { class: 'item-sub draft' }, '✏ Nháp: ' + draftOf(c.id).replace(/\s+/g, ' ').slice(0, 60)) : el('span', { class: 'item-sub' }, dm ? (c.type === 'G' ? 'Nhóm chat' : [c.other?.username ? '@' + c.other.username : contactNote(c) ? '' : 'Tin nhắn riêng', contactNote(c)].filter(Boolean).join(' · ')) : c.purpose || c.teamTitle)),
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
function section(key, title, items, { limit = 0, label = '', pinned = false, tabs = null, tab = '', empty = '', moreKey = key } = {}) {
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
    : el('button', { type: 'button', class: 'sec-head', 'aria-expanded': String(!closed), onclick: () => toggleSec(key) }, svgChevron(), el('span', { class: 'sec-title' }, title), pinned ? el('span', { class: 'pin', title: 'Cộng đồng bạn đã ghim trên Beincom' }, svgPin()) : null);
  return el('div', { class: 'sec' + (closed ? ' closed' : '') }, head, el('div', { class: 'sec-items' }, ...shown.map(listItem), items.length ? more : el('div', { class: 'sec-empty' }, empty)));
}

// Tin nhắn riêng và Lời mời trò chuyện: hai tab cạnh nhau. Đang tìm / lọc Chưa đọc thì gộp cả hai (lời mời có ghi chú)
function dmSection() {
  const dms = S.dms.map(asDm).filter(matches);
  const reqs = S.requests.map(asReq).filter(matches);
  if (S.q || S.filter === 'unread') return section('dm', 'Tin nhắn riêng', [...dms, ...reqs].sort((a, b) => (b.lastPostAt || 0) - (a.lastPostAt || 0)));
  const req = S.dmTab === 'req';
  const hot = S.requests.some((r) => r.unread || r.mentions);
  return section('dm', 'Tin nhắn riêng', req ? reqs : dms, {
    limit: req ? SHOW_REQS : SHOW_DMS,
    label: req ? 'lời mời' : 'tin nhắn riêng',
    moreKey: req ? 'req' : 'dm',
    tabs: [
      ['dm', 'Tin nhắn riêng', 0, false],
      ['req', 'Lời mời', S.requests.length, hot],
    ],
    tab: req ? 'req' : 'dm',
    empty: req ? 'Không có lời mời trò chuyện nào. Lời mời là tin nhắn riêng từ người chưa kết nối với bạn.' : 'Chưa có tin nhắn riêng.',
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
  for (const id of ['conv-head', 'msgs', 'composer', 'jump', 'req-bar', 'tview']) $(id).hidden = true;
  S.view = '';
}

// ---------- Mở cuộc trò chuyện, tin nhắn ----------

function sortedPosts() {
  return [...S.posts.values()].sort((a, b) => a.createAt - b.createAt);
}

function addPosts(list) {
  for (const p of list || []) {
    if (p.rootId) addReply(p);
    else {
      // Tin đọc lại từ lần trước (sửa / xoá) không kèm người tham gia, theo dõi: giữ cái đã biết
      const o = S.posts.get(p.id);
      S.posts.set(p.id, o ? { ...p, replyCount: Math.max(o.replyCount || 0, p.replyCount || 0), following: o.following || p.following, participants: p.participants?.length ? p.participants : o.participants } : p);
    }
    S.lastSync = Math.max(S.lastSync, p.updateAt || 0, p.createAt || 0, p.editAt || 0);
  }
}

async function openChat(id, { fromHash = false } = {}) {
  const c = findChat(id);
  if (!c) return;
  if (S.view === 'threads') hideThreads();
  if (S.sel?.id !== c.id) {
    resetComposer();
    closeThread();
    closePins();
    closeMention();
    S.editing = null;
    renderReply();
    $('text').value = draftOf(c.id);
    S.pinned = null;
    renderPinnedCount();
    closeReactPop();
    if (!$('search').hidden && S.sScope === 'channel') closeSearch();
    S.seenReplies = new Set();
    loadPinned(c);
  }
  S.loadedAt = Date.now();
  // Tab Tin nhắn riêng / Lời mời theo cuộc trò chuyện đang mở (mở từ thông báo, từ kết quả tìm)
  if (c.kind === 'dm' && S.dmTab !== (c.req ? 'req' : 'dm')) setDmTab(c.req ? 'req' : 'dm', false);
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
  // Lời mời bạn gửi đi: chờ người nhận chấp nhận (hoặc họ đã bỏ qua) thì chưa gửi tiếp được, như web
  const waiting = !!(c.contact?.sent || c.contact?.ignoredByOther);
  const canPost = !waiting && (c.kind === 'dm' || c.canPost !== false);
  $('text').disabled = !canPost;
  $('text').placeholder = canPost ? (c.kind === 'dm' ? `Nhắn cho ${chatTitle(c)}…` : `Nhắn vào ${chatTitle(c)}…`) : waiting ? 'Chờ người nhận chấp nhận lời mời…' : 'Bạn chỉ xem được kênh này';
  $('hint').textContent = canPost ? 'Enter để gửi · Shift + Enter xuống dòng' : waiting ? 'Beincom chỉ cho gửi tiếp khi người nhận chấp nhận lời mời trò chuyện.' : 'Beincom không cho tài khoản của bạn gửi tin vào kênh này.';
  renderReqBar(c);
  updateSend();
}

// Thanh lời mời trò chuyện phía trên ô gõ
function renderReqBar(c) {
  const k = c?.contact;
  const name = chatTitle(c || {});
  let text = '';
  let actions = false;
  if (k?.incoming && k.status !== 'ignored') {
    text = `${name} chưa kết nối với bạn và đã gửi lời mời trò chuyện.${k.status === 'spammed' ? ' Beincom xếp lời mời này vào Spam (gửi lặp lại nhiều lần).' : ''} Nếu bạn trả lời, bạn cũng chấp nhận lời mời này.`;
    actions = true;
  } else if (k?.incoming) {
    text = `Bạn đã bỏ qua lời mời trò chuyện của ${name}. Bấm Chấp nhận nếu muốn trò chuyện.`;
    actions = true;
  } else if (k?.sent) text = 'Bạn đã gửi lời mời trò chuyện. Chờ người nhận chấp nhận trước khi gửi tin tiếp theo.';
  else if (k?.ignoredByOther) text = 'Người nhận hiện không nhận lời mời trò chuyện của bạn. Bạn có thể thử lại sau trên web Beincom.';
  $('req-bar').hidden = !text;
  $('req-text').textContent = text;
  $('req-actions').hidden = !actions;
  $('req-ignore').hidden = k?.status === 'ignored';
}

// Lời mời đã được chấp nhận (bấm Chấp nhận, hoặc trả lời): chuyển sang Tin nhắn riêng
function acceptedLocally(id) {
  const c = S.requests.find((x) => x.id === id);
  if (!c) return;
  S.requests = S.requests.filter((x) => x.id !== id);
  const moved = { ...c, contact: { ...c.contact, status: 'accepted', incoming: false } };
  S.dms = [moved, ...S.dms].sort((a, b) => (b.lastPostAt || 0) - (a.lastPostAt || 0));
  if (S.sel?.id === id) {
    setDmTab('dm', false);
    S.sel = Object.assign(S.sel, { contact: moved.contact, req: false });
    renderHead();
    applyComposer(S.sel);
  }
  renderList();
}

async function reqAction(action) {
  const c = S.sel;
  const k = c?.contact;
  if (!k?.id) return;
  if (action === 'ignore' && !(await ask({ title: 'Bỏ qua lời mời trò chuyện?', text: `Lời mời của ${chatTitle(c)} sẽ không còn ở mục đang chờ trên Beincom. Cuộc trò chuyện vẫn nằm trong Lời mời trò chuyện ở đây.`, ok: 'Bỏ qua' }))) return;
  for (const b of ['req-accept', 'req-ignore']) $(b).disabled = true;
  const r = await call('chatContact', { contactId: k.id, action });
  for (const b of ['req-accept', 'req-ignore']) $(b).disabled = false;
  if (r.status !== 'ok') return toast(r.message || 'Không làm được', 'err');
  if (action === 'accept') {
    acceptedLocally(c.id);
    toast('Đã chấp nhận lời mời trò chuyện');
  } else {
    const upd = (x) => (x.id === c.id ? Object.assign(x, { contact: { ...x.contact, status: 'ignored' } }) : x);
    S.requests.forEach(upd);
    if (S.sel?.id === c.id) upd(S.sel);
    applyComposer(S.sel);
    renderList();
    toast('Đã bỏ qua lời mời trò chuyện');
  }
}

function renderHead() {
  const c = S.sel;
  const dm = c.kind === 'dm';
  $('conv-avatar').replaceWith(Object.assign(dm ? avatar({ name: chatTitle(c), chatId: c.other?.chatId, pictureAt: c.other?.pictureAt, size: 'lg' }) : avatar({ name: chatTitle(c), seed: c.id, channel: true, locked: c.type === 'P', size: 'lg' }), { id: 'conv-avatar', onclick: dm && c.other ? () => openPerson(c.other) : null, title: dm && c.other ? 'Hồ sơ, vi phạm, xử lý' : '' }));
  $('conv-title').replaceChildren(el('span', { class: 'nm' }, chatTitle(c)), ...(dm ? badges(c.other) : []));
  $('conv-sub').textContent = dm ? (c.type === 'G' ? 'Nhóm chat' : c.other?.username ? '@' + c.other.username + (c.req ? ' · lời mời trò chuyện' : ' · tin nhắn riêng') : c.req ? 'Lời mời trò chuyện' : 'Tin nhắn riêng') : [c.teamTitle, c.type === 'P' ? 'kênh riêng' : 'kênh chung', c.canDelete ? 'bạn là admin kênh' : ''].filter(Boolean).join(' · ');
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

// inThread: tin trong khung bình luận (mã phần tử 't-…', không có nút Bình luận / thanh thread)
// mode: 'main' (cuộc trò chuyện) | 'thread' (khung bình luận) | 'pins' (tin đã ghim)
function messageEl(p, { first, last, mine, inThread = false, mode = inThread ? 'thread' : 'main' }) {
  inThread = mode !== 'main';
  const name = p.user.fullname || p.user.username || 'Người dùng';
  const canDel = !p.deleted && (mine || S.sel?.canDelete);
  const bubble = el('div', { class: 'bubble' });
  if (p.deleted) bubble.append('Tin nhắn đã bị xoá');
  else {
    if (p.pinned && mode !== 'pins') bubble.append(el('span', { class: 'pin-tag' }, svgPin(), 'Đã ghim'));
    if (p.priority) bubble.append(el('span', { class: 'prio ' + p.priority }, svgPrio(p.priority), PRIO_LABEL[p.priority].toUpperCase()));
    if (p.message) bubble.append(...msgBody(p.message));
    if (p.files.length) bubble.append(filesEl(p.files, p));
    bubble.append(el('span', { class: 'meta', title: fullTime(p.createAt) }, p.editAt ? 'đã sửa · ' : '', hm(p.createAt)));
  }
  const tools = p.deleted
    ? null
    : el(
        'div',
        { class: 'tools' },
        mode === 'search' ? el('button', { type: 'button', onclick: () => openSearchResult(p) }, 'Mở') : null,
        mode === 'main' || mode === 'thread' ? el('button', { type: 'button', title: 'Thả biểu cảm', onclick: (e) => openReactPop(p, e.currentTarget) }, '😊') : null,
        mode === 'main' ? el('button', { type: 'button', onclick: () => openThread(p) }, 'Bình luận') : null,
        mode === 'pins' && S.posts.has(p.id) ? el('button', { type: 'button', onclick: () => (innerWidth <= 1180 && closePins(), flashTo(p.id)) }, 'Tới tin nhắn') : null,
        mine && p.message && (mode === 'main' || mode === 'thread') ? el('button', { type: 'button', onclick: () => startEdit(p, mode === 'thread') }, 'Sửa') : null,
        p.message ? el('button', { type: 'button', onclick: () => copyMsg(p) }, 'Sao chép') : null,
        canPin(p) && !p.rootId && mode !== 'search' ? el('button', { type: 'button', onclick: () => togglePin(p) }, p.pinned ? 'Bỏ ghim' : 'Ghim') : null,
        canDel && (mode === 'main' || mode === 'thread') ? el('button', { type: 'button', class: 'del', onclick: () => deleteMsg(p, mine) }, 'Xoá') : null,
      );
  return el(
    'div',
    { class: `msg${mine ? ' me' : ''}${first ? ' first' : ''}${last ? ' last' : ''}${p.deleted ? ' deleted' : ''}${!mine && mentionsMe(p.message) ? ' mentioned' : ''}`, id: { main: 'm-', thread: 't-', pins: 'p-', search: 's-' }[mode] + p.id },
    mine ? null : Object.assign(avatar({ name, chatId: p.user.chatId, pictureAt: p.user.pictureAt, size: 'sm' }), { onclick: () => openPerson(p.user), title: 'Xem ' + name }),
    el('div', { class: 'msg-col' }, (first || mode === 'pins' || mode === 'search') && !mine ? el('div', { class: 'msg-name', style: nameColor(p.user.chatId) }, el('button', { type: 'button', class: 'nm-btn', title: 'Hồ sơ, vi phạm, xử lý', onclick: () => openPerson(p.user) }, name), ...badges(p.user), el('time', { title: fullTime(p.createAt) }, mode === 'pins' ? shortTime(p.createAt) + ' ' + hm(p.createAt) : hm(p.createAt))) : null, bubble, mode === 'search' ? null : reactsEl(p), mode === 'main' && !p.deleted && p.replyCount > 0 ? threadBar(p) : null),
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

// Thanh trên ô gõ khi đang sửa tin (Esc hoặc ✕ để huỷ); lúc sửa không đính kèm / đặt độ ưu tiên
function renderReply() {
  const p = S.editing;
  $('reply').hidden = !p;
  $('reply').classList.toggle('editing', !!p);
  $('reply-text').textContent = p ? `Sửa tin nhắn: ${(BG.chatPlain(p.message) || '📎 tệp').slice(0, 100)}` : '';
  $('btn-attach').disabled = $('btn-prio').disabled = !!p;
  if (p) $('text').placeholder = 'Sửa tin nhắn… (Enter lưu, Esc huỷ)';
  else if (S.sel) applyComposer(S.sel);
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
  if (S.posts.has(p.id)) S.posts.set(p.id, { ...S.posts.get(p.id), deleted: true });
  if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, { ...S.thread.posts.get(p.id), deleted: true });
  if (S.thread?.root.id === p.id) S.thread.root = S.posts.get(p.id) || { ...p, deleted: true };
  renderMsgs({ scroll: 'keep' });
  renderThread();
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
  const busy = S.attach.some((a) => a.status === 'up' || a.status === 'wait');
  const files = S.attach.some((a) => a.status === 'ok');
  $('send').disabled = S.sending || busy || $('text').disabled || (!$('text').value.trim() && !files);
}

async function sendMsg(e) {
  e?.preventDefault();
  const c = S.sel;
  if (S.editing) return saveEdit();
  const text = $('text').value.trim();
  const fileIds = S.attach.filter((a) => a.status === 'ok').map((a) => a.id);
  if (!c || (!text && !fileIds.length) || S.sending || $('send').disabled) return;
  S.sending = true;
  updateSend();
  // Trả lời lời mời trò chuyện là chấp nhận lời mời (như web Beincom)
  const accept = c.contact?.incoming && c.contact.status !== 'ignored' && c.contact.id ? c.contact.id : '';
  const r = await call('chatSend', { channelId: c.id, message: text, rootId: S.reply?.rootId || S.reply?.id || '', ...(accept ? { acceptContactId: accept } : {}), ...(S.priority ? { priority: S.priority } : {}), ...(fileIds.length ? { fileIds } : {}) });
  if (r.accepted) acceptedLocally(c.id);
  S.sending = false;
  if (r.status !== 'ok') {
    updateSend();
    return toast(r.message || 'Gửi tin lỗi', 'err');
  }
  $('text').value = '';
  setDraft(c.id, '');
  S.reply = null;
  renderReply();
  resetComposer();
  autosize();
  // Tin có tệp: đọc lại tin sau giây lát để có ảnh / link tệp do máy chủ điền
  if (fileIds.length && r.post) {
    setTimeout(async () => {
      const again = await call('chatPosts', { channelId: c.id, since: (r.post.createAt || Date.now()) - 1 });
      if (again.status === 'ok' && S.sel?.id === c.id) {
        addPosts(again.posts);
        renderMsgs();
      }
    }, 1500);
  }
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
  S.requests.forEach(upd);
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
  // Tin gốc mới / sửa / xoá hiện ở cuộc trò chuyện; bình luận cập nhật số bình luận và thread đang mở
  const changed = r.posts.filter((p) => {
    if (p.rootId) return !S.seenReplies.has(p.id) || !!S.thread?.posts.has(p.id);
    const o = S.posts.get(p.id);
    return !o || o.message !== p.message || o.deleted !== p.deleted || o.editAt !== p.editAt;
  });
  if (!changed.length) return;
  const incoming = changed.filter((p) => !p.rootId && !S.posts.has(p.id) && !p.system && p.user.chatId !== S.me?.chatId).length;
  const inThread = S.thread && changed.some((p) => p.rootId === S.thread.root.id);
  const stick = nearBottom();
  addPosts(r.posts);
  renderMsgs({ scroll: stick ? 'bottom' : 'keep' });
  if (inThread) renderThread();
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
    await chrome.storage.session?.set({ [CACHE_KEY]: { at: Date.now(), me: S.me, teams: S.teams, dms: S.dms, requests: S.requests, dmTeam: r.dmTeam } });
  } catch {}
  return r;
}

// Lần đọc nhanh thiếu tên người / quyền của một số cuộc trò chuyện: giữ cái đã biết (danh sách lần trước, lần đọc đủ)
function applyOverview(r) {
  const old = new Map([...S.dms, ...S.requests, ...S.teams.flatMap((t) => t.channels)].map((c) => [c.id, c]));
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
  S.requests = (r.requests || []).map(keep);
  S.dmTeamName = r.dmTeam?.name || '';
  if (r.threads) {
    S.threadUnread = r.threads.unread;
    S.threadMentions = r.threads.mentions;
  }
}

function afterOverview() {
  // Đang xem kênh thì coi như đã đọc
  if (S.sel && !document.hidden) bumpChat(S.sel.id, { unread: 0, mentions: 0 });
  if (S.sel) {
    const was = S.sel;
    const now = findChat(S.sel.id);
    S.sel = Object.assign(now || S.sel, { kind: S.sel.kind, teamTitle: S.sel.teamTitle, req: now ? !!now.req : S.sel.req });
    // Lần đọc đủ mới biết quyền / tên, lời mời đã được chấp nhận ở nơi khác: cập nhật đầu trang, ô gõ, nút Xoá
    if (was.canPost !== S.sel.canPost || was.canDelete !== S.sel.canDelete || was.title !== S.sel.title || was.contact?.status !== S.sel.contact?.status || was.req !== S.sel.req) {
      renderHead();
      applyComposer(S.sel);
      if (was.canDelete !== S.sel.canDelete && S.posts.size) renderMsgs({ scroll: 'keep' });
    }
  }
  renderMe();
  renderList();
  if (!S.sel && S.view !== 'threads') {
    const want = new URLSearchParams(location.hash.slice(1)).get('c');
    if (want && findChat(want)) openChat(want, { fromHash: true });
    else if (new URLSearchParams(location.hash.slice(1)).has('threads')) showThreads({ fromHash: true });
    else showEmpty('Chọn một cuộc trò chuyện', 'Tin nhắn riêng và kênh chat của các group bạn tham gia ở bên trái. Tin mới tự hiện khi trang đang mở.');
  }
}

// ---------- Bộ gõ tin nhắn (như web Beincom): định dạng, độ ưu tiên, xem trước, đính kèm, emoji ----------

const FMT_KEY = 'beingroup-chat-fmt';
const EMOJI_KEY = 'beingroup-chat-emoji';
const DMTAB_KEY = 'beingroup-chat-dmtab';
const FILE_MAX = 25 * 1024 * 1024; // máy chủ chat Beincom: MaxFileSize 25 MB
const FILES_MAX = 10;
const PRIO_LABEL = { important: 'Quan trọng', urgent: 'Khẩn cấp' };
const SHORTCUTS = [
  ['KeyB', false, false, 'bold'],
  ['KeyI', false, false, 'italic'],
  ['KeyX', true, false, 'strike'],
  ['KeyK', false, true, 'link'],
  ['KeyC', false, true, 'code'],
  ['Digit9', true, false, 'quote'],
  ['Digit8', true, false, 'ul'],
  ['Digit7', true, false, 'ol'],
];
const svgPrio = (p) => svg(p === 'urgent' ? 'M12 6 19.53 19H4.47L12 6Zm0-4L1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-6h-2v4h2v-4Z' : 'M11 15h2v2h-2v-2Zm0-8h2v6h-2V7Zm1-5C6.47 2 2 6.48 2 12s4.47 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8Z');

// Áp một lần thay (BG.mdEdit / BG.mdNewline) vào ô gõ; dùng insertText để Ctrl + Z vẫn hoàn tác được
function applyEdit(r, t = $('text')) {
  if (!r) return;
  if (S.preview && t === $('text')) setPreview(false);
  t.focus();
  t.setSelectionRange(r.from, r.to);
  const ok = r.text ? document.execCommand('insertText', false, r.text) : r.from === r.to || document.execCommand('delete');
  if (!ok) t.setRangeText(r.text, r.from, r.to, 'end');
  t.setSelectionRange(r.selStart, r.selEnd);
  t.dispatchEvent(new Event('input')); // cỡ ô gõ, nút gửi
}
const format = (kind) => {
  const t = $('text');
  if (t.disabled) return;
  applyEdit(BG.mdEdit(t.value, t.selectionStart, t.selectionEnd, kind));
};
function insertText(text) {
  const t = $('text');
  if (t.disabled) return;
  const [s, e] = document.activeElement === t || S.caret == null ? [t.selectionStart, t.selectionEnd] : [S.caret, S.caret];
  applyEdit({ from: s, to: e, text, selStart: s + text.length, selEnd: s + text.length });
}

// Xem trước: tin hiện như sau khi gửi
function setPreview(on) {
  S.preview = !!on;
  const text = $('text').value;
  $('preview').hidden = !S.preview;
  $('text').hidden = S.preview;
  $('btn-preview').setAttribute('aria-pressed', String(S.preview));
  $('btn-preview').classList.toggle('on', S.preview);
  if (S.preview) $('preview').replaceChildren(...(text.trim() ? mdNodes(BG.chatMarkdown(text)) : [el('span', { class: 'muted' }, 'Chưa có gì để xem trước.')]));
  else $('text').focus();
}

// Thanh định dạng: Aa ẩn / hiện (nhớ trong máy)
function setFmt(on) {
  S.fmt = !!on;
  $('fmt').hidden = !S.fmt;
  $('btn-fmt').setAttribute('aria-pressed', String(S.fmt));
  $('btn-fmt').classList.toggle('on', S.fmt);
  try {
    localStorage.setItem(FMT_KEY, S.fmt ? '1' : '0');
  } catch {}
}

// Độ ưu tiên của tin: Tiêu chuẩn / Quan trọng / Khẩn cấp (gửi kèm metadata.priority như web)
function renderPrio() {
  const p = S.priority || '';
  $('prio-chip').hidden = !p;
  $('prio-chip').className = 'prio-chip ' + p;
  $('prio-chip').replaceChildren(...(p ? [svgPrio(p), el('span', {}, PRIO_LABEL[p].toUpperCase()), el('button', { type: 'button', 'aria-label': 'Bỏ độ ưu tiên', title: 'Bỏ độ ưu tiên', onclick: () => setPriority('') }, '✕')] : []));
  $('btn-prio').className = 'tb' + (p ? ' ' + p + ' on' : '');
  for (const b of document.querySelectorAll('#prio-menu [data-prio]')) b.setAttribute('aria-checked', String(b.dataset.prio === p));
}
function setPriority(p) {
  S.priority = BG.CHAT_PRIORITIES.includes(p) ? p : '';
  renderPrio();
  closePops();
  $('text').focus();
}

// Hộp nổi phía trên nút (độ ưu tiên, emoji)
function openPop(pop, btn, align) {
  closePops(pop);
  pop.hidden = false;
  const c = $('composer').getBoundingClientRect();
  const b = btn.getBoundingClientRect();
  pop.style.bottom = `${Math.round(c.bottom - b.top + 6)}px`;
  if (align === 'right') {
    pop.style.right = `${Math.max(8, Math.round(c.right - b.right))}px`;
    pop.style.left = '';
  } else {
    pop.style.left = `${Math.max(8, Math.round(b.left - c.left))}px`;
    pop.style.right = '';
  }
  btn.setAttribute('aria-expanded', 'true');
}
function closePops(except) {
  for (const [pop, btn] of [['prio-menu', 'btn-prio'], ['emoji-pop', 'btn-emoji']]) {
    if ($(pop) === except || $(pop).hidden) continue;
    $(pop).hidden = true;
    $(btn).setAttribute('aria-expanded', 'false');
  }
}

// Emoji: hay dùng (nhớ trong máy) + vài nhóm thường gặp
const EMOJI = [
  ['🕘', 'Hay dùng', []],
  ['😀', 'Mặt cười', [...'😀😃😄😁😆😅🤣😂🙂😉😊😇🥰😍🤩😘😋😛😜🤪🤑🤗🤭🤫🤔🤐😐😑😶😏😒🙄😬😌😔😪😴😷🤒🤕🤢🥵🥶😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫😤😡😠🤬']],
  ['👍', 'Cử chỉ', ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '👏', '🙌', '👐', '🤲', '🙏', '🤝', '💪', '✍️', '👀', '🧠']],
  ['❤️', 'Trái tim', ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝']],
  ['🚀', 'Crypto', ['🚀', '🌕', '📈', '📉', '💰', '💵', '💸', '💎', '🪙', '🏦', '🔥', '⚡', '✅', '❌', '⚠️', '🎉', '🎁', '🏆', '⭐', '🌟', '💯', '🔔', '📢', '📌', '🔗', '🐂', '🐻', '🐳', '🦄', '⏳', '🎯', '🤖']],
];
const EMOJI_DEFAULT = ['👍', '❤️', '😂', '🙏', '🔥', '🎉', '🚀', '✅', '😍', '👏', '💯', '😅'];
function recentEmoji() {
  try {
    const l = JSON.parse(localStorage.getItem(EMOJI_KEY) || '[]');
    return Array.isArray(l) && l.length ? l.slice(0, 24) : EMOJI_DEFAULT;
  } catch {
    return EMOJI_DEFAULT;
  }
}
function renderEmoji(tab = S.emojiTab || 0) {
  S.emojiTab = tab;
  $('emoji-tabs').replaceChildren(...EMOJI.map(([ic, name], k) => el('button', { type: 'button', role: 'tab', class: 'etab' + (k === tab ? ' on' : ''), title: name, 'aria-label': name, 'aria-selected': String(k === tab), onclick: () => renderEmoji(k) }, ic)));
  const list = tab === 0 ? recentEmoji() : EMOJI[tab][2];
  $('emoji-grid').replaceChildren(...list.map((e) => el('button', { type: 'button', class: 'emo', title: e, 'aria-label': e, onclick: () => pickEmoji(e) }, e)));
}
function pickEmoji(e) {
  insertText(e);
  try {
    localStorage.setItem(EMOJI_KEY, JSON.stringify([e, ...recentEmoji().filter((x) => x !== e)].slice(0, 24)));
  } catch {}
}

// Đính kèm: chọn tệp, dán ảnh, kéo thả; tải lên ngay (lần lượt từng tệp), gửi kèm mã tệp khi gửi tin
const readB64 = (file) =>
  new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
function addFiles(list) {
  const c = S.sel;
  if (!c || $('text').disabled) return;
  for (const f of [...(list || [])]) {
    if (S.attach.length >= FILES_MAX) {
      toast(`Tối đa ${FILES_MAX} tệp mỗi tin`, 'err');
      break;
    }
    if (!f.size) toast(`${f.name || 'Tệp'}: tệp trống`, 'err');
    else if (f.size > FILE_MAX) toast(`${f.name || 'Tệp'}: lớn quá 25 MB`, 'err');
    else S.attach.push({ key: Math.random().toString(36).slice(2), file: f, name: f.name || 'anh-dan.png', size: f.size, type: f.type || '', status: 'wait', channelId: c.id, thumb: /^image\//.test(f.type) ? URL.createObjectURL(f) : '' });
  }
  renderAttach();
  pumpUploads();
}
async function pumpUploads() {
  if (S.uploading) return;
  const a = S.attach.find((x) => x.status === 'wait');
  if (!a) return;
  S.uploading = true;
  a.status = 'up';
  renderAttach();
  let r;
  try {
    const data = await readB64(a.file);
    r = await call('chatUpload', { channelId: a.channelId, name: a.name, mime: a.type, data }); // không đặt tên trường là type (trùng loại lệnh)
  } catch (e) {
    r = { status: 'error', message: 'Không đọc được tệp' };
  }
  S.uploading = false;
  if (S.attach.includes(a)) Object.assign(a, r.status === 'ok' ? { status: 'ok', id: r.file.id } : { status: 'err', error: r.message || 'lỗi' });
  renderAttach();
  pumpUploads();
}
function removeAttach(key) {
  const a = S.attach.find((x) => x.key === key);
  if (a?.thumb) URL.revokeObjectURL(a.thumb);
  S.attach = S.attach.filter((x) => x.key !== key);
  renderAttach();
}
function clearAttach() {
  for (const a of S.attach) if (a.thumb) URL.revokeObjectURL(a.thumb);
  S.attach = [];
  renderAttach();
}
function renderAttach() {
  const box = $('attach-list');
  box.hidden = !S.attach.length;
  box.replaceChildren(
    ...S.attach.map((a) =>
      el(
        'div',
        { class: 'att ' + a.status, title: a.error ? `${a.name}: ${a.error}` : a.name },
        a.thumb ? el('img', { src: a.thumb, alt: '' }) : el('span', { class: 'att-ic' }, svgFile()),
        el('span', { class: 'att-main' }, el('span', { class: 'att-name' }, a.name), el('small', {}, a.status === 'up' ? 'Đang tải lên…' : a.status === 'wait' ? 'Chờ tải lên' : a.status === 'err' ? 'Lỗi: ' + a.error : sizeText(a.size))),
        el('button', { type: 'button', class: 'att-x', title: 'Bỏ tệp', 'aria-label': 'Bỏ tệp ' + a.name, onclick: () => removeAttach(a.key) }, '✕'),
      ),
    ),
  );
  updateSend();
}

// Đổi cuộc trò chuyện: bỏ tệp đang chờ (tải lên theo kênh), độ ưu tiên, xem trước
function resetComposer() {
  clearAttach();
  S.priority = '';
  renderPrio();
  closePops();
  if (S.preview) {
    S.preview = false;
    $('preview').hidden = true;
    $('text').hidden = false;
    $('btn-preview').setAttribute('aria-pressed', 'false');
    $('btn-preview').classList.remove('on');
  }
}

// ---------- Sự kiện ----------

for (const b of document.querySelectorAll('#fmt [data-md]')) {
  b.addEventListener('mousedown', (e) => e.preventDefault()); // giữ vùng chọn trong ô gõ
  b.addEventListener('click', () => format(b.dataset.md));
}
$('btn-preview').addEventListener('click', () => setPreview(!S.preview));
$('preview').addEventListener('click', () => setPreview(false));
$('btn-fmt').addEventListener('click', () => setFmt(!S.fmt));
$('btn-prio').addEventListener('click', () => ($('prio-menu').hidden ? openPop($('prio-menu'), $('btn-prio'), 'left') : closePops()));
for (const b of document.querySelectorAll('#prio-menu [data-prio]')) b.addEventListener('click', () => setPriority(b.dataset.prio));
$('btn-emoji').addEventListener('mousedown', (e) => e.preventDefault());
$('btn-emoji').addEventListener('click', () => {
  if (!$('emoji-pop').hidden) return closePops();
  renderEmoji(0);
  openPop($('emoji-pop'), $('btn-emoji'), 'right');
});
$('btn-attach').addEventListener('click', () => !$('text').disabled && $('file-input').click());
$('file-input').addEventListener('change', () => {
  addFiles($('file-input').files);
  $('file-input').value = '';
});
// Dán ảnh (chỉ khi không dán chữ), kéo thả tệp vào cuộc trò chuyện
$('text').addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (files.length && !e.clipboardData.getData('text/plain')) {
    e.preventDefault();
    addFiles(files);
  }
});
for (const id of ['msgs', 'composer']) {
  $(id).addEventListener('dragover', (e) => {
    if (!S.sel || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    $('composer').classList.add('drop');
  });
  $(id).addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !$('conv').contains(e.relatedTarget)) $('composer').classList.remove('drop');
  });
  $(id).addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    $('composer').classList.remove('drop');
    addFiles(e.dataTransfer.files);
  });
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest?.('.pop, #btn-prio, #btn-emoji')) closePops();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePops();
});
setFmt(S.fmt);
renderPrio();

$('t-close').addEventListener('click', closeThread);
$('t-follow').addEventListener('click', () => S.thread && toggleFollow(S.thread.root));
$('t-more').addEventListener('click', loadMoreThread);
$('t-composer').addEventListener('submit', sendThread);
$('t-text').addEventListener('input', () => {
  tAutosize();
  mentionInput($('t-text'));
  if (!S.tEditing) setDraft(threadKey(), $('t-text').value);
});
$('t-text').addEventListener('keydown', (e) => {
  if (e.isComposing || mentionKey(e)) return;
  if (e.key === 'Escape' && S.tEditing) {
    e.preventDefault();
    return cancelEdit(true);
  }
  const t = $('t-text');
  if (e.ctrlKey || e.metaKey) {
    const k = SHORTCUTS.find(([code, shift, alt]) => e.code === code && e.shiftKey === shift && e.altKey === alt);
    if (k) {
      e.preventDefault();
      return applyEdit(BG.mdEdit(t.value, t.selectionStart, t.selectionEnd, k[3]), t);
    }
  }
  if (e.key === 'Enter' && e.shiftKey) {
    const r = BG.mdNewline(t.value, t.selectionStart);
    if (r && t.selectionStart === t.selectionEnd) {
      e.preventDefault();
      applyEdit(r, t);
    }
    return;
  }
  if (e.key === 'Enter') sendThread(e);
  if (e.key === 'Escape') closeThread();
});
for (const id of ['text', 't-text']) $(id).addEventListener('blur', () => setTimeout(() => document.activeElement !== $(id) && closeMention(), 150));
$('t-edit-x').addEventListener('click', () => (cancelEdit(true), $('t-text').focus()));
$('btn-pinned').addEventListener('click', () => ($('pins').hidden ? openPins() : closePins()));
$('p-close').addEventListener('click', closePins);
$('person').addEventListener('click', (e) => e.target === $('person') && $('person').close());

$('req-accept').addEventListener('click', () => reqAction('accept'));
$('req-ignore').addEventListener('click', () => reqAction('ignore'));
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
$('text').addEventListener('input', () => {
  autosize();
  mentionInput($('text'));
  if (S.sel && !S.editing) setDraft(S.sel.id, $('text').value);
});
$('text').addEventListener('blur', () => (S.caret = $('text').selectionStart));
$('text').addEventListener('keydown', (e) => {
  if (e.isComposing || mentionKey(e)) return;
  // Mũi tên lên khi ô gõ trống: sửa tin gần nhất của mình (như Slack / Mattermost)
  if (e.key === 'ArrowUp' && !$('text').value && !S.editing) {
    const last = sortedPosts().filter((p) => p.user.chatId === S.me?.chatId && !p.deleted && !p.system && p.message).pop();
    if (last) {
      e.preventDefault();
      return startEdit(last);
    }
  }
  if (e.key === 'Escape' && S.editing) {
    e.preventDefault();
    return cancelEdit();
  }
  // Phím tắt định dạng như web: Ctrl + B / I, Ctrl + Shift + X, Ctrl + Alt + K / C, Ctrl + Shift + 7 / 8 / 9; Ctrl + Alt + P xem trước
  if (e.ctrlKey || e.metaKey) {
    const k = SHORTCUTS.find(([code, shift, alt]) => e.code === code && e.shiftKey === shift && e.altKey === alt);
    if (k) {
      e.preventDefault();
      return format(k[3]);
    }
    if (e.altKey && e.code === 'KeyP') {
      e.preventDefault();
      return setPreview(true);
    }
  }
  // Shift + Enter trong danh sách: dòng mới có sẵn ký hiệu
  if (e.key === 'Enter' && e.shiftKey) {
    const r = BG.mdNewline($('text').value, $('text').selectionStart);
    if (r && $('text').selectionStart === $('text').selectionEnd) {
      e.preventDefault();
      applyEdit(r);
    }
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) sendMsg(e);
  if (e.key === 'Escape' && S.reply) {
    S.reply = null;
    renderReply();
  }
});
$('reply-x').addEventListener('click', () => {
  cancelEdit();
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
$('tv-back').addEventListener('click', () => {
  hideThreads();
  $('app').classList.remove('open');
  history.replaceState(null, '', location.href.split('#')[0]);
  renderList();
  showEmpty('Chọn một cuộc trò chuyện', 'Tin nhắn riêng và kênh chat của các group bạn tham gia ở bên trái. Tin mới tự hiện khi trang đang mở.');
});
$('tv-refresh').addEventListener('click', loadThreads);
for (const b of document.querySelectorAll('#tv-filters button')) {
  b.addEventListener('click', () => {
    if (S.tlistFilter === b.dataset.f) return;
    S.tlistFilter = b.dataset.f;
    renderThreads();
    loadThreads();
  });
}
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
// Enter ở ô tìm cuộc trò chuyện: tìm chữ đó trong tin nhắn ở mọi nơi
$('q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing || $('q').value.trim().length < 2) return;
  e.preventDefault();
  if (!S.sel) $('app').classList.add('open');
  openSearch($('q').value.trim(), 'all');
});
$('btn-search').addEventListener('click', () => ($('search').hidden ? openSearch('', 'channel') : closeSearch()));
$('s-close').addEventListener('click', closeSearch);
$('s-form').addEventListener('submit', (e) => (e.preventDefault(), runSearch()));
$('s-q').addEventListener('keydown', (e) => e.key === 'Escape' && (e.preventDefault(), closeSearch()));
for (const b of document.querySelectorAll('#s-scope button')) {
  b.addEventListener('click', () => {
    S.sScope = b.dataset.s;
    renderSearchScope();
    if ($('s-q').value.trim().length >= 2) runSearch();
  });
}
document.addEventListener('mousedown', (e) => {
  if (!$('react-pop').hidden && !e.target.closest?.('#react-pop, .rc.add, .tools button')) closeReactPop();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeReactPop());
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
