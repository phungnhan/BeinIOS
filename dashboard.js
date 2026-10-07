const $ = (id) => document.getElementById(id);
const RULE_BOOLS = ['requireAvatar', 'requireAnswers', 'requireVerified', 'declineDeactivated'];
const RULE_LISTS = { bannedKeywords: false, allowUsernames: true, blockUsernames: true }; // true = danh sách username
const POST_RULE_LISTS = ['bannedKeywords', 'blockedDomains', 'allowedDomains'];
const SETTING_BOOLS = ['active', 'dryRun', 'notify', 'scanPosts', 'autoApprove', 'autoDecline'];
const SETTING_NUMS = ['intervalMin', 'actionDelaySec'];
const LOG_PAGE = 50;
const RECENT_PAGE = 30;

let data = { settings: { ...BG.DEFAULT_SETTINGS }, rules: { ...BG.DEFAULT_RULES }, postRules: { ...BG.DEFAULT_POST_RULES }, state: {}, log: [] };
const TABS = ['overview', 'members', 'content', 'compose', 'stats', 'settings', 'log'];
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
  return (data.state.recentPosts || []).filter((p) => !p.dismissed && !p.isHidden && BG.evaluatePost(p, data.postRules).verdict === 'bad');
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
  const recent = (st.recentPosts || []).length;
  kpi('kpi-flagged', data.settings.scanPosts ? flagged : '–', data.settings.scanPosts ? `trong ${recent} bài mới đã quét` : 'đang tắt quét bài mới', flagged > 0);

  $('kpi-scan').textContent = st.lastScan ? fmtTime(st.lastScan) : '–';
  let sub = st.lastResult?.mode === 'tab' ? 'qua tab Beincom' : st.lastResult?.mode === 'direct' ? 'gọi trực tiếp' : '';
  if (data.settings.active) {
    const alarm = await chrome.alarms.get('beingroup-scan');
    if (alarm) sub += (sub ? ' · ' : '') + 'lần tới ' + new Date(alarm.scheduledTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  $('kpi-scan-sub').textContent = sub;
}

// ---------- Bảng group ----------

function onOff(v) {
  return el('span', { class: 'tag ' + (v ? 'ok' : 'info'), text: v ? 'Bật' : 'Tắt' });
}

function renderGroups() {
  const body = $('groups-body');
  body.replaceChildren();
  const gs = groups();
  if (!gs.length) {
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 8, text: data.state.snapshot ? 'Không có group nào' : 'Chưa có dữ liệu' })));
    return;
  }
  for (const g of gs) {
    const links = el(
      'td',
      { class: 'links' },
      g.canApprove ? el('a', { href: BG.memberRequestsUrl(g), target: '_blank', text: 'Yêu cầu tham gia ↗' }) : null,
      g.approvalCount != null ? el('a', { href: BG.contentApprovalUrl(g.communityId), target: '_blank', text: 'Duyệt bài ↗' }) : null,
      g.communityId ? el('a', { href: BG.groupUrl(g), target: '_blank', text: 'Trang group ↗' }) : null,
    );
    const errors = [g.error, g.approvalError, g.timelineError].filter(Boolean);
    const tr = el(
      'tr',
      { class: g.id === selectedGroupId ? 'selected' : null, title: 'Xem yêu cầu tham gia của group này' },
      el(
        'td',
        { class: 'gcell' + (g.isCommunity ? '' : ` sub lvl-${Math.min(3, Math.max(1, g.level || 1))}`) },
        el('div', { class: 'gname', text: g.name }),
        el('div', { class: 'gpath', text: g.isCommunity ? 'Community' : `Group con của ${g.communityName || 'community'}` }),
        errors.map((x) => el('div', { class: 'tag err', text: x })),
      ),
      el('td', { text: BG.roleLabel(g.roles) }),
      el('td', { class: 'num', text: g.userCount != null ? g.userCount.toLocaleString('vi-VN') : '–' }),
      el('td', {}, g.settings ? onOff(g.settings.isJoinApproval) : '–'),
      el('td', {}, g.settings ? onOff(g.settings.contentApproval) : '–'),
      el('td', { class: 'num' + (g.pendingTotal ? ' count-hot' : ''), text: g.canApprove ? String(g.pendingTotal || 0) : '–' }),
      el('td', { class: 'num' + (g.approvalCount ? ' count-hot' : ''), text: g.approvalCount != null ? String(g.approvalCount) : '–' }),
      links,
    );
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      selectGroup(g.id);
      showTab('members');
    });
    body.append(tr);
  }
}

// ---------- Hộp xác nhận ----------

// extra: phần tử thêm vào hộp (ô lý do...). Trả về true khi bấm nút xác nhận.
function confirmDialog({ title, text, names, okText, danger = false, extra = null, sendNote = 'Sẽ gửi lên Beincom ngay và không hoàn tác được.' }) {
  const d = $('confirm');
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  const items = names.slice(0, 20).map((n) => el('li', { text: n }));
  if (names.length > 20) items.push(el('li', { text: `… và ${names.length - 20} mục khác` }));
  $('confirm-list').replaceChildren(...items);
  $('confirm-extra').replaceChildren(...(extra ? [extra] : []));
  $('confirm-dry').textContent = data.settings.dryRun ? 'Đang bật Chạy thử: chỉ ghi vào nhật ký, không gửi lên Beincom.' : sendNote;
  const ok = $('confirm-ok');
  ok.textContent = okText;
  ok.classList.toggle('decline', danger);
  d.returnValue = '';
  d.showModal();
  return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
}

// Gửi thao tác cho service worker và báo kết quả
async function send(msg, doneText) {
  busy = true;
  renderAll();
  try {
    const r = await chrome.runtime.sendMessage(msg);
    if (r?.status === 'need_login') toast('Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.', 'err');
    else if (r?.status === 'error' && !r.failed) toast(r.message || 'Có lỗi', 'err');
    else if (r?.dryRun) toast(`Chạy thử: đã ghi ${r.dry} thao tác vào nhật ký, chưa gửi lên Beincom.`, 'warn');
    else if (r?.failed) toast(`Xong ${r.ok}, lỗi ${r.failed}: ${r.errors.join('; ')}`, 'err');
    else toast(doneText(r?.ok ?? 0));
    return r;
  } finally {
    busy = false;
    await loadAll();
  }
}

function personName(u) {
  return `${u.fullname || '(không tên)'}${u.username ? ' (@' + u.username + ')' : ''}`;
}

// ---------- Duyệt thành viên ----------

function reviewGroups() {
  return groups().filter((g) => g.canApprove);
}

function currentGroup() {
  const gs = reviewGroups();
  return gs.find((g) => g.id === selectedGroupId) || gs.find((g) => g.requests?.length) || gs[0] || null;
}

function selectGroup(id) {
  if (id === selectedGroupId) return;
  selectedGroupId = id;
  selected.clear();
  writeHash();
  renderGroups();
  renderReview();
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
  currentTab = t;
  for (const s of document.querySelectorAll('main > [data-tab]')) s.hidden = s.dataset.tab !== t;
  for (const b of document.querySelectorAll('#tabs [data-tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.tab === t));
    b.tabIndex = b.dataset.tab === t ? 0 : -1;
  }
  writeHash();
  renderTabRefresh();
  ensureTabData();
  // Biểu đồ cần chiều rộng thật: vẽ lại sau khi tab hiện
  if (t === 'stats') renderStats();
}

// Mỗi tab chỉ tải dữ liệu khi mở lần đầu (đỡ gọi API thừa)
function ensureTabData() {
  if (!data.state.snapshot) return;
  if (currentTab === 'members' && !mem.groupId && memberGroup()) loadMembers(true);
  if (currentTab === 'compose' && !sched.loaded && !sched.loading) loadScheduled();
  if (currentTab === 'stats' && !stats.loaded && !stats.loading && statsGroup()) loadStats();
}

// ---------- Nút "Tải lại" của tab ----------
// Chỉ tải dữ liệu tab đang xem, nhanh hơn "Quét ngay" (quét toàn bộ).

const TAB_REFRESH = {
  overview: { title: 'Tải lại thông tin group, yêu cầu tham gia và số bài chờ duyệt (không đọc bài viết)', run: () => refreshPart('groups') },
  members: {
    title: 'Tải lại yêu cầu tham gia và danh sách / nhật ký vào-rời đang xem',
    run: async () => {
      await refreshPart('groups');
      if (mem.tab === 'list') await loadMembers(true);
      else await loadActivity(true);
    },
  },
  content: { title: 'Tải lại bài chờ duyệt và bài mới đăng (không đọc yêu cầu tham gia)', run: () => refreshPart('content') },
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
  set('badge-content', t.posts + flaggedRecent().length);
  set('badge-compose', sched.loaded ? sched.items.length : 0);
}

function evaluated(g) {
  return (g?.requests || []).map((req) => ({ req, ev: BG.evaluateRequest(req, data.rules, g.questions) }));
}

function avatarOf(u) {
  if (BG.hasAvatar(u)) return el('img', { class: 'avatar', src: u.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  return el('span', { class: 'avatar none', text: (u.fullname || u.username || '?').trim().charAt(0).toUpperCase() });
}

function userCell(u) {
  const badges = el(
    'div',
    { class: 'badges' },
    u.isVerified ? el('span', { class: 'tag ok', text: '✓ Xác minh' }) : null,
    u.premium ? el('span', { class: 'tag accent', text: 'Premium' }) : null,
    u.nft ? el('span', { class: 'tag accent', text: 'NFT' }) : null,
    u.isDeactivated ? el('span', { class: 'tag err', text: 'Bị vô hiệu' }) : null,
  );
  return el(
    'div',
    { class: 'user' },
    avatarOf(u),
    el(
      'div',
      {},
      el('div', { class: 'name', text: u.fullname || u.username || '(không tên)' }),
      u.username ? el('a', { class: 'uname', href: BG.userUrl(u.username), target: '_blank', text: '@' + u.username }) : null,
      badges,
    ),
  );
}

function answersCell(req, g) {
  const answers = BG.answersOf(req, g.questions);
  if (!answers.length) return el('span', { class: 'muted', text: g.settings?.isActiveMembershipQuestions ? '(không có câu trả lời)' : '—' });
  return el(
    'ul',
    { class: 'answers' },
    answers.map((a) =>
      el(
        'li',
        {},
        a.question ? el('div', { class: 'q', text: (a.isRequired ? '* ' : '') + a.question }) : null,
        a.answer.trim()
          ? el('div', { class: 'a', text: a.answer.trim() })
          : el('div', { class: 'a ' + (a.isRequired ? 'missing' : 'muted'), text: a.isRequired ? '(chưa trả lời)' : '(bỏ trống)' }),
      ),
    ),
  );
}

const VERDICT_TAG = { approve: 'ok', review: 'warn', decline: 'err', ok: 'ok', bad: 'err' };

function verdictCell(label, verdict, reasons) {
  return el(
    'td',
    {},
    el('span', { class: 'tag ' + VERDICT_TAG[verdict], text: label }),
    el('ul', { class: 'reasons' }, reasons.map((x) => el('li', { class: x.level, text: x.text }))),
  );
}

// Thanh chọn hàng loạt dùng chung cho ba bảng
function renderBulk({ set, shown, idOf, checkAll, countEl, buttons }) {
  const n = set.size;
  $(countEl).textContent = `Đã chọn ${n}`;
  for (const b of buttons) $(b).disabled = busy || !n;
  const all = $(checkAll);
  all.checked = shown.length > 0 && shown.every((r) => set.has(idOf(r)));
  all.indeterminate = !all.checked && shown.some((r) => set.has(idOf(r)));
  all.disabled = !shown.length;
}

function rowCheckbox(set, id, label, onChange) {
  const cb = el('input', { type: 'checkbox', 'aria-label': 'Chọn ' + label });
  cb.checked = set.has(id);
  cb.addEventListener('change', () => {
    cb.checked ? set.add(id) : set.delete(id);
    onChange();
  });
  return cb;
}

function pruneSelection(set, ids) {
  for (const id of [...set]) if (!ids.has(id)) set.delete(id);
}

function renderReview() {
  const sel = $('group-select');
  const gs = reviewGroups();
  const g = currentGroup();
  sel.replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: `${BG.groupIndent(x)}${x.name} (${x.pendingTotal || 0})` })));
  sel.disabled = !gs.length;

  const rows = evaluated(g);
  const counts = { all: rows.length, approve: 0, review: 0, decline: 0 };
  for (const r of rows) counts[r.ev.verdict]++;
  setCounts('cnt', counts);
  setSegActive('verdict-filter', verdictFilter);

  const note = $('review-note');
  note.textContent = '';
  if (!g) note.textContent = data.state.snapshot ? 'Tài khoản không có quyền duyệt thành viên ở group nào.' : '';
  else if (g.settings && !g.settings.isJoinApproval && !rows.length) note.textContent = 'Group này đang tắt duyệt thành viên: người xin vào được vào luôn, nên thường không có yêu cầu nào.';
  else if (g.pendingTotal > rows.length) note.textContent = `Đang hiện ${rows.length}/${g.pendingTotal} yêu cầu — duyệt bớt rồi quét lại để tải tiếp.`;

  pruneSelection(selected, new Set(rows.map((r) => r.req.id)));
  const shown = rows.filter((r) => verdictFilter === 'all' || r.ev.verdict === verdictFilter);
  const bulk = () => renderBulk({ set: selected, shown, idOf: (r) => r.req.id, checkAll: 'check-all', countEl: 'selected-count', buttons: ['btn-approve-selected', 'btn-decline-selected'] });
  const body = $('requests-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !g ? 'Chưa có dữ liệu' : rows.length ? 'Không có yêu cầu nào trong mục này' : 'Không có yêu cầu tham gia nào đang chờ 🎉';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 6, text: msg })));
  }
  for (const { req, ev } of shown) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selected, req.id, req.user.fullname || req.user.username, bulk)),
        el('td', {}, userCell(req.user)),
        el('td', {}, answersCell(req, g)),
        el('td', { title: fmtTime(req.createdAt), text: ago(req.createdAt) }),
        verdictCell(BG.VERDICT_LABELS[ev.verdict], ev.verdict, ev.reasons),
        el(
          'td',
          { class: 'act' },
          el('button', { class: 'ok-btn sm', disabled: busy, text: 'Duyệt', onclick: () => actMembers('approve', g, [req]) }),
          el('button', { class: 'danger sm', disabled: busy, text: 'Từ chối', onclick: () => actMembers('decline', g, [req]) }),
        ),
      ),
    );
  }
  bulk();
}

