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

importScripts('common.js', 'bg/core.js', 'bg/scan.js', 'bg/actions.js', 'bg/compose.js', 'bg/article.js', 'bg/manage.js', 'bg/sync.js', 'bg/telegram.js');

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
    postDetail: () => doPostDetail(msg),
    pinned: () => doPinned(msg),
    groupSettings: () => doGroupSettings(msg),
    banned: () => doBanned(msg),
    tagsSeries: () => doTagsSeries(msg),
    tags: () => doTags(msg),
    newMembers: () => doNewMembers(msg),
    syncStatus: () => doSyncStatus(),
    telegramTest: () => doTelegramTest(msg),
    telegramChatId: () => doTelegramChatId(msg),
    telegramPoll: () => pollTelegram(),
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
    commentAct: () => doCommentAct(msg),
    spamAct: () => doSpamAct(msg),
    banEverywhere: () => doBanEverywhere(msg),
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
  exclusive(h).then(sendResponse);
  return true;
});
