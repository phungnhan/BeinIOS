// Service worker — phần chung: hằng số, gọi API Beincom (trực tiếp hoặc qua tab), chạy thao tác ghi, thông báo, huy hiệu, hồ sơ vi phạm, hàng đợi.
// Các tệp bg/*.js là script thường nạp bằng importScripts trong background.js, dùng chung phạm vi toàn cục.

const ALARM = 'beingroup-scan';
const DASHBOARD = 'dashboard.html';
const LOG_MAX = 500;
const KNOWN_MAX = 3000;
const PAGE = 50; // API nhóm group/
const CONTENT_PAGE = 25; // API nội dung content/ chỉ nhận limit ≤ 25 ("limit must not be greater than 25")
const SCHEDULED_PAGES = 8;
const MAX_REQUESTS = 500; // mỗi group, đủ cho một lần duyệt
const MAX_APPROVALS = 200; // bài chờ duyệt mỗi community
const DETAIL_PER_SCAN = 30; // số bài chờ duyệt tải nội dung đầy đủ mỗi lần quét
const TIMELINE_LIMIT = 20; // bài mới mỗi group mỗi lần quét
const RECENT_MAX = 300; // số bài mới giữ lại để xem
const COMMENT_POSTS_PER_SCAN = 8; // mỗi lần quét đọc bình luận của tối đa ngần này bài (bài có bình luận mới)
const COMMENT_PAGE = 25; // bình luận mới nhất đọc mỗi bài (API content/ nhận tối đa 25)
const REPLY_FETCH_PER_SCAN = 10; // mỗi lần quét đọc trả lời của tối đa ngần này bình luận (có trả lời mới)
const AUTO_HIDE_MAX = 20; // mỗi lần quét tự ẩn tối đa ngần này bài / bình luận
const REPORT_SCAN_TIMEOUT = 15000; // quét định kỳ chờ API báo cáo ngắn hơn khi mở tab Báo cáo

// Phải tự chứa (không dùng biến ngoài) vì còn được inject vào tab group.beincom.com.
// version: header x-version-id; '' = không gửi (user/me/profile báo lỗi phiên bản nếu có header này)
// timeoutMs: > 0 thì huỷ khi chờ quá lâu, trả { status: 0, timeout: true } (API báo cáo vi phạm có lúc treo)
async function beincomRequest(method, url, body, version = '2.0.0', timeoutMs = 0) {
  const ctl = timeoutMs > 0 ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
  try {
    const res = await fetch(url, {
      method,
      credentials: 'include',
      signal: ctl?.signal,
      headers: {
        Accept: 'application/json, text/plain, */*',
        'x-application': 'BIC_GROUP',
        'x-platform': 'WEB',
        ...(version ? { 'x-version-id': version } : {}),
        // Chat Beincom (Mattermost) nhận phiên đăng nhập bằng cookie khi có header này (như web)
        ...(url.startsWith('https://chat.beincom.com/') ? { 'X-Requested-With': 'XMLHttpRequest' } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, body: data };
  } catch (e) {
    return ctl?.signal.aborted ? { status: 0, timeout: true, error: 'Beincom không phản hồi' } : { status: 0, error: String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Đọc song song nhưng không dồn quá nhiều lệnh vào Beincom cùng lúc (dễ bị 504)
const PARALLEL = 4;

// Chạy fn cho từng phần tử, tối đa `limit` việc cùng lúc; kết quả giữ đúng thứ tự
async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

async function load() {
  const { settings, rules, postRules, groupRules, state, log } = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'groupRules', 'state', 'log']);
  return {
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    rules: { ...BG.DEFAULT_RULES, ...rules },
    postRules: { ...BG.DEFAULT_POST_RULES, ...postRules },
    groupRules: groupRules || {},
    state: state || {},
    log: log || [],
  };
}

// Ngữ cảnh chấm theo quy tắc (chung + riêng từng group)
// admins: admin từng group (đọc mỗi ngày, bg/guard.js) để nhận ra tài khoản mạo danh
function rulesCtx({ rules, postRules, groupRules, state }, groups) {
  return { rules, postRules, groupRules, groups: groups || [], admins: state?.admins?.byGroup || null };
}

// ---------- Client: gọi trực tiếp, nếu bị chặn cookie thì chạy qua tab Beincom ----------

function waitForTabComplete(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done();
    };
    timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && done(), done);
  });
}

