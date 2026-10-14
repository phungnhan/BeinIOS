// Service worker — gửi thông báo của addon về Telegram qua bot của chính người dùng (tuỳ chọn, mặc định tắt).
// Cấu hình ở khoá `telegram` (Dashboard → Cài đặt), nạp lại ở đầu mỗi lần quét. Quyền gửi tới api.telegram.org là quyền tuỳ chọn,
// Dashboard xin khi bật. Addon gọi sendMessage (gửi tin), getUpdates (Lấy chat ID; đọc nút bấm), answerCallbackQuery và
// editMessageText (nút xử lý trong tin).

const TELEGRAM_API = 'https://api.telegram.org/bot';
let tgConfig = null;

async function loadTelegram() {
  const { telegram } = await chrome.storage.local.get('telegram');
  tgConfig = { ...BG.DEFAULT_TELEGRAM, ...telegram, kinds: { ...BG.DEFAULT_TELEGRAM.kinds, ...telegram?.kinds } };
  return tgConfig;
}

const telegramOn = (cfg = tgConfig) => !!(cfg?.enabled && cfg.token && cfg.chatId);

async function tgApi(token, method, body = null) {
  try {
    const r = await fetch(TELEGRAM_API + String(token).trim() + '/' + method, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let j = null;
    try {
      j = await r.json();
    } catch {}
    return { status: r.status, ok: !!j?.ok, body: j };
  } catch (e) {
    return { status: 0, ok: false, body: null, error: e?.message || String(e) };
  }
}

function tgError(r) {
  if (r.status === 0) return 'Không gửi được tới Telegram (chưa cấp quyền hoặc mất mạng)';
  if (r.status === 401 || r.status === 404) return 'Token bot không đúng';
  const d = r.body?.description || '';
  if (/chat not found/i.test(d)) return 'Chat ID không đúng, hoặc bạn chưa bấm Start với bot';
  if (/blocked by the user/i.test(d)) return 'Bạn đã chặn bot — mở bot và bấm Start lại';
  return d || 'HTTP ' + r.status;
}

async function tgSend(cfg, title, message, url, max) {
  const r = await tgApi(cfg.token, 'sendMessage', { chat_id: String(cfg.chatId).trim(), text: BG.telegramText(title, message, url, max), parse_mode: 'HTML', disable_web_page_preview: true });
  await chrome.storage.local.set({ telegramStatus: r.ok ? { at: Date.now(), ok: true } : { at: Date.now(), ok: false, error: tgError(r) } });
  return r;
}

// Gọi từ notify(): gửi thêm về Telegram nếu bật và đúng loại tin.
// Bật nút xử lý: việc mới đã gửi thành tin riêng có nút (cuối lần quét) nên bỏ bản gộp.
async function forwardTelegram(id, title, message, url) {
  if (!BG.telegramShouldSend(tgConfig, id)) return;
  if (BG.telegramActionsOn(tgConfig) && BG.telegramItemNotify(id)) return;
  await tgSend(tgConfig, title, message, url);
}

// Dashboard gửi một báo cáo (vd. báo cáo tháng) về Telegram, dùng cấu hình đã lưu
async function doTelegramReport({ title, text }) {
  const cfg = await loadTelegram();
  if (!telegramOn(cfg)) return { status: 'error', message: 'Chưa bật gửi về Telegram — cài ở tab Quy tắc & cài đặt' };
  if (!String(text || '').trim()) return { status: 'error', message: 'Báo cáo trống' };
  const r = await tgSend(cfg, String(title || 'BeinFusion'), String(text), '', 3500);
  return r.ok ? { status: 'ok' } : { status: 'error', message: tgError(r) };
}

// Dashboard bấm "Gửi thử" (dùng token / chat ID đang gõ, chưa cần lưu)
async function doTelegramTest({ token, chatId }) {
  if (!BG.validTelegramToken(token)) return { status: 'error', message: 'Token bot chưa đúng dạng (vd 123456789:AA…)' };
  if (!String(chatId || '').trim()) return { status: 'error', message: 'Chưa có chat ID — bấm Lấy chat ID trước' };
  const r = await tgSend({ token, chatId }, 'BeinFusion: tin thử ✓', 'Từ giờ addon sẽ gửi thông báo vào đây.', BG.SITE);
  return r.ok ? { status: 'ok' } : { status: 'error', message: tgError(r) };
}

// Dashboard bấm "Lấy chat ID": đọc tin gần nhất người dùng nhắn cho bot
async function doTelegramChatId({ token }) {
  if (!BG.validTelegramToken(token)) return { status: 'error', message: 'Token bot chưa đúng dạng (vd 123456789:AA…)' };
  // Nêu rõ loại tin: lần đọc nút bấm trước đó chỉ xin callback_query (Telegram nhớ lựa chọn này)
  const r = await tgApi(token, 'getUpdates', { allowed_updates: ['message', 'edited_message', 'channel_post', 'my_chat_member'] });
  if (!r.ok) return { status: 'error', message: tgError(r) };
  const chats = (r.body.result || []).map((u) => (u.message || u.edited_message || u.channel_post || u.my_chat_member)?.chat).filter(Boolean);
  const chat = chats.at(-1);
  if (!chat) return { status: 'error', message: 'Chưa thấy tin nào — mở bot trong Telegram, bấm Start (hoặc nhắn /start) rồi bấm lại' };
  return { status: 'ok', chatId: String(chat.id), name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '' };
}

// ---------- Nút xử lý ngay trong tin ----------
// Bật "Kèm nút xử lý" (telegram.actions): lần quét gom việc mới vào tgQueue (yêu cầu tham gia, bài chờ duyệt, bài / bình luận
// vi phạm, đợt spam), cuối lần quét gửi mỗi việc một tin có nút (tối đa BG.TG_ITEMS_MAX). Bản tin gộp tương ứng không gửi nữa.
// Nút bấm đọc bằng getUpdates (alarm mỗi 30 giây, chỉ khi bật), chạy đúng hàm như Dashboard (qua hàng đợi exclusive),
// tôn trọng Chạy thử, nhật ký ghi nguồn "telegram". Chỉ nhận nút bấm trong đúng chat đã cài.

let tgQueue = [];

function resetTelegramItems() {
  tgQueue = [];
}

function queueTelegramItem(item) {
  if (!BG.telegramActionsOn(tgConfig) || !BG.telegramShouldSend(tgConfig, BG.TG_ITEM_NOTIFY[item.kind])) return;
  tgQueue.push(item);
}

const tgWho = (u) => [u?.fullname, u?.username && '@' + u.username].filter(Boolean).join(' ') || '(không tên)';
const tgActor = (u) => ({ id: u?.id || '', username: u?.username || '', fullname: u?.fullname || '' });
const tgReasons = (reasons) => (reasons || []).filter((x) => x.level !== 'ok').map((x) => x.text).join('; ');

// Gom việc mới của một lần quét (gọi cuối doScan, chỉ khi được phép báo và đã có lần quét trước để so)
function queueScanItems({ state, next, ctx, profiles, freshRequestIds = [], posts = [], comments = [], waves = [] }) {
  if (!BG.telegramActionsOn(tgConfig)) return;
  const groups = next.snapshot?.groups || [];
  // Yêu cầu tham gia mới (đã tự duyệt / từ chối thì không còn trong danh sách)
  const freshReq = new Set(freshRequestIds);
  for (const g of groups) {
    for (const req of g.requests || []) {
      if (!freshReq.has(req.id)) continue;
      const ev = BG.evaluateRequest(req, BG.effectiveRules(g, ctx).rules, g.questions, profiles?.users?.[req.user?.id || req.userId], BG.adminsOf(ctx.admins, g, ctx.groups));
      const qa = (req.answers || [])
        .slice(0, 3)
        .map((a) => `❓ ${(g.questions || []).find((q) => q.id === a.questionId)?.question || 'Câu hỏi'}\n→ ${String(a.answer || '').slice(0, 200) || '(bỏ trống)'}`)
        .join('\n');
      queueTelegramItem({
        kind: 'request',
        head: `👤 Yêu cầu tham gia · ${g.name}`,
        who: tgWho(req.user),
        text: qa,
        note: `${BG.VERDICT_LABELS[ev.verdict] || ''}${tgReasons(ev.reasons) ? ': ' + tgReasons(ev.reasons) : ''}`,
        url: BG.memberRequestsUrl(g),
        acts: g.canApprove ? null : [],
        data: { groupId: g.id, requestId: req.id },
      });
    }
  }
  // Bài chờ duyệt mới (so với lần quét trước)
  if (state.snapshot) {
    const before = new Set((state.snapshot.groups || []).flatMap((g) => (g.approvals || []).map((p) => p.id)));
    for (const g of groups) {
      for (const p of g.approvals || []) {
        if (before.has(p.id)) continue;
        const ev = BG.evaluatePostIn(p, ctx);
        queueTelegramItem({
          kind: 'approval',
          head: `📝 Bài chờ duyệt · ${g.communityName || g.name}`,
          who: tgWho(p.actor),
          text: p.title || p.text,
          note: `${BG.POST_VERDICT_LABELS.approval[ev.verdict] || ''}${tgReasons(ev.reasons) ? ': ' + tgReasons(ev.reasons) : ''}`,
          url: BG.contentApprovalUrl(g.communityId),
          data: { groupId: g.id, contentId: p.id },
        });
      }
    }
  }
  // Bài / bình luận mới vi phạm còn hiện (chưa bị tự ẩn)
  const shown = (list, id) => (list || []).find((x) => x.id === id && !x.isHidden);
  for (const x of posts) {
    const p = shown(next.recentPosts, x.id);
    if (!p) continue;
    const ev = BG.evaluatePostIn(p, ctx);
    queueTelegramItem({ kind: 'post', head: `⚠️ Bài vi phạm quy tắc · ${p.groups.map((g) => g.name).join(', ')}`, who: tgWho(p.actor), text: p.title || p.text, note: 'Lý do: ' + tgReasons(ev.reasons), url: BG.postUrl(p), data: { id: p.id, reasonType: BG.tgHideReason(ev.reasons), actor: tgActor(p.actor) } });
  }
  for (const x of comments) {
    const c = shown(next.recentComments, x.id);
    if (!c) continue;
    const ev = BG.evaluatePostIn(c, ctx);
    queueTelegramItem({ kind: 'comment', head: `⚠️ Bình luận vi phạm quy tắc · ${c.groups.map((g) => g.name).join(', ')}`, who: tgWho(c.actor), text: c.text, note: 'Lý do: ' + tgReasons(ev.reasons), url: BG.commentUrl(c), data: { id: c.id, reasonType: BG.tgHideReason(ev.reasons), actor: tgActor(c.actor) } });
  }
  // Đợt spam mới
  for (const w of waves) {
    const first = w.items[0];
    const item = first?.kind === 'comment' ? (next.recentComments || []).find((c) => c.id === first.id) : (next.recentPosts || []).find((p) => p.id === first?.id);
    queueTelegramItem({
      kind: 'wave',
      head: `🚨 Đợt spam: ${w.type === 'link' ? w.label : '"' + w.label + '"'}`,
      who: `${w.accounts.length} tài khoản: ${w.accounts.slice(0, 5).map(tgWho).join(', ')}${w.accounts.length > 5 ? '…' : ''}`,
      text: item ? item.title || item.text : '',
      note: `${w.items.length} bài / bình luận trong vài giờ gần đây`,
      url: item ? (first.kind === 'comment' ? BG.commentUrl(item) : BG.postUrl(item)) : '',
      data: { key: w.key, postIds: w.items.filter((i) => i.kind !== 'comment').map((i) => i.id), commentIds: w.items.filter((i) => i.kind === 'comment').map((i) => i.id) },
    });
  }
}

// Gửi các tin có nút đã gom (cuối lần quét)
async function flushTelegramItems() {
  const items = tgQueue;
  tgQueue = [];
  const cfg = tgConfig;
  if (!items.length || !BG.telegramActionsOn(cfg)) return;
  const chatId = String(cfg.chatId).trim();
  const { tgActions } = await chrome.storage.local.get('tgActions');
  const map = BG.pruneTgActions(tgActions);
  const batch = items.slice(0, BG.TG_ITEMS_MAX);
  let status = { at: Date.now(), ok: true };
  for (const it of batch) {
    let token = BG.tgToken();
    while (map[token]) token = BG.tgToken();
    const text = BG.telegramItemText(it);
    const r = await tgApi(cfg.token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: BG.tgKeyboard(it.kind, token, it.url, it.acts) });
    if (!r.ok) {
      status = { at: Date.now(), ok: false, error: tgError(r) };
      break;
    }
    map[token] = { kind: it.kind, data: it.data, acts: it.acts || null, text, url: it.url || '', at: Date.now(), chatId, messageId: r.body?.result?.message_id ?? null };
  }
  if (status.ok && items.length > batch.length) {
    const r = await tgApi(cfg.token, 'sendMessage', { chat_id: chatId, text: BG.telegramText(`BeinFusion: còn ${items.length - batch.length} việc mới khác`, 'Mở Dashboard để xử lý.', ''), parse_mode: 'HTML' });
    if (!r.ok) status = { at: Date.now(), ok: false, error: tgError(r) };
  }
  await chrome.storage.local.set({ tgActions: map, telegramStatus: status });
}

