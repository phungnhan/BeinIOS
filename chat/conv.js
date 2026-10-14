// Trang Chat — cuộc trò chuyện: mở, đầu trang, tin nhắn (bong bóng, tệp, biểu cảm, thanh thread), sao chép / xoá, đọc tin mới,
// tin cũ hơn, đánh dấu đã đọc, nạp danh sách (nhanh rồi đủ).

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
  // Số tin chưa đọc lúc bấm mở (đánh dấu đã đọc sẽ đặt lại về 0)
  const unread = c.unread || 0;
  if (S.sel?.id !== c.id) {
    saveConv();
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
  S.quote = null;
  renderQuote();
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
  // Đã xem gần đây hoặc vừa tải trước (chat/cache.js): hiện ngay từ bộ nhớ, rồi đọc phần mới
  const cached = convCache.get(c.id);
  if (cached) {
    convCache.delete(c.id);
    Object.assign(S, { posts: cached.posts, hasMore: cached.hasMore, lastSync: cached.lastSync, seenReplies: cached.seenReplies, loadedAt: cached.loadedAt, syncedAt: cached.at });
    markDivider(unread);
    renderMsgs({ scroll: S.dividerId ? 'divider' : 'bottom' });
    markRead(true);
    if (!fromHash) $('text').focus();
    if (Date.now() - cached.at < CONV_SINCE_MAX) await pollChat(true);
    else {
      // Bản nhớ đã cũ: đọc lại trang mới nhất (giữa hai lần có thể quá nhiều tin, chỉ đọc phần mới sẽ hở)
      const r = await fetchConv(c.id);
      if (S.sel?.id !== c.id || r.status !== 'ok') return;
      Object.assign(S, { posts: new Map(), seenReplies: new Set(), lastSync: 0, loadedAt: r.at, syncedAt: r.at });
      addPosts(r.posts);
      S.hasMore = r.hasMore;
      renderMsgs({ scroll: 'bottom' });
    }
    // Có tin mới so với bản nhớ: đặt lại vạch "Tin chưa đọc"
    const was = S.dividerId;
    if (unread && S.sel?.id === c.id && (markDivider(unread), S.dividerId !== was)) renderMsgs({ scroll: 'divider' });
    return;
  }
  // Đang tải trước (rê chuột, mở trang có #c=…) thì dùng chung lệnh đó
  const r = await fetchConv(c.id);
  if (S.sel?.id !== c.id) return;
  if (r.status !== 'ok') {
    $('msg-list').replaceChildren(el('div', { class: 'sys' }, 'Không tải được tin nhắn: ' + (r.message || 'lỗi')));
    return;
  }
  S.loadedAt = r.at;
  S.syncedAt = r.at;
  addPosts(r.posts);
  S.hasMore = r.hasMore;
  markDivider(unread);
  renderMsgs({ scroll: S.dividerId ? 'divider' : 'bottom' });
  markRead(true);
  if (!fromHash) $('text').focus();
}