async function actMembers(action, g, reqs) {
  if (busy || !reqs.length) return;
  const verb = action === 'approve' ? 'Duyệt' : 'Từ chối';
  const ok = await confirmDialog({
    title: `${verb} ${reqs.length} yêu cầu tham gia?`,
    text: 'Group: ' + groupPath(g),
    names: reqs.map((r) => personName(r.user)),
    okText: verb,
    danger: action === 'decline',
    sendNote: `Sẽ gửi lên Beincom ngay và không hoàn tác được${reqs.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi người)` : ''}.`,
  });
  if (!ok) return;
  const r = await send({ type: 'act', action, groupId: g.id, requestIds: reqs.map((x) => x.id) }, (n) => `${action === 'approve' ? 'Đã duyệt' : 'Đã từ chối'} ${n} yêu cầu.`);
  if (!r?.dryRun) for (const x of reqs) selected.delete(x.id);
  renderReview();
}

// ---------- Thành viên ----------

const MEMBER_PAGE = 50;
const EXPORT_PAGE = 100;
// Danh sách tải theo yêu cầu, chỉ giữ trong trang (không lưu vào storage)
const mem = { groupId: null, key: '', sort: 'joined_at:desc', items: [], adminIds: null, total: null, hasNext: false, nextOffset: 0, loading: false, error: '', tab: 'list', exporting: null };
const act = { groupId: null, items: [], page: 0, hasNext: false, loading: false, error: '', filter: 'all', seenBefore: null };
const selectedMembers = new Set();

function memberGroups() {
  return groups().filter((g) => !g.error && g.communityId);
}

function memberGroup() {
  const gs = memberGroups();
  return gs.find((g) => g.id === mem.groupId) || gs[0] || null;
}

async function loadMembers(reset) {
  const g = memberGroup();
  if (!g || mem.loading) return;
  if (reset) {
    Object.assign(mem, { groupId: g.id, items: [], adminIds: null, total: null, hasNext: false, nextOffset: 0, error: '' });
    selectedMembers.clear();
  }
  mem.loading = true;
  renderMembers();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'members', groupId: g.id, key: mem.key, sort: g.isCommunity ? mem.sort : '', offset: mem.nextOffset, limit: MEMBER_PAGE });
    if (r?.status !== 'ok') mem.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else {
      if (r.adminIds) mem.adminIds = r.adminIds;
      const admins = new Set(mem.adminIds || []);
      mem.items.push(...r.items.map((u) => (g.isCommunity ? { ...u, isAdmin: admins.has(u.id) } : u)));
      Object.assign(mem, { total: r.total, hasNext: r.hasNext, nextOffset: r.nextOffset, error: '' });
    }
  } finally {
    mem.loading = false;
    renderMembers();
  }
}

function memberBadges(u) {
  return el(
    'div',
    { class: 'badges' },
    u.isAdmin ? el('span', { class: 'tag accent', text: 'Admin group' }) : null,
    u.isCommunityAdmin ? el('span', { class: 'tag accent', text: 'Admin community' }) : null,
    u.isVerified ? el('span', { class: 'tag ok', text: '✓ Xác minh' }) : null,
    u.premium ? el('span', { class: 'tag accent', text: 'Premium' }) : null,
    u.nft ? el('span', { class: 'tag accent', text: 'NFT' }) : null,
    u.isDeactivated ? el('span', { class: 'tag err', text: 'Bị vô hiệu' }) : null,
  );
}

function memberCell(u) {
  return el(
    'div',
    { class: 'user' },
    avatarOf(u),
    el('div', {}, el('div', { class: 'name', text: u.fullname || u.username || '(không tên)' }), u.username ? el('a', { class: 'uname', href: BG.userUrl(u.username), target: '_blank', text: '@' + u.username }) : null, memberBadges(u)),
  );
}

function renderMembersHead() {
  const gs = memberGroups();
  const g = memberGroup();
  $('members-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.userCount != null ? ` (${x.userCount.toLocaleString('vi-VN')})` : '') })));
  $('members-group').disabled = !gs.length;
  setSegActive('members-tab', mem.tab);
  $('members-list-pane').hidden = mem.tab !== 'list';
  $('members-activity-pane').hidden = mem.tab !== 'activity';
  return g;
}

function renderMembers() {
  const g = renderMembersHead();
  $('members-sort').hidden = !g?.isCommunity;
  $('members-sort').value = mem.sort;
  if (document.activeElement !== $('members-key')) $('members-key').value = mem.key;
  const shownN = mem.items.length;
  $('members-count').textContent = mem.total != null ? `Đang hiện ${shownN.toLocaleString('vi-VN')}/${mem.total.toLocaleString('vi-VN')}` : mem.loading ? 'Đang tải…' : '';
  $('btn-members-export').disabled = !g || mem.loading || !!mem.exporting;
  if (!mem.exporting) $('btn-members-export').textContent = 'Xuất CSV' + (mem.key ? ' kết quả tìm' : ' toàn bộ');

  const note = $('members-note');
  note.textContent = mem.error || (g && !g.isCommunity ? 'Group con: Beincom không trả ngày vào và số group của thành viên.' : '');
  note.classList.toggle('err-text', !!mem.error);

  pruneSelection(selectedMembers, new Set(mem.items.map((u) => u.id)));
  const canPick = !!g?.canRemove;
  const bulk = () => renderBulk({ set: selectedMembers, shown: canPick ? mem.items : [], idOf: (u) => u.id, checkAll: 'members-check-all', countEl: 'members-selected', buttons: ['btn-members-remove'] });
  $('btn-members-remove').textContent = g?.isCommunity ? 'Xoá đã chọn khỏi community' : 'Xoá đã chọn khỏi group';
  $('btn-members-remove').hidden = !canPick;

  const body = $('members-body');
  body.replaceChildren();
  if (!mem.items.length) {
    const msg = !g ? 'Chưa có dữ liệu' : mem.loading ? 'Đang tải…' : mem.error ? 'Không tải được danh sách' : mem.key ? 'Không tìm thấy ai' : 'Bấm "Tải thêm" để xem danh sách';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: msg })));
  }
  for (const u of mem.items) {
    const actions = [];
    if (g.canAssign) actions.push(el('button', { class: 'ghost sm', disabled: busy, text: u.isAdmin ? 'Gỡ admin' : 'Gán admin', onclick: () => actMembersManage(u.isAdmin ? 'revokeAdmin' : 'assignAdmin', g, [u]) }));
    if (g.canRemove) actions.push(el('button', { class: 'danger sm', disabled: busy, text: 'Xoá', onclick: () => actMembersManage('remove', g, [u]) }));
    if (g.canBan) actions.push(el('button', { class: 'danger sm', disabled: busy, text: 'Cấm', onclick: () => actMembersManage('ban', g, [u]) }));
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, canPick ? rowCheckbox(selectedMembers, u.id, u.fullname || u.username, bulk) : null),
        el('td', {}, memberCell(u)),
        el('td', { title: u.joinedAt ? fmtTime(u.joinedAt) : '', text: u.joinedAt ? ago(u.joinedAt) : '—' }),
        el('td', { class: 'num', text: u.totalJoinedGroup ?? '—' }),
        el('td', { class: 'act' }, actions.length ? actions : el('span', { class: 'muted small', text: 'Không có quyền' })),
      ),
    );
  }
  $('btn-members-more').hidden = !(mem.hasNext || (!mem.items.length && !mem.loading && g && !mem.error && mem.total == null));
  $('btn-members-more').disabled = mem.loading;
  $('btn-members-more').textContent = mem.loading ? 'Đang tải…' : 'Tải thêm';
  bulk();
}

const MANAGE_TEXT = {
  remove: { verb: 'Xoá', title: (n, g) => `Xoá ${n} thành viên khỏi ${g.isCommunity ? 'community' : 'group'}?`, note: 'Họ có thể xin vào lại.', done: 'Đã xoá' },
  assignAdmin: { verb: 'Gán admin', title: (n) => `Gán quyền admin group cho ${n} người?`, note: 'Admin group duyệt được thành viên, bài viết và xoá thành viên.', done: 'Đã gán admin cho' },
  revokeAdmin: { verb: 'Gỡ admin', title: (n) => `Gỡ quyền admin group của ${n} người?`, note: '', done: 'Đã gỡ admin của' },
  ban: { verb: 'Cấm', title: (n) => `Cấm ${n} người khỏi community?`, note: 'Người bị cấm không vào lại được cho tới khi bỏ cấm trên Beincom (Admin panel → Thành viên bị cấm).', done: 'Đã cấm' },
};

async function actMembersManage(action, g, users) {
  if (busy || !users.length) return;
  const t = MANAGE_TEXT[action];
  let select = null;
  if (action === 'ban') select = el('select', {}, Object.entries(BG.BAN_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  const extra = select ? el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do cấm' })), select) : null;
  const ok = await confirmDialog({
    title: t.title(users.length, g),
    text: (action === 'ban' ? 'Community: ' + (g.communityName || g.name) : 'Group: ' + groupPath(g)) + (t.note ? ' — ' + t.note : ''),
    names: users.map(personName),
    okText: t.verb,
    danger: action === 'remove' || action === 'ban',
    extra,
    sendNote: `Sẽ gửi lên Beincom ngay${users.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi người)` : ''}.`,
  });
  if (!ok) return;
  const r = await send(
    { type: 'memberAct', action, groupId: g.id, users: users.map((u) => ({ id: u.id, username: u.username, fullname: u.fullname })), reason: select?.value },
    (n) => `${t.done} ${n} người.`,
  );
  const done = new Set(r?.done || []);
  if (done.size && mem.groupId === g.id) {
    if (action === 'remove' || action === 'ban') {
      mem.items = mem.items.filter((u) => !done.has(u.id));
      if (mem.total != null) mem.total = Math.max(0, mem.total - done.size);
      for (const id of done) selectedMembers.delete(id);
    } else {
      mem.items = mem.items.map((u) => (done.has(u.id) ? { ...u, isAdmin: action === 'assignAdmin' } : u));
    }
  }
  renderMembers();
}

