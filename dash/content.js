// Dashboard — tab Bài viết: duyệt bài, bài mới đăng, bài đang ghim, cài đặt một bài.

// ---------- Duyệt bài ----------

function approvalGroups() {
  return groups().filter((g) => g.approvalCount != null);
}

function currentCommunity() {
  const gs = approvalGroups();
  return gs.find((g) => g.id === selectedCommunityId) || gs.find((g) => g.approvals?.length) || gs[0] || null;
}

function renderApproval() {
  const gs = approvalGroups();
  const g = currentCommunity();
  const sel = $('community-select');
  sel.replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: `${x.communityName || x.name} (${x.approvalCount || 0})` })));
  sel.disabled = !gs.length;
  const open = $('approval-open');
  open.hidden = !g;
  if (g) open.href = BG.contentApprovalUrl(g.communityId);

  const rows = (g?.approvals || []).map((p) => ({ p, ev: evalPost(p, g) }));
  const counts = { all: rows.length, ok: 0, review: 0, bad: 0 };
  for (const r of rows) counts[r.ev.verdict]++;
  setCounts('acnt', counts);
  setSegActive('approval-filter', approvalFilter);

  const note = $('approval-note');
  note.textContent = '';
  if (!gs.length) note.textContent = data.state.snapshot ? 'Không community nào bạn quản trị group gốc đang bật duyệt bài.' : '';
  else if (g?.approvalError) note.textContent = g.approvalError;
  else if (g && g.approvalCount > rows.length) note.textContent = `Đang hiện ${rows.length}/${g.approvalCount} bài — duyệt bớt rồi quét lại để tải tiếp.`;

  pruneSelection(selectedPosts, new Set(rows.map((r) => r.p.id)));
  const shown = rows.filter((r) => approvalFilter === 'all' || r.ev.verdict === approvalFilter);
  const bulk = () => renderBulk({ set: selectedPosts, shown, idOf: (r) => r.p.id, checkAll: 'approval-check-all', countEl: 'approval-selected', buttons: ['btn-approve-posts', 'btn-reject-posts'] });
  const body = $('approval-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !g ? 'Chưa có dữ liệu' : rows.length ? 'Không có bài nào trong mục này' : 'Không có bài nào đang chờ duyệt 🎉';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p, ev } of shown) {
    body.append(
      el(
        'tr',
        {},
        el('td', { class: 'cb' }, rowCheckbox(selectedPosts, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor), trustTag(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p)),
        el('td', { title: fmtTime(p.submittedAt), text: ago(p.submittedAt) }),
        verdictCell(BG.POST_VERDICT_LABELS.approval[ev.verdict], ev.verdict, ev.reasons),
        el(
          'td',
          { class: 'act' },
          el('button', { class: 'ok-btn sm', disabled: busy, text: 'Duyệt', onclick: () => actApproval('approve', g, [p]) }),
          el('button', { class: 'danger sm', disabled: busy, text: 'Từ chối', onclick: () => actApproval('reject', g, [p]) }),
          isTrustedListed(p.actor) || !p.actor.username ? null : el('button', { class: 'ghost sm', title: 'Thêm vào thành viên tin cậy (tự duyệt bài đạt quy tắc)', text: '⭐', onclick: () => addTrusted(p.actor) }),
        ),
      ),
    );
  }
  bulk();
}

// Thành viên tin cậy (tự duyệt bài): nhãn ⭐ khi người đăng đang được tin cậy, nút ⭐ để thêm vào danh sách
const isTrustedListed = (actor) => (data.settings.trustedMembers || []).some((x) => String(x).toLowerCase() === String(actor?.username || '').toLowerCase());

function trustTag(actor) {
  const why = BG.trustReason(actor, data.settings, data.state.postTrust, profileOf(actor?.id));
  if (!why) return null;
  return el('div', {}, el('span', { class: 'tag ok', title: why + (data.settings.autoApprovePosts ? ' — bài đạt quy tắc sẽ được tự duyệt' : ' — bật Tự duyệt bài ở Cài đặt để tự duyệt'), text: '⭐ Tin cậy' }));
}

async function addTrusted(actor) {
  const list = [...new Set([...(data.settings.trustedMembers || []), String(actor.username).toLowerCase()])];
  await saveSettings({ trustedMembers: list });
  toast(`Đã thêm @${actor.username} vào thành viên tin cậy.${data.settings.autoApprovePosts ? '' : ' Bật "Tự duyệt bài của thành viên tin cậy" ở Cài đặt để addon tự duyệt.'}`);
}

function snippet(p) {
  const t = (p.title || p.text || '').replace(/\s+/g, ' ').trim();
  return `${p.actor.fullname || p.actor.username || '?'}: ${t.length > 70 ? t.slice(0, 70) + '…' : t || '(không có chữ)'}`;
}

async function actApproval(action, g, posts) {
  if (busy || !posts.length) return;
  const reject = action === 'reject';
  let reasonBox = null;
  if (reject) {
    reasonBox = el('textarea', { rows: 3, placeholder: 'Vd: Bài có link quảng cáo, vi phạm nội quy nhóm' });
    // Gợi ý lý do từ quy tắc khi chỉ từ chối một bài
    if (posts.length === 1) {
      const bad = evalPost(posts[0], g).reasons.filter((x) => x.level !== 'ok');
      if (bad.length) reasonBox.value = bad.map((x) => x.text).join('; ');
    }
  }
  const extra = reject ? el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do từ chối' }), el('br'), el('span', { class: 'muted small', text: 'Gửi cho người đăng. Có thể để trống.' })), reasonBox) : null;
  const ok = await confirmDialog({
    title: `${reject ? 'Từ chối' : 'Duyệt'} ${posts.length} bài?`,
    text: 'Community: ' + (g.communityName || g.name),
    names: posts.map(snippet),
    okText: reject ? 'Từ chối' : 'Duyệt',
    danger: reject,
    extra,
  });
  if (!ok) return;
  const r = await send({ type: 'approvalAct', action, groupId: g.id, contentIds: posts.map((p) => p.id), reason: reasonBox?.value || '' }, (n) => `${reject ? 'Đã từ chối' : 'Đã duyệt'} ${n} bài.`, { chunk: ['contentIds'] });
  if (!r?.dryRun) for (const p of posts) selectedPosts.delete(p.id);
  renderApproval();
}

