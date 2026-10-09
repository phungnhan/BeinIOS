// Dashboard — khởi động: sự kiện chung (quét, chuyển tab, ô số liệu), vẽ lại toàn trang, nạp dữ liệu.
// Phần còn lại nằm ở dash/*.js, nạp trước tệp này (xem cuối dashboard.html).

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
  if (p.get('welcome')) openWelcome();
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
for (const [id, tab, anchor] of [['kpi-requests', 'members', 'review'], ['kpi-posts', 'content', 'approval'], ['kpi-flagged', 'content', 'recent'], ['kpi-reports', 'reports', 'reports']]) {
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
  renderTodo();
  renderGroups();
  renderWeekly();
  renderReview();
  if (mem.tab === 'list') renderMembers();
  else if (mem.tab === 'activity') renderActivity();
  else if (mem.tab === 'banned') renderBanned();
  else {
    renderMembersHead();
    renderProfiles();
  }
  renderWaves();
  renderApproval();
  renderRecent();
  renderComments();
  renderPinned();
  renderGroupSettings();
  renderReports();
  renderComposeGroups();
  renderTemplates();
  renderMedia();
  renderTagsSeries();
  updateCompose();
  renderScheduled();
  renderWelcome();
  renderShoutout();
  renderRules();
  renderSettings();
  renderBackup();
  renderLog();
}

async function loadAll() {
  const { settings, rules, postRules, groupRules, recurring, state, log, templates, profiles, syncStatus } = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'groupRules', 'recurring', 'state', 'log', 'templates', 'profiles', 'syncStatus']);
  data = {
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    rules: { ...BG.DEFAULT_RULES, ...rules },
    postRules: { ...BG.DEFAULT_POST_RULES, ...postRules },
    groupRules: groupRules || {},
    recurring: recurring || [],
    state: state || {},
    log: log || [],
    templates: templates || [],
    profiles: profiles || { users: {} },
    syncStatus: syncStatus || null,
  };
  renderAll();
  await loadDraftOnce();
  if (!loadAll.started) {
    loadAll.started = true;
    showTab(currentTab);
    if (hashParams().get('welcome')) openWelcome(); // mở từ thông báo nhắc chào thành viên mới
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
