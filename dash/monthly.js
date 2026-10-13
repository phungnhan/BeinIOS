// Dashboard — tab Thống kê: Báo cáo tháng. Số liệu Beincom (nhật ký vào / rời, bài trong tháng, bài của người mới) do
// service worker đọc (bg/insights.js doMonthly, chỉ đọc); ghép với nhật ký / hồ sơ của addon bằng BG.monthlyReport.

const monthly = { groupId: null, month: null, report: null, loading: false, error: '' };

function monthlyGroup() {
  const gs = statsGroups();
  return gs.find((g) => g.id === monthly.groupId) || statsGroup() || null;
}

// Phạm vi báo cáo: cả community = mọi group mình quản trị trong community (giống Thống kê), còn lại chỉ group đó
function reportScope(g) {
  return g.isCommunity ? groups().filter((x) => !x.error && x.communityId === g.communityId) : [g];
}

const fmtN = (x) => (x == null ? '–' : Number(x).toLocaleString('vi-VN'));
const pctText = (k, n) => (n ? Math.round((k / n) * 100) + '%' : '–');
const signedN = (x) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmtN(Math.abs(x));

function changeText(a, b) {
  if (b == null) return '';
  if (!b) return a ? ' (tháng trước 0)' : '';
  if (a === b) return '';
  return ` (${a > b ? '+' : '−'}${Math.round((Math.abs(a - b) / b) * 100)}%)`;
}

