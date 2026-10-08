// BeinGroup — service worker (MV3)
//
// Mỗi lần quét (chi tiết trong API.md):
//   1. GET group/me/permissions                       -> các group đang quản trị
//   2. GET group/groups/{id}                          -> tên, community, cài đặt
//   3. GET group/groups/{id}/join-requests            -> yêu cầu tham gia đang chờ (limit/offset)
//   4. GET group/groups/{id}/membership-questions     -> câu hỏi gia nhập (khi có yêu cầu và đang bật)
//   5. GET content/manage/communities/{groupId gốc}/approval-contents/count -> bài chờ duyệt
//   6. GET content/manage/communities/{groupId gốc}/approval-contents (+ chi tiết từng bài) -> hàng chờ duyệt bài
//   7. GET content/timeline/{id}                      -> bài mới đăng, chấm theo quy tắc bài viết
// Duyệt / từ chối thành viên: PUT group/groups/{id}/joining-requests/{requestId}/approve | decline
// Duyệt / từ chối bài:        PUT content/contents/approval-contents/{contentId} { status, rejectionReason }
// Ẩn bài:                     POST content/contents/{contentId}/hide { reasonType, groupIds }
// Thành viên (tải khi mở Dashboard): GET group/manage/communities/{id}/members · group/groups/{id}/users · activity-logs
// Xoá / gán admin / cấm:      PUT group/groups/{id}/users/remove { user_ids } · assign-admin | revoke-admin { user_id }
//                             POST group/communities/{id}/users/{userId}/ban { reason }
// Đăng bài:                   POST content/posts (nháp) -> PUT content/posts/{id}/publish | schedule
// Bài đã hẹn giờ:             GET content/manage/groups/{id}/contents/scheduled · PUT content/contents/{id}/reschedule
//                             DELETE content/posts/{id} (huỷ)
// API nhóm group/ nhận snake_case (web tự đổi), nhóm content/ nhận camelCase.
// Xác thực bằng cookie của beincom.com, giống addon Beincom Check-in.

importScripts('common.js');

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
  const { settings, rules, postRules, state, log } = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'state', 'log']);
  return {
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    rules: { ...BG.DEFAULT_RULES, ...rules },
    postRules: { ...BG.DEFAULT_POST_RULES, ...postRules },
    state: state || {},
    log: log || [],
  };
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
function withRetry(call) {
  return async (method, path, body, version, timeoutMs) => {
    let r = await call(method, path, body, version, timeoutMs);
    for (let i = 0; i < 2 && method === 'GET' && RETRY_STATUS.has(r.status); i++) {
      await sleep(1500 * (i + 1));
      r = await call(method, path, body, version, timeoutMs);
    }
    return r;
  };
}

