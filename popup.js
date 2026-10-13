const $ = (id) => document.getElementById(id);
const WHERE_PAGE = 'popup';

// Lỗi JavaScript của trang: gửi về nền để ghi vào Nhật ký → Lỗi kỹ thuật (không làm gì thêm nếu gửi lỗi)
function reportDiag(where, e) {
  try {
    chrome.runtime.sendMessage({ type: 'diag', entry: { where, kind: 'js', ...e } }).catch(() => {});
  } catch {}
}
window.addEventListener('error', (e) => reportDiag(WHERE_PAGE, { message: e.message, stack: e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}` }));
window.addEventListener('unhandledrejection', (e) => reportDiag(WHERE_PAGE, { message: String(e.reason?.message || e.reason), stack: e.reason?.stack || '' }));

const POPUP_SETTINGS = ['active', 'dryRun', 'notify'];

function fmtTime(t) {
  return new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function renderStatus(info, flagged = 0, reports = 0) {
  const el = $('status');
  const r = info.lastResult;
  el.className = 'status';
  if (!r) {
    el.textContent = 'Chưa quét lần nào';
    el.classList.add('warn');
  } else if (r.status === 'need_login') {
    el.textContent = 'Cần đăng nhập Beincom';
    el.classList.add('warn');
  } else if (r.status === 'error') {
    el.textContent = 'Lỗi: ' + r.message;
    el.classList.add('err');
  } else {
    const t = info.totals;
    const busy = t.requests || t.posts || flagged || reports;
    el.textContent = busy ? 'Có việc cần xử lý' : '✓ Không có gì đang chờ';
    el.classList.add(busy ? 'warn' : 'ok');
  }
  $('last-scan').textContent = info.lastScan ? 'Lần quét gần nhất: ' + fmtTime(info.lastScan) : '';
}

$('open-todo').href = chrome.runtime.getURL('dashboard.html') + '#tab=overview';

function todoLine(ul, text, hash, count) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = chrome.runtime.getURL('dashboard.html') + hash;
  a.target = '_blank';
  a.textContent = text;
  const cnt = document.createElement('span');
  cnt.className = 'cnt';
  cnt.textContent = count;
  li.append(a, cnt);
  ul.append(li);
}

function renderTodo(groups, flagged, reports, comments = 0) {
  const ul = $('todo');
  ul.replaceChildren();
  const todo = groups.filter((g) => g.pendingTotal || g.approvalCount);
  if (flagged) todoLine(ul, 'Bài mới vi phạm quy tắc', '#tab=content', `${flagged} bài`);
  if (comments) todoLine(ul, 'Bình luận vi phạm quy tắc', '#tab=content', `${comments} bình luận`);
  if (reports) todoLine(ul, 'Báo cáo vi phạm', '#tab=reports', String(reports));
  if (!todo.length && !flagged && !comments && !reports) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Không có';
    ul.append(li);
    return;
  }
  for (const g of todo.slice(0, 5)) {
    const parts = [];
    if (g.pendingTotal) parts.push(`${g.pendingTotal} yêu cầu`);
    if (g.approvalCount) parts.push(`${g.approvalCount} bài`);
    // Có yêu cầu tham gia -> tab Thành viên; chỉ có bài chờ duyệt -> tab Bài viết
    const hash = g.pendingTotal ? '#tab=members&group=' + encodeURIComponent(g.id) : '#tab=content';
    todoLine(ul, g.isCommunity || !g.communityName ? g.name : `${g.communityName} › ${g.name}`, hash, parts.join(' · '));
  }
}

// Số đếm cho popup: nền ghi sẵn gói nhỏ popupInfo (bg/core.js savePopupInfo) nên popup không phải đọc cả kết quả quét
// rồi chấm lại từng bài. Chưa có gói (vừa nâng cấp addon): tính tại chỗ một lần và nhờ nền ghi gói cho lần sau.
async function countsFromState() {
  const { rules, postRules, groupRules, state } = await chrome.storage.local.get(['rules', 'postRules', 'groupRules', 'state']);
  const st = state || {};
  const groups = st.snapshot?.groups || [];
  const ctx = { rules, postRules, groupRules: groupRules || {}, groups };
  const bad = (list) => (list || []).filter((p) => !p.dismissed && !p.isHidden && BG.evaluatePostIn(p, ctx).verdict === 'bad').length;
  chrome.runtime.sendMessage({ type: 'refreshBadge' }).catch(() => {});
  return {
    hasSnapshot: !!st.snapshot,
    hasRecent: !!st.recentPosts,
    lastScan: st.lastScan || 0,
    lastResult: st.lastResult || null,
    totals: BG.totals(groups),
    flaggedPosts: bad(st.recentPosts),
    flaggedComments: bad(st.recentComments),
    todo: groups.filter((g) => g.pendingTotal || g.approvalCount).slice(0, 5),
  };
}

async function refresh() {
  const { settings, popupInfo } = await chrome.storage.local.get(['settings', 'popupInfo']);
  const s = { ...BG.DEFAULT_SETTINGS, ...settings };
  const info = popupInfo || (await countsFromState());
  for (const key of POPUP_SETTINGS) $(key).checked = !!s[key];
  $('master').classList.toggle('off', !s.active);
  $('master-text').textContent = s.active ? 'Addon đang hoạt động' : 'Đã tắt tất cả chức năng';
  document.querySelector('.settings').classList.toggle('paused', !s.active);
  for (const key of POPUP_SETTINGS) if (key !== 'active') $(key).disabled = !s.active;
  $('dry-note').hidden = !s.dryRun;

  const t = info.totals;
  const flaggedPosts = info.flaggedPosts || 0;
  const flaggedComments = s.scanComments ? info.flaggedComments || 0 : 0;
  const flagged = flaggedPosts + flaggedComments;
  $('requests').textContent = info.hasSnapshot ? t.requests : '–';
  $('posts').textContent = info.hasSnapshot ? t.posts : '–';
  $('flagged').textContent = info.hasRecent && s.scanPosts ? flagged : '–';
  const reports = t.reports + t.autoFlagged;
  $('reports').textContent = info.hasSnapshot && s.scanReports ? reports : '–';
  $('reports').classList.toggle('hot', reports > 0);
  $('requests').classList.toggle('hot', t.requests > 0);
  $('posts').classList.toggle('hot', t.posts > 0);
  $('flagged').classList.toggle('hot', flagged > 0);
  renderStatus(info, flagged, reports);
  renderTodo(info.todo || [], flaggedPosts, reports, flaggedComments);
}

for (const key of POPUP_SETTINGS) {
  $(key).addEventListener('change', async () => {
    const { settings } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...BG.DEFAULT_SETTINGS, ...settings, [key]: $(key).checked } });
  });
}

$('scan').addEventListener('click', async () => {
  const btn = $('scan');
  btn.disabled = true;
  btn.textContent = 'Đang quét…';
  try {
    await chrome.runtime.sendMessage({ type: 'scan', source: 'popup' });
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Quét ngay';
    refresh();
  }
});

$('open-dashboard').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Chỉ vẽ lại khi cài đặt hoặc gói số đếm đổi (không phải mỗi lần nền ghi kết quả quét, nhật ký…)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.settings || changes.popupInfo)) refresh();
});
$('version').textContent = 'v' + chrome.runtime.getManifest().version;
refresh();