// Chạy thao tác của một nút (cùng hàm với Dashboard)
function runTelegramAction(a, act) {
  const source = 'telegram';
  const d = a.data || {};
  switch (a.kind) {
    case 'request':
      return doAct({ action: act === 'a' ? 'approve' : 'decline', groupId: d.groupId, requestIds: [d.requestId], source });
    case 'approval':
      return doApprovalAct({ action: 'approve', groupId: d.groupId, contentIds: [d.contentId], source });
    case 'post':
      if (act === 'c') return doCleanupUser({ user: d.actor, reasonType: d.reasonType || 'SPAM', source });
      return act === 'h' ? doPostAct({ action: 'hide', contentIds: [d.id], reasonType: d.reasonType || 'OTHERS', source }) : doPostAct({ action: 'dismiss', contentIds: [d.id] });
    case 'comment':
      if (act === 'c') return doCleanupUser({ user: d.actor, reasonType: d.reasonType || 'SPAM', source });
      return act === 'h' ? doCommentAct({ action: 'hide', commentIds: [d.id], reasonType: d.reasonType || 'OTHERS', source }) : doCommentAct({ action: 'dismiss', commentIds: [d.id] });
    case 'wave':
      return act === 'h' ? doSpamAct({ action: 'hide', key: d.key, postIds: d.postIds || [], commentIds: d.commentIds || [], reasonType: 'SPAM', source }) : doSpamAct({ action: 'dismiss', key: d.key });
    default:
      return Promise.resolve({ status: 'error', message: 'Việc không hợp lệ' });
  }
}

