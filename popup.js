const $ = (id) => document.getElementById(id);
const POPUP_SETTINGS = ['active', 'dryRun', 'notify'];

function fmtTime(t) {
  return new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function renderStatus(state, flagged = 0, reports = 0) {
  const el = $('status');
  const r = state.lastResult;
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
    const t = BG.totals(state.snapshot?.groups);
    const busy = t.requests || t.posts || flagged || reports;
    el.textContent = busy ? 'Có việc cần xử lý' : '✓ Không có gì đang chờ';
    el.classList.add(busy ? 'warn' : 'ok');
  }
  $('last-scan').textContent = state.lastScan ? 'Lần quét gần nhất: ' + fmtTime(state.lastScan) : '';
}

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

function renderTodo(groups, flagged, reports) {
  const ul = $('todo');
  ul.replaceChildren();
  const todo = groups.filter((g) => g.pendingTotal || g.approvalCount);
  if (flagged) todoLine(ul, 'Bài mới vi phạm quy tắc', '#tab=content', `${flagged} bài`);
  if (reports) todoLine(ul, 'Báo cáo vi phạm', '#tab=reports', String(reports));
  if (!todo.length && !flagged && !reports) {
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

async function refresh() {
  const { settings, postRules, state } = await chrome.storage.local.get(['settings', 'postRules', 'state']);
  const s = { ...BG.DEFAULT_SETTINGS, ...settings };
  const pr = { ...BG.DEFAULT_POST_RULES, ...postRules };
  const st = state || {};
  for (const key of POPUP_SETTINGS) $(key).checked = !!s[key];
  $('master').classList.toggle('off', !s.active);
  $('master-text').textContent = s.active ? 'Addon đang hoạt động' : 'Đã tắt tất cả chức năng';
  document.querySelector('.settings').classList.toggle('paused', !s.active);
  for (const key of POPUP_SETTINGS) if (key !== 'active') $(key).disabled = !s.active;
  $('dry-note').hidden = !s.dryRun;

  const groups = st.snapshot?.groups || [];
  const t = BG.totals(groups);
  const flagged = (st.recentPosts || []).filter((p) => !p.dismissed && !p.isHidden && BG.evaluatePost(p, pr).verdict === 'bad').length;
  $('requests').textContent = st.snapshot ? t.requests : '–';
  $('posts').textContent = st.snapshot ? t.posts : '–';
  $('flagged').textContent = st.recentPosts && s.scanPosts ? flagged : '–';
  const reports = t.reports + t.autoFlagged;
  $('reports').textContent = st.snapshot && s.scanReports ? reports : '–';
  $('reports').classList.toggle('hot', reports > 0);
  $('requests').classList.toggle('hot', t.requests > 0);
  $('posts').classList.toggle('hot', t.posts > 0);
  $('flagged').classList.toggle('hot', flagged > 0);
  renderStatus(st, flagged, reports);
  renderTodo(groups, flagged, reports);
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

chrome.storage.onChanged.addListener(refresh);
$('version').textContent = 'v' + chrome.runtime.getManifest().version;
refresh();