async function acquireTab() {
  const [existing] = await chrome.tabs.query({ url: 'https://group.beincom.com/*' });
  if (existing) return { tabId: existing.id, created: false };
  const tab = await chrome.tabs.create({ url: BG.SITE + '/', active: false });
  await waitForTabComplete(tab.id);
  // Web là SPA: chưa đăng nhập thì tự chuyển sang /login sau khi tải xong
  await sleep(2500);
  return { tabId: tab.id, created: true };
}

async function tabOnLoginPage(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return !!tab?.url && new URL(tab.url).pathname.startsWith('/login');
}

// Gọi trực tiếp vừa chạy được thì 5 phút sau khỏi gọi thử lại (tải nhiều trang thành viên liên tiếp)
let directUntil = 0;

// Lệnh đọc (GET) gặp lỗi tạm thời ở máy chủ Beincom (502 / 503 / 504) thì thử lại tối đa 2 lần, cách 1,5 rồi 3 giây
const RETRY_STATUS = new Set([502, 503, 504]);
// quiet: không ghi Lỗi kỹ thuật (Tự kiểm tra gọi thử cả API tài khoản không có quyền)
function withRetry(call) {
  return async (method, path, body, version, timeoutMs, { quiet = false } = {}) => {
    let r = await call(method, path, body, version, timeoutMs);
    for (let i = 0; i < 2 && method === 'GET' && RETRY_STATUS.has(r.status); i++) {
      await sleep(1500 * (i + 1));
      r = await call(method, path, body, version, timeoutMs);
    }
    // Lỗi kỹ thuật: Beincom báo lỗi hoặc không kết nối được (hết phiên đăng nhập, bài đã bị xoá là chuyện thường: bỏ qua)
    if (!quiet && (r.status >= 400 || r.status === 0) && r.status !== 401 && !BG.isContentGone(r)) {
      recordDiag({ where: 'sw', kind: 'api', method, path, status: r.status, code: r.body?.code || (r.timeout ? 'timeout' : ''), message: BG.errMsg(r) });
    }
    return r;
  };
}

// ---------- Lỗi kỹ thuật ----------
// Ghi gộp (đợi 0,5 giây) vào khoá `diagLog`; Dashboard đọc ở tab Nhật ký → Lỗi kỹ thuật
let diagQueue = [];
let diagTimer = 0;
function recordDiag(entry) {
  diagQueue.push({ ...entry, time: Date.now() });
  if (!diagTimer) diagTimer = setTimeout(() => flushDiag().catch(() => {}), 500);
}

// ---------- Báo cáo sử dụng ----------
// Đếm lần dùng từng tính năng mỗi ngày (khoá `usage`, chỉ số đếm); ghi gộp sau 1 giây
let usageQueue = [];
let usageTimer = 0;
function noteUsage(type) {
  if (!BG.USAGE_LABELS[type]) return;
  usageQueue.push({ type, time: Date.now() });
  if (!usageTimer) usageTimer = setTimeout(() => flushUsage().catch(() => {}), 1000);
}

async function flushUsage() {
  usageTimer = 0;
  const q = usageQueue;
  usageQueue = [];
  if (!q.length) return;
  const { usage } = await chrome.storage.local.get('usage');
  let u = usage;
  for (const x of q) u = BG.recordUsage(u, x.type, x.time);
  await chrome.storage.local.set({ usage: u });
}

async function flushDiag() {
  diagTimer = 0;
  const q = diagQueue;
  diagQueue = [];
  if (!q.length) return;
  const { diagLog = [] } = await chrome.storage.local.get('diagLog');
  let list = diagLog;
  for (const e of q) list = BG.pushDiag(list, e, e.time);
  await chrome.storage.local.set({ diagLog: list });
}

