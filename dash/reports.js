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
const repKey = (g = reportGroup(), kind = rep.kind) => `${g?.id}:${kind}`;

async function loadReports() {
  const g = reportGroup();
  if (!g || rep.loading) return;
  rep.groupId = g.id;
  const key = repKey(g);
  if (rep.kind === 'reported' && !canSeeReported(g)) {
    rep.data[key] = { items: [], loaded: true, error: '', notAdmin: true };
    renderReports();
    return;
  }
  rep.loading = true;
  renderReports();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'reports', groupId: g.id, kind: rep.kind });
    if (r?.status === 'ok') rep.data[key] = { items: r.items, timedOut: r.timedOut, none: !!r.none, loaded: true, error: '', at: Date.now() };
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
  const items = d?.items || [];
  if (rep.kind !== 'reported') return items;
  return items.filter((r) => rep.status === 'all' || r.status === rep.status);
}

function reportHead() {
  const cols = {
    reported: ['', 'Nội dung bị báo cáo', 'Tác giả', 'Lý do báo cáo', 'Báo cáo lúc', 'Trạng thái', 'Thao tác'],
    flagged: ['', 'Người đăng', 'Nội dung', 'Vi phạm (tự động)', 'Đăng lúc', 'Thao tác'],
    hidden: ['Người đăng', 'Nội dung', 'Đăng vào', 'Đăng lúc', ''],
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

function renderReports() {
  const gs = reportGroups();
  const g = reportGroup();
  $('reports-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (canSeeReported(x) ? ' (admin community)' : '') })));
  $('reports-group').disabled = !gs.length || rep.loading;
  setSegActive('reports-kind', rep.kind);
  setSegActive('reports-status', rep.status);
  $('reports-status').hidden = rep.kind !== 'reported';
  for (const k of ['reported', 'flagged', 'hidden']) {
    const d = rep.data[repKey(g, k)];
    // Chưa mở mục nào thì lấy số từ lần quét
    const scanned = { reported: g?.reportIds, flagged: g?.flaggedIds }[k]?.length || 0;
    const n = d?.loaded ? (k === 'reported' ? d.items.filter((r) => r.status === 'CREATED').length : d.items.length) : scanned;
    $('rk-' + k).textContent = n ? `(${n})` : '';
  }

  const d = rep.data[repKey()];
  const note = $('reports-note');
  note.classList.toggle('err-text', !!d?.error && !d?.notAdmin);
  if (!g) note.textContent = data.state.snapshot ? 'Không có group nào.' : 'Chưa quét lần nào.';
  else if (rep.loading) note.textContent = rep.kind === 'reported' ? 'Đang tải báo cáo… (Beincom có lúc trả chậm, tối đa 25 giây)' : 'Đang tải…';
  else if (d?.notAdmin) note.textContent = 'Báo cáo của người dùng chỉ dành cho chủ / admin community — hãy chọn group gốc của community bạn làm admin (có ghi "admin community"). Bạn vẫn xem được mục "Gắn cờ tự động" và "Đã ẩn".';
  else if (d?.error) note.textContent = d.error;
  else if (d?.none) note.textContent = 'Không có báo cáo nào đang chờ xử lý (Beincom đếm 0) — các báo cáo đã xử lý không được tải lại.';
  else if (d?.timedOut) note.textContent = 'Beincom không phản hồi sau 25 giây. Thường gặp khi community chưa có báo cáo nào — bấm Tải lại để thử lại.';
  else if (rep.kind === 'reported') note.textContent = 'Bỏ qua: đánh dấu nội dung không vi phạm. Ẩn: ẩn nội dung bị báo cáo khỏi community (bình luận bị ẩn cũng biến mất khỏi bài).';
  else if (rep.kind === 'flagged') note.textContent = 'Bài do hệ thống kiểm duyệt tự động của Beincom phát hiện có dấu hiệu vi phạm. Ẩn bài: gỡ bài khỏi các group bạn quản trị mà bài được đăng vào.';
  else note.textContent = 'Bài đã bị ẩn trong group (do admin hoặc do xử lý báo cáo). Addon chưa hiện lại được bài đã ẩn.';

  const ncol = reportHead();
  const rows = reportRows();
  pruneSelection(selectedReports, new Set(rows.map((r) => r.targetId || r.id)));
  const idOf = (r) => r.targetId || r.id;
  const pickable = rep.kind === 'reported' ? rows.filter((r) => r.status === 'CREATED') : rep.kind === 'flagged' ? rows : [];
  const bulk = () => renderBulk({ set: selectedReports, shown: pickable, idOf, checkAll: 'reports-check-all', countEl: 'reports-selected', buttons: rep.kind === 'reported' ? ['btn-reports-ignore', 'btn-reports-hide'] : ['btn-reports-hide'] });
  $('reports-bulk').hidden = rep.kind === 'hidden';
  $('btn-reports-ignore').hidden = rep.kind !== 'reported';
  $('btn-reports-hide').textContent = rep.kind === 'flagged' ? 'Ẩn bài đã chọn' : 'Ẩn đã chọn';

  const body = $('reports-body');
  body.replaceChildren();
  if (!rows.length) {
    const msg = rep.loading ? 'Đang tải…' : !d?.loaded ? 'Bấm "Tải lại" để xem' : d.error || d.notAdmin ? '—' : d.timedOut ? 'Chưa đọc được báo cáo' : rep.kind === 'reported' ? 'Không có báo cáo nào đang chờ xử lý 🎉' : rep.kind === 'flagged' ? 'Không có bài nào bị gắn cờ 🎉' : 'Không có bài nào đã ẩn';
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
    hide: { title: `Ẩn ${rows.length} nội dung bị báo cáo?`, text: 'Nội dung bị ẩn khỏi community. Addon chưa hiện lại được nội dung đã ẩn.', ok: 'Ẩn', danger: true },
    hidePost: { title: `Ẩn ${rows.length} bài bị gắn cờ?`, text: 'Bài bị gỡ khỏi các group bạn quản trị mà bài được đăng vào. Addon chưa hiện lại được bài đã ẩn.', ok: 'Ẩn bài', danger: true },
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
  const r = await send({ type: 'reportAct', action, groupId: g.id, items, reasonType: select?.value }, (n) => (action === 'ignore' ? `Đã bỏ qua ${n} báo cáo.` : `Đã ẩn ${n} nội dung.`));
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
  const rows = reportRows().filter((r) => (rep.kind === 'reported' ? r.status === 'CREATED' : true));
  for (const r of rows) e.target.checked ? selectedReports.add(r.targetId || r.id) : selectedReports.delete(r.targetId || r.id);
  renderReports();
});
const pickedReports = () => reportRows().filter((r) => selectedReports.has(r.targetId || r.id));
$('btn-reports-ignore').addEventListener('click', () => actReports('ignore', pickedReports()));
$('btn-reports-hide').addEventListener('click', () => actReports(rep.kind === 'flagged' ? 'hidePost' : 'hide', pickedReports()));