// Xuất CSV: tải lần lượt từng trang 100 người, có thể dừng giữa chừng
async function exportMembers() {
  const g = memberGroup();
  if (!g) return;
  if (mem.exporting) {
    mem.exporting.cancel = true;
    return;
  }
  const est = mem.total ?? g.userCount;
  if (est > 2000 && !confirm(`Tải ${est.toLocaleString('vi-VN')} thành viên (khoảng ${Math.ceil(est / EXPORT_PAGE)} lần gọi, vài phút)? Bấm lại nút để dừng.`)) return;
  const job = { cancel: false };
  mem.exporting = job;
  const btn = $('btn-members-export');
  const rows = [];
  let offset = 0;
  let adminIds = null;
  let error = '';
  try {
    for (;;) {
      btn.textContent = `Đang tải ${rows.length.toLocaleString('vi-VN')}${est ? '/' + est.toLocaleString('vi-VN') : ''}… (bấm để dừng)`;
      const r = await chrome.runtime.sendMessage({ type: 'members', groupId: g.id, key: mem.key, sort: g.isCommunity ? 'joined_at:desc' : '', offset, limit: EXPORT_PAGE });
      if (r?.status !== 'ok') {
        error = r?.message || 'Có lỗi';
        break;
      }
      if (r.adminIds) adminIds = new Set(r.adminIds);
      rows.push(...r.items.map((u) => (g.isCommunity && adminIds ? { ...u, isAdmin: adminIds.has(u.id) } : u)));
      offset = r.nextOffset;
      if (!r.hasNext || !r.items.length || job.cancel) break;
      await new Promise((res) => setTimeout(res, 300));
    }
  } finally {
    mem.exporting = null;
    renderMembers();
  }
  if (rows.length) {
    const yn = (v) => (v ? 'Có' : '');
    const csv = BG.toCsv(rows, [
      { label: 'Họ tên', key: 'fullname' },
      { label: 'Username', key: 'username' },
      { label: 'User ID', key: 'id' },
      { label: 'Vào lúc', get: (u) => u.joinedAt || '' },
      { label: 'Admin group', get: (u) => yn(u.isAdmin) },
      { label: 'Admin community', get: (u) => yn(u.isCommunityAdmin) },
      { label: 'Xác minh', get: (u) => yn(u.isVerified) },
      { label: 'Premium', get: (u) => yn(u.premium) },
      { label: 'NFT', get: (u) => yn(u.nft) },
      { label: 'Số group đã vào', get: (u) => u.totalJoinedGroup ?? '' },
    ]);
    const slug = BG.norm(g.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
    download(`beingroup-thanh-vien-${slug}-${BG.vnDay()}.csv`, csv, 'text/csv;charset=utf-8');
  }
  if (error) toast(`Dừng ở ${rows.length} người vì lỗi: ${error}`, 'err');
  else if (job.cancel) toast(`Đã dừng, xuất ${rows.length} người đã tải.`, 'warn');
  else toast(`Đã xuất ${rows.length} thành viên.`);
}

// ---------- Vào / rời gần đây ----------

async function loadActivity(reset) {
  const g = memberGroup();
  if (!g || act.loading) return;
  if (reset || act.groupId !== g.id) {
    const { activitySeen = {} } = await chrome.storage.local.get('activitySeen');
    Object.assign(act, { groupId: g.id, items: [], page: 0, hasNext: false, error: '', seenBefore: activitySeen[g.id] || null });
  }
  act.loading = true;
  renderActivity();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'activity', groupId: g.id, page: act.page + 1 });
    if (r?.status !== 'ok') act.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else {
      act.items.push(...r.items);
      act.page++;
      act.hasNext = r.hasNext;
      // Ghi nhớ sự kiện mới nhất đã xem: lần mở sau sẽ đánh dấu "Mới" cho sự kiện đến sau
      if (act.page === 1 && r.items[0]?.time) {
        const { activitySeen = {} } = await chrome.storage.local.get('activitySeen');
        await chrome.storage.local.set({ activitySeen: { ...activitySeen, [g.id]: r.items[0].time } });
      }
    }
  } finally {
    act.loading = false;
    renderActivity();
  }
}

function renderActivity() {
  renderMembersHead();
  setSegActive('activity-filter', act.filter);
  const items = act.items.filter((a) => act.filter === 'all' || a.kind === act.filter);
  const d1 = BG.activitySummary(act.items, 24);
  const d7 = BG.activitySummary(act.items, 24 * 7);
  const oldest = act.items.at(-1)?.time;
  $('activity-summary').textContent = act.items.length
    ? `24 giờ qua: +${d1.joined} vào, −${d1.left} rời · 7 ngày: +${d7.joined} / −${d7.left}` + (act.hasNext && oldest && Date.now() - new Date(oldest) < 7 * 864e5 ? ` (mới tải tới ${ago(oldest)})` : '')
    : '';
  $('activity-note').textContent = act.error || (act.seenBefore ? `Viền tím: sự kiện mới từ lần xem trước (${fmtTime(act.seenBefore)}).` : '');
  const body = $('activity-body');
  body.replaceChildren();
  if (!items.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: act.loading ? 'Đang tải…' : act.error ? 'Không tải được nhật ký' : act.items.length ? 'Không có sự kiện nào trong mục này' : 'Chưa có sự kiện' })));
  const KIND_TAG = { in: 'ok', out: 'err', role: 'accent', other: 'info' };
  for (const a of items) {
    const isNew = act.seenBefore && a.time && a.time > act.seenBefore;
    const person = (p) => (p ? el('span', {}, p.fullname || p.username, p.username ? el('a', { class: 'muted small', href: BG.userUrl(p.username), target: '_blank', text: ' @' + p.username }) : null) : '—');
    body.append(
      el(
        'tr',
        { class: isNew ? 'new-row' : null },
        el('td', { title: fmtTime(a.time), text: ago(a.time) }),
        el('td', {}, el('span', { class: 'tag ' + KIND_TAG[a.kind], text: a.label })),
        el('td', {}, person(a.user)),
        el('td', {}, a.actor ? person(a.actor) : el('span', { class: 'muted', text: 'Tự làm' })),
        el('td', { class: 'note', text: a.change }),
      ),
    );
  }
  $('btn-activity-more').hidden = !act.hasNext;
  $('btn-activity-more').disabled = act.loading;
  $('btn-activity-more').textContent = act.loading ? 'Đang tải…' : 'Tải thêm';
}

// ---------- Ô bài viết ----------

function postAuthor(a) {
  return el(
    'div',
    { class: 'user' },
    avatarOf(a),
    el('div', {}, el('div', { class: 'name', text: a.fullname || a.username || '(không tên)' }), a.username ? el('a', { class: 'uname', href: BG.userUrl(a.username), target: '_blank', text: '@' + a.username }) : null),
  );
}

function postContent(p) {
  const text = el('div', { class: 'post-text clamp', title: 'Bấm để xem hết / thu gọn', text: p.text || '(không có chữ)' });
  text.addEventListener('click', () => text.classList.toggle('clamp'));
  const meta = el(
    'div',
    { class: 'post-meta' },
    p.type === 'ARTICLE' ? el('span', { class: 'tag accent', text: 'Article' }) : null,
    p.media.images ? el('span', { class: 'tag info', text: `🖼 ${p.media.images} ảnh` }) : null,
    p.media.videos ? el('span', { class: 'tag info', text: `🎬 ${p.media.videos} video` }) : null,
    p.media.files ? el('span', { class: 'tag info', text: `📎 ${p.media.files} tệp` }) : null,
    p.link ? el('a', { class: 'tag info', href: p.link, target: '_blank', rel: 'noreferrer', text: '🔗 ' + (BG.linkDomains(p.link)[0] || 'link') }) : null,
    p.full === false ? el('span', { class: 'tag warn', title: 'Chưa tải được nội dung đầy đủ, quy tắc chỉ xét phần này', text: 'Mới có 500 ký tự đầu' }) : null,
    p.commentsCount ? el('span', { class: 'tag info', text: `💬 ${p.commentsCount}` }) : null,
  );
  return el('div', {}, p.title ? el('div', { class: 'post-title', text: p.title }) : null, text, meta);
}

