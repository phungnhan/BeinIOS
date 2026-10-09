// Service worker — cài đặt group, khôi phục sao lưu, thống kê, báo cáo vi phạm.

// ---------- Cài đặt group ----------

// Cài đặt hiện tại của các group (đọc khi mở Tổng quan / bấm Tải lại)
async function doGroupSettings({ groupIds = [] }) {
  if (!groupIds.length) return { status: 'ok', settings: {} };
  return withClient(async (client) => {
    const settings = {};
    const errors = [];
    let needLogin = false;
    await mapLimit(groupIds, PARALLEL, async (id) => {
      const r = await client.call('GET', `group/groups/${id}/settings`);
      if (r.status === 401) return (needLogin = true);
      if (!BG.isOk(r)) return errors.push(BG.errMsg(r));
      settings[id] = BG.slimGroupSettings(r.body.data);
    });
    if (needLogin) return { ...NEED_LOGIN };
    return { status: 'ok', settings, errors };
  });
}

// Bật / tắt một cài đặt cho nhiều group, lần lượt từng group (có nghỉ giữa hai lần như các thao tác hàng loạt khác)
async function doGroupSettingAct({ key, value, groupIds = [], source = 'manual' }) {
  const spec = BG.GROUP_SETTINGS[key];
  if (!spec) return { status: 'error', message: 'Cài đặt không hợp lệ' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const targets = groupIds.map((id) => groups.find((g) => g.id === id)).filter(Boolean);
  if (!targets.length) return { status: 'error', message: 'Chưa chọn group' };
  const denied = targets.filter((g) => BG.settingDenied(g, key));
  if (denied.length) return { status: 'error', message: `${denied.map((g) => g.name).join(', ')}: ${BG.settingDenied(denied[0], key)}` };
  const items = targets.map((g) => ({
    log: { kind: 'groupSetting', source, action: value ? 'on' : 'off', groupId: g.id, groupName: g.name, communityName: g.communityName || '', setting: key },
    call: (c) => (key === 'contentApproval' ? c.call('PUT', `group/communities/${g.communityId}/content-settings`, BG.groupSettingBody(key, value, g.id)) : c.call('PUT', `group/groups/${g.id}/settings`, BG.groupSettingBody(key, value, g.id))),
  }));
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  // Cập nhật ngay cột Duyệt thành viên / Duyệt bài ở Tổng quan
  const done = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.groupId));
  const next = { ...state };
  if (done.size && state.snapshot && (key === 'isJoinApproval' || key === 'contentApproval' || key === 'isActiveMembershipQuestions')) {
    next.snapshot = { ...state.snapshot, groups: groups.map((g) => (done.has(g.id) ? { ...g, settings: { ...g.settings, [key]: !!value } } : g)) };
  }
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return { ...summary(r, settings), done: [...done] };
}

// ---------- Khôi phục cài đặt từ bản sao lưu ----------
// keepDry: giữ Chạy thử bật sau khi khôi phục (bản sao lưu có thể đang tắt Chạy thử)
async function doRestore({ data, keepDry = false }) {
  let parsed;
  try {
    parsed = BG.readBackup({ app: 'BeinGroup', format: BG.BACKUP_FORMAT, data });
  } catch (e) {
    return { status: 'error', message: e.message };
  }
  const d = parsed.data;
  const { profiles, log = [], settings: current } = await chrome.storage.local.get(['profiles', 'log', 'settings']);
  const set = {};
  if (d.settings) set.settings = { ...BG.DEFAULT_SETTINGS, ...d.settings, ...(keepDry ? { dryRun: true } : {}), syncSettings: !!current?.syncSettings };
  if (d.rules) set.rules = { ...BG.DEFAULT_RULES, ...d.rules };
  if (d.postRules) set.postRules = { ...BG.DEFAULT_POST_RULES, ...d.postRules };
  if (d.groupRules) set.groupRules = d.groupRules;
  if (d.templates) set.templates = d.templates;
  if (d.profiles) set.profiles = BG.mergeProfiles(profiles, d.profiles);
  const restored = BG.backupSummary({ ...d, ...(set.settings ? { settings: set.settings } : {}) });
  pushLog(log, [{ time: Date.now(), kind: 'backup', source: 'manual', action: 'restore', status: 'ok', snippet: 'Bản sao lưu', message: restored.join(' · ') }]);
  await chrome.storage.local.set({ ...set, log });
  return { status: 'ok', restored };
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
