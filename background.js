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

//
// Mã chia theo phần trong bg/: core (gọi API, thao tác ghi, thông báo), scan (quét), actions (thao tác),
// compose (đăng bài), manage (cài đặt group, thống kê, báo cáo), sync (đồng bộ cài đặt giữa các máy), telegram (gửi thông báo về Telegram). Tệp này: lịch chạy, sự kiện, nhận lệnh từ Dashboard / popup.

// Lỗi JavaScript trong service worker: ghi vào Lỗi kỹ thuật (bg/core.js recordDiag)
globalThis.addEventListener?.('error', (e) => recordDiag({ where: 'sw', kind: 'js', message: e.message, stack: e.error?.stack || `${e.filename}:${e.lineno}:${e.colno}` }));
globalThis.addEventListener?.('unhandledrejection', (e) => recordDiag({ where: 'sw', kind: 'js', message: String(e.reason?.message || e.reason), stack: e.reason?.stack || '' }));

// common.js tạo BG, lib/*.js (theo BG.PARTS) gắn thêm phần còn lại, rồi tới các tệp của service worker
importScripts('common.js');
importScripts(...BG.PARTS.map((p) => `lib/${p}.js`));
importScripts('bg/core.js', 'bg/scan.js', 'bg/actions.js', 'bg/compose.js', 'bg/article.js', 'bg/manage.js', 'bg/sync.js', 'bg/telegram.js', 'bg/insights.js', 'bg/selfcheck.js');

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
  await scheduleTelegramPoll();
  await updateBadge();
  exclusive(() => doScan({ source: 'install' }));
});

chrome.runtime.onStartup.addListener(async () => {
  await scheduleAlarm();
  await scheduleTelegramPoll();
  await updateBadge();
  exclusive(() => doScan({ source: 'startup' }));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) exclusive(() => doScan({ source: 'alarm' }));
  if (alarm.name === TG_POLL_ALARM) pollTelegram().catch(() => {}); // nút bấm trong tin Telegram (bg/telegram.js)
});

chrome.storage.onChanged.addListener((changes, area) => {
  // Máy khác ghi lên bản đồng bộ -> nhận về; máy này đổi cài đặt -> gửi lên (bg/sync.js, chỉ khi bật đồng bộ)
  if (area === 'sync') return void onSyncChanged(changes).catch(() => {});
  if (area !== 'local') return;
  queueSyncPush(changes);
  if (changes.postRules || changes.groupRules) updateBadge(); // đổi quy tắc bài viết -> đếm lại bài vi phạm
  if (changes.telegram) scheduleTelegramPoll(); // bật / tắt nút xử lý trong tin Telegram
  if (!changes.settings) return;
  const { oldValue = {}, newValue = {} } = changes.settings;
  if (oldValue.intervalMin !== newValue.intervalMin) scheduleAlarm(true);
  if (oldValue.scanComments !== newValue.scanComments) updateBadge();
  if (oldValue.active !== newValue.active) {
    updateBadge();
    if (newValue.active !== false) exclusive(() => doScan({ source: 'resume' })); // bật lại -> quét ngay
  }
});

// Bấm thông báo: mở thẳng tab Dashboard liên quan
function notificationTab(id) {
  if (id === 'bg-requests' || id === 'bg-auto') return 'members';
  if (id === 'bg-flagged' || id === 'bg-comments' || id === 'bg-autohide' || id === 'bg-wave' || id.startsWith('bg-posts-')) return 'content';
  if (id === 'bg-weekly' || id === 'bg-watch' || id === 'bg-unanswered') return 'overview';
  if (id === 'bg-welcome') return 'compose&welcome=1';
  if (id === 'bg-monthly') return 'stats&monthly=1';
  if (id === 'bg-nudge') return 'stats&nudge=1';
  if (id === 'bg-selfcheck') return 'log';
  if (id === 'bg-prompt') return 'compose&prompt=1';
  if (id === 'bg-digest') return 'overview&digest=1';
  if (id === 'bg-pending') return 'overview&todo=overdue';
  if (id === 'bg-reports' || id === 'bg-autoflag') return 'reports';
  return '';
}

