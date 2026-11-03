// Trang Chat — đỡ phải chờ mạng. Mỗi lệnh đọc chat mất 0,1–0,7 giây và dao động thất thường (đo thật 14/10/2026), nên:
// - tin của các cuộc trò chuyện vừa xem được nhớ trong bộ nhớ của trang (không ghi ra máy, đóng trang là mất): mở lại hiện
//   ngay rồi chỉ đọc phần mới;
// - tải trước khi rê chuột / chọn bằng phím vào một mục ở danh sách hoặc nút "N bình luận", và vài cuộc trò chuyện chưa đọc
//   đầu danh sách lúc trang rảnh. Tải trước chỉ đọc, không đánh dấu đã đọc;
// - bình luận của thread vừa xem cũng nhớ như vậy; mở lại trong THREAD_FRESH thì không đọc lại. Lần đọc lại cuộc trò chuyện
//   (4 giây một lần) đã gồm mọi bình luận mới / sửa / xoá của kênh, nên mỗi lần đọc lại là mọi thread đã nhớ của kênh đó
//   được coi là mới (freshThreads) — mở thread nào của kênh đang xem cũng hiện ngay, không chờ mạng;
// - danh sách Thread đang theo dõi tải sẵn lúc trang rảnh (warmThreads) và nhớ TLIST_FRESH; mở từ danh sách thì đọc bình
//   luận song song với cuộc trò chuyện.

const CONV_KEEP = 15; // số cuộc trò chuyện nhớ tin
const CONV_SINCE_MAX = 30 * 60e3; // bản nhớ cũ hơn 30 phút: đọc lại trang mới nhất thay vì chỉ phần mới
const THREAD_KEEP = 30;
const THREAD_FRESH = 60e3; // bản nhớ thread mới hơn 1 phút: mở / rê chuột không đọc lại
const TLIST_FRESH = 30e3; // danh sách Thread vừa đọc trong 30 giây: mở lại không đọc lại
const HOVER_MS = 120; // rê chuột lướt qua (dưới 0,12 giây) thì không tải
const HOVER_PARALLEL = 2; // rê chuột qua nhiều mục: tải trước tối đa 2 cuộc trò chuyện cùng lúc (mỗi trang tin ~0,4 MB)
const WARM_MAX = 3; // số cuộc trò chuyện chưa đọc tải sẵn lúc trang rảnh
const convCache = new Map(); // kênh -> { posts, hasMore, lastSync, seenReplies, loadedAt, at }
const convLoading = new Map(); // kênh -> lệnh chatPosts đang chạy (tải trước và mở dùng chung)
const threadCache = new Map(); // tin gốc -> { posts: bình luận, hasNext, at, channelId }
const threadLoading = new Map();
let hoverTimer = 0;
let warmed = false;

// Giữ tối đa `max` mục, mục vừa dùng ở cuối
function keepRecent(map, key, val, max) {
  map.delete(key);
  map.set(key, val);
  while (map.size > max) map.delete(map.keys().next().value);
}

// Trang tin mới nhất -> bản nhớ (như khi mở cuộc trò chuyện: tin gốc; bình luận chỉ đánh dấu đã thấy)
function convFromPage(r) {
  const posts = new Map();
  const seenReplies = new Set();
  let lastSync = 0;
  for (const p of r.posts || []) {
    if (p.rootId) seenReplies.add(p.id);
    else posts.set(p.id, p);
    lastSync = Math.max(lastSync, p.updateAt || 0, p.createAt || 0, p.editAt || 0);
  }
  return { posts, hasMore: !!r.hasMore, lastSync, seenReplies, loadedAt: r.at, at: r.at };
}

// Trang tin mới nhất của một kênh. Kết quả kèm `at` (lúc bắt đầu đọc); kênh không đang mở thì nhớ lại
function fetchConv(id) {
  if (convLoading.has(id)) return convLoading.get(id);
  const at = Date.now();
  const p = call('chatPosts', { channelId: id, perPage: PAGE }).then((r) => {
    convLoading.delete(id);
    const res = { ...r, at };
    if (r.status === 'ok' && S.sel?.id !== id) keepRecent(convCache, id, convFromPage(res), CONV_KEEP);
    return res;
  });
  convLoading.set(id, p);
  return p;
}

// Rời cuộc trò chuyện: nhớ tin đang có (kể cả tin cũ đã tải thêm) để mở lại hiện ngay
function saveConv() {
  const c = S.sel;
  if (!c || !S.lastSync) return;
  keepRecent(convCache, c.id, { posts: S.posts, hasMore: S.hasMore, lastSync: S.lastSync, seenReplies: S.seenReplies, loadedAt: S.loadedAt, at: S.syncedAt || Date.now() }, CONV_KEEP);
}

// Rê chuột / chọn bằng phím vào một mục: tải trước (bản nhớ còn mới thì thôi — mở là hiện ngay rồi đọc phần mới)
function hoverConv(id) {
  clearTimeout(hoverTimer);
  if (!id || id === S.sel?.id) return;
  hoverTimer = setTimeout(() => {
    const c = convCache.get(id);
    if ((!c || Date.now() - c.at >= CONV_SINCE_MAX) && (convLoading.has(id) || convLoading.size < HOVER_PARALLEL)) fetchConv(id);
  }, HOVER_MS);
}
const unhoverConv = () => clearTimeout(hoverTimer);

