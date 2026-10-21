// Trang Chat — bấm tên người: hồ sơ, vi phạm addon đã ghi, tìm bài, xoá tin của người đó, mở Dọn tài khoản trên Dashboard.
// Bấm chính mình (tên, avatar góc trên ở Silk, dòng tài khoản cuối danh sách): Hồ sơ cá nhân (BG.selfProfile, lib/self.js).

// ---------- Bấm tên người: hồ sơ, vi phạm, xử lý (nối với công cụ quản trị của addon) ----------

const dmWith = (chatId) => (chatId ? [...S.dms, ...S.requests].find((d) => d.other?.chatId === chatId) || null : null);
const svgClose = () => svg('M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4 6.4 5Z');

async function openPerson(u) {
  if (!u || (!u.chatId && !u.id)) return;
  const d = $('person');
  const me = !!u.chatId && u.chatId === S.me?.chatId;
  const name = u.fullname || u.username || 'Người dùng';
  $('pc-head').replaceChildren(
    avatar({ name, chatId: u.chatId, pictureAt: u.pictureAt, size: 'xl' }),
    el('div', { class: 'pc-who' }, el('b', {}, el('span', { class: 'nm' }, name), ...badges(u)), el('span', {}, [u.username ? '@' + u.username : '', u.verified ? (u.subProfile ? 'hồ sơ phụ đã xác minh' : 'đã xác minh') : '', u.premium ? 'Premium' : ''].filter(Boolean).join(' · '))),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Đóng', title: 'Đóng (Esc)', onclick: () => d.close() }, svgClose()),
  );
  const dm = dmWith(u.chatId);
  const body = [
    el(
      'div',
      { class: 'pc-links' },
      u.username ? el('a', { class: 'pc-btn', href: BG.userUrl(u.username), target: '_blank', rel: 'noopener noreferrer' }, 'Trang cá nhân ↗') : null,
      dm && !me
        ? el('button', { type: 'button', class: 'pc-btn', onclick: () => (d.close(), openChat(dm.id)) }, '✉ Nhắn riêng')
        : null,
    ),
  ];
  if (me) {
    const box = el('div', { class: 'pc-self' }, el('div', { class: 'muted' }, 'Đang đọc…'));
    body.push(box);
    readSelf().then((nodes) => box.replaceChildren(...nodes));
  }
  if (!me && u.id) {
    const vio = el('div', { class: 'pc-sec' }, el('h4', {}, 'Hồ sơ vi phạm'), el('div', { class: 'muted' }, 'Đang đọc…'));
    const posts = el('div', { class: 'pc-sec' }, el('h4', {}, 'Bài trong các community bạn quản trị'), el('button', { type: 'button', class: 'pc-btn', onclick: (e) => findPersonPosts(u, posts, e.currentTarget) }, 'Tìm bài của người này'));
    body.push(vio, posts);
    // Tin của người này đang hiện trong kênh: admin kênh xoá một lần (theo Chạy thử, ghi Nhật ký)
    const theirs = [...S.posts.values(), ...(S.thread ? S.thread.posts.values() : [])].filter((p, i, a) => p.user.chatId === u.chatId && !p.deleted && !p.system && a.findIndex((x) => x.id === p.id) === i);
    if (S.sel?.canDelete && S.sel.kind === 'ch' && theirs.length) body.push(el('div', { class: 'pc-sec' }, el('h4', {}, 'Trong kênh ' + chatTitle(S.sel)), el('button', { type: 'button', class: 'pc-btn danger', onclick: () => deleteAllOf(u, theirs) }, `Xoá ${theirs.length} tin của người này đang hiện`)));
    const link = (k) => `dashboard.html#tab=${k === 'cleanup' ? 'content' : 'members'}&${k}=${encodeURIComponent(u.id)}&u=${encodeURIComponent(u.username || '')}&n=${encodeURIComponent(u.fullname || '')}`;
    body.push(el('div', { class: 'pc-actions' }, el('a', { class: 'pc-btn danger', href: link('cleanup'), target: '_blank', title: 'Mở Dashboard: chọn bài / bình luận của người này để ẩn, tuỳ chọn cấm ở các community bạn quản trị' }, '🧹 Dọn tài khoản…'), el('a', { class: 'pc-btn', href: link('profile'), target: '_blank' }, '⚠ Hồ sơ trên Dashboard')));
    readViolations(u.id).then((x) => vio.replaceChildren(el('h4', {}, 'Hồ sơ vi phạm'), ...x));
  } else if (!me) body.push(el('p', { class: 'muted' }, 'Không có mã Beincom của người này nên chưa mở được công cụ quản trị.'));
  $('pc-body').replaceChildren(...body.filter(Boolean));
  if (!d.open) d.showModal();
}

