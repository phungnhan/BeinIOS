// Service worker — quét (chỉ đọc), ghi kết quả quét, tự ẩn spam, đợt spam, quét tự động / tải lại từng phần.

// ---------- Quét (chỉ đọc) ----------

async function readGroup(client, admin) {
  const g = {
    id: admin.id,
    name: admin.id,
    roles: admin.roles,
    canApprove: admin.canApprove,
    canRemove: admin.canRemove,
    canAssign: admin.canAssign,
    requests: [],
    questions: [],
    pendingTotal: 0,
    approvalCount: null,
  };
  const info = await client.call('GET', `group/groups/${admin.id}`);
  if (!BG.isOk(info) || !info.body.data) return { ...g, error: 'Đọc group lỗi: ' + BG.errMsg(info) };
  const d = info.body.data;
  Object.assign(g, {
    name: d.name || admin.id,
    communityId: d.communityId,
    communityName: d.community?.name || d.name || '',
    isCommunity: !!d.isCommunity,
    rootGroupId: d.rootGroupId || (d.isCommunity ? d.id : ''),
    level: d.level ?? 0,
    privacy: d.privacy || '',
    userCount: d.userCount ?? null,
    settings: {
      isJoinApproval: !!d.settings?.isJoinApproval,
      contentApproval: !!d.settings?.contentApproval?.value,
      isActiveMembershipQuestions: !!d.settings?.isActiveMembershipQuestions,
    },
  });
  if (!admin.canApprove) return g;

  for (let offset = 0; offset < MAX_REQUESTS; offset += PAGE) {
    const r = await client.call('GET', `group/groups/${admin.id}/join-requests?limit=${PAGE}&offset=${offset}`);
    if (!BG.isOk(r)) {
      g.error = 'Đọc yêu cầu tham gia lỗi: ' + BG.errMsg(r);
      break;
    }
    const list = Array.isArray(r.body.data) ? r.body.data : [];
    g.requests.push(...list.map(BG.slimRequest));
    g.pendingTotal = r.body.meta?.total ?? g.requests.length;
    if (!r.body.meta?.hasNextPage || !list.length) break;
  }

  if (g.requests.length && g.settings.isActiveMembershipQuestions) {
    const q = await client.call('GET', `group/groups/${admin.id}/membership-questions`);
    if (BG.isOk(q) && Array.isArray(q.body.data)) g.questions = q.body.data.map(BG.slimQuestion);
  }
  return g;
}

// Hàng chờ duyệt bài của một community (g là group gốc). Danh sách chỉ có 500 ký tự đầu,
// nên tải chi tiết từng bài mới; bài đã tải ở lần quét trước thì dùng lại.
async function readApprovals(client, g, prevById) {
  const raw = [];
  let after = '';
  while (raw.length < MAX_APPROVALS) {
    const q = `content/manage/communities/${g.id}/approval-contents?limit=${CONTENT_PAGE}&approvalStatus=WAITING_APPROVAL` + (after ? `&after=${encodeURIComponent(after)}` : '');
    const r = await client.call('GET', q);
    if (!BG.isOk(r)) {
      g.approvalError = 'Đọc bài chờ duyệt lỗi: ' + BG.errMsg(r);
      break;
    }
    const list = r.body.data?.list || [];
    raw.push(...list);
    after = r.body.data?.meta?.endCursor || '';
    if (!r.body.data?.meta?.hasNextPage || !list.length || !after) break;
  }

  // Bài mới (chưa tải đầy đủ ở lần trước): tải chi tiết tối đa DETAIL_PER_SCAN bài, song song
  const need = raw.filter((it) => !prevById.get(it.id)?.full).slice(0, DETAIL_PER_SCAN);
  const details = new Map();
  await mapLimit(need, PARALLEL, async (it) => {
    const d = await client.call('GET', `content/manage/communities/${g.id}/approval-contents/${it.id}`);
    if (BG.isOk(d) && d.body.data) details.set(it.id, d.body.data);
  });
  g.approvals = raw.map((it) => {
    const prev = prevById.get(it.id);
    if (prev?.full) return { ...BG.slimPost(it), text: prev.text, full: true };
    const detail = details.get(it.id);
    return { ...BG.slimPost(detail ? { ...it, ...detail } : it), full: !!detail };
  });
}

async function readTimeline(client, g) {
  const r = await client.call('GET', `content/timeline/${g.id}?limit=${TIMELINE_LIMIT}`);
  if (!BG.isOk(r)) return { error: 'Đọc bài mới lỗi: ' + BG.errMsg(r), posts: [] };
  return { posts: (r.body.data?.list || []).map(BG.slimPost) };
}

// Bài chờ duyệt tính theo community, gọi bằng ID group gốc (chỉ khi đang quản trị group gốc)
async function readApprovalCount(client, g) {
  if (!g.isCommunity || !g.settings?.contentApproval) return;
  const c = await client.call('GET', `content/manage/communities/${g.id}/approval-contents/count?approvalStatus=WAITING_APPROVAL`);
  if (BG.isOk(c) && typeof c.body.data === 'number') g.approvalCount = c.body.data;
}

// Phần group: quyền, thông tin group, yêu cầu tham gia (+ số bài chờ duyệt)
async function scanGroupsPart(client, { approvalCounts = true } = {}) {
  const p = await client.call('GET', 'group/me/permissions');
  if (p.status === 401) return { ...NEED_LOGIN };
  if (!BG.isOk(p)) return { status: 'error', message: 'Đọc quyền lỗi: ' + BG.errMsg(p) };

  const groups = [];
  groups.push(...(await mapLimit(BG.adminGroups(p.body.data), PARALLEL, (admin) => readGroup(client, admin))));
  for (const g of groups) {
    g.canBan = BG.canBan(p.body.data, g.communityId);
    g.isCommunityAdmin = BG.isCommunityAdmin(p.body.data, g.communityId);
    g.canEditJoin = BG.hasGroupPerm(p.body.data, g.id, 'edit_join_setting');
    g.canEditPrivacy = BG.hasGroupPerm(p.body.data, g.id, 'edit_privacy');
    g.canPostAsGroup = BG.hasGroupPerm(p.body.data, g.id, 'crud_post_article'); // tạo bài dưới tên group (web còn cần Beincom bật tính năng)
  }
  if (approvalCounts) await mapLimit(groups, PARALLEL, (g) => readApprovalCount(client, g));
  // Community có việc lên trước; trong community, group gốc trước rồi tới group con
  return { status: 'ok', groups: BG.sortGroupTree(groups) };
}