function directClient() {
  const call = async (m, p, b, v, t) => {
    const r = await beincomRequest(m, BG.API + p, b, v, t);
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
        args: [method, BG.API + path, body ?? null, version, timeoutMs],
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

// ---------- Quét (chỉ đọc) ----------

async function readGroup(client, admin) {
  const g = {
    id: admin.id,
    name: admin.id,
    roles: admin.roles,
    canApprove: admin.canApprove,
    canRemove: admin.canRemove,
    canAssign: admin.canAssign,
    requests: [],
    questions: [],
    pendingTotal: 0,
    approvalCount: null,
  };
  const info = await client.call('GET', `group/groups/${admin.id}`);
  if (!BG.isOk(info) || !info.body.data) return { ...g, error: 'Đọc group lỗi: ' + BG.errMsg(info) };
  const d = info.body.data;
  Object.assign(g, {
    name: d.name || admin.id,
    communityId: d.communityId,
    communityName: d.community?.name || d.name || '',
    isCommunity: !!d.isCommunity,
    rootGroupId: d.rootGroupId || (d.isCommunity ? d.id : ''),
    level: d.level ?? 0,
    privacy: d.privacy || '',
    userCount: d.userCount ?? null,
    settings: {
      isJoinApproval: !!d.settings?.isJoinApproval,
      contentApproval: !!d.settings?.contentApproval?.value,
      isActiveMembershipQuestions: !!d.settings?.isActiveMembershipQuestions,
    },
  });
  if (!admin.canApprove) return g;

  for (let offset = 0; offset < MAX_REQUESTS; offset += PAGE) {
    const r = await client.call('GET', `group/groups/${admin.id}/join-requests?limit=${PAGE}&offset=${offset}`);
    if (!BG.isOk(r)) {
      g.error = 'Đọc yêu cầu tham gia lỗi: ' + BG.errMsg(r);
      break;
    }
    const list = Array.isArray(r.body.data) ? r.body.data : [];
    g.requests.push(...list.map(BG.slimRequest));
    g.pendingTotal = r.body.meta?.total ?? g.requests.length;
    if (!r.body.meta?.hasNextPage || !list.length) break;
  }

  if (g.requests.length && g.settings.isActiveMembershipQuestions) {
    const q = await client.call('GET', `group/groups/${admin.id}/membership-questions`);
    if (BG.isOk(q) && Array.isArray(q.body.data)) g.questions = q.body.data.map(BG.slimQuestion);
  }
  return g;
}

// Hàng chờ duyệt bài của một community (g là group gốc). Danh sách chỉ có 500 ký tự đầu,
// nên tải chi tiết từng bài mới; bài đã tải ở lần quét trước thì dùng lại.
async function readApprovals(client, g, prevById) {
  const raw = [];
  let after = '';
  while (raw.length < MAX_APPROVALS) {
    const q = `content/manage/communities/${g.id}/approval-contents?limit=${CONTENT_PAGE}&approvalStatus=WAITING_APPROVAL` + (after ? `&after=${encodeURIComponent(after)}` : '');
    const r = await client.call('GET', q);
    if (!BG.isOk(r)) {
      g.approvalError = 'Đọc bài chờ duyệt lỗi: ' + BG.errMsg(r);
      break;
    }
    const list = r.body.data?.list || [];
    raw.push(...list);
    after = r.body.data?.meta?.endCursor || '';
    if (!r.body.data?.meta?.hasNextPage || !list.length || !after) break;
  }

  // Bài mới (chưa tải đầy đủ ở lần trước): tải chi tiết tối đa DETAIL_PER_SCAN bài, song song
  const need = raw.filter((it) => !prevById.get(it.id)?.full).slice(0, DETAIL_PER_SCAN);
  const details = new Map();
  await mapLimit(need, PARALLEL, async (it) => {
    const d = await client.call('GET', `content/manage/communities/${g.id}/approval-contents/${it.id}`);
    if (BG.isOk(d) && d.body.data) details.set(it.id, d.body.data);
  });
  g.approvals = raw.map((it) => {
    const prev = prevById.get(it.id);
    if (prev?.full) return { ...BG.slimPost(it), text: prev.text, full: true };
    const detail = details.get(it.id);
    return { ...BG.slimPost(detail ? { ...it, ...detail } : it), full: !!detail };
  });
}

async function readTimeline(client, g) {
  const r = await client.call('GET', `content/timeline/${g.id}?limit=${TIMELINE_LIMIT}`);
  if (!BG.isOk(r)) return { error: 'Đọc bài mới lỗi: ' + BG.errMsg(r), posts: [] };
  return { posts: (r.body.data?.list || []).map(BG.slimPost) };
}

// Bài chờ duyệt tính theo community, gọi bằng ID group gốc (chỉ khi đang quản trị group gốc)
async function readApprovalCount(client, g) {
  if (!g.isCommunity || !g.settings?.contentApproval) return;
  const c = await client.call('GET', `content/manage/communities/${g.id}/approval-contents/count?approvalStatus=WAITING_APPROVAL`);
  if (BG.isOk(c) && typeof c.body.data === 'number') g.approvalCount = c.body.data;
}

// Phần group: quyền, thông tin group, yêu cầu tham gia (+ số bài chờ duyệt)
async function scanGroupsPart(client, { approvalCounts = true } = {}) {
  const p = await client.call('GET', 'group/me/permissions');
  if (p.status === 401) return { ...NEED_LOGIN };
  if (!BG.isOk(p)) return { status: 'error', message: 'Đọc quyền lỗi: ' + BG.errMsg(p) };

  const groups = [];
  groups.push(...(await mapLimit(BG.adminGroups(p.body.data), PARALLEL, (admin) => readGroup(client, admin))));
  for (const g of groups) {
    g.canBan = BG.canBan(p.body.data, g.communityId);
    g.isCommunityAdmin = BG.isCommunityAdmin(p.body.data, g.communityId);
  }
  if (approvalCounts) await mapLimit(groups, PARALLEL, (g) => readApprovalCount(client, g));
  // Community có việc lên trước; trong community, group gốc trước rồi tới group con
  return { status: 'ok', groups: BG.sortGroupTree(groups) };
}

// Phần nội dung: hàng chờ duyệt bài (đầy đủ) và bài mới đăng. Sửa trực tiếp các group được truyền vào.
async function scanContentPart(client, groups, prevGroups, scanPosts) {
  const prevApprovals = new Map((prevGroups || []).flatMap((g) => g.approvals || []).map((x) => [x.id, x]));
  for (const g of groups) {
    if (!g.isCommunity || !g.settings?.contentApproval) continue;
    await readApprovalCount(client, g);
    if (g.approvalCount) await readApprovals(client, g, prevApprovals);
    else g.approvals = [];
  }

  // Bài mới đăng của từng group (một bài có thể đăng vào nhiều group)
  const posts = new Map();
  if (scanPosts) {
    const ok = groups.filter((g) => !g.error);
    const results = await mapLimit(ok, PARALLEL, (g) => readTimeline(client, g));
    for (const [i, g] of ok.entries()) {
      const t = results[i];
      if (t.error) g.timelineError = t.error;
      for (const post of t.posts) {
        const old = posts.get(post.id);
        posts.set(post.id, { ...post, seenIn: [...new Set([...(old?.seenIn || []), g.id])] });
      }
    }
  }
  return [...posts.values()];
}

// Số báo cáo chờ xử lý (API trang quản trị Beincom dùng, trả nhanh). null = không đọc được -> đọc danh sách như cũ
async function countReports(client, g) {
  const c = await client.call('GET', `content/manage/communities/${g.id}/content-reports/count`, null, '2.0.0', REPORT_SCAN_TIMEOUT);
  const n = c.body?.data?.total;
  return BG.isOk(c) && Number.isFinite(n) ? n : null;
}

// Phần báo cáo: bài bị Beincom gắn cờ tự động (mọi group đang quản trị) và báo cáo chờ xử lý
// (group gốc của community mình làm chủ / admin). Chỉ đọc trang đầu để đếm và báo cái mới.
// Các group đọc song song vì API báo cáo có lúc treo tới hết thời hạn chờ. Sửa trực tiếp các group được truyền vào.
async function scanReportsPart(client, groups, prevGroups) {
  const prev = new Map((prevGroups || []).map((g) => [g.id, g]));
  await Promise.all(
    groups
      .filter((g) => !g.error)
      .map(async (g) => {
        const old = prev.get(g.id) || {};
        const f = await client.call('GET', `content/manage/groups/${g.id}/contents/flagged?${qs({ limit: TIMELINE_LIMIT })}`);
        g.flaggedIds = BG.isOk(f) ? (f.body.data?.list || []).map((p) => p.id) : old.flaggedIds; // lỗi: giữ số cũ
        if (BG.isOk(f)) noteViolations(BG.violationsFromPosts((f.body.data?.list || []).map(BG.slimPost), 'flagged', (p) => p.violations.join(', ')));
        if (!(g.isCommunity && g.isCommunityAdmin)) return;
        const n = await countReports(client, g);
        if (n === 0) {
          g.reportIds = [];
          return;
        }
        const r = await client.call('GET', `content/manage/communities/${g.id}/content-reports?${qs({ limit: CONTENT_PAGE })}`, null, '2.0.0', REPORT_SCAN_TIMEOUT);
        if (BG.isOk(r)) {
          g.reportIds = (r.body.data?.list || []).filter((x) => (x.status || 'CREATED') === 'CREATED').map((x) => x.id);
          noteViolations(BG.violationsFromReports((r.body.data?.list || []).map(BG.slimReport), g.name));
        }
        // Đã gặp API treo ở community chưa có báo cáo nào -> coi như không có
        else if (r.timeout) g.reportIds = [];
        else g.reportIds = old.reportIds;
      }),
  );
}

// Nhật ký hoạt động mới nhất của từng group: ghi vào hồ sơ vi phạm những lần bị xoá / cấm / từ chối (kể cả do admin khác làm)
async function scanActivityPart(client, groups) {
  await Promise.all(
    groups
      .filter((g) => !g.error)
      .map(async (g) => {
        const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: PAGE, page: 1, sort: 'desc' })}`);
        if (BG.isOk(r)) noteViolations(BG.violationsFromActivity((Array.isArray(r.body.data) ? r.body.data : []).map(BG.slimActivity)));
      }),
  );
}

async function scanGroups(client, { prevGroups = [], scanPosts = true, scanReports = true, trackViolations = true } = {}) {
  const r = await scanGroupsPart(client, { approvalCounts: false });
  if (r.status !== 'ok') return r;
  // Các phần sửa các trường khác nhau của group nên chạy song song được
  const [posts] = await Promise.all([
    scanContentPart(client, r.groups, prevGroups, scanPosts),
    scanReports ? scanReportsPart(client, r.groups, prevGroups) : null,
    trackViolations ? scanActivityPart(client, r.groups) : null,
  ]);

  // Tài khoản đang đăng nhập (để nhận ra bài của chính mình). API này không nhận header phiên bản.
  const meRes = await client.call('GET', 'user/me/profile', null, '');
  const me = BG.isOk(meRes) && meRes.body.data?.id ? { id: meRes.body.data.id, username: meRes.body.data.username || '', fullname: meRes.body.data.fullname || '' } : null;

  return { status: 'ok', groups: r.groups, posts, me };
}

// Gộp bài mới vào danh sách đã lưu: giữ đánh dấu "bỏ qua"/"đã ẩn", mới nhất lên trước
function mergeRecent(prev, posts, now) {
  const map = new Map((prev || []).map((p) => [p.id, p]));
  const fresh = [];
  for (const p of posts) {
    const old = map.get(p.id);
    if (!old) fresh.push(p.id);
    map.set(p.id, {
      ...p,
      seenIn: [...new Set([...(old?.seenIn || []), ...(p.seenIn || [])])],
      firstSeen: old?.firstSeen ?? now,
      dismissed: !!old?.dismissed,
      isHidden: p.isHidden || !!old?.isHidden,
    });
  }
  const list = [...map.values()].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))).slice(0, RECENT_MAX);
  return { list, fresh };
}

// Bài vi phạm chưa xử lý (để hiện trên huy hiệu)
function flaggedPosts(recent, postRules) {
  return (recent || []).filter((p) => !p.dismissed && !p.isHidden && BG.evaluatePost(p, postRules).verdict === 'bad');
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
async function performActions(items, settings) {
  const entries = [];
  const entry = (it, status, message = '', extra = {}) => entries.push({ time: Date.now(), ...it.log, status, message, ...extra });
  if (!items.length) return { status: 'ok', entries };

  if (settings.dryRun) {
    for (const it of items) entry(it, 'dry', DRY_MSG);
    return { status: 'ok', entries };
  }

  const result = await withClient(async (client) => {
    const delay = Math.max(0, Number(settings.actionDelaySec) || 0) * 1000;
    for (let i = 0; i < items.length; i++) {
      if (i > 0 && delay) await sleep(delay * (0.75 + Math.random() * 0.5));
      const r = await items[i].call(client);
      if (r.status === 401) {
        entry(items[i], 'error', NEED_LOGIN.message);
        return { ...NEED_LOGIN };
      }
      if (BG.isOk(r)) entry(items[i], 'ok');
      else if (items[i].gone && BG.isContentGone(r)) entry(items[i], 'ok', GONE_MSG, { gone: true });
      else entry(items[i], 'error', BG.errMsg(r));
    }
    return { status: 'ok' };
  });
  return { ...result, entries };
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

function autoItems(groups, settings, rules, skipIds, profiles = null) {
  const items = [];
  const skip = new Set(skipIds || []);
  for (const g of groups) {
    if (!g.canApprove) continue;
    for (const req of g.requests) {
      if (skip.has(req.id)) continue;
      const { verdict } = BG.evaluateRequest(req, rules, g.questions, profiles?.users?.[req.user?.id || req.userId]);
      if (verdict === 'approve' && settings.autoApprove) items.push(memberItem('auto', 'approve', g, req));
      if (verdict === 'decline' && settings.autoDecline) items.push(memberItem('auto', 'decline', g, req));
    }
  }
  return items;
}

// ---------- Thông báo & huy hiệu ----------

function notify(id, title, message) {
  chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', title, message });
}

async function updateBadge() {
  const { settings, postRules, state } = await load();
  let text = '';
  let color = '#6c3cf0';
  if (!settings.active) {
    text = 'OFF';
    color = '#c62828';
  } else if (state.lastResult?.status === 'need_login') {
    text = '!';
    color = '#c62828';
  } else {
    const groups = state.snapshot?.groups;
    const t = BG.totals(groups);
    // Bài vi phạm quy tắc và bài Beincom gắn cờ có thể trùng nhau: đếm một lần
    const flagged = new Set([...flaggedPosts(state.recentPosts, postRules).map((p) => p.id), ...BG.autoFlaggedIds(groups)]);
    const n = t.requests + t.posts + t.reports + flagged.size;
    text = n > 999 ? '999+' : n ? String(n) : '';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
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
    dryRun: !!settings.dryRun,
    ok: r.entries.filter((e) => e.status === 'ok').length,
    dry: r.entries.filter((e) => e.status === 'dry').length,
    failed: r.entries.filter((e) => e.status === 'error').length,
    gone: r.entries.filter((e) => e.gone).length,
    errors: [...new Set(r.entries.filter((e) => e.status === 'error').map((e) => e.message))],
  };
}

// ---------- Luồng chính ----------

// Ghi kết quả phần group vào trạng thái: yêu cầu mới, số bài chờ duyệt, lịch sử số thành viên.
// Lần đầu chỉ ghi nhận; notifyAllowed = false thì không báo (tải lại từ Dashboard).
function applyGroups(state, next, groups, notifyAllowed, now) {
  const fresh = BG.newRequestIds(groups, state.knownRequestIds);
  if (state.knownRequestIds && fresh.length && notifyAllowed) {
    const names = groups.filter((g) => g.requests.some((r) => fresh.includes(r.id))).map((g) => g.name);
    notify('bg-requests', `BeinGroup: ${fresh.length} yêu cầu tham gia mới`, names.join(', '));
  }
  next.knownRequestIds = [...fresh, ...(state.knownRequestIds || [])].slice(0, KNOWN_MAX);

  // Thông báo khi số bài chờ duyệt tăng
  const prevPosts = state.approvalCounts || {};
  const approvalCounts = {};
  for (const g of groups) {
    if (g.approvalCount == null) continue;
    approvalCounts[g.communityId] = g.approvalCount;
    const before = prevPosts[g.communityId];
    if (before != null && g.approvalCount > before && notifyAllowed) {
      notify(`bg-posts-${g.communityId}`, `BeinGroup: ${g.approvalCount} bài chờ duyệt`, g.communityName || g.name);
    }
  }
  next.approvalCounts = approvalCounts;
  next.snapshot = { at: now, groups };
  // Số thành viên mỗi ngày (giá trị cuối ngày theo giờ VN) để vẽ thống kê khi không có số liệu chính thức
  next.memberHistory = BG.recordMemberHistory(state.memberHistory, groups, now);
}

// Ghi bài mới đăng: báo bài mới vi phạm (lần quét bài đầu tiên chỉ ghi nhận)
function applyPosts(state, next, posts, postRules, notifyAllowed, now) {
  const { list, fresh } = mergeRecent(state.recentPosts, posts, now);
  const freshSet = new Set(fresh);
  const badNew = list.filter((p) => freshSet.has(p.id) && !p.isHidden && BG.evaluatePost(p, postRules).verdict === 'bad');
  noteViolations(BG.violationsFromPosts(badNew, 'rule', (p) => BG.evaluatePost(p, postRules).reasons.filter((x) => x.level !== 'ok').map((x) => x.text).join('; ')));
  if (state.recentPosts && badNew.length && notifyAllowed) {
    notify('bg-flagged', `BeinGroup: ${badNew.length} bài mới vi phạm quy tắc`, badNew.map((p) => p.actor.fullname || p.actor.username).join(', '));
  }
  next.recentPosts = list;
}

// Báo cáo chờ xử lý mới và bài mới bị Beincom gắn cờ (lần quét đầu chỉ ghi nhận)
function applyReports(state, next, groups, notifyAllowed) {
  const kinds = [
    { field: 'reportIds', known: 'knownReportIds', id: 'bg-reports', title: (n) => `BeinGroup: ${n} báo cáo vi phạm mới`, name: (g) => g.communityName || g.name },
    { field: 'flaggedIds', known: 'knownFlaggedIds', id: 'bg-autoflag', title: (n) => `BeinGroup: ${n} bài bị Beincom gắn cờ vi phạm`, name: (g) => g.name },
  ];
  for (const k of kinds) {
    const known = new Set(state[k.known] || []);
    const fresh = new Set();
    const names = [];
    for (const g of groups) {
      const ids = (g[k.field] || []).filter((id) => !known.has(id) && !fresh.has(id));
      if (!ids.length) continue;
      ids.forEach((id) => fresh.add(id));
      names.push(k.name(g));
    }
    if (state[k.known] && fresh.size && notifyAllowed) notify(k.id, k.title(fresh.size), names.join(', '));
    next[k.known] = [...fresh, ...(state[k.known] || [])].slice(0, KNOWN_MAX);
  }
}

// Tải lại một phần (nút "Tải lại" trên từng tab), nhanh hơn quét toàn bộ:
//  - 'groups':  quyền, thông tin group, yêu cầu tham gia, số bài chờ duyệt (không đọc bài viết)
//  - 'content': hàng chờ duyệt bài và bài mới đăng (không đọc yêu cầu tham gia)
// Không thông báo, không tự xử lý. Chưa quét lần nào thì quét toàn bộ.
async function doRefresh({ part }) {
  if (part !== 'groups' && part !== 'content') return { status: 'error', message: 'Phần cần tải lại không hợp lệ' };
  const { settings, postRules, state, log } = await load();
  const prevGroups = state.snapshot?.groups;
  if (!prevGroups?.length) return doScan({ source: 'dashboard' });

  const result = await withClient(async (client) => {
    if (part === 'groups') {
      const r = await scanGroupsPart(client);
      if (r.status !== 'ok') return r;
      // Giữ hàng chờ duyệt bài và số báo cáo đã tải (phần nội dung / tab Báo cáo sẽ làm mới)
      const prev = new Map(prevGroups.map((g) => [g.id, g]));
      for (const g of r.groups) {
        const old = prev.get(g.id);
        for (const k of ['approvals', 'flaggedIds', 'reportIds']) if (old?.[k]) g[k] = old[k];
      }
      return r;
    }
    const groups = prevGroups.map((g) => ({ ...g, approvalError: undefined, timelineError: undefined }));
    const posts = await scanContentPart(client, groups, prevGroups, settings.scanPosts);
    return { status: 'ok', groups, posts };
  });

  const now = Date.now();
  const next = { ...state, lastResult: { status: result.status, message: result.message || '', mode: result.mode || '' } };
  if (result.status === 'ok') {
    applyGroups(state, next, result.groups, false, now);
    next.snapshot.at = state.snapshot.at; // giờ quét toàn bộ gần nhất giữ nguyên
    if (part === 'content' && settings.scanPosts) applyPosts(state, next, result.posts, postRules, false, now);
  }
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return { status: result.status, message: result.message || '', part, at: now };
}

async function doScan({ source = 'alarm' } = {}) {
  const { settings, rules, postRules, state, log } = await load();
  const auto = source === 'alarm' || source === 'startup' || source === 'install' || source === 'resume';
  if (auto && !settings.active) return state;

  const result = await withClient((client) => scanGroups(client, { prevGroups: state.snapshot?.groups, scanPosts: settings.scanPosts, scanReports: settings.scanReports, trackViolations: settings.trackViolations }));
  const now = Date.now();
  const next = { ...state, lastScan: now, lastResult: { status: result.status, message: result.message || '', mode: result.mode || '' } };
  const notifyAllowed = settings.active && settings.notify && source !== 'popup' && source !== 'dashboard';

  if (result.status === 'ok') {
    let groups = result.groups;

    // Tự xử lý theo quy tắc (chỉ khi addon đang bật). Chạy thử: mỗi yêu cầu chỉ ghi nhật ký một lần.
    if (settings.active && (settings.autoApprove || settings.autoDecline)) {
      await flushViolations(); // hồ sơ vừa ghi trong lần quét này (vd người bị cấm trên web) phải có trước khi tự duyệt
      const { profiles } = await chrome.storage.local.get('profiles');
      const items = autoItems(groups, settings, rules, settings.dryRun ? state.autoDryIds : [], settings.trackViolations ? profiles : null);
      if (items.length) {
        const r = await performActions(items, settings);
        pushLog(log, r.entries);
        groups = removeHandled(groups, r.entries);
        if (settings.dryRun) next.autoDryIds = [...items.map((x) => x.log.requestId), ...(state.autoDryIds || [])].slice(0, KNOWN_MAX);
        const okCount = r.entries.filter((e) => e.status === 'ok').length;
        if (okCount && notifyAllowed) notify('bg-auto', 'BeinGroup: đã tự xử lý', `${okCount} yêu cầu tham gia theo quy tắc`);
      }
    }

    applyGroups(state, next, groups, notifyAllowed, now);
    if (settings.scanReports) applyReports(state, next, groups, notifyAllowed);
    if (result.me) next.me = result.me;
    if (settings.scanPosts) applyPosts(state, next, result.posts, postRules, notifyAllowed, now);
  } else if (result.status === 'need_login' && notifyAllowed && state.lastLoginNotifyDay !== BG.vnDay()) {
    next.lastLoginNotifyDay = BG.vnDay();
    notify('bg-login', 'BeinGroup: cần đăng nhập', 'Bấm để mở Beincom và đăng nhập lại.');
  }

  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return next;
}

async function doAct({ action, groupId, requestIds, source = 'manual' }) {
  if (action !== 'approve' && action !== 'decline') return { status: 'error', message: 'Thao tác không hợp lệ' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (!g.canApprove) return { status: 'error', message: 'Tài khoản không có quyền duyệt thành viên ở group này' };
  const items = (requestIds || [])
    .map((id) => g.requests.find((r) => r.id === id))
    .filter(Boolean)
    .map((req) => memberItem(source, action, g, req));
  if (!items.length) return { status: 'error', message: 'Không còn yêu cầu nào để xử lý — hãy quét lại' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = { ...state, snapshot: { ...state.snapshot, groups: removeHandled(groups, r.entries) } };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Duyệt / từ chối bài chờ duyệt (groupId = group gốc của community)
async function doApprovalAct({ action, groupId, contentIds, reason = '', source = 'manual' }) {
  if (action !== 'approve' && action !== 'reject') return { status: 'error', message: 'Thao tác không hợp lệ' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy community — hãy quét lại' };
  const body = action === 'approve' ? { status: 'APPROVED' } : { status: 'REJECTED', rejectionReason: { reason: String(reason || '').trim() || null } };
  const items = (contentIds || [])
    .map((id) => (g.approvals || []).find((p) => p.id === id))
    .filter(Boolean)
    .map((post) => ({
      log: { ...postLog(source, action, post, g), ...(action === 'reject' && body.rejectionReason.reason ? { reason: body.rejectionReason.reason } : {}) },
      call: (c) => c.call('PUT', `content/contents/approval-contents/${post.id}`, body),
      gone: true,
    }));
  if (!items.length) return { status: 'error', message: 'Không còn bài nào để xử lý — hãy quét lại' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = { ...state, snapshot: { ...state.snapshot, groups: removeHandledPosts(groups, r.entries) } };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Ẩn bài đã đăng khỏi các group mình quản trị; "bỏ qua" chỉ đánh dấu trong addon
async function doPostAct({ action, contentIds, reasonType = 'OTHERS', source = 'manual' }) {
  const { settings, state, log } = await load();
  const recent = state.recentPosts || [];
  const ids = new Set(contentIds || []);
  if (action === 'dismiss' || action === 'undismiss') {
    const next = { ...state, recentPosts: recent.map((p) => (ids.has(p.id) ? { ...p, dismissed: action === 'dismiss' } : p)) };
    await chrome.storage.local.set({ state: next });
    await updateBadge();
    return { status: 'ok', ok: ids.size, dry: 0, failed: 0, errors: [], dryRun: false };
  }
  // Xoá bài: Beincom chỉ cho xoá bài của chính mình (admin chỉ ẩn được bài người khác)
  if (action === 'delete') {
    const meId = state.me?.id;
    if (!meId) return { status: 'error', message: 'Chưa biết tài khoản đang đăng nhập — hãy quét lại' };
    const groups = state.snapshot?.groups || [];
    const items = recent
      .filter((p) => ids.has(p.id) && p.actor?.id === meId)
      .map((post) => ({ log: postLog(source, 'delete', post, groups.find((g) => post.seenIn?.includes(g.id))), call: (c) => c.call('DELETE', `content/posts/${post.id}`), gone: true }));
    if (!items.length) return { status: 'error', message: 'Chỉ xoá được bài của chính bạn. Bài của người khác hãy dùng "Ẩn bài".' };
    const r = await performActions(items, settings);
    pushLog(log, r.entries);
    const gone = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
    const next = { ...state, recentPosts: recent.filter((p) => !gone.has(p.id)) };
    if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
    await chrome.storage.local.set({ state: next, log });
    await updateBadge();
    return summary(r, settings);
  }
  if (action !== 'hide') return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (!BG.HIDE_REASONS[reasonType]) return { status: 'error', message: 'Lý do ẩn không hợp lệ' };

  const groups = state.snapshot?.groups || [];
  const adminIds = new Set(groups.map((g) => g.id));
  const items = [];
  for (const post of recent.filter((p) => ids.has(p.id) && !p.isHidden)) {
    // Chỉ ẩn ở những group bài được đăng mà mình đang quản trị
    const groupIds = [...new Set([...post.groups.map((x) => x.id).filter((id) => adminIds.has(id)), ...(post.seenIn || []).filter((id) => adminIds.has(id))])];
    if (!groupIds.length) continue;
    const g = groups.find((x) => x.id === groupIds[0]);
    items.push({
      log: { ...postLog(source, 'hide', post, g), reason: BG.HIDE_REASONS[reasonType], groupIds },
      call: (c) => c.call('POST', `content/contents/${post.id}/hide`, { reasonType, groupIds }),
      gone: true,
    });
  }
  if (!items.length) return { status: 'error', message: 'Không có bài nào ẩn được (bài đã ẩn hoặc không thuộc group bạn quản trị)' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const hidden = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
  const gone = new Set(r.entries.filter((e) => e.gone).map((e) => e.contentId));
  const next = {
    ...state,
    recentPosts: recent.filter((p) => !gone.has(p.id)).map((p) => (hidden.has(p.id) ? { ...p, isHidden: true } : p)),
    snapshot: dropFromSnapshot(state.snapshot, 'flaggedIds', hidden),
  };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// ---------- Thành viên (đọc khi Dashboard cần, không lưu vào storage) ----------

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

async function findGroup(groupId) {
  const { state } = await load();
  return (state.snapshot?.groups || []).find((x) => x.id === groupId) || null;
}

// Group gốc: danh sách community (có ngày vào, sắp xếp được) + danh sách admin group gốc ở trang đầu.
// Group con: group/groups/{id}/users (admin trước, rồi thành viên; offset tính chung).
async function doMembers({ groupId, key = '', offset = 0, limit = 50, sort = '' }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  return withClient(async (client) => {
    if (g.isCommunity) {
      const r = await client.call('GET', `group/manage/communities/${g.communityId}/members?${qs({ limit, offset, key, sort })}`);
      if (r.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(r)) return { status: 'error', message: 'Đọc thành viên lỗi: ' + BG.errMsg(r) };
      let adminIds = null;
      if (offset === 0) {
        const a = await client.call('GET', `group/groups/${g.id}/users?limit=100&offset=0`);
        if (BG.isOk(a)) adminIds = (a.body.data?.groupAdmin?.data || []).map((x) => x.id);
      }
      const list = Array.isArray(r.body.data) ? r.body.data : [];
      const items = list.map((u) => BG.slimMember(u, { isAdmin: adminIds ? adminIds.includes(u.id) : false }));
      return { status: 'ok', items, adminIds, total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage, nextOffset: offset + list.length };
    }
    const r = await client.call('GET', `group/groups/${g.id}/users?${qs({ limit, offset, key })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc thành viên lỗi: ' + BG.errMsg(r) };
    const d = r.body.data || {};
    const items = [...(d.groupAdmin?.data || []).map((u) => BG.slimMember(u, { isAdmin: true })), ...(d.groupMember?.data || []).map((u) => BG.slimMember(u, { isAdmin: false }))];
    return { status: 'ok', items, total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage, nextOffset: offset + items.length };
  });
}

async function doActivity({ groupId, page = 1, useCase = '' }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  return withClient(async (client) => {
    const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: PAGE, page, sort: 'desc', useCase })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc nhật ký hoạt động lỗi: ' + BG.errMsg(r) };
    const list = Array.isArray(r.body.data) ? r.body.data : [];
    const items = list.map(BG.slimActivity);
    noteAndFlush(BG.violationsFromActivity(items));
    return { status: 'ok', items, total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage };
  });
}