// Sau lần đọc đủ đầu tiên: tải sẵn vài cuộc trò chuyện còn tin chưa đọc (mới nhất trước), lần lượt, lúc trang rảnh
function warmConvs() {
  if (warmed) return;
  warmed = true;
  const list = [...S.dms, ...S.teams.flatMap((t) => t.channels)]
    .filter((c) => (c.unread > 0 || c.mentions > 0) && c.id !== S.sel?.id && !convCache.has(c.id))
    .sort((a, b) => (b.lastPostAt || 0) - (a.lastPostAt || 0))
    .slice(0, WARM_MAX);
  if (!list.length) return;
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(async () => {
    for (const c of list) {
      if (document.hidden) break;
      if (c.id !== S.sel?.id && !convCache.has(c.id)) await fetchConv(c.id);
    }
  });
}

// ---------- Bình luận (thread) ----------

function fetchThread(rootId, channelId = S.sel?.id || '') {
  if (threadLoading.has(rootId)) return threadLoading.get(rootId);
  const p = call('chatThread', { rootId }).then((r) => {
    threadLoading.delete(rootId);
    if (r.status === 'ok') keepRecent(threadCache, rootId, { posts: r.posts.filter((x) => x.id !== rootId), hasNext: !!r.hasNext, at: Date.now(), channelId }, THREAD_KEEP);
    return r;
  });
  threadLoading.set(rootId, p);
  return p;
}

// Đóng khung bình luận: nhớ bình luận đang có (mở lại hiện ngay)
function saveThread(t) {
  if (!t || t.loading) return;
  keepRecent(threadCache, t.root.id, { posts: [...t.posts.values()].filter((x) => x.id !== t.root.id && !x.pending), hasNext: t.hasNext, at: t.at || Date.now(), channelId: t.channelId }, THREAD_KEEP);
}

// Bản nhớ còn mới (mở / rê chuột không cần đọc lại)
function threadFresh(rootId) {
  const c = threadCache.get(rootId);
  return !!c && Date.now() - c.at < THREAD_FRESH;
}

// Lần đọc lại cuộc trò chuyện (chat/conv.js pollChat) kèm mọi bình luận mới / sửa / xoá của kênh từ lần trước: ghi vào bản nhớ
// của thread tương ứng, và mọi thread đã nhớ của kênh được coi là mới tới lúc `at` (lúc bắt đầu đọc)
function freshThreads(channelId, posts, at) {
  for (const p of posts || []) {
    if (!p.rootId) continue;
    const c = threadCache.get(p.rootId);
    if (!c) continue;
    const i = c.posts.findIndex((x) => x.id === p.id);
    if (i >= 0) c.posts[i] = p;
    else c.posts.push(p);
  }
  for (const c of threadCache.values()) if (c.channelId === channelId) c.at = Math.max(c.at, at);
}

let threadHoverTimer = 0;
function hoverThread(rootId, channelId = S.sel?.id || '') {
  clearTimeout(threadHoverTimer);
  threadHoverTimer = setTimeout(() => {
    if (!threadFresh(rootId)) fetchThread(rootId, channelId);
  }, HOVER_MS);
}
const unhoverThread = () => clearTimeout(threadHoverTimer);

// Sau lần đọc đủ đầu tiên: tải sẵn danh sách Thread đang theo dõi lúc trang rảnh (chỉ nhớ, không đụng giao diện)
let warmedThreads = false;
function warmThreads() {
  if (warmedThreads) return;
  warmedThreads = true;
  (window.requestIdleCallback || ((f) => setTimeout(f, 2500)))(() => {
    if (!document.hidden && !S.tlist && !S.tlistLoading) loadThreads({ quiet: true });
  });
}

// ---------- Tin đang gửi ----------
// Tin chỉ có chữ hiện ngay (mờ, "Đang gửi…"), ô gõ trống ngay để gõ tiếp; các tin gửi lần lượt theo thứ tự gõ

let pendingSeq = 0;
let sendChain = Promise.resolve();

function pendingPost(c, text, { rootId = '', quoted = null, priority = '' } = {}) {
  const me = S.me || {};
  return {
    id: 'pending' + ++pendingSeq,
    channelId: c.id,
    user: { id: me.id || '', chatId: me.chatId || '', username: me.username || '', fullname: me.fullname || '', pictureAt: me.pictureAt || 0 },
    createAt: Date.now(),
    updateAt: 0,
    editAt: 0,
    deleted: false,
    system: false,
    message: text,
    rootId,
    replyCount: 0,
    pinned: false,
    files: [],
    participants: [],
    following: false,
    reactions: [],
    ...(priority ? { priority } : {}),
    ...(quoted ? { quote: { id: quoted.id } } : {}),
    pending: true,
  };
}

function queueSend(job) {
  const p = sendChain.then(job);
  sendChain = p.catch(() => {});
  return p;
}
