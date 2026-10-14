// Service worker — Bảo vệ community: danh sách admin (đọc mỗi ngày), theo dõi người mới vào sau mỗi lần quét (tài khoản giống
// admin, đợt vào ồ ạt), tìm tài khoản giống admin trong toàn bộ thành viên. Chỉ đọc Beincom; xoá / cấm do người dùng bấm.
// Nhật ký người vào: GET group/groups/{id}/activity-logs?useCase=<các loại vào, cách nhau dấu phẩy>&from&to (gọi thật 13/10/2026).

const ADMINS_TTL = 24 * 3600e3;
const JOIN_CASES = 'join.community.as_member,join.group.as_member,approve.join_request,accept.invitation';
const JOIN_PAGES = 3; // tối đa 300 người vào mỗi lần quét mỗi community
const JOIN_KEEP_MS = 24 * 3600e3; // giữ danh sách người vào 24 giờ (để xem lại đợt vào ồ ạt)
const JOIN_KEEP_MAX = 500;
const BURST_MINUTES = 60;
const BURST_QUIET_MS = 6 * 3600e3; // cùng một community: báo lại đợt mới sau 6 giờ
const IMPOSTOR_MAX = 200;
const SEARCH_LIMIT_USERS = 100;
// Tìm cả người tự đặt tên "hỗ trợ / admin" dù không giống admin nào
const STAFF_KEYS = ['admin', 'support', 'hỗ trợ', 'cskh', 'quản trị', 'mod'];

// Admin của từng group mình quản trị (trang đầu danh sách thành viên group có sẵn mục admin)
async function refreshAdmins(client, groups, prev, now, force = false) {
  const ids = groups.filter((g) => !g.error).map((g) => g.id);
  if (!force && prev?.at && now - prev.at < ADMINS_TTL && ids.every((id) => (prev.ids || []).includes(id))) return prev;
  const byGroup = {};
  await mapLimit(
    groups.filter((g) => !g.error),
    PARALLEL,
    async (g) => {
      const r = await client.call('GET', `group/groups/${g.id}/users?limit=100&offset=0`);
      if (BG.isOk(r)) byGroup[g.id] = (r.body.data?.groupAdmin?.data || []).map(BG.slimPerson).filter((a) => a?.id);
      else if (prev?.byGroup?.[g.id]) byGroup[g.id] = prev.byGroup[g.id];
    },
  );
  return { at: now, ids, byGroup };
}

// Người vào group g trong khoảng from–to (mới nhất trước): [{ id, time, user }]
async function readJoins(client, g, from, to) {
  const joins = [];
  for (let page = 1; page <= JOIN_PAGES; page++) {
    const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: 100, page, sort: 'desc', useCase: JOIN_CASES, from: Math.floor(from), to: Math.ceil(to) })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: BG.errMsg(r) };
    const list = (Array.isArray(r.body.data) ? r.body.data : []).map(BG.slimActivity);
    joins.push(...list.filter((a) => a.user?.id).map((a) => ({ id: a.id, time: a.time, user: a.user })));
    if (list.length < 100) break;
  }
  return { status: 'ok', joins };
}

function impostorItem(user, g, imp, at, source) {
  return { key: `${g.communityId || g.id}:${user.id}`, user: BG.slimPerson(user), groupId: g.id, groupName: g.communityName || g.name, communityId: g.communityId || '', level: imp.level, reason: imp.text, at, source };
}

// Sau mỗi lần quét (cài đặt guardJoins): người vào từ lần trước (tối đa 24 giờ) -> tài khoản giống admin, đợt vào ồ ạt.
// Ghi vào next (state): admins, joinSince, recentJoins, impostors, bursts. Thông báo khi notifyAllowed.
async function guardJoins(client, { settings, state, next, notifyAllowed, now = Date.now() }) {
  if (!settings.guardJoins) return { status: 'ok', skipped: true };
  const groups = next.snapshot?.groups || [];
  next.admins = await refreshAdmins(client, groups, state.admins, now);
  const since = { ...(state.joinSince || {}) };
  const recent = { ...(state.recentJoins || {}) };
  const impostors = [...(state.impostors || [])];
  const known = new Set(impostors.map((x) => x.key));
  const okIds = new Set(state.impostorOk || []);
  const bursts = Object.fromEntries(Object.entries(state.bursts || {}).filter(([, b]) => now - b.at < JOIN_KEEP_MS));
  const freshImp = [];
  const freshBursts = [];
  for (const g of sweepScopes(groups)) {
    const r = await readJoins(client, g, Math.max(since[g.id] || now - 2 * 3600e3, now - JOIN_KEEP_MS), now);
    if (r.status === 'need_login') return r;
    if (r.status !== 'ok') continue;
    since[g.id] = now;
    const seen = new Set((recent[g.id] || []).map((j) => j.id));
    const add = r.joins.filter((j) => !seen.has(j.id));
    recent[g.id] = [...add, ...(recent[g.id] || [])].filter((j) => now - Date.parse(j.time) <= JOIN_KEEP_MS).slice(0, JOIN_KEEP_MAX);
    const admins = BG.adminsOf(next.admins.byGroup, g, groups);
    // Cũ trước mới sau, mỗi người thêm lên đầu: danh sách mới nhất ở trên
    for (const j of [...add].reverse()) {
      const imp = BG.impersonation(j.user, admins);
      if (!imp) continue;
      const item = impostorItem(j.user, g, imp, j.time, 'join');
      if (known.has(item.key) || okIds.has(j.user.id)) continue;
      known.add(item.key);
      impostors.unshift(item);
      freshImp.unshift(item);
    }
    const b = BG.joinBurst(recent[g.id], { minutes: BURST_MINUTES, now });
    const prev = bursts[g.id];
    if (b.count >= (Number(settings.burstJoins) || 30) && (!prev || now - prev.at >= BURST_QUIET_MS)) {
      bursts[g.id] = { at: now, groupId: g.id, groupName: g.communityName || g.name, minutes: BURST_MINUTES, count: b.count, noAvatar: b.noAvatar, from: b.from, to: b.to, dismissed: false };
      freshBursts.push(bursts[g.id]);
    }
  }
  Object.assign(next, { joinSince: since, recentJoins: recent, impostors: impostors.slice(0, IMPOSTOR_MAX), bursts });
  if (notifyAllowed && freshImp.length) {
    notify(
      'bg-impostor',
      `BeinFusion: ${freshImp.length} tài khoản giống admin vừa vào`,
      freshImp
        .slice(0, 3)
        .map((x) => `${x.user.fullname || x.user.username} (${x.groupName}) — ${x.reason}`)
        .join(' · ') + '. Bấm để xem, cấm hoặc xoá.',
    );
  }
  if (notifyAllowed) {
    for (const b of freshBursts) notify('bg-burst-' + b.groupId, `BeinFusion: ${b.count} người vào ${b.groupName} trong ${b.minutes} phút`, `${b.noAvatar} người không có ảnh đại diện. Có thể là đợt tài khoản ảo — bấm để xem, bật Duyệt thành viên hoặc xoá hàng loạt.`);
  }
  return { status: 'ok', impostors: freshImp.length, bursts: freshBursts.length };
}

