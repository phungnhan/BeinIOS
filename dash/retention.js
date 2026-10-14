// Dashboard — tab Thống kê: Thành viên mới có ở lại không. Người vào trong 30 / 60 / 90 ngày (nhật ký thành viên), sau đó
// còn ở lại hay đã rời, đã đăng bài / bình luận chưa. Service worker đọc (bg/insights.js doRetention, chỉ đọc).
// Nhắc người chưa hoạt động: soạn bài vào ô Đăng bài (tự tay, hoặc bản soạn sẵn sáng thứ Hai ở khoá `nudgeDraft`);
// bài đăng thật được ghi ở `nudges` để đo hiệu quả (bg/insights.js doNudgeEffect).

const ret = { groupId: null, days: 30, raw: null, loading: false, error: '', filter: 'all' };

function retGroup() {
  const gs = statsGroups();
  return gs.find((g) => g.id === ret.groupId) || statsGroup() || null;
}

// Số liệu đã ghép: bài (service worker tìm) + bình luận addon đã đọc khi quét
function retView() {
  const r = ret.raw;
  if (!r) return null;
  const activity = BG.cohortActivity(r.cohort, { posts: r.actorPosts, comments: data.state.recentComments || [] });
  return { cohort: r.cohort, activity, sum: BG.cohortSummary(r.cohort, activity, r.now) };
}

const RET_FILTERS = {
  all: () => true,
  silent: (m, a) => m.status === 'stay' && !(a?.posts || a?.comments),
  active: (m, a) => !!(a?.posts || a?.comments),
  gone: (m) => m.status !== 'stay',
};

function retBar(k, n, cls = '') {
  const w = n ? Math.round((k / n) * 100) : 0;
  return el('div', { class: 'ret-bar ' + cls, title: `${k}/${n}` }, el('div', { class: 'bar' }, el('i', { style: `width: ${w}%` })), el('span', { class: 'small', text: `${fmtN(k)} (${pctText(k, n)})` }));
}

