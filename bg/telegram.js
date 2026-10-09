// Service worker — gửi thông báo của addon về Telegram qua bot của chính người dùng (tuỳ chọn, mặc định tắt).
// Cấu hình ở khoá `telegram` (Dashboard → Cài đặt), nạp lại ở đầu mỗi lần quét. Quyền gửi tới api.telegram.org là quyền tuỳ chọn,
// Dashboard xin khi bật. Addon chỉ gọi sendMessage (gửi tin) và getUpdates (khi bấm "Lấy chat ID").

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

async function tgSend(cfg, title, message, url) {
  const r = await tgApi(cfg.token, 'sendMessage', { chat_id: String(cfg.chatId).trim(), text: BG.telegramText(title, message, url), parse_mode: 'HTML', disable_web_page_preview: true });
  await chrome.storage.local.set({ telegramStatus: r.ok ? { at: Date.now(), ok: true } : { at: Date.now(), ok: false, error: tgError(r) } });
  return r;
}

// Gọi từ notify(): gửi thêm về Telegram nếu bật và đúng loại tin
async function forwardTelegram(id, title, message, url) {
  if (!BG.telegramShouldSend(tgConfig, id)) return;
  await tgSend(tgConfig, title, message, url);
}

// Dashboard bấm "Gửi thử" (dùng token / chat ID đang gõ, chưa cần lưu)
async function doTelegramTest({ token, chatId }) {
  if (!BG.validTelegramToken(token)) return { status: 'error', message: 'Token bot chưa đúng dạng (vd 123456789:AA…)' };
  if (!String(chatId || '').trim()) return { status: 'error', message: 'Chưa có chat ID — bấm Lấy chat ID trước' };
  const r = await tgSend({ token, chatId }, 'BeinGroup: tin thử ✓', 'Từ giờ addon sẽ gửi thông báo vào đây.', BG.SITE);
  return r.ok ? { status: 'ok' } : { status: 'error', message: tgError(r) };
}

// Dashboard bấm "Lấy chat ID": đọc tin gần nhất người dùng nhắn cho bot
async function doTelegramChatId({ token }) {
  if (!BG.validTelegramToken(token)) return { status: 'error', message: 'Token bot chưa đúng dạng (vd 123456789:AA…)' };
  const r = await tgApi(token, 'getUpdates');
  if (!r.ok) return { status: 'error', message: tgError(r) };
  const chats = (r.body.result || []).map((u) => (u.message || u.edited_message || u.channel_post || u.my_chat_member)?.chat).filter(Boolean);
  const chat = chats.at(-1);
  if (!chat) return { status: 'error', message: 'Chưa thấy tin nào — mở bot trong Telegram, bấm Start (hoặc nhắn /start) rồi bấm lại' };
  return { status: 'ok', chatId: String(chat.id), name: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '' };
}