// Phần nội dung: hàng chờ duyệt bài (đầy đủ) và bài mới đăng. Sửa trực tiếp các group được truyền vào.
async function scanContentPart(client, groups, prevGroups, scanPosts) {
  const prevApprovals = new Map((prevGroups || []).flatMap((g) => g.approvals || []).map((x) => [x.id, x]));
  for (const g of groups) {
    if (!g.isCommunity || !g.settings?.contentApproval) continue;
    await readApprovalCount(client, g);
    if (g.approvalCount) await readApprovals(client, g, prevApprovals);
    else g.approvals = [];
  }

  // Bài mới đăng của từng group (một bài có thể đăng vào nhiều group)
  const posts = new Map();
  if (scanPosts) {
    const ok = groups.filter((g) => !g.error);
    const results = await mapLimit(ok, PARALLEL, (g) => readTimeline(client, g));
    for (const [i, g] of ok.entries()) {
      const t = results[i];
      if (t.error) g.timelineError = t.error;
      for (const post of t.posts) {
        const old = posts.get(post.id);
        posts.set(post.id, { ...post, seenIn: [...new Set([...(old?.seenIn || []), g.id])] });
      }
    }
  }
  return [...posts.values()];
}

// Bình luận mới của các bài vừa quét: chỉ đọc bài có số bình luận tăng so với lần đọc trước (seen: { postId: số đã đọc }),
// rồi đọc trả lời của các bình luận gốc có số trả lời tăng (prevComments: bình luận đã lưu).
// Trả về { comments, read: { postId: số bình luận lúc đọc } }; bài đọc lỗi thì để lần quét sau.
async function scanCommentsPart(client, posts, seen, prevComments = []) {
  const targets = BG.commentTargets(seen, posts, COMMENT_POSTS_PER_SCAN);
  const read = {};
  const pages = await mapLimit(targets, PARALLEL, async (p) => {
    const r = await client.call('GET', `content/comments?${qs({ postId: p.id, limit: COMMENT_PAGE })}`);
    if (!BG.isOk(r)) return [];
    read[p.id] = p.commentsCount || 0;
    return BG.flattenComments(r.body.data?.list || [], p);
  });
  const comments = pages.flat();
  const byPost = new Map(targets.map((p) => [p.id, p]));
  const parents = BG.replyTargets(comments, prevComments, REPLY_FETCH_PER_SCAN);
  const replies = await mapLimit(parents, PARALLEL, async (c) => {
    const r = await client.call('GET', `content/comments?${qs({ postId: c.postId, parentId: c.id, limit: COMMENT_PAGE })}`);
    return BG.isOk(r) ? BG.flattenComments((r.body.data?.list || []).map((x) => ({ ...x, parentId: c.id })), byPost.get(c.postId)) : [];
  });
  return { comments: [...comments, ...replies.flat()], read };
}

// Số báo cáo chờ xử lý (API trang quản trị Beincom dùng, trả nhanh). null = không đọc được -> đọc danh sách như cũ
async function countReports(client, g) {
  const c = await client.call('GET', `content/manage/communities/${g.id}/content-reports/count`, null, '2.0.0', REPORT_SCAN_TIMEOUT);
  const n = c.body?.data?.total;
  return BG.isOk(c) && Number.isFinite(n) ? n : null;
}

// Phần báo cáo: bài bị Beincom gắn cờ tự động (mọi group đang quản trị) và báo cáo chờ xử lý
// (group gốc của community mình làm chủ / admin). Chỉ đọc trang đầu để đếm và báo cái mới.
// Các group đọc song song vì API báo cáo có lúc treo tới hết thời hạn chờ. Sửa trực tiếp các group được truyền vào.
async function scanReportsPart(client, groups, prevGroups) {
  const prev = new Map((prevGroups || []).map((g) => [g.id, g]));
  await Promise.all(
    groups
      .filter((g) => !g.error)
      .map(async (g) => {
        const old = prev.get(g.id) || {};
        const f = await client.call('GET', `content/manage/groups/${g.id}/contents/flagged?${qs({ limit: TIMELINE_LIMIT })}`);
        g.flaggedIds = BG.isOk(f) ? (f.body.data?.list || []).map((p) => p.id) : old.flaggedIds; // lỗi: giữ số cũ
        if (BG.isOk(f)) noteViolations(BG.violationsFromPosts((f.body.data?.list || []).map(BG.slimPost), 'flagged', (p) => p.violations.join(', ')));
        if (!(g.isCommunity && g.isCommunityAdmin)) return;
        const n = await countReports(client, g);
        if (n === 0) {
          g.reportIds = [];
          return;
        }
        const r = await client.call('GET', `content/manage/communities/${g.id}/content-reports?${qs({ limit: CONTENT_PAGE })}`, null, '2.0.0', REPORT_SCAN_TIMEOUT);
        if (BG.isOk(r)) {
          g.reportIds = (r.body.data?.list || []).filter((x) => (x.status || 'CREATED') === 'CREATED').map((x) => x.id);
          noteViolations(BG.violationsFromReports((r.body.data?.list || []).map(BG.slimReport), g.name));
        }
        // Đã gặp API treo ở community chưa có báo cáo nào -> coi như không có
        else if (r.timeout) g.reportIds = [];
        else g.reportIds = old.reportIds;
      }),
  );
}