const tgTime = (t) => new Date(t + 7 * 3600e3).toISOString().slice(11, 16);
const tgEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function handleTelegramCallback(cfg, q) {
  const answer = (text) => tgApi(cfg.token, 'answerCallbackQuery', { callback_query_id: q.id, text });
  // Chỉ nhận nút bấm trong đúng chat đã cài
  if (String(q.message?.chat?.id ?? '') !== String(cfg.chatId).trim()) return answer('Chat này không được phép xử lý');
  const p = BG.parseTgCallback(q.data);
  const { tgActions = {} } = await chrome.storage.local.get('tgActions');
  const a = p && tgActions[p.token];
  if (!a || !BG.tgActAllowed(a.kind, p.act, a.acts)) return answer('Việc này đã hết hạn — mở Dashboard để xử lý');
  if (a.done) return answer('Đã xử lý trước đó');
  await answer('Đang xử lý…');
  let r;
  try {
    r = await exclusive(() => runTelegramAction(a, p.act));
  } catch (e) {
    r = { status: 'error', message: e?.message || String(e) };
  }
  const res = BG.tgResult(a.kind, p.act, r);
  const now = Date.now();
  if (res.done) {
    const { tgActions: latest = {} } = await chrome.storage.local.get('tgActions');
    if (latest[p.token]) latest[p.token] = { ...latest[p.token], done: { line: res.line, at: now } };
    await chrome.storage.local.set({ tgActions: latest });
  }
  // Ghi kết quả vào chính tin đó; xong thì chỉ giữ nút mở trang Beincom
  if (a.messageId != null) {
    await tgApi(cfg.token, 'editMessageText', {
      chat_id: String(cfg.chatId).trim(),
      message_id: a.messageId,
      text: `${a.text}\n\n<b>${tgEsc(res.line)}</b> · ${tgTime(now)}`,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: BG.tgKeyboard(a.kind, p.token, a.url, res.done ? [] : a.acts),
    });
  }
  return r;
}