function directClient() {
  const call = async (m, p, b, v, t) => {
    const r = await beincomRequest(m, /^https:\/\//.test(p) ? p : BG.API + p, b, v, t);
    if (r.status === 401 || (r.status === 0 && !r.timeout)) directUntil = 0; // API treo không phải do bị chặn
    return r;
  };
  return { mode: 'direct', call: withRetry(call), close: async () => {} };
}

async function createClient() {
  if (Date.now() < directUntil) return directClient();
  const probe = await beincomRequest('GET', BG.API + 'group/me/permissions');
  if (BG.isOk(probe)) {
    directUntil = Date.now() + 5 * 60e3;
    return directClient();
  }

  const { tabId, created } = await acquireTab();
  const call = async (method, path, body, version = '2.0.0', timeoutMs = 0) => {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: beincomRequest,
        args: [method, /^https:\/\//.test(path) ? path : BG.API + path, body ?? null, version, timeoutMs],
      });
      return res?.result ?? { status: 0, error: 'Không chạy được script trong tab' };
    } catch (e) {
      return { status: 0, error: String(e) };
    }
  };
  const close = async () => {
    if (created) await chrome.tabs.remove(tabId).catch(() => {});
  };
  return { mode: 'tab', call: withRetry(call), close, loginRequired: await tabOnLoginPage(tabId) };
}

const NEED_LOGIN = { status: 'need_login', message: 'Phiên đăng nhập hết hạn — hãy đăng nhập lại Beincom.' };

async function withClient(fn) {
  let client;
  try {
    client = await createClient();
    const result = client.loginRequired ? { ...NEED_LOGIN } : await fn(client);
    result.mode = client.mode;
    return result;
  } catch (e) {
    return { status: 'error', message: String(e) };
  } finally {
    await client?.close();
  }
}

// ---------- Thao tác ghi ----------

const DRY_MSG = 'Chạy thử — chưa gửi lên Beincom';
const GONE_MSG = 'Bài không còn trên Beincom (đã bị xoá) — đã bỏ khỏi danh sách';

function memberLog(source, action, g, req) {
  return {
    kind: 'member',
    source,
    action,
    groupId: g.id,
    groupName: g.name,
    communityName: g.communityName || '',
    requestId: req.id,
    userId: req.user?.id || req.userId || '',
    username: req.user?.username || '',
    fullname: req.user?.fullname || '',
  };
}

function postLog(source, action, post, g) {
  const first = post.groups?.[0];
  return {
    kind: 'post',
    source,
    action,
    groupId: g?.id || first?.id || '',
    groupName: g?.name || first?.name || '',
    communityName: g?.communityName || '',
    contentId: post.id,
    contentType: post.type,
    snippet: (post.title || post.text || '').replace(/\s+/g, ' ').slice(0, 120),
    userId: post.actor?.id || '',
    username: post.actor?.username || '',
    fullname: post.actor?.fullname || '',
  };
}

// items: [{ log, call(client), gone? }]. Chạy thử thì không gọi API.
// gone: thao tác trên một bài; Beincom báo bài không còn thì tính là xong (entry có gone: true) để bỏ bài khỏi danh sách.
// ---------- Thao tác thật: bền khi service worker bị tắt giữa chừng ----------
// Trình duyệt tắt service worker khi 30 giây không có hoạt động, hoặc một lệnh chạy quá 5 phút. Vì vậy:
//  - mỗi mục xong là ghi ngay vào khoá `actionJournal` (Dashboard đọc để hiện tiến độ); bị tắt giữa chừng thì lần
//    service worker chạy lại sau (recoverJournal) ghi bù vào Nhật ký và đánh dấu bài đã ẩn — Beincom không có lệnh hiện lại,
//    nên phải biết chắc bài nào đã ẩn;
//  - trong lúc chạy (kể cả lúc nghỉ giữa hai thao tác) gọi nhẹ một API của trình duyệt mỗi 20 giây để không bị coi là rảnh;
//  - Dashboard chia loạt lớn thành nhiều lệnh nhỏ (dash/core.js send với chunk) và có nút Dừng (lệnh cancelActions).
const JOURNAL_KEY = 'actionJournal';
const SW_RUN = Math.random().toString(36).slice(2); // mã lần chạy service worker này: nhật ký dở của lần chạy khác mới cần ghi bù
let cancelAt = 0;
let lastPing = 0;

async function keepAlive() {
  if (Date.now() - lastPing < 20e3) return;
  lastPing = Date.now();
  try {
    await chrome.runtime.getPlatformInfo?.();
  } catch {}
}

// Nghỉ giữa hai thao tác, vẫn giữ service worker sống
async function nap(ms) {
  for (let left = ms; left > 0; left -= 10e3) {
    await keepAlive();
    await sleep(Math.min(10e3, left));
  }
}

