// Dashboard — tab Thống kê.

// ---------- Thống kê ----------

const stats = { groupId: null, days: 30, raw: null, built: null, loading: false, loaded: false, error: '' };

function statsGroups() {
  return groups().filter((g) => !g.error && g.communityId);
}

function statsGroup() {
  const gs = statsGroups();
  return gs.find((g) => g.id === stats.groupId) || gs[0] || null;
}

function renderStatsHead() {
  const gs = statsGroups();
  const g = statsGroup();
  $('stats-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name + (x.isCommunity ? ' (cả community)' : '') })));
  $('stats-group').disabled = !gs.length || stats.loading;
  setSegActive('stats-range', String(stats.days));
  $('btn-stats-csv').disabled = !stats.built;
}

async function loadStats() {
  const g = statsGroup();
  if (!g || stats.loading) return;
  Object.assign(stats, { groupId: g.id, loading: true, error: '' });
  renderStats();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'stats', groupId: g.id, days: stats.days });
    if (r?.status !== 'ok') stats.error = r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn.' : r?.message || 'Có lỗi';
    else {
      stats.raw = r;
      stats.built = BG.buildStats({ ...r, days: stats.days });
      stats.loaded = true;
    }
  } finally {
    stats.loading = false;
    renderStats();
  }
}

const SOURCE_TEXT = {
  members: { official: 'số liệu chính thức của Beincom', history: 'addon tự ghi sau mỗi lần quét', none: 'chưa có' },
  joinLeave: { official: 'số liệu chính thức của Beincom', activity: 'đếm từ nhật ký hoạt động' },
  posts: { official: 'số liệu chính thức của Beincom', timeline: 'đếm bài trên các group bạn quản trị' },
};

function tile(label, value, sub) {
  return el('div', { class: 'stat-tile' }, el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value }), sub ? el('div', { class: 'sub', text: sub }) : null);
}

function renderStats() {
  renderStatsHead();
  renderBest();
  const g = statsGroup();
  const s = stats.built;
  const note = $('stats-note');
  note.classList.toggle('err-text', !!stats.error);
  if (stats.loading) note.textContent = 'Đang tính số liệu… (có thể mất vài chục giây với group đông bài)';
  else if (stats.error) note.textContent = stats.error;
  else if (!g) note.textContent = data.state.snapshot ? 'Không có group nào để thống kê.' : 'Chưa quét lần nào.';
  else if (s) {
    const official = s.sources.members === 'official';
    const parts = [official ? 'Bạn là chủ/admin community nên có số liệu chính thức của Beincom.' : 'Số liệu chính thức chỉ dành cho chủ/admin community — addon tự tính từ dữ liệu bạn xem được.'];
    if (s.sources.members === 'history') parts.push('Số thành viên chỉ có từ những ngày addon đã quét.');
    if (stats.raw?.activityTruncated) parts.push('Nhật ký hoạt động quá dài, mới đếm 300 sự kiện gần nhất.');
    if (stats.raw?.errors?.length) parts.push('Lỗi: ' + stats.raw.errors.join('; '));
    note.textContent = parts.join(' ');
  } else note.textContent = '';

  const tiles = $('stats-tiles');
  tiles.replaceChildren();
  if (s) {
    const fmtN = (n) => (n == null ? '–' : Number(n).toLocaleString('vi-VN'));
    tiles.append(
      tile('Thành viên hiện tại', fmtN(s.totals.members ?? g?.userCount), g?.isCommunity ? 'cả community' : 'trong group'),
      tile(`Vào trong ${stats.days} ngày`, '+' + fmtN(s.totals.joined), SOURCE_TEXT.joinLeave[s.sources.joinLeave]),
      tile(`Rời trong ${stats.days} ngày`, '−' + fmtN(s.totals.left), SOURCE_TEXT.joinLeave[s.sources.joinLeave]),
      tile('Bài mới', fmtN(s.totals.posts), SOURCE_TEXT.posts[s.sources.posts]),
      tile('Cảm xúc', fmtN(s.totals.reactions), `trên ${fmtN(s.totals.scannedPosts)} bài đọc được`),
      tile('Bình luận', fmtN(s.totals.comments), `trên ${fmtN(s.totals.scannedPosts)} bài đọc được`),
    );
  }

  // Biểu đồ chỉ vẽ khi tab đang hiện (cần chiều rộng thật)
  if (currentTab === 'stats') {
    const days = s?.days || BG.dayRange(stats.days);
    const daily = s?.daily || days.map((d) => ({ day: d, members: null, joined: 0, left: 0, posts: 0 }));
    const waiting = stats.loading ? 'Đang tải…' : null;
    Charts.line($('chart-members'), { days, values: daily.map((d) => d.members), label: 'Thành viên', emptyText: waiting || 'Chưa có số liệu thành viên — addon sẽ ghi lại sau mỗi lần quét' });
    Charts.diverging($('chart-joinleave'), { days, up: daily.map((d) => d.joined), down: daily.map((d) => d.left), upLabel: 'Vào', downLabel: 'Rời', emptyText: waiting || 'Không có ai vào hay rời trong khoảng này' });
    Charts.columns($('chart-posts'), { days, values: daily.map((d) => d.posts), label: 'Bài mới', emptyText: waiting || 'Không có bài mới trong khoảng này' });
  }
  $('chart-members-sub').textContent = s ? SOURCE_TEXT.members[s.sources.members] : '';
  $('chart-joinleave-sub').textContent = s ? SOURCE_TEXT.joinLeave[s.sources.joinLeave] : '';
  $('chart-posts-sub').textContent = s ? SOURCE_TEXT.posts[s.sources.posts] : '';

  const tb = $('stats-table-body');
  tb.replaceChildren(
    ...(s?.daily || [])
      .slice()
      .reverse()
      .map((d) => el('tr', {}, el('td', { text: d.day.split('-').reverse().join('/') }), el('td', { class: 'num', text: d.members == null ? '–' : d.members.toLocaleString('vi-VN') }), el('td', { class: 'num', text: String(d.joined) }), el('td', { class: 'num', text: String(d.left) }), el('td', { class: 'num', text: String(d.posts) }))),
  );

  const tp = $('top-posts-body');
  tp.replaceChildren();
  if (!s?.topPosts.length) tp.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 3, text: stats.loading ? 'Đang tải…' : 'Chưa có bài nào' })));
  (s?.topPosts || []).forEach((p, i) =>
    tp.append(
      el(
        'tr',
        {},
        el('td', { class: 'wrap' }, el('span', { class: 'rank', text: `${i + 1}.` }), el('a', { href: BG.postUrl(p), target: '_blank', text: snippet(p) }), el('div', { class: 'muted small', text: ago(p.publishedAt) })),
        el('td', { class: 'num', text: String(p.reactions || 0) }),
        el('td', { class: 'num', text: String(p.commentsCount || 0) }),
      ),
    ),
  );

  const ta = $('top-authors-body');
  ta.replaceChildren();
  if (!s?.topAuthors.length) ta.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: stats.loading ? 'Đang tải…' : 'Chưa có ai đăng bài' })));
  (s?.topAuthors || []).forEach((a, i) =>
    ta.append(el('tr', {}, el('td', {}, el('div', { class: 'user' }, el('span', { class: 'rank', text: `${i + 1}.` }), postAuthor(a.actor))), el('td', { class: 'num', text: String(a.posts) }), el('td', { class: 'num', text: String(a.reactions) }), el('td', { class: 'num', text: String(a.comments) }))),
  );
}