function postGroups(p, adminIds) {
  return el(
    'ul',
    { class: 'glist' },
    p.groups.map((x) =>
      el('li', {}, x.name || x.id, x.approval === 'WAITING_APPROVAL' ? el('span', { class: 'muted', text: ' · chờ duyệt' }) : null, adminIds && !adminIds.has(x.id) ? el('span', { class: 'muted', text: ' · không quản trị' }) : null),
    ),
  );
}

// ---------- Duyệt bài ----------

function approvalGroups() {
  return groups().filter((g) => g.approvalCount != null);
}

function currentCommunity() {
  const gs = approvalGroups();
  return gs.find((g) => g.id === selectedCommunityId) || gs.find((g) => g.approvals?.length) || gs[0] || null;
}

function renderApproval() {
  const gs = approvalGroups();
  const g = currentCommunity();
  const sel = $('community-select');
  sel.replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: `${x.communityName || x.name} (${x.approvalCount || 0})` })));
  sel.disabled = !gs.length;
  const open = $('approval-open');
  open.hidden = !g;
  if (g) open.href = BG.contentApprovalUrl(g.communityId);

  const rows = (g?.approvals || []).map((p) => ({ p, ev: BG.evaluatePost(p, data.postRules) }));
  const counts = { all: rows.length, ok: 0, review: 0, bad: 0 };
  for (const r of rows) counts[r.ev.verdict]++;
  setCounts('acnt', counts);
  setSegActive('approval-filter', approvalFilter);

  const note = $('approval-note');
  note.textContent = '';
  if (!gs.length) note.textContent = data.state.snapshot ? 'Không community nào bạn quản trị group gốc đang bật duyệt bài.' : '';
  else if (g?.approvalError) note.textContent = g.approvalError;
  else if (g && g.approvalCount > rows.length) note.textContent = `Đang hiện ${rows.length}/${g.approvalCount} bài — duyệt bớt rồi quét lại để tải tiếp.`;

  pruneSelection(selectedPosts, new Set(rows.map((r) => r.p.id)));
  const shown = rows.filter((r) => approvalFilter === 'all' || r.ev.verdict === approvalFilter);
  const bulk = () => renderBulk({ set: selectedPosts, shown, idOf: (r) => r.p.id, checkAll: 'approval-check-all', countEl: 'approval-selected', buttons: ['btn-approve-posts', 'btn-reject-posts'] });
  const body = $('approval-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !g ? 'Chưa có dữ liệu' : rows.length ? 'Không có bài nào trong mục này' : 'Không có bài nào đang chờ duyệt 🎉';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p, ev } of shown) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selectedPosts, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p)),
        el('td', { title: fmtTime(p.submittedAt), text: ago(p.submittedAt) }),
        verdictCell(BG.POST_VERDICT_LABELS.approval[ev.verdict], ev.verdict, ev.reasons),
        el(
          'td',
          { class: 'act' },
          el('button', { class: 'ok-btn sm', disabled: busy, text: 'Duyệt', onclick: () => actApproval('approve', g, [p]) }),
          el('button', { class: 'danger sm', disabled: busy, text: 'Từ chối', onclick: () => actApproval('reject', g, [p]) }),
        ),
      ),
    );
  }
  bulk();
}

function snippet(p) {
  const t = (p.title || p.text || '').replace(/\s+/g, ' ').trim();
  return `${p.actor.fullname || p.actor.username || '?'}: ${t.length > 70 ? t.slice(0, 70) + '…' : t || '(không có chữ)'}`;
}

async function actApproval(action, g, posts) {
  if (busy || !posts.length) return;
  const reject = action === 'reject';
  let reasonBox = null;
  if (reject) {
    reasonBox = el('textarea', { rows: 3, placeholder: 'Vd: Bài có link quảng cáo, vi phạm nội quy nhóm' });
    // Gợi ý lý do từ quy tắc khi chỉ từ chối một bài
    if (posts.length === 1) {
      const bad = BG.evaluatePost(posts[0], data.postRules).reasons.filter((x) => x.level !== 'ok');
      if (bad.length) reasonBox.value = bad.map((x) => x.text).join('; ');
    }
  }
  const extra = reject ? el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do từ chối' }), el('br'), el('span', { class: 'muted small', text: 'Gửi cho người đăng. Có thể để trống.' })), reasonBox) : null;
  const ok = await confirmDialog({
    title: `${reject ? 'Từ chối' : 'Duyệt'} ${posts.length} bài?`,
    text: 'Community: ' + (g.communityName || g.name),
    names: posts.map(snippet),
    okText: reject ? 'Từ chối' : 'Duyệt',
    danger: reject,
    extra,
  });
  if (!ok) return;
  const r = await send({ type: 'approvalAct', action, groupId: g.id, contentIds: posts.map((p) => p.id), reason: reasonBox?.value || '' }, (n) => `${reject ? 'Đã từ chối' : 'Đã duyệt'} ${n} bài.`);
  if (!r?.dryRun) for (const p of posts) selectedPosts.delete(p.id);
  renderApproval();
}

// ---------- Bài mới đăng ----------

function recentRows() {
  return (data.state.recentPosts || []).map((p) => ({ p, ev: BG.evaluatePost(p, data.postRules) }));
}

function inFilter(r, f) {
  if (f === 'hidden') return r.p.isHidden;
  if (f === 'dismissed') return r.p.dismissed && !r.p.isHidden;
  if (f === 'all') return !r.p.isHidden;
  return !r.p.isHidden && !r.p.dismissed && r.ev.verdict !== 'ok'; // flagged
}

function renderRecent() {
  const rows = recentRows();
  setCounts('rcnt', Object.fromEntries(['flagged', 'all', 'dismissed', 'hidden'].map((f) => [f, rows.filter((r) => inFilter(r, f)).length])));
  setSegActive('recent-filter', recentFilter);
  const adminIds = new Set(groups().map((g) => g.id));

  const note = $('recent-note');
  if (!data.settings.scanPosts) note.textContent = 'Đang tắt "Quét bài mới đăng" ở phần Cài đặt.';
  else if (!data.state.recentPosts) note.textContent = data.state.snapshot ? 'Chưa quét bài mới — bấm Quét ngay.' : '';
  else note.textContent = 'Xoá bài: chỉ với bài của chính bạn (Beincom không cho admin xoá bài người khác). Ẩn bài: gỡ bài người khác khỏi các group bạn quản trị; addon chưa hiện lại được. Bỏ qua: chỉ ẩn khỏi danh sách này.';

  pruneSelection(selectedRecent, new Set(rows.map((r) => r.p.id)));
  const filtered = rows.filter((r) => inFilter(r, recentFilter));
  const shown = filtered.slice(0, recentLimit);
  const hideable = recentFilter !== 'hidden';
  const bulk = () => renderBulk({ set: selectedRecent, shown, idOf: (r) => r.p.id, checkAll: 'recent-check-all', countEl: 'recent-selected', buttons: hideable ? ['btn-dismiss-posts', 'btn-hide-posts'] : [] });
  $('btn-dismiss-posts').textContent = recentFilter === 'dismissed' ? 'Hiện lại đã chọn' : 'Bỏ qua đã chọn';
  $('btn-hide-posts').hidden = recentFilter === 'hidden';
  $('btn-dismiss-posts').hidden = recentFilter === 'hidden';

  const body = $('recent-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !data.state.recentPosts ? 'Chưa có dữ liệu' : recentFilter === 'flagged' ? 'Không có bài nào cần xử lý 🎉' : 'Không có bài nào trong mục này';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p, ev } of shown) {
    const actions = [el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' })];
    if (!p.isHidden) {
      actions.push(
        p.dismissed
          ? el('button', { class: 'ghost sm', disabled: busy, text: 'Hiện lại', onclick: () => dismissPosts([p], false) })
          : el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => dismissPosts([p], true) }),
        // Beincom chỉ cho xoá bài của chính mình; bài người khác thì admin ẩn khỏi group
        isMine(p)
          ? el('button', { class: 'danger sm', disabled: busy, text: 'Xoá bài', onclick: () => deletePosts([p]) })
          : el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn bài', title: 'Beincom không cho admin xoá bài của người khác; ẩn bài sẽ gỡ bài khỏi các group bạn quản trị', onclick: () => hidePosts([p]) }),
      );
    }
    body.append(
      el(
        'tr',
        { class: p.isHidden || p.dismissed ? 'muted-row' : null },
        el('td', { class: 'cb' }, p.isHidden ? null : rowCheckbox(selectedRecent, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p, adminIds)),
        el('td', { title: fmtTime(p.publishedAt), text: ago(p.publishedAt) }),
        p.isHidden ? el('td', {}, el('span', { class: 'tag info', text: 'Đã ẩn' })) : verdictCell(BG.POST_VERDICT_LABELS.published[ev.verdict], ev.verdict, ev.reasons),
        el('td', { class: 'act' }, actions),
      ),
    );
  }
  $('btn-recent-more').hidden = filtered.length <= recentLimit;
  bulk();
}

function isMine(p) {
  return !!p.actor?.id && p.actor.id === data.state.me?.id;
}

async function deletePosts(posts) {
  if (busy || !posts.length) return;
  const ok = await confirmDialog({
    title: `Xoá ${posts.length} bài của bạn?`,
    text: 'Bài bị xoá vĩnh viễn trên Beincom, ở mọi group bài được đăng vào.',
    names: posts.map(snippet),
    okText: 'Xoá bài',
    danger: true,
    sendNote: 'Sẽ gửi lên Beincom ngay và không hoàn tác được.',
  });
  if (!ok) return;
  const r = await send({ type: 'postAct', action: 'delete', contentIds: posts.map((p) => p.id) }, (n) => `Đã xoá ${n} bài.`);
  if (!r?.dryRun) for (const p of posts) selectedRecent.delete(p.id);
  renderRecent();
}

async function dismissPosts(posts, dismiss) {
  if (busy || !posts.length) return;
  await chrome.runtime.sendMessage({ type: 'postAct', action: dismiss ? 'dismiss' : 'undismiss', contentIds: posts.map((p) => p.id) });
  for (const p of posts) selectedRecent.delete(p.id);
  await loadAll();
}

