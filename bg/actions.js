// Service worker — thao tác với yêu cầu tham gia, bài, bình luận, đợt spam, thành viên (đọc danh sách, xoá, cấm, gỡ cấm).

async function doAct({ action, groupId, requestIds, source = 'manual' }) {
  if (action !== 'approve' && action !== 'decline') return { status: 'error', message: 'Thao tác không hợp lệ' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (!g.canApprove) return { status: 'error', message: 'Tài khoản không có quyền duyệt thành viên ở group này' };
  const items = (requestIds || [])
    .map((id) => g.requests.find((r) => r.id === id))
    .filter(Boolean)
    .map((req) => memberItem(source, action, g, req));
  if (!items.length) return { status: 'error', message: 'Không còn yêu cầu nào để xử lý — hãy quét lại' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = { ...state, snapshot: { ...state.snapshot, groups: removeHandled(groups, r.entries) } };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Duyệt / từ chối bài chờ duyệt (groupId = group gốc của community)
async function doApprovalAct({ action, groupId, contentIds, reason = '', source = 'manual' }) {
  if (action !== 'approve' && action !== 'reject') return { status: 'error', message: 'Thao tác không hợp lệ' };
  const { settings, state, log } = await load();
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy community — hãy quét lại' };
  const body = action === 'approve' ? { status: 'APPROVED' } : { status: 'REJECTED', rejectionReason: { reason: String(reason || '').trim() || null } };
  const items = (contentIds || [])
    .map((id) => (g.approvals || []).find((p) => p.id === id))
    .filter(Boolean)
    .map((post) => ({
      log: { ...postLog(source, action, post, g), ...(action === 'reject' && body.rejectionReason.reason ? { reason: body.rejectionReason.reason } : {}) },
      call: (c) => c.call('PUT', `content/contents/approval-contents/${post.id}`, body),
      gone: true,
    }));
  if (!items.length) return { status: 'error', message: 'Không còn bài nào để xử lý — hãy quét lại' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  // Đếm bài được duyệt / bị từ chối của từng người (để tự duyệt người đã được duyệt đủ N bài)
  const next = { ...state, snapshot: { ...state.snapshot, groups: removeHandledPosts(groups, r.entries) }, postTrust: BG.tallyPostTrust(state.postTrust, r.entries) };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Ẩn bài đã đăng khỏi các group mình quản trị; "bỏ qua" chỉ đánh dấu trong addon
async function doPostAct({ action, contentIds, reasonType = 'OTHERS', source = 'manual' }) {
  const { settings, state, log } = await load();
  const recent = state.recentPosts || [];
  const ids = new Set(contentIds || []);
  if (action === 'dismiss' || action === 'undismiss') {
    const next = { ...state, recentPosts: recent.map((p) => (ids.has(p.id) ? { ...p, dismissed: action === 'dismiss' } : p)) };
    await chrome.storage.local.set({ state: next });
    await updateBadge();
    return { status: 'ok', ok: ids.size, dry: 0, failed: 0, errors: [], dryRun: false };
  }
  // Xoá bài: Beincom chỉ cho xoá bài của chính mình (admin chỉ ẩn được bài người khác)
  if (action === 'delete') {
    const meId = state.me?.id;
    if (!meId) return { status: 'error', message: 'Chưa biết tài khoản đang đăng nhập — hãy quét lại' };
    const groups = state.snapshot?.groups || [];
    const items = recent
      .filter((p) => ids.has(p.id) && p.actor?.id === meId)
      .map((post) => ({ log: postLog(source, 'delete', post, groups.find((g) => post.seenIn?.includes(g.id))), call: (c) => c.call('DELETE', `content/posts/${post.id}`), gone: true }));
    if (!items.length) return { status: 'error', message: 'Chỉ xoá được bài của chính bạn. Bài của người khác hãy dùng "Ẩn bài".' };
    const r = await performActions(items, settings);
    pushLog(log, r.entries);
    const gone = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
    const next = { ...state, recentPosts: recent.filter((p) => !gone.has(p.id)) };
    if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
    await chrome.storage.local.set({ state: next, log });
    await updateBadge();
    return summary(r, settings);
  }
  if (action !== 'hide') return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (!BG.HIDE_REASONS[reasonType]) return { status: 'error', message: 'Lý do ẩn không hợp lệ' };

  const groups = state.snapshot?.groups || [];
  const items = recent
    .filter((p) => ids.has(p.id) && !p.isHidden)
    .map((post) => postHideItem(post, groups, reasonType, source))
    .filter(Boolean);
  if (!items.length) return { status: 'error', message: 'Không có bài nào ẩn được (bài đã ẩn hoặc không thuộc group bạn quản trị)' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const hidden = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
  const gone = new Set(r.entries.filter((e) => e.gone).map((e) => e.contentId));
  const next = {
    ...state,
    recentPosts: recent.filter((p) => !gone.has(p.id)).map((p) => (hidden.has(p.id) ? { ...p, isHidden: true } : p)),
    snapshot: dropFromSnapshot(state.snapshot, 'flaggedIds', hidden),
  };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Bình luận: bỏ qua / hiện lại (chỉ trong addon) hoặc ẩn trên Beincom (POST content/comments/{id}/hide { reasonType }, như web)
async function doCommentAct({ action, commentIds, reasonType = 'OTHERS', source = 'manual' }) {
  const { settings, state, log } = await load();
  const recent = state.recentComments || [];
  const ids = new Set(commentIds || []);
  if (action === 'dismiss' || action === 'undismiss') {
    const next = { ...state, recentComments: recent.map((c) => (ids.has(c.id) ? { ...c, dismissed: action === 'dismiss' } : c)) };
    await chrome.storage.local.set({ state: next });
    await updateBadge();
    return { status: 'ok', ok: ids.size, dry: 0, failed: 0, errors: [], dryRun: false };
  }
  if (action !== 'hide') return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (!BG.HIDE_REASONS[reasonType]) return { status: 'error', message: 'Lý do ẩn không hợp lệ' };
  const groups = state.snapshot?.groups || [];
  const items = recent.filter((c) => ids.has(c.id) && !c.isHidden).map((c) => commentHideItem(c, groups, reasonType, source));
  if (!items.length) return { status: 'error', message: 'Không có bình luận nào ẩn được (đã ẩn hoặc không còn trong danh sách)' };
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const hidden = new Set(r.entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
  const gone = new Set(r.entries.filter((e) => e.gone).map((e) => e.contentId));
  const next = { ...state, recentComments: recent.filter((c) => !gone.has(c.id)).map((c) => (hidden.has(c.id) ? { ...c, isHidden: true } : c)) };
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Đợt spam: ẩn cả đợt (bài + bình luận) hoặc bỏ qua / hiện lại đợt (chỉ trong addon)
async function doSpamAct({ action, key = '', postIds = [], commentIds = [], reasonType = 'SPAM', source = 'manual' }) {
  const { settings, state, log } = await load();
  if (action === 'dismiss' || action === 'undismiss') {
    if (!key) return { status: 'error', message: 'Thiếu đợt spam' };
    const list = (state.dismissedWaves || []).filter((k) => k !== key);
    const next = { ...state, dismissedWaves: action === 'dismiss' ? [key, ...list].slice(0, 200) : list };
    await chrome.storage.local.set({ state: next });
    return { status: 'ok', ok: 1, dry: 0, failed: 0, errors: [], dryRun: false };
  }
  if (action !== 'hide') return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (!BG.HIDE_REASONS[reasonType]) return { status: 'error', message: 'Lý do ẩn không hợp lệ' };
  const groups = state.snapshot?.groups || [];
  const pIds = new Set(postIds);
  const cIds = new Set(commentIds);
  const items = [
    ...(state.recentPosts || []).filter((p) => pIds.has(p.id) && !p.isHidden).map((p) => postHideItem(p, groups, reasonType, source)),
    ...(state.recentComments || []).filter((c) => cIds.has(c.id) && !c.isHidden).map((c) => commentHideItem(c, groups, reasonType, source)),
  ].filter(Boolean);
  if (!items.length) return { status: 'error', message: 'Không còn bài / bình luận nào để ẩn trong đợt này' };
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = { ...state };
  markHidden(next, r.entries);
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return summary(r, settings);
}

// Lệnh cấm một người ở các community (dùng cho Cấm ở mọi community và Dọn tài khoản)
function banItems(targets, user, reason, source) {
  return targets.map((g) => ({
    log: { kind: 'manage', source, action: 'ban', groupId: g.id, groupName: g.name, communityName: g.communityName || g.name, userId: user.id, username: user.username || '', fullname: user.fullname || '', reason: BG.BAN_REASONS[reason] },
    call: memberActionCall('ban', g, user.id, reason),
  }));
}

// Cấm một người ở mọi community mình là chủ / admin (POST group/communities/{cid}/users/{uid}/ban)
async function doBanEverywhere({ user, reason = 'VIOLATE_RULE', source = 'manual' }) {
  if (!user?.id) return { status: 'error', message: 'Thiếu người cần cấm' };
  if (!BG.BAN_REASONS[reason]) return { status: 'error', message: 'Lý do cấm không hợp lệ' };
  const { settings, state, log } = await load();
  const targets = BG.banTargets(state.snapshot?.groups);
  if (!targets.length) return { status: 'error', message: 'Bạn không là chủ / admin community nào nên không cấm được' };
  const items = banItems(targets, user, reason, source);
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return { ...summary(r, settings), done: r.entries.filter((e) => e.status === 'ok').map((e) => e.groupId) };
}

// Viết bình luận vào bài (commentId rỗng) hoặc trả lời một bình luận gốc (như web)
async function doCommentWrite({ postId, commentId = '', content, mentions = {}, source = 'manual' }) {
  const err = BG.validateComment(content);
  if (err) return { status: 'error', message: err };
  if (!postId) return { status: 'error', message: 'Thiếu bài cần bình luận' };
  const { settings, state, log } = await load();
  const post = (state.recentPosts || []).find((p) => p.id === postId) || (state.recentComments || []).find((c) => c.postId === postId && c.groups?.length) || {};
  const groups = state.snapshot?.groups || [];
  const g = groups.find((x) => post.seenIn?.includes(x.id)) || post.groups?.[0];
  const body = { postId, content: String(content).trim(), media: { images: [] }, mentions: mentions || {} };
  const item = {
    log: {
      kind: 'comment',
      source,
      action: commentId ? 'reply' : 'comment',
      groupId: g?.id || '',
      groupName: g?.name || '',
      communityName: g?.communityName || '',
      contentId: commentId || '',
      postId,
      contentType: 'COMMENT',
      snippet: body.content.replace(/\s+/g, ' ').slice(0, 120),
    },
    call: (c) => c.call('POST', commentId ? `content/comments/${commentId}/reply` : 'content/comments', body),
  };
  let created = null;
  const r = await performActions([{ ...item, call: async (c) => {
    const res = await item.call(c);
    if (BG.isOk(res) && res.body.data?.id) created = res.body.data;
    return res;
  } }], settings);
  // Nhật ký ghi id bình luận mới (trả lời thì nhớ thêm bình luận được trả lời)
  if (created) r.entries[0] = { ...r.entries[0], contentId: created.id, replyTo: commentId || '' };
  pushLog(log, r.entries);
  const next = { ...state };
  // Bình luận vừa viết vào danh sách luôn (không cần chờ lần quét sau)
  if (created) {
    const postInfo = (state.recentPosts || []).find((p) => p.id === postId) || { id: postId, groups: post.groups || [], seenIn: post.seenIn || [], type: post.postType || 'POST', text: post.postSnippet || '' };
    const c = BG.slimComment({ ...created, actor: created.actor || state.me || {} }, postInfo);
    next.recentComments = BG.mergeComments(state.recentComments, [c]).list;
  }
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  return { ...summary(r, settings), commentId: created?.id || null };
}

// Người mới vào group trong `days` ngày: group gốc đọc danh sách thành viên (mới vào trước), group con đọc nhật ký hoạt động
const NEW_MEMBER_PAGES = 10;
async function doNewMembers({ groupId, days = 7 }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  const since = Date.now() - Math.max(1, Math.min(90, Number(days) || 7)) * 864e5;
  return withClient(async (client) => {
    const items = [];
    let truncated = false;
    if (g.isCommunity) {
      let offset = 0;
      for (let page = 0; page < NEW_MEMBER_PAGES; page++) {
        const r = await client.call('GET', `group/manage/communities/${g.communityId}/members?${qs({ limit: PAGE, offset, sort: 'joined_at:desc' })}`);
        if (r.status === 401) return { ...NEED_LOGIN };
        if (!BG.isOk(r)) return { status: 'error', message: 'Đọc thành viên lỗi: ' + BG.errMsg(r) };
        const list = (Array.isArray(r.body.data) ? r.body.data : []).map((u) => BG.slimMember(u));
        const fresh = list.filter((u) => Date.parse(u.joinedAt) >= since);
        items.push(...fresh);
        offset += list.length;
        if (fresh.length < list.length || !r.body.meta?.hasNextPage || !list.length) break;
        if (page === NEW_MEMBER_PAGES - 1) truncated = true;
      }
      return { status: 'ok', source: 'members', since, truncated, items: items.filter((u) => !u.isDeactivated && !u.isAdmin && !u.isCommunityAdmin) };
    }
    const events = [];
    for (let page = 1; page <= NEW_MEMBER_PAGES; page++) {
      const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: PAGE, page, sort: 'desc' })}`);
      if (r.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(r)) return { status: 'error', message: 'Đọc nhật ký hoạt động lỗi: ' + BG.errMsg(r) };
      const list = (Array.isArray(r.body.data) ? r.body.data : []).map(BG.slimActivity);
      events.push(...list);
      if (!list.length || !r.body.meta?.hasNextPage || list.some((a) => Date.parse(a.time) < since)) break;
      if (page === NEW_MEMBER_PAGES) truncated = true;
    }
    return { status: 'ok', source: 'activity', since, truncated, items: BG.newMembersFromActivity(events, since) };
  });
}

// ---------- Thành viên (đọc khi Dashboard cần, không lưu vào storage) ----------

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

async function findGroup(groupId) {
  const { state } = await load();
  return (state.snapshot?.groups || []).find((x) => x.id === groupId) || null;
}

// Group gốc: danh sách community (có ngày vào, sắp xếp được) + danh sách admin group gốc ở trang đầu.
// Group con: group/groups/{id}/users (admin trước, rồi thành viên; offset tính chung).
async function doMembers({ groupId, key = '', offset = 0, limit = 50, sort = '' }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  return withClient(async (client) => {
    if (g.isCommunity) {
      const r = await client.call('GET', `group/manage/communities/${g.communityId}/members?${qs({ limit, offset, key, sort })}`);
      if (r.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(r)) return { status: 'error', message: 'Đọc thành viên lỗi: ' + BG.errMsg(r) };
      let adminIds = null;
      if (offset === 0) {
        const a = await client.call('GET', `group/groups/${g.id}/users?limit=100&offset=0`);
        if (BG.isOk(a)) adminIds = (a.body.data?.groupAdmin?.data || []).map((x) => x.id);
      }
      const list = Array.isArray(r.body.data) ? r.body.data : [];
      const items = list.map((u) => BG.slimMember(u, { isAdmin: adminIds ? adminIds.includes(u.id) : false }));
      return { status: 'ok', items, adminIds, total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage, nextOffset: offset + list.length };
    }
    const r = await client.call('GET', `group/groups/${g.id}/users?${qs({ limit, offset, key })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc thành viên lỗi: ' + BG.errMsg(r) };
    const d = r.body.data || {};
    const items = [...(d.groupAdmin?.data || []).map((u) => BG.slimMember(u, { isAdmin: true })), ...(d.groupMember?.data || []).map((u) => BG.slimMember(u, { isAdmin: false }))];
    return { status: 'ok', items, total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage, nextOffset: offset + items.length };
  });
}

async function doActivity({ groupId, page = 1, useCase = '' }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  return withClient(async (client) => {
    const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: PAGE, page, sort: 'desc', useCase })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc nhật ký hoạt động lỗi: ' + BG.errMsg(r) };
    const list = Array.isArray(r.body.data) ? r.body.data : [];
    const items = list.map(BG.slimActivity);
    noteAndFlush(BG.violationsFromActivity(items));
    return { status: 'ok', items, total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage };
  });
}

const MEMBER_ACTIONS = {
  remove: { perm: 'canRemove', denied: 'xoá thành viên' },
  assignAdmin: { perm: 'canAssign', denied: 'gán admin' },
  revokeAdmin: { perm: 'canAssign', denied: 'gỡ admin' },
  ban: { perm: 'canBan', denied: 'cấm thành viên (cần quyền admin community)' },
  unban: { perm: 'canBan', denied: 'gỡ cấm (cần quyền admin community)' },
};

function memberActionCall(action, g, userId, reason) {
  if (action === 'remove') return (c) => c.call('PUT', `group/groups/${g.id}/users/remove`, { user_ids: [userId] });
  if (action === 'assignAdmin') return (c) => c.call('PUT', `group/groups/${g.id}/assign-admin`, { user_id: userId });
  if (action === 'revokeAdmin') return (c) => c.call('PUT', `group/groups/${g.id}/revoke-admin`, { user_id: userId });
  // Web gửi { communityId, userId } (bộ gọi API nhóm đổi sang snake_case)
  if (action === 'unban') return (c) => c.call('POST', `group/communities/${g.communityId}/users/${userId}/unban`, { community_id: g.communityId, user_id: userId });
  return (c) => c.call('POST', `group/communities/${g.communityId}/users/${userId}/ban`, { reason });
}

// Thành viên bị cấm của community (chỉ chủ / admin community: admin group bị 403)
async function doBanned({ groupId, offset = 0, limit = PAGE }) {
  const g = await findGroup(groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (!g.canBan) return { status: 'error', code: 'not_admin', message: 'Chỉ chủ / admin community mới xem và gỡ được người bị cấm.' };
  return withClient(async (client) => {
    const r = await client.call('GET', `group/communities/${g.communityId}/banned-members?${qs({ limit, offset })}`);
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc danh sách bị cấm lỗi: ' + BG.errMsg(r) };
    const list = Array.isArray(r.body.data) ? r.body.data : r.body.data?.list || [];
    return { status: 'ok', items: list.map(BG.slimBanned).filter((u) => u.id), total: r.body.meta?.total ?? null, hasNext: !!r.body.meta?.hasNextPage, nextOffset: offset + list.length };
  });
}

// users: [{ id, username, fullname }] lấy từ danh sách đang xem trên Dashboard
async function doMemberAct({ action, groupId, users, reason = 'VIOLATE_RULE', source = 'manual' }) {
  const spec = MEMBER_ACTIONS[action];
  if (!spec) return { status: 'error', message: 'Thao tác không hợp lệ' };
  if (action === 'ban' && !BG.BAN_REASONS[reason]) return { status: 'error', message: 'Lý do cấm không hợp lệ' };
  const { settings, state, log } = await load();
  const g = (state.snapshot?.groups || []).find((x) => x.id === groupId);
  if (!g) return { status: 'error', message: 'Không tìm thấy group — hãy quét lại' };
  if (!g[spec.perm]) return { status: 'error', message: `Tài khoản không có quyền ${spec.denied} ở group này` };
  const items = (users || [])
    .filter((u) => u?.id)
    .map((u) => ({
      log: {
        kind: 'manage',
        source,
        action,
        groupId: g.id,
        groupName: g.name,
        communityName: g.communityName || '',
        userId: u.id,
        username: u.username || '',
        fullname: u.fullname || '',
        ...(action === 'ban' ? { reason: BG.BAN_REASONS[reason] } : {}),
      },
      call: memberActionCall(action, g, u.id, reason),
    }));
  if (!items.length) return { status: 'error', message: 'Chưa chọn thành viên nào' };

  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = r.status === 'need_login' ? { ...state, lastResult: { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' } } : state;
  await chrome.storage.local.set({ state: next, log });
  if (r.status === 'need_login') await updateBadge();
  return { ...summary(r, settings), done: r.entries.filter((e) => e.status === 'ok').map((e) => e.userId) };
}

// Dọn tài khoản: ẩn mọi bài / bình luận gần đây (addon đã đọc, còn hiện) của một người trong các group mình quản trị,
// tuỳ chọn cấm ở mọi community mình là chủ / admin. Một lần, chạy lần lượt như các thao tác hàng loạt khác.
async function doCleanupUser({ user, reasonType = 'SPAM', ban = false, banReason = 'SPAM', source = 'manual' }) {
  if (!user?.id) return { status: 'error', message: 'Thiếu người cần dọn' };
  if (!BG.HIDE_REASONS[reasonType]) return { status: 'error', message: 'Lý do ẩn không hợp lệ' };
  if (ban && !BG.BAN_REASONS[banReason]) return { status: 'error', message: 'Lý do cấm không hợp lệ' };
  const { settings, state, log } = await load();
  if (user.id === state.me?.id) return { status: 'error', message: 'Không dọn tài khoản của chính bạn' };
  const groups = state.snapshot?.groups || [];
  const fp = BG.userFootprint(user.id, state.recentPosts, state.recentComments);
  const extra = { autoReason: 'Dọn tài khoản' };
  const items = [...fp.posts.map((p) => postHideItem(p, groups, reasonType, source, extra)), ...fp.comments.map((c) => commentHideItem(c, groups, reasonType, source, extra))].filter(Boolean);
  if (ban) {
    const targets = BG.banTargets(groups);
    if (!targets.length) return { status: 'error', message: 'Bạn không là chủ / admin community nào nên không cấm được' };
    items.push(...banItems(targets, user, banReason, source));
  }
  if (!items.length) return { status: 'error', message: 'Không còn bài / bình luận nào của người này để ẩn (trong các bài addon đã đọc)' };
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const next = { ...state };
  markHidden(next, r.entries);
  if (r.status === 'need_login') next.lastResult = { status: 'need_login', message: NEED_LOGIN.message, mode: r.mode || '' };
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  const ok = r.entries.filter((e) => e.status === 'ok');
  return { ...summary(r, settings), hidden: ok.filter((e) => e.action === 'hide').length, banned: ok.filter((e) => e.action === 'ban').length };
}