// Nhật ký hoạt động mới nhất của từng group: ghi vào hồ sơ vi phạm những lần bị xoá / cấm / từ chối (kể cả do admin khác làm)
async function scanActivityPart(client, groups) {
  await Promise.all(
    groups
      .filter((g) => !g.error)
      .map(async (g) => {
        const r = await client.call('GET', `group/groups/${g.id}/activity-logs?${qs({ limit: PAGE, page: 1, sort: 'desc' })}`);
        if (BG.isOk(r)) noteViolations(BG.violationsFromActivity((Array.isArray(r.body.data) ? r.body.data : []).map(BG.slimActivity)));
      }),
  );
}

async function scanGroups(client, { prevGroups = [], scanPosts = true, scanReports = true, trackViolations = true, scanComments = false, commentSeen = {}, prevComments = [] } = {}) {
  const r = await scanGroupsPart(client, { approvalCounts: false });
  if (r.status !== 'ok') return r;
  // Các phần sửa các trường khác nhau của group nên chạy song song được; bình luận đọc ngay sau khi có bài mới
  let comments = null;
  const [posts] = await Promise.all([
    scanContentPart(client, r.groups, prevGroups, scanPosts).then(async (list) => {
      if (scanPosts && scanComments) comments = await scanCommentsPart(client, list, commentSeen, prevComments);
      return list;
    }),
    scanReports ? scanReportsPart(client, r.groups, prevGroups) : null,
    trackViolations ? scanActivityPart(client, r.groups) : null,
  ]);

  // Tài khoản đang đăng nhập (để nhận ra bài của chính mình). API này không nhận header phiên bản.
  const meRes = await client.call('GET', 'user/me/profile', null, '');
  const me = BG.isOk(meRes) && meRes.body.data?.id ? { id: meRes.body.data.id, username: meRes.body.data.username || '', fullname: meRes.body.data.fullname || '' } : null;

  return { status: 'ok', groups: r.groups, posts, comments, me };
}

// Gộp bài mới vào danh sách đã lưu: giữ đánh dấu "bỏ qua"/"đã ẩn", mới nhất lên trước
function mergeRecent(prev, posts, now) {
  const map = new Map((prev || []).map((p) => [p.id, p]));
  const fresh = [];
  for (const p of posts) {
    const old = map.get(p.id);
    if (!old) fresh.push(p.id);
    map.set(p.id, {
      ...p,
      seenIn: [...new Set([...(old?.seenIn || []), ...(p.seenIn || [])])],
      firstSeen: old?.firstSeen ?? now,
      dismissed: !!old?.dismissed,
      isHidden: p.isHidden || !!old?.isHidden,
    });
  }
  const list = [...map.values()].sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''))).slice(0, RECENT_MAX);
  return { list, fresh };
}

// Bài vi phạm chưa xử lý (để hiện trên huy hiệu)
function flaggedComments(recent, ctx) {
  return (recent || []).filter((c) => !c.dismissed && !c.isHidden && BG.evaluatePostIn(c, ctx).verdict === 'bad');
}

function flaggedPosts(recent, ctx) {
  return (recent || []).filter((p) => !p.dismissed && !p.isHidden && BG.evaluatePostIn(p, ctx).verdict === 'bad');
}

// ---------- Luồng chính ----------

// Ghi kết quả phần group vào trạng thái: yêu cầu mới, số bài chờ duyệt, lịch sử số thành viên.
// Lần đầu chỉ ghi nhận; notifyAllowed = false thì không báo (tải lại từ Dashboard).
function applyGroups(state, next, groups, notifyAllowed, now) {
  const fresh = BG.newRequestIds(groups, state.knownRequestIds);
  if (state.knownRequestIds && fresh.length && notifyAllowed) {
    const withNew = groups.filter((g) => g.requests.some((r) => fresh.includes(r.id)));
    notify('bg-requests', `BeinGroup: ${fresh.length} yêu cầu tham gia mới`, withNew.map((g) => g.name).join(', '), withNew[0] ? BG.memberRequestsUrl(withNew[0]) : '');
  }
  next.knownRequestIds = [...fresh, ...(state.knownRequestIds || [])].slice(0, KNOWN_MAX);

  // Thông báo khi số bài chờ duyệt tăng
  const prevPosts = state.approvalCounts || {};
  const approvalCounts = {};
  for (const g of groups) {
    if (g.approvalCount == null) continue;
    approvalCounts[g.communityId] = g.approvalCount;
    const before = prevPosts[g.communityId];
    if (before != null && g.approvalCount > before && notifyAllowed) {
      notify(`bg-posts-${g.communityId}`, `BeinGroup: ${g.approvalCount} bài chờ duyệt`, g.communityName || g.name, BG.contentApprovalUrl(g.communityId));
    }
  }
  next.approvalCounts = approvalCounts;
  next.snapshot = { at: now, groups };
  // Số thành viên mỗi ngày (giá trị cuối ngày theo giờ VN) để vẽ thống kê khi không có số liệu chính thức
  next.memberHistory = BG.recordMemberHistory(state.memberHistory, groups, now);
  return state.knownRequestIds ? fresh : []; // yêu cầu mới (lần đầu chỉ ghi nhận)
}