async function hidePosts(posts) {
  if (busy || !posts.length) return;
  const select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  // Chọn sẵn "Spam" khi bài có link bị cấm
  select.value = posts.some((p) => BG.evaluatePost(p, data.postRules).reasons.some((x) => /link/.test(x.text))) ? 'SPAM' : 'OTHERS';
  const extra = el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select);
  const ok = await confirmDialog({
    title: `Ẩn ${posts.length} bài?`,
    text: 'Bài sẽ bị ẩn khỏi các group bạn quản trị mà bài được đăng vào.',
    names: posts.map(snippet),
    okText: 'Ẩn bài',
    danger: true,
    extra,
    sendNote: 'Sẽ gửi lên Beincom ngay. Addon chưa hiện lại được bài đã ẩn.',
  });
  if (!ok) return;
  const r = await send({ type: 'postAct', action: 'hide', contentIds: posts.map((p) => p.id), reasonType: select.value }, (n) => `Đã ẩn ${n} bài.`);
  if (!r?.dryRun) for (const p of posts) selectedRecent.delete(p.id);
  renderRecent();
}

// ---------- Đăng bài ----------

const compose = { groupIds: new Set(), draftLoaded: false };
const sched = { items: [], errors: [], loading: false, loaded: false, error: '' };
let draftTimer = 0;

const pad = (n) => String(n).padStart(2, '0');
// Giá trị cho <input type="datetime-local"> theo giờ máy
function toLocalInput(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nextQuarter(hours = 1) {
  const d = new Date(Date.now() + hours * 3600e3);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

function composeWhen() {
  return document.querySelector('input[name="compose-when"]:checked')?.value || 'now';
}

function readCompose() {
  const later = composeWhen() === 'later';
  const important = $('compose-important').checked;
  return {
    groupIds: groups().map((g) => g.id).filter((id) => compose.groupIds.has(id)),
    content: $('compose-text').value,
    setting: {
      canComment: $('compose-canComment').checked,
      canReact: $('compose-canReact').checked,
      isImportant: important,
      importantExpiredAt: important && $('compose-important-until').value ? new Date($('compose-important-until').value).toISOString() : null,
    },
    scheduledAt: later && $('compose-at').value ? new Date($('compose-at').value).toISOString() : later ? 'invalid' : null,
  };
}

function renderComposeGroups() {
  const box = $('compose-groups');
  const gs = groups().filter((g) => !g.error);
  box.replaceChildren();
  if (!gs.length) box.append(el('div', { class: 'muted small', text: data.state.snapshot ? 'Không có group nào' : 'Chưa quét' }));
  for (const g of gs) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = compose.groupIds.has(g.id);
    cb.addEventListener('change', () => {
      cb.checked ? compose.groupIds.add(g.id) : compose.groupIds.delete(g.id);
      updateCompose();
      saveDraft();
    });
    box.append(el('label', { class: g.isCommunity ? null : 'sub' }, cb, el('span', { text: (g.isCommunity ? '' : '└ ') + g.name }), g.settings?.contentApproval ? el('span', { class: 'tag info', title: 'Group bật duyệt bài', text: 'duyệt bài' }) : null));
  }
}

function updateCompose() {
  const c = readCompose();
  const len = c.content.trim().length;
  $('compose-count').textContent = `${len}/${BG.POST_MAX}`;
  $('compose-count').classList.toggle('over', len > BG.POST_MAX);
  // Tự chấm bài theo quy tắc bài viết của chính mình trước khi đăng
  const chk = $('compose-check');
  chk.className = 'small';
  chk.textContent = '';
  if (len) {
    const ev = BG.evaluatePost({ title: '', text: c.content, link: '' }, data.postRules);
    if (ev.verdict !== 'ok') {
      chk.classList.add(ev.verdict === 'bad' ? 'bad' : 'warn');
      chk.textContent = '⚠ ' + ev.reasons.map((r) => r.text).join('; ');
    }
  }
  const later = composeWhen() === 'later';
  $('compose-at').disabled = !later;
  if (later && !$('compose-at').value) $('compose-at').value = toLocalInput(nextQuarter());
  $('compose-important-until').disabled = !$('compose-important').checked;
  if ($('compose-important').checked && !$('compose-important-until').value) $('compose-important-until').value = toLocalInput(nextQuarter(24 * 3));
  const btn = $('btn-compose');
  btn.textContent = later ? 'Hẹn giờ đăng' : 'Đăng ngay';
  btn.disabled = busy || !c.groupIds.length || !len;
  renderPreview();
}

function draftValue() {
  return {
    text: $('compose-text').value,
    groupIds: [...compose.groupIds],
    canComment: $('compose-canComment').checked,
    canReact: $('compose-canReact').checked,
    important: $('compose-important').checked,
    importantUntil: $('compose-important-until').value,
    when: composeWhen(),
    at: $('compose-at').value,
  };
}

function applyDraft(d) {
  $('compose-text').value = d.text || '';
  compose.groupIds = new Set(d.groupIds || []);
  $('compose-canComment').checked = d.canComment !== false;
  $('compose-canReact').checked = d.canReact !== false;
  $('compose-important').checked = !!d.important;
  $('compose-important-until').value = d.importantUntil || '';
  for (const r of document.querySelectorAll('input[name="compose-when"]')) r.checked = r.value === (d.when || 'now');
  $('compose-at').value = d.at || '';
  renderComposeGroups();
  updateCompose();
}

// Lưu nháp trong trình duyệt để đóng Dashboard không mất bài đang viết
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    await chrome.storage.local.set({ composeDraft: draftValue() });
    $('compose-saved').textContent = 'Đã lưu nháp ✓';
  }, 600);
}

async function loadDraftOnce() {
  if (compose.draftLoaded) return;
  compose.draftLoaded = true;
  const { composeDraft } = await chrome.storage.local.get('composeDraft');
  if (composeDraft) applyDraft(composeDraft);
}

async function submitCompose() {
  if (busy) return;
  const c = readCompose();
  if (c.scheduledAt === 'invalid') return toast('Chưa chọn giờ hẹn', 'err');
  const err = BG.validateCompose(c);
  if (err) return toast(err, 'err');
  const targets = groups().filter((g) => compose.groupIds.has(g.id));
  const later = !!c.scheduledAt;
  const text = c.content.trim();
  const ev = BG.evaluatePost({ title: '', text, link: '' }, data.postRules);
  const warn = ev.verdict === 'ok' ? '' : '⚠ Bài dính quy tắc bài viết của bạn: ' + ev.reasons.map((r) => r.text).join('; ') + '. ';
  const ok = await confirmDialog({
    title: later ? `Hẹn giờ đăng lúc ${fmtTime(c.scheduledAt)}?` : `Đăng bài vào ${targets.length} group?`,
    text: text.length > 200 ? text.slice(0, 200) + '…' : text,
    names: targets.map((g) => groupPath(g) + (g.settings?.contentApproval ? ' (group bật duyệt bài)' : '')),
    okText: later ? 'Hẹn giờ' : 'Đăng',
    sendNote: warn + (later ? 'Sẽ gửi lên Beincom ngay; tới giờ Beincom tự đăng.' : 'Sẽ đăng ngay lên Beincom.'),
  });
  if (!ok) return;
  const r = await send({ type: 'compose', ...c }, () => (later ? `Đã hẹn giờ đăng lúc ${fmtTime(c.scheduledAt)}.` : 'Đã đăng bài.'));
  if (r?.status === 'ok' && !r.dryRun) {
    $('compose-text').value = '';
    await chrome.storage.local.set({ composeDraft: draftValue() });
    $('compose-saved').textContent = '';
    if (later) loadScheduled();
  }
  updateCompose();
}

// ---------- Trình soạn thảo ----------
// Thanh công cụ chèn đúng ký hiệu markdown mà trình soạn thảo Beincom dùng:
// **đậm**, _nghiêng_, ~~gạch~~, `code`, ### tiêu đề, - danh sách, 1. danh sách, > trích dẫn, ---, [chữ](link)

let editorMode = 'write';

// Thay đoạn [from, to) bằng `text` qua execCommand để Ctrl+Z hoàn tác được; chọn lại [selFrom, selTo)
function editReplace(ta, from, to, text, selFrom, selTo) {
  ta.focus();
  ta.setSelectionRange(from, to);
  const ok = document.execCommand && document.execCommand('insertText', false, text);
  if (!ok) {
    ta.setRangeText(text, from, to, 'end');
    ta.dispatchEvent(new Event('input'));
  }
  ta.setSelectionRange(selFrom, selTo);
}

// Bọc vùng chọn; bấm lại khi đã bọc thì bỏ bọc
function mdWrap(before, after, placeholder) {
  const ta = $('compose-text');
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  if (v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after && e > s) {
    editReplace(ta, s - before.length, e + after.length, v.slice(s, e), s - before.length, e - before.length);
    return;
  }
  const sel = v.slice(s, e) || placeholder;
  editReplace(ta, s, e, before + sel + after, s + before.length, s + before.length + sel.length);
}

