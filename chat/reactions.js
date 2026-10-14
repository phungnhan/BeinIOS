// Trang Chat — biểu cảm dưới tin: xem ai thả, thả / bỏ, hộp chọn.

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