chrome.notifications.onClicked.addListener((id) => {
  const tab = notificationTab(id);
  chrome.tabs.create({ url: id === 'bg-login' ? BG.SITE + '/' : chrome.runtime.getURL(DASHBOARD + (tab ? '#tab=' + tab : '')) });
  chrome.notifications.clear(id);
});

// Lệnh từ Dashboard / popup hỏng giữa chừng: ghi Lỗi kỹ thuật và trả câu báo (không để trang chờ mãi)
function handlerError(msg, e) {
  recordDiag({ where: 'sw', kind: 'js', message: `Lệnh "${msg?.type}" lỗi: ${e?.message || e}`, stack: e?.stack || '' });
  return { status: 'error', message: 'Lỗi trong addon: ' + (e?.message || e) + ' — xem Nhật ký → Lỗi kỹ thuật' };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  noteUsage(msg?.type); // Báo cáo sử dụng: chỉ đếm loại lệnh
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
    postDetail: () => doPostDetail(msg),
    pinned: () => doPinned(msg),
    groupSettings: () => doGroupSettings(msg),
    banned: () => doBanned(msg),
    tagsSeries: () => doTagsSeries(msg),
    tags: () => doTags(msg),
    newMembers: () => doNewMembers(msg),
    syncStatus: () => doSyncStatus(),
    telegramTest: () => doTelegramTest(msg),
    telegramReport: () => doTelegramReport(msg),
    telegramChatId: () => doTelegramChatId(msg),
    telegramPoll: () => pollTelegram(),
    // Dashboard / popup báo lỗi JavaScript của trang
    diag: async () => {
      if (msg.entry?.where === 'dashboard' || msg.entry?.where === 'popup') recordDiag({ ...msg.entry, kind: 'js' });
      return { status: 'ok' };
    },
    postStatsRefresh: () => measurePostStats({ refresh: true }),
    retention: () => doRetention(msg),
    selfCheck: () => doSelfCheck(msg),
    storageUsage: () => storageUsage(),
    userPosts: () => doUserPosts(msg),
    sweepSearch: () => doSweepSearch(msg),
    nudgeEffect: () => doNudgeEffect(),
    usageSend: () => doUsageSend({ force: true }),
    monthly: () => doMonthly(msg),
    linkPreview: () => doLinkPreview(msg),
  };
  if (reads[msg?.type]) {
    reads[msg.type]().then(sendResponse, (e) => sendResponse(handlerError(msg, e)));
    return true;
  }
  const handlers = {
    scan: () => doScan({ source: msg.source || 'popup' }),
    refresh: () => doRefresh(msg),
    act: () => doAct(msg),
    approvalAct: () => doApprovalAct(msg),
    postAct: () => doPostAct(msg),
    commentAct: () => doCommentAct(msg),
    spamAct: () => doSpamAct(msg),
    banEverywhere: () => doBanEverywhere(msg),
    cleanupUser: () => doCleanupUser(msg),
    hidePosts: () => doHidePosts(msg),
    commentWrite: () => doCommentWrite(msg),
    syncNow: () => doSyncNow(msg),
    memberAct: () => doMemberAct(msg),
    compose: () => doCompose(msg),
    composeArticle: () => doComposeArticle(msg),
    composeSeries: () => doComposeSeries(msg),
    categories: () => doCategories(),
    scheduleAct: () => doScheduleAct(msg),
    restoreBackup: () => doRestore(msg),
    reportAct: () => doReportAct(msg),
    profileAct: () => doProfileAct(msg),
    editPost: () => doEditPost(msg),
    editScheduled: () => doEditScheduled(msg),
    tagAct: () => doTagAct(msg),
    postSetting: () => doPostSetting(msg),
    pinAct: () => doPinAct(msg),
    groupSettingAct: () => doGroupSettingAct(msg),
  };
  const h = handlers[msg?.type];
  if (!h) return;
  exclusive(h).then(sendResponse, (e) => sendResponse(handlerError(msg, e)));
  return true;
});
