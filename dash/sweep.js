// ---------- Tìm & dọn bài ----------
// Tìm trong mọi bài còn hiện của community (API trang Tìm kiếm của Beincom) theo từ khoá / link, chọn từng bài rồi ẩn.
// Ẩn là một chiều (Beincom không có lệnh hiện lại): không chọn sẵn bài nào; bài của mình, của admin và thành viên tin cậy
// được đánh dấu "giữ" và không nằm trong "Chọn tất cả".

const SWEEP_MAX_HIDE = 200;
const sweep = { q: '', groupId: '', days: 30, posts: null, adminIds: [], truncated: false, errors: [], selected: new Set(), loading: false, error: '', limit: 50 };

// Một lựa chọn cho mỗi community có group mình quản trị (ưu tiên group gốc)
function sweepCommunities() {
  const by = new Map();
  for (const g of groups()) {
    if (!g.communityId || g.error) continue;
    const cur = by.get(g.communityId);
    if (!cur || (g.isCommunity && !cur.isCommunity)) by.set(g.communityId, g);
  }
  return [...by.values()].map((g) => ({ id: g.id, name: g.communityName || g.name }));
}

const sweepTrustOf = (actor) => BG.trustReason(actor, data.settings, data.state.postTrust, profileOf(actor?.id));
const sweepRowsNow = () => BG.sweepRows(sweep.posts || [], { meId: data.state.me?.id, adminIds: sweep.adminIds, trustOf: sweepTrustOf });

