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

  // Gói tài khoản cao cấp (extra_data.subscriptions[].type = premium; term annual / lifetime) — gọi thật 14/10/2026
  const premiumOf = (subs) => {
    const s = (Array.isArray(subs) ? subs : []).find((x) => x?.type === 'premium');
    return s ? (s.term === 'lifetime' ? 'lifetime' : 'annual') : '';
  };

  // Người dùng chat -> người Beincom. Huy hiệu cạnh tên như web: extra_data.is_verified (tích xác minh; is_primary = false là
  // hồ sơ phụ), gói premium (kim cương). Chỉ thêm khi có, để dữ liệu cũ không đổi.
  function chatPerson(u) {
    if (!u) return null;
    const x = u.extra_data || {};
    const premium = premiumOf(x.subscriptions);
    return {
      id: u.props?.bic_user_id || '',
      chatId: u.id || '',
      username: u.username || '',
      fullname: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.nickname || u.username || '',
      avatar: '',
      ...(x.is_verified ? { verified: true } : {}),
      ...(x.is_verified && x.is_primary === false ? { subProfile: true } : {}),
      ...(premium ? { premium } : {}),
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
      // Thread (bình luận của tin, như web): người tham gia, đang theo dõi, lần bình luận cuối
      lastReplyAt: p.last_reply_at || 0,
      following: !!p.is_following,
      participants: (p.participants || []).slice(0, 4).map((u) => ({ ...chatPerson(u), pictureAt: u.last_picture_update || 0 })),
      pinned: !!p.is_pinned,
      priority: chatPriority(p),
      reactions: chatReactions(p.metadata),
      files: (p.metadata?.files || []).map((f) => ({ id: f.id, name: f.name || '', mime: f.mime_type || '', size: f.size || 0, url: f.url || '', mini: f.mini_preview || '', width: f.width || 0, height: f.height || 0 })),
    };
  }

  // Một thread đang theo dõi (GET v4/users/me/teams/{team}/threads?extended=true — gọi thật 14/10/2026: id = mã tin gốc,
  // reply_count, last_reply_at, last_viewed_at, unread_replies, unread_mentions, is_urgent, participants, post)
  function chatThreadItem(x, team = {}) {
    const root = chatPagePost(x?.post);
    if (!root) return null;
    return {
      id: x.id,
      teamId: team.id || '',
      channelId: root.channelId,
      replyCount: x.reply_count || 0,
      lastReplyAt: x.last_reply_at || 0,
      lastViewedAt: x.last_viewed_at || 0,
      unreadReplies: x.unread_replies || 0,
      unreadMentions: x.unread_mentions || 0,
      urgent: !!x.is_urgent,
      participants: (x.participants || []).slice(-4).map((u) => ({ ...chatPerson(u), pictureAt: u.last_picture_update || 0 })),
      root: { ...root, replyCount: x.reply_count || root.replyCount, following: true },
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

  // Lời mời trò chuyện (Beincom gọi "Yêu cầu nhắn tin": tin nhắn riêng từ người chưa kết nối với bạn). Kênh D có
  // props.contact_status (pending / spammed / ignored / accepted), props.contact_requester_id, props.contact_id (gọi thật
  // 14/10/2026). Như web: người gửi lời mời = contact_requester_id (không có thì creator_id); lời mời đến = người kia gửi và
  // bạn chưa chấp nhận (cả lời mời bạn đã bỏ qua). Lời mời bạn gửi đi vẫn nằm trong tin nhắn riêng.
  // Kênh không có contact_status (tin nhắn riêng cũ, đã kết nối) -> null.
  function chatContact(c, meChatId) {
    if (c?.type !== 'D') return null;
    const p = c.props || {};
    const status = String(p.contact_status || '');
    if (!status) return null;
    const mine = (p.contact_requester_id || c.creator_id || '') === meChatId;
    return {
      id: String(p.contact_id || ''),
      status,
      incoming: !mine && status !== 'accepted',
      sent: mine && (status === 'pending' || status === 'spammed'),
      ignoredByOther: mine && status === 'ignored',
    };
  }

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
      const request = !!chatContact(c, meChatId)?.incoming;
      out.push({ channelId: c.id, type: c.type, otherId, title: c.type === 'G' ? c.display_name || '' : '', unread, mentions: m.mention_count || 0, lastPostAt: c.last_post_at || 0, ...(request ? { request } : {}) });
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

  // ---------- Markdown của chat (như web Beincom / Mattermost) ----------
  // Tin nhắn -> cây nút để trang Chat dựng bằng DOM (không dùng innerHTML). Khối: đoạn, ```mã```, > trích dẫn, danh sách
  // (- / 1.), tiêu đề (#), đường kẻ (---). Trong dòng: `mã`, [chữ](link), link, @tên, ***đậm nghiêng***, **đậm**, ~~gạch~~,
  // *nghiêng* / _nghiêng_, xuống dòng. Link chỉ nhận http(s) / mailto.
  const MD_INLINE =
    /(?<code>(?<tick>`{1,3})(?<codev>[^\n]+?)\k<tick>(?!`))|(?<link>\[(?<lt>[^\]\n]+)\]\(\s*(?<lu>(?:https?:\/\/|mailto:)[^\s)]+)\s*\))|(?<url>\b(?:https?:\/\/|www\.)[^\s<>"']+)|(?<at>(?<![\w.@-])@[a-z0-9._-]*[a-z0-9_])|(?<bi>\*\*\*(?=\S)(?<biv>[^\n]+?)(?<=\S)\*\*\*)|(?<b>\*\*(?=\S)(?<bv>[^\n]+?)(?<=\S)\*\*|__(?=\S)(?<bv2>[^\n]+?)(?<=\S)__)|(?<s>~~(?=\S)(?<sv>[^\n]+?)(?<=\S)~~)|(?<i>(?<![*\w])\*(?=[^\s*])(?<iv>[^*\n]+?)(?<=\S)\*(?![*\w])|(?<![_\w])_(?=[^\s_])(?<iv2>[^_\n]+?)(?<=\S)_(?![_\w]))|(?<br>\n)/gi;
  const MD_DEPTH = 4;

  function mdInline(text, depth = 0) {
    const src = String(text || '');
    if (depth > MD_DEPTH) return src ? [{ t: 'text', v: src }] : [];
    const out = [];
    const push = (v) => {
      if (!v) return;
      const prev = out[out.length - 1];
      if (prev?.t === 'text') prev.v += v;
      else out.push({ t: 'text', v });
    };
    let last = 0;
    for (const m of src.matchAll(MD_INLINE)) {
      const g = m.groups;
      push(src.slice(last, m.index));
      last = m.index + m[0].length;
      if (g.code) out.push({ t: 'code', v: g.codev });
      else if (g.link) out.push({ t: 'a', href: g.lu, c: mdInline(g.lt, depth + 1) });
      else if (g.url) {
        // Bỏ dấu câu dính cuối link
        const clean = g.url.replace(/[.,!?;:)\]]+$/, '');
        out.push({ t: 'a', href: /^www\./i.test(clean) ? 'https://' + clean : clean, c: [{ t: 'text', v: clean }] });
        push(g.url.slice(clean.length));
      } else if (g.at) out.push({ t: 'at', v: g.at });
      else if (g.bi) out.push({ t: 'b', c: [{ t: 'i', c: mdInline(g.biv, depth + 1) }] });
      else if (g.b) out.push({ t: 'b', c: mdInline(g.bv ?? g.bv2, depth + 1) });
      else if (g.s) out.push({ t: 's', c: mdInline(g.sv, depth + 1) });
      else if (g.i) out.push({ t: 'i', c: mdInline(g.iv ?? g.iv2, depth + 1) });
      else if (g.br) out.push({ t: 'br' });
    }
    push(src.slice(last));
    return out;
  }

  function chatMarkdown(text, depth = 0) {
    const lines = String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n');
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) out.push({ t: 'p', c: mdInline(para.join('\n'), depth) });
      para = [];
    };
    const LIST_UL = /^\s{0,3}[-*+]\s+(.*)$/;
    const LIST_OL = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s{0,3}(```|~~~)(.*)$/);
      // Khối mã: ``` ... ``` (không có dòng đóng thì tới hết tin); ```mã``` trên một dòng là mã trong dòng
      if (fence && !(fence[1] === '```' && /```\s*$/.test(fence[2]) && fence[2].trim().length > 3)) {
        flush();
        const body = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith(fence[1])) body.push(lines[j++]);
        out.push({ t: 'pre', v: body.join('\n'), lang: fence[2].trim().slice(0, 20) });
        i = j;
        continue;
      }
      if (!line.trim()) {
        flush();
        continue;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
        flush();
        out.push({ t: 'hr' });
        continue;
      }
      const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (h) {
        flush();
        out.push({ t: 'h', level: h[1].length, c: mdInline(h[2], depth) });
        continue;
      }
      if (/^\s{0,3}>/.test(line) && depth < 3) {
        flush();
        const body = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^\s{0,3}>\s?/, ''));
        i--;
        out.push({ t: 'quote', c: chatMarkdown(body.join('\n'), depth + 1) });
        continue;
      }
      if (LIST_UL.test(line) || LIST_OL.test(line)) {
        flush();
        const ol = LIST_OL.test(line);
        const re = ol ? LIST_OL : LIST_UL;
        const items = [];
        const start = ol ? Number(line.match(LIST_OL)[1]) : 1;
        while (i < lines.length && re.test(lines[i])) {
          const m = lines[i].match(re);
          items.push(mdInline(ol ? m[2] : m[1], depth));
          i++;
        }
        i--;
        out.push(ol ? { t: 'ol', start, items } : { t: 'ul', items });
        continue;
      }
      para.push(line);
    }
    flush();
    return out;
  }

  // Chữ thường của tin (trích dẫn tin được trả lời, thông báo): bỏ ký hiệu Markdown, gộp dòng
  function chatPlain(text) {
    const flat = (nodes) =>
      (nodes || [])
        .map((n) => {
          if (n.t === 'text' || n.t === 'code' || n.t === 'at') return n.v;
          if (n.t === 'br') return ' ';
          if (n.t === 'pre') return n.v;
          if (n.t === 'ul' || n.t === 'ol') return n.items.map(flat).join(' ');
          if (n.t === 'hr') return '';
          return flat(n.c);
        })
        .join('')
        .trim();
    return chatMarkdown(text)
      .map((b) => flat([b]))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Bộ gõ: định dạng chữ đang chọn trong ô gõ (như nút trên web). Trả một lần thay: value[from, to) -> text, rồi chọn
  // [selStart, selEnd) (vị trí trong chuỗi mới). Bấm lại khi đã định dạng thì bỏ định dạng.
  const MD_WRAP = { bold: ['**', 'chữ đậm'], italic: ['*', 'chữ nghiêng'], strike: ['~~', 'chữ gạch'], code: ['`', 'mã'] };
  const MD_LINE = { quote: [/^>\s?/, () => '> '], ul: [/^\s*[-*+]\s+/, () => '- '], ol: [/^\s*\d+[.)]\s+/, (k) => `${k + 1}. `] };
  function mdEdit(value, s, e, kind) {
    const v = String(value || '');
    [s, e] = [Math.max(0, Math.min(s, e, v.length)), Math.min(v.length, Math.max(s, e))];
    const sel = v.slice(s, e);
    if (kind === 'link') {
      if (/^(https?:\/\/|mailto:)\S+$/.test(sel.trim())) return { from: s, to: e, text: `[](${sel.trim()})`, selStart: s + 1, selEnd: s + 1 };
      const text = `[${sel}](url)`;
      return { from: s, to: e, text, selStart: s + sel.length + 3, selEnd: s + sel.length + 6 };
    }
    if (kind === 'code' && sel.includes('\n')) {
      const lead = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
      const text = `${lead}\`\`\`\n${sel.replace(/\n$/, '')}\n\`\`\``;
      return { from: s, to: e, text, selStart: s + lead.length + 4, selEnd: s + lead.length + 4 + sel.replace(/\n$/, '').length };
    }
    if (MD_WRAP[kind]) {
      const [m, ph] = MD_WRAP[kind];
      const n = m.length;
      // Đã định dạng (ký hiệu ngay ngoài vùng chọn, hoặc nằm trong vùng chọn): bỏ
      const outside = v.slice(s - n, s) === m && v.slice(e, e + n) === m && (kind !== 'italic' || ((v[s - 2] !== '*' || v.slice(s - 3, s) === '***') && (v[e + 1] !== '*' || v.slice(e, e + 3) === '***')));
      if (sel && outside) return { from: s - n, to: e + n, text: sel, selStart: s - n, selEnd: e - n };
      if (sel.length > 2 * n && sel.startsWith(m) && sel.endsWith(m) && (kind !== 'italic' || !sel.startsWith('**') || sel.startsWith('***'))) {
        const inner = sel.slice(n, -n);
        return { from: s, to: e, text: inner, selStart: s, selEnd: s + inner.length };
      }
      if (!sel) return { from: s, to: e, text: m + ph + m, selStart: s + n, selEnd: s + n + ph.length };
      // Khoảng trắng đầu / cuối vùng chọn để ngoài ký hiệu (không thì Markdown không nhận)
      const [, lead, core, trail] = sel.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!core) return { from: s, to: e, text: sel + m + ph + m, selStart: e + n, selEnd: e + n + ph.length };
      return { from: s, to: e, text: lead + m + core + m + trail, selStart: s + lead.length + n, selEnd: s + lead.length + n + core.length };
    }
    if (MD_LINE[kind]) {
      const [re, mark] = MD_LINE[kind];
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      let le = v.indexOf('\n', e > s && v[e - 1] === '\n' ? e - 1 : e);
      if (le < 0) le = v.length;
      const lines = v.slice(ls, le).split('\n');
      const filled = lines.filter((l) => l.trim());
      const off = filled.length > 0 && filled.every((l) => re.test(l));
      // Đổi qua lại giữa hai kiểu danh sách: bỏ ký hiệu danh sách kia trước
      const other = kind === 'ul' ? MD_LINE.ol[0] : kind === 'ol' ? MD_LINE.ul[0] : null;
      let k = 0;
      const out = lines.map((l) => {
        if (off) return l.replace(re, '');
        if (!l.trim() && lines.length > 1) return l;
        return mark(k++) + (other ? l.replace(other, '') : l);
      });
      const text = out.join('\n');
      if (s === e && lines.length === 1) {
        const caret = Math.max(ls, s + (text.length - lines[0].length));
        return { from: ls, to: le, text, selStart: caret, selEnd: caret };
      }
      return { from: ls, to: le, text, selStart: ls, selEnd: ls + text.length };
    }
    return null;
  }

  // Shift + Enter trong danh sách: dòng mới có sẵn ký hiệu (số tăng dần); mục trống thì thoát danh sách
  function mdNewline(value, pos) {
    const v = String(value || '');
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    const line = v.slice(ls, pos);
    const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))(\s+)(.*)$/);
    if (!m) return null;
    if (!m[6].trim() && v.slice(pos, (v.indexOf('\n', pos) + 1 || v.length + 1) - 1).trim() === '') return { from: ls, to: pos, text: '', selStart: ls, selEnd: ls };
    const mark = m[3] ? `${Number(m[3]) + 1}${m[4]}` : m[2];
    const text = `\n${m[1]}${mark}${m[5]}`;
    return { from: pos, to: pos, text, selStart: pos + text.length, selEnd: pos + text.length };
  }

  // ---------- Biểu cảm (reaction) ----------
  // Tên emoji của chat (Mattermost / emoji-mart) -> hình. Tên lạ (emoji riêng của Beincom) thì trang hiện :tên:.
  const CHAT_EMOJI = {
    '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎', heart: '❤️', joy: '😂', laughing: '😆', smile: '😄', smiley: '😃', grinning: '😀',
    grin: '😁', sweat_smile: '😅', rofl: '🤣', slightly_smiling_face: '🙂', wink: '😉', blush: '😊', innocent: '😇', heart_eyes: '😍', star_struck: '🤩',
    kissing_heart: '😘', yum: '😋', stuck_out_tongue_winking_eye: '😜', money_mouth_face: '🤑', hugs: '🤗', hugging_face: '🤗', thinking_face: '🤔', thinking: '🤔',
    neutral_face: '😐', expressionless: '😑', smirk: '😏', unamused: '😒', roll_eyes: '🙄', face_with_rolling_eyes: '🙄', relieved: '😌', pensive: '😔', sleepy: '😪',
    sleeping: '😴', mask: '😷', nauseated_face: '🤢', exploding_head: '🤯', cowboy_hat_face: '🤠', partying_face: '🥳', sunglasses: '😎', nerd_face: '🤓',
    confused: '😕', worried: '😟', open_mouth: '😮', astonished: '😲', flushed: '😳', pleading_face: '🥺', fearful: '😨', cold_sweat: '😰', disappointed_relieved: '😥',
    cry: '😢', sob: '😭', scream: '😱', weary: '😩', triumph: '😤', rage: '😡', angry: '😠', ok_hand: '👌', v: '✌️', crossed_fingers: '🤞', call_me_hand: '🤙',
    point_up: '☝️', raised_hand: '✋', wave: '👋', clap: '👏', raised_hands: '🙌', pray: '🙏', handshake: '🤝', muscle: '💪', eyes: '👀', brain: '🧠',
    orange_heart: '🧡', yellow_heart: '💛', green_heart: '💚', blue_heart: '💙', purple_heart: '💜', black_heart: '🖤', broken_heart: '💔', sparkling_heart: '💖',
    rocket: '🚀', full_moon: '🌕', chart_with_upwards_trend: '📈', chart_with_downwards_trend: '📉', moneybag: '💰', dollar: '💵', money_with_wings: '💸', gem: '💎',
    fire: '🔥', zap: '⚡', white_check_mark: '✅', heavy_check_mark: '✔️', x: '❌', warning: '⚠️', tada: '🎉', gift: '🎁', trophy: '🏆', star: '⭐', star2: '🌟',
    100: '💯', bell: '🔔', loudspeaker: '📢', pushpin: '📌', link: '🔗', ox: '🐂', bear: '🐻', whale: '🐳', unicorn: '🦄', hourglass_flowing_sand: '⏳', dart: '🎯', robot: '🤖',
  };
  const EMOJI_NAME = {};
  for (const [k, v] of Object.entries(CHAT_EMOJI)) if (!EMOJI_NAME[v]) EMOJI_NAME[v] = k;
  const chatEmoji = (name) => CHAT_EMOJI[name] || '';
  const chatEmojiName = (emoji) => EMOJI_NAME[emoji] || '';

  // Biểu cảm của tin: Beincom gửi sẵn metadata.reaction_stats [{ emoji_name, count, top_reactors, user_reacted }] (đọc từ mã web);
  // máy chủ chat gốc gửi metadata.reactions [{ user_id, emoji_name }] -> gom theo emoji (mine: có mã mình)
  function chatReactions(meta, meChatId = '') {
    if (Array.isArray(meta?.reaction_stats)) {
      return meta.reaction_stats.filter((r) => r?.emoji_name && r.count > 0).map((r) => ({ name: r.emoji_name, count: r.count, mine: !!r.user_reacted, top: (r.top_reactors || []).slice(0, 5) }));
    }
    const by = new Map();
    for (const x of meta?.reactions || []) {
      if (!x?.emoji_name) continue;
      const a = by.get(x.emoji_name) || { name: x.emoji_name, count: 0, mine: false, top: [] };
      a.count++;
      if (meChatId && x.user_id === meChatId) a.mine = true;
      if (a.top.length < 5) a.top.push(x.user_id);
      by.set(x.emoji_name, a);
    }
    return [...by.values()];
  }

  // Thread đang theo dõi có bình luận mới so với lần báo trước (seen: mã thread -> last_reply_at đã báo). Lần đầu (first)
  // chỉ ghi nhận. Giữ 300 mục mới nhất.
  function threadNotice(threads, seen, first = false) {
    const next = { ...(seen || {}) };
    const fresh = [];
    for (const t of threads || []) {
      if (!t?.id) continue;
      if (t.unreadReplies > 0 && t.lastReplyAt > (next[t.id] || 0)) fresh.push(t);
      next[t.id] = Math.max(next[t.id] || 0, t.lastReplyAt || 0);
    }
    const kept = Object.fromEntries(
      Object.entries(next)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 300),
    );
    return { fresh: first ? [] : fresh, seen: kept };
  }

  // Gợi ý @tên: đoạn "@chữ" ngay trước con trỏ (đầu dòng hoặc sau khoảng trắng / dấu mở ngoặc) -> { start, term }
  function chatMentionQuery(text, caret) {
    const before = String(text || '').slice(0, caret);
    const m = before.match(/(^|[\s([{>])@([\w.\-]{0,30})$/);
    return m ? { start: before.length - m[2].length - 1, term: m[2] } : null;
  }

  // Bản nháp theo cuộc trò chuyện / thread (lưu trong máy): bỏ bản trống, quá 7 ngày, giữ 50 bản mới nhất
  const DRAFT_TTL = 7 * 864e5;
  function pruneDrafts(map, now = Date.now(), max = 50) {
    return Object.fromEntries(
      Object.entries(map || {})
        .filter(([, d]) => d && String(d.t || '').trim() && now - (d.at || 0) < DRAFT_TTL)
        .sort((a, b) => b[1].at - a[1].at)
        .slice(0, max),
    );
  }

  // Độ ưu tiên của tin (Mattermost: metadata.priority.priority; máy chủ Beincom bật PostPriority — gọi thật 14/10/2026)
  const CHAT_PRIORITIES = ['important', 'urgent'];
  const chatPriority = (p) => (CHAT_PRIORITIES.includes(p?.metadata?.priority?.priority) ? p.metadata.priority.priority : '');

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
    chatContact,
    dmUnread,
    chatShareText,
    chatPagePost,
    chatThreadItem,
    chatAvatarUrl,
    chatStats,
    chatMarkdown,
    chatPlain,
    mdEdit,
    mdNewline,
    CHAT_PRIORITIES,
    chatPriority,
    chatMentionQuery,
    pruneDrafts,
    CHAT_EMOJI,
    chatEmoji,
    chatEmojiName,
    chatReactions,
    threadNotice,
  });
});