// Thêm / bỏ tiền tố cho các dòng đang chọn (danh sách, trích dẫn, tiêu đề)
function mdLines(kind) {
  const ta = $('compose-text');
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const start = v.lastIndexOf('\n', s - 1) + 1;
  let end = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
  if (end < 0) end = v.length;
  const lines = v.slice(start, end).split('\n');
  const RE = { ul: /^- /, ol: /^\d+\. /, quote: /^> /, heading: /^### / }[kind];
  const has = lines.every((l) => RE.test(l));
  const out = lines.map((l, i) => {
    if (has) return l.replace(RE, '');
    const bare = l.replace(/^(- |\d+\. |> |#{1,6} )/, '');
    return (kind === 'ol' ? `${i + 1}. ` : { ul: '- ', quote: '> ', heading: '### ' }[kind]) + bare;
  });
  const text = out.join('\n');
  editReplace(ta, start, end, text, start, start + text.length);
}

function mdLink() {
  const ta = $('compose-text');
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const url = prompt('Địa chỉ link (bắt đầu bằng https://):', 'https://');
  if (!url || !/^https?:\/\/\S+$/.test(url.trim())) return;
  const label = v.slice(s, e) || 'chữ hiển thị';
  const text = `[${label}](${url.trim()})`;
  editReplace(ta, s, e, text, s + 1, s + 1 + label.length);
}

function mdHr() {
  const ta = $('compose-text');
  const { selectionStart: s, value: v } = ta;
  const pre = s && v[s - 1] !== '\n' ? '\n' : '';
  const text = pre + '---\n';
  editReplace(ta, s, s, text, s + text.length, s + text.length);
}

const MD_ACTIONS = {
  bold: () => mdWrap('**', '**', 'chữ đậm'),
  italic: () => mdWrap('_', '_', 'chữ nghiêng'),
  strike: () => mdWrap('~~', '~~', 'chữ gạch'),
  code: () => mdWrap('`', '`', 'code'),
  heading: () => mdLines('heading'),
  ul: () => mdLines('ul'),
  ol: () => mdLines('ol'),
  quote: () => mdLines('quote'),
  hr: mdHr,
  link: mdLink,
};

function setEditorMode(mode) {
  editorMode = mode;
  setSegActive('editor-mode', mode);
  $('editor-body').classList.toggle('split', mode === 'split');
  $('compose-text').hidden = mode === 'preview';
  $('compose-preview').hidden = mode === 'write';
  for (const b of document.querySelectorAll('.editor-toolbar > button')) b.disabled = mode === 'preview';
  renderPreview();
}

function renderPreview() {
  if (editorMode === 'write') return;
  // renderMarkdown đã mã hoá HTML và chỉ sinh thẻ an toàn
  $('compose-preview').innerHTML = BG.renderMarkdown($('compose-text').value);
}

// ---------- Mẫu bài ----------

function renderTemplates() {
  const sel = $('tpl-select');
  const cur = sel.value;
  const list = data.templates || [];
  sel.replaceChildren(el('option', { value: '', text: list.length ? '— Chọn mẫu bài —' : '— Chưa có mẫu —' }), ...list.map((t) => el('option', { value: t.id, text: t.name })));
  sel.value = list.some((t) => t.id === cur) ? cur : '';
  $('btn-tpl-use').disabled = !sel.value;
  $('btn-tpl-delete').disabled = !sel.value;
}

async function saveTemplate() {
  const d = draftValue();
  if (!d.text.trim()) return toast('Bài chưa có nội dung để lưu làm mẫu', 'err');
  const name = prompt('Tên mẫu bài:', d.text.trim().split('\n')[0].slice(0, 40));
  if (!name?.trim()) return;
  const list = data.templates || [];
  const existing = list.find((t) => t.name === name.trim());
  const tpl = { id: existing?.id || 'tpl' + Date.now(), name: name.trim(), text: d.text, groupIds: d.groupIds, canComment: d.canComment, canReact: d.canReact };
  await chrome.storage.local.set({ templates: existing ? list.map((t) => (t.id === tpl.id ? tpl : t)) : [...list, tpl] });
  $('tpl-select').value = tpl.id;
  toast(`Đã lưu mẫu "${tpl.name}".`);
}

function useTemplate() {
  const t = (data.templates || []).find((x) => x.id === $('tpl-select').value);
  if (!t) return;
  if ($('compose-text').value.trim() && !confirm('Thay nội dung đang viết bằng mẫu này?')) return;
  applyDraft({ ...draftValue(), text: t.text, groupIds: t.groupIds, canComment: t.canComment, canReact: t.canReact });
  saveDraft();
}

async function deleteTemplate() {
  const t = (data.templates || []).find((x) => x.id === $('tpl-select').value);
  if (!t || !confirm(`Xoá mẫu "${t.name}"?`)) return;
  await chrome.storage.local.set({ templates: (data.templates || []).filter((x) => x.id !== t.id) });
}

// ---------- Bài đã hẹn giờ ----------

async function loadScheduled() {
  if (sched.loading) return;
  sched.loading = true;
  renderScheduled();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'scheduled' });
    if (r?.status !== 'ok') sched.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else Object.assign(sched, { items: r.items, errors: r.errors || [], error: '', loaded: true });
  } finally {
    sched.loading = false;
    renderScheduled();
  }
}

function renderScheduled() {
  renderBadges();
  $('scheduled-note').textContent = sched.loading ? 'Đang tải…' : sched.error || sched.errors.join('; ') || (sched.loaded ? `${sched.items.length} bài đang chờ (theo các community bạn quản trị group gốc)` : '');
  const body = $('scheduled-body');
  body.replaceChildren();
  if (!sched.items.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 6, text: sched.loading ? 'Đang tải…' : sched.loaded ? 'Không có bài nào đang hẹn giờ' : 'Bấm "Tải lại" để xem' })));
  for (const p of sched.items) {
    const failed = p.status === 'SCHEDULE_FAILED';
    body.append(
      el(
        'tr',
        {},
        el('td', { title: fmtTime(p.scheduledAt) }, el('b', { text: fmtTime(p.scheduledAt) })),
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p)),
        el('td', {}, el('span', { class: 'tag ' + (failed ? 'err' : 'info'), text: BG.CONTENT_STATUS[p.status] || p.status || '—' })),
        el(
          'td',
          { class: 'act' },
          el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' }),
          el('button', { class: 'ghost sm', disabled: busy, text: 'Đổi giờ', onclick: () => reschedulePost(p) }),
          el('button', { class: 'danger sm', disabled: busy, text: 'Huỷ', onclick: () => cancelPost(p) }),
        ),
      ),
    );
  }
}

async function reschedulePost(p) {
  const input = el('input', { type: 'datetime-local', 'aria-label': 'Giờ đăng mới' });
  input.value = toLocalInput(p.scheduledAt && new Date(p.scheduledAt) > new Date() ? new Date(p.scheduledAt) : nextQuarter());
  const ok = await confirmDialog({
    title: 'Đổi giờ đăng?',
    text: 'Giờ hiện tại: ' + fmtTime(p.scheduledAt),
    names: [snippet(p)],
    okText: 'Đổi giờ',
    extra: el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Giờ đăng mới' })), input),
    sendNote: 'Sẽ gửi lên Beincom ngay.',
  });
  if (!ok || !input.value) return;
  const at = new Date(input.value).toISOString();
  const r = await send({ type: 'scheduleAct', action: 'reschedule', contentId: p.id, scheduledAt: at, snippet: snippet(p), groupName: p.groups.map((g) => g.name).join(', ') }, () => `Đã đổi giờ đăng sang ${fmtTime(at)}.`);
  if (r?.status === 'ok' && !r.dryRun) loadScheduled();
}

async function cancelPost(p) {
  const ok = await confirmDialog({
    title: 'Huỷ bài hẹn giờ?',
    text: 'Bài sẽ bị xoá và không được đăng. Chỉ huỷ được bài của chính bạn.',
    names: [snippet(p)],
    okText: 'Huỷ bài',
    danger: true,
  });
  if (!ok) return;
  const r = await send({ type: 'scheduleAct', action: 'cancel', contentId: p.id, snippet: snippet(p), groupName: p.groups.map((g) => g.name).join(', ') }, () => 'Đã huỷ bài hẹn giờ.');
  if (r?.status === 'ok' && !r.dryRun) loadScheduled();
}

// ---------- Thống kê ----------

const stats = { groupId: null, days: 30, raw: null, built: null, loading: false, loaded: false, error: '' };

function statsGroups() {
  return groups().filter((g) => !g.error && g.communityId);
}

function statsGroup() {
  const gs = statsGroups();
  return gs.find((g) => g.id === stats.groupId) || gs[0] || null;
}

function renderStatsHead() {
  const gs = statsGroups();
  const g = statsGroup();
  $('stats-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.isCommunity ? ' (cả community)' : '') })));
  $('stats-group').disabled = !gs.length || stats.loading;
  setSegActive('stats-range', String(stats.days));
  $('btn-stats-csv').disabled = !stats.built;
}

async function loadStats() {
  const g = statsGroup();
  if (!g || stats.loading) return;
  Object.assign(stats, { groupId: g.id, loading: true, error: '' });
  renderStats();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'stats', groupId: g.id, days: stats.days });
    if (r?.status !== 'ok') stats.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else {
      stats.raw = r;
      stats.built = BG.buildStats({ ...r, days: stats.days });
      stats.loaded = true;
    }
  } finally {
    stats.loading = false;
    renderStats();
  }
}

const SOURCE_TEXT = {
  members: { official: 'số liệu chính thức của Beincom', history: 'addon tự ghi sau mỗi lần quét', none: 'chưa có' },
  joinLeave: { official: 'số liệu chính thức của Beincom', activity: 'đếm từ nhật ký hoạt động' },
  posts: { official: 'số liệu chính thức của Beincom', timeline: 'đếm bài trên các group bạn quản trị' },
};

function tile(label, value, sub) {
  return el('div', { class: 'stat-tile' }, el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value }), sub ? el('div', { class: 'sub', text: sub }) : null);
}

function renderStats() {
  renderStatsHead();
  const g = statsGroup();
  const s = stats.built;
  const note = $('stats-note');
  note.classList.toggle('err-text', !!stats.error);
  if (stats.loading) note.textContent = 'Đang tính số liệu… (có thể mất vài chục giây với group đông bài)';
  else if (stats.error) note.textContent = stats.error;
  else if (!g) note.textContent = data.state.snapshot ? 'Không có group nào để thống kê.' : 'Chưa quét lần nào.';
  else if (s) {
    const official = s.sources.members === 'official';
    const parts = [official ? 'Bạn là chủ/admin community nên có số liệu chính thức của Beincom.' : 'Số liệu chính thức chỉ dành cho chủ/admin community — addon tự tính từ dữ liệu bạn xem được.'];
    if (s.sources.members === 'history') parts.push('Số thành viên chỉ có từ những ngày addon đã quét.');
    if (stats.raw?.activityTruncated) parts.push('Nhật ký hoạt động quá dài, mới đếm 300 sự kiện gần nhất.');
    if (stats.raw?.errors?.length) parts.push('Lỗi: ' + stats.raw.errors.join('; '));
    note.textContent = parts.join(' ');
  } else note.textContent = '';

  const tiles = $('stats-tiles');
  tiles.replaceChildren();
  if (s) {
    const fmtN = (n) => (n == null ? '–' : Number(n).toLocaleString('vi-VN'));
    tiles.append(
      tile('Thành viên hiện tại', fmtN(s.totals.members ?? g?.userCount), g?.isCommunity ? 'cả community' : 'trong group'),
      tile(`Vào trong ${stats.days} ngày`, '+' + fmtN(s.totals.joined), SOURCE_TEXT.joinLeave[s.sources.joinLeave]),
      tile(`Rời trong ${stats.days} ngày`, '−' + fmtN(s.totals.left), SOURCE_TEXT.joinLeave[s.sources.joinLeave]),
      tile('Bài mới', fmtN(s.totals.posts), SOURCE_TEXT.posts[s.sources.posts]),
      tile('Cảm xúc', fmtN(s.totals.reactions), `trên ${fmtN(s.totals.scannedPosts)} bài đọc được`),
      tile('Bình luận', fmtN(s.totals.comments), `trên ${fmtN(s.totals.scannedPosts)} bài đọc được`),
    );
  }

  // Biểu đồ chỉ vẽ khi tab đang hiện (cần chiều rộng thật)
  if (currentTab === 'stats') {
    const days = s?.days || BG.dayRange(stats.days);
    const daily = s?.daily || days.map((d) => ({ day: d, members: null, joined: 0, left: 0, posts: 0 }));
    const waiting = stats.loading ? 'Đang tải…' : null;
    Charts.line($('chart-members'), { days, values: daily.map((d) => d.members), label: 'Thành viên', emptyText: waiting || 'Chưa có số liệu thành viên — addon sẽ ghi lại sau mỗi lần quét' });
    Charts.diverging($('chart-joinleave'), { days, up: daily.map((d) => d.joined), down: daily.map((d) => d.left), upLabel: 'Vào', downLabel: 'Rời', emptyText: waiting || 'Không có ai vào hay rời trong khoảng này' });
    Charts.columns($('chart-posts'), { days, values: daily.map((d) => d.posts), label: 'Bài mới', emptyText: waiting || 'Không có bài mới trong khoảng này' });
  }
  $('chart-members-sub').textContent = s ? SOURCE_TEXT.members[s.sources.members] : '';
  $('chart-joinleave-sub').textContent = s ? SOURCE_TEXT.joinLeave[s.sources.joinLeave] : '';
  $('chart-posts-sub').textContent = s ? SOURCE_TEXT.posts[s.sources.posts] : '';

  const tb = $('stats-table-body');
  tb.replaceChildren(
    ...(s?.daily || [])
      .slice()
      .reverse()
      .map((d) => el('tr', {}, el('td', { text: d.day.split('-').reverse().join('/') }), el('td', { class: 'num', text: d.members == null ? '–' : d.members.toLocaleString('vi-VN') }), el('td', { class: 'num', text: String(d.joined) }), el('td', { class: 'num', text: String(d.left) }), el('td', { class: 'num', text: String(d.posts) }))),
  );

  const tp = $('top-posts-body');
  tp.replaceChildren();
  if (!s?.topPosts.length) tp.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 3, text: stats.loading ? 'Đang tải…' : 'Chưa có bài nào' })));
  (s?.topPosts || []).forEach((p, i) =>
    tp.append(
      el(
        'tr',
        {},
        el('td', { class: 'wrap' }, el('span', { class: 'rank', text: `${i + 1}.` }), el('a', { href: BG.postUrl(p), target: '_blank', text: snippet(p) }), el('div', { class: 'muted small', text: ago(p.publishedAt) })),
        el('td', { class: 'num', text: String(p.reactions || 0) }),
        el('td', { class: 'num', text: String(p.commentsCount || 0) }),
      ),
    ),
  );

  const ta = $('top-authors-body');
  ta.replaceChildren();
  if (!s?.topAuthors.length) ta.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: stats.loading ? 'Đang tải…' : 'Chưa có ai đăng bài' })));
  (s?.topAuthors || []).forEach((a, i) =>
    ta.append(el('tr', {}, el('td', {}, el('div', { class: 'user' }, el('span', { class: 'rank', text: `${i + 1}.` }), postAuthor(a.actor))), el('td', { class: 'num', text: String(a.posts) }), el('td', { class: 'num', text: String(a.reactions) }), el('td', { class: 'num', text: String(a.comments) }))),
  );
}

