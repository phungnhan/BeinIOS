// BeinGroup — quản lý group và addon: cài đặt group, quản lý tag, sao lưu & khôi phục, có gì mới.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const { DEFAULT_POST_RULES, DEFAULT_RULES, DEFAULT_SETTINGS, SITE, addViolations, VIOLATION_TYPES } = BG;

  // ---------- Sao lưu & khôi phục cài đặt ----------
  const BACKUP_FORMAT = 1;
  const BACKUP_KEYS = ['settings', 'rules', 'postRules', 'groupRules', 'templates', 'promptBank'];

  function makeBackup(store, { profiles = false, history = false, version = '', now = Date.now() } = {}) {
    const data = {};
    for (const k of BACKUP_KEYS) if (store?.[k] !== undefined) data[k] = store[k];
    if (profiles && store?.profiles) data.profiles = store.profiles;
    if (history) data.history = historyOf(store);
    return { app: 'BeinGroup', format: BACKUP_FORMAT, version, exportedAt: new Date(now).toISOString(), data };
  }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const strList = (v, max = 500) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, max) : []);
  const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // Chỉ giữ khoá có trong bản mặc định, đúng kiểu
  function cleanLike(defaults, obj) {
    const out = {};
    if (!isObj(obj)) return out;
    for (const [k, def] of Object.entries(defaults)) {
      const v = obj[k];
      if (v === undefined) continue;
      if (Array.isArray(def)) {
        if (Array.isArray(v)) out[k] = strList(v);
      } else if (typeof def === 'number') {
        if (Number.isFinite(Number(v)) && v !== null && v !== '') out[k] = Number(v);
      } else if (typeof v === typeof def) out[k] = v;
    }
    return out;
  }

  function cleanRules(v) {
    const r = cleanLike(DEFAULT_RULES, v);
    if (r.minAnswerLength !== undefined) r.minAnswerLength = clampNum(Math.round(r.minAnswerLength), 0, 200);
    return r;
  }

  const cleanRefs = (v, label) => (Array.isArray(v) ? v.filter((x) => isObj(x) && typeof x.id === 'string' && typeof x[label] === 'string').map((x) => ({ ...x })).slice(0, 10) : []);

  // Đọc và làm sạch tệp sao lưu (ném lỗi có câu tiếng Việt khi tệp không dùng được)
  function readBackup(obj) {
    if (!isObj(obj) || obj.app !== 'BeinGroup' || !isObj(obj.data)) throw new Error('Không phải tệp sao lưu của BeinGroup');
    if (Number(obj.format) > BACKUP_FORMAT) throw new Error('Tệp sao lưu từ phiên bản BeinGroup mới hơn — hãy cập nhật addon trước');
    const d = obj.data;
    const data = {};
    if (isObj(d.settings)) {
      const s = cleanLike(DEFAULT_SETTINGS, d.settings);
      if (s.intervalMin !== undefined) s.intervalMin = clampNum(Math.round(s.intervalMin), 5, 1440);
      if (s.actionDelaySec !== undefined) s.actionDelaySec = clampNum(s.actionDelaySec, 0, 60);
      if (s.unansweredHours !== undefined) s.unansweredHours = clampNum(Math.round(s.unansweredHours), 1, 72);
      if (s.pendingHours !== undefined) s.pendingHours = clampNum(Math.round(s.pendingHours), 1, 168);
      if (s.burstJoins !== undefined) s.burstJoins = clampNum(Math.round(s.burstJoins), 5, 1000);
      if (s.trustAfterApproved !== undefined) s.trustAfterApproved = clampNum(Math.round(s.trustAfterApproved), 0, 100);
      data.settings = s;
    }
    if (isObj(d.rules)) data.rules = cleanRules(d.rules);
    if (isObj(d.postRules)) data.postRules = cleanLike(DEFAULT_POST_RULES, d.postRules);
    if (isObj(d.groupRules)) {
      data.groupRules = Object.fromEntries(
        Object.entries(d.groupRules)
          .filter(([id, v]) => /^[\w-]{1,64}$/.test(id) && isObj(v))
          .slice(0, 500)
          .map(([id, v]) => [id, { name: String(v.name || '').slice(0, 200), rules: { ...DEFAULT_RULES, ...cleanRules(v.rules) }, postRules: { ...DEFAULT_POST_RULES, ...cleanLike(DEFAULT_POST_RULES, v.postRules) } }]),
      );
    }
    if (Array.isArray(d.templates)) {
      data.templates = d.templates
        .filter((t) => isObj(t) && typeof t.name === 'string' && typeof t.text === 'string')
        .slice(0, 200)
        .map((t, i) => ({
          id: typeof t.id === 'string' && t.id ? t.id.slice(0, 64) : 'tpl' + i,
          name: t.name.slice(0, 100),
          text: t.text.slice(0, 20000),
          groupIds: strList(t.groupIds, 200),
          canComment: t.canComment !== false,
          canReact: t.canReact !== false,
          mentions: isObj(t.mentions) ? Object.fromEntries(Object.entries(t.mentions).filter(([, m]) => isObj(m) && typeof m.id === 'string')) : {},
          tags: cleanRefs(t.tags, 'name'),
          series: cleanRefs(t.series, 'title'),
        }));
    }
    if (isObj(d.history)) {
      const h = cleanHistory(d.history);
      if (h && (Object.keys(h.postStats).length || h.nudges.length || Object.keys(h.memberHistory).length || h.log.length)) data.history = h;
    }
    if (isObj(d.promptBank)) {
      const b = BG.cleanPromptBank(d.promptBank);
      if (b?.items.length) data.promptBank = b;
    }
    if (isObj(d.profiles) && isObj(d.profiles.users)) {
      const users = {};
      for (const [id, p] of Object.entries(d.profiles.users)) {
        if (!isObj(p) || !isObj(p.user) || typeof p.user.id !== 'string' || !Array.isArray(p.events)) continue;
        users[id] = { ...p, events: p.events.filter((e) => isObj(e) && typeof e.key === 'string' && VIOLATION_TYPES[e.type]) };
      }
      data.profiles = { users };
    }
    if (!Object.keys(data).length) throw new Error('Tệp sao lưu không có dữ liệu');
    return { data, exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : null, version: typeof obj.version === 'string' ? obj.version : '' };
  }

  // Các mục có trong bản sao lưu (để hỏi lại trước khi khôi phục)
  function backupSummary(d) {
    const out = [];
    if (d.settings) out.push('Cài đặt chung' + (d.settings.dryRun === false ? ' (Chạy thử: TẮT)' : d.settings.dryRun ? ' (Chạy thử: bật)' : ''));
    if (d.rules) out.push('Quy tắc lọc thành viên');
    if (d.postRules) out.push('Quy tắc bài viết');
    if (d.groupRules) out.push(`Quy tắc riêng: ${Object.keys(d.groupRules).length} group`);
    if (d.templates) out.push(`Mẫu bài: ${d.templates.length}`);
    if (d.promptBank) out.push(`Kho câu hỏi thảo luận: ${d.promptBank.items.length} câu`);
    if (d.history) out.push(historySummary(d.history));
    if (d.profiles) out.push(`Hồ sơ vi phạm: ${Object.keys(d.profiles.users).length} người (gộp với hồ sơ đang có)`);
    return out;
  }

  // Gộp hồ sơ vi phạm từ bản sao lưu vào hồ sơ đang có (bỏ trùng như khi quét)
  function mergeProfiles(cur, incoming) {
    const events = [];
    for (const p of Object.values(incoming?.users || {})) for (const e of p.events || []) events.push({ ...e, user: p.user });
    return addViolations(cur, events).store;
  }

  // ---------- Quản lý tag (theo community) ----------
  // Giống web: tên 3–32 ký tự, viết hoa; chỉ sửa / xoá được tag chưa gắn vào bài nào (web ẩn nút với tag đã dùng),
  // cần quyền quản lý tag của community (GET group/me/permissions/can-cud-tags/community/{id}).
  const TAG_NAME_MIN = 3;
  const TAG_NAME_MAX = 32;
  const tagName = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();

  function validateTagName(name, existing = [], selfId = '') {
    const n = tagName(name);
    if (n.length < TAG_NAME_MIN) return `Tên tag cần ít nhất ${TAG_NAME_MIN} ký tự`;
    if (n.length > TAG_NAME_MAX) return `Tên tag tối đa ${TAG_NAME_MAX} ký tự`;
    if ((existing || []).some((t) => t.id !== selfId && tagName(t.name) === n)) return `Community đã có tag ${n}`;
    return '';
  }

  // Kết quả API quyền: true / false, hoặc đối tượng có một cờ true; không đọc được thì null (chưa biết)
  function tagPermission(data) {
    if (typeof data === 'boolean') return data;
    if (data && typeof data === 'object') {
      const flags = Object.values(data).filter((v) => typeof v === 'boolean');
      if (flags.length) return flags.some(Boolean);
    }
    return null;
  }

  // Trang tìm bài gắn tag trong community (như bấm tag trên web): /search?tags=["TÊN"]&group={…}
  function tagSearchUrl(name, g = null) {
    const q = new URLSearchParams({ tags: JSON.stringify([name]) });
    if (g) q.set('group', JSON.stringify({ id: g.id, name: g.name || '', avatar: '', isIncludeInnerGroups: true }));
    return `${SITE}/search?${q}`;
  }

  // ---------- Cài đặt group (bật / tắt nhiều group một lần) ----------
  // perm: 'join' = quyền edit_join_setting, 'privacy' = edit_privacy, 'community' = admin community
  // snake: tên khoá gửi lên (API nhóm nhận snake_case; web viết camelCase rồi đổi khi gửi)
  const GROUP_SETTINGS = {
    isJoinApproval: { label: 'Duyệt thành viên', snake: 'is_join_approval', perm: 'join', hint: 'Người xin vào phải được admin duyệt' },
    isActiveMembershipQuestions: { label: 'Câu hỏi gia nhập', snake: 'is_active_membership_questions', perm: 'join', hint: 'Người xin vào phải trả lời câu hỏi (group cần có câu hỏi)' },
    isInvitedOnly: { label: 'Chỉ người được mời', snake: 'is_invited_only', perm: 'join', hint: 'Chỉ người nhận lời mời mới vào được' },
    isHiddenMembers: { label: 'Ẩn danh sách thành viên', snake: 'is_hidden_members', perm: 'privacy', hint: 'Người ngoài group không xem được danh sách thành viên' },
    contentApproval: { label: 'Duyệt bài', perm: 'community', hint: 'Bài phải được admin duyệt trước khi hiện' },
  };

  function hasGroupPerm(permData, groupId, name) {
    return !!permData?.groups?.[groupId]?.includes(name);
  }

  // GET group/groups/{id}/settings -> { values: { khoá: true/false }, locked: { khoá: lý do Beincom không cho đổi } }
  function slimGroupSettings(d) {
    const s = d?.settings || {};
    const values = {};
    const locked = {};
    for (const k of Object.keys(GROUP_SETTINGS)) {
      values[k] = k === 'contentApproval' ? !!s.contentApproval?.value : !!s[k];
      const why = d?.changeableSettings?.[k];
      if (typeof why === 'string' && why.trim()) locked[k] = why.trim();
    }
    return { values, locked };
  }

  // Lý do không đổi được cài đặt này ở group (theo quyền đã quét); '' = đổi được
  function settingDenied(g, key) {
    const perm = GROUP_SETTINGS[key]?.perm;
    if (!perm) return 'Cài đặt không hợp lệ';
    if (perm === 'community') return g.isCommunityAdmin ? '' : 'Cần quyền chủ / admin community';
    if (perm === 'join') return g.canEditJoin === false ? 'Không có quyền đổi cài đặt tham gia' : '';
    return g.canEditPrivacy === false ? 'Không có quyền đổi quyền riêng tư' : '';
  }

  // Body gửi lên: cài đặt thành viên -> PUT group/groups/{id}/settings; duyệt bài -> PUT group/communities/{communityId}/content-settings
  function groupSettingBody(key, value, groupId) {
    if (key === 'contentApproval') return { group_id: groupId, content_approval: { value: !!value }, is_update_all: false };
    return { id: groupId, [GROUP_SETTINGS[key].snake]: !!value };
  }

  // ---------- Lịch sử số liệu trong bản sao lưu (tuỳ chọn) ----------
  // Hiệu quả bài (postStats), các lần nhắc người mới (nudges), số thành viên theo ngày (state.memberHistory), nhật ký thao tác (log).
  // Khôi phục thì gộp với dữ liệu đang có (dữ liệu trong máy được ưu tiên khi trùng).
  const HISTORY_LOG_MAX = 500;
  const HISTORY_NUDGES_MAX = 50;
  const HISTORY_DAYS_MAX = 120;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function historyOf(store) {
    return { postStats: store?.postStats || {}, nudges: store?.nudges || [], memberHistory: store?.state?.memberHistory || {}, log: store?.log || [] };
  }

  // Làm sạch phần lịch sử trong tệp sao lưu (bỏ mục sai kiểu, giới hạn số lượng)
  function cleanHistory(h) {
    if (!isObj(h)) return null;
    const postStats = {};
    for (const [id, e] of Object.entries(isObj(h.postStats) ? h.postStats : {})) {
      if (!/^[\w-]{1,64}$/.test(id) || !isObj(e) || e.id !== id) continue;
      postStats[id] = e;
    }
    const nudges = (Array.isArray(h.nudges) ? h.nudges : [])
      .filter((n) => isObj(n) && typeof n.id === 'string' && typeof n.groupId === 'string' && typeof n.at === 'string' && Array.isArray(n.userIds))
      .slice(0, HISTORY_NUDGES_MAX)
      .map((n) => ({ id: n.id.slice(0, 64), groupId: n.groupId.slice(0, 64), groupName: String(n.groupName || '').slice(0, 200), at: n.at, userIds: strList(n.userIds, 50) }));
    const memberHistory = {};
    for (const [gid, list] of Object.entries(isObj(h.memberHistory) ? h.memberHistory : {})) {
      if (!/^[\w-]{1,64}$/.test(gid) || !Array.isArray(list)) continue;
      memberHistory[gid] = list.filter((x) => isObj(x) && DAY_RE.test(x.day) && Number.isFinite(Number(x.count))).map((x) => ({ day: x.day, count: Number(x.count) })).slice(-HISTORY_DAYS_MAX);
    }
    const log = (Array.isArray(h.log) ? h.log : []).filter((e) => isObj(e) && typeof e.kind === 'string' && (typeof e.time === 'number' || typeof e.time === 'string')).slice(0, HISTORY_LOG_MAX);
    return { postStats, nudges, memberHistory, log };
  }

  // Gộp lịch sử từ tệp vào dữ liệu đang có
  function mergeHistory(cur, inc) {
    const c = historyOf({ postStats: cur?.postStats, nudges: cur?.nudges, state: { memberHistory: cur?.memberHistory }, log: cur?.log });
    const postStats = { ...c.postStats };
    for (const [id, e] of Object.entries(inc?.postStats || {})) postStats[id] = { ...e, ...c.postStats[id] };
    const seenNudge = new Set(c.nudges.map((n) => n.id));
    const nudges = [...c.nudges, ...(inc?.nudges || []).filter((n) => !seenNudge.has(n.id))].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, HISTORY_NUDGES_MAX);
    const memberHistory = { ...c.memberHistory };
    for (const [gid, list] of Object.entries(inc?.memberHistory || {})) {
      const byDay = new Map([...list, ...(c.memberHistory[gid] || [])].map((x) => [x.day, x]));
      memberHistory[gid] = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-HISTORY_DAYS_MAX);
    }
    const t = (e) => (typeof e.time === 'number' ? e.time : Date.parse(e.time) || 0);
    const key = (e) => [t(e), e.kind, e.action || '', e.contentId || e.requestId || e.userId || e.tagId || '', e.groupId || ''].join('|');
    const seenLog = new Set(c.log.map(key));
    const log = [...c.log, ...(inc?.log || []).filter((e) => !seenLog.has(key(e)))].sort((a, b) => t(b) - t(a)).slice(0, HISTORY_LOG_MAX);
    return { postStats: BG.pruneStats(postStats), nudges, memberHistory, log };
  }

  const historySummary = (h) => `Lịch sử số liệu: ${Object.keys(h.postStats).length} bài theo dõi hiệu quả, ${h.nudges.length} lần nhắc người mới, số thành viên của ${Object.keys(h.memberHistory).length} group, ${h.log.length} dòng nhật ký (gộp với dữ liệu đang có)`;

  // ---------- Có gì mới (CHANGELOG.md) ----------
  // So sánh phiên bản dạng 0.24.1: âm / 0 / dương
  function cmpVersion(a, b) {
    const pa = String(a || '').split('.').map(Number);
    const pb = String(b || '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return Math.sign(d);
    }
    return 0;
  }

  // Các mục "## vX.Y.Z — ngày" của CHANGELOG.md (mới nhất trước): { version, title, body }
  function changelogSections(md) {
    const out = [];
    let cur = null;
    for (const line of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
      const m = line.match(/^## v(\d+\.\d+\.\d+)/);
      if (m) out.push((cur = { version: m[1], title: line.slice(3).trim(), body: [] }));
      else if (/^#{1,2}\s/.test(line)) cur = null;
      else if (cur) cur.body.push(line);
    }
    return out.map((x) => ({ ...x, body: x.body.join('\n').trim() }));
  }

  // Mục cần hiện sau khi cập nhật từ `seen` lên `current` (mới nhất trước, tối đa `max`)
  function whatsNew(sections, seen, current, max = 5) {
    if (!seen || cmpVersion(current, seen) <= 0) return [];
    return (sections || []).filter((x) => cmpVersion(x.version, seen) > 0 && cmpVersion(x.version, current) <= 0).slice(0, max);
  }

  Object.assign(BG, {
    historyOf,
    cleanHistory,
    mergeHistory,
    cmpVersion,
    changelogSections,
    whatsNew,
    GROUP_SETTINGS,
    hasGroupPerm,
    slimGroupSettings,
    settingDenied,
    groupSettingBody,
    BACKUP_FORMAT,
    makeBackup,
    readBackup,
    backupSummary,
    mergeProfiles,
    TAG_NAME_MIN,
    TAG_NAME_MAX,
    tagName,
    validateTagName,
    tagPermission,
    tagSearchUrl,
  });
});