function renderRetention() {
  const gs = statsGroups();
  const g = retGroup();
  $('ret-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.isCommunity ? ' (cả community)' : '') })));
  $('ret-group').disabled = $('btn-ret-run').disabled = !g || ret.loading;
  $('btn-ret-run').textContent = ret.loading ? 'Đang đọc…' : 'Phân tích';
  setSegActive('ret-range', String(ret.days));
  setSegActive('ret-filter', ret.filter);

  const v = retView();
  const note = $('ret-note');
  note.classList.toggle('err-text', !!ret.error);
  if (ret.loading) note.textContent = 'Đang đọc nhật ký thành viên và bài của người mới… (chỉ đọc)';
  else if (ret.error) note.textContent = ret.error;
  else if (!g) note.textContent = data.state.snapshot ? 'Không có group nào.' : 'Chưa quét lần nào.';
  else if (!v) note.textContent = 'Xem người vào trong 30 / 60 / 90 ngày qua: ai còn ở lại, ai đã rời và rời sau bao lâu, ai đã đăng bài hay bình luận. Bấm Phân tích (chỉ đọc nhật ký và bài trên Beincom).';
  else {
    const parts = [`${g.name}: người vào trong ${ret.raw.days} ngày qua.`, '"Có hoạt động" = đã đăng bài (Beincom tìm theo người đăng) hoặc có bình luận trong các bình luận addon đã đọc khi quét — có thể còn bình luận / cảm xúc addon không thấy.'];
    if (ret.raw.truncated) parts.push('Nhật ký quá dài, mới đọc 2.000 sự kiện gần nhất.');
    if (ret.raw.actorChecked < v.cohort.length) parts.push(`Bài của người mới chỉ tìm cho ${fmtN(ret.raw.actorChecked)} người vào gần nhất.`);
    if (ret.raw.errors?.length) parts.push('Lỗi: ' + ret.raw.errors.join('; '));
    note.textContent = parts.join(' ');
  }

  renderNudgePanels(g);
  $('ret-out').hidden = !v;
  if (!v) return;
  const s = v.sum;
  const gone = s.left + s.removed + s.banned;
  $('ret-tiles').replaceChildren(
    tile('Người mới', fmtN(s.joined), `trong ${ret.raw.days} ngày`),
    tile('Còn ở lại', pctText(s.stayed, s.joined), `${fmtN(s.stayed)} người · ${fmtN(gone)} đã rời${s.removed + s.banned ? ` (${fmtN(s.removed + s.banned)} bị xoá / cấm)` : ''}`),
    tile('Ở lại qua 7 ngày đầu', pctText(s.d7.kept, s.d7.base), s.d7.base ? `trong ${fmtN(s.d7.base)} người vào từ 7 ngày trước` : 'chưa ai vào đủ 7 ngày'),
    tile('Ở lại qua 30 ngày đầu', pctText(s.d30.kept, s.d30.base), s.d30.base ? `trong ${fmtN(s.d30.base)} người vào từ 30 ngày trước` : 'chưa ai vào đủ 30 ngày'),
    tile('Đã đăng bài', pctText(s.posted, s.joined), `${fmtN(s.posted)} người · ${fmtN(s.commented)} có bình luận`),
    tile('Chưa thấy hoạt động', fmtN(s.silent), gone && s.medianLeaveDays != null ? `còn ở lại · người rời thường rời sau ${s.medianLeaveDays < 1 ? 'chưa tới 1 ngày' : Math.round(s.medianLeaveDays) + ' ngày'}` : 'còn ở lại, chưa đăng bài / bình luận'),
  );

  const dmy = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const weekEnd = (d) => new Date(Date.parse(d) + 6 * 864e5).toISOString().slice(0, 10);
  $('ret-weeks').replaceChildren(
    ...s.weeks.map((w) => el('tr', {}, el('td', { class: 'nowrap', text: `${dmy(w.week)} – ${dmy(weekEnd(w.week))}` }), el('td', { class: 'num', text: fmtN(w.joined) }), el('td', {}, retBar(w.stayed, w.joined, 'ok')), el('td', {}, retBar(w.active, w.joined)))),
  );
  if (!s.weeks.length) $('ret-weeks').append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: 'Không có ai vào trong khoảng này' })));

  const list = v.cohort.filter((m) => RET_FILTERS[ret.filter](m, v.activity[m.user.id]));
  const silent = nudgeUsers(v);
  const recentlyNudged = v.cohort.filter((m) => RET_FILTERS.silent(m, v.activity[m.user.id]) && m.user.username).length - silent.length;
  $('btn-ret-nudge').disabled = !silent.length;
  $('btn-ret-nudge').textContent = `✉ Soạn bài nhắc người chưa hoạt động${silent.length ? ` (${silent.length})` : ''}`;
  $('btn-ret-nudge').title = recentlyNudged > 0 ? `Bỏ ${recentlyNudged} người đã được nhắc trong ${BG.NUDGE_COOLDOWN_DAYS} ngày qua` : '';
  const nudged = BG.nudgeIndex(data.nudges);
  $('btn-ret-csv').disabled = !list.length;
  const body = $('ret-body');
  body.replaceChildren();
  if (!list.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: 'Không có ai' })));
  for (const m of list.slice(0, 300)) {
    const a = v.activity[m.user.id] || {};
    body.append(
      el(
        'tr',
        {},
        el('td', {}, postAuthor(m.user)),
        el('td', { class: 'nowrap', text: fmtTime(m.joinedAt) }),
        el('td', {}, el('span', { class: 'tag ' + (m.status === 'stay' ? 'ok' : m.status === 'left' ? 'warn' : 'err'), text: BG.cohortStatusText(m) }), nudged.has(m.user.id) ? el('span', { class: 'tag info', title: 'Được nhắc tên trong bài nhắc đăng qua addon', text: 'Đã nhắc ' + fmtDay(nudged.get(m.user.id)) }) : null),
        el('td', { class: 'num', text: fmtN(a.posts || 0) }),
        el('td', { class: 'num', text: fmtN(a.comments || 0) }),
      ),
    );
  }
  if (list.length > 300) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 5, text: `… còn ${fmtN(list.length - 300)} người — bấm Xuất CSV để xem đủ` })));
}