// ---------- Bài mới đăng ----------

function recentRows() {
  const q = $('recent-q').value;
  return (data.state.recentPosts || []).filter((p) => BG.itemMatches(p, q)).map((p) => ({ p, ev: evalPost(p) }));
}

function inFilter(r, f) {
  if (f === 'unanswered') return !r.p.dismissed && BG.isUnanswered(r.p, { meId: data.state.me?.id, minHours: data.settings.unansweredHours });
  if (f === 'hidden') return r.p.isHidden;
  if (f === 'dismissed') return r.p.dismissed && !r.p.isHidden;
  if (f === 'all') return !r.p.isHidden;
  return !r.p.isHidden && !r.p.dismissed && r.ev.verdict !== 'ok'; // flagged
}

function renderRecent() {
  const rows = recentRows();
  setCounts('rcnt', Object.fromEntries(['flagged', 'all', 'unanswered', 'dismissed', 'hidden'].map((f) => [f, rows.filter((r) => inFilter(r, f)).length])));
  setSegActive('recent-filter', recentFilter);
  const adminIds = new Set(groups().map((g) => g.id));

  const note = $('recent-note');
  if (!data.settings.scanPosts) note.textContent = 'Đang tắt "Quét bài mới đăng" ở phần Cài đặt.';
  else if (!data.state.recentPosts) note.textContent = data.state.snapshot ? 'Chưa quét bài mới — bấm Quét ngay.' : '';
  else if (recentFilter === 'unanswered') note.textContent = `Bài đăng đã hơn ${data.settings.unansweredHours} giờ (trong 7 ngày) mà chưa có bình luận nào, theo số bình luận ở lần quét gần nhất (đổi số giờ ở Cài đặt → Theo dõi). Bấm 💬 Bình luận để trả lời ngay.`;
  else note.textContent = 'Xoá bài: chỉ với bài của chính bạn (Beincom không cho admin xoá bài người khác). Ẩn bài: gỡ bài người khác khỏi các group bạn quản trị; không hiện lại được (Beincom không có lệnh hiện lại). Bỏ qua: chỉ ẩn khỏi danh sách này.';

  pruneSelection(selectedRecent, new Set(rows.map((r) => r.p.id)));
  const filtered = rows.filter((r) => inFilter(r, recentFilter));
  const shown = filtered.slice(0, recentLimit);
  const hideable = recentFilter !== 'hidden';
  const bulk = () => renderBulk({ set: selectedRecent, shown, idOf: (r) => r.p.id, checkAll: 'recent-check-all', countEl: 'recent-selected', buttons: hideable ? ['btn-dismiss-posts', 'btn-hide-posts'] : [] });
  $('btn-dismiss-posts').textContent = recentFilter === 'dismissed' ? 'Hiện lại đã chọn' : 'Bỏ qua đã chọn';
  $('btn-hide-posts').hidden = recentFilter === 'hidden';
  $('btn-dismiss-posts').hidden = recentFilter === 'hidden';

  const body = $('recent-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !data.state.recentPosts ? 'Chưa có dữ liệu' : recentFilter === 'flagged' ? 'Không có bài nào cần xử lý 🎉' : recentFilter === 'unanswered' ? 'Bài nào cũng đã có người trả lời 🎉' : 'Không có bài nào trong mục này';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p, ev } of shown) {
    const actions = [el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' })];
    if (!p.isHidden) {
      actions.push(
        p.dismissed
          ? el('button', { class: 'ghost sm', disabled: busy, text: 'Hiện lại', onclick: () => dismissPosts([p], false) })
          : el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => dismissPosts([p], true) }),
        // Beincom chỉ cho xoá bài của chính mình; bài người khác thì admin ẩn khỏi group
        isMine(p)
          ? el('button', { class: 'danger sm', disabled: busy, text: 'Xoá bài', onclick: () => deletePosts([p]) })
          : el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn bài', title: 'Beincom không cho admin xoá bài của người khác; ẩn bài sẽ gỡ bài khỏi các group bạn quản trị', onclick: () => hidePosts([p]) }),
        el(
          'span',
          { class: 'act-break' },
          el('button', { class: 'ghost sm', disabled: busy, text: '💬 Bình luận', title: 'Viết bình luận vào bài (dưới tên tài khoản của bạn)', onclick: () => commentOnPost(p) }),
          el('button', { class: 'ghost sm', disabled: busy, text: '📌 Ghim', title: 'Ghim / bỏ ghim bài ở các group bạn quản trị (tối đa 5 bài mỗi group)', onclick: () => pinPost(p) }),
          el('button', { class: 'ghost sm', disabled: busy, text: '⚙ Cài đặt', title: 'Bật / tắt bình luận, cảm xúc, đánh dấu Quan trọng', onclick: () => settingPost(p) }),
          isMine(p) ? el('button', { class: 'ghost sm', disabled: busy, text: '✎ Sửa', title: 'Sửa nội dung bài đã đăng', onclick: () => editPost(p) }) : null,
        ),
      );
    }
    body.append(
      el(
        'tr',
        { class: p.isHidden || p.dismissed ? 'muted-row' : null },
        el('td', { class: 'cb' }, p.isHidden ? null : rowCheckbox(selectedRecent, p.id, 'bài của ' + (p.actor.fullname || p.actor.username), bulk)),
        el('td', {}, postAuthor(p.actor), p.isHidden ? null : cleanupBtn(p.actor)),
        el('td', {}, postContent(p)),
        el('td', {}, postGroups(p, adminIds)),
        el('td', { title: fmtTime(p.publishedAt), text: ago(p.publishedAt) }),
        p.isHidden ? el('td', {}, el('span', { class: 'tag info', text: 'Đã ẩn' })) : verdictCell(BG.POST_VERDICT_LABELS.published[ev.verdict], ev.verdict, ev.reasons),
        el('td', { class: 'act act-wrap' }, el('div', {}, actions)),
      ),
    );
  }
  $('btn-recent-more').hidden = filtered.length <= recentLimit;
  bulk();
}