function exportStats() {
  const s = stats.built;
  const g = statsGroup();
  if (!s || !g) return;
  const csv = BG.toCsv(s.daily, [
    { label: 'Ngày', key: 'day' },
    { label: 'Thành viên', get: (d) => d.members ?? '' },
    { label: 'Vào', key: 'joined' },
    { label: 'Rời', key: 'left' },
    { label: 'Bài mới', key: 'posts' },
  ]);
  const slug = BG.norm(g.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
  download(`beingroup-thong-ke-${slug}-${stats.days}ngay-${BG.vnDay()}.csv`, csv, 'text/csv;charset=utf-8');
}

$('stats-group').addEventListener('change', (e) => {
  stats.groupId = e.target.value;
  stats.built = null;
  loadStats();
});
onSeg('stats-range', (f) => {
  stats.days = Number(f);
  loadStats();
});
$('btn-stats-csv').addEventListener('click', exportStats);

// ---------- Quy tắc ----------

function fillList(id, list, prefix = '') {
  if (document.activeElement === $(id)) return;
  $(id).value = (list || []).map((x) => prefix + x).join(', ');
}

function renderRules() {
  const r = data.rules;
  for (const k of RULE_BOOLS) $(k).checked = !!r[k];
  if (document.activeElement !== $('minAnswerLength')) $('minAnswerLength').value = r.minAnswerLength;
  for (const [k, isUser] of Object.entries(RULE_LISTS)) fillList(k, r[k], isUser ? '@' : '');
  const pr = data.postRules;
  for (const k of POST_RULE_LISTS) fillList('post-' + k, pr[k]);
  $('post-reviewExternalLinks').checked = !!pr.reviewExternalLinks;
  for (const [card, src] of [['#rules', r], ['#post-rules', pr]]) {
    for (const row of document.querySelectorAll(card + ' [data-requires]')) {
      const on = !!src[row.dataset.requires];
      row.classList.toggle('is-disabled', !on);
      for (const i of row.querySelectorAll('input, textarea')) i.disabled = !on;
    }
  }
}

async function saveTo(key, defaults, patch, hintId) {
  const { [key]: cur } = await chrome.storage.local.get(key);
  await chrome.storage.local.set({ [key]: { ...defaults, ...cur, ...patch } });
  $(hintId).textContent = 'Đã lưu ✓';
  setTimeout(() => ($(hintId).textContent = ''), 2000);
}

const saveRules = (patch) => saveTo('rules', BG.DEFAULT_RULES, patch, 'rules-saved');
const savePostRules = (patch) => saveTo('postRules', BG.DEFAULT_POST_RULES, patch, 'post-rules-saved');

for (const k of RULE_BOOLS) $(k).addEventListener('change', () => saveRules({ [k]: $(k).checked }));
$('minAnswerLength').addEventListener('change', () => saveRules({ minAnswerLength: Math.max(0, Math.min(200, Number($('minAnswerLength').value) || 0)) }));
for (const [k, isUser] of Object.entries(RULE_LISTS)) $(k).addEventListener('change', () => saveRules({ [k]: BG.parseList($(k).value, { username: isUser }) }));
for (const k of POST_RULE_LISTS) $('post-' + k).addEventListener('change', () => savePostRules({ [k]: BG.parseList($('post-' + k).value) }));
$('post-reviewExternalLinks').addEventListener('change', () => savePostRules({ reviewExternalLinks: $('post-reviewExternalLinks').checked }));

// ---------- Cài đặt ----------

function renderSettings() {
  const s = data.settings;
  for (const k of SETTING_BOOLS) $(k).checked = !!s[k];
  for (const k of SETTING_NUMS) $(k).value = String(s[k]);
  $('master-row').classList.toggle('off', !s.active);
  $('master-title').textContent = s.active ? 'Addon đang hoạt động' : 'Đã tắt tất cả chức năng';
  $('settings-group').classList.toggle('paused', !s.active);
}

const saveSettings = (patch) => saveTo('settings', BG.DEFAULT_SETTINGS, patch, 'saved-hint');

for (const k of SETTING_BOOLS) {
  $(k).addEventListener('change', async () => {
    const on = $(k).checked;
    // Tắt chạy thử khi đang bật tự xử lý: hỏi lại vì thao tác sẽ gửi thật
    if (on && (k === 'autoApprove' || k === 'autoDecline') && !data.settings.dryRun) {
      const what = k === 'autoApprove' ? 'duyệt' : 'từ chối';
      if (!confirm(`Bật tự ${what}? Sau mỗi lần quét, addon sẽ tự ${what} các yêu cầu tham gia theo quy tắc và gửi thật lên Beincom.`)) {
        $(k).checked = false;
        return;
      }
    }
    if (!on && k === 'dryRun' && (data.settings.autoApprove || data.settings.autoDecline)) {
      if (!confirm('Tắt Chạy thử khi đang bật tự xử lý: lần quét tới addon sẽ tự duyệt/từ chối thật. Tiếp tục?')) {
        $(k).checked = true;
        return;
      }
    }
    saveSettings({ [k]: on });
  });
}
for (const k of SETTING_NUMS) $(k).addEventListener('change', () => saveSettings({ [k]: Number($(k).value) }));

// ---------- Nhật ký ----------

const ACTION_LABELS = {
  member: { approve: 'Duyệt thành viên', decline: 'Từ chối thành viên' },
  manage: { remove: 'Xoá thành viên', assignAdmin: 'Gán admin group', revokeAdmin: 'Gỡ admin group', ban: 'Cấm thành viên' },
  compose: { publish: 'Đăng bài', schedule: 'Hẹn giờ đăng', reschedule: 'Đổi giờ đăng', cancel: 'Huỷ bài hẹn giờ' },
  post: { approve: 'Duyệt bài', reject: 'Từ chối bài', hide: 'Ẩn bài', delete: 'Xoá bài' },
};
const STATUS_TAGS = { ok: ['ok', 'Thành công'], dry: ['warn', 'Chạy thử'], error: ['err', 'Lỗi'] };

const kindOf = (e) => e.kind || 'member'; // nhật ký cũ chưa có kind
const actionLabel = (e) => ACTION_LABELS[kindOf(e)]?.[e.action] || e.action;
const isPostKind = (e) => kindOf(e) === 'post' || kindOf(e) === 'compose';
const targetText = (e) =>
  kindOf(e) === 'compose' ? e.snippet || '' : kindOf(e) === 'post' ? `${e.fullname || e.username || '?'}: ${e.snippet || ''}` : `${e.fullname || ''}${e.username ? ' @' + e.username : ''}`;
const noteText = (e) => [e.scheduledAt ? 'Giờ đăng: ' + fmtTime(e.scheduledAt) : '', e.reason ? 'Lý do: ' + e.reason : '', e.message || ''].filter(Boolean).join(' · ');

function filteredLog() {
  // "Thành viên" gồm cả duyệt yêu cầu và xoá / gán admin / cấm; "Bài viết" gồm cả kiểm duyệt và đăng bài
  const kindMatch = (e) => kindOf(e) === logFilter || (logFilter === 'member' && kindOf(e) === 'manage') || (logFilter === 'post' && isPostKind(e));
  return data.log.filter((e) => logFilter === 'all' || kindMatch(e) || e.status === logFilter);
}

function renderLog() {
  setSegActive('log-filter', logFilter);
  const rows = filteredLog();
  const body = $('log-body');
  body.replaceChildren();
  if (!rows.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: 'Chưa có thao tác nào' })));
  for (const e of rows.slice(0, logLimit)) {
    const [cls, label] = STATUS_TAGS[e.status] || ['info', e.status];
    const target =
      isPostKind(e)
        ? el('td', { class: 'note' }, e.contentId ? el('a', { href: BG.postUrl({ id: e.contentId, type: e.contentType }), target: '_blank', text: targetText(e) }) : targetText(e))
        : el('td', {}, e.fullname || '', e.username ? el('span', { class: 'muted small', text: ' @' + e.username }) : null);
    body.append(
      el(
        'tr',
        {},
        el('td', { text: fmtTime(e.time) }),
        el('td', { text: e.source === 'auto' ? 'Tự động' : 'Bấm tay' }),
        el('td', { text: actionLabel(e) }),
        el('td', {}, el('span', { class: 'tag ' + cls, text: label })),
        el('td', { text: e.communityName && e.communityName !== e.groupName ? `${e.communityName} › ${e.groupName}` : e.groupName }),
        target,
        el('td', { class: 'note', text: noteText(e) }),
      ),
    );
  }
  $('btn-more').hidden = rows.length <= logLimit;
}