async function runRetention() {
  const g = retGroup();
  if (!g || ret.loading) return;
  Object.assign(ret, { groupId: g.id, loading: true, error: '', raw: null });
  renderRetention();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'retention', groupId: g.id, days: ret.days });
    if (r?.status !== 'ok') ret.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else ret.raw = r;
  } finally {
    ret.loading = false;
    renderRetention();
  }
}

// Người nên nhắc trong lần phân tích này: còn ở lại, chưa thấy hoạt động, chưa được nhắc trong 30 ngày (mới vào trước)
function nudgeUsers(v) {
  return BG.nudgeCandidates(v.cohort, v.activity, data.nudges, { now: Date.now(), minDays: 0 });
}

const fmtDay = (t) => new Date(t + 7 * 3600e3).toISOString().slice(5, 10).split('-').reverse().join('/');

// Điền bài nhắc (nhắc tên tối đa 50 người) vào ô Đăng bài; compose.nudge để addon ghi lại ai được nhắc khi đăng thật
function fillNudge(g, users) {
  if (!users.length) return toast('Không có ai cần nhắc', 'err');
  if (compose.edit) return toast('Đang sửa bài đã đăng — bấm Huỷ sửa trước', 'err');
  if ($('compose-text').value.trim() && !confirm('Thay nội dung đang soạn bằng bài nhắc thành viên mới?')) return;
  const { text, mentions } = BG.welcomeText(BG.DEFAULT_NUDGE, { users, groupName: g.name });
  showTab('compose');
  compose.groupIds = new Set([g.id]);
  compose.mentions = { ...compose.mentions, ...mentions };
  compose.nudge = { groupId: g.id, userIds: users.slice(0, 50).map((u) => u.id) };
  $('compose-text').value = text;
  renderComposeGroups();
  updateCompose();
  saveDraft();
  $('compose').scrollIntoView({ block: 'start' });
  $('compose-text').focus();
  toast(`Đã soạn bài nhắc ${Math.min(users.length, 50)} người vào ô soạn bài — xem lại rồi bấm Đăng hoặc Hẹn giờ. Addon sẽ ghi lại ai được nhắc để đo hiệu quả.`);
}

function composeNudge() {
  const g = retGroup();
  const v = retView();
  if (g && v) fillNudge(g, nudgeUsers(v));
}

// Bản soạn sẵn sáng thứ Hai, công tắc soạn hằng tuần, bảng hiệu quả các lần nhắc
function renderNudgePanels(g) {
  const d = data.nudgeDraft;
  $('nudge-draft').hidden = !d;
  if (d) {
    $('nudge-draft-title').textContent = `📬 Bài nhắc tuần này đã soạn sẵn: ${d.users.length} người mới chưa hoạt động ở ${d.groupName}`;
    const names = d.users.slice(0, 8).map((u) => '@' + u.username).join(', ');
    $('nudge-draft-sub').textContent = `Soạn lúc ${fmtTime(d.at)} · ${names}${d.users.length > 8 ? ` và ${d.users.length - 8} người khác` : ''}`;
  }
  const st = data.settings;
  const on = !!(st.nudgeWeekly && st.nudgeGroupId);
  const other = on && st.nudgeGroupId !== g?.id ? groups().find((x) => x.id === st.nudgeGroupId) : null;
  $('nudge-weekly').checked = on && st.nudgeGroupId === g?.id;
  $('nudge-weekly').disabled = !g;
  $('nudge-weekly-note').textContent = other ? `(đang bật cho ${other.name})` : on ? '(đang bật)' : '';

  const nudges = data.nudges || [];
  $('nudge-effect').hidden = !nudges.length;
  if (!nudges.length) return;
  const eff = new Map((data.nudgeEffect?.items || []).map((x) => [x.id, x]));
  $('nudge-effect-at').textContent = data.nudgeEffect ? `đo lúc ${fmtTime(data.nudgeEffect.at)}` : 'chưa đo';
  $('nudge-effect-body').replaceChildren(
    ...nudges.slice(0, 10).map((n) => {
      const e = eff.get(n.id);
      const pending = Date.parse(n.at) > Date.now();
      return el(
        'tr',
        {},
        el('td', { class: 'nowrap' }, el('div', { text: fmtTime(n.at) }), pending ? el('span', { class: 'tag info', text: 'Chờ tới giờ đăng' }) : null),
        el('td', { class: 'small', text: n.groupName || '' }),
        el('td', { class: 'num', text: fmtN(n.userIds.length) }),
        el(
          'td',
          {},
          e && !pending ? retBar(e.active, e.total, 'ok') : el('span', { class: 'muted small', text: pending ? 'chưa đăng' : 'bấm Đo hiệu quả' }),
          e && !pending && e.active ? el('div', { class: 'muted small', text: `${e.posted} đăng bài · ${e.commented} bình luận · sau ${e.days} ngày` }) : null,
        ),
        el('td', { class: 'num', text: e && !pending ? fmtN(e.left) : '–' }),
      );
    }),
  );
}