function isMine(p) {
  return !!p.actor?.id && p.actor.id === data.state.me?.id;
}

async function deletePosts(posts) {
  if (busy || !posts.length) return;
  const ok = await confirmDialog({
    title: `Xoá ${posts.length} bài của bạn?`,
    text: 'Bài bị xoá vĩnh viễn trên Beincom, ở mọi group bài được đăng vào.',
    names: posts.map(snippet),
    okText: 'Xoá bài',
    danger: true,
    sendNote: 'Sẽ gửi lên Beincom ngay và không hoàn tác được.',
  });
  if (!ok) return;
  const r = await send({ type: 'postAct', action: 'delete', contentIds: posts.map((p) => p.id) }, (n) => `Đã xoá ${n} bài.`, { chunk: ['contentIds'] });
  if (!r?.dryRun) for (const p of posts) selectedRecent.delete(p.id);
  renderRecent();
}

async function dismissPosts(posts, dismiss) {
  if (busy || !posts.length) return;
  await chrome.runtime.sendMessage({ type: 'postAct', action: dismiss ? 'dismiss' : 'undismiss', contentIds: posts.map((p) => p.id) });
  for (const p of posts) selectedRecent.delete(p.id);
  await loadAll();
}

async function hidePosts(posts) {
  if (busy || !posts.length) return;
  const select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  // Chọn sẵn "Spam" khi bài có link bị cấm
  select.value = posts.some((p) => evalPost(p).reasons.some((x) => /link/.test(x.text))) ? 'SPAM' : 'OTHERS';
  const extra = el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select);
  const ok = await confirmDialog({
    title: `Ẩn ${posts.length} bài?`,
    text: 'Bài sẽ bị ẩn khỏi các group bạn quản trị mà bài được đăng vào.',
    names: posts.map(snippet),
    okText: 'Ẩn bài',
    danger: true,
    extra,
    sendNote: 'Sẽ gửi lên Beincom ngay. Bài đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).',
  });
  if (!ok) return;
  const r = await send({ type: 'postAct', action: 'hide', contentIds: posts.map((p) => p.id), reasonType: select.value }, (n) => `Đã ẩn ${n} bài.`, { chunk: ['contentIds'] });
  if (!r?.dryRun) for (const p of posts) selectedRecent.delete(p.id);
  renderRecent();
}

// ---------- Đợt spam ----------

let wavesShowDismissed = false;

function currentWaves() {
  return BG.spamWaves(BG.waveItems(data.state.recentPosts, data.settings.scanComments ? data.state.recentComments : []), {
    allowed: ['beincom.com', ...(data.postRules.allowedDomains || [])],
    skipActorIds: [data.state.me?.id].filter(Boolean),
  });
}

function waveEntries(w) {
  const posts = new Map((data.state.recentPosts || []).map((p) => [p.id, p]));
  const comments = new Map((data.state.recentComments || []).map((c) => [c.id, c]));
  return w.items.map((i) => (i.kind === 'post' ? posts.get(i.id) : comments.get(i.id))).filter(Boolean);
}

function renderWaves() {
  const card = $('waves');
  if (!data.settings.spamWaves || !data.settings.scanPosts) {
    card.hidden = true;
    return;
  }
  const dismissed = new Set(data.state.dismissedWaves || []);
  const all = currentWaves();
  const active = all.filter((w) => !dismissed.has(w.key));
  const shown = wavesShowDismissed ? all : active;
  // Không còn đợt nào đang hoạt động: ẩn cả thẻ (trừ khi đang xem các đợt đã bỏ qua)
  card.hidden = !active.length && !(wavesShowDismissed && all.length);
  $('waves-count').textContent = active.length ? String(active.length) : '';
  const hiddenCount = all.length - active.length;
  $('btn-waves-dismissed').hidden = !hiddenCount;
  $('btn-waves-dismissed').textContent = wavesShowDismissed ? 'Ẩn đợt đã bỏ qua' : `Xem ${hiddenCount} đợt đã bỏ qua`;
  const blocked = data.postRules.blockedDomains || [];
  $('waves-list').replaceChildren(
    ...(shown.length
      ? shown.map((w) => {
          const isDismissed = dismissed.has(w.key);
          const open = w.items.filter((i) => !i.isHidden);
          const posts = w.items.filter((i) => i.kind === 'post').length;
          const comments = w.items.length - posts;
          const hostBlocked = !!w.host && BG.domainIn(w.host, blocked);
          return el(
            'div',
            { class: 'wave' + (isDismissed ? ' dismissed' : '') },
            el(
              'div',
              {},
              el('div', { class: 'wave-title' }, w.type === 'link' ? ['Link ', el('code', { text: w.label })] : ['Nội dung giống nhau: ', el('i', { text: `"${w.label}"` })]),
              el('div', { class: 'wave-meta', text: `${w.accounts.length} tài khoản · ${[posts && posts + ' bài', comments && comments + ' bình luận'].filter(Boolean).join(', ')} · ${fmtTime(w.first)} → ${fmtTime(w.last)}${open.length < w.items.length ? ` · đã ẩn ${w.items.length - open.length}` : ''}` }),
              el('div', { class: 'wave-people' }, w.accounts.slice(0, 8).map((u) => el('span', {}, (u.fullname || u.username || '?') + (u.username ? ' @' + u.username : ''), violationBadge(u))), w.accounts.length > 8 ? el('span', { class: 'muted', text: `… và ${w.accounts.length - 8} người khác` }) : null),
            ),
            el(
              'div',
              { class: 'wave-actions' },
              open.length ? el('button', { class: 'danger sm', disabled: busy, text: `Ẩn cả đợt (${open.length})`, onclick: () => hideWave(w) }) : null,
              w.type === 'link' && !hostBlocked ? el('button', { class: 'ghost sm', disabled: busy, text: `Cấm tên miền ${w.host}`, onclick: () => blockWaveDomain(w) }) : null,
              el('button', { class: 'ghost sm', disabled: busy, text: isDismissed ? 'Hiện lại' : 'Bỏ qua', onclick: () => dismissWave(w, !isDismissed) }),
            ),
          );
        })
      : [el('div', { class: 'muted small', text: 'Không có đợt spam nào đang hiện.' })]),
  );
}

