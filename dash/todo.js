// Dashboard — tab Tổng quan: hộp "Việc cần làm". Gom việc đang chờ ở mọi tab thành một danh sách, việc gấp lên trước,
// mỗi việc có nút xử lý ngay (gọi lại các hàm sẵn có ở members.js / content.js) và phím tắt J / K, 1 / 2 / 3, O.
// Nạp sau các tệp tab (dùng hàm của chúng khi bấm, không gọi lúc nạp).

const TODO_PAGE = 25;
const TODO_FILTERS = { all: 'Tất cả', urgent: 'Gấp', members: 'Thành viên', posts: 'Bài viết', comments: 'Bình luận' };
const todo = { filter: 'all', limit: TODO_PAGE, sel: '', lastIndex: -1 };

function openReports(g, kind) {
  rep.groupId = g.id;
  rep.kind = kind;
  selectedReports.clear();
  showTab('reports');
  if (!rep.data[repKey()]?.loaded) loadReports();
}

function reasonsText(ev) {
  return ev.reasons.filter((r) => r.level !== 'ok').map((r) => r.text).join('; ');
}

// Việc cần làm theo dữ liệu lần quét gần nhất. pri: 0 gấp, 1 hàng chờ, 2 nên làm
function todoItems() {
  const out = [];
  const gs = groups();
  const names = (list) => [...new Set((list || []).map((g) => g.name).filter(Boolean))].join(', ');

  // Đợt spam
  if (data.settings.spamWaves && data.settings.scanPosts) {
    const dismissed = new Set(data.state.dismissedWaves || []);
    for (const w of currentWaves()) {
      const open = w.items.filter((i) => !i.isHidden).length;
      if (dismissed.has(w.key) || !open) continue;
      out.push({
        key: 'wave:' + w.key,
        cat: 'comments',
        pri: 0,
        time: w.last,
        tag: ['err', 'Đợt spam'],
        title: w.type === 'link' ? 'Link ' + w.label : `"${w.label}"`,
        text: `${w.accounts.length} tài khoản: ${w.accounts.slice(0, 5).map((u) => u.fullname || u.username).join(', ')}${w.accounts.length > 5 ? '…' : ''}`,
        meta: `${open} bài / bình luận chưa ẩn`,
        actions: [
          ['Ẩn cả đợt', 'danger', () => hideWave(w)],
          ['Bỏ qua', 'ghost', () => dismissWave(w, true)],
        ],
      });
    }
  }

  // Báo cáo chờ xử lý và bài bị Beincom gắn cờ (số theo lần quét). Gắn cờ gộp theo community: một bài đăng ở nhiều group chỉ tính một lần
  if (data.settings.scanReports) {
    for (const g of gs) {
      const n = (g.reportIds || []).length;
      if (n) out.push({ key: 'rep:' + g.id, cat: 'posts', pri: 0, time: data.state.lastScan, noTime: true, tag: ['err', 'Báo cáo'], title: `${n} báo cáo chờ xử lý`, meta: g.communityName || g.name, actions: [['Xem báo cáo', 'primary', () => openReports(g, 'reported')]] });
    }
    const byCommunity = new Map();
    for (const g of gs) {
      if (!g.flaggedIds?.length) continue;
      const k = g.communityId || g.id;
      const cur = byCommunity.get(k) || { first: g, ids: new Set() };
      if (g.isCommunity) cur.first = g;
      g.flaggedIds.forEach((id) => cur.ids.add(id));
      byCommunity.set(k, cur);
    }
    for (const [k, { first, ids }] of byCommunity) {
      out.push({ key: 'flag:' + k, cat: 'posts', pri: 0, time: data.state.lastScan, noTime: true, tag: ['err', 'Beincom gắn cờ'], title: `${ids.size} bài bị gắn cờ tự động`, meta: first.communityName || first.name, actions: [['Xem bài', 'primary', () => openReports(first, 'flagged')]] });
    }
  }

  // Bài và bình luận vi phạm quy tắc (bỏ của chính mình)
  const meId = data.state.me?.id;
  for (const p of flaggedRecent().filter((x) => x.actor?.id !== meId)) {
    const ev = evalPost(p);
    out.push({
      key: 'post:' + p.id,
      cat: 'posts',
      pri: 0,
      time: p.publishedAt,
      tag: ['err', 'Bài vi phạm'],
      who: p.actor,
      text: p.title || p.text,
      meta: [names(p.groups), reasonsText(ev)].filter(Boolean).join(' · '),
      url: BG.postUrl(p),
      actions: [
        ['Ẩn bài', 'danger', () => hidePosts([p])],
        ['Bỏ qua', 'ghost', () => dismissPosts([p], true)],
      ],
    });
  }
  for (const c of flaggedComments().filter((x) => x.actor?.id !== meId)) {
    out.push({
      key: 'cmt:' + c.id,
      cat: 'comments',
      pri: 0,
      time: c.createdAt,
      tag: ['err', 'Bình luận vi phạm'],
      who: c.actor,
      text: c.text,
      meta: [c.postSnippet && 'Trong bài: ' + c.postSnippet, reasonsText(evalPost(c))].filter(Boolean).join(' · '),
      url: BG.commentUrl(c),
      actions: [
        ['Ẩn', 'danger', () => hideComments([c])],
        ['Trả lời', 'ghost', () => replyComment(c)],
        ['Bỏ qua', 'ghost', () => dismissComments([c], true)],
      ],
    });
  }

  // Bài chờ duyệt (bài dính quy tắc lên nhóm gấp)
  for (const g of gs) {
    for (const p of g.approvals || []) {
      const ev = evalPost(p, g);
      out.push({
        key: 'appr:' + p.id,
        cat: 'posts',
        pri: ev.verdict === 'bad' ? 0 : 1,
        time: p.submittedAt || p.publishedAt,
        tag: ['info', 'Bài chờ duyệt'],
        verdict: [VERDICT_TAG[ev.verdict], BG.POST_VERDICT_LABELS.approval[ev.verdict]],
        who: p.actor,
        text: p.title || p.text,
        meta: [g.communityName || g.name, ev.verdict === 'ok' ? '' : reasonsText(ev)].filter(Boolean).join(' · '),
        url: BG.contentApprovalUrl(g.communityId),
        actions:
          ev.verdict === 'bad'
            ? [
                ['Từ chối', 'danger', () => actApproval('reject', g, [p])],
                ['Duyệt', 'ok-btn', () => actApproval('approve', g, [p])],
              ]
            : [
                ['Duyệt', 'ok-btn', () => actApproval('approve', g, [p])],
                ['Từ chối', 'danger', () => actApproval('reject', g, [p])],
              ],
      });
    }
  }

  // Yêu cầu tham gia (gợi ý từ chối lên nhóm gấp)
  for (const g of gs.filter((x) => x.canApprove)) {
    for (const { req, ev } of evaluated(g)) {
      const u = req.user || {};
      const approve = ['Duyệt', 'ok-btn', () => actMembers('approve', g, [req])];
      const decline = ['Từ chối', 'danger', () => actMembers('decline', g, [req])];
      out.push({
        key: 'req:' + req.id,
        cat: 'members',
        pri: ev.verdict === 'decline' ? 0 : 1,
        time: req.createdAt,
        tag: ['info', 'Xin vào group'],
        verdict: [VERDICT_TAG[ev.verdict], BG.VERDICT_LABELS[ev.verdict]],
        who: u,
        text: (req.answers || []).map((a) => a.answer).filter(Boolean).join(' · '),
        meta: [groupPath(g), ev.verdict === 'approve' ? '' : reasonsText(ev)].filter(Boolean).join(' · '),
        actions: [
          ...(ev.verdict === 'decline' ? [decline, approve] : [approve, decline]),
          [
            'Xem',
            'ghost',
            () => {
              selectGroup(g.id);
              showTab('members');
            },
          ],
        ],
      });
    }
  }

  // Bài chưa ai trả lời
  if (data.settings.scanPosts) {
    for (const p of (data.state.recentPosts || []).filter((x) => !x.dismissed && BG.isUnanswered(x, { meId: data.state.me?.id, minHours: data.settings.unansweredHours }))) {
      out.push({
        key: 'ask:' + p.id,
        cat: 'posts',
        pri: 2,
        time: p.publishedAt,
        tag: ['warn', 'Chưa ai trả lời'],
        who: p.actor,
        text: p.title || p.text,
        meta: names(p.groups),
        url: BG.postUrl(p),
        actions: [
          ['💬 Bình luận', 'ghost', () => commentOnPost(p)],
          ['Bỏ qua', 'ghost', () => dismissPosts([p], true)],
        ],
      });
    }
  }

  // Bài / bình luận nhắc tới từ khoá theo dõi trong 3 ngày (chưa nằm trong việc khác)
  const kws = data.settings.watchKeywords || [];
  if (kws.length) {
    const have = new Set(out.map((x) => x.key));
    const recent = (t) => Date.now() - (Date.parse(t) || 0) <= 3 * 864e5;
    for (const p of (data.state.recentPosts || []).filter((x) => !x.dismissed && !x.isHidden && x.actor?.id !== meId && recent(x.publishedAt))) {
      const words = BG.watchHits([p.title, p.text].filter(Boolean).join('\n'), kws);
      if (!words.length || have.has('post:' + p.id) || have.has('ask:' + p.id)) continue;
      out.push({ key: 'watch:' + p.id, cat: 'posts', pri: 1, time: p.publishedAt, tag: ['accent', 'Từ khoá: ' + words.join(', ')], who: p.actor, text: p.title || p.text, meta: names(p.groups), url: BG.postUrl(p), actions: [['💬 Bình luận', 'ghost', () => commentOnPost(p)], ['Bỏ qua', 'ghost', () => dismissPosts([p], true)]] });
    }
    if (data.settings.scanComments) {
      for (const c of (data.state.recentComments || []).filter((x) => !x.dismissed && !x.isHidden && x.actor?.id !== meId && recent(x.createdAt))) {
        const words = BG.watchHits(c.text, kws);
        if (!words.length || have.has('cmt:' + c.id)) continue;
        out.push({ key: 'watchc:' + c.id, cat: 'comments', pri: 1, time: c.createdAt, tag: ['accent', 'Từ khoá: ' + words.join(', ')], who: c.actor, text: c.text, meta: c.postSnippet ? 'Trong bài: ' + c.postSnippet : '', url: BG.commentUrl(c), actions: [['Trả lời', 'ghost', () => replyComment(c)], ['Bỏ qua', 'ghost', () => dismissComments([c], true)]] });
      }
    }
  }

  // Gấp: mới nhất trước; hàng chờ và câu hỏi: cũ nhất trước (đã chờ lâu nhất)
  const t = (x) => Date.parse(x.time) || 0;
  return out.sort((a, b) => a.pri - b.pri || (a.pri === 0 ? t(b) - t(a) : t(a) - t(b)));
}