// Đọc nút bấm mới (alarm mỗi 30 giây khi bật; Dashboard gọi được để kiểm tra ngay)
let tgPolling = false;
async function pollTelegram() {
  if (tgPolling) return { status: 'busy' };
  tgPolling = true;
  try {
    const cfg = await loadTelegram();
    if (!BG.telegramActionsOn(cfg)) return { status: 'off' };
    const { telegramPoll = {} } = await chrome.storage.local.get('telegramPoll');
    let offset = telegramPoll.offset || 0;
    const r = await tgApi(cfg.token, 'getUpdates', { offset, timeout: 0, allowed_updates: ['callback_query'] });
    if (!r.ok) {
      await chrome.storage.local.set({ telegramPoll: { offset, at: Date.now(), ok: false, error: tgError(r) } });
      return { status: 'error', message: tgError(r) };
    }
    let handled = 0;
    for (const u of r.body?.result || []) {
      // Ghi offset trước khi xử lý: lỡ dừng giữa chừng thì mất một lần bấm, không bao giờ làm hai lần
      offset = Math.max(offset, u.update_id + 1);
      await chrome.storage.local.set({ telegramPoll: { offset, at: Date.now(), ok: true } });
      if (!u.callback_query) continue;
      try {
        await handleTelegramCallback(cfg, u.callback_query);
        handled++;
      } catch {}
    }
    // Không có gì mới và lần trước không lỗi: không ghi (đỡ ghi storage mỗi 30 giây)
    if (telegramPoll.ok === false && offset === (telegramPoll.offset || 0)) await chrome.storage.local.set({ telegramPoll: { offset, at: Date.now(), ok: true } });
    return { status: 'ok', handled };
  } finally {
    tgPolling = false;
  }
}

// Bật / tắt lịch đọc nút bấm theo cấu hình
const TG_POLL_ALARM = 'beingroup-tg-poll';
async function scheduleTelegramPoll() {
  const cfg = await loadTelegram();
  const on = BG.telegramActionsOn(cfg);
  const alarm = await chrome.alarms.get(TG_POLL_ALARM);
  if (on && !alarm) chrome.alarms.create(TG_POLL_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
  if (!on && alarm) await chrome.alarms.clear(TG_POLL_ALARM);
}