async function hideWave(w) {
  if (busy) return;
  const entries = waveEntries(w).filter((x) => !x.isHidden);
  if (!entries.length) return toast('Đợt này không còn mục nào để ẩn', 'warn');
  const select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  select.value = 'SPAM';
  const ok = await confirmDialog({
    title: `Ẩn ${entries.length} bài / bình luận của đợt spam?`,
    text: w.type === 'link' ? `Cùng link ${w.label}, ${w.accounts.length} tài khoản.` : `Cùng nội dung, ${w.accounts.length} tài khoản.`,
    names: entries.map(snippet),
    okText: 'Ẩn cả đợt',
    danger: true,
    extra: el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select),
    sendNote: `Sẽ gửi lên Beincom ngay${entries.length > 1 ? ` (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi mục)` : ''}. Nội dung đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).`,
  });
  if (!ok) return;
  const ids = (kind) => w.items.filter((i) => i.kind === kind && !i.isHidden).map((i) => i.id);
  await send({ type: 'spamAct', action: 'hide', key: w.key, postIds: ids('post'), commentIds: ids('comment'), reasonType: select.value }, (n) => `Đã ẩn ${n} bài / bình luận.`, { chunk: ['postIds', 'commentIds'] });
}

async function blockWaveDomain(w) {
  if (busy) return;
  const ok = await confirmDialog({
    title: `Thêm ${w.host} vào Tên miền cấm?`,
    text: `Thêm vào quy tắc bài viết chung. Bài và bình luận có link tới ${w.host} (kể cả tên miền con) sẽ bị đánh Vi phạm${data.settings.autoHideSpam ? '; bài / bình luận MỚI sẽ bị tự ẩn ở lần quét sau' : ''}.`,
    okText: 'Cấm tên miền',
    local: true,
    sendNote: 'Chỉ đổi quy tắc trong addon, không gửi gì lên Beincom.',
  });
  if (!ok) return;
  const { postRules } = await chrome.storage.local.get('postRules');
  const cur = { ...BG.DEFAULT_POST_RULES, ...postRules };
  await chrome.storage.local.set({ postRules: { ...cur, blockedDomains: [...new Set([...(cur.blockedDomains || []), w.host])] } });
  toast(`Đã thêm ${w.host} vào Tên miền cấm.`);
}

async function dismissWave(w, dismiss) {
  if (busy) return;
  await chrome.runtime.sendMessage({ type: 'spamAct', action: dismiss ? 'dismiss' : 'undismiss', key: w.key });
  await loadAll();
}

// ---------- Bình luận mới ----------

const COMMENT_PAGE_UI = 30;
let commentFilter = 'flagged';
let commentLimit = COMMENT_PAGE_UI;
const selectedComments = new Set();

function commentRows() {
  const q = $('comment-q').value;
  return (data.state.recentComments || []).filter((c) => BG.itemMatches(c, q)).map((c) => ({ p: c, ev: evalPost(c) }));
}

// ---------- Dọn tài khoản ----------
// Ẩn bài / bình luận còn hiện của một người trong các group mình quản trị, tuỳ chọn cấm ở mọi community.
// Hộp xác nhận liệt kê từng mục có ô tick: bài / bình luận addon đã đọc, rồi tự tìm thêm mọi bài cũ của người đó trong community.
// Ẩn là một chiều (Beincom không có lệnh hiện lại) nên người dùng bỏ tick những mục không muốn ẩn.

const footprintOf = (actor) => BG.userFootprint(actor?.id, data.state.recentPosts, data.state.recentComments);

// Nút nhỏ dưới tên người đăng / người viết: chỉ khi người đó còn bài / bình luận hiện và không phải mình (always: luôn hiện)
function cleanupBtn(actor, { always = false } = {}) {
  if (!actor?.id || actor.id === data.state.me?.id) return null;
  const fp = footprintOf(actor);
  const n = fp.posts.length + fp.comments.length;
  if (!n && !always) return null;
  const title = n ? `Dọn tài khoản: ${fp.posts.length} bài, ${fp.comments.length} bình luận gần đây của người này + tìm bài cũ (chọn từng mục, tuỳ chọn cấm)` : 'Dọn tài khoản: tìm mọi bài còn hiện của người này, chọn rồi ẩn (tuỳ chọn cấm)';
  return el('div', {}, el('button', { class: 'ghost sm cleanup-btn', disabled: busy, title, text: n ? `🧹 Dọn (${n})` : '🧹 Dọn', onclick: () => cleanupUser(actor) }));
}