const LOG_COLUMNS = [
  { label: 'Thời gian', get: (e) => new Date(e.time).toISOString() },
  { label: 'Nguồn', get: (e) => (e.source === 'auto' ? 'Tự động' : 'Bấm tay') },
  { label: 'Thao tác', get: actionLabel },
  { label: 'Kết quả', get: (e) => STATUS_TAGS[e.status]?.[1] || e.status },
  { label: 'Community', key: 'communityName' },
  { label: 'Group', key: 'groupName' },
  { label: 'Họ tên', key: 'fullname' },
  { label: 'Username', key: 'username' },
  { label: 'User ID', key: 'userId' },
  { label: 'ID bài', key: 'contentId' },
  { label: 'Nội dung bài', key: 'snippet' },
  { label: 'Lý do', key: 'reason' },
  { label: 'Giờ đăng', key: 'scheduledAt' },
  { label: 'Ghi chú', key: 'message' },
];

$('log-filter').addEventListener('click', (e) => {
  const f = e.target.closest('button')?.dataset.f;
  if (!f) return;
  logFilter = f;
  logLimit = LOG_PAGE;
  renderLog();
});
$('btn-more').addEventListener('click', () => {
  logLimit += LOG_PAGE;
  renderLog();
});
$('btn-export-csv').addEventListener('click', () => download(`beingroup-nhat-ky-${BG.vnDay()}.csv`, BG.toCsv(filteredLog(), LOG_COLUMNS), 'text/csv;charset=utf-8'));
$('btn-export-json').addEventListener('click', () => download(`beingroup-nhat-ky-${BG.vnDay()}.json`, JSON.stringify(filteredLog(), null, 2), 'application/json'));
$('btn-clear').addEventListener('click', async () => {
  if (!confirm('Xoá toàn bộ nhật ký thao tác? Không khôi phục được.')) return;
  await chrome.storage.local.set({ log: [] });
});

// ---------- Sự kiện ----------

function onSeg(id, set) {
  $(id).addEventListener('click', (e) => {
    const f = e.target.closest('button')?.dataset.f;
    if (f) set(f);
  });
}

$('group-select').addEventListener('change', (e) => selectGroup(e.target.value));
onSeg('verdict-filter', (f) => {
  verdictFilter = f;
  renderReview();
});
$('check-all').addEventListener('change', (e) => {
  for (const r of evaluated(currentGroup()).filter((r) => verdictFilter === 'all' || r.ev.verdict === verdictFilter)) e.target.checked ? selected.add(r.req.id) : selected.delete(r.req.id);
  renderReview();
});
for (const [btn, action] of [['btn-approve-selected', 'approve'], ['btn-decline-selected', 'decline']]) {
  $(btn).addEventListener('click', () => {
    const g = currentGroup();
    if (g) actMembers(action, g, g.requests.filter((r) => selected.has(r.id)));
  });
}

$('members-group').addEventListener('change', (e) => {
  mem.groupId = e.target.value;
  mem.key = '';
  if (mem.tab === 'list') loadMembers(true);
  else loadActivity(true);
});
onSeg('members-tab', (f) => {
  mem.tab = f;
  if (f === 'activity' && (act.groupId !== memberGroup()?.id || !act.items.length)) loadActivity(true);
  if (f === 'list' && (mem.groupId !== memberGroup()?.id || (!mem.items.length && mem.total == null))) loadMembers(true);
  renderMembers();
  renderActivity();
});
$('members-search').addEventListener('submit', (e) => {
  e.preventDefault();
  mem.key = $('members-key').value.trim();
  loadMembers(true);
});
$('members-sort').addEventListener('change', (e) => {
  mem.sort = e.target.value;
  loadMembers(true);
});
$('btn-members-more').addEventListener('click', () => loadMembers(mem.groupId !== memberGroup()?.id));
$('members-check-all').addEventListener('change', (e) => {
  for (const u of mem.items) e.target.checked ? selectedMembers.add(u.id) : selectedMembers.delete(u.id);
  renderMembers();
});
$('btn-members-remove').addEventListener('click', () => {
  const g = memberGroup();
  if (g) actMembersManage('remove', g, mem.items.filter((u) => selectedMembers.has(u.id)));
});
$('btn-members-export').addEventListener('click', exportMembers);
onSeg('activity-filter', (f) => {
  act.filter = f;
  renderActivity();
});
$('btn-activity-more').addEventListener('click', () => loadActivity(false));

// Đăng bài
for (const id of ['compose-text', 'compose-canComment', 'compose-canReact', 'compose-important', 'compose-important-until', 'compose-at']) {
  $(id).addEventListener('input', () => {
    updateCompose();
    saveDraft();
  });
}
for (const r of document.querySelectorAll('input[name="compose-when"]')) {
  r.addEventListener('change', () => {
    updateCompose();
    saveDraft();
  });
}
$('btn-compose').addEventListener('click', submitCompose);
// Trình soạn thảo
$('editor').querySelector('.editor-toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-md]');
  if (b && MD_ACTIONS[b.dataset.md]) MD_ACTIONS[b.dataset.md]();
});
$('compose-text').addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  MD_ACTIONS[k]();
});
onSeg('editor-mode', setEditorMode);
$('btn-compose-clear').addEventListener('click', () => {
  if ($('compose-text').value.trim() && !confirm('Xoá nội dung đang viết?')) return;
  $('compose-text').value = '';
  updateCompose();
  saveDraft();
});
$('tpl-select').addEventListener('change', renderTemplates);
$('btn-tpl-use').addEventListener('click', useTemplate);
$('btn-tpl-save').addEventListener('click', saveTemplate);
$('btn-tpl-delete').addEventListener('click', deleteTemplate);

$('community-select').addEventListener('change', (e) => {
  selectedCommunityId = e.target.value;
  selectedPosts.clear();
  renderApproval();
});
onSeg('approval-filter', (f) => {
  approvalFilter = f;
  renderApproval();
});
$('approval-check-all').addEventListener('change', (e) => {
  const g = currentCommunity();
  for (const p of g?.approvals || []) {
    if (approvalFilter !== 'all' && BG.evaluatePost(p, data.postRules).verdict !== approvalFilter) continue;
    e.target.checked ? selectedPosts.add(p.id) : selectedPosts.delete(p.id);
  }
  renderApproval();
});
for (const [btn, action] of [['btn-approve-posts', 'approve'], ['btn-reject-posts', 'reject']]) {
  $(btn).addEventListener('click', () => {
    const g = currentCommunity();
    if (g) actApproval(action, g, g.approvals.filter((p) => selectedPosts.has(p.id)));
  });
}

onSeg('recent-filter', (f) => {
  recentFilter = f;
  recentLimit = RECENT_PAGE;
  selectedRecent.clear();
  renderRecent();
});
$('recent-check-all').addEventListener('change', (e) => {
  for (const r of recentRows().filter((r) => inFilter(r, recentFilter)).slice(0, recentLimit)) e.target.checked ? selectedRecent.add(r.p.id) : selectedRecent.delete(r.p.id);
  renderRecent();
});
const pickedRecent = () => (data.state.recentPosts || []).filter((p) => selectedRecent.has(p.id));
$('btn-dismiss-posts').addEventListener('click', () => dismissPosts(pickedRecent(), recentFilter !== 'dismissed'));
$('btn-hide-posts').addEventListener('click', () => hidePosts(pickedRecent()));
$('btn-recent-more').addEventListener('click', () => {
  recentLimit += RECENT_PAGE;
  renderRecent();
});

$('btn-scan').addEventListener('click', async () => {
  const btn = $('btn-scan');
  btn.disabled = true;
  btn.textContent = 'Đang quét…';
  try {
    await chrome.runtime.sendMessage({ type: 'scan', source: 'dashboard' });
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Quét ngay';
    loadAll();
  }
});

window.addEventListener('hashchange', () => {
  const p = hashParams();
  if (p.get('group') && p.get('group') !== selectedGroupId) selectGroup(p.get('group'));
  if (p.get('tab') && p.get('tab') !== currentTab) showTab(p.get('tab'));
});

// Thanh tab: bấm chuột hoặc phím mũi tên trái/phải
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) showTab(b.dataset.tab);
});
$('btn-tab-refresh').addEventListener('click', refreshTab);
$('tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = TABS.indexOf(currentTab) + (e.key === 'ArrowRight' ? 1 : -1);
  showTab(TABS[(i + TABS.length) % TABS.length]);
  document.querySelector(`#tabs [data-tab="${currentTab}"]`).focus();
});
// Bấm ô số liệu ở Tổng quan để mở tab tương ứng
for (const [id, tab, anchor] of [['kpi-requests', 'members', 'review'], ['kpi-posts', 'content', 'approval'], ['kpi-flagged', 'content', 'recent']]) {
  const tile = $(id).parentElement;
  tile.classList.add('link');
  tile.title = 'Mở tab ' + document.querySelector(`#tabs [data-tab="${tab}"]`).textContent.trim();
  tile.addEventListener('click', () => {
    showTab(tab);
    $(anchor).scrollIntoView({ block: 'start' });
  });
}
// Giữ thanh tab ngay dưới thanh trên cùng
const syncTopbar = () => document.documentElement.style.setProperty('--topbar-h', document.querySelector('.topbar').offsetHeight + 'px');
window.addEventListener('resize', syncTopbar);
syncTopbar();

function renderAll() {
  renderTop();
  renderKpis();
  renderBadges();
  renderTabRefresh();
  renderStatsHead();
  renderGroups();
  renderReview();
  if (mem.tab === 'list') renderMembers();
  else renderActivity();
  renderApproval();
  renderRecent();
  renderComposeGroups();
  renderTemplates();
  updateCompose();
  renderScheduled();
  renderRules();
  renderSettings();
  renderLog();
}

async function loadAll() {
  const { settings, rules, postRules, state, log, templates } = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'state', 'log', 'templates']);
  data = {
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    rules: { ...BG.DEFAULT_RULES, ...rules },
    postRules: { ...BG.DEFAULT_POST_RULES, ...postRules },
    state: state || {},
    log: log || [],
    templates: templates || [],
  };
  renderAll();
  await loadDraftOnce();
  if (!loadAll.started) {
    loadAll.started = true;
    showTab(currentTab);
  } else ensureTabData();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Đánh dấu đã xem / lưu nháp: không cần vẽ lại cả trang
  if (Object.keys(changes).every((k) => k === 'activitySeen' || k === 'composeDraft')) return;
  loadAll();
});
$('version').textContent = 'v' + chrome.runtime.getManifest().version;
loadAll();