// Hồ sơ cá nhân: tài khoản, quyền quản trị theo cộng đồng, trạng thái addon (cùng nội dung với Dashboard)
async function readSelf() {
  let st = {};
  try {
    st = await chrome.storage.local.get(['state', 'settings']);
  } catch {}
  const p = BG.selfProfile({ me: st.state?.me, chatMe: S.me, groups: st.state?.snapshot?.groups || [], settings: { ...BG.DEFAULT_SETTINGS, ...st.settings }, lastScan: st.state?.lastScan, lastResult: st.state?.lastResult });
  return p.sections.map((s) =>
    el(
      'div',
      { class: 'pc-sec' },
      el('h4', {}, s.title),
      s.note ? el('div', { class: 'muted' }, s.note) : null,
      s.rows.length
        ? el(
            'ul',
            { class: 'pc-rows' },
            s.rows.map((r) =>
              el(
                'li',
                {},
                el('span', { class: 'k' }, r.href ? el('a', { href: r.href, target: '_blank', rel: 'noopener noreferrer' }, r.label) : r.label),
                el('span', { class: 'v' + (r.tone ? ' ' + r.tone : '') }, r.value),
                r.copy ? el('button', { type: 'button', class: 'pc-copy', title: 'Chép ' + r.label, 'aria-label': 'Chép ' + r.label, onclick: () => navigator.clipboard.writeText(r.value).then(() => toast('Đã chép ' + r.label)) }, 'Chép') : null,
              ),
            ),
          )
        : null,
    ),
  );
}

// Dòng tài khoản cuối danh sách (BeinFusion theme): bấm để xem Hồ sơ cá nhân
{
  const foot = $('me');
  Object.assign(foot, { tabIndex: 0, title: 'Hồ sơ cá nhân' });
  foot.setAttribute('role', 'button');
  foot.addEventListener('click', () => S.me && openPerson(S.me));
  foot.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && S.me && (e.preventDefault(), openPerson(S.me)));
}

// Hồ sơ vi phạm addon ghi nhận (Nhật ký, quét): tóm tắt + 3 lần gần nhất
async function readViolations(userId) {
  let p = null;
  try {
    p = (await chrome.storage.local.get('profiles')).profiles?.users?.[userId] || null;
  } catch {}
  if (!p?.events?.length) return [el('div', { class: 'muted' }, 'Chưa ghi nhận vi phạm nào.')];
  const sum = BG.profileSummary(p);
  return [
    el('div', { class: 'pc-vio' + (sum.severe ? ' bad' : '') }, '⚠ ' + BG.profileText(sum)),
    el('ul', { class: 'pc-events' }, p.events.slice(0, 3).map((e) => el('li', {}, el('b', {}, BG.VIOLATION_TYPES[e.type]?.label || e.type), ` · ${e.group || ''} · ${new Date(e.time).toLocaleDateString('vi-VN')}`, e.snippet ? el('span', { class: 'muted' }, ' — ' + String(e.snippet).slice(0, 80)) : null))),
  ];
}

async function findPersonPosts(u, box, btn) {
  btn.disabled = true;
  btn.textContent = 'Đang tìm…';
  const r = await call('userPosts', { userId: u.id });
  if (r.status !== 'ok') {
    btn.disabled = false;
    btn.textContent = 'Tìm bài của người này';
    return box.append(el('div', { class: 'muted' }, 'Không tìm được: ' + (r.message || 'lỗi')));
  }
  const list = (r.posts || []).slice().sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0));
  btn.remove();
  box.append(
    el('div', {}, list.length ? `${list.length} bài còn hiện${r.truncated ? ' (mới xem 200 bài mới nhất mỗi community)' : ''}:` : 'Không có bài nào còn hiện.'),
    el('ul', { class: 'pc-events' }, list.slice(0, 5).map((p) => el('li', {}, el('a', { href: BG.postUrl(p), target: '_blank', rel: 'noopener noreferrer' }, BG.chatPlain(p.title || p.text || '').slice(0, 80) || 'Bài viết'), p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleDateString('vi-VN')}` : ''))),
  );
}

async function deleteAllOf(u, list) {
  const items = list.slice(0, 50);
  const ok = await ask({ title: `Xoá ${items.length} tin của ${u.fullname || u.username}?`, text: 'Các tin đang hiện trong kênh này (và bình luận đang mở) của người này.', note: 'Tin bị xoá với mọi người, không khôi phục được. Theo Chạy thử và được ghi Nhật ký.' });
  if (!ok) return;
  let done = 0;
  let dry = 0;
  let failed = 0;
  for (const p of items) {
    const r = await call('chatDeleteMsg', { postId: p.id, channelId: S.sel.id, own: false, groupName: chatTitle(S.sel), snippet: p.message, user: { id: u.id, username: u.username, fullname: u.fullname } });
    if (r.status !== 'ok' || r.failed) failed++;
    else if (r.dryRun) dry++;
    else {
      done++;
      if (S.posts.has(p.id)) S.posts.set(p.id, { ...S.posts.get(p.id), deleted: true });
      if (S.thread?.posts.has(p.id)) S.thread.posts.set(p.id, { ...S.thread.posts.get(p.id), deleted: true });
    }
    if (r.status === 'error' && /quyền/.test(r.message || '')) break;
  }
  renderMsgs({ scroll: 'keep' });
  renderThread();
  $('person').close();
  toast(dry ? `Chạy thử: đã ghi ${dry} tin vào Nhật ký, chưa xoá trên Beincom.` : `Đã xoá ${done} tin${failed ? `, ${failed} tin lỗi` : ''}.`, failed ? 'err' : '');
}