// Tìm trong toàn bộ thành viên (nút ở thẻ Bảo vệ community): tìm theo tên / username từng admin và các chữ "admin, hỗ trợ…",
// rồi so từng người tìm được. Chỉ đọc.
async function doGuardSearch({ groupId = '' } = {}) {
  const { state } = await load();
  const groups = state.snapshot?.groups || [];
  const scopes = sweepScopes(groups, groupId);
  if (!scopes.length) return { status: 'error', message: 'Không có group nào để tìm — hãy quét lại' };
  const now = Date.now();
  const res = await withClient(async (client) => {
    const admins = await refreshAdmins(client, groups, state.admins, now, true);
    const found = [];
    let checked = 0;
    let needLogin = false;
    for (const g of scopes) {
      const list = BG.adminsOf(admins.byGroup, g, groups);
      const keys = [...new Set([...list.flatMap((a) => [a.fullname, a.username, ...String(a.fullname || '').split(/\s+/).filter((w) => w.length >= 3)]), ...STAFF_KEYS].map((k) => String(k || '').trim()).filter((k) => k.length >= 3))].slice(0, 40);
      const users = new Map();
      await mapLimit(keys, PARALLEL, async (key) => {
        const r = await client.call('GET', `group/groups/${g.id}/users?${qs({ limit: SEARCH_LIMIT_USERS, offset: 0, key })}`);
        if (r.status === 401) return (needLogin = true);
        if (!BG.isOk(r)) return;
        for (const u of r.body.data?.groupMember?.data || []) if (u?.id) users.set(u.id, u);
      });
      if (needLogin) return { ...NEED_LOGIN };
      checked += users.size;
      for (const u of users.values()) {
        const imp = BG.impersonation(u, list);
        if (imp) found.push(impostorItem(u, g, imp, new Date(now).toISOString(), 'search'));
      }
    }
    return { status: 'ok', admins, found, checked };
  });
  if (res.status !== 'ok') return res;
  // Ghi vào state (đọc lại state mới nhất: lệnh này chạy trong hàng đợi)
  const cur = await load();
  const okIds = new Set(cur.state.impostorOk || []);
  const impostors = [...(cur.state.impostors || [])];
  const known = new Set(impostors.map((x) => x.key));
  const added = res.found.filter((x) => !known.has(x.key) && !okIds.has(x.user.id));
  await chrome.storage.local.set({ state: { ...cur.state, admins: res.admins, impostors: [...added, ...impostors].slice(0, IMPOSTOR_MAX) } });
  return { status: 'ok', checked: res.checked, found: res.found.filter((x) => !okIds.has(x.user.id)).length, added: added.length, admins: Object.values(res.admins.byGroup).reduce((s, l) => s + l.length, 0) };
}

// Thẻ Bảo vệ community: "Không phải" (bỏ khỏi danh sách và không báo lại người này), bỏ đợt vào ồ ạt, bỏ người đã xoá / cấm
async function doGuardAct({ action, userIds = [], groupId = '' }) {
  const { state } = await load();
  const next = { ...state };
  const ids = new Set(userIds || []);
  if (action === 'notImpostor' || action === 'clear') {
    if (!ids.size) return { status: 'error', message: 'Thiếu người' };
    next.impostors = (state.impostors || []).filter((x) => !ids.has(x.user?.id));
    if (action === 'notImpostor') next.impostorOk = [...ids, ...(state.impostorOk || []).filter((id) => !ids.has(id))].slice(0, 500);
  } else if (action === 'dismissBurst') {
    if (!state.bursts?.[groupId]) return { status: 'error', message: 'Không còn đợt này' };
    next.bursts = { ...state.bursts, [groupId]: { ...state.bursts[groupId], dismissed: true } };
  } else return { status: 'error', message: 'Thao tác không hợp lệ' };
  await chrome.storage.local.set({ state: next });
  return { status: 'ok' };
}
