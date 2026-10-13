// BeinGroup — chat Beincom (chat.beincom.com, dựng trên Mattermost): kênh chat của group, tin nhắn, tin nhắn riêng chưa đọc,
// lời nhắn gửi kèm bài, thống kê chat theo tháng.
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần: không gọi chrome.* hay mạng.
//
// Đã gọi thật (chỉ đọc, 14/10/2026): mỗi community là một team (props.bic_group_team_id), mỗi group một kênh
// (props.bic_group_id), tin nhắn riêng ở team "Direct Messages" (bic_group_team_id = "unknown"). Người dùng chat có
// props.bic_user_id = mã Beincom, tên hiển thị = first_name + " " + last_name. Admin group là channel admin
// (quyền delete_others_posts: xoá được tin người khác — xoá là mất hẳn).
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const CHAT_API = 'https://chat.beincom.com/api/';
  const CHAT_ORIGIN = 'https://chat.beincom.com/*';
  const CHAT_TEXT_MAX = 2000;
  const CHAT_KEEP_MS = 7 * 864e5;
  const CHAT_MAX = 300;

  // Chat trả JSON thường (không có code: api.ok như api.beincom.com)
  const chatOk = (r) => !!r && r.status >= 200 && r.status < 300 && r.body != null;

  // Người dùng chat -> người Beincom
  function chatPerson(u) {
    if (!u) return null;
    return {
      id: u.props?.bic_user_id || '',
      chatId: u.id || '',
      username: u.username || '',
      fullname: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.nickname || u.username || '',
      avatar: '',
    };
  }

  // Quyền có trong các vai trò (roles: chuỗi tên vai trò cách nhau dấu cách; perms: tên vai trò -> danh sách quyền)
  function hasPerm(roles, perms, perm) {
    return String(roles || '')
      .split(/\s+/)
      .filter(Boolean)
      .some((r) => (perms?.[r] || []).includes(perm));
  }

  // Kênh chat của group: team (community), quyền xoá tin người khác / gửi tin của mình (vai trò kênh hoặc vai trò team)
  function chatChannel(c, team, { channelRoles = '', teamRoles = '', perms = {} } = {}) {
    const can = (p) => hasPerm(channelRoles, perms, p) || hasPerm(teamRoles, perms, p);
    return {
      id: c.id,
      teamId: team.id,
      teamName: team.name || '',
      communityId: team.props?.bic_group_team_id || '',
      groupId: c.props?.bic_group_id || '',
      name: c.display_name || c.name || '',
      type: c.type || '',
      canDelete: can('delete_others_posts'),
      canPost: can('create_post'),
      lastPostAt: c.last_post_at || 0,
      total: c.total_msg_count ?? null,
    };
  }

  // Tin nhắn thường (bỏ tin hệ thống, tin đã xoá) đã thu gọn; ch: kênh (BG.chatChannel) để biết group
  function slimChatPost(p, ch = null) {
    if (!p?.id || p.delete_at || (p.type && p.type !== '')) return null;
    const embed = (p.metadata?.embeds || []).find((e) => e?.url);
    const user = chatPerson(p.author) || { id: '', chatId: p.user_id || '', username: '', fullname: '', avatar: '' };
    return {
      id: p.id,
      channelId: p.channel_id || ch?.id || '',
      groupId: ch?.groupId || '',
      groupName: ch?.name || '',
      teamName: ch?.teamName || '',
      createdAt: new Date(p.create_at || 0).toISOString(),
      text: String(p.message || '').slice(0, CHAT_TEXT_MAX),
      link: embed?.url || '',
      files: (p.file_ids || p.metadata?.files || []).length,
      rootId: p.root_id || '',
      user,
    };
  }

  // Tin cho trang Chat (chat.html): người gửi, nội dung, trả lời, tệp / ảnh (url trên chat.biccdn.com; mini_preview là ảnh nhỏ
  // mờ khi không tải được), đã sửa / đã xoá. Tin hệ thống giữ lại (trang hiện nhỏ ở giữa).
  function chatPagePost(p) {
    if (!p?.id) return null;
    const user = chatPerson(p.author) || { id: '', chatId: p.user_id || '', username: '', fullname: '', avatar: '' };
    return {
      id: p.id,
      channelId: p.channel_id || '',
      user: { ...user, chatId: user.chatId || p.user_id || '', pictureAt: p.author?.last_picture_update || 0 },
      createAt: p.create_at || 0,
      updateAt: p.update_at || p.create_at || 0,
      editAt: p.edit_at || 0,
      deleted: !!p.delete_at,
      system: !!(p.type && p.type !== ''),
      message: String(p.message || '').slice(0, 16000),
      rootId: p.root_id || '',
      replyCount: p.reply_count || 0,
      pinned: !!p.is_pinned,
      files: (p.metadata?.files || []).map((f) => ({ id: f.id, name: f.name || '', mime: f.mime_type || '', size: f.size || 0, url: f.url || '', mini: f.mini_preview || '', width: f.width || 0, height: f.height || 0 })),
    };
  }

  // Ảnh đại diện chat (tải được không cần đăng nhập — gọi thật 14/10/2026)
  const chatAvatarUrl = (chatId, at = 0) => (chatId ? `${CHAT_API}v4/users/${chatId}/image${at ? '?_=' + at : ''}` : '');

  // Tin nhắn như bài viết: chấm bằng quy tắc bài viết của group (BG.evaluatePostIn)
  const chatAsPost = (m) => ({ id: m.id, title: '', text: m.text, link: m.link, actor: m.user, seenIn: m.groupId ? [m.groupId] : [], groups: m.groupId ? [{ id: m.groupId, name: m.groupName }] : [] });

  // Tin nhắn cho BG.spamWaves (đợt spam: cùng link / cùng nội dung từ nhiều tài khoản)
  const chatWaveItems = (msgs) => (msgs || []).map((m) => ({ id: m.id, kind: 'chat', actor: m.user?.id ? m.user : { ...m.user, id: m.user?.chatId }, text: [m.text, m.link].filter(Boolean).join('\n'), time: m.createdAt, isHidden: !!m.deleted }));

  // Gộp tin mới vào danh sách đã có (mới nhất trước), giữ dấu Bỏ qua / Đã xoá; bỏ tin quá 7 ngày
  function mergeChatMessages(prev, fresh, { now = Date.now(), keepMs = CHAT_KEEP_MS, max = CHAT_MAX } = {}) {
    const old = new Map((prev || []).map((m) => [m.id, m]));
    const out = new Map();
    for (const m of fresh || []) {
      if (!m?.id) continue;
      const o = old.get(m.id);
      out.set(m.id, o ? { ...m, dismissed: o.dismissed, deleted: o.deleted } : m);
    }
    for (const m of prev || []) if (!out.has(m.id)) out.set(m.id, m);
    return [...out.values()]
      .filter((m) => now - Date.parse(m.createdAt) <= keepMs)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, max);
  }

  // Đánh dấu tin đã xoá (thao tác thành công)
  function markChatDeleted(list, ids) {
    const gone = new Set(ids || []);
    return (list || []).map((m) => (gone.has(m.id) ? { ...m, deleted: true } : m));
  }

  // Link mở kênh / tin nhắn riêng trên web (như web: /chat-home?teamName=&channel=)
  const chatUrl = (teamName, channelId) => `${BG.SITE}/chat-home?teamName=${encodeURIComponent(teamName || '')}&channel=${encodeURIComponent(channelId || '')}`;

  // Tin nhắn riêng chưa đọc: kênh (team Direct Messages) + thành viên kênh của mình (msg_count = số tin đã xem)
  function dmUnread(channels, members, meChatId) {
    const byId = new Map((members || []).map((m) => [m.channel_id, m]));
    const out = [];
    for (const c of channels || []) {
      if (c.type !== 'D' && c.type !== 'G') continue;
      const m = byId.get(c.id) || {};
      const unread = Math.max(0, (c.total_msg_count || 0) - (m.msg_count || 0));
      if (!unread && !m.mention_count) continue;
      const otherId = c.type === 'D' ? String(c.name || '').split('__').find((id) => id && id !== meChatId) || '' : '';
      out.push({ channelId: c.id, type: c.type, otherId, title: c.type === 'G' ? c.display_name || '' : '', unread, mentions: m.mention_count || 0, lastPostAt: c.last_post_at || 0 });
    }
    return out.sort((a, b) => b.lastPostAt - a.lastPostAt);
  }

  // Lời nhắn gửi kèm bài vào kênh chat: lời tự viết, hoặc câu đầu của bài (bỏ ký hiệu Markdown), rồi link bài
  function chatShareText(content, url, custom = '') {
    const first =
      String(content || '')
        .split('\n')
        .map((l) => l.replace(/[#>*_`~[\]]/g, '').replace(/\s+/g, ' ').trim())
        .find(Boolean) || '';
    const head = String(custom || '').trim() || (first.length > 200 ? first.slice(0, 200) + '…' : first);
    return [`📢 ${head || 'Bài mới'}`, url].filter(Boolean).join('\n');
  }

  // Số liệu chat trong khoảng thời gian: số tin, số người nhắn, người nhắn nhiều nhất, từng kênh
  // msgs: [{ t (ms), ch (mã kênh), u: { id, username, fullname } }]
  function chatStats(msgs, { from, to }, channels = []) {
    const list = (msgs || []).filter((m) => m.t >= from && m.t < to);
    const by = new Map();
    for (const m of list) {
      const k = m.u?.id || m.u?.username || '?';
      const a = by.get(k) || { user: m.u || {}, count: 0 };
      a.count++;
      by.set(k, a);
    }
    const perChannel = (channels || []).map((c) => ({ id: c.id, name: c.name, count: list.filter((m) => m.ch === c.id).length })).sort((a, b) => b.count - a.count);
    return { messages: list.length, people: by.size, top: [...by.values()].sort((a, b) => b.count - a.count || String(a.user.username || '').localeCompare(String(b.user.username || ''))).slice(0, 5), channels: perChannel };
  }

  Object.assign(BG, {
    CHAT_API,
    CHAT_ORIGIN,
    chatOk,
    chatPerson,
    hasPerm,
    chatChannel,
    slimChatPost,
    chatAsPost,
    chatWaveItems,
    mergeChatMessages,
    markChatDeleted,
    chatUrl,
    dmUnread,
    chatShareText,
    chatPagePost,
    chatAvatarUrl,
    chatStats,
  });
});