// Ghi bài mới đăng: báo bài mới vi phạm (lần quét bài đầu tiên chỉ ghi nhận)
function applyPosts(state, next, posts, ctx, notifyAllowed, now) {
  const { list, fresh } = mergeRecent(state.recentPosts, posts, now);
  const freshSet = new Set(fresh);
  const badNew = list.filter((p) => freshSet.has(p.id) && !p.isHidden && BG.evaluatePostIn(p, ctx).verdict === 'bad');
  noteViolations(BG.violationsFromPosts(badNew, 'rule', (p) => BG.evaluatePostIn(p, ctx).reasons.filter((x) => x.level !== 'ok').map((x) => x.text).join('; ')));
  if (state.recentPosts && badNew.length && notifyAllowed) {
    notify('bg-flagged', `BeinGroup: ${badNew.length} bài mới vi phạm quy tắc`, badNew.map((p) => p.actor.fullname || p.actor.username).join(', '), BG.postUrl(badNew[0]));
  }
  next.recentPosts = list;
  // Lần quét bài đầu tiên chỉ ghi nhận: không coi là mới (để tự ẩn, theo dõi từ khoá)
  if (!state.recentPosts) return { bad: [], fresh: [] };
  return { bad: badNew, fresh: list.filter((p) => freshSet.has(p.id)) };
}

// Ghi bình luận vừa đọc: báo bình luận mới vi phạm (lần đầu đọc bình luận chỉ ghi nhận)
function applyComments(state, next, scan, ctx, notifyAllowed, now) {
  if (!scan) return { bad: [], fresh: [] };
  const { list, fresh } = BG.mergeComments(state.recentComments, scan.comments, now);
  const freshSet = new Set(fresh);
  const reasons = (c) => BG.evaluatePostIn(c, ctx).reasons.filter((x) => x.level !== 'ok').map((x) => x.text).join('; ');
  const badNew = list.filter((c) => freshSet.has(c.id) && !c.isHidden && BG.evaluatePostIn(c, ctx).verdict === 'bad');
  noteViolations(BG.violationsFromComments(badNew, reasons));
  if (state.recentComments && badNew.length && notifyAllowed) {
    notify('bg-comments', `BeinGroup: ${badNew.length} bình luận mới vi phạm quy tắc`, badNew.map((c) => c.actor.fullname || c.actor.username).join(', '), BG.commentUrl(badNew[0]));
  }
  next.recentComments = list;
  // Chỉ nhớ số bình luận đã đọc của các bài còn trong danh sách bài mới
  const keep = new Set((next.recentPosts || state.recentPosts || []).map((p) => p.id));
  next.commentSeen = Object.fromEntries(Object.entries({ ...(state.commentSeen || {}), ...scan.read }).filter(([id]) => keep.has(id)));
  if (!state.recentComments) return { bad: [], fresh: [] };
  return { bad: badNew, fresh: list.filter((c) => freshSet.has(c.id)) };
}

// Bài / bình luận MỚI nhắc tới từ khoá theo dõi (không phải vi phạm): báo để admin vào xem sớm. Bỏ của chính mình.
function notifyWatch(state, next, settings, items, notifyAllowed) {
  const kws = settings.watchKeywords || [];
  if (!kws.length || !notifyAllowed) return;
  const meId = next.me?.id || state.me?.id;
  const hits = items
    .filter((x) => x.actor?.id && x.actor.id !== meId && !x.isHidden)
    .map((x) => ({ x, words: BG.watchHits([x.title, x.text].filter(Boolean).join('\n'), kws) }))
    .filter((h) => h.words.length);
  if (!hits.length) return;
  const words = [...new Set(hits.flatMap((h) => h.words))];
  notify(
    'bg-watch',
    `BeinGroup: ${hits.length} bài / bình luận nhắc tới ${words.slice(0, 3).join(', ')}${words.length > 3 ? '…' : ''}`,
    hits
      .slice(0, 3)
      .map((h) => `${h.x.actor.fullname || h.x.actor.username}: ${String(h.x.title || h.x.text || '').replace(/\s+/g, ' ').slice(0, 60)}`)
      .join(' · '),
    hits[0].x.postId ? BG.commentUrl(hits[0].x) : BG.postUrl(hits[0].x),
  );
}

// Bài của thành viên quá N giờ chưa ai trả lời: nhắc mỗi bài một lần
function remindUnanswered(state, next, settings, notifyAllowed) {
  if (!settings.remindUnanswered || !notifyAllowed) return;
  const meId = next.me?.id || state.me?.id;
  const done = new Set(state.remindedIds || []);
  const due = (next.recentPosts || []).filter((p) => !p.dismissed && !done.has(p.id) && BG.isUnanswered(p, { minHours: settings.unansweredHours, meId }));
  if (!due.length) return;
  notify(
    'bg-unanswered',
    `BeinGroup: ${due.length} bài chưa ai trả lời quá ${settings.unansweredHours} giờ`,
    due
      .slice(0, 3)
      .map((p) => `${p.actor.fullname || p.actor.username}: ${String(p.title || p.text || '').replace(/\s+/g, ' ').slice(0, 60)}`)
      .join(' · '),
    BG.postUrl(due[0]),
  );
  next.remindedIds = [...due.map((p) => p.id), ...(state.remindedIds || [])].slice(0, 500);
}

// Nhắc việc tồn đọng: yêu cầu tham gia / bài chờ duyệt đã chờ quá pendingHours giờ, mỗi việc nhắc một lần
function remindPending(state, next, settings, notifyAllowed, now) {
  if (!settings.remindPending || !notifyAllowed) return;
  const overdue = BG.pendingOverdue(next.snapshot?.groups, { hours: settings.pendingHours, now });
  const { fresh, reminded } = BG.pendingReminder(overdue, state.pendingReminded);
  next.pendingReminded = reminded;
  if (!fresh.length) return;
  const t = BG.pendingText(fresh, { hours: settings.pendingHours, now });
  const first = fresh[0];
  const g = (next.snapshot?.groups || []).find((x) => x.id === first.groupId);
  notify('bg-pending', t.title, t.message, first.kind === 'post' ? BG.contentApprovalUrl(first.communityId) : g ? BG.memberRequestsUrl(g) : '');
}

// ---------- Spam: tự ẩn, đợt spam ----------

