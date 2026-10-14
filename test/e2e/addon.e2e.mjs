// Kiểm thử trên addon thật: nạp BeinFusion vào Chrome headless (CDP qua pipe, Extensions.loadUnpacked),
// nạp dữ liệu mẫu vào storage, mở Dashboard và popup thật, đi qua từng tab, báo lỗi JavaScript.
// Không đăng nhập Beincom, không thao tác gì lên tài khoản (lần quét lúc cài sẽ báo cần đăng nhập).
//
// Chạy:  node test/e2e/addon.e2e.mjs
//        node test/e2e/addon.e2e.mjs <thư mục>   (thử addon ở thư mục khác, vd. bản giải nén từ dist/*.zip)
// Chrome khác chỗ mặc định: đặt biến CHROME_PATH.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!CHROME) {
  console.error('Không tìm thấy Chrome — đặt CHROME_PATH');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(path.join(tmpdir(), 'beingroup-e2e-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', 'about:blank'], {
  stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
});

// ---------- CDP qua pipe ----------
let buf = '';
let seq = 0;
const pending = new Map();
const problems = []; // lỗi JavaScript gom từ mọi trang
chrome.stdio[4].on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\0')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(`[${msg.sessionId ? sessions.get(msg.sessionId) : '?'}] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push(`[${sessions.get(msg.sessionId) || '?'}] console.error: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  }
});
const sessions = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => reject(new Error('Hết giờ chờ ' + method)), 20000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result);
    });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
const attach = async (targetId, name) => {
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  sessions.set(sessionId, name);
  await send('Runtime.enable', {}, sessionId);
  return sessionId;
};
const evalIn = async (sid, expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sid);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

// ---------- Dữ liệu mẫu (giống bản giả lập, rút gọn) ----------
function sample(now) {
  const iso = (h) => new Date(now - h * 3600e3).toISOString();
  const u = (n, name) => ({ id: 'u' + n, username: 'user' + n, fullname: name, avatar: '' });
  const CL = { id: 'gCL', name: 'Crypto Life', communityId: 'cCL', rootGroupId: 'gCL', isCommunity: true };
  const post = (id, name, text, h, extra = {}) => ({ id, type: 'POST', title: '', text, actor: u(id.length, name), groups: [CL], seenIn: ['gCL'], media: { images: 0, videos: 0, files: 0 }, link: '', publishedAt: iso(h), commentsCount: 0, reactions: 3, isHidden: false, dismissed: false, ...extra });
  const groups = [
    { id: 'gFood', name: 'Food Research', communityId: 'cFood', communityName: 'Food Research', isCommunity: true, level: 0, userCount: 3, canApprove: true, canRemove: true, canBan: true, isCommunityAdmin: true, settings: { isJoinApproval: true }, pendingTotal: 1, approvalCount: null, reportIds: ['r1'], flaggedIds: [], questions: [], requests: [{ id: 'jr1', userId: 'u9', createdAt: iso(1), answers: [], user: u(9, 'Người xin vào') }] },
    { ...CL, communityName: 'Crypto Life', level: 0, userCount: 12000, canApprove: true, canBan: false, settings: { isJoinApproval: false, contentApproval: true }, pendingTotal: 0, approvalCount: 1, approvals: [post('p1', 'Kèo Thơm', 'Vào nhóm t.me/keo nhận quà', 3, { approval: 'WAITING_APPROVAL' })], requests: [], questions: [], flaggedIds: ['f1'] },
  ];
  return {
    settings: { active: false, dryRun: true, notify: false, scanPosts: true, scanComments: true, watchKeywords: ['lừa đảo'] },
    postRules: { bannedKeywords: [], blockedDomains: ['t.me'], allowedDomains: ['beincom.com'], reviewExternalLinks: false },
    state: {
      lastScan: now - 60e3,
      lastResult: { status: 'ok', message: '', mode: 'direct' },
      snapshot: { at: now - 60e3, groups },
      me: { id: 'me1', username: 'kai', fullname: 'Kai' },
      recentPosts: [post('t1', 'Airdrop', 'Nhận quà tại t.me/qua', 2), post('t2', 'Lan', 'Ví nào an toàn? Sợ lừa đảo', 8)],
      recentComments: [{ id: 'c1', postId: 't1', postType: 'POST', postSnippet: 'Nhận quà', parentId: '', title: '', text: 'Spam t.me/x', link: '', actor: u(5, 'Spam'), createdAt: iso(1), images: 0, giphy: false, totalReply: 0, groups: [CL], seenIn: ['gCL'], isHidden: false, dismissed: false }],
      memberHistory: {},
    },
    log: [{ time: now - 3600e3, kind: 'member', source: 'manual', action: 'approve', status: 'ok', groupName: 'Food Research', userId: 'u1', username: 'a', fullname: 'A' }],
  };
}

const TABS = ['overview', 'members', 'content', 'reports', 'compose', 'stats', 'settings', 'log'];
const result = { tabs: {} };
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error('✖ ' + msg);
};