// Dừng thao tác đang chạy (nút Dừng ở Dashboard): chỉ tác dụng với lần chạy đã bắt đầu trước lúc bấm
function cancelActions() {
  cancelAt = Date.now();
  return { status: 'ok' };
}

// Lần chạy trước (service worker khác) bị tắt giữa chừng: ghi bù những mục đã làm vào Nhật ký, đánh dấu bài đã ẩn
async function recoverJournal() {
  const { [JOURNAL_KEY]: j } = await chrome.storage.local.get(JOURNAL_KEY);
  if (!j || j.run === SW_RUN) return 0;
  const done = Array.isArray(j.entries) ? j.entries : [];
  if (done.length) {
    const { state, log } = await load();
    pushLog(log, done);
    const next = { ...state };
    markHidden(next, done);
    await chrome.storage.local.set({ state: next, log });
    recordDiag({ where: 'sw', kind: 'js', message: `Thao tác hàng loạt lúc ${new Date(j.at).toLocaleString('vi-VN')} bị dừng giữa chừng (trình duyệt tắt phần chạy nền): đã làm ${done.length}/${j.total} mục, đã ghi bù vào Nhật ký` });
  }
  await chrome.storage.local.remove(JOURNAL_KEY);
  return done.length;
}

async function performActions(items, settings) {
  const entries = [];
  const entry = (it, status, message = '', extra = {}) => entries.push({ time: Date.now(), ...it.log, status, message, ...extra });
  if (!items.length) return { status: 'ok', entries };

  if (settings.dryRun) {
    for (const it of items) entry(it, 'dry', DRY_MSG);
    return { status: 'ok', entries };
  }

  const startedAt = Date.now();
  const journal = { run: SW_RUN, at: startedAt, total: items.length, entries: [] };
  let cancelled = false;
  try {
    await chrome.storage.local.set({ [JOURNAL_KEY]: journal });
    const result = await withClient(async (client) => {
      const delay = Math.max(0, Number(settings.actionDelaySec) || 0) * 1000;
      for (let i = 0; i < items.length; i++) {
        if (cancelAt >= startedAt) {
          cancelled = true;
          break;
        }
        if (i > 0 && delay) await nap(delay * (0.75 + Math.random() * 0.5));
        if (cancelAt >= startedAt) {
          cancelled = true;
          break;
        }
        await keepAlive();
        const r = await items[i].call(client);
        // ok / goneIf: thao tác chat (trả JSON thường, 404 = tin đã bị xoá)
        if (r.status === 401) entry(items[i], 'error', NEED_LOGIN.message);
        else if (items[i].ok ? items[i].ok(r) : BG.isOk(r)) entry(items[i], 'ok');
        else if (items[i].gone && (items[i].goneIf ? items[i].goneIf(r) : BG.isContentGone(r))) entry(items[i], 'ok', GONE_MSG, { gone: true });
        else entry(items[i], 'error', BG.errMsg(r));
        journal.entries.push(entries.at(-1));
        await chrome.storage.local.set({ [JOURNAL_KEY]: journal });
        if (r.status === 401) return { ...NEED_LOGIN };
      }
      return { status: 'ok' };
    });
    return { ...result, entries, ...(cancelled ? { cancelled: true, left: items.length - entries.length } : {}) };
  } finally {
    // Người gọi ghi nhật ký ngay sau khi nhận kết quả
    await chrome.storage.local.remove(JOURNAL_KEY);
  }
}

function memberItem(source, action, g, req) {
  return { log: memberLog(source, action, g, req), call: (c) => c.call('PUT', `group/groups/${g.id}/joining-requests/${req.id}/${action}`) };
}

// Bỏ các yêu cầu đã xử lý xong khỏi ảnh chụp để giao diện cập nhật ngay
function removeHandled(groups, entries) {
  const done = new Set(entries.filter((e) => e.status === 'ok' && e.requestId).map((e) => e.requestId));
  if (!done.size) return groups;
  return groups.map((g) => {
    const left = g.requests.filter((r) => !done.has(r.id));
    const removed = g.requests.length - left.length;
    return removed ? { ...g, requests: left, pendingTotal: Math.max(0, (g.pendingTotal || 0) - removed) } : g;
  });
}

