// Trang Chat — tìm tin nhắn trong kênh / mọi nơi; khung bên phải (một khung mỗi lúc).

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
