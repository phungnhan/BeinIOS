// Dashboard — tab Báo cáo.

// ---------- Báo cáo vi phạm ----------

// Dữ liệu tải theo yêu cầu, theo cặp group + loại; không lưu vào storage
const rep = { groupId: null, kind: 'reported', status: 'CREATED', data: {}, loading: false, detail: {} };
const selectedReports = new Set();

function reportGroups() {
  return groups().filter((g) => !g.error && g.communityId);
}

function reportGroup() {
  const gs = reportGroups();
  return gs.find((g) => g.id === rep.groupId) || gs.find((g) => g.isCommunity && g.isCommunityAdmin) || gs[0] || null;
}

const canSeeReported = (g) => !!(g?.isCommunity && g?.isCommunityAdmin);
// Báo cáo cần quyền chủ / admin community: báo cáo của người dùng và tin nhắn chat bị báo cáo
const adminKind = (kind) => kind === 'reported' || kind === 'chat';
// Tin nhắn chat bị báo cáo theo lần quét (nền đọc mỗi lần quét khi bật Chat Beincom)
const scannedChatReports = (g) => data.state.chatReports?.[g?.communityId] || null;
const repKey = (g = reportGroup(), kind = rep.kind) => `${g?.id}:${kind}`;

// Mở từ thông báo (#tab=reports&kind=chat): chọn loại; tin chat thì chọn community có nhiều tin bị báo cáo nhất
function pickReportKind(p) {
  const kind = p.get('kind');
  if (!['reported', 'flagged', 'hidden', 'chat'].includes(kind)) return;
  rep.kind = kind;
  selectedReports.clear();
  if (kind !== 'chat') return;
  const best = Object.entries(data.state.chatReports || {}).sort((a, b) => (b[1].items?.length || 0) - (a[1].items?.length || 0))[0];
  const g = best && reportGroups().find((x) => x.isCommunity && x.communityId === best[0]);
  if (g) rep.groupId = g.id;
}