// Lệnh ẩn một bài: chỉ ẩn ở những group bài được đăng mà mình quản trị
function postHideItem(post, groups, reasonType, source, extra = {}) {
  const adminIds = new Set(groups.map((g) => g.id));
  const groupIds = [...new Set([...(post.groups || []).map((x) => x.id).filter((id) => adminIds.has(id)), ...(post.seenIn || []).filter((id) => adminIds.has(id))])];
  if (!groupIds.length) return null;
  const g = groups.find((x) => x.id === groupIds[0]);
  return {
    log: { ...postLog(source, 'hide', post, g), reason: BG.HIDE_REASONS[reasonType], groupIds, ...extra },
    call: (c) => c.call('POST', `content/contents/${post.id}/hide`, { reasonType, groupIds }),
    gone: true,
  };
}

// Lệnh ẩn một bình luận (POST content/comments/{id}/hide { reasonType }, như web)
function commentHideItem(c, groups, reasonType, source, extra = {}) {
  const g = groups.find((x) => c.seenIn?.includes(x.id)) || c.groups?.[0];
  return {
    log: {
      kind: 'comment',
      source,
      action: 'hide',
      groupId: g?.id || '',
      groupName: g?.name || '',
      communityName: g?.communityName || '',
      contentId: c.id,
      postId: c.postId,
      contentType: 'COMMENT',
      snippet: String(c.text || '').replace(/\s+/g, ' ').slice(0, 120),
      reason: BG.HIDE_REASONS[reasonType],
      userId: c.actor?.id || '',
      username: c.actor?.username || '',
      fullname: c.actor?.fullname || '',
      ...extra,
    },
    call: (cl) => cl.call('POST', `content/comments/${c.id}/hide`, { reasonType }),
    gone: true,
  };
}

// Đánh dấu đã ẩn / bỏ mục không còn trên Beincom trong danh sách bài, bình luận
function markHidden(next, entries) {
  const hidden = new Set(entries.filter((e) => e.status === 'ok').map((e) => e.contentId));
  const gone = new Set(entries.filter((e) => e.gone).map((e) => e.contentId));
  const upd = (list) => (list ? list.filter((x) => !gone.has(x.id)).map((x) => (hidden.has(x.id) ? { ...x, isHidden: true } : x)) : list);
  next.recentPosts = upd(next.recentPosts);
  next.recentComments = upd(next.recentComments);
  next.snapshot = dropFromSnapshot(next.snapshot, 'flaggedIds', hidden);
  return hidden.size;
}

// Tự ẩn bài / bình luận MỚI có link tới tên miền cấm (bật ở Cài đặt). Bỏ qua bài / bình luận của chính mình.
async function autoHideSpam({ settings, state, next, log, ctx, posts = [], comments = [], notifyAllowed }) {
  if (!settings.active || !settings.autoHideSpam) return;
  const meId = next.me?.id || state.me?.id;
  const groups = next.snapshot?.groups || [];
  const pick = (x) => !x.isHidden && x.actor?.id !== meId && BG.blockedHits(x, ctx).length;
  const why = (x) => ({ autoReason: 'Link tới tên miền cấm: ' + BG.blockedHits(x, ctx).join(', ') });
  const items = [
    ...posts.filter(pick).map((p) => postHideItem(p, groups, 'SPAM', 'auto', why(p))),
    ...comments.filter(pick).map((c) => commentHideItem(c, groups, 'SPAM', 'auto', why(c))),
  ]
    .filter(Boolean)
    .slice(0, AUTO_HIDE_MAX);
  if (!items.length) return;
  const r = await performActions(items, settings);
  pushLog(log, r.entries);
  const n = markHidden(next, r.entries);
  if (n && notifyAllowed) notify('bg-autohide', `BeinGroup: đã tự ẩn ${n} bài / bình luận`, 'Có link tới tên miền cấm. Xem ở tab Nhật ký.');
}

// Báo đợt spam mới (mỗi đợt một lần)
function notifyWaves(state, next, settings, postRules, notifyAllowed, now) {
  if (!settings.spamWaves) return [];
  const waves = BG.spamWaves(BG.waveItems(next.recentPosts, settings.scanComments ? next.recentComments : []), {
    now,
    allowed: ['beincom.com', ...(postRules.allowedDomains || [])],
    skipActorIds: [next.me?.id || state.me?.id].filter(Boolean),
  });
  const known = new Set(state.knownWaves || []);
  const fresh = waves.filter((w) => !known.has(w.key) && !(state.dismissedWaves || []).includes(w.key));
  if (fresh.length && notifyAllowed && state.recentPosts) {
    const w = fresh[0];
    const first = w.items[0];
    const item = first.kind === 'comment' ? (next.recentComments || []).find((c) => c.id === first.id) : (next.recentPosts || []).find((p) => p.id === first.id);
    const url = item ? (first.kind === 'comment' ? BG.commentUrl(item) : BG.postUrl(item)) : '';
    notify('bg-wave', `BeinGroup: phát hiện ${fresh.length > 1 ? fresh.length + ' đợt' : 'đợt'} spam`, `${w.type === 'link' ? w.label : '"' + w.label + '"'}: ${w.accounts.length} tài khoản, ${w.items.length} bài / bình luận`, url);
  }
  next.knownWaves = [...new Set([...waves.map((w) => w.key), ...(state.knownWaves || [])])].slice(0, 200);
  return state.recentPosts ? fresh : []; // đợt mới (để gửi tin có nút về Telegram)
}

