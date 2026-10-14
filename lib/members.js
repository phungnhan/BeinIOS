// BeinGroup — thành viên: yêu cầu tham gia, hồ sơ vi phạm, chào thành viên mới, vinh danh.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { ACTIVITY_TYPES, DEFAULT_RULES, norm, slimPerson, mentionEntry } = BG;

  // ---------- Yêu cầu tham gia ----------

  // Thu gọn dữ liệu API, chỉ giữ thứ cần để hiển thị và lọc
  function slimRequest(r) {
    const u = r.user || {};
    return {
      id: r.id,
      userId: r.userId || u.id,
      createdAt: r.createdAt || null,
      answers: Array.isArray(r.membershipAnswers) ? r.membershipAnswers : [],
      user: {
        id: u.id,
        username: u.username || '',
        fullname: u.fullname || '',
        avatar: u.avatar || '',
        isVerified: !!u.isVerified,
        isDeactivated: !!u.isDeactivated,
        premium: Array.isArray(u.subscriptions) && u.subscriptions.some((s) => s?.type === 'premium'),
        nft: !!(u.userNFT?.isLinkedPoNFT || u.userNFT?.isLinkedUoNFT),
      },
    };
  }

  function slimQuestion(q) {
    return { id: q.id, question: q.question || '', isRequired: !!q.isRequired };
  }

  function hasAvatar(user) {
    return !!user.avatar && !/default/i.test(user.avatar);
  }

  // Ghép câu trả lời với câu hỏi. API chưa cho thấy rõ dạng câu trả lời nên đọc nhiều tên trường.
  function answersOf(req, questions = []) {
    const byId = new Map(questions.map((q) => [q.id, q]));
    const seen = new Set();
    const out = [];
    for (const a of req.answers || []) {
      if (a == null) continue;
      const qid = a.questionId ?? a.question_id ?? a.question?.id ?? null;
      const q = byId.get(qid);
      const text = typeof a === 'string' ? a : a.answer ?? a.value ?? a.content ?? '';
      if (qid) seen.add(qid);
      out.push({ questionId: qid, question: q?.question ?? a.question?.question ?? (typeof a.question === 'string' ? a.question : ''), answer: String(text ?? ''), isRequired: !!q?.isRequired });
    }
    for (const q of questions) {
      if (!seen.has(q.id)) out.push({ questionId: q.id, question: q.question, answer: '', isRequired: q.isRequired });
    }
    return out;
  }

  // Gợi ý cho một yêu cầu tham gia.
  // verdict: 'approve' (đạt mọi quy tắc) · 'decline' (vi phạm quy tắc từ chối) · 'review' (cần người xem)
  // profile: hồ sơ vi phạm của người xin vào (nếu có)
  // admins: admin của community (BG.adminsOf) để nhận ra tài khoản mạo danh
  function evaluateRequest(req, rules = DEFAULT_RULES, questions = [], profile = null, admins = []) {
    const r = { ...DEFAULT_RULES, ...rules };
    const u = req.user || {};
    const username = String(u.username || '').toLowerCase();
    const reasons = [];
    const bad = (text) => reasons.push({ level: 'bad', text });
    const warn = (text) => reasons.push({ level: 'warn', text });

    if (username && r.blockUsernames.map((x) => x.toLowerCase()).includes(username)) {
      return { verdict: 'decline', reasons: [{ level: 'bad', text: 'Có trong danh sách chặn' }] };
    }
    if (username && r.allowUsernames.map((x) => x.toLowerCase()).includes(username)) {
      return { verdict: 'approve', reasons: [{ level: 'ok', text: 'Có trong danh sách cho phép' }] };
    }

    if (r.declineDeactivated && u.isDeactivated) bad('Tài khoản đã bị vô hiệu hoá');
    if (r.reviewImpersonation) {
      const imp = impersonation({ ...u, id: u.id || req.userId }, admins);
      if (imp) (imp.level === 'bad' ? bad : warn)(imp.text);
    }

    const answers = answersOf(req, questions);
    const haystack = norm([u.fullname, u.username, ...answers.map((a) => a.answer)].join(' \n '));
    const hits = r.bannedKeywords.filter((k) => norm(k) && haystack.includes(norm(k)));
    if (hits.length) bad('Chứa từ khoá cấm: ' + hits.join(', '));

    if (r.reviewViolators && profile?.events?.length) warn('Có hồ sơ vi phạm: ' + profileText(profileSummary(profile)));
    if (r.requireAvatar && !hasAvatar(u)) warn('Không có ảnh đại diện');
    if (r.requireVerified && !u.isVerified) warn('Tài khoản chưa xác minh');
    if (r.requireAnswers) {
      const missing = answers.filter((a) => a.isRequired && !a.answer.trim());
      const short = answers.filter((a) => a.answer.trim() && a.answer.trim().length < (Number(r.minAnswerLength) || 0));
      if (missing.length) warn(`Chưa trả lời ${missing.length} câu hỏi bắt buộc`);
      if (short.length) warn(`${short.length} câu trả lời quá ngắn`);
    }

    if (reasons.some((x) => x.level === 'bad')) return { verdict: 'decline', reasons };
    if (reasons.length) return { verdict: 'review', reasons };
    return { verdict: 'approve', reasons: [{ level: 'ok', text: 'Đạt mọi quy tắc' }] };
  }

  // ---------- Bảo vệ community: mạo danh admin, đợt vào ồ ạt ----------
  // Kẻ lừa đảo hay lập tài khoản tên / username giống admin, hoặc đặt tên "Admin…", "Hỗ trợ…", "CSKH…" rồi nhắn riêng
  // thành viên. So tên đã chuẩn hoá: bỏ dấu, chữ thường, đổi số / ký tự giống chữ (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a,
  // l→i, rn→m), bỏ ký tự khác chữ, gộp chữ lặp ("kaaai" → "kai").
  const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };
  // Chữ Kirin / Hy Lạp / chữ lạ trông giống chữ Latin
  const CONFUSABLE = { а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ı: 'i', ɑ: 'a', ο: 'o', α: 'a', ε: 'e', ν: 'v', τ: 't', ρ: 'p' };
  // Chữ thường không dấu, đổi chữ trông giống nhau và số / ký tự giống chữ (0→o, 1→i, 4→a…)
  function plain(s) {
    return norm(s)
      .replace(/[^\x00-\x7f]/g, (c) => CONFUSABLE[c] || c)
      .replace(/[0134578@$!|]/g, (c) => LOOKALIKE[c]);
  }
  function nameKey(s) {
    return plain(s)
      .replace(/rn/g, 'm')
      .replace(/l/g, 'i')
      .replace(/[^a-z0-9]/g, '') // số không giống chữ (2, 6, 9) giữ lại: "Trader 99" khác "Trader 66"
      .replace(/(.)\1+/g, '$1');
  }

  // Khoảng cách sửa chữ (Levenshtein), dừng sớm khi đã quá max
  function editDistance(a, b, max = 3) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // Chữ cho thấy tự nhận là người quản lý / hỗ trợ, so theo từng từ ("badminton" không tính).
  // Đúng cả từ hoặc cụm: gợi ý từ chối; từ dính liền ("cryptolifeadmin") hoặc chữ yếu: cần xem
  const STAFF_WORDS = ['admin', 'administrator', 'moderator', 'support', 'cskh', 'hotro', 'bqt'];
  const STAFF_PHRASES = ['ho tro', 'cham soc khach hang', 'quan tri vien', 'ban quan tri'];
  const STAFF_WEAK = ['mod', 'adm', 'staff', 'official', 'team', 'quanly', 'helpdesk'];

  const who = (a) => (a.fullname || a.username || '?') + (a.username ? ` (@${a.username})` : '');

  // user giống admin nào trong admins? -> null | { level: 'bad' | 'review', text, adminId }
  function impersonation(user, admins = []) {
    if (!user?.id || (admins || []).some((a) => a.id === user.id)) return null;
    const fk = nameKey(user.fullname);
    const uk = nameKey(user.username);
    const near = (x, y) => x.length >= 6 && y.length >= 6 && x !== y && editDistance(x, y, 2) <= (Math.min(x.length, y.length) >= 12 ? 2 : 1);
    // Hai tài khoản đánh số ("trader01" / "trader07", "Người 41" / "Người 711"): cùng chữ, chỉ khác số -> không tính
    const letters = (s) => norm(s).replace(/[^a-z]/g, '');
    const numbered = (s, t) => /\d/.test(s || '') && /\d/.test(t || '') && letters(s) === letters(t);
    let soft = null;
    for (const a of admins || []) {
      if (!a?.id) continue;
      if (numbered(user.username, a.username) || numbered(user.fullname, a.fullname)) continue;
      const af = nameKey(a.fullname);
      const au = nameKey(a.username);
      // Trùng tên hiển thị: tên ngắn (dễ trùng tên thật, vd "Minh Anh") thì chỉ cần xem
      if (af.length >= 4 && fk === af) return { level: af.length >= 8 ? 'bad' : 'review', text: `Tên giống hệt admin ${who(a)}`, adminId: a.id };
      if (au.length >= 5 && (uk === au || fk === au)) return { level: 'bad', text: `Tên / username giống admin ${who(a)}`, adminId: a.id };
      if (near(uk, au)) return { level: 'bad', text: `Username gần giống admin ${who(a)}`, adminId: a.id };
      if (!soft && near(fk, af)) soft = { level: 'review', text: `Tên gần giống admin ${who(a)}`, adminId: a.id };
    }
    if (soft) return soft;
    const tokens = plain(`${user.fullname || ''} ${user.username || ''}`).split(/[^a-z]+/).filter(Boolean);
    const spaced = ' ' + tokens.join(' ') + ' ';
    const word = STAFF_WORDS.find((w) => tokens.includes(w)) || STAFF_PHRASES.find((p) => spaced.includes(` ${p} `));
    if (word) return { level: 'bad', text: `Tên tự nhận là quản trị / hỗ trợ ("${word}")`, adminId: '' };
    const glued = STAFF_WORDS.filter((w) => w.length >= 5).find((w) => tokens.some((t) => t.length > w.length && (t.startsWith(w) || t.endsWith(w))));
    if (glued) return { level: 'review', text: `Tên có chữ "${glued}"`, adminId: '' };
    const weak = STAFF_WEAK.find((w) => tokens.includes(w));
    if (weak) return { level: 'review', text: `Tên có chữ "${weak}"`, adminId: '' };
    return null;
  }

  // Admin của cả community chứa group g (gộp danh sách admin các group mình quản trị trong community đó)
  function adminsOf(byGroup, g, groups = []) {
    if (!byGroup || !g) return [];
    const ids = g.communityId ? (groups || []).filter((x) => x.communityId === g.communityId).map((x) => x.id) : [];
    const out = new Map();
    for (const id of new Set([g.id, ...ids])) for (const a of byGroup[id] || []) if (a?.id) out.set(a.id, a);
    return [...out.values()];
  }

  // Đợt vào ồ ạt: số người vào trong `minutes` phút gần nhất (joins: [{ user, time }]), bao nhiêu người không có ảnh
  function joinBurst(joins, { minutes = 60, now = Date.now() } = {}) {
    const from = now - minutes * 60e3;
    const list = (joins || []).filter((j) => Date.parse(j.time) >= from && Date.parse(j.time) <= now);
    const times = list.map((j) => Date.parse(j.time)).sort((a, b) => a - b);
    return { count: list.length, noAvatar: list.filter((j) => !hasAvatar(j.user || {})).length, from: times[0] || null, to: times.at(-1) || null, userIds: list.map((j) => j.user?.id).filter(Boolean) };
  }

  const VERDICT_LABELS = { approve: 'Gợi ý duyệt', decline: 'Gợi ý từ chối', review: 'Cần xem' };

  // ---------- Hồ sơ vi phạm của thành viên ----------
  // Addon tự ghi (lưu trong máy) từ: thao tác của bạn qua addon, nhật ký hoạt động Beincom (bị xoá / cấm / từ chối,
  // kể cả do admin khác làm trên web), báo cáo của người dùng, bài Beincom gắn cờ, bài đã ẩn, bài vi phạm quy tắc.
  // member: sự kiện về tư cách thành viên (một lần xoá / cấm có thể đến từ hai nguồn: gộp nếu gần nhau)
  const VIOLATION_TYPES = {
    banned: { label: 'Bị cấm', weight: 5, member: true },
    removed: { label: 'Bị xoá khỏi group', weight: 3, member: true },
    hidden: { label: 'Nội dung bị ẩn', weight: 2 },
    rejected: { label: 'Bài bị từ chối duyệt', weight: 1 },
    declined: { label: 'Bị từ chối vào group', weight: 1, member: true },
    reported: { label: 'Bị báo cáo', weight: 1 },
    flagged: { label: 'Bài bị Beincom gắn cờ', weight: 1 },
    rule: { label: 'Bài vi phạm quy tắc', weight: 1 },
  };
  const PROFILE_MAX_USERS = 500;
  const PROFILE_MAX_EVENTS = 30;
  const SAME_ACT_MS = 15 * 60e3;

  // events: [{ user: { id, username, fullname, avatar }, type, key, time, group, snippet, reason, by }]
  //   hoặc { user, clear: key } để bỏ một sự kiện (vd báo cáo đã được bỏ qua)
  // Trả về { store: { users: { [id]: { user, events } } }, added }: added = số sự kiện thêm / bỏ
  function addViolations(store, events, now = Date.now()) {
    const users = { ...(store?.users || {}) };
    let added = 0;
    for (const ev of events || []) {
      const u = ev?.user;
      if (!u?.id) continue;
      const prev = users[u.id];
      if (ev.clear) {
        if (!prev?.events.some((e) => e.key === ev.clear)) continue;
        const left = prev.events.filter((e) => e.key !== ev.clear);
        if (left.length) users[u.id] = { ...prev, events: left };
        else delete users[u.id];
        added++;
        continue;
      }
      const type = VIOLATION_TYPES[ev.type];
      if (!type || !ev.key) continue;
      const list = prev?.events || [];
      const t = Date.parse(ev.time) || now;
      const dup = list.some((e) => e.key === ev.key || (type.member && e.type === ev.type && e.group === (ev.group || '') && Math.abs(Date.parse(e.time) - t) < SAME_ACT_MS));
      if (dup) continue;
      const user = { id: u.id, username: u.username || prev?.user.username || '', fullname: u.fullname || prev?.user.fullname || '', avatar: u.avatar || prev?.user.avatar || '' };
      const item = {
        type: ev.type,
        key: ev.key,
        time: new Date(t).toISOString(),
        group: ev.group || '',
        snippet: String(ev.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        reason: String(ev.reason || '').slice(0, 160),
        by: ev.by || '',
      };
      users[u.id] = { user, events: [item, ...list].sort((a, b) => b.time.localeCompare(a.time)).slice(0, PROFILE_MAX_EVENTS) };
      added++;
    }
    const ids = Object.keys(users);
    if (ids.length > PROFILE_MAX_USERS) {
      ids.sort((a, b) => users[b].events[0].time.localeCompare(users[a].events[0].time));
      for (const id of ids.slice(PROFILE_MAX_USERS)) delete users[id];
    }
    return { store: { users }, added };
  }

  // { counts: { banned: 1, … }, score, total, last, repeat (≥ 2 lần), severe (bị cấm / xoá) }
  function profileSummary(p) {
    const counts = {};
    let score = 0;
    for (const e of p?.events || []) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      score += VIOLATION_TYPES[e.type]?.weight || 0;
    }
    const total = p?.events?.length || 0;
    return { counts, score, total, last: p?.events?.[0] || null, repeat: total >= 2, severe: !!(counts.banned || counts.removed) };
  }

  // "Bị cấm 1 · Nội dung bị ẩn 2" (theo thứ tự nặng → nhẹ)
  function profileText(sum) {
    return Object.keys(VIOLATION_TYPES)
      .filter((k) => sum.counts[k])
      .map((k) => `${VIOLATION_TYPES[k].label} ${sum.counts[k]}`)
      .join(' · ');
  }

  // Từ nhật ký thao tác của addon: chỉ thao tác đã gửi thành công (không tính chạy thử, bài đã bị xoá sẵn)
  function violationsFromLog(entries) {
    const out = [];
    for (const e of entries || []) {
      if (e.status !== 'ok' || e.gone || !e.userId) continue;
      const user = { id: e.userId, username: e.username || '', fullname: e.fullname || '', avatar: '' };
      const base = { user, time: new Date(e.time || Date.now()).toISOString(), group: e.groupName || e.communityName || '', snippet: e.snippet || '', reason: e.reason || '', by: e.source === 'auto' ? 'Addon tự xử lý' : 'Bạn (qua addon)' };
      const { kind, action } = e;
      if (kind === 'member' && action === 'decline') out.push({ ...base, type: 'declined', key: 'declined:' + e.requestId });
      else if (kind === 'manage' && (action === 'remove' || action === 'ban')) out.push({ ...base, type: action === 'ban' ? 'banned' : 'removed', key: `${action}:${e.groupId}:${e.userId}:${e.time}` });
      else if (kind === 'post' && action === 'hide') out.push({ ...base, type: 'hidden', key: 'hidden:' + e.contentId });
      else if (kind === 'comment' && action === 'hide') out.push({ ...base, type: 'hidden', key: 'hidden:c:' + e.contentId });
      else if (kind === 'chat' && (action === 'reportHide' || action === 'delete')) out.push({ ...base, type: 'hidden', key: 'hidden:chat:' + e.contentId });
      else if (kind === 'post' && action === 'reject') out.push({ ...base, type: 'rejected', key: 'rejected:' + e.contentId });
      else if (kind === 'report' && (action === 'hide' || action === 'hidePost')) out.push({ ...base, type: 'hidden', key: 'hidden:' + e.contentId });
      else if (kind === 'report' && action === 'ignore' && e.reportId) out.push({ user, clear: 'report:' + e.reportId }); // báo cáo sai: bỏ khỏi hồ sơ
    }
    return out;
  }

  // Từ nhật ký hoạt động Beincom (slimActivity)
  const ACTIVITY_VIOLATION = { 'remove.member': 'removed', 'ban.member': 'banned', 'decline.join_request': 'declined' };
  function violationsFromActivity(items) {
    return (items || [])
      .filter((a) => ACTIVITY_VIOLATION[a.useCase] && a.user?.id)
      .map((a) => ({ user: a.user, type: ACTIVITY_VIOLATION[a.useCase], key: 'act:' + a.id, time: a.time, group: a.groupName || '', by: a.actor ? a.actor.fullname || a.actor.username : '' }));
  }

  // Từ báo cáo của người dùng (slimReport); báo cáo đã bỏ qua không tính
  function violationsFromReports(reports, group = '') {
    return (reports || [])
      .filter((r) => r.actor?.id && r.status !== 'IGNORED')
      .map((r) => ({ user: r.actor, type: 'reported', key: 'report:' + r.id, time: r.createdAt, group, snippet: r.content, reason: r.reasons.map((x) => `${x.label} ×${x.total}`).join(', ') }));
  }

  // Từ bài (slimPost): type 'flagged' | 'hidden' | 'rule'; reasonOf(p) -> lý do
  function violationsFromPosts(posts, type, reasonOf = () => '') {
    return (posts || [])
      .filter((p) => p.actor?.id)
      .map((p) => ({ user: p.actor, type, key: `${type === 'rule' ? 'rule' : type === 'flagged' ? 'flag' : 'hidden'}:${p.id}`, time: p.publishedAt || p.submittedAt, group: p.groups?.[0]?.name || '', snippet: p.title || p.text, reason: reasonOf(p) }));
  }

  // ---------- Thành viên ----------

  // Chuẩn hoá thành viên từ hai API:
  //  - group/manage/communities/{id}/members (group gốc): có joinedAt, isCommunityAdmin, totalJoinedGroup
  //  - group/groups/{id}/users (mọi group): tách sẵn groupAdmin / groupMember, có gói Premium, NFT
  function slimMember(u, { isAdmin } = {}) {
    return {
      id: u.id,
      username: u.username || '',
      fullname: u.fullname || '',
      avatar: u.avatar || '',
      isVerified: !!u.isVerified,
      isDeactivated: !!u.isDeactivated,
      isAdmin: isAdmin ?? !!u.isAdmin,
      isCommunityAdmin: !!u.isCommunityAdmin,
      joinedAt: u.joinedAt || null,
      totalJoinedGroup: u.totalJoinedGroup ?? null,
      premium: Array.isArray(u.subscriptions) && u.subscriptions.some((s) => s?.type === 'premium'),
      nft: !!(u.userNFT?.isLinkedPoNFT || u.userNFT?.isLinkedUoNFT),
    };
  }

  function slimActivity(e) {
    const [label, kind] = ACTIVITY_TYPES[e.useCase] || [e.useCase || e.eventType || '?', 'other'];
    const actor = slimPerson(e.data?.actor);
    // Sự kiện tự làm (vào, rời) không có `user`: người liên quan chính là actor
    const user = slimPerson(e.data?.user) || actor;
    return {
      id: e.id,
      time: e.eventTime || null,
      useCase: e.useCase || '',
      label,
      kind,
      user,
      actor: actor && user && actor.id !== user.id ? actor : null,
      groupName: e.data?.group?.name || '',
      change: e.data?.changes ? `${e.data.changes.old ?? ''} → ${e.data.changes.new ?? ''}` : '',
    };
  }

  // Đếm người vào / rời trong `hours` giờ gần nhất từ các sự kiện đã tải
  function activitySummary(items, hours, now = Date.now()) {
    const since = now - hours * 3600e3;
    let joined = 0;
    let left = 0;
    for (const a of items || []) {
      if (!a.time || new Date(a.time).getTime() < since) continue;
      if (a.kind === 'in') joined++;
      if (a.kind === 'out') left++;
    }
    return { joined, left };
  }

  // ---------- Chào thành viên mới ----------
  const WELCOME_MAX_MENTIONS = 50;
  const DEFAULT_WELCOME = 'Chào mừng {so_nguoi} thành viên mới của {group} 👋\n\n{danh_sach}\n\nCả nhà đọc nội quy ở bài ghim và để lại vài dòng giới thiệu về mình nhé!';

  // Người mới từ nhật ký hoạt động (slimActivity): sự kiện "vào" từ `since`, bỏ người đã rời sau khi vào
  function newMembersFromActivity(items, since) {
    const out = new Map();
    const left = new Map();
    for (const a of items || []) {
      const t = Date.parse(a.time);
      if (!a.user?.id || !Number.isFinite(t) || t < since) continue;
      if (a.kind === 'out') left.set(a.user.id, Math.max(left.get(a.user.id) || 0, t));
      if (a.kind === 'in' && !out.has(a.user.id)) out.set(a.user.id, { ...a.user, joinedAt: a.time });
    }
    return [...out.values()].filter((u) => !(left.get(u.id) > Date.parse(u.joinedAt))).sort((x, y) => String(y.joinedAt).localeCompare(String(x.joinedAt)));
  }

  // Bài chào: thay {so_nguoi}, {group}, {danh_sach} (@username cách nhau dấu phẩy, tối đa 50 người được nhắc)
  function welcomeText(template, { users = [], groupName = '' } = {}) {
    const named = (users || []).filter((u) => u?.id && u.username);
    const shown = named.slice(0, WELCOME_MAX_MENTIONS);
    const more = named.length - shown.length;
    const list = shown.map((u) => '@' + u.username).join(', ') + (more > 0 ? ` và ${more} bạn khác` : '');
    const text = String(template || DEFAULT_WELCOME)
      .replace(/\{so_nguoi\}/g, String(named.length))
      .replace(/\{group\}/g, groupName)
      .replace(/\{danh_sach\}/g, list);
    const mentions = Object.fromEntries(shown.map((u) => [u.username, mentionEntry(u)]));
    return { text, mentions };
  }

  // ---------- Vinh danh thành viên tích cực ----------
  // Điểm = 5 × số bài + 1 × số bình luận đã viết + 0,5 × cảm xúc bài nhận được (làm tròn). Bỏ tài khoản của mình.
  const DEFAULT_SHOUTOUT = 'Cảm ơn những thành viên tích cực nhất của {group} tuần qua 🏆\n\n{danh_sach}\n\nCảm ơn mọi người đã chia sẻ và góp ý, tuần này tiếp tục nhé!';
  const SHOUTOUT_MEDALS = ['🥇', '🥈', '🥉'];

  // posts: bài trong khoảng (slimPost, có reactions / commentsCount); comments: bình luận addon đã đọc (slimComment)
  function topMembers({ posts = [], comments = [], since = 0, skipIds = [], limit = 10 } = {}) {
    const skip = new Set(skipIds.filter(Boolean));
    const by = new Map();
    const row = (u) => {
      if (!u?.id || skip.has(u.id)) return null;
      if (!by.has(u.id)) by.set(u.id, { user: { id: u.id, username: u.username || '', fullname: u.fullname || '', avatar: u.avatar || '' }, posts: 0, comments: 0, reactions: 0, replies: 0 });
      return by.get(u.id);
    };
    for (const p of posts) {
      if (Date.parse(p.publishedAt) < since) continue;
      const r = row(p.actor);
      if (!r) continue;
      r.posts++;
      r.reactions += p.reactions || 0;
      r.replies += p.commentsCount || 0;
    }
    for (const c of comments) {
      if (Date.parse(c.createdAt) < since) continue;
      const r = row(c.actor);
      if (r) r.comments++;
    }
    return [...by.values()]
      .map((r) => ({ ...r, score: Math.round(r.posts * 5 + r.comments + r.reactions * 0.5) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.posts - a.posts || b.comments - a.comments)
      .slice(0, limit);
  }

  // Bài vinh danh: {danh_sach} = mỗi người một dòng (huy chương cho 3 người đầu), {so_nguoi}, {group}
  function shoutoutText(template, { rows = [], groupName = '' } = {}) {
    const named = rows.filter((r) => r.user?.id && r.user.username);
    const lines = named.map((r, i) => {
      const parts = [r.posts && `${r.posts} bài`, r.comments && `${r.comments} bình luận`].filter(Boolean).join(', ');
      return `${SHOUTOUT_MEDALS[i] || i + 1 + '.'} @${r.user.username}${parts ? ' — ' + parts : ''}`;
    });
    const text = String(template || DEFAULT_SHOUTOUT)
      .replace(/\{so_nguoi\}/g, String(named.length))
      .replace(/\{group\}/g, groupName)
      .replace(/\{danh_sach\}/g, lines.join('\n'));
    return { text, mentions: Object.fromEntries(named.map((r) => [r.user.username, mentionEntry(r.user)])) };
  }

  Object.assign(BG, {
    VERDICT_LABELS,
    WELCOME_MAX_MENTIONS,
    DEFAULT_WELCOME,
    newMembersFromActivity,
    welcomeText,
    DEFAULT_SHOUTOUT,
    topMembers,
    shoutoutText,
    slimMember,
    slimActivity,
    activitySummary,
    slimRequest,
    slimQuestion,
    hasAvatar,
    answersOf,
    evaluateRequest,
    nameKey,
    editDistance,
    impersonation,
    adminsOf,
    joinBurst,
    VIOLATION_TYPES,
    addViolations,
    profileSummary,
    profileText,
    violationsFromLog,
    violationsFromActivity,
    violationsFromReports,
    violationsFromPosts,
  });
});