// Vạch "Tin chưa đọc": trước tin thứ `unread` tính từ cuối (tin của người khác)
function markDivider(unread) {
  if (!unread) return;
  const others = sortedPosts().filter((p) => !p.system && !p.pending && p.user.chatId !== S.me?.chatId);
  S.dividerId = others[Math.max(0, others.length - unread)]?.id || '';
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
  $('conv-avatar').replaceWith(Object.assign(dm ? avatar({ name: chatTitle(c), chatId: c.other?.chatId, pictureAt: c.other?.pictureAt, size: 'lg' }) : avatar({ name: chatTitle(c), seed: c.id, channel: true, locked: c.type === 'P', size: 'lg', src: c.main ? c.teamIcon || S.teams.find((t) => t.id === c.teamId)?.icon || '' : c.icon || '' }), { id: 'conv-avatar', onclick: dm && c.other && !c.self ? () => openPerson(c.other) : null, title: dm && c.other && !c.self ? 'Hồ sơ, vi phạm, xử lý' : '' }));
  $('conv-title').replaceChildren(el('span', { class: 'nm' }, chatTitle(c)), ...(dm && !c.self ? badges(c.other) : []));
  $('conv-sub').textContent = dm ? (c.self ? SELF_SUB + ' — chỉ bạn xem được' : c.type === 'G' ? 'Nhóm chat' : c.other?.username ? '@' + c.other.username + (c.req ? ' · lời mời trò chuyện' : ' · tin nhắn riêng') : c.req ? 'Lời mời trò chuyện' : 'Tin nhắn riêng') : [c.teamTitle, c.type === 'P' ? 'kênh riêng' : 'kênh chung', c.canDelete ? 'bạn là admin kênh' : ''].filter(Boolean).join(' · ');
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
    // Tin trả lời: khung trích tin được trả lời ở đầu bong bóng (như web)
    if (p.quote) bubble.append(quoteEl(p));
    if (p.message) bubble.append(...msgBody(p.message));
    if (p.files.length) bubble.append(filesEl(p.files, p, mode));
    if (p.og) bubble.append(ogEl(p.og));
    bubble.append(p.pending ? el('span', { class: 'meta' }, 'Đang gửi…') : el('span', { class: 'meta', title: fullTime(p.createAt) }, p.editAt ? 'đã sửa · ' : '', hm(p.createAt)));
  }
  // Nút khi rê chuột vào tin: biểu tượng một màu, rê chuột hiện ghi chú (data-tip)
  const live = mode === 'main' || mode === 'thread';
  const canQuote = live && !p.system && !!S.sel && $(mode === 'thread' ? 't-text' : 'text').disabled === false;
  const tools = p.deleted || p.pending
    ? null
    : el(
        'div',
        { class: 'tools' },
        mode === 'search' ? toolBtn(ICON.open, 'Mở', () => openSearchResult(p)) : null,
        live ? toolBtn(ICON.react, 'Thả biểu cảm', (e) => openReactPop(p, e.currentTarget)) : null,
        canQuote ? toolBtn(ICON.reply, 'Trả lời', () => startQuote(p, mode === 'thread')) : null,
        mode === 'main' ? toolBtn(ICON.thread, 'Bình luận', () => openThread(p)) : null,
        mode === 'pins' && S.posts.has(p.id) ? toolBtn(ICON.open, 'Tới tin nhắn', () => (innerWidth <= 1180 && closePins(), flashTo(p.id))) : null,
        mine && p.message && live ? toolBtn(ICON.edit, 'Sửa', () => startEdit(p, mode === 'thread')) : null,
        p.message ? toolBtn(ICON.copy, 'Sao chép', () => copyMsg(p)) : null,
        canPin(p) && !p.rootId && mode !== 'search' ? toolBtn(ICON.pin, p.pinned ? 'Bỏ ghim' : 'Ghim', () => togglePin(p)) : null,
        canDel && live ? toolBtn(ICON.del, 'Xoá', () => deleteMsg(p, mine), 'del') : null,
      );
  return el(
    'div',
    { class: `msg${mine ? ' me' : ''}${first ? ' first' : ''}${last ? ' last' : ''}${p.deleted ? ' deleted' : ''}${p.pending ? ' pending' : ''}${!mine && mentionsMe(p.message) ? ' mentioned' : ''}`, id: { main: 'm-', thread: 't-', pins: 'p-', search: 's-' }[mode] + p.id },
    mine ? null : Object.assign(avatar({ name, chatId: p.user.chatId, pictureAt: p.user.pictureAt, size: 'sm' }), { onclick: () => openPerson(p.user), title: 'Xem ' + name }),
    el('div', { class: 'msg-col' }, (first || mode === 'pins' || mode === 'search') && !mine ? el('div', { class: 'msg-name', style: nameColor(p.user.chatId) }, el('button', { type: 'button', class: 'nm-btn', title: 'Hồ sơ, vi phạm, xử lý', onclick: () => openPerson(p.user) }, name), ...badges(p.user), el('time', { title: fullTime(p.createAt) }, mode === 'pins' ? shortTime(p.createAt) + ' ' + hm(p.createAt) : hm(p.createAt))) : null, bubble, mode === 'search' ? null : reactsEl(p), mode === 'main' && !p.deleted && p.replyCount > 0 ? threadBar(p) : null),
    tools,
  );
}