function renderMonthly() {
  const gs = statsGroups();
  const g = monthlyGroup();
  const opts = BG.monthOptions(Date.now(), 2);
  if (!monthly.month || !opts.some((o) => o.key === monthly.month)) monthly.month = opts[1].key; // mặc định tháng trước
  $('monthly-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.isCommunity ? ' (cả community)' : '') })));
  $('monthly-month').replaceChildren(...opts.map((o) => el('option', { value: o.key, selected: o.key === monthly.month, text: o.label })));
  $('monthly-group').disabled = $('monthly-month').disabled = $('btn-monthly-run').disabled = !g || monthly.loading;
  $('btn-monthly-run').textContent = monthly.loading ? 'Đang đọc…' : 'Tạo báo cáo';

  const r = monthly.report;
  const note = $('monthly-note');
  note.classList.toggle('err-text', !!monthly.error);
  if (monthly.loading) note.textContent = 'Đang đọc số liệu từ Beincom… (chỉ đọc; community đông người có thể mất vài chục giây)';
  else if (monthly.error) note.textContent = monthly.error;
  else if (!g) note.textContent = data.state.snapshot ? 'Không có group nào để báo cáo.' : 'Chưa quét lần nào.';
  else if (!r) note.textContent = 'Chọn community / group và tháng rồi bấm Tạo báo cáo. Addon chỉ đọc: nhật ký vào / rời, bài đăng trong tháng và tháng trước, bài của người mới, việc của đội admin trong nhật ký Beincom. Phần kiểm duyệt qua addon lấy từ nhật ký của addon.';
  else {
    const parts = [`${r.group.name} · ${r.label}${r.partial ? ' (tới hôm nay)' : ''}, so với ${r.prevLabel}.`];
    parts.push(r.members.start == null ? 'Nhật ký vào / rời quá dài nên chưa tính được số thành viên đầu / cuối tháng.' : 'Số thành viên đầu / cuối tháng suy ra từ số hiện tại và nhật ký vào / rời.');
    if (r.newcomers.joined) parts.push(`Bình luận của người mới chỉ tính các bình luận addon đã đọc khi quét${r.newcomers.checked < r.newcomers.joined ? `; bài của người mới đã tìm cho ${fmtN(r.newcomers.checked)} người mới nhất` : ''}.`);
    if (r.errors.length) parts.push('Lỗi: ' + r.errors.join('; '));
    note.textContent = parts.join(' ');
  }

  $('monthly-out').hidden = !r;
  if (!r) return;
  const m = r.members;
  const nc = r.newcomers;
  const c = r.content.cur;
  const p = r.content.prev;
  const a = r.actions;
  const moderated = a.approved + a.autoApproved + a.declined + a.autoDeclined + a.removed + a.banned + a.postsApproved + a.postsRejected + a.postsHidden + a.postsDeleted + a.commentsHidden + a.reportsHandled;
  $('monthly-tiles').replaceChildren(
    tile(r.partial ? 'Thành viên hiện tại' : 'Thành viên cuối tháng', fmtN(m.end), m.start != null ? `đầu tháng ${fmtN(m.start)} · ${signedN(m.end - m.start)}` : ''),
    tile('Vào / rời', `+${fmtN(m.joined)} / −${fmtN(m.left)}`, `${r.prevLabel}: +${fmtN(m.prev.joined)} / −${fmtN(m.prev.left)}`),
    tile('Người mới còn ở lại', nc.joined ? pctText(nc.stayed, nc.joined) : '–', nc.joined ? `${fmtN(nc.stayed)}/${fmtN(nc.joined)} người · ${fmtN(nc.active)} có hoạt động` : 'không có người mới'),
    tile('Bài viết', fmtN(c.posts), `${r.prevLabel}: ${fmtN(p.posts)}${changeText(c.posts, p.posts)}`),
    tile('Cảm xúc · bình luận', `${fmtN(c.reactions)} · ${fmtN(c.comments)}`, `👁 ${fmtN(c.views)} lượt xem${c.truncated ? ` · trên ${fmtN(c.read)} bài mới nhất` : ''}`),
    tile('Kiểm duyệt qua addon', fmtN(moderated), moderated ? `${fmtN(a.approved + a.autoApproved)} duyệt thành viên · ${fmtN(a.postsHidden + a.commentsHidden)} ẩn` : 'không có thao tác'),
    ...(r.chat ? [tile('Chat', `${fmtN(r.chat.cur.messages)} tin`, `${fmtN(r.chat.cur.people)} người nhắn · ${r.prevLabel}: ${fmtN(r.chat.prev.messages)}${changeText(r.chat.cur.messages, r.chat.prev.messages)}`)] : []),
    ...(r.team ? [tile('Đội admin', `${fmtN(r.team.admins.length)} admin`, r.team.total ? `${fmtN(r.team.total)} việc theo nhật ký Beincom` : 'không có việc nào')] : []),
  );

  const tp = $('monthly-posts');
  tp.replaceChildren();
  if (!r.topPosts.length) tp.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: 'Không có bài nào trong tháng' })));
  r.topPosts.forEach((x, i) =>
    tp.append(
      el(
        'tr',
        {},
        el('td', { class: 'wrap' }, el('span', { class: 'rank', text: `${i + 1}.` }), el('a', { href: BG.postUrl(x), target: '_blank', text: snippet(x) }), el('div', { class: 'muted small', text: fmtTime(x.publishedAt) })),
        el('td', { class: 'num', text: fmtN(x.views) }),
        el('td', { class: 'num', text: fmtN(x.reactions) }),
        el('td', { class: 'num', text: fmtN(x.commentsCount) }),
      ),
    ),
  );
  const ta = $('monthly-authors');
  ta.replaceChildren();
  if (!r.topAuthors.length) ta.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: 'Chưa có ai đăng bài' })));
  r.topAuthors.forEach((x, i) =>
    ta.append(
      el(
        'tr',
        {},
        el('td', {}, el('div', { class: 'user' }, el('span', { class: 'rank', text: `${i + 1}.` }), postAuthor(x.actor || {}), x.isNew ? el('span', { class: 'tag ok', text: 'Người mới' }) : null)),
        el('td', { class: 'num', text: fmtN(x.posts) }),
        el('td', { class: 'num', text: fmtN(x.reactions) }),
        el('td', { class: 'num', text: fmtN(x.comments) }),
      ),
    ),
  );
  renderMonthlyTeam(r);
  $('monthly-text').textContent = BG.monthlyText(r);
}

