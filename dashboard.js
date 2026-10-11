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
  if (p.get('monthly')) openMonthly();
  if (p.get('nudge')) openNudge();
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

// Vẽ theo tab: phần chung (thanh trên cùng, số trên thanh tab) luôn vẽ; phần của từng tab chỉ vẽ khi tab đó đang mở.
// Dữ liệu đổi lúc đang ở tab khác: đánh dấu tab đó cần vẽ lại, vẽ khi mở (showTab gọi renderTab).
const TAB_RENDER = {
  overview: () => {
    renderKpis();
    renderTodo();
    renderGroups();
    renderWeekly();
    renderGroupSettings();
  },
  members: () => {
    renderReview();
    if (mem.tab === 'list') renderMembers();
    else if (mem.tab === 'activity') renderActivity();
    else if (mem.tab === 'banned') renderBanned();
    else {
      renderMembersHead();
      renderProfiles();
    }
  },
  content: () => {
    renderWaves();
    renderApproval();
    renderRecent();
    renderComments();
    renderPinned();
    renderTagAdmin();
  },
  reports: () => renderReports(),
  compose: () => {
    renderComposeGroups();
    renderTemplates();
    renderMedia();
    renderTagsSeries();
    updateCompose();
    renderArticle();
    renderScheduled();
    renderCsv();
    renderWelcome();
    renderShoutout();
  },
  stats: () => {
    renderStatsHead();
    renderMonthly();
    renderRetention();
    renderInsights();
  },
  settings: () => {
    renderRules();
    renderSettings();
    renderBackup();
  },
  log: () => {
    renderLog();
    renderCheck();
    renderDiag();
  },
};
const tabDirty = new Set(TABS);

function renderTab(t) {
  tabDirty.delete(t);
  TAB_RENDER[t]?.();
}

function renderAll() {
  renderTop();
  renderBadges();
  renderTabRefresh();
  for (const t of TABS) tabDirty.add(t);
  renderTab(currentTab);
}

async function loadAll() {
  const { settings, rules, postRules, groupRules, recurring, state, log, templates, profiles, syncStatus, telegramStatus, telegramPoll, postStats, nudges, nudgeDraft, nudgeEffect } = await chrome.storage.local.get(['settings', 'rules', 'postRules', 'groupRules', 'recurring', 'state', 'log', 'templates', 'profiles', 'syncStatus', 'telegramStatus', 'telegramPoll', 'postStats', 'nudges', 'nudgeDraft', 'nudgeEffect']);
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
    telegramStatus: telegramStatus || null,
    telegramPoll: telegramPoll || null,
    postStats: postStats || {},
    nudges: nudges || [],
    nudgeDraft: nudgeDraft || null,
    nudgeEffect: nudgeEffect || null,
  };
  renderAll();
  await loadDraftOnce();
  if (!loadAll.started) {
    loadAll.started = true;
    const p = hashParams(); // đọc trước: showTab ghi lại hash chỉ còn tab / group
    showTab(currentTab);
    if (p.get('welcome')) openWelcome(); // mở từ thông báo nhắc chào thành viên mới
    if (p.get('monthly')) openMonthly(); // mở từ thông báo đầu tháng
    if (p.get('nudge')) openNudge(); // mở từ thông báo bài nhắc người mới
    checkWhatsNew(); // vừa cập nhật addon: hiện Có gì mới
  } else ensureTabData();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Đánh dấu đã xem / lưu nháp: không cần vẽ lại cả trang
  // Nút Telegram: offset đọc nút bấm / danh sách việc đã gửi đổi thường xuyên, không cần vẽ lại (thao tác thật sẽ đổi state / log)
  if (Object.keys(changes).every((k) => ['activitySeen', 'composeDraft', 'articleDraft', 'telegramPoll', 'tgActions', 'diagLog', 'seenVersion'].includes(k))) return;
  loadAll();
});
$('version').textContent = 'v' + chrome.runtime.getManifest().version;
loadAll();
