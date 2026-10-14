// Dashboard — chat Beincom (bg/chat.js): thẻ Tin nhắn chat ở tab Bài viết (tin mới trong kênh chat group, chấm theo quy tắc
// bài viết, đợt spam, xoá tin / bỏ qua / cấm người gửi), tin nhắn riêng chưa đọc, ô gửi kèm vào kênh chat khi đăng bài.
// Xoá tin trong chat là mất hẳn (Beincom không có thùng rác) nên luôn có hộp xác nhận, theo Chạy thử.

let chatFilter = 'flagged';
let chatLimit = 50;
const selectedChat = new Set();
const chatLoading = { on: false };

const chatChannels = () => data.state.chatMap?.channels || [];
const chatChannel = (id) => chatChannels().find((c) => c.id === id) || null;
const chatEval = (m) => evalPost(BG.chatAsPost(m));

function chatRows() {
  return (data.state.chatMessages || []).map((m) => ({ m, ev: chatEval(m) }));
}

function chatInFilter(r, f) {
  if (f === 'deleted') return !!r.m.deleted;
  if (f === 'dismissed') return r.m.dismissed && !r.m.deleted;
  if (f === 'all') return !r.m.deleted;
  return !r.m.deleted && !r.m.dismissed && r.ev.verdict !== 'ok'; // flagged
}

// Đợt spam trong chat: cùng link / cùng nội dung từ nhiều tài khoản trong 6 giờ, còn tin chưa xoá / chưa bỏ qua
function chatWaves() {
  const msgs = (data.state.chatMessages || []).filter((m) => !m.deleted && !m.dismissed);
  return BG.spamWaves(BG.chatWaveItems(msgs), { allowed: ['beincom.com', ...(data.postRules.allowedDomains || [])] });
}

function chatSender(u) {
  return el('div', {}, postAuthor(u), u.id && u.id !== data.state.me?.id && BG.banTargets(groups()).length ? el('button', { class: 'ghost sm', disabled: busy, title: 'Cấm người này ở mọi community bạn là chủ / admin', text: 'Cấm', onclick: () => banEverywhere(u) }) : null);
}

function renderChatUnread() {
  const u = data.state.chatUnread;
  const box = $('chat-unread');
  if (!data.settings.chatEnabled || !data.settings.chatUnread || !u) return box.replaceChildren();
  const parts = [];
  // Tin nhắn riêng và lời mời trò chuyện (người chưa kết nối nhắn cho bạn) tách riêng
  for (const [list, icon, what] of [[(u.dms || []).filter((d) => !d.request), '✉', 'tin nhắn riêng chưa đọc'], [(u.dms || []).filter((d) => d.request), '👋', 'lời mời trò chuyện chưa đọc']]) {
    if (list.length) parts.push(el('span', {}, `${icon} ${list.reduce((s, d) => s + d.unread, 0)} ${what} từ `, ...list.slice(0, 5).flatMap((d, i) => [i ? ', ' : '', el('a', { href: 'chat.html#c=' + encodeURIComponent(d.channelId), target: '_blank', text: d.user?.fullname || d.user?.username || d.title || 'người dùng' })]), list.length > 5 ? ` và ${list.length - 5} người khác` : ''));
  }
  if (u.mentions) parts.push(el('span', { text: `🔔 Bạn được nhắc tên ${u.mentions} lần trong kênh chat` }));
  box.replaceChildren(...(parts.length ? [...parts.flatMap((p, i) => (i ? [' · ', p] : [p])), ' · ', el('a', { href: 'chat.html', target: '_blank', text: 'Mở trang Chat ↗' })] : [el('span', { class: 'muted', text: `Không có tin nhắn riêng chưa đọc (lúc ${fmtTime(u.at)}).` })]));
}

function renderChatWaves() {
  const waves = chatWaves();
  $('chat-waves').replaceChildren(
    ...waves.map((w) => {
      const ids = w.items.map((i) => i.id);
      const canDel = (data.state.chatMessages || []).filter((m) => ids.includes(m.id)).some((m) => chatChannel(m.channelId)?.canDelete);
      return el(
        'div',
        { class: 'wave' },
        el('div', {}, el('span', { class: 'tag err', text: 'Đợt spam trong chat' }), ' ', w.type === 'link' ? el('code', { text: w.label }) : el('b', { text: `"${w.label}"` }), el('span', { class: 'muted small', text: ` · ${w.accounts.length} tài khoản · ${w.items.length} tin` })),
        el('div', { class: 'guard-actions' }, canDel ? el('button', { class: 'danger sm', disabled: busy, text: `Xoá cả đợt (${w.items.length})`, onclick: () => chatDelete(ids) }) : null, el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => chatAct('dismiss', ids) })),
      );
    }),
  );
}