// Mở từ thông báo sáng thứ Hai (#tab=stats&nudge=1)
function openNudge() {
  showTab('stats');
  if (data.nudgeDraft) ret.groupId = data.nudgeDraft.groupId;
  renderRetention();
  $('retention').scrollIntoView({ block: 'start' });
}

function exportRetention() {
  const v = retView();
  if (!v) return;
  const rows = v.cohort.filter((m) => RET_FILTERS[ret.filter](m, v.activity[m.user.id]));
  const csv = BG.toCsv(rows, [
    { label: 'Username', get: (m) => m.user.username || '' },
    { label: 'Tên', get: (m) => m.user.fullname || '' },
    { label: 'Vào lúc', get: (m) => fmtTime(m.joinedAt) },
    { label: 'Tình trạng', get: (m) => BG.cohortStatusText(m) },
    { label: 'Rời lúc', get: (m) => (m.outAt ? fmtTime(m.outAt) : '') },
    { label: 'Bài', get: (m) => v.activity[m.user.id]?.posts || 0 },
    { label: 'Bình luận (addon đã đọc)', get: (m) => v.activity[m.user.id]?.comments || 0 },
  ]);
  download(`beinfusion-thanh-vien-moi-${ret.raw.days}-ngay-${BG.vnDay()}.csv`, csv, 'text/csv;charset=utf-8');
}

$('ret-group').addEventListener('change', (e) => {
  Object.assign(ret, { groupId: e.target.value, raw: null, error: '' });
  renderRetention();
});
onSeg('ret-range', (f) => {
  Object.assign(ret, { days: Number(f), raw: null, error: '' });
  renderRetention();
});
onSeg('ret-filter', (f) => {
  ret.filter = f;
  renderRetention();
});
$('btn-ret-run').addEventListener('click', runRetention);
$('btn-ret-nudge').addEventListener('click', composeNudge);
$('btn-nudge-open').addEventListener('click', () => {
  const d = data.nudgeDraft;
  const g = d && groups().find((x) => x.id === d.groupId);
  if (!g) return toast('Group của bản soạn sẵn không còn — hãy quét lại', 'err');
  fillNudge(g, d.users);
});
$('btn-nudge-skip').addEventListener('click', async () => {
  await chrome.storage.local.remove('nudgeDraft');
  data.nudgeDraft = null;
  renderRetention();
});
$('nudge-weekly').addEventListener('change', async (e) => {
  const g = retGroup();
  if (!g) return;
  const patch = e.target.checked ? { nudgeWeekly: true, nudgeGroupId: g.id } : { nudgeWeekly: false };
  await saveTo('settings', BG.DEFAULT_SETTINGS, patch);
  Object.assign(data.settings, patch);
  renderRetention();
  toast(e.target.checked ? `Sáng thứ Hai addon sẽ soạn sẵn bài nhắc người mới chưa hoạt động ở ${g.name} và báo cho bạn.` : 'Đã tắt soạn sẵn bài nhắc hằng tuần.');
});
$('btn-nudge-effect').addEventListener('click', async () => {
  const b = $('btn-nudge-effect');
  b.disabled = true;
  b.textContent = 'Đang đo…';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'nudgeEffect' });
    if (r?.status === 'ok') {
      data.nudgeEffect = { at: r.at, items: r.items };
      renderRetention();
    } else toast(r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Không đo được', 'err');
  } finally {
    b.disabled = false;
    b.textContent = '↻ Đo hiệu quả';
  }
});
$('btn-ret-csv').addEventListener('click', exportRetention);