function todoInFilter(it, f) {
  if (f === 'all') return true;
  if (f === 'urgent') return it.pri === 0;
  return it.cat === f;
}

function renderTodo() {
  const card = $('todo');
  const all = data.state.snapshot ? todoItems() : [];
  const counts = Object.fromEntries(Object.keys(TODO_FILTERS).map((f) => [f, all.filter((it) => todoInFilter(it, f)).length]));
  setCounts('tcnt', counts);
  setSegActive('todo-filter', todo.filter);
  $('todo-count').textContent = all.length ? String(all.length) : '';
  card.classList.toggle('has-urgent', counts.urgent > 0);

  const list = all.filter((it) => todoInFilter(it, todo.filter));
  const shown = list.slice(0, todo.limit);
  // Việc vừa xử lý biến mất: chọn việc nằm ở vị trí đó để làm tiếp
  if (!shown.some((it) => it.key === todo.sel)) todo.sel = todo.lastIndex >= 0 && shown.length ? shown[Math.min(todo.lastIndex, shown.length - 1)].key : '';
  const box = $('todo-list');
  box.replaceChildren(
    ...shown.map((it, idx) => {
      const row = el(
        'div',
        { class: 'todo-item' + (it.key === todo.sel ? ' sel' : '') + (it.pri === 0 ? ' urgent' : ''), 'data-key': it.key, onclick: () => selectTodo(it.key, false) },
        el('div', { class: 'todo-tags' }, el('span', { class: 'tag ' + it.tag[0], text: it.tag[1] }), it.verdict?.[1] ? el('span', { class: 'tag ' + (it.verdict[0] || 'info'), text: it.verdict[1] }) : null),
        el(
          'div',
          { class: 'todo-main' },
          el('div', { class: 'todo-title' }, it.who ? [el('b', { text: it.who.fullname || it.who.username || '?' }), it.who.username ? el('span', { class: 'muted', text: ' @' + it.who.username }) : null, violationBadge(it.who)] : null, it.title ? el('b', { text: (it.who ? ' · ' : '') + it.title }) : null),
          it.text ? el('div', { class: 'todo-text', text: it.text.length > 180 ? it.text.slice(0, 180) + '…' : it.text }) : null,
          el('div', { class: 'todo-meta', text: [it.meta, it.time && !it.noTime ? ago(it.time) : ''].filter(Boolean).join(' · ') }),
        ),
        el(
          'div',
          { class: 'todo-acts' },
          it.actions.map(([label, cls, fn], i) =>
            el('button', {
              class: cls + ' sm',
              disabled: busy,
              title: `Phím ${i + 1}`,
              onclick: (e) => {
                e.stopPropagation();
                todo.sel = it.key;
                todo.lastIndex = idx;
                fn();
              },
            }, el('kbd', { text: String(i + 1) }), ' ' + label),
          ),
          it.url ? el('a', { href: it.url, target: '_blank', title: 'Phím O', onclick: (e) => e.stopPropagation(), text: 'Mở ↗' }) : null,
        ),
      );
      return row;
    }),
  );
  if (!shown.length) {
    const msg = !data.state.snapshot ? 'Chưa quét — bấm Quét ngay.' : todo.filter === 'all' ? 'Không còn việc gì cần làm 🎉' : 'Không có việc nào trong mục này.';
    box.append(el('div', { class: 'todo-empty', text: msg }));
  }
  $('btn-todo-more').hidden = list.length <= todo.limit;
  $('btn-todo-more').textContent = `Xem thêm (${list.length - shown.length})`;
  $('todo-note').textContent = data.state.lastScan ? `Theo lần quét lúc ${fmtTime(data.state.lastScan)}. Phím tắt: J / K chọn việc · 1, 2, 3 bấm nút tương ứng · O mở trên web.` : '';
}