// Báo cáo chờ xử lý mới và bài mới bị Beincom gắn cờ (lần quét đầu chỉ ghi nhận)
function applyReports(state, next, groups, notifyAllowed) {
  const kinds = [
    { field: 'reportIds', known: 'knownReportIds', id: 'bg-reports', title: (n) => `BeinGroup: ${n} báo cáo vi phạm mới`, name: (g) => g.communityName || g.name },
    { field: 'flaggedIds', known: 'knownFlaggedIds', id: 'bg-autoflag', title: (n) => `BeinGroup: ${n} bài bị Beincom gắn cờ vi phạm`, name: (g) => g.name },
  ];
  for (const k of kinds) {
    const known = new Set(state[k.known] || []);
    const fresh = new Set();
    const names = [];
    let firstGroup = null;
    for (const g of groups) {
      const ids = (g[k.field] || []).filter((id) => !known.has(id) && !fresh.has(id));
      if (!ids.length) continue;
      ids.forEach((id) => fresh.add(id));
      names.push(k.name(g));
      firstGroup = firstGroup || g;
    }
    if (state[k.known] && fresh.size && notifyAllowed) notify(k.id, k.title(fresh.size), names.join(', '), firstGroup ? BG.groupUrl(firstGroup) : '');
    next[k.known] = [...fresh, ...(state[k.known] || [])].slice(0, KNOWN_MAX);
  }
}

// Tải lại một phần (nút "Tải lại" trên từng tab), nhanh hơn quét toàn bộ:
//  - 'groups':  quyền, thông tin group, yêu cầu tham gia, số bài chờ duyệt (không đọc bài viết)
//  - 'content': hàng chờ duyệt bài và bài mới đăng (không đọc yêu cầu tham gia)
// Không thông báo, không tự xử lý. Chưa quét lần nào thì quét toàn bộ.
async function doRefresh({ part }) {
  if (part !== 'groups' && part !== 'content') return { status: 'error', message: 'Phần cần tải lại không hợp lệ' };
  const loaded = await load();
  const { settings, state, log } = loaded;
  const prevGroups = state.snapshot?.groups;
  if (!prevGroups?.length) return doScan({ source: 'dashboard' });

  const result = await withClient(async (client) => {
    if (part === 'groups') {
      const r = await scanGroupsPart(client);
      if (r.status !== 'ok') return r;
      // Giữ hàng chờ duyệt bài và số báo cáo đã tải (phần nội dung / tab Báo cáo sẽ làm mới)
      const prev = new Map(prevGroups.map((g) => [g.id, g]));
      for (const g of r.groups) {
        const old = prev.get(g.id);
        for (const k of ['approvals', 'flaggedIds', 'reportIds']) if (old?.[k]) g[k] = old[k];
      }
      return r;
    }
    const groups = prevGroups.map((g) => ({ ...g, approvalError: undefined, timelineError: undefined }));
    const posts = await scanContentPart(client, groups, prevGroups, settings.scanPosts);
    const comments = settings.scanPosts && settings.scanComments ? await scanCommentsPart(client, posts, state.commentSeen || {}, state.recentComments || []) : null;
    return { status: 'ok', groups, posts, comments };
  });

  const now = Date.now();
  const next = { ...state, lastResult: { status: result.status, message: result.message || '', mode: result.mode || '' } };
  if (result.status === 'ok') {
    applyGroups(state, next, result.groups, false, now);
    next.snapshot.at = state.snapshot.at; // giờ quét toàn bộ gần nhất giữ nguyên
    if (part === 'content' && settings.scanPosts) {
      const ctx = rulesCtx(loaded, next.snapshot.groups);
      const p = applyPosts(state, next, result.posts, ctx, false, now);
      const c = applyComments(state, next, result.comments, ctx, false, now);
      await autoHideSpam({ settings, state, next, log, ctx, posts: p.bad, comments: c.bad, notifyAllowed: false });
      notifyWaves(state, next, settings, loaded.postRules, false, now);
    }
  }
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  return { status: result.status, message: result.message || '', part, at: now };
}

