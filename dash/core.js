// Dashboard — phần chung: dữ liệu, tiện ích, thanh trên cùng, hộp xác nhận, gửi thao tác, chuyển tab, nút Tải lại.
// Các tệp dash/*.js là script thường dùng chung phạm vi toàn cục; thứ tự nạp xem cuối dashboard.html.

const $ = (id) => document.getElementById(id);
const WHERE_PAGE = 'dashboard';

// Lỗi JavaScript của trang: gửi về nền để ghi vào Nhật ký → Lỗi kỹ thuật (không làm gì thêm nếu gửi lỗi)
function reportDiag(where, e) {
  try {
    chrome.runtime.sendMessage({ type: 'diag', entry: { where, kind: 'js', ...e } }).catch(() => {});
  } catch {}
}
window.addEventListener('error', (e) => reportDiag(WHERE_PAGE, { message: e.message, stack: e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}` }));
window.addEventListener('unhandledrejection', (e) => reportDiag(WHERE_PAGE, { message: String(e.reason?.message || e.reason), stack: e.reason?.stack || '' }));

const RULE_BOOLS = ['requireAvatar', 'requireAnswers', 'requireVerified', 'declineDeactivated', 'reviewViolators', 'reviewImpersonation'];
const RULE_LISTS = { bannedKeywords: false, allowUsernames: true, blockUsernames: true }; // true = danh sách username
const POST_RULE_LISTS = ['bannedKeywords', 'reviewKeywords', 'blockedDomains', 'allowedDomains'];
const SETTING_BOOLS = ['active', 'dryRun', 'notify', 'scanPosts', 'scanComments', 'scanReports', 'trackViolations', 'spamWaves', 'welcomeReminder', 'remindUnanswered', 'remindPending', 'guardJoins', 'chatEnabled', 'chatScan', 'chatUnread', 'chatThreads', 'weeklyReport', 'monthlyReport', 'autoApprove', 'autoDecline', 'autoHideSpam', 'autoApprovePosts'];
const SETTING_NUMS = ['intervalMin', 'actionDelaySec', 'unansweredHours', 'pendingHours', 'burstJoins', 'trustAfterApproved'];
const LOG_PAGE = 50;
const RECENT_PAGE = 30;

let data = { settings: { ...BG.DEFAULT_SETTINGS }, rules: { ...BG.DEFAULT_RULES }, postRules: { ...BG.DEFAULT_POST_RULES }, groupRules: {}, state: {}, log: [] };
const TABS = ['overview', 'members', 'content', 'reports', 'compose', 'stats', 'settings', 'log'];
const hashParams = () => new URLSearchParams(location.hash.slice(1));
let selectedGroupId = hashParams().get('group');
// Tab mở lúc đầu: theo địa chỉ (#tab=…), link cũ #group=… mở tab Thành viên, #recent mở tab Bài viết
let currentTab = TABS.includes(hashParams().get('tab')) ? hashParams().get('tab') : selectedGroupId ? 'members' : location.hash === '#recent' ? 'content' : 'overview';
let selectedCommunityId = null;
let verdictFilter = 'all';
let approvalFilter = 'all';
let recentFilter = 'flagged';
let recentLimit = RECENT_PAGE;
let logFilter = 'all';
let logLimit = LOG_PAGE;
let busy = false;
const selected = new Set(); // yêu cầu tham gia
const selectedPosts = new Set(); // bài chờ duyệt
const selectedRecent = new Set(); // bài mới đăng

// ---------- Tiện ích ----------

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c);
  return e;
}

function fmtTime(t) {
  if (!t) return '–';
  return new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ago(t) {
  if (!t) return '';
  const s = Math.round((Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

function groupPath(g) {
  return g.isCommunity || !g.communityName ? g.name : `${g.communityName} › ${g.name}`;
}

function groups() {
  return data.state.snapshot?.groups || [];
}

// Chấm theo quy tắc chung + quy tắc riêng từng group
function rulesCtx() {
  return { rules: data.rules, postRules: data.postRules, groupRules: data.groupRules, groups: groups(), admins: data.state.admins?.byGroup || null };
}
const evalPost = (p, fallback = null) => BG.evaluatePostIn(p, rulesCtx(), fallback);

function toast(text, kind = 'ok') {
  const t = el('div', { class: `toast ${kind}`, role: 'status', text });
  document.body.append(t);
  setTimeout(() => t.remove(), 6000);
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  el('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setCounts(prefix, counts) {
  for (const [k, n] of Object.entries(counts)) {
    const e = $(`${prefix}-${k}`);
    if (e) e.textContent = n ? `(${n})` : '';
  }
}

function setSegActive(id, value) {
  for (const b of $(id).querySelectorAll('button')) b.classList.toggle('active', b.dataset.f === value);
}

function flaggedRecent() {
  return (data.state.recentPosts || []).filter((p) => !p.dismissed && !p.isHidden && evalPost(p).verdict === 'bad');
}

function flaggedComments() {
  if (!data.settings.scanComments) return [];
  return (data.state.recentComments || []).filter((c) => !c.dismissed && !c.isHidden && evalPost(c).verdict === 'bad');
}

// ---------- Trên cùng ----------

function renderTop() {
  const s = data.settings;
  const pill = $('scan-pill');
  pill.className = 'pill ' + (s.active ? 'on' : 'off');
  pill.textContent = s.active ? `Tự quét mỗi ${s.intervalMin >= 60 ? s.intervalMin / 60 + ' giờ' : s.intervalMin + ' phút'}` : 'Đã tắt';
  $('dry-pill').hidden = !s.dryRun;

  const st = data.state;
  const r = st.lastResult;
  const b = $('banner');
  b.hidden = false;
  b.className = 'banner';
  if (r?.status === 'need_login') {
    b.classList.add('warn');
    b.replaceChildren('Phiên đăng nhập Beincom đã hết hạn. ', el('a', { href: BG.SITE + '/', target: '_blank', text: 'Đăng nhập lại ↗' }), ' rồi bấm Quét ngay.');
  } else if (r?.status === 'error') {
    b.classList.add('err');
    b.textContent = 'Lần quét gần nhất bị lỗi: ' + r.message;
  } else if (!st.snapshot) {
    b.classList.add('warn');
    b.textContent = 'Chưa quét lần nào — bấm "Quét ngay" (cần đăng nhập Beincom trên trình duyệt này).';
  } else if (!groups().length) {
    b.classList.add('warn');
    b.textContent = 'Tài khoản Beincom đang đăng nhập chưa quản trị group nào.';
  } else if (s.dryRun) {
    b.classList.add('warn');
    b.textContent = 'Đang bật Chạy thử: bấm Duyệt/Từ chối/Ẩn chỉ ghi vào nhật ký, chưa gửi lên Beincom. Tắt ở phần Cài đặt khi đã sẵn sàng.';
  } else {
    b.hidden = true;
  }
}

async function renderKpis() {
  const gs = groups();
  const st = data.state;
  const t = BG.totals(gs);
  const has = !!st.snapshot;
  const kpi = (id, value, sub, hot = false) => {
    $(id).textContent = has ? value : '–';
    $(id).parentElement.classList.toggle('hot', has && hot);
    $(id + '-sub').textContent = has ? sub : '';
  };
  const communities = new Set(gs.map((g) => g.communityId).filter(Boolean));
  kpi('kpi-groups', gs.length, `thuộc ${communities.size} community`);
  const reqGroups = gs.filter((g) => g.pendingTotal).length;
  kpi('kpi-requests', t.requests, reqGroups ? `ở ${reqGroups} group` : 'không có yêu cầu nào', t.requests > 0);
  const watching = gs.filter((g) => g.approvalCount != null).length;
  kpi('kpi-posts', t.posts, watching ? `duyệt bài đang bật ở ${watching} community` : 'không community nào bật duyệt bài', t.posts > 0);
  const flagged = flaggedRecent().length;
  const badComments = flaggedComments().length;
  const recent = (st.recentPosts || []).length;
  const flagSub = data.settings.scanComments ? `${flagged} bài · ${badComments} bình luận, trong ${recent} bài mới đã quét` : `trong ${recent} bài mới đã quét`;
  kpi('kpi-flagged', data.settings.scanPosts ? flagged + badComments : '–', data.settings.scanPosts ? flagSub : 'đang tắt quét bài mới', flagged + badComments > 0);
  const reports = t.reports + t.autoFlagged;
  kpi('kpi-reports', data.settings.scanReports ? reports : '–', data.settings.scanReports ? `${t.reports} báo cáo chờ xử lý · ${t.autoFlagged} bài bị gắn cờ` : 'đang tắt quét báo cáo', reports > 0);

  $('kpi-scan').textContent = st.lastScan ? fmtTime(st.lastScan) : '–';
  let sub = st.lastResult?.mode === 'tab' ? 'qua tab Beincom' : st.lastResult?.mode === 'direct' ? 'gọi trực tiếp' : '';
  if (data.settings.active) {
    const alarm = await chrome.alarms.get('beingroup-scan');
    if (alarm) sub += (sub ? ' · ' : '') + 'lần tới ' + new Date(alarm.scheduledTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  $('kpi-scan-sub').textContent = sub;
}

// ---------- Hộp xác nhận ----------

// extra: phần tử thêm vào hộp (ô lý do...). Trả về true khi bấm nút xác nhận.
function confirmDialog({ title, text, names = [], okText, danger = false, extra = null, local = false, sendNote = 'Sẽ gửi lên Beincom ngay và không hoàn tác được.' }) {
  const d = $('confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  const items = names.slice(0, 20).map((n) => el('li', { text: n }));
  if (names.length > 20) items.push(el('li', { text: `… và ${names.length - 20} mục khác` }));
  $('confirm-list').replaceChildren(...items);
  $('confirm-extra').replaceChildren(...(extra ? [extra] : []));
  // local: thao tác chỉ đổi trong addon, Chạy thử không liên quan
  $('confirm-dry').textContent = data.settings.dryRun && !local ? 'Đang bật Chạy thử: chỉ ghi vào nhật ký, không gửi lên Beincom.' : sendNote;
  const ok = $('confirm-ok');
  ok.textContent = okText;
  ok.classList.toggle('decline', danger);
  d.returnValue = '';
  d.showModal();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

// ---------- Gửi thao tác ----------
// chunk: tên các danh sách trong lệnh có thể chia (vd ['contentIds']). Loạt lớn được chia thành nhiều lệnh nhỏ, mỗi lệnh
// khoảng 2 phút kể cả thời gian nghỉ giữa hai thao tác — trình duyệt tắt service worker nếu một lệnh chạy quá 5 phút.
// last(msg, isLast): sửa lệnh của từng đợt (vd chỉ cấm ở đợt cuối). Khi đang làm: thanh tiến độ với nút Dừng.
const CHUNK_SECONDS = 120;
let run = null; // { total, offset, stop }

function chunkSize() {
  return Math.max(1, Math.floor(CHUNK_SECONDS / ((Number(data.settings.actionDelaySec) || 0) + 1)));
}

// Gộp kết quả các đợt: số cộng dồn, danh sách nối, lỗi bỏ trùng
function mergeResults(a, b) {
  if (!a) return b;
  const out = { ...a, ...b };
  for (const [k, v] of Object.entries(b || {})) {
    if (typeof v === 'number' && typeof a[k] === 'number') out[k] = a[k] + v;
    else if (Array.isArray(v) && Array.isArray(a[k])) out[k] = k === 'errors' ? [...new Set([...a[k], ...v])] : [...a[k], ...v];
  }
  return out;
}

function renderRun(doneInChunk = 0) {
  const bar = $('bulk-run');
  bar.hidden = !run || run.total < 2;
  if (bar.hidden) return;
  const done = Math.min(run.total, run.offset + doneInChunk);
  $('bulk-run-text').textContent = run.stop ? `Đang dừng… (đã làm ${done}/${run.total})` : `Đang gửi lên Beincom: ${done}/${run.total}`;
  $('bulk-run-bar').max = run.total;
  $('bulk-run-bar').value = done;
  $('btn-bulk-stop').disabled = run.stop;
}

async function send(msg, doneText, { chunk = null, last = (m) => m } = {}) {
  busy = true;
  renderAll();
  const keys = chunk || [];
  const flat = keys.flatMap((k, ki) => (msg[k] || []).map((x) => [ki, x]));
  // Chạy thử: không nghỉ giữa các thao tác nên không cần chia
  const size = data.settings.dryRun ? Infinity : chunkSize();
  const parts = [];
  for (let i = 0; i < Math.max(flat.length, 1); i += size === Infinity ? Math.max(flat.length, 1) : size) parts.push(flat.slice(i, i + size));
  run = keys.length ? { total: flat.length, offset: 0, stop: false } : null;
  renderRun();
  let r = null;
  try {
    for (let c = 0; c < parts.length; c++) {
      let part = msg;
      if (keys.length) {
        part = { ...msg };
        keys.forEach((k, ki) => (part[k] = parts[c].filter(([j]) => j === ki).map(([, x]) => x)));
      }
      const res = await chrome.runtime.sendMessage(last(part, c === parts.length - 1));
      r = mergeResults(r, res);
      if (!res || res.status === 'need_login' || (res.status === 'error' && !res.failed) || res.cancelled) break;
      if (run) {
        run.offset += parts[c].length;
        renderRun();
      }
      if (c < parts.length - 1) {
        if (run?.stop) {
          r = { ...r, cancelled: true, left: (r.left || 0) + flat.length - run.offset };
          break;
        }
        // Nghỉ như giữa hai thao tác (bấm Dừng thì thôi chờ)
        const end = Date.now() + (Number(data.settings.actionDelaySec) || 0) * 1000;
        while (Date.now() < end && !run?.stop) await new Promise((ok) => setTimeout(ok, 200));
        if (run?.stop) {
          r = { ...r, cancelled: true, left: (r.left || 0) + flat.length - run.offset };
          break;
        }
      }
    }
    if (r?.status === 'need_login') toast('Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.', 'err');
    else if (r?.status === 'error' && !r.failed) toast(r.message || 'Có lỗi', 'err');
    else if (r?.dryRun) toast(`Chạy thử: đã ghi ${r.dry} thao tác vào nhật ký, chưa gửi lên Beincom.`, 'warn');
    else if (r?.cancelled) toast(`Đã dừng: xong ${r.ok ?? 0}${r.failed ? `, lỗi ${r.failed}` : ''}, còn ${r.left} mục chưa làm. Nhật ký ghi đủ những mục đã làm.`, 'warn');
    else if (r?.failed) toast(`Xong ${r.ok}, lỗi ${r.failed}: ${r.errors.join('; ')}`, 'err');
    else toast(doneText(r?.ok ?? 0) + (r?.gone ? ` (${r.gone} bài đã bị xoá trên Beincom từ trước, đã bỏ khỏi danh sách)` : ''));
    return r;
  } catch (e) {
    // Service worker bị tắt giữa chừng: những mục đã làm được ghi bù vào Nhật ký khi nó chạy lại
    toast('Thao tác bị ngắt giữa chừng: ' + (e?.message || e) + '. Những mục đã làm được ghi trong Nhật ký — xem lại trước khi làm tiếp.', 'err');
    return null;
  } finally {
    busy = false;
    run = null;
    renderRun();
    await loadAll();
  }
}

$('btn-bulk-stop').addEventListener('click', () => {
  if (!run) return;
  run.stop = true;
  renderRun();
  chrome.runtime.sendMessage({ type: 'cancelActions' }).catch(() => {});
});

function personName(u) {
  return `${u.fullname || '(không tên)'}${u.username ? ' (@' + u.username + ')' : ''}`;
}

// ---------- Tab ----------

function writeHash() {
  const p = new URLSearchParams();
  p.set('tab', currentTab);
  if (selectedGroupId) p.set('group', selectedGroupId);
  try {
    history.replaceState(null, '', location.pathname + '#' + p.toString());
  } catch {}
}

function showTab(t) {
  if (!TABS.includes(t)) t = 'overview';
  const changed = t !== currentTab;
  currentTab = t;
  for (const s of document.querySelectorAll('main > [data-tab]')) s.hidden = s.dataset.tab !== t;
  if (changed) window.scrollTo(0, 0); // tab mới mở từ đầu trang (nơi gọi muốn tới một thẻ thì tự cuộn sau đó)
  for (const b of document.querySelectorAll('#tabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
    b.tabIndex = b.dataset.tab === t ? 0 : -1;
  }
  writeHash();
  renderTabRefresh();
  if (tabDirty.has(t)) renderTab(t); // dashboard.js: tab này có dữ liệu mới chưa vẽ
  ensureTabData();
  // Biểu đồ cần chiều rộng thật: vẽ lại sau khi tab hiện
  if (t === 'stats') renderStats();
  if (typeof renderToc === 'function') renderToc(); // dash/layout.js: mục lục nhanh của tab
}

// Mỗi tab chỉ tải dữ liệu khi mở lần đầu (đỡ gọi API thừa)
function ensureTabData() {
  if (!data.state.snapshot) return;
  if (currentTab === 'members' && !mem.groupId && memberGroup()) loadMembers(true);
  if (currentTab === 'compose' && !sched.loaded && !sched.loading) loadScheduled();
  if (currentTab === 'content' && !pins.loading && pinGroup() && !pins.data[pinGroup().id]) loadPinned();
  if (currentTab === 'overview' && !gset.loaded && !gset.loading) loadGroupSettings();
  if (currentTab === 'reports' && !rep.loading && reportGroup() && !rep.data[repKey()]?.loaded) loadReports();
  if (currentTab === 'stats' && !stats.loaded && !stats.loading && statsGroup()) loadStats();
}

// ---------- Nút "Tải lại" của tab ----------
// Chỉ tải dữ liệu tab đang xem, nhanh hơn "Quét ngay" (quét toàn bộ).

const TAB_REFRESH = {
  overview: {
    title: 'Tải lại thông tin group, yêu cầu tham gia, số bài chờ duyệt và cài đặt group (không đọc bài viết)',
    run: async () => {
      await refreshPart('groups');
      await loadGroupSettings();
    },
  },
  members: {
    title: 'Tải lại yêu cầu tham gia và danh sách / nhật ký vào-rời đang xem',
    run: async () => {
      await refreshPart('groups');
      if (mem.tab === 'list') await loadMembers(true);
      else if (mem.tab === 'activity') await loadActivity(true);
      else if (mem.tab === 'banned') await loadBanned(true);
    },
  },
  content: {
    title: 'Tải lại bài chờ duyệt, bài mới đăng, bình luận mới và bài đang ghim (không đọc yêu cầu tham gia)',
    run: async () => {
      await refreshPart('content');
      await loadPinned();
    },
  },
  reports: { title: 'Tải lại mục báo cáo đang xem', run: () => loadReports() },
  compose: { title: 'Tải lại danh sách bài đã hẹn giờ', run: () => loadScheduled() },
  stats: { title: 'Tính lại số liệu thống kê', run: () => loadStats() },
};
const refreshedAt = {}; // tab -> giờ tải lại gần nhất
let tabRefreshing = false;

async function refreshPart(part) {
  const r = await chrome.runtime.sendMessage({ type: 'refresh', part });
  if (r?.status === 'need_login') toast('Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.', 'err');
  else if (r?.status === 'error') toast(r.message || 'Tải lại lỗi', 'err');
  await loadAll();
  return r;
}

async function refreshTab() {
  const spec = TAB_REFRESH[currentTab];
  if (!spec || tabRefreshing) return;
  const tab = currentTab;
  tabRefreshing = true;
  renderTabRefresh();
  try {
    await spec.run();
    refreshedAt[tab] = Date.now();
  } finally {
    tabRefreshing = false;
    renderTabRefresh();
  }
}

function renderTabRefresh() {
  const spec = TAB_REFRESH[currentTab];
  const btn = $('btn-tab-refresh');
  btn.hidden = !spec;
  btn.disabled = tabRefreshing || !data.state.snapshot;
  btn.textContent = tabRefreshing ? 'Đang tải…' : '↻ Tải lại';
  btn.title = spec ? `${spec.title}. Nút "Quét ngay" ở trên quét toàn bộ.` : '';
  const at = refreshedAt[currentTab];
  $('tab-refresh-at').textContent = spec && at && !tabRefreshing ? 'Cập nhật ' + new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '';
}

function renderBadges() {
  const t = BG.totals(groups());
  const set = (id, n) => ($(id).textContent = n ? (n > 99 ? '99+' : String(n)) : '');
  set('badge-members', t.requests);
  set('badge-content', t.posts + flaggedRecent().length + flaggedComments().length);
  set('badge-compose', sched.loaded ? sched.items.length : 0);
  // Báo cáo chờ xử lý + bài bị gắn cờ, theo lần quét gần nhất (mở tab Báo cáo cũng cập nhật số này)
  set('badge-reports', t.reports + t.autoFlagged);
}

function evaluated(g) {
  const rules = BG.effectiveRules(g, rulesCtx()).rules;
  const admins = BG.adminsOf(data.state.admins?.byGroup, g, groups());
  return (g?.requests || []).map((req) => ({ req, ev: BG.evaluateRequest(req, rules, g.questions, profileOf(req.user?.id || req.userId), admins) }));
}

function avatarOf(u) {
  if (BG.hasAvatar(u)) return el('img', { class: 'avatar', src: u.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  return el('span', { class: 'avatar none', text: (u.fullname || u.username || '?').trim().charAt(0).toUpperCase() });
}

// ---------- Nút chọn (seg) ----------
function onSeg(id, set) {
  $(id).addEventListener('click', (e) => {
    const f = e.target.closest('button')?.dataset.f;
    if (f) set(f);
  });
}