async function loadReports() {
  const g = reportGroup();
  if (!g || rep.loading) return;
  rep.groupId = g.id;
  const key = repKey(g);
  if (adminKind(rep.kind) && !canSeeReported(g)) {
    rep.data[key] = { items: [], loaded: true, error: '', notAdmin: true };
    renderReports();
    return;
  }
  rep.loading = true;
  renderReports();
  try {
    const r = rep.kind === 'chat' ? await chrome.runtime.sendMessage({ type: 'chatReports', communityId: g.communityId }) : await chrome.runtime.sendMessage({ type: 'reports', groupId: g.id, kind: rep.kind });
    if (r?.status === 'need_login' && rep.kind === 'chat') rep.data[key] = { items: [], loaded: true, error: r.message };
    else if (r?.status === 'ok') rep.data[key] = { items: r.items, timedOut: r.timedOut, none: !!r.none, loaded: true, error: '', at: Date.now() };
    else rep.data[key] = { items: [], loaded: true, error: r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi', notAdmin: r?.code === 'not_admin' };
  } finally {
    rep.loading = false;
    renderReports();
    renderBadges();
  }
}

// Gợi ý lý do ẩn từ danh mục vi phạm của hệ thống kiểm duyệt tự động
function hideReasonFor(violations) {
  const v = (violations || []).join(' ').toLowerCase();
  if (/spam|scam|fraud/.test(v)) return 'SPAM';
  if (/sex|porn|nud|violen|gore|weapon/.test(v)) return 'VIOLENT_OR_PORN';
  if (/hate|harass|bully|threat/.test(v)) return 'BULLYING_THREATENING_OR_HARASSING';
  if (/child|minor/.test(v)) return 'CHILD_ABUSE_EXPLOITATION';
  if (/illegal|drug|gambl/.test(v)) return 'ILLEGAL';
  return 'OTHERS';
}

function reportRows() {
  const d = rep.data[repKey()];
  // Tin chat: chưa tải thì hiện ngay danh sách của lần quét
  const items = d?.loaded || rep.kind !== 'chat' ? d?.items || [] : scannedChatReports(reportGroup())?.items || [];
  if (rep.kind !== 'reported') return items;
  return items.filter((r) => rep.status === 'all' || r.status === rep.status);
}

function reportHead() {
  const cols = {
    reported: ['', 'Nội dung bị báo cáo', 'Tác giả', 'Lý do báo cáo', 'Báo cáo lúc', 'Trạng thái', 'Thao tác'],
    flagged: ['', 'Người đăng', 'Nội dung', 'Vi phạm (tự động)', 'Đăng lúc', 'Thao tác'],
    hidden: ['Người đăng', 'Nội dung', 'Đăng vào', 'Đăng lúc', ''],
    chat: ['', 'Tin nhắn bị báo cáo', 'Người gửi', 'Lý do báo cáo', 'Báo cáo đầu', 'Thao tác'],
  }[rep.kind];
  $('reports-head').replaceChildren(el('tr', {}, cols.map((c, i) => el('th', { class: i === 0 && rep.kind !== 'hidden' ? 'cb' : i === cols.length - 1 ? 'act' : null, text: c }))));
  return cols.length;
}

function reasonCell(r) {
  const det = rep.detail[r.id];
  const box = el(
    'td',
    {},
    el('ul', { class: 'reason-list' }, r.reasons.map((x) => el('li', {}, x.label, el('span', { class: 'count', text: ` ×${x.total}` }), x.description ? el('div', { class: 'desc', text: x.description }) : null))),
  );
  if (det?.reasons) {
    const who = det.reasons.flatMap((x) => x.reporters.map((p) => '@' + (p.username || p.fullname)));
    box.append(el('div', { class: 'reporters', text: who.length ? 'Người báo cáo: ' + who.join(', ') : 'Beincom không trả danh sách người báo cáo' }));
  } else {
    box.append(
      el('button', {
        class: 'link-btn',
        text: det?.loading ? 'Đang tải…' : det?.error ? 'Lỗi: ' + det.error : 'Ai đã báo cáo?',
        disabled: !!det?.loading,
        onclick: async () => {
          rep.detail[r.id] = { loading: true };
          renderReports();
          const res = await chrome.runtime.sendMessage({ type: 'reportDetail', groupId: reportGroup().id, reportId: r.id });
          rep.detail[r.id] = res?.status === 'ok' ? { reasons: res.reasons } : { error: res?.message || 'Có lỗi' };
          renderReports();
        },
      }),
    );
  }
  return box;
}

// Ô tin nhắn chat bị báo cáo: kênh, nội dung (bấm để xem hết), tệp, lúc gửi
function chatReportCell(r) {
  return el(
    'td',
    {},
    r.channel ? el('span', { class: 'tag accent', text: '# ' + r.channel }) : null,
    el('div', { class: 'post-text clamp', title: 'Bấm để xem hết / thu gọn', text: r.message || (r.files ? '(chỉ có tệp)' : '(không có chữ)'), onclick: (e) => e.currentTarget.classList.toggle('clamp') }),
    el('div', { class: 'post-meta' }, r.files ? el('span', { class: 'tag info', text: `📎 ${r.files} tệp` }) : null, r.postAt ? el('span', { class: 'muted small', title: fmtTime(r.postAt), text: 'Gửi ' + ago(r.postAt) }) : null),
  );
}

function renderReports() {
  if (rep.kind === 'chat' && !data.settings.chatEnabled) rep.kind = 'reported';
  $('rk-chat-btn').hidden = !data.settings.chatEnabled;
  const gs = reportGroups();
  const g = reportGroup();
  $('reports-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (canSeeReported(x) ? ' (admin community)' : '') })));
  $('reports-group').disabled = !gs.length || rep.loading;
  setSegActive('reports-kind', rep.kind);
  setSegActive('reports-status', rep.status);
  $('reports-status').hidden = rep.kind !== 'reported';
  for (const k of ['reported', 'flagged', 'hidden', 'chat']) {
    const d = rep.data[repKey(g, k)];
    // Chưa mở mục nào thì lấy số từ lần quét
    const scanned = { reported: g?.reportIds, flagged: g?.flaggedIds, chat: canSeeReported(g) ? scannedChatReports(g)?.items : null }[k]?.length || 0;
    const n = d?.loaded ? (k === 'reported' ? d.items.filter((r) => r.status === 'CREATED').length : d.items.length) : scanned;
    $('rk-' + k).textContent = n ? `(${n})` : '';
  }

  const d = rep.data[repKey()];
  const note = $('reports-note');
  note.classList.toggle('err-text', !!d?.error && !d?.notAdmin);
  if (!g) note.textContent = data.state.snapshot ? 'Không có group nào.' : 'Chưa quét lần nào.';
  else if (rep.loading) note.textContent = rep.kind === 'reported' ? 'Đang tải báo cáo… (Beincom có lúc trả chậm, tối đa 25 giây)' : 'Đang tải…';
  else if (d?.notAdmin && rep.kind === 'chat') note.textContent = 'Tin nhắn chat bị báo cáo chỉ dành cho chủ / admin community — hãy chọn group gốc của community bạn làm admin (có ghi "admin community").';
  else if (d?.notAdmin) note.textContent = 'Báo cáo của người dùng chỉ dành cho chủ / admin community — hãy chọn group gốc của community bạn làm admin (có ghi "admin community"). Bạn vẫn xem được mục "Gắn cờ tự động" và "Đã ẩn".';
  else if (d?.error) note.textContent = d.error;
  else if (d?.none) note.textContent = 'Không có báo cáo nào đang chờ xử lý (Beincom đếm 0) — các báo cáo đã xử lý không được tải lại.';
  else if (d?.timedOut) note.textContent = 'Beincom không phản hồi sau 25 giây. Thường gặp khi community chưa có báo cáo nào — bấm Tải lại để thử lại.';
  else if (rep.kind === 'reported') note.textContent = 'Bỏ qua: đánh dấu nội dung không vi phạm. Ẩn: ẩn nội dung bị báo cáo khỏi community (bình luận bị ẩn cũng biến mất khỏi bài).';
  else if (rep.kind === 'chat') note.textContent = 'Tin nhắn trong chat của community bị thành viên báo cáo (như mục "Tin nhắn bị báo cáo" ở trang quản trị của web). Ẩn: ẩn tin khỏi kênh chat. Bỏ qua: giữ tin, đóng báo cáo.' + (d?.loaded ? '' : scannedChatReports(g)?.at ? ` Theo lần quét ${ago(scannedChatReports(g).at)} — bấm Tải lại để đọc mới.` : '');
  else if (rep.kind === 'flagged') note.textContent = 'Bài do hệ thống kiểm duyệt tự động của Beincom phát hiện có dấu hiệu vi phạm. Ẩn bài: gỡ bài khỏi các group bạn quản trị mà bài được đăng vào.';
  else note.textContent = 'Bài đã bị ẩn trong group (do admin hoặc do xử lý báo cáo). Bài đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).';

  const ncol = reportHead();
  const rows = reportRows();
  pruneSelection(selectedReports, new Set(rows.map((r) => r.targetId || r.id)));
  const idOf = (r) => r.targetId || r.id;
  const pickable = rep.kind === 'reported' ? rows.filter((r) => r.status === 'CREATED') : rep.kind === 'flagged' || rep.kind === 'chat' ? rows : [];
  const bulk = () => renderBulk({ set: selectedReports, shown: pickable, idOf, checkAll: 'reports-check-all', countEl: 'reports-selected', buttons: adminKind(rep.kind) ? ['btn-reports-ignore', 'btn-reports-hide'] : ['btn-reports-hide'] });
  $('reports-bulk').hidden = rep.kind === 'hidden';
  $('btn-reports-ignore').hidden = !adminKind(rep.kind);
  $('btn-reports-hide').textContent = rep.kind === 'flagged' ? 'Ẩn bài đã chọn' : rep.kind === 'chat' ? 'Ẩn tin đã chọn' : 'Ẩn đã chọn';

  const body = $('reports-body');
  body.replaceChildren();
  if (!rows.length) {
    const msg = rep.loading ? 'Đang tải…' : !d?.loaded ? 'Bấm "Tải lại" để xem' : d.error || d.notAdmin ? '—' : d.timedOut ? 'Chưa đọc được báo cáo' : rep.kind === 'reported' ? 'Không có báo cáo nào đang chờ xử lý 🎉' : rep.kind === 'flagged' ? 'Không có bài nào bị gắn cờ 🎉' : rep.kind === 'chat' ? 'Không có tin nhắn chat nào bị báo cáo 🎉' : 'Không có bài nào đã ẩn';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: ncol, text: msg })));
  }
  for (const r of rows) {
    if (rep.kind === 'reported') {
      const open = BG.reportUrl(r);
      const pending = r.status === 'CREATED';
      body.append(
        el(
          'tr',
          { class: pending ? null : 'muted-row' },
          el('td', { class: 'cb' }, pending ? rowCheckbox(selectedReports, r.targetId, 'nội dung của ' + (r.actor?.fullname || r.actor?.username || ''), bulk) : null),
          el(
            'td',
            {},
            el('span', { class: 'tag accent', text: BG.REPORT_TARGET[r.targetType] || r.targetType }),
            el('div', { class: 'post-text clamp', title: 'Bấm để xem hết / thu gọn', text: r.content || '(không có chữ)', onclick: (e) => e.currentTarget.classList.toggle('clamp') }),
            open ? el('a', { class: 'small', href: open, target: '_blank', text: r.targetType === 'COMMENT' ? 'Mở bài chứa bình luận ↗' : 'Mở ↗' }) : null,
          ),
          el('td', {}, r.actor ? postAuthor(r.actor) : '—'),
          reasonCell(r),
          el('td', { title: fmtTime(r.createdAt), text: ago(r.createdAt) || '—' }),
          el('td', {}, el('span', { class: 'tag ' + (pending ? 'warn' : 'info'), text: BG.REPORT_STATUS[r.status] || r.status })),
          el(
            'td',
            { class: 'act' },
            pending ? el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => actReports('ignore', [r]) }) : null,
            pending ? el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn', onclick: () => actReports('hide', [r]) }) : null,
          ),
        ),
      );
    } else if (rep.kind === 'chat') {
      const who = r.member;
      body.append(
        el(
          'tr',
          {},
          el('td', { class: 'cb' }, rowCheckbox(selectedReports, r.id, 'tin của ' + (who.fullname || who.username || ''), bulk)),
          chatReportCell(r),
          el('td', {}, postAuthor(who)),
          el('td', {}, el('ul', { class: 'reason-list' }, (r.reasons.length ? r.reasons : [{ type: '', total: r.total }]).map((x) => el('li', {}, BG.HIDE_REASONS[x.type] || x.type || 'Không rõ lý do', el('span', { class: 'count', text: ` ×${x.total}` }))))),
          el('td', { title: fmtTime(r.firstAt), text: ago(r.firstAt) || '—' }),
          el(
            'td',
            { class: 'act' },
            el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => actChatReports('ignore', [r]) }),
            el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn', onclick: () => actChatReports('hide', [r]) }),
            // Mã Beincom của người gửi có trong báo cáo: dọn tài khoản (ẩn bài / bình luận, chặn) như ở tab Bài viết
            who.id ? el('button', { class: 'ghost sm', disabled: busy, title: 'Ẩn bài / bình luận gần đây và chặn tài khoản này', text: 'Dọn tài khoản', onclick: () => cleanupUser(who) }) : null,
          ),
        ),
      );
    } else if (rep.kind === 'flagged') {
      body.append(
        el(
          'tr',
          {},
          el('td', { class: 'cb' }, rowCheckbox(selectedReports, r.id, 'bài của ' + (r.actor.fullname || r.actor.username), bulk)),
          el('td', {}, postAuthor(r.actor)),
          el('td', {}, postContent(r)),
          el('td', {}, el('div', { class: 'badges' }, (r.violations.length ? r.violations : ['(không rõ)']).map((v) => el('span', { class: 'tag err', text: v })))),
          el('td', { title: fmtTime(r.publishedAt), text: ago(r.publishedAt) }),
          el('td', { class: 'act' }, el('a', { href: BG.postUrl(r), target: '_blank', text: 'Mở ↗' }), el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn bài', onclick: () => actReports('hidePost', [r]) })),
        ),
      );
    } else {
      body.append(el('tr', {}, el('td', {}, postAuthor(r.actor)), el('td', {}, postContent(r)), el('td', {}, postGroups(r)), el('td', { title: fmtTime(r.publishedAt), text: ago(r.publishedAt) }), el('td', { class: 'act' }, el('a', { href: BG.postUrl(r), target: '_blank', text: 'Mở ↗' }))));
    }
  }
  bulk();
}