// Đội admin: việc của từng admin theo nhật ký Beincom (cả việc làm trên web) + các lần đổi cài đặt / quyền admin
function renderMonthlyTeam(r) {
  const t = r.team;
  $('monthly-team-box').hidden = !t;
  if (!t) return;
  const cols = Object.entries(BG.TEAM_COLS);
  const notes = ['Theo nhật ký hoạt động của Beincom: gồm cả việc làm thẳng trên web, không qua addon. Duyệt / ẩn bài và xử lý báo cáo không có trong nhật ký này (xem ô Kiểm duyệt qua addon).'];
  if (t.skipped.length) notes.push(`Không đọc được nhật ký của: ${t.skipped.join(', ')} (tài khoản không có quyền).`);
  if (t.truncated) notes.push('Có group quá nhiều việc trong tháng: mới tính 500 việc mới nhất mỗi group.');
  $('monthly-team-note').textContent = notes.join(' ');
  $('monthly-team-head').replaceChildren(el('tr', {}, el('th', { text: 'Admin' }), ...cols.map(([, l]) => el('th', { class: 'num', text: l })), el('th', { text: 'Gần nhất' })));
  const body = $('monthly-team');
  body.replaceChildren();
  if (!t.admins.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: cols.length + 2, text: 'Không có việc nào của admin trong tháng (theo nhật ký Beincom)' })));
  for (const a of t.admins) {
    body.append(
      el(
        'tr',
        {},
        el('td', {}, el('div', { class: 'user' }, postAuthor(a.actor), a.isMe ? el('span', { class: 'tag accent', text: 'Bạn' }) : null)),
        ...cols.map(([k]) => el('td', { class: 'num' + (a.counts[k] ? '' : ' muted'), text: a.counts[k] ? fmtN(a.counts[k]) : '–' })),
        el('td', { class: 'small', title: fmtTime(a.last), text: ago(a.last) }),
      ),
    );
  }
  $('monthly-changes-h').hidden = !t.changes.length;
  $('monthly-changes').replaceChildren(
    ...t.changes.slice(0, 20).map((e) =>
      el('li', {}, el('span', { class: 'muted small', text: fmtTime(e.time) + ' · ' }), el('b', { text: e.actor.fullname || e.actor.username || '?' }), ` — ${BG.teamChangeText(e)}`, e.groupName ? el('span', { class: 'muted small', text: ` · ${e.groupName}` }) : null),
    ),
  );
}

async function runMonthly() {
  const g = monthlyGroup();
  if (!g || monthly.loading) return;
  Object.assign(monthly, { groupId: g.id, loading: true, error: '', report: null });
  renderMonthly();
  try {
    const raw = await chrome.runtime.sendMessage({ type: 'monthly', groupId: g.id, month: monthly.month });
    if (raw?.status !== 'ok') monthly.error = raw?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : raw?.message || 'Có lỗi';
    else {
      const scope = reportScope(g);
      monthly.report = BG.monthlyReport(raw, { log: data.log, profiles: data.profiles, comments: data.state.recentComments || [], postStats: data.postStats, scopeIds: scope.map((x) => x.id), scopeNames: scope.map((x) => x.name), meId: data.state.me?.id });
    }
  } finally {
    monthly.loading = false;
    renderMonthly();
  }
}

// Mở từ thông báo đầu tháng (#tab=stats&monthly=1): báo cáo tháng trước của community đang chọn
function openMonthly() {
  showTab('stats');
  monthly.month = BG.shiftMonth(BG.monthKey(), -1);
  renderMonthly();
  $('monthly').scrollIntoView({ block: 'start' });
  if (!monthly.report && !monthly.loading) runMonthly();
}

$('monthly-group').addEventListener('change', (e) => {
  Object.assign(monthly, { groupId: e.target.value, report: null, error: '' });
  renderMonthly();
});
$('monthly-month').addEventListener('change', (e) => {
  Object.assign(monthly, { month: e.target.value, report: null, error: '' });
  renderMonthly();
});
$('btn-monthly-run').addEventListener('click', runMonthly);
$('btn-monthly-copy').addEventListener('click', async () => {
  if (!monthly.report) return;
  const ok = await copyText(BG.monthlyText(monthly.report));
  toast(ok ? 'Đã sao chép báo cáo — dán vào tin nhắn cho các admin khác.' : 'Không sao chép được — trình duyệt chặn bộ nhớ tạm', ok ? 'ok' : 'err');
});
$('btn-monthly-file').addEventListener('click', () => {
  const r = monthly.report;
  if (r) download(`beingroup-bao-cao-${r.key}.txt`, BG.monthlyText(r), 'text/plain;charset=utf-8');
});
$('btn-monthly-tg').addEventListener('click', async () => {
  const r = monthly.report;
  if (!r) return;
  const b = $('btn-monthly-tg');
  b.disabled = true;
  try {
    const [, ...body] = BG.monthlyText(r).split('\n');
    const res = await chrome.runtime.sendMessage({ type: 'telegramReport', title: `BeinGroup: báo cáo ${r.label} — ${r.group.name}`, text: body.join('\n') });
    toast(res?.status === 'ok' ? 'Đã gửi báo cáo về Telegram.' : res?.message || 'Không gửi được', res?.status === 'ok' ? 'ok' : 'err');
  } finally {
    b.disabled = false;
  }
});