const clip = (t, n = 90) => {
  const s = String(t || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s || '(không có chữ)';
};

// Danh sách ô tick trong hộp xác nhận: add([{ id, kind: 'post' | 'comment', label, url, old }]), picked(kind)
function pickList(onChange) {
  const box = el('div', { class: 'pick-list' });
  const items = new Map();
  const add = (list) => {
    for (const it of list) {
      if (items.has(it.id)) continue;
      const cb = el('input', { type: 'checkbox', 'aria-label': 'Chọn ' + it.label });
      cb.checked = true;
      cb.addEventListener('change', onChange);
      items.set(it.id, { ...it, cb });
      box.append(
        el(
          'label',
          { class: 'pick' },
          cb,
          el('span', { class: 'tag ' + (it.kind === 'comment' ? 'info' : it.old ? 'warn' : 'accent'), text: it.kind === 'comment' ? 'Bình luận' : it.old ? 'Bài cũ' : 'Bài' }),
          el('span', { class: 'pick-text', text: it.label }),
          it.url ? el('a', { href: it.url, target: '_blank', title: 'Mở trên Beincom', text: '↗' }) : null,
        ),
      );
    }
    onChange();
  };
  const all = () => [...items.values()];
  const setAll = (v) => {
    for (const x of all()) x.cb.checked = v;
    onChange();
  };
  return { box, add, setAll, size: () => items.size, picked: (kind) => all().filter((x) => x.kind === kind && x.cb.checked).map((x) => x.id) };
}

async function cleanupUser(actor) {
  if (busy || !actor?.id) return;
  const fp = footprintOf(actor);
  const targets = BG.banTargets(groups());
  const reason = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  reason.value = 'SPAM';
  const ban = el('input', { type: 'checkbox' });
  const banReason = el('select', { 'aria-label': 'Lý do cấm' }, Object.entries(BG.BAN_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  banReason.value = 'SPAM';
  const count = el('span', { class: 'muted small' });
  const list = pickList(() => {
    count.textContent = `Đã chọn ${list.picked('post').length + list.picked('comment').length}/${list.size()}`;
  });
  list.add([
    ...fp.posts.map((p) => ({ id: p.id, kind: 'post', label: clip(p.title || p.text), url: BG.postUrl(p) })),
    ...fp.comments.map((c) => ({ id: c.id, kind: 'comment', label: clip(c.text), url: BG.postUrl({ id: c.postId, type: c.postType }) })),
  ]);
  // Tìm mọi bài còn hiện của người này trong các community mình quản trị (chỉ đọc), thêm vào danh sách khi có kết quả
  let found = [];
  const status = el('div', { class: 'muted small', text: 'Đang tìm các bài cũ hơn của người này trong community…' });
  chrome.runtime.sendMessage({ type: 'userPosts', userId: actor.id }).then(
    (r) => {
      if (r?.status !== 'ok') return (status.textContent = 'Không tìm được bài cũ: ' + (r?.message || 'lỗi'));
      const known = new Set(fp.posts.map((p) => p.id));
      found = (r.posts || []).filter((p) => !known.has(p.id));
      list.add(found.map((p) => ({ id: p.id, kind: 'post', old: true, label: `${clip(p.title || p.text)} · ${fmtTime(p.publishedAt)}`, url: BG.postUrl(p) })));
      status.textContent = (found.length ? `Tìm thêm ${found.length} bài cũ còn hiện.` : 'Không có bài cũ nào khác còn hiện.') + (r.truncated ? ' Mới xem 200 bài mới nhất mỗi community — dọn xong mở lại để tìm tiếp.' : '');
    },
    () => (status.textContent = 'Không tìm được bài cũ.'),
  );
  const ok = await confirmDialog({
    title: `Dọn tài khoản ${personName(actor)}?`,
    text: 'Ẩn các bài / bình luận đã chọn của người này trong các group bạn quản trị. Bỏ tick những mục không muốn ẩn.',
    okText: 'Dọn',
    danger: true,
    extra: el(
      'div',
      {},
      el('div', { class: 'pick-tools' }, count, el('button', { type: 'button', class: 'ghost sm', text: 'Chọn hết', onclick: () => list.setAll(true) }), el('button', { type: 'button', class: 'ghost sm', text: 'Bỏ chọn hết', onclick: () => list.setAll(false) })),
      list.box,
      status,
      el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), reason),
      targets.length
        ? el('label', { class: 'check' }, ban, el('span', {}, ` Cấm luôn ở ${targets.length} community bạn là chủ / admin `), banReason)
        : el('div', { class: 'muted small', text: 'Bạn không là chủ / admin community nào nên không cấm được.' }),
    ),
    sendNote: `Sẽ gửi lên Beincom ngay (nghỉ ${data.settings.actionDelaySec} giây giữa mỗi thao tác). Bài đã ẩn không hiện lại được — Beincom không có lệnh hiện lại.`,
  });
  if (!ok) return;
  const postIds = list.picked('post');
  const commentIds = list.picked('comment');
  if (!postIds.length && !commentIds.length && !ban.checked) return toast('Chưa chọn bài / bình luận nào để ẩn.', 'warn');
  // Nhiều mục thì chia đợt: mỗi đợt gửi kèm bài cũ của đợt đó, cấm (nếu chọn) ở đợt cuối
  await send(
    { type: 'cleanupUser', user: { id: actor.id, username: actor.username, fullname: actor.fullname }, reasonType: reason.value, ban: ban.checked, banReason: banReason.value, posts: [], postIds, commentIds },
    () => 'Đã dọn tài khoản.',
    { chunk: ['postIds', 'commentIds'], last: (m, isLast) => ({ ...m, posts: found.filter((p) => m.postIds.includes(p.id)), ban: isLast && m.ban }) },
  );
}

function commentContent(c) {
  const extra = [c.images && `${c.images} ảnh`, c.giphy && 'ảnh GIF', c.totalReply && `${c.totalReply} trả lời`].filter(Boolean).join(' · ');
  return el(
    'div',
    {},
    c.parentId ? el('span', { class: 'tag info', text: '↳ trả lời' }) : null,
    el('div', { class: 'cmt-text', text: c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text || '(không có chữ)' }),
    extra ? el('div', { class: 'muted small', text: extra }) : null,
  );
}

function renderComments() {
  const rows = commentRows();
  setCounts('ccnt', Object.fromEntries(['flagged', 'all', 'dismissed', 'hidden'].map((f) => [f, rows.filter((r) => inFilter(r, f)).length])));
  setSegActive('comment-filter', commentFilter);

  const note = $('comments-note');
  if (!data.settings.scanPosts || !data.settings.scanComments) note.textContent = 'Đang tắt "Quét bình luận mới" (hoặc "Quét bài mới đăng") ở phần Cài đặt.';
  else if (!data.state.recentComments) note.textContent = data.state.snapshot ? 'Chưa đọc bình luận — bấm Quét ngay.' : '';
  else note.textContent = 'Mỗi lần quét đọc bình luận mới nhất của tối đa 8 bài có bình luận mới. Ẩn bình luận: như nút Ẩn trên web Beincom. Bỏ qua: chỉ ẩn khỏi danh sách này.';

  pruneSelection(selectedComments, new Set(rows.map((r) => r.p.id)));
  const filtered = rows.filter((r) => inFilter(r, commentFilter));
  const shown = filtered.slice(0, commentLimit);
  const hideable = commentFilter !== 'hidden';
  const bulk = () => renderBulk({ set: selectedComments, shown, idOf: (r) => r.p.id, checkAll: 'comments-check-all', countEl: 'comments-selected', buttons: hideable ? ['btn-dismiss-comments', 'btn-hide-comments'] : [] });
  $('btn-dismiss-comments').textContent = commentFilter === 'dismissed' ? 'Hiện lại đã chọn' : 'Bỏ qua đã chọn';
  $('btn-hide-comments').hidden = !hideable;
  $('btn-dismiss-comments').hidden = !hideable;

  const body = $('comments-body');
  body.replaceChildren();
  if (!shown.length) {
    const msg = !data.state.recentComments ? 'Chưa có dữ liệu' : commentFilter === 'flagged' ? 'Không có bình luận nào cần xử lý 🎉' : 'Không có bình luận nào trong mục này';
    body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 7, text: msg })));
  }
  for (const { p: c, ev } of shown) {
    const actions = [el('a', { href: BG.commentUrl(c), target: '_blank', text: 'Mở ↗' })];
    if (!c.isHidden) {
      actions.push(
        c.dismissed
          ? el('button', { class: 'ghost sm', disabled: busy, text: 'Hiện lại', onclick: () => dismissComments([c], false) })
          : el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ qua', onclick: () => dismissComments([c], true) }),
        el('button', { class: 'ghost sm', disabled: busy, text: 'Trả lời', onclick: () => replyComment(c) }),
        el('button', { class: 'danger sm', disabled: busy, text: 'Ẩn', onclick: () => hideComments([c]) }),
      );
    }
    body.append(
      el(
        'tr',
        { class: c.isHidden || c.dismissed ? 'muted-row' : null },
        el('td', { class: 'cb' }, c.isHidden ? null : rowCheckbox(selectedComments, c.id, 'bình luận của ' + (c.actor.fullname || c.actor.username), bulk)),
        el('td', {}, postAuthor(c.actor), c.isHidden ? null : cleanupBtn(c.actor)),
        el('td', {}, commentContent(c)),
        el('td', {}, el('div', { class: 'cmt-post' }, el('a', { href: BG.postUrl({ id: c.postId, type: c.postType }), target: '_blank', text: c.postSnippet || 'Mở bài' })), el('div', { class: 'muted small', text: (c.groups || []).map((g) => g.name).join(', ') })),
        el('td', { title: fmtTime(c.createdAt), text: ago(c.createdAt) }),
        c.isHidden ? el('td', {}, el('span', { class: 'tag info', text: 'Đã ẩn' })) : verdictCell(BG.POST_VERDICT_LABELS.published[ev.verdict], ev.verdict, ev.reasons),
        el('td', { class: 'act act-wrap' }, el('div', {}, actions)),
      ),
    );
  }
  $('btn-comments-more').hidden = filtered.length <= commentLimit;
  bulk();
}