// Tin nhắn chat bị báo cáo: Ẩn tin / Bỏ qua (theo Chạy thử, ghi Nhật ký). Gọi từ tab Báo cáo và Việc cần làm
async function actChatReports(action, rows, communityId = reportGroup()?.communityId) {
  if (busy || !rows.length || !communityId) return;
  const ok = await confirmDialog({
    title: action === 'hide' ? `Ẩn ${rows.length} tin nhắn chat bị báo cáo?` : `Bỏ qua ${rows.length} báo cáo tin nhắn chat?`,
    text: action === 'hide' ? 'Tin nhắn bị ẩn khỏi kênh chat của community.' : 'Tin nhắn được giữ nguyên, báo cáo được đóng lại.',
    names: rows.map((r) => `${r.member.fullname || r.member.username || '?'}: ${String(r.message || '').replace(/\s+/g, ' ').slice(0, 70)}`),
    okText: action === 'hide' ? 'Ẩn tin' : 'Bỏ qua',
    danger: action === 'hide',
  });
  if (!ok) return;
  const communityName = (data.state.chatReports?.[communityId]?.name || reportGroups().find((g) => g.isCommunity && g.communityId === communityId)?.name) ?? '';
  const items = rows.map((r) => ({ id: r.id, snippet: r.message, member: { id: r.member.id, username: r.member.username, fullname: r.member.fullname } }));
  const r = await send({ type: 'chatReportAct', action, communityId, communityName, items }, (n) => (action === 'hide' ? `Đã ẩn ${n} tin nhắn chat.` : `Đã bỏ qua ${n} báo cáo.`), { chunk: ['items'] });
  const done = new Set(r?.done || []);
  for (const [key, d] of Object.entries(rep.data)) if (key.endsWith(':chat') && d.items) d.items = d.items.filter((x) => !done.has(x.id));
  for (const id of done) selectedReports.delete(id);
  renderReports();
  renderBadges();
}

