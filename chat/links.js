// Trang Chat — như web Beincom: khung trích tin được trả lời, thẻ xem trước link ngoài, tên cho link Beincom chưa có chữ
// (bài / Article, tin chat, community, group). Tin được trích / tên link đọc thêm khi cần (chỉ đọc, gộp nhiều cái một lần).

const QUOTES = new Map(); // mã tin -> tin rút gọn | { missing: true }
const LINK_NAMES = new Map(); // "loại:mã" -> { name }
const pendingQuotes = new Set();
const pendingLinks = new Map();
let quoteTimer = 0;
let linkTimer = 0;

// Tin được trích: có sẵn trong tin, đã đọc, hoặc đang hiện trong cuộc trò chuyện / thread
function quotedPost(q) {
  if (q.post) return q.post;
  const local = S.posts.get(q.id) || S.thread?.posts.get(q.id) || (S.thread?.root.id === q.id ? S.thread.root : null);
  return local || QUOTES.get(q.id) || null;
}

function quoteEl(p) {
  const q = p.quote;
  const x = quotedPost(q);
  if (!x && q.id && !pendingQuotes.has(q.id)) queueQuote(q.id);
  const name = x?.user ? x.user.fullname || x.user.username || 'Người dùng' : '';
  const files = Array.isArray(x?.files) ? x.files.length : x?.files || 0;
  const words = x ? BG.chatPlain(x.message).slice(0, 160) : '';
  const text = !x ? 'Đang tải tin được trả lời…' : x.missing || x.deleted ? 'Tin nhắn không còn' : [words, files ? `📎 ${files} tệp` : ''].filter(Boolean).join(' · ');
  return el(
    'button',
    { type: 'button', class: 'quote' + (x?.missing || x?.deleted ? ' gone' : ''), title: 'Tới tin được trả lời', onclick: (e) => (e.stopPropagation(), jumpQuote(q.id)) },
    el('span', { class: 'q-who' }, svgReply(), name ? ' ' + name : ' Trả lời'),
    el('span', { class: 'q-text' }, text),
  );
}
const svgReply = () => svg('M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11Z');

function jumpQuote(id) {
  if ($('t-' + id) && S.thread) return flashTo(id, 't-');
  if ($('m-' + id)) return flashTo(id);
  toast('Tin được trả lời không có trong phần đang hiện (tin cũ hơn hoặc ở thread khác)');
}

function queueQuote(id) {
  pendingQuotes.add(id);
  clearTimeout(quoteTimer);
  quoteTimer = setTimeout(loadQuotes, 120);
}
async function loadQuotes() {
  const ids = [...pendingQuotes].filter((id) => !QUOTES.has(id)).slice(0, 20);
  if (!ids.length) return;
  const r = await call('chatQuotes', { ids });
  for (const id of ids) {
    pendingQuotes.delete(id);
    // Không đọc được (lỗi mạng…): đánh dấu để không gọi lại liên tục
    QUOTES.set(id, (r.status === 'ok' && r.posts?.[id]) || { id, missing: true });
  }
  renderMsgs({ scroll: 'keep' });
  renderThread();
  if (pendingQuotes.size) queueQuote([...pendingQuotes][0]);
}

// Thẻ xem trước link ngoài (máy chủ chat đã đọc sẵn tiêu đề / mô tả / ảnh)
function ogEl(og) {
  if (!og?.url) return null;
  return el(
    'a',
    { class: 'og', href: og.url, target: '_blank', rel: 'noopener noreferrer' },
    og.image ? el('img', { src: og.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    el('span', { class: 'og-body' }, og.site ? el('span', { class: 'og-site' }, og.site) : null, el('b', {}, og.title), og.description ? el('span', { class: 'og-desc' }, og.description) : null),
  );
}

// Link Beincom chưa có chữ: hiện tên (đọc thêm nếu cần); rê chuột thấy đường dẫn
function beinLinkEl(href, bl) {
  const key = `${bl.kind}:${bl.id}`;
  let name = bl.name || LINK_NAMES.get(key)?.name || '';
  // Tin chat đang hiện: lấy luôn
  if (!name && bl.kind === 'chat') {
    const x = S.posts.get(bl.id) || S.thread?.posts.get(bl.id);
    if (x) name = `${x.user.fullname || x.user.username || 'Tin nhắn'}: ${BG.chatPlain(x.message).slice(0, 70)}`;
  }
  if (!name && !pendingLinks.has(key)) queueLinkName(bl, key);
  return el('a', { class: 'blink', href, target: '_blank', rel: 'noopener noreferrer', title: href, 'data-k': key }, linkLabel(bl, name));
}
const linkLabel = (bl, name) => (name ? `${bl.label.split(' ')[0]} ${name}` : bl.label);

function queueLinkName(bl, key) {
  pendingLinks.set(key, { kind: bl.kind, id: bl.id, bl });
  clearTimeout(linkTimer);
  linkTimer = setTimeout(loadLinkNames, 150);
}
async function loadLinkNames() {
  const list = [...pendingLinks.entries()].slice(0, 30);
  if (!list.length) return;
  const r = await call('beinLinkNames', { links: list.map(([, v]) => ({ kind: v.kind, id: v.id })) });
  for (const [key, v] of list) {
    pendingLinks.delete(key);
    const got = r.status === 'ok' ? r.names?.[key] : null;
    LINK_NAMES.set(key, got || { name: '' });
    // Cập nhật chữ của mọi link này đang hiện (không vẽ lại cả cuộc trò chuyện)
    if (got?.name) for (const a of document.querySelectorAll(`a.blink[data-k="${CSS.escape(key)}"]`)) a.textContent = linkLabel(v.bl, got.name);
  }
  if (pendingLinks.size) linkTimer = setTimeout(loadLinkNames, 150);
}