function removeHandledPosts(groups, entries) {
  const done = new Set(entries.filter((e) => e.status === 'ok' && e.contentId).map((e) => e.contentId));
  if (!done.size) return groups;
  return groups.map((g) => {
    if (!g.approvals?.length) return g;
    const left = g.approvals.filter((p) => !done.has(p.id));
    const removed = g.approvals.length - left.length;
    return removed ? { ...g, approvals: left, approvalCount: Math.max(0, (g.approvalCount || 0) - removed) } : g;
  });
}

// Bỏ các ID đã xử lý khỏi một trường của mọi group trong ảnh chụp (bài gắn cờ, báo cáo chờ xử lý)
function dropFromSnapshot(snapshot, field, done) {
  if (!snapshot || !done.size) return snapshot;
  return { ...snapshot, groups: snapshot.groups.map((x) => (x[field]?.some((id) => done.has(id)) ? { ...x, [field]: x[field].filter((id) => !done.has(id)) } : x)) };
}

function autoItems(groups, settings, ctx, skipIds, profiles = null) {
  const items = [];
  const skip = new Set(skipIds || []);
  for (const g of groups) {
    if (!g.canApprove) continue;
    for (const req of g.requests) {
      if (skip.has(req.id)) continue;
      const { verdict } = BG.evaluateRequest(req, BG.effectiveRules(g, ctx).rules, g.questions, profiles?.users?.[req.user?.id || req.userId], BG.adminsOf(ctx.admins, g, ctx.groups));
      if (verdict === 'approve' && settings.autoApprove) items.push(memberItem('auto', 'approve', g, req));
      if (verdict === 'decline' && settings.autoDecline) items.push(memberItem('auto', 'decline', g, req));
    }
  }
  return items;
}

// Bài chờ duyệt được tự duyệt: đạt mọi quy tắc bài viết (không "Cần xem") và người đăng tin cậy (BG.trustReason).
// Tối đa 20 bài mỗi lần quét; chạy thử thì mỗi bài chỉ ghi nhật ký một lần (skipIds).
function postAutoItems(groups, settings, ctx, trust, profiles, skipIds) {
  const skip = new Set(skipIds || []);
  const items = [];
  for (const g of groups) {
    for (const p of g.approvals || []) {
      if (skip.has(p.id) || BG.evaluatePostIn(p, ctx).verdict !== 'ok') continue;
      const why = BG.trustReason(p.actor, settings, trust, profiles?.users?.[p.actor?.id]);
      if (!why) continue;
      items.push({ log: { ...postLog('auto', 'approve', p, g), autoReason: why }, call: (c) => c.call('PUT', `content/contents/approval-contents/${p.id}`, { status: 'APPROVED' }), gone: true });
    }
  }
  return items.slice(0, 20);
}

// ---------- Thông báo & huy hiệu ----------

// Thông báo trên máy tính (theo cài đặt "Thông báo") và gửi thêm về Telegram nếu bật (bg/telegram.js).
// url: trang Beincom liên quan, dùng cho link trong tin Telegram.
let notifyDesktop = true;
function notify(id, title, message, url = '') {
  if (notifyDesktop) chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', title, message });
  forwardTelegram(id, title, message, url).catch(() => {});
}