async function actReports(action, rows) {
  if (busy || !rows.length) return;
  const g = reportGroup();
  const isPost = action === 'hidePost';
  const items = rows.map((r) =>
    isPost
      ? { targetId: r.id, targetType: r.type, snippet: r.title || r.text, actor: r.actor, groups: r.groups }
      : { reportId: r.id, targetId: r.targetId, targetType: r.targetType, snippet: r.content, actor: r.actor },
  );
  let select = null;
  if (isPost) {
    select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
    select.value = hideReasonFor(rows.flatMap((r) => r.violations));
  }
  const T = {
    ignore: { title: `Bỏ qua ${rows.length} báo cáo?`, text: 'Nội dung được giữ nguyên, báo cáo được đánh dấu là không vi phạm.', ok: 'Bỏ qua', danger: false },
    hide: { title: `Ẩn ${rows.length} nội dung bị báo cáo?`, text: 'Nội dung bị ẩn khỏi community. Nội dung đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).', ok: 'Ẩn', danger: true },
    hidePost: { title: `Ẩn ${rows.length} bài bị gắn cờ?`, text: 'Bài bị gỡ khỏi các group bạn quản trị mà bài được đăng vào. Bài đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).', ok: 'Ẩn bài', danger: true },
  }[action];
  const ok = await confirmDialog({
    title: T.title,
    text: T.text,
    names: items.map((it) => `${it.actor?.fullname || it.actor?.username || '?'}: ${String(it.snippet || '').replace(/\s+/g, ' ').slice(0, 70)}`),
    okText: T.ok,
    danger: T.danger,
    extra: select ? el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select) : null,
  });
  if (!ok) return;
  const r = await send({ type: 'reportAct', action, groupId: g.id, items, reasonType: select?.value }, (n) => (action === 'ignore' ? `Đã bỏ qua ${n} báo cáo.` : `Đã ẩn ${n} nội dung.`), { chunk: ['items'] });
  const done = new Set(r?.done || []);
  if (done.size) {
    const d = rep.data[repKey(g)];
    if (d) {
      if (isPost) d.items = d.items.filter((x) => !done.has(x.id));
      else d.items = d.items.map((x) => (done.has(x.targetId) ? { ...x, status: action === 'ignore' ? 'IGNORED' : 'HID' } : x));
    }
    for (const id of done) selectedReports.delete(id);
  }
  renderReports();
  renderBadges();
}


