// Service worker — số liệu để phân tích (chỉ đọc):
//  - Hiệu quả bài đã đăng qua addon: ghi bài vừa đăng / hẹn giờ, đọc lại số liệu sau 24 giờ và 7 ngày (GET content/contents/{id});
//    lưu ở khoá `postStats` (không có trong sao lưu / đồng bộ).
//  - Thành viên mới có ở lại không, báo cáo tháng: đọc khi Dashboard cần, không lưu.

async function trackPostStat({ id, type, snippet = '', groupName = '', publishAt }) {
  if (!id) return;
  const { postStats = {} } = await chrome.storage.local.get('postStats');
  postStats[id] = { ...postStats[id], id, type, snippet: String(snippet).slice(0, 160), groupName, publishAt: publishAt || new Date().toISOString(), at: Date.now() };
  await chrome.storage.local.set({ postStats: BG.pruneStats(postStats) });
}

// Đọc số liệu các bài tới mốc (tự động sau mỗi lần quét). refresh = true: đọc thêm số hiện tại của 40 bài mới nhất (nút Cập nhật).
async function measurePostStats({ now = Date.now(), refresh = false } = {}) {
  const { postStats = {} } = await chrome.storage.local.get('postStats');
  const due = BG.statsDue(postStats, now);
  const cur = refresh
    ? Object.values(postStats)
        .filter((e) => !e.gone && Date.parse(e.publishedAt || e.publishAt) <= now)
        .sort((a, b) => (b.at || 0) - (a.at || 0))
        .slice(0, 40)
        .map((e) => e.id)
    : [];
  const ids = [...new Set([...due.map((x) => x.id), ...cur])];
  if (!ids.length) return { status: 'ok', measured: 0 };
  const slotOf = new Map(due.map((x) => [x.id, x.slot]));
  const r = await withClient(async (client) => {
    const res = {};
    let needLogin = false;
    await mapLimit(ids, PARALLEL, async (id) => {
      const g = await client.call('GET', `content/contents/${id}`);
      if (g.status === 401) return (needLogin = true);
      if (BG.isContentGone(g)) return (res[id] = { gone: true });
      if (!BG.isOk(g) || !g.body.data) return;
      res[id] = { data: g.body.data };
    });
    return needLogin ? { ...NEED_LOGIN } : { status: 'ok', res };
  });
  if (r.status !== 'ok') return r;
  // Đọc lại khoá trước khi ghi (có thể vừa có bài mới được ghi vào)
  const { postStats: latest = {} } = await chrome.storage.local.get('postStats');
  let measured = 0;
  for (const [id, x] of Object.entries(r.res)) {
    const e = latest[id];
    if (!e) continue;
    if (x.gone) {
      e.gone = true;
      continue;
    }
    const d = x.data;
    if (d.status && d.status !== 'PUBLISHED') {
      // Chưa tới giờ đăng (hoặc đổi giờ): theo giờ hẹn mới
      if (d.scheduledAt) e.publishAt = d.scheduledAt;
      continue;
    }
    if (d.publishedAt) e.publishedAt = d.publishedAt;
    const m = { ...BG.statMetrics(d), at: now, ageH: e.publishedAt ? Math.round((now - Date.parse(e.publishedAt)) / 3600e3) : null };
    e.cur = m;
    const slot = slotOf.get(id);
    if (slot) e[slot] = m;
    measured++;
  }
  await chrome.storage.local.set({ postStats: latest });
  return { status: 'ok', measured };
}

// ---------- Thành viên mới có ở lại không, báo cáo tháng ----------
// Chỉ đọc. Nhật ký thành viên: GET group/groups/{id}/activity-logs?objectType=MEMBER&from&to (ms), 100 sự kiện mỗi trang.
// Tìm bài: GET content/contents (giống trang Tìm kiếm của web) theo groupId (gồm group con), startTime / endTime (ISO),
// actors[] (tối đa 20 người mỗi lần — URL dài hơn bị chặn), 25 bài mỗi trang.

const MEMBER_EVENT_LIMIT = 100;
const MEMBER_EVENT_PAGES = 20; // tối đa 2000 sự kiện
const SEARCH_LIMIT = 25;
const ACTOR_BATCH = 20;
const ACTOR_MAX = 400; // tìm bài của tối đa 400 người mới nhất
const ACTOR_PAGES = 4;
const MONTHLY_POST_PAGES = 8; // tối đa 200 bài mỗi tháng để tính tương tác (số bài thì lấy từ tổng Beincom trả)

async function readMemberEvents(client, g, from, to) {
  const events = [];
  for (let page = 1; page <= MEMBER_EVENT_PAGES; page++) {
    const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: MEMBER_EVENT_LIMIT, page, sort: 'desc', objectType: 'MEMBER', from: Math.floor(from), to: Math.ceil(to) })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc nhật ký thành viên lỗi: ' + BG.errMsg(r) };
    const list = (Array.isArray(r.body.data) ? r.body.data : []).map(BG.slimActivity);
    noteAndFlush(BG.violationsFromActivity(list));
    events.push(...list);
    const total = Number(r.body.meta?.total);
    if (list.length < MEMBER_EVENT_LIMIT || (Number.isFinite(total) && events.length >= total)) return { status: 'ok', events, truncated: false };
  }
  return { status: 'ok', events, truncated: true };
}