async function updateBadge() {
  const loaded = await load();
  const { settings, state } = loaded;
  let text = '';
  let color = '#6c3cf0';
  const groups = state.snapshot?.groups;
  const t = BG.totals(groups);
  // Bài vi phạm quy tắc và bài Beincom gắn cờ có thể trùng nhau: đếm một lần
  const badPosts = flaggedPosts(state.recentPosts, rulesCtx(loaded, groups));
  const badComments = settings.scanComments ? flaggedComments(state.recentComments, rulesCtx(loaded, groups)).length : 0;
  const info = { totals: t, flaggedPosts: badPosts.length, flaggedComments: badComments };
  if (!settings.active) {
    text = 'OFF';
    color = '#c62828';
  } else if (state.lastResult?.status === 'need_login') {
    text = '!';
    color = '#c62828';
  } else {
    const flagged = new Set([...badPosts.map((p) => p.id), ...BG.autoFlaggedIds(groups)]);
    const n = t.requests + t.posts + t.reports + flagged.size + badComments;
    text = n > 999 ? '999+' : n ? String(n) : '';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  await savePopupInfo(state, info);
}

// Popup chỉ đọc gói nhỏ này (không đọc cả kết quả quét rồi chấm lại từng bài): số đếm, trạng thái, việc theo group
let popupInfoLast = '';
async function savePopupInfo(state, info) {
  const groups = state.snapshot?.groups || [];
  const t = info.totals;
  const popupInfo = {
    hasSnapshot: !!state.snapshot,
    hasRecent: !!state.recentPosts,
    lastScan: state.lastScan || 0,
    lastResult: state.lastResult ? { status: state.lastResult.status, message: state.lastResult.message || '' } : null,
    totals: { requests: t.requests, posts: t.posts, reports: t.reports, autoFlagged: t.autoFlagged },
    flaggedPosts: info.flaggedPosts,
    flaggedComments: info.flaggedComments,
    todo: groups
      .filter((g) => g.pendingTotal || g.approvalCount)
      .slice(0, 5)
      .map((g) => ({ id: g.id, name: g.name, isCommunity: !!g.isCommunity, communityName: g.communityName || '', pendingTotal: g.pendingTotal || 0, approvalCount: g.approvalCount || 0 })),
  };
  const key = JSON.stringify(popupInfo);
  if (key === popupInfoLast) return;
  popupInfoLast = key;
  await chrome.storage.local.set({ popupInfo });
}

function pushLog(log, entries) {
  log.unshift(...entries.slice().reverse());
  log.length = Math.min(log.length, LOG_MAX);
  noteViolations(BG.violationsFromLog(entries));
}

// ---------- Hồ sơ vi phạm ----------
// Các phần quét / thao tác ghi sự kiện vào hàng đợi; ghi xuống storage một lần sau mỗi việc trong hàng đợi chung (exclusive).
let pendingViolations = [];

function noteViolations(events) {
  if (events?.length) pendingViolations.push(...events);
}

async function flushViolations() {
  if (!pendingViolations.length) return;
  const events = pendingViolations;
  pendingViolations = [];
  const { settings, profiles, log } = await chrome.storage.local.get(['settings', 'profiles', 'log']);
  if (!{ ...BG.DEFAULT_SETTINGS, ...settings }.trackViolations) return;
  // Lần đầu: dựng hồ sơ từ nhật ký thao tác đã có
  const base = profiles || BG.addViolations(null, BG.violationsFromLog(log || [])).store;
  const r = BG.addViolations(base, events);
  if (r.added || !profiles) await chrome.storage.local.set({ profiles: r.store });
}

// Đọc ngoài hàng đợi (tab Báo cáo, nhật ký vào/rời, thống kê) xong thì xếp một lượt ghi hồ sơ
function noteAndFlush(events) {
  noteViolations(events);
  if (pendingViolations.length) exclusive(async () => {});
}

// Quên hồ sơ của một người (bấm trên Dashboard)
async function doProfileAct({ action, userId }) {
  if (action !== 'forget' || !userId) return { status: 'error', message: 'Thao tác không hợp lệ' };
  const { profiles } = await chrome.storage.local.get('profiles');
  if (!profiles?.users?.[userId]) return { status: 'ok', ok: 0 };
  const users = { ...profiles.users };
  delete users[userId];
  await chrome.storage.local.set({ profiles: { users } });
  return { status: 'ok', ok: 1, failed: 0, dry: 0, errors: [] };
}

function summary(r, settings) {
  return {
    status: r.status,
    message: r.message || '',
    ...(r.cancelled ? { cancelled: true, left: r.left } : {}),
    dryRun: !!settings.dryRun,
    ok: r.entries.filter((e) => e.status === 'ok').length,
    dry: r.entries.filter((e) => e.status === 'dry').length,
    failed: r.entries.filter((e) => e.status === 'error').length,
    gone: r.entries.filter((e) => e.gone).length,
    errors: [...new Set(r.entries.filter((e) => e.status === 'error').map((e) => e.message))],
  };
}

// Không chạy chồng nhau
let queue = Promise.resolve();
function exclusive(fn) {
  const p = queue.then(async () => {
    try {
      return await fn();
    } finally {
      await flushViolations().catch(() => {});
    }
  });
  queue = p.catch(() => {});
  return p;
}