function renderSweep() {
  const sel = $('sweep-group');
  const coms = sweepCommunities();
  const cur = sel.value || sweep.groupId;
  sel.replaceChildren(el('option', { value: '', text: coms.length > 1 ? 'Mọi community' : coms[0]?.name || 'Chưa có community' }), ...(coms.length > 1 ? coms.map((c) => el('option', { value: c.id, text: c.name })) : []));
  sel.value = coms.some((c) => c.id === cur) ? cur : '';
  sel.hidden = coms.length <= 1;
  $('btn-sweep').disabled = sweep.loading || !coms.length;

  const rows = sweepRowsNow();
  const kept = rows.filter((r) => r.keep).length;
  pruneSelection(sweep.selected, new Set(rows.map((r) => r.p.id)));
  const note = $('sweep-note');
  note.classList.toggle('err-text', !!sweep.error);
  if (sweep.loading) note.textContent = `Đang tìm "${sweep.q}"…`;
  else if (sweep.error) note.textContent = sweep.error;
  else if (!sweep.posts) note.textContent = '';
  else if (!rows.length) note.textContent = `Không có bài nào còn hiện chứa "${sweep.q}".`;
  else
    note.textContent = [
      `Tìm thấy ${rows.length} bài còn hiện chứa "${sweep.q}".`,
      kept ? `${kept} bài của bạn / admin / thành viên tin cậy được giữ (không nằm trong Chọn tất cả).` : '',
      sweep.truncated ? 'Mới xem tối đa 200 bài mới nhất mỗi community — thu hẹp từ khoá hoặc khoảng thời gian để xem hết.' : '',
      sweep.errors?.length ? 'Lỗi: ' + sweep.errors.join('; ') : '',
    ]
      .filter(Boolean)
      .join(' ');

  // Người đăng nhiều bài khớp nhất: dọn cả tài khoản (tìm mọi bài của người đó, tuỳ chọn cấm)
  const authors = BG.sweepAuthors(rows).slice(0, 8);
  $('sweep-authors').replaceChildren(
    ...(authors.length ? [el('span', { class: 'muted small', text: 'Đăng nhiều nhất:' })] : []),
    ...authors.map((a) => el('button', { class: 'ghost sm', disabled: busy, title: 'Dọn tài khoản: tìm mọi bài còn hiện của người này, chọn rồi ẩn (tuỳ chọn cấm)', text: `🧹 ${a.actor.fullname || a.actor.username || '?'} (${a.count})`, onclick: () => cleanupUser(a.actor) })),
  );

  const pickable = rows.filter((r) => !r.keep);
  const shown = rows.slice(0, sweep.limit);
  const bulk = () => {
    renderBulk({ set: sweep.selected, shown: pickable, idOf: (r) => r.p.id, checkAll: 'sweep-check-all', countEl: 'sweep-selected', buttons: ['btn-sweep-hide'] });
    $('btn-sweep-hide').textContent = sweep.selected.size ? `Ẩn ${sweep.selected.size} bài đã chọn` : 'Ẩn đã chọn';
  };
  $('sweep-bar').hidden = !rows.length;
  $('sweep-table').hidden = !rows.length;
  const adminIds = new Set(groups().map((g) => g.id));
  $('sweep-body').replaceChildren(
    ...shown.map(({ p, keep }) =>
      el(
        'tr',
        { class: keep ? 'muted-row' : null },
        el('td', { class: 'cb' }, rowCheckbox(sweep.selected, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor), keep ? el('span', { class: 'tag ok', text: keep }) : null),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p, adminIds)),
        el('td', {}, el('div', { title: fmtTime(p.publishedAt), text: ago(p.publishedAt) }), el('a', { class: 'small', href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' })),
      ),
    ),
  );
  $('btn-sweep-more').hidden = rows.length <= sweep.limit;
  bulk();
}

async function sweepRun(e) {
  e?.preventDefault();
  const q = $('sweep-q').value.trim();
  if (q.length < 2) return toast('Gõ ít nhất 2 ký tự để tìm.', 'warn');
  Object.assign(sweep, { q, groupId: $('sweep-group').value, days: Number($('sweep-days').value) || 0, posts: null, adminIds: [], truncated: false, errors: [], loading: true, error: '', limit: 50 });
  sweep.selected.clear();
  renderSweep();
  try {
    const r = await chrome.runtime.sendMessage({ type: 'sweepSearch', keyword: q, groupId: sweep.groupId, days: sweep.days });
    if (r?.status === 'need_login') sweep.error = 'Phiên đăng nhập Beincom đã hết hạn — hãy đăng nhập lại.';
    else if (r?.status !== 'ok') sweep.error = r?.message || 'Có lỗi khi tìm';
    else Object.assign(sweep, { posts: r.posts || [], adminIds: r.adminIds || [], truncated: !!r.truncated, errors: r.errors || [] });
  } catch (err) {
    sweep.error = 'Có lỗi khi tìm: ' + (err?.message || err);
  } finally {
    sweep.loading = false;
    renderSweep();
  }
}

async function sweepHide() {
  if (busy) return;
  const posts = sweepRowsNow()
    .filter((r) => sweep.selected.has(r.p.id))
    .map((r) => r.p);
  if (!posts.length) return;
  if (posts.length > SWEEP_MAX_HIDE) return toast(`Mỗi lần ẩn tối đa ${SWEEP_MAX_HIDE} bài — hãy bỏ bớt.`, 'warn');
  const reason = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  reason.value = 'SPAM';
  const ok = await confirmDialog({
    title: `Ẩn ${posts.length} bài?`,
    text: `Các bài chứa "${sweep.q}" bạn đã chọn sẽ bị ẩn khỏi các group bạn quản trị.`,
    names: posts.map(snippet),
    okText: 'Ẩn bài',
    danger: true,
    extra: el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), reason),
    sendNote: `Sẽ gửi lên Beincom ngay (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi bài). Bài đã ẩn không hiện lại được — Beincom không có lệnh hiện lại.`,
  });
  if (!ok) return;
  const r = await send({ type: 'hidePosts', posts, reasonType: reason.value }, (n) => `Đã ẩn ${n} bài.`, { chunk: ['posts'] });
  if (r && !r.dryRun && r.hidden?.length) {
    const gone = new Set(r.hidden);
    sweep.posts = (sweep.posts || []).filter((p) => !gone.has(p.id));
    for (const id of gone) sweep.selected.delete(id);
  }
  renderSweep();
}

$('sweep-form').addEventListener('submit', sweepRun);
$('btn-sweep-hide').addEventListener('click', sweepHide);
$('sweep-check-all').addEventListener('change', (e) => {
  for (const r of sweepRowsNow()) if (!r.keep) e.target.checked ? sweep.selected.add(r.p.id) : sweep.selected.delete(r.p.id);
  renderSweep();
});
$('btn-sweep-more').addEventListener('click', () => {
  sweep.limit += 50;
  renderSweep();
});