const iso = (t) => new Date(t).toISOString();

// Bài trong khoảng thời gian (mới nhất trước): tổng số do Beincom trả + tối đa maxPages trang để tính tương tác
async function searchPosts(client, g, from, to, maxPages) {
  const posts = [];
  let total = null;
  let after = '';
  for (let page = 0; page < maxPages; page++) {
    const r = await client.call('GET', `content/contents?${qs({ groupId: g.id, isIncludedInnerGroups: true, startTime: iso(from), endTime: iso(to), limit: SEARCH_LIMIT, after })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Tìm bài lỗi: ' + BG.errMsg(r) };
    const d = r.body.data || {};
    const list = Array.isArray(d.list) ? d.list : [];
    if (total == null && Number.isFinite(Number(d.meta?.total))) total = Number(d.meta.total);
    posts.push(...list.map((p) => ({ ...BG.slimPost(p), views: BG.statMetrics(p).views })));
    after = d.meta?.endCursor || '';
    if (!d.meta?.hasNextPage || !after || !list.length) return { status: 'ok', total: total ?? posts.length, posts, truncated: false };
  }
  return { status: 'ok', total: total ?? posts.length, posts, truncated: true };
}

// Bài của những người mới từ `from`: { userId: [publishedAt…] }. Mỗi lần tìm 20 người, đọc song song.
async function readActorPosts(client, g, users, from) {
  const ids = [...new Set((users || []).map((u) => u.id).filter(Boolean))].slice(0, ACTOR_MAX);
  const batches = [];
  for (let i = 0; i < ids.length; i += ACTOR_BATCH) batches.push(ids.slice(i, i + ACTOR_BATCH));
  const posts = {};
  let needLogin = false;
  let error = '';
  await mapLimit(batches, PARALLEL, async (batch) => {
    let after = '';
    for (let page = 0; page < ACTOR_PAGES && !needLogin; page++) {
      const actors = batch.map((id) => 'actors[]=' + encodeURIComponent(id)).join('&');
      const r = await client.call('GET', `content/contents?${actors}&${qs({ groupId: g.id, isIncludedInnerGroups: true, startTime: iso(from), limit: SEARCH_LIMIT, after })}`);
      if (r.status === 401) return (needLogin = true);
      if (!BG.isOk(r)) return (error = 'Tìm bài của người mới lỗi: ' + BG.errMsg(r));
      const d = r.body.data || {};
      for (const p of d.list || []) if (p.actor?.id && p.publishedAt) (posts[p.actor.id] ||= []).push(p.publishedAt);
      after = d.meta?.endCursor || '';
      if (!d.meta?.hasNextPage || !after) break;
    }
  });
  if (needLogin) return { ...NEED_LOGIN };
  return { status: error ? 'error' : 'ok', message: error, posts, checked: ids.length };
}

// Người vào trong `days` ngày qua và chuyện gì xảy ra sau đó (Thống kê → Thành viên mới có ở lại không)
async function doRetention({ groupId, days = 30 }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  days = Math.max(7, Math.min(90, Number(days) || 30));
  const now = Date.now();
  const from = now - days * 864e5;
  return withClient(async (client) => {
    const ev = await readMemberEvents(client, g, from, now);
    if (ev.status !== 'ok') return ev;
    const cohort = BG.memberCohort(ev.events, { from, to: now });
    const ap = await readActorPosts(client, g, cohort.map((m) => m.user), from);
    if (ap.status === 'need_login') return ap;
    return { status: 'ok', groupId: g.id, days, from, now, cohort, actorPosts: ap.posts, actorChecked: ap.checked, truncated: ev.truncated, errors: ap.message ? [ap.message] : [] };
  });
}

// Số liệu Beincom cho báo cáo một tháng (và tháng trước để so sánh). Dashboard ghép với dữ liệu addon bằng BG.monthlyReport.
async function doMonthly({ groupId, month }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  const now = Date.now();
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || '')) ? month : BG.shiftMonth(BG.monthKey(now), -1);
  const cur = BG.monthRange(key, now);
  if (cur.from >= now) return { status: 'error', message: 'Tháng này chưa bắt đầu' };
  const prev = BG.monthRange(BG.shiftMonth(key, -1), now);
  return withClient(async (client) => {
    const ev = await readMemberEvents(client, g, prev.from, now);
    if (ev.status !== 'ok') return ev;
    const [a, b] = await Promise.all([searchPosts(client, g, cur.from, cur.to, MONTHLY_POST_PAGES), searchPosts(client, g, prev.from, prev.to, MONTHLY_POST_PAGES)]);
    if (a.status === 'need_login' || b.status === 'need_login') return { ...NEED_LOGIN };
    const cohort = BG.memberCohort(ev.events, cur);
    const ap = await readActorPosts(client, g, cohort.map((m) => m.user), cur.from);
    if (ap.status === 'need_login') return ap;
    const monthData = (x) => (x.status === 'ok' ? { total: x.total, posts: x.posts, truncated: x.truncated } : { total: null, posts: [], truncated: false, error: x.message });
    return {
      status: 'ok',
      key,
      prevKey: prev.key,
      now,
      group: { id: g.id, name: g.name, isCommunity: !!g.isCommunity, communityId: g.communityId || '', userCount: g.userCount ?? null },
      events: ev.events,
      eventsTruncated: ev.truncated,
      months: { [cur.key]: monthData(a), [prev.key]: monthData(b) },
      actorPosts: ap.posts,
      actorChecked: ap.checked,
      errors: [a, b, ap].filter((x) => x.status === 'error' && x.message).map((x) => x.message),
    };
  });
}

// ---------- Nhắc người mới chưa hoạt động ----------
// Sáng thứ Hai (bật ở Thống kê → Thành viên mới có ở lại không): đọc người vào trong 30 ngày, chọn người còn ở lại mà
// chưa thấy hoạt động, chưa được nhắc trong 30 ngày → khoá `nudgeDraft`. Addon KHÔNG tự đăng: người dùng mở bản nháp
// trong ô Đăng bài, xem lại rồi đăng / hẹn giờ. Bài nhắc đăng thật được ghi ở khoá `nudges` (doCompose → recordNudge).
const NUDGE_COHORT_DAYS = 30;

async function prepareNudge({ groupId, now = Date.now() }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  const { state } = await load();
  const { nudges = [] } = await chrome.storage.local.get('nudges');
  const from = now - NUDGE_COHORT_DAYS * 864e5;
  return withClient(async (client) => {
    const ev = await readMemberEvents(client, g, from, now);
    if (ev.status !== 'ok') return ev;
    const cohort = BG.memberCohort(ev.events, { from, to: now });
    const ap = await readActorPosts(client, g, cohort.map((m) => m.user), from);
    if (ap.status === 'need_login') return ap;
    const activity = BG.cohortActivity(cohort, { posts: ap.posts, comments: state.recentComments || [] });
    const users = BG.nudgeCandidates(cohort, activity, nudges, { now });
    return { status: 'ok', group: { id: g.id, name: g.name }, users, joined: cohort.length };
  });
}

// Bài nhắc vừa đăng / hẹn giờ thật: ghi những người được nhắc tên trong bài (trong số người addon đề xuất)
async function recordNudge({ contentId, group, at, mentions, userIds }) {
  const mentioned = new Set(Object.values(mentions || {}).map((m) => m?.id).filter(Boolean));
  const ids = (userIds || []).filter((id) => mentioned.has(id));
  if (!contentId || !ids.length) return;
  const { nudges = [], nudgeDraft } = await chrome.storage.local.get(['nudges', 'nudgeDraft']);
  const set = { nudges: BG.addNudge(nudges, { id: contentId, groupId: group.id, groupName: group.name, at, userIds: ids }) };
  await chrome.storage.local.set(set);
  if (nudgeDraft?.groupId === group.id) await chrome.storage.local.remove('nudgeDraft');
}

// Hiệu quả 10 lần nhắc gần nhất (chỉ đọc): bài của người được nhắc từ lúc nhắc, ai đã rời; lưu ở `nudgeEffect`
async function doNudgeEffect() {
  const { nudges = [] } = await chrome.storage.local.get('nudges');
  const { state } = await load();
  const groups = state.snapshot?.groups || [];
  const now = Date.now();
  const recent = nudges.slice(0, 10);
  if (!recent.length) return { status: 'ok', at: now, items: [] };
  const r = await withClient(async (client) => {
    const items = [];
    for (const n of recent) {
      const g = groups.find((x) => x.id === n.groupId);
      const at = Date.parse(n.at);
      if (!g || !(at <= now)) {
        items.push({ ...BG.nudgeEffect(n, { now }), error: g ? '' : 'group không còn trong danh sách' });
        continue;
      }
      const ap = await readActorPosts(client, g, n.userIds.map((id) => ({ id })), at);
      if (ap.status === 'need_login') return ap;
      const ev = await readMemberEvents(client, g, at, now);
      if (ev.status === 'need_login') return ev;
      const leftIds = ev.status === 'ok' ? BG.memberMoves(ev.events).filter((a) => a.kind === 'out' && Date.parse(a.time) >= at).map((a) => a.user.id) : [];
      items.push(BG.nudgeEffect(n, { posts: ap.posts || {}, comments: state.recentComments || [], leftIds, now }));
    }
    return { status: 'ok', at: now, items };
  });
  if (r.status === 'ok') await chrome.storage.local.set({ nudgeEffect: { at: r.at, items: r.items } });
  return r;
}