// Ảnh và tệp đính kèm. Nhiều ảnh trong một tin: lưới gọn (tối đa 4 ô, ô cuối "+N"); bấm ảnh để phóng to ngay trong trang
const ALBUM_MAX = 4;
// mode: nơi tin đang hiện (main / thread / pins / search) — trình xem ảnh lấy ảnh của đúng nơi đó
function filesEl(files, post, mode = 'main') {
  const web = $('conv-web').href;
  const pics = files.filter(isImage);
  const shot = (f, more = 0) => {
    const open = (e) => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return; // Ctrl / Shift / chuột giữa: mở tab như link thường
      e.preventDefault();
      openViewer(post, f.id, mode);
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

// ---------- Nút biểu tượng của tin; Trả lời trích tin (như web Beincom) ----------
const ICON = {
  // Cùng một bộ (Material Symbols, kiểu viền) để các biểu tượng cân đối với nhau
  react: 'M15.5 11q.625 0 1.063-.437Q17 10.125 17 9.5t-.437-1.062Q16.125 8 15.5 8t-1.062.438Q14 8.875 14 9.5t.438 1.063Q14.875 11 15.5 11Zm-7 0q.625 0 1.062-.437Q10 10.125 10 9.5t-.438-1.062Q9.125 8 8.5 8t-1.062.438Q7 8.875 7 9.5t.438 1.063Q7.875 11 8.5 11Zm3.5 6.5q1.7 0 3.088-.963Q16.475 15.575 17.1 14H6.9q.625 1.575 2.013 2.537Q10.3 17.5 12 17.5Zm0 4.5q-2.075 0-3.9-.788-1.825-.787-3.175-2.137-1.35-1.35-2.137-3.175Q2 14.075 2 12t.788-3.9q.787-1.825 2.137-3.175 1.35-1.35 3.175-2.138Q9.925 2 12 2t3.9.787q1.825.788 3.175 2.138 1.35 1.35 2.137 3.175Q22 9.925 22 12t-.788 3.9q-.787 1.825-2.137 3.175-1.35 1.35-3.175 2.137Q14.075 22 12 22Zm0-2q3.35 0 5.675-2.325Q20 15.35 20 12q0-3.35-2.325-5.675Q15.35 4 12 4 8.65 4 6.325 6.325 4 8.65 4 12q0 3.35 2.325 5.675Q8.65 20 12 20Z',
  reply: 'M19 19v-4q0-1.25-.875-2.125T16 12H6.825l3.6 3.6L9 17l-6-6 6-6 1.425 1.4-3.6 3.6H16q2.075 0 3.538 1.463Q21 12.925 21 15v4Z',
  thread: 'M2 22V4q0-.825.588-1.413Q3.175 2 4 2h16q.825 0 1.413.587Q22 3.175 22 4v12q0 .825-.587 1.413Q20.825 18 20 18H6Zm2-4.825L5.175 16H20V4H4Z',
  edit: 'M5 19h1.425L16.2 9.225 14.775 7.8 5 17.575Zm-2 2v-4.25L16.2 3.575q.3-.275.663-.425Q17.225 3 17.625 3t.775.15q.375.15.65.45L20.425 5q.3.275.438.65Q21 6.025 21 6.4t-.137.763q-.138.362-.438.662L7.25 21Z',
  copy: 'M9 18q-.825 0-1.412-.587Q7 16.825 7 16V4q0-.825.588-1.413Q8.175 2 9 2h9q.825 0 1.413.587Q20 3.175 20 4v12q0 .825-.587 1.413Q18.825 18 18 18Zm0-2h9V4H9Zm-4 6q-.825 0-1.413-.587Q3 20.825 3 20V6h2v14h11v2Z',
  pin: 'm16 12 2 2v2h-5v6l-1 1-1-1v-6H6v-2l2-2V5H7V3h10v2h-1Zm-7.15 2h6.3L14 12.85V5h-4v7.85Z',
  del: 'M7 21q-.825 0-1.412-.587Q5 19.825 5 19V6H4V4h5V3h6v1h5v2h-1v13q0 .825-.587 1.413Q17.825 21 17 21ZM17 6H7v13h10ZM9 17h2V8H9Zm4 0h2V8h-2Z',
  open: 'M16.175 13H4v-2h12.175l-5.6-5.6L12 4l8 8-8 8-1.425-1.4Z',
};
const toolBtn = (icon, tip, onclick, cls = '') => el('button', { type: 'button', class: cls || null, 'aria-label': tip, 'data-tip': tip, onclick }, svg(icon));

// Thanh nút sát bong bóng tin: tin mình -> ngay bên trái bong bóng, tin người khác -> ngay bên phải; không đủ chỗ (khung
// bình luận hẹp…) thì nằm ngay trên bong bóng. Tính khi rê chuột / chọn bằng bàn phím vào tin
function placeTools(m, retry = true) {
  const tools = m?.querySelector(':scope > .tools');
  const bubble = m?.querySelector('.bubble');
  if (!tools || !bubble) return;
  const box = (m.closest('.msgs, .t-body') || document.body).getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  const br = bubble.getBoundingClientRect();
  const tw = tools.offsetWidth;
  const th = tools.offsetHeight;
  // Thanh chưa kịp hiện (đang ẩn): đo lại ở khung hình sau
  if (!tw) return void (retry && requestAnimationFrame(() => placeTools(m, false)));
  const gap = 6;
  const mine = m.classList.contains('me');
  let left = mine ? br.left - gap - tw : br.right + gap;
  let top = br.top;
  // Bên cạnh không đủ chỗ: lên trên bong bóng, canh theo mép ngoài của bong bóng, không ra ngoài khung
  if (left < box.left + 4 || left + tw > box.right - 4) {
    left = mine ? br.right - tw : br.left;
    left = Math.max(box.left + 4, Math.min(left, box.right - 4 - tw));
    top = br.top - th - 4;
  }
  tools.style.left = `${Math.round(left - mr.left)}px`;
  tools.style.top = `${Math.round(top - mr.top)}px`;
  tools.style.right = 'auto';
}
function onToolsHover(e) {
  const m = e.target.closest?.('.msg');
  if (m) placeTools(m);
}
document.addEventListener('mouseover', onToolsHover);
document.addEventListener('focusin', onToolsHover);

// Phần đánh dấu tin trả lời của Beincom: [](bein.mm.reply)<link tin>[](bein.mm.reply) + xuống dòng (máy chủ tự gắn
// tin được trích vào tin trả lời qua link này)
// Như web (getCurrentTeamUrl): kênh dùng tên team của community, tin nhắn riêng dùng team "direct-message"
function quoteMarker(p) {
  const team = S.sel?.teamName || S.dmTeamName || 'direct-message';
  return `[](bein.mm.reply) https://chat.beincom.com/${team}/pl/${p.id} [](bein.mm.reply)\n`;
}
// Trả lời một tin: dòng "Trả lời …" trên ô gõ (Esc / ✕ để huỷ)
function startQuote(p, inThread = false) {
  if (inThread) {
    if (S.tEditing) cancelEdit(true);
    S.tQuote = p;
  } else {
    if (S.editing) cancelEdit();
    S.quote = p;
  }
  renderQuote(inThread);
  $(inThread ? 't-text' : 'text').focus();
}
function cancelQuote(inThread = false) {
  if (inThread) S.tQuote = null;
  else S.quote = null;
  renderQuote(inThread);
}
function renderQuote(inThread = false) {
  const p = inThread ? S.tQuote : S.quote;
  const bar = $(inThread ? 't-quote' : 'quote-bar');
  bar.hidden = !p;
  $(inThread ? 't-quote-text' : 'quote-bar-text').textContent = p ? `Trả lời ${p.user.fullname || p.user.username || 'tin nhắn'}: ${BG.chatPlain(p.message).slice(0, 90) || '📎 tệp'}` : '';
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

async function pollChat(force = false) {
  const c = S.sel;
  if (!c || S.polling === c.id || (document.hidden && !force) || !S.lastSync) return;
  S.polling = c.id;
  const at = Date.now();
  const r = await call('chatPosts', { channelId: c.id, since: S.lastSync });
  if (S.polling === c.id) S.polling = false;
  if (S.sel?.id !== c.id || r.status !== 'ok') return;
  S.syncedAt = at;
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
  if (!r.quick) warmConvs();
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: { at: Date.now(), me: S.me, teams: S.teams, dms: S.dms, requests: S.requests, dmTeam: r.dmTeam } });
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