try {
  const { id: extId } = await send('Extensions.loadUnpacked', { path: ROOT });
  result.extId = extId;
  // Service worker
  let sw = null;
  for (let i = 0; i < 30 && !sw; i++) {
    sw = (await send('Target.getTargets')).targetInfos.find((t) => t.type === 'service_worker' && t.url.includes(extId));
    if (!sw) await sleep(300);
  }
  if (!sw) throw new Error('Service worker không khởi động');
  const swSid = await attach(sw.targetId, 'service worker');
  result.version = await evalIn(swSid, 'chrome.runtime.getManifest().version');
  const missing = await evalIn(swSid, `['doScan','doRefresh','doCompose','doComposeArticle','doComposeSeries','doCategories','doStats','doSyncNow','doTelegramTest','pollTelegram','scheduleTelegramPoll','doEditScheduled','postAutoItems','doTags','doTagAct','doCleanupUser','measurePostStats','trackPostStat','doRetention','doMonthly','doTelegramReport','readMemberEvents','searchPosts','readActorPosts','doSelfCheck','runSelfCheck','dailySelfCheck','prepareNudge','recordNudge','doNudgeEffect','preparePrompt','recordPromptUse','noteUsage','flushUsage','readTeamEvents','syncChat','doChatOverview','doChatPosts','doChatSend','doChatView','doChatDeleteMsg','readChatMap','doChatAct','doChatRefresh','shareToChat','readChatMonth','guardJoins','doGuardSearch','doGuardAct','refreshAdmins','recoverJournal','cancelActions','storageUsage','doUserPosts','doSweepSearch','doHidePosts','sweepSearch','remindPending','exclusive','notify'].filter((f) => typeof globalThis[f] !== 'function')`);
  if (missing.length) fail('Service worker thiếu hàm: ' + missing.join(', '));
  // Nạp dữ liệu mẫu qua hàng đợi của service worker: chạy sau lần quét lúc cài (đang chờ hoặc đang chạy),
  // và dữ liệu mẫu tắt addon (active: false) nên không có lần quét tự động nào ghi đè sau đó.
  const now = Date.now();
  await evalIn(swSid, `exclusive(() => chrome.storage.local.set(${JSON.stringify(sample(now))})).then(() => true)`);
  const seeded = await evalIn(swSid, 'chrome.storage.local.get("state").then((s) => s.state?.snapshot?.groups?.length === 2)');
  if (!seeded) throw new Error('Không nạp được dữ liệu mẫu');

  // Dashboard
  const { targetId: dashId } = await send('Target.createTarget', { url: `chrome-extension://${extId}/dashboard.html` });
  const dSid = await attach(dashId, 'dashboard');
  await sleep(2000);
  for (const t of TABS) {
    await evalIn(dSid, `showTab(${JSON.stringify(t)}); true`);
    await sleep(400);
    const info = await evalIn(dSid, `(() => {
      const cards = [...document.querySelectorAll('main > [data-tab="${t}"]')].filter((s) => !s.hidden);
      return { cards: cards.length, text: cards.reduce((n, c) => n + c.innerText.trim().length, 0) };
    })()`);
    result.tabs[t] = info;
    if (!info.cards || info.text < 20) fail(`Tab ${t} trống`);
  }
  // Vài số liệu phải có từ dữ liệu mẫu
  await evalIn(dSid, `showTab('overview'); true`);
  await sleep(300);
  result.todo = await evalIn(dSid, `document.querySelectorAll('#todo-list .todo-item').length`);
  if (result.todo < 4) fail(`Hộp Việc cần làm chỉ có ${result.todo} việc (mong ≥ 4)`);
  result.footer = await evalIn(dSid, `document.getElementById('version').textContent`);
  if (result.footer !== 'v' + result.version) fail('Chân trang không đúng phiên bản: ' + result.footer);

  // Popup
  const { targetId: popId } = await send('Target.createTarget', { url: `chrome-extension://${extId}/popup.html` });
  const pSid = await attach(popId, 'popup');
  await sleep(1200);
  result.popup = await evalIn(pSid, `({ requests: document.getElementById('requests').textContent, flagged: document.getElementById('flagged').textContent, todo: document.getElementById('todo').children.length })`);
  if (result.popup.requests !== '1') fail('Popup: số yêu cầu sai ' + result.popup.requests);

  // Trang Chat (chưa bật chat): hiện nút Kết nối, không lỗi JavaScript
  const { targetId: chatId } = await send('Target.createTarget', { url: `chrome-extension://${extId}/chat.html` });
  const cSid = await attach(chatId, 'chat');
  await sleep(1500);
  result.chat = await evalIn(cSid, `({ title: document.getElementById('empty-title').textContent, enable: !document.getElementById('btn-enable').hidden })`);
  if (result.chat.title !== 'Kết nối Chat Beincom' || !result.chat.enable) fail('Trang Chat: không hiện nút Kết nối Chat Beincom');
  // BeinFusion Silk: font Be Vietnam Pro gói trong addon (fonts/) tải được — chữ tiếng Việt và Latin, 4 độ đậm
  result.silk = await evalIn(cSid, `(async () => {
    setLook({ ui: 'silk' });
    const W = ['400', '500', '600', '700'];
    const loaded = (await Promise.all(W.map((w) => document.fonts.load(w + ' 14px "Be Vietnam Pro"', 'Tiếng Việt Aa')))).map((f) => f.length);
    const ok = W.every((w) => document.fonts.check(w + ' 14px "Be Vietnam Pro"', 'Tiếng Việt Aa'));
    const ui = document.documentElement.dataset.ui;
    const font = getComputedStyle(document.body).fontFamily;
    setLook({ ui: 'theme' });
    return { ui, loaded, ok, font };
  })()`);
  if (result.silk.ui !== 'silk' || !result.silk.ok || result.silk.loaded.some((n) => n < 2) || !/Be Vietnam Pro/.test(result.silk.font)) fail('BeinFusion Silk: không tải được font Be Vietnam Pro trong addon');
} catch (e) {
  fail(e.message);
}

result.problems = problems;
if (problems.length) fail(`${problems.length} lỗi JavaScript`);
console.log(JSON.stringify(result, null, 2));
console.log(failed ? '✖ Có lỗi' : '✔ Addon thật chạy được: service worker, Dashboard (8 tab), popup, trang Chat (cả BeinFusion Silk, font gói sẵn)');
chrome.kill();
await sleep(300);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}
process.exit(failed ? 1 : 0);