function exportStats() {
  const s = stats.built;
  const g = statsGroup();
  if (!s || !g) return;
  const csv = BG.toCsv(s.daily, [
    { label: 'Ngày', key: 'day' },
    { label: 'Thành viên', get: (d) => d.members ?? '' },
    { label: 'Vào', key: 'joined' },
    { label: 'Rời', key: 'left' },
    { label: 'Bài mới', key: 'posts' },
  ]);
  const slug = BG.norm(g.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group';
  download(`beingroup-thong-ke-${slug}-${stats.days}ngay-${BG.vnDay()}.csv`, csv, 'text/csv;charset=utf-8');
}

$('stats-group').addEventListener('change', (e) => {
  stats.groupId = e.target.value;
  stats.built = null;
  loadStats();
});
onSeg('stats-range', (f) => {
  stats.days = Number(f);
  loadStats();
});
$('btn-stats-csv').addEventListener('click', exportStats);

// ---------- Giờ đăng tốt nhất ----------

const HEAT_DAYS = [1, 2, 3, 4, 5, 6, 0]; // Thứ Hai trước

function bestLabel(c) {
  return `${BG.WEEKDAY_NAMES[c.day]} ${c.hour}:00`;
}

function renderBest() {
  const posts = stats.raw?.posts;
  const map = $('heatmap');
  if (!posts) {
    $('best-note').textContent = stats.loading ? 'Đang tính…' : 'Chọn group rồi bấm Tải lại để xem';
    $('best-top').replaceChildren();
    map.replaceChildren();
    return;
  }
  const b = BG.bestTimes(posts);
  const n = (x) => Math.round(x).toLocaleString('vi-VN');
  $('best-note').textContent = `Theo ${b.total} bài trong ${stats.days} ngày (giờ Việt Nam). Tương tác = cảm xúc + 2 × bình luận.${b.total < 20 ? ' Ít bài nên chỉ để tham khảo.' : ''}`;
  $('best-top').replaceChildren(
    ...(b.top.length ? [el('b', { class: 'small', text: 'Nên đăng:' }), ...b.top.map((c) => el('span', { class: 'best-chip', title: `${c.posts} bài, trung bình ${n(c.avg)} tương tác`, text: bestLabel(c) }))] : [el('span', { class: 'muted small', text: 'Chưa có bài nào trong khoảng này.' })]),
  );
  const picks = new Set(b.top.map((c) => c.day * 24 + c.hour));
  const cells = [el('div')];
  for (let h = 0; h < 24; h++) cells.push(el('div', { class: 'hm-h', text: h % 3 === 0 ? String(h) : '' }));
  for (const d of HEAT_DAYS) {
    cells.push(el('div', { class: 'hm-d', text: BG.WEEKDAYS[d] }));
    for (let h = 0; h < 24; h++) {
      const c = b.grid[d][h];
      const lv = b.max ? Math.round(12 + (78 * c.score) / b.max) : 0;
      cells.push(
        el('div', {
          class: 'hm-c' + (c.posts ? ' has' : '') + (picks.has(d * 24 + h) ? ' pick' : ''),
          style: c.posts ? `--lv: ${lv}%` : null,
          title: c.posts ? `${bestLabel(c)}: ${c.posts} bài, trung bình ${n(c.avg)} tương tác` : `${bestLabel(c)}: chưa có bài`,
        }),
      );
    }
  }
  map.replaceChildren(...cells);
}