const MEMBER_ACTIONS = {
  remove: { perm: 'canRemove', denied: 'xoá thành viên' },
  assignAdmin: { perm: 'canAssign', denied: 'gán admin' },
  revokeAdmin: { perm: 'canAssign', denied: 'gỡ admin' },
  ban: { perm: 'canBan', denied: 'cấm thành viên (cần quyền admin community)' },
};

function memberActionCall(action, g, userId, reason) {
  if (action === 'remove') return (c) => c.call('PUT', `group/groups/${g.id}/users/remove`, { user_ids: [userId] });
  if (action === 'assignAdmin') return (c) => c.call('PUT', `group/groups/${g.id}/assign-admin`, { user_id: userId });
  if (action === 'revokeAdmin') return (c) => c.call('PUT', `group/groups/${g.id}/revoke-admin`, { user_id: userId });
  return (c) => c.call('POST', `group/communities/${g.communityId}/users/${userId}/ban`, { reason });
}

// users: [{ id, username, fullname }] lấy từ danh sách đang xem trên Dashboard
async function doMemberAct({ action, groupId, users, reason = 'VIOLATE_RULE', source = 'manual' }) {
  const spec = MEMBER_ACTIONS[action];
  if (!spec) return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (action === 'ban' && !BG.BAN_REASONS[reason]) return { status: 'error', message: 'Lý do cấm không hợp lệ' };
  const { settings, state, log } = await load();
  const g = (state.snapshot?.groups || []).find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (!g[spec.perm]) return { status: 'error', message: `Tài khoản không có quyền ${spec.denied} ở group này` };
  const items = (users || [])
    .filter((u) => u?.id)
    .map((u) => ({
      log: {
        kind: 'manage',
        source,
        action,
        groupId: g.id,
        groupName: g.name,
        communityName: g.communityName || '',
        userId: u.id,
        username: u.username || '',
        fullname: u.fullname || '',
        ...(action === 'ban' ? { reason: BG.BAN_REASONS[reason] } : {}),
      },
      call: memberActionCall(action, g, u.id, reason),
    }));
  if (!items.length) return { status: 'error', message: 'Chưa chọn thành viên nào' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return { ...summary(r, settings), done: r.entries.filter((e) => e.status === 'ok').map((e) => e.userId) };
}

// ---------- Đăng bài / hẹn giờ ----------
// Giống web: POST content/posts (tạo nháp, nhận id) -> PUT content/posts/{id}/publish | schedule.
// Bước 2 lỗi thì xoá bản nháp vừa tạo (Beincom giới hạn số bản nháp).

async function doCompose({ groupIds, content, setting, scheduledAt = null, media = null, mentions = null, linkPreview = null, tags = [], series = [], source = 'manual' }) {
  const err = BG.validateCompose({ groupIds, content, setting, scheduledAt, media, tags, series });
  if (err) return { status: 'error', message: err };
  const { settings, state, log } = await load();
  const known = new Map((state.snapshot?.groups || []).map((g) => [g.id, g]));
  const targets = groupIds.map((id) => known.get(id)).filter(Boolean);
  if (targets.length !== groupIds.length) return { status: 'error', message: 'Có group không còn trong danh sách — hãy quét lại' };

  const action = scheduledAt ? 'schedule' : 'publish';
  const body = BG.composeBody({ groupIds, content, setting, scheduledAt, media, mentions, linkPreview, tags, series });
  const attached = BG.mediaSummary(body.media);
  const base = {
    kind: 'compose',
    source,
    action,
    groupId: targets[0].id,
    groupName: targets.map((g) => g.name).join(', '),
    communityName: [...new Set(targets.map((g) => g.communityName))].join(', '),
    snippet: ((attached ? `[${attached}] ` : '') + body.content.replace(/\s+/g, ' ')).slice(0, 120),
    scheduledAt: body.scheduledAt || null,
  };

  let r;
  if (settings.dryRun) r = { status: 'ok', dry: true };
  else {
    r = await withClient(async (client) => {
      // Tag / series phải dùng được với các group đã chọn: kiểm tra trước khi tạo bản nháp (lỗi khác thì để bước đăng kiểm tra)
      if (body.tags.length || body.series.length) {
        const v = await client.call('POST', 'content/contents/validate-series-tags', { groups: body.audience.groupIds, series: body.series, tags: body.tags });
        if (v.status === 401) return { ...NEED_LOGIN };
        if (v.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(v.body, tags, series) };
      }
      const d = await client.call('POST', 'content/posts', { audience: { groupIds: body.audience.groupIds }, isEnableDonation: false });
      if (d.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(d) || !d.body.data?.id) return { status: 'error', message: 'Tạo bài nháp lỗi: ' + BG.errMsg(d) };
      const id = d.body.data.id;
      const p = await client.call('PUT', `content/posts/${id}/${action}`, body);
      if (!BG.isOk(p)) {
        await client.call('DELETE', `content/posts/${id}`);
        if (p.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(p.body, tags, series) };
        return { status: 'error', message: (action === 'schedule' ? 'Hẹn giờ lỗi: ' : 'Đăng bài lỗi: ') + BG.errMsg(p) };
      }
      return { status: 'ok', contentId: id, postStatus: p.body.data?.status || null };
    });
  }

  const status = r.dry ? 'dry' : r.status === 'ok' ? 'ok' : 'error';
  const message = r.dry ? 'Chạy thử — chưa gửi lên Beincom' : r.status === 'ok' ? BG.CONTENT_STATUS[r.postStatus] || r.postStatus || '' : r.message;
  pushLog(log, [{ time: Date.now(), ...base, contentId: r.contentId || '', contentType: 'POST', status, message }]);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return {
    status: r.status,
    message: r.message || '',
    dryRun: !!r.dry,
    ok: status === 'ok' ? 1 : 0,
    dry: status === 'dry' ? 1 : 0,
    failed: status === 'error' ? 1 : 0,
    errors: status === 'error' ? [message] : [],
    contentId: r.contentId || null,
    postStatus: r.postStatus || null,
  };
}

// ---------- Tải ảnh / video / tệp lên (Dashboard gửi nội dung file, background lo phần gọi API có đăng nhập) ----------
// Giống web Beincom:
//  - ảnh:  POST upload/images/ { properties: { mime_type }, resource: 'post:content' } -> { id, presigned_post }
//  - video: POST upload/videos/ { properties: { mime_type } } (kèm x-version-id) -> { id, presigned_post }
//  - tệp:  POST upload/files/ -> { id }; Dashboard gửi file tới upload/files/{id}
// Ảnh / video: Dashboard gửi file lên presigned_post.url rồi gọi uploadWait để chờ Beincom xử lý.
const UPLOAD_PATH = { image: 'upload/images/', video: 'upload/videos/', file: 'upload/files/' };
const UPLOAD_WAIT_MS = { image: 120e3, video: 600e3 };

async function doUploadInit({ kind, mimeType = '' }) {
  if (!UPLOAD_PATH[kind]) return { status: 'error', message: 'Loại file không hợp lệ' };
  return withClient(async (client) => {
    const body = kind === 'file' ? null : { properties: { mime_type: mimeType }, ...(kind === 'image' ? { resource: 'post:content' } : {}) };
    const r = await client.call('POST', UPLOAD_PATH[kind], body, kind === 'video' ? '2.0.0' : '');
    if (r.status === 401) return { ...NEED_LOGIN };
    const d = r.body?.data;
    if (!BG.isOk(r) || !d?.id) return { status: 'error', message: 'Không xin được chỗ tải lên: ' + BG.errMsg(r) };
    if (kind === 'file') return { status: 'ok', id: d.id };
    if (!d.presigned_post?.url) return { status: 'error', message: 'Beincom không trả link tải lên' };
    return { status: 'ok', id: d.id, url: d.presigned_post.url, fields: d.presigned_post.fields || {} };
  });
}

// unsure: Dashboard không đọc được phản hồi của kho lưu trữ (bị chặn CORS) nên chưa chắc file đã lên
async function doUploadWait({ kind, id, unsure = false }) {
  if (kind !== 'image' && kind !== 'video') return { status: 'error', message: 'Loại file không hợp lệ' };
  return withClient(async (client) => {
    const r = await client.call('GET', `${UPLOAD_PATH[kind]}${id}?wait=true`, null, kind === 'video' ? '2.0.0' : '', UPLOAD_WAIT_MS[kind]);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (r.timeout) return { status: 'error', message: kind === 'video' ? 'Beincom xử lý video quá lâu, thử lại sau' : 'Beincom xử lý ảnh quá lâu' };
    const d = r.body?.data;
    if (!BG.isOk(r) || !d) return { status: 'error', message: 'Beincom chưa nhận file: ' + BG.errMsg(r) };
    if (d.status === 'ERROR') return { status: 'error', message: 'Beincom báo lỗi file: ' + (d.error_message || 'không rõ') };
    if (!d.url && (kind === 'image' || unsure)) return { status: 'error', message: unsure ? 'File chưa lên được kho lưu trữ (trình duyệt có thể đã chặn)' : 'Beincom chưa xử lý xong ảnh' };
    return { status: 'ok', item: BG.mediaItem(kind, id, d) };
  });
}

// ---------- Tag và series (đọc khi soạn bài) ----------

// Group gốc của một group: lần quét mới có rootGroupId; bản cũ thì lấy group gốc cùng community nếu đang quản trị
function rootOf(g, groups) {
  if (!g) return '';
  if (g.rootGroupId) return g.rootGroupId;
  if (g.isCommunity) return g.id;
  return groups.find((x) => x.isCommunity && x.communityId === g.communityId)?.id || '';
}

const TAG_SERIES_PAGES = 8; // tối đa 8 trang × 25

// Tag lấy theo group gốc của các group sẽ đăng (giống web), series theo chính các group đó
async function doTagsSeries({ groupIds = [] }) {
  if (!groupIds.length) return { status: 'ok', tags: [], series: [] };
  const { state } = await load();
  const groups = state.snapshot?.groups || [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  const roots = [...new Set(groupIds.map((id) => rootOf(byId.get(id), groups)).filter(Boolean))];
  const ids = (list) => list.map((id) => 'groupIds[]=' + encodeURIComponent(id)).join('&');
  return withClient(async (client) => {
    const readAll = async (path, slim) => {
      const out = [];
      for (let page = 0, offset = 0; page < TAG_SERIES_PAGES; page++) {
        const r = await client.call('GET', `${path}&offset=${offset}`);
        if (r.status === 401) return { error: NEED_LOGIN };
        if (!BG.isOk(r)) return { error: { status: 'error', message: 'Đọc tag / series lỗi: ' + BG.errMsg(r) } };
        const list = r.body.data?.list || [];
        out.push(...list.map(slim));
        offset += list.length;
        if (!list.length || offset >= (r.body.data?.meta?.total ?? 0)) break;
      }
      return { list: out };
    };
    const [t, s] = await Promise.all([roots.length ? readAll(`content/tags?${ids(roots)}`, BG.slimTag) : { list: [] }, readAll(`content/series?${ids(groupIds)}`, BG.slimSeries)]);
    if (t.error) return t.error;
    if (s.error) return s.error;
    const note = roots.length < new Set(groupIds.map((id) => byId.get(id)?.communityId)).size ? 'Bấm "Quét ngay" để tải tag của các group con' : '';
    return { status: 'ok', tags: t.list, series: s.list, note };
  });
}

// ---------- Nhắc tên và xem trước link (đọc khi soạn bài) ----------

// Người nhắc tên được trong các group sẽ đăng. API người dùng không nhận header phiên bản (bị 400).
async function doMentionable({ groupIds = [], key = '' }) {
  if (!groupIds.length) return { status: 'ok', users: [] };
  return withClient(async (client) => {
    // Dấu phẩy để nguyên như web gửi (axios không mã hoá dấu phẩy)
    const ids = groupIds.map(encodeURIComponent).join(',');
    const r = await client.call('GET', `user/users/mentionable?group_ids=${ids}${key.trim() ? '&' + qs({ key: key.trim() }) : ''}`, null, '');
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Tìm người lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', users: (r.body.data || []).map(BG.slimMentionable) };
  });
}

// Xem trước link: bài / article / series trên Beincom dùng API nội dung, link ngoài dùng url-metadata (giống web)
const BIC_CONTENT_URL = /^https?:\/\/(?:www\.)?group\.beincom\.com\/(?:posts|article|series)\/([^/?#]+)/i;

async function doLinkPreview({ url = '' }) {
  if (!/^https?:\/\//i.test(url)) return { status: 'error', message: 'Link không hợp lệ' };
  const own = BIC_CONTENT_URL.exec(url);
  return withClient(async (client) => {
    const r = await client.call('GET', own ? `content/contents/${own[1]}/link-preview` : `group/url-metadata?${qs({ url })}`, null, '2.0.0', 15000);
    if (r.status === 401) return { ...NEED_LOGIN };
    const preview = BG.isOk(r) ? BG.slimLinkPreview(r.body.data) : null;
    if (!preview) return { status: 'error', message: r.timeout ? 'Beincom không phản hồi' : 'Không lấy được thông tin link: ' + BG.errMsg(r) };
    return { status: 'ok', preview };
  });
}

// Bài đang chờ tới giờ đăng trong các community mình quản trị group gốc
async function doScheduled() {
  const { state } = await load();
  const roots = (state.snapshot?.groups || []).filter((g) => g.isCommunity && !g.error);
  return withClient(async (client) => {
    const map = new Map();
    const errors = [];
    let needLogin = false;
    await mapLimit(roots, PARALLEL, async (g) => {
      let after = '';
      for (let page = 0; page < SCHEDULED_PAGES; page++) {
        const r = await client.call('GET', `content/manage/groups/${g.id}/contents/scheduled?${qs({ limit: CONTENT_PAGE, type: 'POST', after })}`);
        if (r.status === 401) return (needLogin = true);
        if (!BG.isOk(r)) return errors.push(`${g.name}: ${BG.errMsg(r)}`);
        const list = r.body.data?.list || [];
        for (const p of list) if (!map.has(p.id)) map.set(p.id, { ...BG.slimScheduled(p), communityName: g.communityName || g.name });
        after = r.body.data?.meta?.endCursor || '';
        if (!r.body.data?.meta?.hasNextPage || !after || !list.length) break;
      }
    });
    if (needLogin) return { ...NEED_LOGIN };
    const items = [...map.values()].sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')));
    return { status: 'ok', items, errors };
  });
}

async function doScheduleAct({ action, contentId, scheduledAt, snippet = '', groupName = '', source = 'manual' }) {
  if (action !== 'reschedule' && action !== 'cancel') return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (!contentId) return { status: 'error', message: 'Thiếu bài cần xử lý' };
  if (action === 'reschedule') {
    const t = new Date(scheduledAt).getTime();
    if (!Number.isFinite(t) || t < Date.now() + BG.MIN_SCHEDULE_MIN * 60e3) return { status: 'error', message: `Giờ hẹn phải sau bây giờ ít nhất ${BG.MIN_SCHEDULE_MIN} phút` };
  }
  const { settings, state, log } = await load();
  const iso = action === 'reschedule' ? new Date(scheduledAt).toISOString() : null;
  const item = {
    log: { kind: 'compose', source, action, contentId, contentType: 'POST', snippet, groupName, communityName: '', ...(iso ? { scheduledAt: iso } : {}) },
    call: (c) => (action === 'reschedule' ? c.call('PUT', `content/contents/${contentId}/reschedule`, { scheduledAt: iso }) : c.call('DELETE', `content/posts/${contentId}`)),
    gone: true,
  };
  const r = await performActions([item], settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return summary(r, settings);
}

// ---------- Thống kê ----------
// Chủ / admin community: số liệu chính thức (thành viên & bài theo ngày).
// Admin group: tự tính từ nhật ký hoạt động + timeline + số thành viên addon ghi sau mỗi lần quét.
// Luôn đọc timeline để có bài nổi bật và người đăng tích cực.

const STATS_TIMELINE_PAGES = 8; // tối đa 8 trang × 20 bài mỗi group
const STATS_ACTIVITY_PAGES = 6; // tối đa 6 trang × 50 sự kiện

async function doStats({ groupId, days = 30 }) {
  const { state } = await load();
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  days = Math.max(1, Math.min(90, Number(days) || 30));
  const now = Date.now();
  const fromMs = now - days * 864e5;
  const range = qs({ from: new Date(fromMs).toISOString(), to: new Date(now).toISOString() });
  // Thống kê cả community = mọi group mình quản trị trong community đó
  const scope = g.isCommunity ? groups.filter((x) => x.communityId === g.communityId && !x.error) : [g];

  return withClient(async (client) => {
    const out = { status: 'ok', days, officialMembers: null, officialPosts: null, posts: [], activity: [], errors: [] };
    if (g.isCommunity) {
      const [mc, dc] = await Promise.all([
        client.call('GET', `group/manage/communities/${g.communityId}/stats/member-count?${range}`),
        client.call('GET', `content/stats/communities/${g.id}/contents/daily-counts?${range}`),
      ]);
      if (mc.status === 401) return { ...NEED_LOGIN };
      if (BG.isOk(mc) && Array.isArray(mc.body.data)) out.officialMembers = mc.body.data;
      if (BG.isOk(dc) && Array.isArray(dc.body.data)) out.officialPosts = dc.body.data;
    }

    // Bài trên timeline trong khoảng thời gian: các group đọc song song (mỗi group nhiều trang), gộp theo thứ tự group
    let needLogin = false;
    const timelineOf = async (sg) => {
      const list = [];
      let after = '';
      for (let page = 0; page < STATS_TIMELINE_PAGES; page++) {
        const r = await client.call('GET', `content/timeline/${sg.id}?${qs({ limit: TIMELINE_LIMIT, after })}`);
        if (r.status === 401) return (needLogin = true) && list;
        if (!BG.isOk(r)) {
          out.errors.push(`Bài viết ${sg.name}: ${BG.errMsg(r)}`);
          break;
        }
        const items = r.body.data?.list || [];
        list.push(...items);
        after = r.body.data?.meta?.endCursor || '';
        const oldest = items.at(-1)?.publishedAt;
        if (!r.body.data?.meta?.hasNextPage || !after || !items.length || (oldest && new Date(oldest).getTime() < fromMs)) break;
      }
      return list;
    };
    // Không có số liệu thành viên chính thức: đếm vào / rời từ nhật ký hoạt động (đọc cùng lúc với bài)
    const activityOf = async () => {
      if (out.officialMembers) return;
      for (let page = 1; page <= STATS_ACTIVITY_PAGES; page++) {
        const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: PAGE, page, sort: 'desc' })}`);
        if (r.status === 401) return { ...NEED_LOGIN };
        if (!BG.isOk(r)) {
          out.errors.push('Nhật ký hoạt động: ' + BG.errMsg(r));
          break;
        }
        const list = (Array.isArray(r.body.data) ? r.body.data : []).map(BG.slimActivity);
        noteAndFlush(BG.violationsFromActivity(list));
        out.activity.push(...list.filter((a) => a.time && new Date(a.time).getTime() >= fromMs));
        const oldest = list.at(-1)?.time;
        if (!r.body.meta?.hasNextPage || !list.length || (oldest && new Date(oldest).getTime() < fromMs)) break;
        if (page === STATS_ACTIVITY_PAGES) out.activityTruncated = true;
      }
    };
    const [lists, activityResult] = await Promise.all([mapLimit(scope, PARALLEL, timelineOf), activityOf()]);
    if (needLogin || activityResult?.status === 'need_login') return { ...NEED_LOGIN };
    const posts = new Map();
    for (const list of lists) for (const p of list) if (!posts.has(p.id)) posts.set(p.id, BG.slimPost(p));
    out.posts = [...posts.values()].filter((p) => p.publishedAt && new Date(p.publishedAt).getTime() >= fromMs);
    out.history = state.memberHistory?.[g.id] || [];
    out.userCount = g.userCount ?? null;
    return out;
  });
}

// ---------- Báo cáo vi phạm ----------
// 'reported': người dùng báo cáo bài / article / bình luận — chỉ chủ / admin community (gọi bằng ID group gốc).
//             API danh sách có lúc treo (gặp khi community chưa có báo cáo nào) nên đặt giới hạn chờ.
// 'flagged':  bài bị hệ thống kiểm duyệt tự động của Beincom gắn cờ — admin group xem được.
// 'hidden':   bài đã bị ẩn trong group.

const REPORT_TIMEOUT = 25000;
const REPORT_PAGES = 4;

async function doReports({ groupId, kind = 'reported' }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (kind === 'reported' && !(g.isCommunity && g.isCommunityAdmin)) {
    return { status: 'error', code: 'not_admin', message: 'Chỉ chủ / admin community mới xem được báo cáo của người dùng (chọn group gốc của community bạn làm admin).' };
  }
  if (!['reported', 'flagged', 'hidden'].includes(kind)) return { status: 'error', message: 'Loại báo cáo không hợp lệ' };
  const result = await withClient(async (client) => {
    // Không có báo cáo chờ xử lý: khỏi gọi API danh sách (treo tới hết thời hạn chờ khi community không có báo cáo)
    if (kind === 'reported') {
      const n = await countReports(client, g);
      if (n === 0) return { status: 'ok', items: [], timedOut: false, none: true };
    }
    const items = [];
    let after = '';
    for (let page = 0; page < REPORT_PAGES; page++) {
      const path =
        kind === 'reported'
          ? `content/manage/communities/${g.id}/content-reports?${qs({ limit: CONTENT_PAGE, after })}`
          : `content/manage/groups/${g.id}/contents/${kind}?${qs({ limit: TIMELINE_LIMIT, after })}`;
      const r = await client.call('GET', path, null, '2.0.0', kind === 'reported' ? REPORT_TIMEOUT : 0);
      if (r.status === 401) return { ...NEED_LOGIN };
      if (r.timeout) return { status: 'ok', items, timedOut: true };
      if (!BG.isOk(r)) return { status: 'error', message: 'Đọc báo cáo lỗi: ' + BG.errMsg(r) };
      const list = r.body.data?.list || [];
      items.push(...list.map(kind === 'reported' ? BG.slimReport : BG.slimPost));
      after = r.body.data?.meta?.endCursor || '';
      if (!r.body.data?.meta?.hasNextPage || !after || !list.length) break;
    }
    return { status: 'ok', items, timedOut: false };
  });
  if (result.status === 'ok') {
    noteAndFlush(
      kind === 'reported'
        ? BG.violationsFromReports(result.items, g.name)
        : BG.violationsFromPosts(result.items, kind === 'flagged' ? 'flagged' : 'hidden', (p) => (kind === 'flagged' ? p.violations.join(', ') : '')),
    );
    syncReportCounts(g.id, kind, result.items);
  }
  return result;
}

// Danh sách vừa đọc ở tab Báo cáo mới hơn lần quét: cập nhật số đếm (huy hiệu) và đánh dấu đã thấy để khỏi báo lại.
// Xếp hàng sau lần quét / thao tác đang chạy nhưng không bắt tab Báo cáo phải chờ.
function syncReportCounts(groupId, kind, items) {
  const field = { reported: 'reportIds', flagged: 'flaggedIds' }[kind];
  if (!field) return;
  const known = field === 'reportIds' ? 'knownReportIds' : 'knownFlaggedIds';
  const ids = (kind === 'reported' ? items.filter((x) => x.status === 'CREATED') : items).map((x) => x.id);
  exclusive(async () => {
    const { state } = await load();
    const g = state.snapshot?.groups?.find((x) => x.id === groupId);
    if (!g) return;
    const unseen = state[known] ? ids.filter((id) => !state[known].includes(id)) : [];
    if (!unseen.length && (g[field] || []).join() === ids.join()) return;
    g[field] = ids;
    if (unseen.length) state[known] = [...unseen, ...state[known]].slice(0, KNOWN_MAX);
    await chrome.storage.local.set({ state });
    await updateBadge();
  });
}

// Chi tiết một báo cáo: ai báo cáo, lý do gì
async function doReportDetail({ groupId, reportId }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  return withClient(async (client) => {
    const r = await client.call('GET', `content/manage/communities/${g.id}/content-reports/${reportId}`, null, '2.0.0', REPORT_TIMEOUT);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: r.timeout ? 'Beincom không phản hồi' : 'Đọc chi tiết lỗi: ' + BG.errMsg(r) };
    const d = r.body.data || {};
    const reasons = (d.reasonsCount || d.reasons || []).map((x) => ({
      label: BG.HIDE_REASONS[x.reasonType] || x.reasonType || 'Khác',
      total: x.total || 0,
      description: x.description || '',
      reporters: (x.reporters || []).map((p) => ({ id: p.id, username: p.username || '', fullname: p.fullname || '' })),
    }));
    return { status: 'ok', reasons };
  });
}

// items: [{ reportId?, targetId, targetType, snippet, actor, groups? }] lấy từ danh sách đang xem trên Dashboard
//  - ignore / hide: PUT content/manage/communities/{groupId gốc}/content-reports/{targetId}/status { status: IGNORED | HID }
//  - hidePost:      POST content/contents/{id}/hide { reasonType, groupIds } (bài bị gắn cờ tự động)
async function doReportAct({ action, groupId, items, reasonType = 'OTHERS', source = 'manual' }) {
  if (!['ignore', 'hide', 'hidePost'].includes(action)) return { status: 'error', message: 'Thao tác không hợp lệ' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (action !== 'hidePost' && !(g.isCommunity && g.isCommunityAdmin)) return { status: 'error', message: 'Chỉ chủ / admin community mới xử lý được báo cáo' };
  if (action === 'hidePost' && !BG.HIDE_REASONS[reasonType]) return { status: 'error', message: 'Lý do ẩn không hợp lệ' };
  const adminIds = new Set(groups.map((x) => x.id));
  const list = (items || []).filter((it) => it?.targetId);
  if (!list.length) return { status: 'error', message: 'Chưa chọn nội dung nào' };

  const work = [];
  for (const it of list) {
    const logBase = {
      kind: 'report',
      source,
      action,
      groupId: g.id,
      groupName: g.name,
      communityName: g.communityName || '',
      contentId: it.targetId,
      contentType: it.targetType === 'COMMENT' ? 'POST' : it.targetType,
      targetType: it.targetType,
      reportId: it.reportId || '',
      snippet: String(it.snippet || '').replace(/\s+/g, ' ').slice(0, 120),
      userId: it.actor?.id || '',
      username: it.actor?.username || '',
      fullname: it.actor?.fullname || '',
    };
    if (action === 'hidePost') {
      // Chỉ ẩn ở các group bài được đăng mà mình quản trị; không rõ thì ẩn ở group đang xem
      const ids = (it.groups || []).map((x) => x.id).filter((id) => adminIds.has(id));
      const groupIds = ids.length ? ids : [g.id];
      work.push({ log: { ...logBase, reason: BG.HIDE_REASONS[reasonType], groupIds }, call: (c) => c.call('POST', `content/contents/${it.targetId}/hide`, { reasonType, groupIds }), gone: true });
    } else {
      const status = action === 'ignore' ? 'IGNORED' : 'HID';
      work.push({ log: logBase, call: (c) => c.call('PUT', `content/manage/communities/${g.id}/content-reports/${it.targetId}/status`, { status }) });
    }
  }
  const r = await performActions(work, settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : { ...state };
  // Bỏ mục đã xử lý khỏi số đếm để huy hiệu cập nhật ngay
  const ok = r.entries.filter((e) => e.status === 'ok');
  if (action === 'hidePost') next.snapshot = dropFromSnapshot(next.snapshot, 'flaggedIds', new Set(ok.map((e) => e.contentId)));
  else next.snapshot = dropFromSnapshot(next.snapshot, 'reportIds', new Set(ok.map((e) => e.reportId)));
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login' || ok.length) await updateBadge();
  return { ...summary(r, settings), done: ok.map((e) => e.contentId) };
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

// ---------- Lịch chạy ----------

async function scheduleAlarm(reset = false) {
  const { settings } = await load();
  const alarm = await chrome.alarms.get(ALARM);
  if (alarm && !reset && alarm.periodInMinutes === settings.intervalMin) return;
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: settings.intervalMin });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings, rules, postRules } = await chrome.storage.local.get(['settings', 'rules', 'postRules']);
  await chrome.storage.local.set({
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    rules: { ...BG.DEFAULT_RULES, ...rules },
    postRules: { ...BG.DEFAULT_POST_RULES, ...postRules },
  });
  await scheduleAlarm();
  await updateBadge();
  exclusive(() => doScan({ source: 'install' }));
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  await updateBadge();
  exclusive(() => doScan({ source: 'startup' }));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) exclusive(() => doScan({ source: 'alarm' }));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.postRules) updateBadge(); // đổi quy tắc bài viết -> đếm lại bài vi phạm
  if (!changes.settings) return;
  const { oldValue = {}, newValue = {} } = changes.settings;
  if (oldValue.intervalMin !== newValue.intervalMin) scheduleAlarm(true);
  if (oldValue.active !== newValue.active) {
    updateBadge();
    if (newValue.active !== false) exclusive(() => doScan({ source: 'resume' })); // bật lại -> quét ngay
  }
});

// Bấm thông báo: mở thẳng tab Dashboard liên quan
function notificationTab(id) {
  if (id === 'bg-requests' || id === 'bg-auto') return 'members';
  if (id === 'bg-flagged' || id.startsWith('bg-posts-')) return 'content';
  if (id === 'bg-reports' || id === 'bg-autoflag') return 'reports';
  return '';
}

chrome.notifications.onClicked.addListener((id) => {
  const tab = notificationTab(id);
  chrome.tabs.create({ url: id === 'bg-login' ? BG.SITE + '/' : chrome.runtime.getURL(DASHBOARD + (tab ? '#tab=' + tab : '')) });
  chrome.notifications.clear(id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Đọc danh sách thành viên / nhật ký không cần chờ lần quét đang chạy
  const reads = {
    members: () => doMembers(msg),
    activity: () => doActivity(msg),
    scheduled: () => doScheduled(),
    stats: () => doStats(msg),
    reports: () => doReports(msg),
    reportDetail: () => doReportDetail(msg),
    // Tải file lên trước khi đăng: không chờ lần quét đang chạy
    uploadInit: () => doUploadInit(msg),
    uploadWait: () => doUploadWait(msg),
    mentionable: () => doMentionable(msg),
    tagsSeries: () => doTagsSeries(msg),
    linkPreview: () => doLinkPreview(msg),
  };
  if (reads[msg?.type]) {
    reads[msg.type]().then(sendResponse);
    return true;
  }
  const handlers = {
    scan: () => doScan({ source: msg.source || 'popup' }),
    refresh: () => doRefresh(msg),
    act: () => doAct(msg),
    approvalAct: () => doApprovalAct(msg),
    postAct: () => doPostAct(msg),
    memberAct: () => doMemberAct(msg),
    compose: () => doCompose(msg),
    scheduleAct: () => doScheduleAct(msg),
    reportAct: () => doReportAct(msg),
    profileAct: () => doProfileAct(msg),
  };
  const h = handlers[msg?.type];
  if (!h) return;
  exclusive(h).then(sendResponse);
  return true;
});