async function doScan({ source = 'alarm' } = {}) {
  const loaded = await load();
  const { settings, state, log } = loaded;
  const auto = source === 'alarm' || source === 'startup' || source === 'install' || source === 'resume';
  if (auto && !settings.active) return state;

  const result = await withClient((client) =>
    scanGroups(client, {
      prevGroups: state.snapshot?.groups,
      scanPosts: settings.scanPosts,
      scanReports: settings.scanReports,
      trackViolations: settings.trackViolations,
      scanComments: settings.scanComments,
      commentSeen: state.commentSeen || {},
      prevComments: state.recentComments || [],
    }),
  );
  const now = Date.now();
  const next = { ...state, lastScan: now, lastResult: { status: result.status, message: result.message || '', mode: result.mode || '' } };
  const tg = await loadTelegram();
  resetTelegramItems();
  notifyDesktop = !!settings.notify;
  const notifyAllowed = settings.active && (settings.notify || telegramOn(tg)) && source !== 'popup' && source !== 'dashboard';

  if (result.status === 'ok') {
    let groups = result.groups;

    // Tự xử lý theo quy tắc (chỉ khi addon đang bật). Chạy thử: mỗi yêu cầu chỉ ghi nhật ký một lần.
    let autoMembers = 0;
    let autoPosts = 0;
    if (settings.active && (settings.autoApprove || settings.autoDecline)) {
      await flushViolations(); // hồ sơ vừa ghi trong lần quét này (vd người bị cấm trên web) phải có trước khi tự duyệt
      const { profiles } = await chrome.storage.local.get('profiles');
      const items = autoItems(groups, settings, rulesCtx(loaded, groups), settings.dryRun ? state.autoDryIds : [], settings.trackViolations ? profiles : null);
      if (items.length) {
        const r = await performActions(items, settings);
        pushLog(log, r.entries);
        groups = removeHandled(groups, r.entries);
        if (settings.dryRun) next.autoDryIds = [...items.map((x) => x.log.requestId), ...(state.autoDryIds || [])].slice(0, KNOWN_MAX);
        autoMembers = r.entries.filter((e) => e.status === 'ok').length;
      }
    }
    // Tự duyệt bài chờ duyệt của thành viên tin cậy (bài đạt mọi quy tắc, người đăng không có hồ sơ vi phạm)
    if (settings.active && settings.autoApprovePosts) {
      await flushViolations();
      const { profiles } = settings.trackViolations ? await chrome.storage.local.get('profiles') : {};
      const items = postAutoItems(groups, settings, rulesCtx(loaded, groups), state.postTrust, profiles, settings.dryRun ? state.autoPostDryIds : []);
      if (items.length) {
        const r = await performActions(items, settings);
        pushLog(log, r.entries);
        groups = removeHandledPosts(groups, r.entries);
        next.postTrust = BG.tallyPostTrust(state.postTrust, r.entries, now);
        if (settings.dryRun) next.autoPostDryIds = [...items.map((x) => x.log.contentId), ...(state.autoPostDryIds || [])].slice(0, KNOWN_MAX);
        autoPosts = r.entries.filter((e) => e.status === 'ok').length;
      }
    }
    if ((autoMembers || autoPosts) && notifyAllowed) {
      notify('bg-auto', 'BeinGroup: đã tự xử lý', [autoMembers && `${autoMembers} yêu cầu tham gia theo quy tắc`, autoPosts && `duyệt ${autoPosts} bài của thành viên tin cậy`].filter(Boolean).join(', '));
    }

    const freshRequestIds = applyGroups(state, next, groups, notifyAllowed, now);
    if (settings.scanReports) applyReports(state, next, groups, notifyAllowed);
    if (result.me) next.me = result.me;
    const fresh = { posts: [], comments: [], waves: [] };
    if (settings.scanPosts) {
      const ctx = rulesCtx(loaded, next.snapshot.groups);
      const p = applyPosts(state, next, result.posts, ctx, notifyAllowed, now);
      const c = applyComments(state, next, result.comments, ctx, notifyAllowed, now);
      await autoHideSpam({ settings, state, next, log, ctx, posts: p.bad, comments: c.bad, notifyAllowed });
      const waves = notifyWaves(state, next, settings, loaded.postRules, notifyAllowed, now);
      notifyWatch(state, next, settings, [...p.fresh, ...c.fresh], notifyAllowed);
      remindUnanswered(state, next, settings, notifyAllowed);
      Object.assign(fresh, { posts: p.bad, comments: c.bad, waves });
    }
    remindPending(state, next, settings, notifyAllowed, now);
    // Bảo vệ community (bg/guard.js, chỉ đọc): người mới vào giống admin, đợt vào ồ ạt
    if (settings.guardJoins) await withClient((client) => guardJoins(client, { settings, state, next, notifyAllowed, now })).catch((e) => recordDiag({ where: 'sw', kind: 'js', message: 'Bảo vệ community lỗi: ' + (e?.message || e) }));
    // Chat Beincom (bg/chat.js): tin mới trong kênh chat group, tin nhắn riêng chưa đọc
    if (settings.chatEnabled) await withClient((client) => syncChat(client, { settings, state, next, notifyAllowed, ctx: rulesCtx(loaded, next.snapshot.groups), now })).catch((e) => recordDiag({ where: 'sw', kind: 'js', message: 'Chat lỗi: ' + (e?.message || e) }));
    // Telegram có nút xử lý: mỗi việc mới một tin (gửi cuối lần quét)
    if (notifyAllowed && BG.telegramActionsOn(tg)) {
      const { profiles } = settings.trackViolations ? await chrome.storage.local.get('profiles') : {};
      queueScanItems({ state, next, ctx: rulesCtx(loaded, next.snapshot.groups), profiles, freshRequestIds, ...fresh });
    }
  } else if (result.status === 'need_login' && notifyAllowed && state.lastLoginNotifyDay !== BG.vnDay()) {
    next.lastLoginNotifyDay = BG.vnDay();
    notify('bg-login', 'BeinGroup: cần đăng nhập', 'Bấm để mở Beincom và đăng nhập lại.', BG.SITE + '/login');
  }

  // Việc định kỳ (đầu tuần / đầu tháng) trong lần quét này: gom lại, nhiều việc thì gộp một thông báo (cuối khối)
  const periodic = [];
  const due = (item) => notifyAllowed && periodic.push(item);

  // Sáng thứ Hai: nhắc chào thành viên mới và vinh danh thành viên tích cực (mở thẳng hai công cụ ở tab Đăng bài)
  const welcomeKey = settings.welcomeReminder && notifyAllowed && result.status === 'ok' ? BG.weeklyDue(state.welcomeKey, now) : null;
  if (welcomeKey) {
    next.welcomeKey = welcomeKey;
    due({ id: 'bg-welcome', kind: 'welcome', title: 'BeinGroup: việc đầu tuần', message: 'Chào thành viên mới và vinh danh thành viên tích cực tuần qua. Bấm để addon tìm sẵn người và soạn bài.', line: 'Chào thành viên mới và vinh danh thành viên tích cực' });
  }

  // Sáng thứ Hai: thông báo tóm tắt tuần trước (một lần mỗi tuần, chỉ khi quét tự động thành công)
  const weekKey = settings.weeklyReport && notifyAllowed && result.status === 'ok' ? BG.weeklyDue(state.weeklyKey, now) : null;
  if (weekKey) {
    next.weeklyKey = weekKey;
    const { profiles } = await chrome.storage.local.get('profiles');
    const r = BG.weeklyReport({ log, profiles, recentPosts: next.recentPosts, recentComments: next.recentComments, memberHistory: next.memberHistory, groups: next.snapshot?.groups || [], ctx: rulesCtx(loaded, next.snapshot?.groups) }, { days: 7, now });
    const a = r.actions;
    const parts = [
      a.approved + a.autoApproved && `${a.approved + a.autoApproved} thành viên được duyệt`,
      r.detected.posts + r.detected.comments && `${r.detected.posts + r.detected.comments} bài / bình luận vi phạm`,
      a.reportsHandled && `${a.reportsHandled} báo cáo đã xử lý`,
      a.removed + a.banned && `${a.removed + a.banned} người bị xoá / cấm`,
    ].filter(Boolean);
    due({ id: 'bg-weekly', kind: 'weekly', title: 'BeinGroup: tóm tắt tuần qua', message: parts.length ? parts.join(' · ') : 'Tuần qua yên ả, không có việc gì cần xử lý. Bấm để xem chi tiết.', line: 'Tóm tắt tuần: ' + (parts.length ? parts.join(' · ') : 'tuần qua yên ả') });
  }

  // Sáng thứ Hai: soạn sẵn danh sách nhắc người mới chưa hoạt động (chỉ đọc; người dùng tự xem rồi đăng)
  const nudgeKey = settings.nudgeWeekly && settings.nudgeGroupId && auto && result.status === 'ok' ? BG.weeklyDue(state.nudgeKey, now) : null;
  if (nudgeKey) {
    next.nudgeKey = nudgeKey;
    const nd = await prepareNudge({ groupId: settings.nudgeGroupId, now }).catch(() => null);
    if (nd?.status === 'ok' && nd.users.length) {
      await chrome.storage.local.set({ nudgeDraft: { id: 'nd' + now, groupId: nd.group.id, groupName: nd.group.name, at: now, users: nd.users, joined: nd.joined } });
      due({ id: 'bg-nudge', kind: 'nudge', title: `BeinGroup: soạn sẵn bài nhắc ${nd.users.length} người mới`, message: `${nd.group.name}: ${nd.users.length} người mới vào chưa thấy đăng bài hay bình luận. Bấm để xem bài nhắc, sửa rồi tự đăng hoặc hẹn giờ.`, line: `Bài nhắc ${nd.users.length} người mới chưa hoạt động (${nd.group.name})` });
    }
  }

  // Đầu tháng (7 ngày đầu, từ 8 giờ sáng ngày 1): nhắc xem báo cáo tháng trước, một lần mỗi tháng
  const monthDue = settings.monthlyReport && notifyAllowed && result.status === 'ok' ? BG.monthlyDue(state.monthlyKey, now) : null;
  if (monthDue) {
    next.monthlyKey = monthDue;
    const range = BG.monthRange(monthDue, now);
    const a = BG.countLogActions(log, (t) => {
      const v = Date.parse(t);
      return v >= range.from && v < range.to;
    });
    const parts = [
      a.approved + a.autoApproved && `${a.approved + a.autoApproved} thành viên được duyệt`,
      a.postsHidden + a.commentsHidden && `${a.postsHidden + a.commentsHidden} bài / bình luận đã ẩn`,
      a.reportsHandled && `${a.reportsHandled} báo cáo đã xử lý`,
      a.removed + a.banned && `${a.removed + a.banned} người bị xoá / cấm`,
    ].filter(Boolean);
    due({ id: 'bg-monthly', kind: 'monthly', title: `BeinGroup: báo cáo ${range.label}`, message: (parts.length ? parts.join(' · ') + '. ' : '') + 'Bấm để xem báo cáo từng community: thành viên, người mới có ở lại không, bài viết, tương tác.', line: `Báo cáo ${range.label}` });
  }

  // Sáng thứ Hai: soạn sẵn bài thảo luận (câu hỏi mồi + giờ gợi ý); người dùng tự xem rồi hẹn giờ
  const promptKey = settings.promptWeekly && settings.promptGroupId && auto && result.status === 'ok' ? BG.weeklyDue(state.promptKey, now) : null;
  if (promptKey) {
    next.promptKey = promptKey;
    const draft = await preparePrompt({ groupId: settings.promptGroupId, now }).catch(() => null);
    if (draft) {
      await chrome.storage.local.set({ promptDraft: draft });
      due({ id: 'bg-prompt', kind: 'prompt', title: `BeinGroup: bài thảo luận tuần này cho ${draft.groupName}`, message: `"${draft.text.slice(0, 120)}" — bấm để xem, sửa rồi hẹn giờ${draft.suggestAt ? ` (gợi ý ${BG.slotLabel(draft.suggestAt)})` : ''}.`, line: `Bài thảo luận cho ${draft.groupName}${draft.suggestAt ? ` (gợi ý ${BG.slotLabel(draft.suggestAt)})` : ''}` });
    }
  }

  // Một việc: thông báo như cũ. Nhiều việc: một thông báo (và một tin Telegram) "việc đầu tuần", ô Việc đầu tuần ở Tổng quan
  if (periodic.length === 1) notify(periodic[0].id, periodic[0].title, periodic[0].message);
  else if (periodic.length > 1) {
    await chrome.storage.local.set({ periodicDigest: { at: now, items: periodic.map(({ kind, line }) => ({ kind, line })), done: {}, dismissed: false } });
    notify('bg-digest', `BeinGroup: việc đầu tuần (${periodic.length} việc)`, periodic.map((x) => '• ' + x.line).join('\n') + '\nBấm để làm lần lượt.');
  }

  // Tự kiểm tra mỗi ngày: lần quét tự động thành công đầu tiên trong ngày (chạy sau khi lưu, cần danh sách group mới)
  const dailyCheck = settings.selfCheckDaily && auto && result.status === 'ok' && state.selfCheckDay !== BG.vnDay(now);
  if (dailyCheck) next.selfCheckDay = BG.vnDay(now);

  await flushTelegramItems().catch(() => {});
  await chrome.storage.local.set({ state: next, log });
  await updateBadge();
  // Hiệu quả bài đã đăng: đọc số liệu các bài tới mốc 24 giờ / 7 ngày (chỉ khi quét tự động thành công)
  if (auto && result.status === 'ok') await measurePostStats({ now }).catch(() => {});
  if (dailyCheck) await dailySelfCheck({ now, notifyAllowed }).catch(() => {});
  // Báo cáo sử dụng (chỉ khi admin đã đồng ý, 7 ngày một lần)
  if (auto && result.status === 'ok') await doUsageSend({ now }).catch(() => {});
  return next;
}
