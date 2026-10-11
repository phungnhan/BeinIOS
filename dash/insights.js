// Dashboard — tab Thống kê: Hiệu quả bài đã đăng qua addon (số liệu sau 24 giờ, 7 ngày và hiện tại; giờ đăng hiệu quả
// theo chính bài của mình). Số liệu do service worker đọc (bg/insights.js), lưu ở khoá `postStats`.

let insightsSort = 'new';

function metricsCell(m, label) {
  if (!m) return el('td', { class: 'muted small', title: 'Chưa tới mốc đo', text: '–' });
  const n = (x) => (x == null ? '–' : Number(x).toLocaleString('vi-VN'));
  return el(
    'td',
    { class: 'ins-m', title: `${label}: đo lúc ${fmtTime(m.at)}${m.ageH != null ? ` (bài đăng được ${m.ageH} giờ)` : ''}` },
    el('span', { title: 'Lượt xem', text: '👁 ' + n(m.views) }),
    el('span', { title: 'Cảm xúc', text: '❤ ' + n(m.reactions) }),
    el('span', { title: 'Bình luận', text: '💬 ' + n(m.comments) }),
  );
}

function renderInsights() {
  const map = data.postStats || {};
  const sum = BG.insightsSummary(map);
  const best = (e) => e.d7 || e.d1 || e.cur || null;
  const f1 = (x) => (x == null ? '–' : (Math.round(x * 10) / 10).toLocaleString('vi-VN'));
  setSegActive('ins-sort', insightsSort);
  $('ins-note').textContent = !sum.tracked
    ? 'Chưa có bài nào đăng qua addon. Bài và Article đăng / hẹn giờ ở tab Đăng bài (cả bài định kỳ, nhập CSV) sẽ được đo lượt xem, cảm xúc, bình luận sau 24 giờ và sau 7 ngày (tự động ở các lần quét).'
    : `Theo dõi ${sum.tracked} bài, ${sum.measured} bài đã có số liệu. Trung bình mỗi bài (sau 7 ngày, chưa đủ thì lấy mốc gần nhất): 👁 ${f1(sum.avg.views)} · ❤ ${f1(sum.avg.reactions)} · 💬 ${f1(sum.avg.comments)}. Điểm = cảm xúc + 2 × bình luận.`;
  const top = sum.times?.top || [];
  $('ins-best').replaceChildren(
    ...(top.length
      ? [el('b', { class: 'small', text: 'Giờ đăng hiệu quả theo bài của bạn:' }), ...top.map((c) => el('span', { class: 'best-chip', title: `${c.posts} bài, trung bình ${Math.round(c.avg)} điểm`, text: `${BG.WEEKDAY_NAMES[c.day]} ${c.hour}:00` }))]
      : sum.measured
        ? [el('span', { class: 'muted small', text: 'Cần ít nhất 3 bài có số liệu để gợi ý giờ đăng theo bài của bạn.' })]
        : []),
  );
  const list = Object.values(map).filter((e) => !e.gone);
  const when = (e) => Date.parse(e.publishedAt || e.publishAt) || 0;
  list.sort(insightsSort === 'score' ? (a, b) => (BG.statScore(best(b)) ?? -1) - (BG.statScore(best(a)) ?? -1) || when(b) - when(a) : (a, b) => when(b) - when(a));
  const body = $('ins-body');
  body.replaceChildren();
  if (!list.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: 'Chưa có bài nào' })));
  const now = Date.now();
  for (const e of list.slice(0, 100)) {
    const waiting = !e.publishedAt && when(e) > now;
    const score = BG.statScore(best(e));
    body.append(
      el(
        'tr',
        {},
        el(
          'td',
          { class: 'ins-post' },
          e.type === 'ARTICLE' ? el('span', { class: 'tag info', text: 'Article' }) : null,
          el('a', { href: BG.postUrl({ id: e.id, type: e.type }), target: '_blank', text: (e.snippet || '').replace(/^\[Article\]\s*/, '').slice(0, 90) || '(không có chữ)' }),
        ),
        el('td', { class: 'nowrap' }, el('div', { text: fmtTime(e.publishedAt || e.publishAt) }), waiting ? el('span', { class: 'tag info', text: 'Chờ tới giờ đăng' }) : null),
        el('td', { class: 'small', text: e.groupName || '' }),
        metricsCell(e.d1, 'Sau 24 giờ'),
        metricsCell(e.d7, 'Sau 7 ngày'),
        metricsCell(e.cur, 'Hiện tại'),
        el('td', { class: 'num' }, score == null ? el('span', { class: 'muted', text: '–' }) : el('b', { text: score.toLocaleString('vi-VN') })),
      ),
    );
  }
}

onSeg('ins-sort', (f) => {
  insightsSort = f;
  renderInsights();
});

$('btn-ins-refresh').addEventListener('click', async () => {
  const b = $('btn-ins-refresh');
  b.disabled = true;
  b.textContent = 'Đang đọc…';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'postStatsRefresh' });
    if (r?.status === 'need_login') toast('Phiên đăng nhập Beincom đã hết hạn', 'err');
    else if (r?.status !== 'ok') toast(r?.message || 'Không đọc được số liệu', 'err');
    else toast(r.measured ? `Đã cập nhật số liệu ${r.measured} bài.` : 'Chưa có bài nào đã đăng để đọc số liệu.');
  } finally {
    b.disabled = false;
    b.textContent = '↻ Cập nhật số liệu';
  }
});