// ---------- Viết bình luận / trả lời ----------

// Người có thể được @ trong bài: người đăng bài và những người đã bình luận
function peopleOfPost(postId) {
  const post = (data.state.recentPosts || []).find((p) => p.id === postId);
  const all = [post?.actor, ...(data.state.recentComments || []).filter((c) => c.postId === postId).map((c) => c.actor)];
  return [...new Map(all.filter((u) => u?.id && u.username).map((u) => [u.id, u])).values()];
}

async function writeComment({ title, target, postId, commentId = '', prefill = '' }) {
  if (busy) return;
  const box = el('textarea', { rows: 4, placeholder: 'Nội dung…' });
  box.value = prefill;
  const extra = el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Nội dung' }), el('br'), el('span', { class: 'muted small', text: 'Gõ @username để nhắc tên người đăng bài hoặc người đã bình luận trong bài.' })), box);
  setTimeout(() => {
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, 50);
  const ok = await confirmDialog({
    title,
    text: '',
    names: [target],
    okText: commentId ? 'Gửi trả lời' : 'Gửi bình luận',
    extra,
    sendNote: 'Sẽ đăng lên Beincom ngay, dưới tên tài khoản của bạn.',
  });
  if (!ok) return;
  const err = BG.validateComment(box.value);
  if (err) return toast(err, 'err');
  const mentions = BG.commentMentions(box.value, peopleOfPost(postId));
  await send({ type: 'commentWrite', postId, commentId, content: box.value, mentions }, () => (commentId ? 'Đã gửi trả lời.' : 'Đã gửi bình luận.'));
}

function replyComment(c) {
  const t = BG.replyTarget(c);
  return writeComment({ title: 'Trả lời bình luận', target: snippet(c), postId: c.postId, commentId: t.commentId, prefill: t.prefill });
}

function commentOnPost(p) {
  return writeComment({ title: 'Bình luận vào bài', target: snippet(p), postId: p.id });
}

async function dismissComments(list, dismiss) {
  if (busy || !list.length) return;
  await chrome.runtime.sendMessage({ type: 'commentAct', action: dismiss ? 'dismiss' : 'undismiss', commentIds: list.map((c) => c.id) });
  for (const c of list) selectedComments.delete(c.id);
  await loadAll();
}

async function hideComments(list) {
  if (busy || !list.length) return;
  const select = el('select', {}, Object.entries(BG.HIDE_REASONS).map(([k, label]) => el('option', { value: k, text: label })));
  select.value = list.some((c) => evalPost(c).reasons.some((x) => /link/.test(x.text))) ? 'SPAM' : 'OTHERS';
  const extra = el('label', { class: 'text-row' }, el('span', {}, el('b', { text: 'Lý do ẩn' })), select);
  const ok = await confirmDialog({
    title: `Ẩn ${list.length} bình luận?`,
    text: 'Bình luận bị ẩn khỏi bài trên Beincom (như nút Ẩn của admin trên web).',
    names: list.map(snippet),
    okText: 'Ẩn bình luận',
    danger: true,
    extra,
    sendNote: 'Sẽ gửi lên Beincom ngay. Bình luận đã ẩn không hiện lại được (Beincom không có lệnh hiện lại).',
  });
  if (!ok) return;
  const r = await send({ type: 'commentAct', action: 'hide', commentIds: list.map((c) => c.id), reasonType: select.value }, (n) => `Đã ẩn ${n} bình luận.`, { chunk: ['commentIds'] });
  if (!r?.dryRun) for (const c of list) selectedComments.delete(c.id);
  renderComments();
}

// ---------- Bài đang ghim ----------

const pins = { groupId: null, data: {}, loading: false, error: '' };

function pinGroups() {
  return groups().filter((g) => !g.error);
}

function pinGroup() {
  const gs = pinGroups();
  return gs.find((g) => g.id === pins.groupId) || gs[0] || null;
}

// Đọc bài đang ghim của các group; trả về { groupId: [bài] }
async function fetchPinned(ids) {
  const r = await chrome.runtime.sendMessage({ type: 'pinned', groupIds: ids });
  if (r?.status !== 'ok') throw new Error(r?.status === 'need_login' ? 'Phiên đăng nhập Beincom đã hết hạn' : r?.message || 'Có lỗi');
  Object.assign(pins.data, r.pinned);
  return r.pinned;
}

async function loadPinned() {
  const g = pinGroup();
  if (!g || pins.loading) return;
  pins.groupId = g.id;
  pins.loading = true;
  pins.error = '';
  renderPinned();
  try {
    await fetchPinned([g.id]);
  } catch (e) {
    pins.error = e.message;
  } finally {
    pins.loading = false;
    renderPinned();
  }
}

function renderPinned() {
  const gs = pinGroups();
  const g = pinGroup();
  $('pinned-group').replaceChildren(...gs.map((x) => el('option', { value: x.id, selected: x.id === g?.id, text: BG.groupIndent(x) + x.name })));
  $('pinned-group').disabled = !gs.length || pins.loading;
  const list = g ? pins.data[g.id] : null;
  $('pinned-count').textContent = list ? `${list.length}/${BG.PIN_MAX} bài` : '';
  const note = $('pinned-note');
  note.classList.toggle('err-text', !!pins.error);
  note.textContent = pins.error || (pins.loading ? 'Đang tải…' : list && list.length >= BG.PIN_MAX ? `Đã ghim đủ ${BG.PIN_MAX} bài — muốn ghim bài khác thì bỏ ghim bớt.` : 'Ghim bài: bấm "📌 Ghim" ở bài trong danh sách Bài mới đăng.');
  const body = $('pinned-body');
  body.replaceChildren();
  if (!list?.length) body.append(el('tr', { class: 'empty-row' }, el('td', { colspan: 4, text: pins.loading ? 'Đang tải…' : list ? 'Group chưa ghim bài nào' : 'Bấm "Tải lại" để xem' })));
  for (const p of list || []) {
    body.append(
      el(
        'tr',
        {},
        el('td', {}, postAuthor(p.actor)),
        el('td', {}, postContent(p)),
        el('td', { title: fmtTime(p.publishedAt), text: ago(p.publishedAt) }),
        el('td', { class: 'act' }, el('a', { href: BG.postUrl(p), target: '_blank', text: 'Mở ↗' }), el('button', { class: 'ghost sm', disabled: busy, text: 'Bỏ ghim', onclick: () => unpinPost(p, g) })),
      ),
    );
  }
}

async function unpinPost(p, g) {
  const ok = await confirmDialog({ title: 'Bỏ ghim bài này?', text: 'Group: ' + g.name, names: [snippet(p)], okText: 'Bỏ ghim' });
  if (!ok) return;
  const r = await send({ type: 'pinAct', contentId: p.id, unpin: [g.id], snippet: snippet(p), actor: p.actor }, () => 'Đã bỏ ghim.');
  if (r?.status === 'ok' && !r.dryRun) await fetchPinned([g.id]).catch(() => {});
  renderPinned();
}

// Ghim / bỏ ghim một bài: chọn các group (bạn quản trị) bài được đăng vào
async function pinPost(p) {
  const admin = new Set(groups().map((g) => g.id));
  const ids = [...new Set([...p.groups.map((x) => x.id), ...(p.seenIn || [])])].filter((id) => admin.has(id));
  if (!ids.length) return toast('Bài không thuộc group nào bạn quản trị', 'err');
  let current;
  try {
    current = await fetchPinned(ids);
  } catch (e) {
    return toast(e.message, 'err');
  }
  const was = new Set(ids.filter((id) => (current[id] || []).some((x) => x.id === p.id)));
  const boxes = ids.map((id) => {
    const g = groups().find((x) => x.id === id);
    const n = (current[id] || []).length;
    const full = n >= BG.PIN_MAX && !was.has(id);
    const cb = el('input', { type: 'checkbox', checked: was.has(id), disabled: full });
    return { id, cb, row: el('label', { title: full ? `Đã ghim đủ ${BG.PIN_MAX} bài` : '' }, cb, el('span', { text: `${g?.name || id} — đang ghim ${n}/${BG.PIN_MAX}` + (full ? ' (đủ)' : '') })) };
  });
  const ok = await confirmDialog({
    title: 'Ghim / bỏ ghim bài',
    text: 'Chọn group muốn ghim bài này; bỏ chọn để bỏ ghim.',
    names: [snippet(p)],
    okText: 'Lưu',
    extra: el('div', { class: 'pin-choices' }, boxes.map((b) => b.row)),
  });
  if (!ok) return;
  const pin = boxes.filter((b) => b.cb.checked && !was.has(b.id)).map((b) => b.id);
  const unpin = boxes.filter((b) => !b.cb.checked && was.has(b.id)).map((b) => b.id);
  if (!pin.length && !unpin.length) return toast('Không có thay đổi');
  const r = await send({ type: 'pinAct', contentId: p.id, pin, unpin, snippet: snippet(p), actor: p.actor }, () => [pin.length ? `Đã ghim ở ${pin.length} group` : '', unpin.length ? `bỏ ghim ở ${unpin.length} group` : ''].filter(Boolean).join(', ') + '.');
  if (r?.status === 'ok' && !r.dryRun) await fetchPinned(ids).catch(() => {});
  renderPinned();
}

// ---------- Cài đặt một bài ----------

// Ô chọn cài đặt: dùng cho hộp Cài đặt bài; trả về { el, read() }
function settingForm(s) {
  const comment = el('input', { type: 'checkbox', checked: s.canComment !== false });
  const react = el('input', { type: 'checkbox', checked: s.canReact !== false });
  const important = el('input', { type: 'checkbox', checked: !!s.isImportant });
  const preset = el('select', { 'aria-label': 'Hết Quan trọng sau' }, Object.entries(BG.IMPORTANT_FOR).map(([v, label]) => el('option', { value: v, text: label })));
  const until = el('input', { type: 'datetime-local', 'aria-label': 'Quan trọng đến lúc' });
  preset.value = s.isImportant ? (s.importantExpiredAt ? 'custom' : 'never') : '1w';
  if (s.importantExpiredAt) until.value = toLocalInput(new Date(s.importantExpiredAt));
  const sync = () => {
    preset.disabled = !important.checked;
    until.hidden = !important.checked || preset.value !== 'custom';
  };
  important.addEventListener('change', sync);
  preset.addEventListener('change', sync);
  sync();
  return {
    el: el(
      'div',
      { class: 'setting-form' },
      el('label', { class: 'check' }, comment, ' Cho bình luận'),
      el('label', { class: 'check' }, react, ' Cho thả cảm xúc'),
      el('div', { class: 'row' }, el('label', { class: 'check' }, important, ' Đánh dấu Quan trọng'), preset, until),
    ),
    read: () => ({
      canComment: comment.checked,
      canReact: react.checked,
      isImportant: important.checked,
      importantExpiredAt: !important.checked ? null : preset.value === 'custom' ? (until.value ? new Date(until.value).toISOString() : null) : BG.importantUntil(preset.value, new Date()),
    }),
  };
}

async function settingPost(p) {
  const d = await chrome.runtime.sendMessage({ type: 'postDetail', id: p.id, any: true });
  if (d?.status !== 'ok') return toast(d?.message || 'Không đọc được bài', 'err');
  const form = settingForm(d.post.setting);
  const ok = await confirmDialog({ title: 'Cài đặt bài', text: 'Áp dụng cho bài ở mọi group bài được đăng.', names: [snippet(p)], okText: 'Lưu cài đặt', extra: form.el });
  if (!ok) return;
  await send({ type: 'postSetting', id: p.id, setting: form.read(), snippet: snippet(p), groupName: p.groups.map((g) => g.name).join(', '), actor: p.actor }, () => 'Đã lưu cài đặt bài.');
}

// ---------- Sự kiện ----------

$('community-select').addEventListener('change', (e) => {
  selectedCommunityId = e.target.value;
  selectedPosts.clear();
  renderApproval();
});
onSeg('approval-filter', (f) => {
  approvalFilter = f;
  renderApproval();
});
$('approval-check-all').addEventListener('change', (e) => {
  const g = currentCommunity();
  for (const p of g?.approvals || []) {
    if (approvalFilter !== 'all' && evalPost(p, g).verdict !== approvalFilter) continue;
    e.target.checked ? selectedPosts.add(p.id) : selectedPosts.delete(p.id);
  }
  renderApproval();
});
for (const [btn, action] of [['btn-approve-posts', 'approve'], ['btn-reject-posts', 'reject']]) {
  $(btn).addEventListener('click', () => {
    const g = currentCommunity();
    if (g) actApproval(action, g, g.approvals.filter((p) => selectedPosts.has(p.id)));
  });
}

$('pinned-group').addEventListener('change', (e) => {
  pins.groupId = e.target.value;
  pins.error = '';
  if (!pins.data[pins.groupId]) loadPinned();
  else renderPinned();
});
onSeg('recent-filter', (f) => {
  recentFilter = f;
  recentLimit = RECENT_PAGE;
  selectedRecent.clear();
  renderRecent();
});
$('recent-check-all').addEventListener('change', (e) => {
  for (const r of recentRows().filter((r) => inFilter(r, recentFilter)).slice(0, recentLimit)) e.target.checked ? selectedRecent.add(r.p.id) : selectedRecent.delete(r.p.id);
  renderRecent();
});
const pickedRecent = () => (data.state.recentPosts || []).filter((p) => selectedRecent.has(p.id));
$('btn-dismiss-posts').addEventListener('click', () => dismissPosts(pickedRecent(), recentFilter !== 'dismissed'));
$('btn-hide-posts').addEventListener('click', () => hidePosts(pickedRecent()));
$('btn-waves-dismissed').addEventListener('click', () => {
  wavesShowDismissed = !wavesShowDismissed;
  renderWaves();
});
onSeg('comment-filter', (f) => {
  commentFilter = f;
  commentLimit = COMMENT_PAGE_UI;
  selectedComments.clear();
  renderComments();
});
$('comments-check-all').addEventListener('change', (e) => {
  for (const r of commentRows().filter((r) => inFilter(r, commentFilter)).slice(0, commentLimit)) e.target.checked ? selectedComments.add(r.p.id) : selectedComments.delete(r.p.id);
  renderComments();
});
const pickedComments = () => (data.state.recentComments || []).filter((c) => selectedComments.has(c.id));
$('btn-dismiss-comments').addEventListener('click', () => dismissComments(pickedComments(), commentFilter !== 'dismissed'));
$('btn-hide-comments').addEventListener('click', () => hideComments(pickedComments()));
$('btn-comments-more').addEventListener('click', () => {
  commentLimit += COMMENT_PAGE_UI;
  renderComments();
});
$('btn-recent-more').addEventListener('click', () => {
  recentLimit += RECENT_PAGE;
  renderRecent();
});

// Ô lọc: @tên, #TAG, chữ (lọc rồi "Chọn tất cả đang hiện" để xử lý cả loạt)
$('recent-q').addEventListener('input', () => renderRecent());
$('comment-q').addEventListener('input', () => renderComments());