function selectTodo(key, scroll = true) {
  todo.sel = key;
  todo.lastIndex = -1;
  for (const r of document.querySelectorAll('#todo-list .todo-item')) r.classList.toggle('sel', r.dataset.key === key);
  if (scroll) document.querySelector(`#todo-list .todo-item[data-key="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'nearest' });
}

onSeg('todo-filter', (f) => {
  todo.filter = f;
  todo.limit = TODO_PAGE;
  renderTodo();
});
$('btn-todo-more').addEventListener('click', () => {
  todo.limit += TODO_PAGE;
  renderTodo();
});

// Phím tắt khi đang ở Tổng quan, không gõ chữ và không mở hộp thoại
document.addEventListener('keydown', (e) => {
  if (currentTab !== 'overview' || busy || e.ctrlKey || e.metaKey || e.altKey) return;
  if ($('confirm').open || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const rows = [...document.querySelectorAll('#todo-list .todo-item')];
  if (!rows.length) return;
  const i = rows.findIndex((r) => r.dataset.key === todo.sel);
  const k = e.key.toLowerCase();
  if (k === 'j' || k === 'k') {
    e.preventDefault();
    const next = k === 'j' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
    selectTodo(rows[next].dataset.key);
    return;
  }
  if (i < 0) return;
  if (/^[1-9]$/.test(e.key)) {
    const btn = rows[i].querySelectorAll('.todo-acts button')[Number(e.key) - 1];
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  } else if (k === 'o') {
    const a = rows[i].querySelector('.todo-acts a');
    if (a) {
      e.preventDefault();
      a.click();
    }
  }
});