// Báo cáo vi phạm
$('reports-group').addEventListener('change', (e) => {
  rep.groupId = e.target.value;
  selectedReports.clear();
  if (rep.data[repKey()]?.loaded) renderReports();
  else loadReports();
});
onSeg('reports-kind', (f) => {
  rep.kind = f;
  selectedReports.clear();
  if (rep.data[repKey()]?.loaded) renderReports();
  else loadReports();
});
onSeg('reports-status', (f) => {
  rep.status = f;
  renderReports();
});
$('reports-check-all').addEventListener('change', (e) => {
  const rows = reportRows().filter((r) => (rep.kind === 'reported' ? r.status === 'CREATED' : rep.kind !== 'hidden'));
  for (const r of rows) e.target.checked ? selectedReports.add(r.targetId || r.id) : selectedReports.delete(r.targetId || r.id);
  renderReports();
});
const pickedReports = () => reportRows().filter((r) => selectedReports.has(r.targetId || r.id));
$('btn-reports-ignore').addEventListener('click', () => (rep.kind === 'chat' ? actChatReports('ignore', pickedReports()) : actReports('ignore', pickedReports())));
$('btn-reports-hide').addEventListener('click', () => (rep.kind === 'chat' ? actChatReports('hide', pickedReports()) : actReports(rep.kind === 'flagged' ? 'hidePost' : 'hide', pickedReports())));
