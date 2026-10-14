// Trang Chat — thread: khung bình luận của một tin, theo dõi; trang Thread đang theo dõi.

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
  S.tQuote = null;
  renderQuote(true);
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
  S.tQuote = null;
  renderQuote(true);
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
  const quoted = S.tQuote;
  const r = await call('chatSend', { channelId: c.id, message: (quoted ? quoteMarker(quoted) : '') + text, rootId: t.root.id, ...(quoted ? { quotedPostId: quoted.id } : {}) });
  S.tSending = false;
  if (r.status !== 'ok') {
    tUpdateSend();
    return toast(r.message || 'Gửi bình luận lỗi', 'err');
  }
  $('t-text').value = '';
  setDraft(`${c.id}:${t.root.id}`, '');
  if (quoted) cancelQuote(true);
  tAutosize();
  if (r.post && S.thread === t) {
    S.lastSync = Math.max(S.lastSync, r.post.updateAt || 0, r.post.createAt || 0);
    addReply({ ...r.post, createAt: Math.max(r.post.createAt || 0, S.loadedAt) });
    t.posts.set(r.post.id, r.post);
    renderThread({ scroll: 'bottom' });
    renderMsgs({ scroll: 'keep' });
  }
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