function renderChat() {
  const on = data.settings.chatEnabled;
  const dmN = on && data.settings.chatUnread ? (data.state.chatUnread?.dms || []).reduce((s, d) => s + d.unread, 0) : 0;
  $('badge-chat').textContent = dmN ? String(dmN) : '';
  const map = data.state.chatMap;
  const note = $('chat-note');
  note.classList.toggle('err-text', !!data.state.chatError);
  if (!on) note.textContent = 'Chưa bật. Vào Quy tắc & cài đặt → 💬 Chat Beincom để kết nối: addon đọc tin mới trong kênh chat của các group bạn quản trị và báo tin nhắn riêng chưa đọc.';
  else if (data.state.chatError) note.textContent = 'Lỗi đọc chat: ' + data.state.chatError.message;
  else if (!map) note.textContent = 'Chưa đọc chat — bấm ↻ Đọc chat hoặc Quét ngay.';
  else {
    const del = map.channels.filter((c) => c.canDelete).length;
    note.textContent = `${map.channels.length} kênh chat của group bạn quản trị (${del} kênh bạn xoá được tin). Tin mới được chấm theo quy tắc bài viết sau mỗi lần quét; giữ 7 ngày. Xoá tin là mất hẳn.`;
  }
  $('btn-chat-refresh').disabled = !on || chatLoading.on || busy;
  $('btn-chat-refresh').textContent = chatLoading.on ? 'Đang đọc…' : '↻ Đọc chat';
  renderChatUnread();
  renderChatWaves();

  const rows = chatRows();
  setCounts('chcnt', Object.fromEntries(['flagged', 'all', 'dismissed', 'deleted'].map((f) => [f, rows.filter((r) => chatInFilter(r, f)).length])));
  setSegActive('chat-filter', chatFilter);
  pruneSelection(selectedChat, new Set(rows.filter((r) => !r.m.deleted).map((r) => r.m.id)));
  const filtered = rows.filter((r) => chatInFilter(r, chatFilter));
  const shown = filtered.slice(0, chatLimit);
  const bulk = () => renderBulk({ set: selectedChat, shown: shown.filter((r) => !r.m.deleted), idOf: (r) => r.m.id, checkAll: 'chat-check-all', countEl: 'chat-selected', buttons: ['btn-chat-dismiss', 'btn-chat-delete'] });
  $('btn-chat-dismiss').textContent = chatFilter === 'dismissed' ? 'Hiện lại đã chọn' : 'Bỏ qua đã chọn';
  const body = $('chat-body');
  body.replaceChildren();
  if (!shown.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 6, text: !on ? 'Chưa bật chat Beincom' : !data.state.chatMessages ? 'Chưa có dữ liệu' : chatFilter === 'flagged' ? 'Không có tin nhắn nào cần xử lý 🎉' : 'Không có tin nhắn nào trong mục này' })));
  for (const { m, ev } of shown) {
    const ch = chatChannel(m.channelId);
    const url = BG.chatUrl(ch?.teamName || m.teamName, m.channelId);
    const actions = [el('a', { href: url, target: '_blank', text: 'Mở ↗' })];
    if (!m.deleted) {
      actions.push(m.dismissed ? el('button', { class: 'ghost sm', disabled: busy, text: 'Hiện lại', onclick: () => chatAct('undismiss', [m.id]) }) : el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => chatAct('dismiss', [m.id]) }));
      if (ch?.canDelete) actions.push(el('button', { class: 'danger sm', disabled: busy, text: 'Xoá tin', onclick: () => chatDelete([m.id]) }));
    }
    body.append(
      el(
        'tr',
        { class: m.deleted || m.dismissed ? 'muted-row' : null },
        el('td', { class: 'cb' }, m.deleted ? null : rowCheckbox(selectedChat, m.id, 'tin của ' + (m.user.fullname || m.user.username), bulk)),
        el('td', {}, chatSender(m.user)),
        el('td', {}, el('div', { class: 'cmt-text', text: m.text.length > 400 ? m.text.slice(0, 400) + '…' : m.text || '(không có chữ)' }), m.files ? el('div', { class: 'muted small', text: `📎 ${m.files} tệp` }) : null),
        el('td', { class: 'small', text: m.groupName }),
        el('td', { title: fmtTime(m.createdAt), text: ago(m.createdAt) }),
        m.deleted ? el('td', {}, el('span', { class: 'tag info', text: 'Đã xoá' })) : verdictCell(BG.POST_VERDICT_LABELS.published[ev.verdict], ev.verdict, ev.reasons),
        el('td', { class: 'act act-wrap' }, el('div', {}, actions)),
      ),
    );
  }
  $('btn-chat-more').hidden = filtered.length <= chatLimit;
  bulk();
}

async function chatAct(action, ids) {
  if (busy || !ids.length) return;
  const r = await chrome.runtime.sendMessage({ type: 'chatAct', action, ids });
  if (r?.status !== 'ok') toast(r?.message || 'Có lỗi', 'err');
  for (const id of ids) selectedChat.delete(id);
  await loadAll();
}

