// BeinGroup — bài viết và bình luận: quy tắc, báo cáo, nhắc tên / link, spam, từ khoá, dọn tài khoản, thành viên tin cậy.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { DEFAULT_POST_RULES, DEFAULT_RULES, HIDE_REASONS, norm, postUrl, SITE, slimPerson } = BG;

  // ---------- Bài viết ----------

  const TEXT_MAX = 4000;

  // Thu gọn bài từ API (timeline, danh sách hoặc chi tiết bài chờ duyệt).
  // Danh sách chờ duyệt chỉ có `title` = 500 ký tự đầu; chi tiết mới có `content` đầy đủ.
  function slimPost(p) {
    const a = p.actor || {};
    const m = p.media || {};
    const isArticle = p.type === 'ARTICLE';
    const body = String(p.content ?? (isArticle ? '' : p.title) ?? '');
    return {
      id: p.id,
      type: p.type || 'POST',
      title: isArticle ? p.title || '' : '',
      text: body.slice(0, TEXT_MAX),
      actor: { id: a.id || p.createdBy || '', username: a.username || '', fullname: a.fullname || '', avatar: a.avatar || '' },
      groups: (p.audience?.groups || []).map((g) => ({
        id: g.id,
        name: g.name || '',
        communityId: g.communityId || '',
        rootGroupId: g.rootGroupId || '',
        isCommunity: !!g.isCommunity,
        approval: g.approval?.status || null,
      })),
      media: { images: m.images?.length || 0, videos: m.videos?.length || 0, files: m.files?.length || 0 },
      link: p.linkPreview?.url || '',
      publishedAt: p.publishedAt || null,
      submittedAt: p.submittedAt || null,
      commentsCount: p.commentsCount ?? null,
      isHidden: !!p.isHidden,
      status: p.status || null,
      scheduledAt: p.scheduledAt || null,
      reactions: Object.values(p.reactionsCount || {}).reduce((s, n) => s + (Number(n) || 0), 0),
      tags: (p.tags || []).map((t) => t?.name).filter(Boolean),
      // Bài bị hệ thống kiểm duyệt tự động gắn cờ: các danh mục vi phạm
      violations: (p.postScan?.dataViolation?.violatedCategories || []).map((c) => c?.name).filter(Boolean),
    };
  }

  // Chỉ nhận link web; ảnh phải https (trang Dashboard không tải ảnh http)
  const webUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
  const httpsUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

  // Bài hẹn giờ: thêm những gì cần để xem lại bài trước giờ đăng
  function slimScheduled(p) {
    const s = p.setting || {};
    const lp = p.linkPreview;
    const article = p.type === 'ARTICLE';
    return {
      ...slimPost(p),
      ...(article ? { text: [p.title && '### ' + p.title, p.summary].filter(Boolean).join('\n\n').slice(0, TEXT_MAX) } : {}),
      createdAt: p.createdAt || null,
      updatedAt: p.updatedAt || null,
      setting: { canComment: s.canComment !== false, canReact: s.canReact !== false, isImportant: !!s.isImportant, importantExpiredAt: s.importantExpiredAt || null },
      thumbs: (article ? [p.coverMedia] : p.media?.images || []).map((x) => httpsUrl(x?.url)).filter(Boolean).slice(0, 4),
      linkPreview: lp?.url ? { url: webUrl(lp.url), title: lp.title || '', domain: lp.domain || '', image: httpsUrl(lp.image) } : null,
      tags: (p.tags || []).map((t) => t?.name).filter(Boolean),
      series: (p.series || []).map((x) => x?.title || x?.name).filter(Boolean),
      mentions: Object.values(p.mentions || {}).map((u) => u?.username).filter(Boolean),
    };
  }

  // ---------- Báo cáo vi phạm ----------

  const REPORT_STATUS = { CREATED: 'Chờ xử lý', IGNORED: 'Đã bỏ qua', HID: 'Đã ẩn' };
  const REPORT_TARGET = { POST: 'Bài viết', ARTICLE: 'Article', COMMENT: 'Bình luận' };

  // Một báo cáo nội dung (GET content/manage/communities/{groupId gốc}/content-reports)
  function slimReport(r) {
    const reasons = (r.reasonsCount || []).map((x) => ({
      type: x.reasonType || 'OTHERS',
      label: HIDE_REASONS[x.reasonType] || x.reasonType || 'Khác',
      total: x.total || 0,
      description: x.description || '',
    }));
    return {
      id: r.id,
      targetId: r.targetId,
      targetType: r.targetType || 'POST',
      content: String(r.content || '').slice(0, TEXT_MAX),
      actor: slimPerson(r.targetActor),
      reasons,
      total: reasons.reduce((s, x) => s + x.total, 0),
      status: r.status || 'CREATED',
      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || null,
      commentPostId: r.commentPostId || null,
    };
  }

  // Link tới nội dung bị báo cáo: bình luận thì mở bài chứa bình luận
  function reportUrl(r) {
    if (r.targetType === 'COMMENT') return r.commentPostId ? `${SITE}/posts/${r.commentPostId}` : '';
    return postUrl({ id: r.targetId, type: r.targetType });
  }

  // Link trong bài: http(s)://…, www.…, hoặc tên miền có đuôi phổ biến (t.me/…, bit.ly/…)
  const LINK_RE = /(?:https?:\/\/[^\s<>"'()\]]+|www\.[^\s<>"'()\]]+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|vn|xyz|link|ly|gg|app|co|info|top|site|online|club|pro|biz|cc|to|tk|ml|ga|cf|live|bet|fun|win|vip|shop|store)\b(?:\/[^\s<>"'()\]]*)?)/gi;

  function cleanDomain(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split(/[/?#:]/)[0]
      .replace(/\.+$/, '');
  }

  function linkDomains(text) {
    const out = [];
    for (const m of String(text || '').matchAll(LINK_RE)) {
      const d = cleanDomain(m[0]);
      if (d && d.includes('.') && !out.includes(d)) out.push(d);
    }
    return out;
  }

  // ---------- Nhắc tên (@username) và xem trước link khi đăng bài ----------
  // Ký tự trong username giống trình soạn thảo web Beincom
  const MENTION_CHAR = '[\\w\\-.À-ÖØ-öø-ÿĀ-ňŊ-ſА-я々-〆぀-ゟ゠-ヿ㄰-㆏가-힣一-龥؀-ۿÀ-ỹ]';
  const MENTION_AT_END = new RegExp(`(^|\\s)@(${MENTION_CHAR}*)$`);
  const MENTION_ALL = new RegExp(`(^|\\s)@(${MENTION_CHAR}+)`, 'g');
  const MENTION_TAIL = /[.|?,!$%*)(#]+$/; // web bỏ dấu câu dính sau tên

  // Chữ trước con trỏ kết thúc bằng "@abc" (đầu dòng hoặc sau khoảng trắng) thì đang gõ nhắc tên
  function mentionQuery(before) {
    const m = MENTION_AT_END.exec(String(before || ''));
    return m ? { start: m.index + m[1].length, query: m[2] } : null;
  }

  // Người trong danh sách nhắc tên được (API trả snake_case)
  function slimMentionable(u) {
    return { id: u.id, username: u.username || '', fullname: u.fullname || '', avatar: u.avatar || '', isVerified: !!(u.is_verified ?? u.isVerified) };
  }

  // Dạng web lưu trong mentions của bài: { [username]: { id, avatar, name, fullname, isVerified } }
  function mentionEntry(u) {
    return { id: u.id, avatar: u.avatar || '', name: u.username, fullname: u.fullname || '', isVerified: !!u.isVerified };
  }

  // Chỉ giữ những người còn được nhắc trong nội dung (@username đứng đầu dòng hoặc sau khoảng trắng)
  function usedMentions(content, known) {
    const out = {};
    for (const m of String(content || '').matchAll(MENTION_ALL)) {
      const name = m[2].replace(MENTION_TAIL, '');
      if (known?.[name]) out[name] = known[name];
    }
    return out;
  }

  // Link cuối cùng trong bài (web xem trước link cuối); thêm https:// nếu thiếu
  function lastLink(text) {
    const all = [...String(text || '').matchAll(LINK_RE)].map((m) => m[0].replace(/[.,!?;:]+$/, ''));
    const url = all.at(-1);
    if (!url) return '';
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
  }

  // Thông tin xem trước link (GET group/url-metadata hoặc content/contents/{id}/link-preview)
  function slimLinkPreview(d) {
    if (!d?.url) return null;
    const str = (v) => (typeof v === 'string' ? v : '');
    return { url: d.url, domain: str(d.domain), title: str(d.title), image: httpsUrl(d.image), description: str(d.description).slice(0, 300) };
  }

  function domainIn(d, list) {
    return (list || []).some((x) => {
      const c = cleanDomain(x);
      return c && (d === c || d.endsWith('.' + c));
    });
  }

  // verdict: 'ok' (không vi phạm) · 'review' (cần xem) · 'bad' (vi phạm)
  function evaluatePost(post, rules = DEFAULT_POST_RULES) {
    const r = { ...DEFAULT_POST_RULES, ...rules };
    const reasons = [];
    const text = [post.title, post.text, post.link].filter(Boolean).join('\n');
    const hay = norm(text);
    const hits = r.bannedKeywords.filter((k) => norm(k) && hay.includes(norm(k)));
    if (hits.length) reasons.push({ level: 'bad', code: 'keyword', text: 'Chứa từ khoá cấm: ' + hits.join(', ') });

    const domains = linkDomains(text);
    const blocked = domains.filter((d) => domainIn(d, r.blockedDomains));
    if (blocked.length) reasons.push({ level: 'bad', code: 'blocked', domains: blocked, text: 'Có link bị cấm: ' + blocked.join(', ') });
    if (r.reviewExternalLinks) {
      const ext = domains.filter((d) => !blocked.includes(d) && !domainIn(d, r.allowedDomains));
      if (ext.length) reasons.push({ level: 'warn', code: 'external', text: 'Có link ngoài: ' + ext.join(', ') });
    }

    if (reasons.some((x) => x.level === 'bad')) return { verdict: 'bad', reasons };
    if (reasons.length) return { verdict: 'review', reasons };
    return { verdict: 'ok', reasons: [{ level: 'ok', text: 'Không vi phạm quy tắc' }] };
  }

  // ---------- Bình luận ----------
  // GET content/comments?postId=…&limit=… -> { list, meta }: bình luận gốc (parentId = COMMENT_ROOT), mới nhất trước.
  // Danh sách không kèm trả lời (gọi thật 09/10/2026); trả lời đọc riêng bằng thêm parentId. `child.list` vẫn đọc nếu có.
  const COMMENT_ROOT = '00000000-0000-0000-0000-000000000000';
  const COMMENT_MAX = 300; // số bình luận giữ lại để xem / chấm

  // post: bài chứa bình luận (đã thu gọn, có seenIn) để biết bình luận thuộc group nào
  function slimComment(c, post = {}) {
    const a = c.actor || {};
    return {
      id: c.id,
      postId: c.postId || post.id || '',
      postType: post.type || 'POST',
      postSnippet: String(post.title || post.text || '').replace(/\s+/g, ' ').trim().slice(0, 80),
      parentId: c.parentId && c.parentId !== COMMENT_ROOT ? c.parentId : '',
      title: '',
      text: String(c.content ?? '').slice(0, TEXT_MAX),
      link: '',
      actor: { id: a.id || '', username: a.username || '', fullname: a.fullname || '', avatar: a.avatar || '' },
      createdAt: c.createdAt || null,
      images: c.media?.images?.length || 0,
      giphy: !!(c.giphyUrl || c.giphyId),
      totalReply: c.totalReply || 0,
      groups: (post.groups || []).map((g) => ({ id: g.id, name: g.name || '', communityId: g.communityId || '', rootGroupId: g.rootGroupId || '', isCommunity: !!g.isCommunity })),
      seenIn: post.seenIn || [],
      isHidden: !!c.isHidden,
    };
  }

  // Bình luận gốc và các trả lời đi kèm trong một trang
  function flattenComments(list, post) {
    const out = [];
    for (const c of list || []) {
      if (!c?.id) continue;
      out.push(slimComment(c, post));
      for (const r of c.child?.list || []) if (r?.id) out.push(slimComment({ ...r, parentId: r.parentId && r.parentId !== COMMENT_ROOT ? r.parentId : c.id }, post));
    }
    return out;
  }

  // Bài cần đọc bình luận: số bình luận lớn hơn lúc đọc lần trước (seen: { postId: số đã đọc }), bài mới đăng trước
  function commentTargets(seen, posts, max) {
    return (posts || [])
      .filter((p) => !p.isHidden && (p.commentsCount || 0) > (seen?.[p.id] || 0))
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
      .slice(0, max);
  }

  // Bình luận gốc cần đọc trả lời: số trả lời lớn hơn lần trước (prev: danh sách bình luận đã lưu), mới nhất trước
  function replyTargets(comments, prev, max) {
    const old = new Map((prev || []).map((c) => [c.id, c.totalReply || 0]));
    return (comments || [])
      .filter((c) => !c.parentId && !c.isHidden && (c.totalReply || 0) > (old.get(c.id) || 0))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .slice(0, max);
  }

  // Gộp bình luận vừa đọc: giữ đánh dấu bỏ qua / đã ẩn, mới nhất trước. fresh = id chưa từng thấy
  function mergeComments(prev, comments, now = Date.now()) {
    const map = new Map((prev || []).map((c) => [c.id, c]));
    const fresh = [];
    for (const c of comments || []) {
      const old = map.get(c.id);
      if (!old) fresh.push(c.id);
      map.set(c.id, { ...c, firstSeen: old?.firstSeen ?? now, dismissed: !!old?.dismissed, isHidden: c.isHidden || !!old?.isHidden });
    }
    const list = [...map.values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, COMMENT_MAX);
    return { list, fresh };
  }

  // Bình luận vi phạm quy tắc -> sự kiện cho hồ sơ vi phạm
  function violationsFromComments(comments, reasonOf = () => '') {
    return (comments || [])
      .filter((c) => c.actor?.id)
      .map((c) => ({ user: c.actor, type: 'rule', key: 'rule:c:' + c.id, time: c.createdAt, group: c.groups?.[0]?.name || '', snippet: c.text, reason: reasonOf(c) }));
  }

  // ---------- Spam: tự ẩn và phát hiện đợt spam ----------

  // Tên miền cấm có trong bài / bình luận (theo quy tắc của group). Rỗng = không tự ẩn.
  function blockedHits(x, ctx = {}) {
    const ev = evaluatePostIn(x, ctx);
    return [...new Set(ev.reasons.filter((r) => r.code === 'blocked').flatMap((r) => r.domains || []))];
  }

  // Khoá của một link để gom: tên miền (bỏ www) + đường dẫn, bỏ phần ?query và # và dấu / cuối
  function linkKeys(text) {
    const out = [];
    for (const m of String(text || '').matchAll(LINK_RE)) {
      const raw = m[0].trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
      const host = raw.split(/[/?#:]/)[0].replace(/\.+$/, '');
      if (!host.includes('.')) continue;
      const path = (raw.slice(host.length).split(/[?#]/)[0] || '').replace(/[.,!)]+$/, '').replace(/\/+$/, '');
      const key = host + path;
      if (!out.some((k) => k.key === key)) out.push({ key, host });
    }
    return out;
  }

  const WAVE_WINDOW_MS = 6 * 3600e3;
  const WAVE_MIN_ACCOUNTS = 3;
  const WAVE_TEXT_MIN = 25; // nội dung ngắn hơn (vd "cảm ơn admin") không tính là spam giống nhau

  // Đợt spam: cùng một link (hoặc cùng nội dung) từ ít nhất `minAccounts` tài khoản khác nhau trong `windowMs` gần nhất.
  // items: [{ id, kind: 'post' | 'comment', actor, text, time, isHidden }]; allowed: tên miền bỏ qua (vd beincom.com)
  function spamWaves(items, { now = Date.now(), windowMs = WAVE_WINDOW_MS, minAccounts = WAVE_MIN_ACCOUNTS, allowed = ['beincom.com'], skipActorIds = [] } = {}) {
    const skip = new Set(skipActorIds);
    const recent = (items || []).filter((x) => x?.actor?.id && !skip.has(x.actor.id) && Date.parse(x.time) >= now - windowMs && Date.parse(x.time) <= now + 60e3);
    const groups = new Map();
    const add = (key, type, label, host, x) => {
      if (!groups.has(key)) groups.set(key, { key, type, label, host, items: [] });
      groups.get(key).items.push(x);
    };
    for (const x of recent) {
      for (const l of linkKeys(x.text)) if (!domainIn(l.host, allowed)) add('link:' + l.key, 'link', l.key, l.host, x);
      const t = norm(x.text).replace(/\s+/g, ' ').trim();
      if (t.length >= WAVE_TEXT_MIN) add('text:' + t.slice(0, 200), 'text', String(x.text).replace(/\s+/g, ' ').trim().slice(0, 100), '', x);
    }
    const waves = [];
    for (const g of groups.values()) {
      const byId = new Map(g.items.map((x) => [x.kind + ':' + x.id, x]));
      const list = [...byId.values()];
      const accounts = [...new Map(list.map((x) => [x.actor.id, x.actor])).values()];
      if (accounts.length < minAccounts) continue;
      const times = list.map((x) => Date.parse(x.time)).sort((a, b) => a - b);
      waves.push({
        key: g.key,
        type: g.type,
        label: g.label,
        host: g.host,
        accounts,
        items: list.map((x) => ({ id: x.id, kind: x.kind, isHidden: !!x.isHidden })),
        first: new Date(times[0]).toISOString(),
        last: new Date(times.at(-1)).toISOString(),
      });
    }
    // Đợt theo nội dung mà mọi mục đã nằm trong một đợt theo link thì bỏ (tránh báo hai lần)
    const linkSets = waves.filter((w) => w.type === 'link').map((w) => new Set(w.items.map((i) => i.kind + ':' + i.id)));
    return waves
      .filter((w) => w.type === 'link' || !linkSets.some((s) => w.items.every((i) => s.has(i.kind + ':' + i.id))))
      .sort((a, b) => b.items.length - a.items.length || b.accounts.length - a.accounts.length);
  }

  // Bài + bình luận đang giữ -> dạng chung cho spamWaves
  function waveItems(recentPosts, recentComments) {
    return [
      ...(recentPosts || []).map((p) => ({ id: p.id, kind: 'post', actor: p.actor, text: [p.title, p.text, p.link].filter(Boolean).join('\n'), time: p.publishedAt || p.submittedAt, isHidden: p.isHidden })),
      ...(recentComments || []).map((c) => ({ id: c.id, kind: 'comment', actor: c.actor, text: c.text, time: c.createdAt, isHidden: c.isHidden })),
    ];
  }

  // Community có thể cấm thành viên (mình là chủ / admin community): mỗi community một group gốc
  function banTargets(groups) {
    const seen = new Set();
    return (groups || []).filter((g) => g.isCommunity && g.canBan && g.communityId && !seen.has(g.communityId) && seen.add(g.communityId));
  }

  // ---------- Viết bình luận / trả lời ----------
  // POST content/comments { postId, content, media, giphy, mentions } hoặc POST content/comments/{id}/reply (cùng body).
  // mentions trong bình luận (gọi thật 09/10/2026): { username: { id, fullname, username, avatar } }, nội dung ghi @username.
  const COMMENT_TEXT_MAX = 3000;

  function validateComment(content) {
    const t = String(content || '').trim();
    if (!t) return 'Bình luận chưa có nội dung';
    if (t.length > COMMENT_TEXT_MAX) return `Bình luận dài ${t.length} ký tự, tối đa ${COMMENT_TEXT_MAX}`;
    return '';
  }

  // people: [{ id, username, fullname, avatar }] -> mentions của những người còn được @ trong nội dung
  function commentMentions(content, people) {
    const known = {};
    for (const u of people || []) if (u?.id && u.username) known[u.username] = { id: u.id, fullname: u.fullname || '', username: u.username, avatar: u.avatar || '' };
    return usedMentions(content, known);
  }

  // Trả lời một bình luận: trả lời của trả lời thì gửi vào bình luận gốc (như web), nhắc tên người viết
  function replyTarget(c) {
    return { commentId: c.parentId || c.id, prefill: c.actor?.username ? `@${c.actor.username} ` : '' };
  }

  // Bài chưa ai trả lời: đăng đã hơn `minHours` giờ (và chưa quá `maxDays` ngày), chưa có bình luận, không phải bài của mình
  function isUnanswered(p, { now = Date.now(), minHours = 3, maxDays = 7, meId = '' } = {}) {
    const t = Date.parse(p.publishedAt);
    if (!Number.isFinite(t) || p.isHidden || (p.commentsCount || 0) > 0) return false;
    if (meId && p.actor?.id === meId) return false;
    return now - t >= minHours * 3600e3 && now - t <= maxDays * 864e5;
  }

  // ---------- Theo dõi từ khoá ----------
  // Từ khoá cần để ý có trong nội dung (không phân biệt hoa thường và dấu, như từ khoá cấm)
  function watchHits(text, keywords) {
    const hay = norm(text);
    return [...new Set((keywords || []).filter((k) => norm(k) && hay.includes(norm(k))))];
  }

  // ---------- Tự duyệt bài của thành viên tin cậy ----------
  // Tin cậy: có trong danh sách (username), hoặc đã được duyệt ít nhất N bài qua addon và chưa bị từ chối bài nào.
  // Người có hồ sơ vi phạm không bao giờ được tự duyệt. Bài phải đạt mọi quy tắc bài viết (không "Cần xem").
  function trustReason(actor, { trustedMembers = [], trustAfterApproved = 0 } = {}, trust = {}, profile = null) {
    if (!actor?.id) return '';
    if (profile?.events?.length) return '';
    const name = String(actor.username || '').toLowerCase();
    if (name && (trustedMembers || []).some((x) => String(x).toLowerCase().replace(/^@/, '') === name)) return 'Thành viên tin cậy';
    const t = trust?.[actor.id];
    if (trustAfterApproved > 0 && t && !t.rejected && t.approved >= trustAfterApproved) return `Đã được duyệt ${t.approved} bài`;
    return '';
  }

  // Đếm bài được duyệt / bị từ chối của từng người từ các thao tác qua addon (Dashboard, Telegram, tự duyệt)
  function tallyPostTrust(trust, entries, now = Date.now()) {
    const out = { ...(trust || {}) };
    for (const e of entries || []) {
      if (e.kind !== 'post' || e.status !== 'ok' || !e.userId || (e.action !== 'approve' && e.action !== 'reject')) continue;
      const t = { approved: 0, rejected: 0, ...out[e.userId] };
      if (e.action === 'approve') t.approved++;
      else t.rejected++;
      out[e.userId] = { ...t, username: e.username || t.username || '', at: now };
    }
    return Object.fromEntries(
      Object.entries(out)
        .sort(([, a], [, b]) => (b.at || 0) - (a.at || 0))
        .slice(0, 2000),
    );
  }

  // ---------- Dọn tài khoản / lọc bài ----------
  // Bài và bình luận gần đây (addon đã đọc) của một người, còn hiện — để ẩn một lần
  function userFootprint(userId, posts = [], comments = []) {
    const mine = (x) => !!userId && x?.actor?.id === userId && !x.isHidden;
    return { posts: (posts || []).filter(mine), comments: (comments || []).filter(mine) };
  }

  // Lọc bài / bình luận: "@tên" theo người đăng, "#TAG" theo tag, còn lại tìm trong tên người đăng và nội dung (không dấu)
  function itemMatches(x, q) {
    const s = norm(q);
    if (!s) return true;
    const a = x?.actor || {};
    if (s.startsWith('@')) return norm(a.username).includes(s.slice(1));
    if (s.startsWith('#')) return (x.tags || []).some((t) => norm(t).includes(s.slice(1)));
    return [a.fullname, a.username, x.title, x.text].some((v) => norm(v).includes(s));
  }

  // ---------- Quy tắc riêng cho từng group ----------
  // groupRules: { [groupId]: { rules: {...}, postRules: {...} } } (bản đầy đủ, chép từ quy tắc đang dùng lúc tạo)
  // Thứ tự: riêng của group -> riêng của group gốc (community) -> quy tắc chung
  function ruleSource(g, groupRules, groups = []) {
    if (!g?.id) return null;
    if (groupRules?.[g.id]) return g.id;
    const root = g.rootGroupId || (g.isCommunity ? g.id : (groups || []).find((x) => x.isCommunity && x.communityId === g.communityId)?.id);
    return root && groupRules?.[root] ? root : null;
  }

  // ctx: { rules, postRules, groupRules, groups } -> { source, rules, postRules }
  function effectiveRules(g, ctx = {}) {
    const source = ruleSource(g, ctx.groupRules, ctx.groups);
    const own = source ? ctx.groupRules[source] : null;
    return {
      source,
      rules: { ...DEFAULT_RULES, ...ctx.rules, ...(own?.rules || {}) },
      postRules: { ...DEFAULT_POST_RULES, ...ctx.postRules, ...(own?.postRules || {}) },
    };
  }

  const VERDICT_RANK = { ok: 0, review: 1, bad: 2 };

  // Chấm bài theo quy tắc của các group bài được đăng vào (bài đăng nhiều group: lấy kết quả nặng nhất)
  function evaluatePostIn(post, ctx = {}, fallback = null) {
    const known = new Map((ctx.groups || []).map((g) => [g.id, g]));
    const ids = [...new Set([...(post.seenIn || []), ...(post.groups || []).map((x) => x.id)])];
    const sources = new Map();
    for (const id of ids) {
      const g = known.get(id) || (post.groups || []).find((x) => x.id === id);
      const src = ruleSource(g, ctx.groupRules, ctx.groups) || '';
      if (!sources.has(src)) sources.set(src, g);
    }
    if (!sources.size) sources.set('', fallback);
    let worst = null;
    for (const g of sources.values()) {
      const ev = evaluatePost(post, effectiveRules(g, ctx).postRules);
      if (!worst || VERDICT_RANK[ev.verdict] > VERDICT_RANK[worst.verdict]) worst = ev;
    }
    return worst;
  }

  const POST_VERDICT_LABELS = {
    approval: { ok: 'Gợi ý duyệt', review: 'Cần xem', bad: 'Gợi ý từ chối' },
    published: { ok: 'Không vi phạm', review: 'Cần xem', bad: 'Vi phạm' },
  };

  // ID yêu cầu mới so với lần quét trước (để thông báo)
  function newRequestIds(groups, knownIds) {
    const known = new Set(knownIds || []);
    const out = [];
    for (const g of groups || []) for (const r of g.requests || []) if (!known.has(r.id)) out.push(r.id);
    return out;
  }

  // Bài bị Beincom gắn cờ tự động: một bài có thể nằm ở nhiều group, chỉ đếm một lần
  function autoFlaggedIds(groups) {
    return [...new Set((groups || []).flatMap((g) => g.flaggedIds || []))];
  }

  function totals(groups) {
    let requests = 0;
    let posts = 0;
    let reports = 0;
    const seenCommunity = new Set();
    for (const g of groups || []) {
      requests += g.pendingTotal || 0;
      // Bài chờ duyệt tính theo community: chỉ cộng một lần
      if (g.approvalCount != null && !seenCommunity.has(g.communityId)) {
        seenCommunity.add(g.communityId);
        posts += g.approvalCount;
      }
      // Báo cáo chờ xử lý chỉ đọc ở group gốc của community
      reports += (g.reportIds || []).length;
    }
    return { requests, posts, reports, autoFlagged: autoFlaggedIds(groups).length };
  }

  Object.assign(BG, {
    ruleSource,
    effectiveRules,
    evaluatePostIn,
    mentionQuery,
    slimMentionable,
    mentionEntry,
    usedMentions,
    lastLink,
    slimLinkPreview,
    slimScheduled,
    POST_VERDICT_LABELS,
    blockedHits,
    COMMENT_TEXT_MAX,
    validateComment,
    commentMentions,
    replyTarget,
    isUnanswered,
    watchHits,
    trustReason,
    tallyPostTrust,
    userFootprint,
    itemMatches,
    domainIn,
    linkKeys,
    spamWaves,
    waveItems,
    banTargets,
    WAVE_WINDOW_MS,
    WAVE_MIN_ACCOUNTS,
    REPORT_STATUS,
    REPORT_TARGET,
    slimReport,
    reportUrl,
    slimPost,
    COMMENT_ROOT,
    COMMENT_MAX,
    slimComment,
    flattenComments,
    commentTargets,
    replyTargets,
    mergeComments,
    violationsFromComments,
    linkDomains,
    evaluatePost,
    newRequestIds,
    totals,
    autoFlaggedIds,
    // dùng chung giữa các phần của BG
    MENTION_ALL,
    MENTION_CHAR,
    MENTION_TAIL,
    httpsUrl,
  });
});