async function chatDelete(ids) {
  if (busy || !ids.length) return;
  const msgs = (data.state.chatMessages || []).filter((m) => ids.includes(m.id) && !m.deleted);
  const can = msgs.filter((m) => chatChannel(m.channelId)?.canDelete);
  if (!can.length) return toast('Bạn không có quyền xoá tin trong kênh này (cần là admin của group).', 'err');
  const ok = await confirmDialog({
    title: `Xoá ${can.length} tin nhắn trong chat?`,
    text: `Tin bị xoá khỏi kênh chat của group, mọi người không còn thấy.${can.length < msgs.length ? ` Bỏ qua ${msgs.length - can.length} tin ở kênh bạn không có quyền xoá.` : ''}`,
    names: can.map((m) => `${m.user.fullname || m.user.username || '?'} (${m.groupName}): ${m.text.replace(/\s+/g, ' ').slice(0, 80)}`),
    okText: 'Xoá tin',
    danger: true,
    sendNote: `Sẽ gửi lên Beincom ngay${can.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi tin)` : ''}. Tin đã xoá trong chat là mất hẳn, không khôi phục được.`,
  });
  if (!ok) return;
  const r = await send({ type: 'chatAct', action: 'delete', ids: can.map((m) => m.id) }, (n) => `Đã xoá ${n} tin nhắn.`, { chunk: ['ids'] });
  if (!r?.dryRun) for (const id of r?.deleted || []) selectedChat.delete(id);
  renderChat();
}

async function chatRefresh() {
  if (chatLoading.on) return;
  chatLoading.on = true;
  renderChat();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'chatRefresh' });
    if (r?.status === 'need_login') toast('Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.', 'err');
    else if (r?.status !== 'ok') toast('Đọc chat lỗi: ' + (r?.message || 'không rõ'), 'err');
  } finally {
    chatLoading.on = false;
    await loadAll();
  }
}

// Mở từ thông báo (#tab=content&chat=1)
function openChat() {
  showTab('content');
  chatFilter = 'flagged';
  renderChat();
  $('chat-card').scrollIntoView({ block: 'start' });
}

// ---------- Ô Gửi kèm vào kênh chat khi đăng bài ----------

// Kênh chat gửi được của các group đang chọn ở ô Đăng bài
function composeChatTargets() {
  const ids = [...(compose?.groupIds || [])];
  return ids.map((id) => ({ g: groups().find((x) => x.id === id), ch: chatChannels().find((c) => c.groupId === id && c.canPost) })).filter((x) => x.g);
}

function renderComposeChat() {
  const row = $('compose-chat-row');
  row.hidden = !data.settings.chatEnabled || !data.state.chatMap;
  if (row.hidden) return;
  const later = document.querySelector('input[name="compose-when"]:checked')?.value === 'later';
  const t = composeChatTargets();
  const ok = t.filter((x) => x.ch);
  const cb = $('compose-chat');
  cb.disabled = later || !ok.length;
  if (cb.disabled) cb.checked = false;
  $('compose-chat-text').hidden = !cb.checked;
  $('compose-chat-hint').textContent = later
    ? 'Chỉ khi Đăng ngay (bài hẹn giờ chưa có link để gửi).'
    : !t.length
      ? ''
      : ok.length
        ? `Gửi vào kênh chat: ${ok.map((x) => x.g.name).join(', ')}${ok.length < t.length ? ` (không gửi được vào ${t.filter((x) => !x.ch).map((x) => x.g.name).join(', ')})` : ''}.`
        : 'Các group đã chọn không có kênh chat bạn gửi được.';
}

// Lệnh gửi kèm cho doCompose (null: không gửi)
function composeChat() {
  return $('compose-chat').checked && !$('compose-chat').disabled ? { text: $('compose-chat-text').value.trim() } : null;
}

// ---------- Sự kiện ----------

onSeg('chat-filter', (f) => {
  chatFilter = f;
  chatLimit = 50;
  renderChat();
});
$('btn-chat-refresh').addEventListener('click', chatRefresh);
$('btn-chat-more').addEventListener('click', () => {
  chatLimit += 50;
  renderChat();
});
$('chat-check-all').addEventListener('change', (e) => {
  for (const r of chatRows().filter((x) => chatInFilter(x, chatFilter) && !x.m.deleted).slice(0, chatLimit)) e.target.checked ? selectedChat.add(r.m.id) : selectedChat.delete(r.m.id);
  renderChat();
});
$('btn-chat-dismiss').addEventListener('click', () => chatAct(chatFilter === 'dismissed' ? 'undismiss' : 'dismiss', [...selectedChat]));
$('btn-chat-delete').addEventListener('click', () => chatDelete([...selectedChat]));
$('compose-chat').addEventListener('change', renderComposeChat);
