// Dashboard — ô hiển thị dùng ở nhiều tab: người dùng, huy hiệu vi phạm, chọn hàng loạt, ô bài viết.

// ---------- Hồ sơ vi phạm: huy hiệu cạnh tên ----------

function profileOf(id) {
  return (data.settings.trackViolations && id && data.profiles?.users?.[id]) || null;
}

// "⚠ 3" cạnh tên người có hồ sơ; đỏ nếu từng bị xoá / cấm. Bấm để mở hồ sơ.
function violationBadge(u) {
  const p = profileOf(u?.id);
  if (!p?.events.length) return null;
  const sum = BG.profileSummary(p);
  return el('button', {
    type: 'button',
    class: 'vio-badge' + (sum.severe ? '' : ' light'),
    title: BG.profileText(sum) + ' — bấm để xem hồ sơ vi phạm',
    'aria-label': 'Hồ sơ vi phạm: ' + BG.profileText(sum),
    text: '⚠ ' + sum.total,
    onclick: (e) => {
      e.stopPropagation();
      openProfile(p.user);
    },
  });
}

function userCell(u) {
  const badges = el(
    'div',
    { class: 'badges' },
    u.isVerified ? el('span', { class: 'tag ok', text: '✓ Xác minh' }) : null,
    u.premium ? el('span', { class: 'tag accent', text: 'Premium' }) : null,
    u.nft ? el('span', { class: 'tag accent', text: 'NFT' }) : null,
    u.isDeactivated ? el('span', { class: 'tag err', text: 'Bị vô hiệu' }) : null,
  );
  return el(
    'div',
    { class: 'user' },
    avatarOf(u),
    el(
      'div',
      {},
      el('div', { class: 'name' }, u.fullname || u.username || '(không tên)', violationBadge(u)),
      u.username ? el('a', { class: 'uname', href: BG.userUrl(u.username), target: '_blank', text: '@' + u.username }) : null,
      badges,
    ),
  );
}

function answersCell(req, g) {
  const answers = BG.answersOf(req, g.questions);
  if (!answers.length) return el('span', { class: 'muted', text: g.settings?.isActiveMembershipQuestions ? '(không có câu trả lời)' : '—' });
  return el(
    'ul',
    { class: 'answers' },
    answers.map((a) =>
      el(
        'li',
        {},
        a.question ? el('div', { class: 'q', text: (a.isRequired ? '* ' : '') + a.question }) : null,
        a.answer.trim()
          ? el('div', { class: 'a', text: a.answer.trim() })
          : el('div', { class: 'a ' + (a.isRequired ? 'missing' : 'muted'), text: a.isRequired ? '(chưa trả lời)' : '(bỏ trống)' }),
      ),
    ),
  );
}

const VERDICT_TAG = { approve: 'ok', review: 'warn', decline: 'err', ok: 'ok', bad: 'err' };

function verdictCell(label, verdict, reasons) {
  return el(
    'td',
    {},
    el('span', { class: 'tag ' + VERDICT_TAG[verdict], text: label }),
    el('ul', { class: 'reasons' }, reasons.map((x) => el('li', { class: x.level, text: x.text }))),
  );
}

// Thanh chọn hàng loạt dùng chung cho ba bảng
function renderBulk({ set, shown, idOf, checkAll, countEl, buttons }) {
  const n = set.size;
  $(countEl).textContent = `Đã chọn ${n}`;
  for (const b of buttons) $(b).disabled = busy || !n;
  const all = $(checkAll);
  all.checked = shown.length > 0 && shown.every((r) => set.has(idOf(r)));
  all.indeterminate = !all.checked && shown.some((r) => set.has(idOf(r)));
  all.disabled = !shown.length;
}

function rowCheckbox(set, id, label, onChange) {
  const cb = el('input', { type: 'checkbox', 'aria-label': 'Chọn ' + label });
  cb.checked = set.has(id);
  cb.addEventListener('change', () => {
    cb.checked ? set.add(id) : set.delete(id);
    onChange();
  });
  return cb;
}

function pruneSelection(set, ids) {
  for (const id of [...set]) if (!ids.has(id)) set.delete(id);
}

// ---------- Ô bài viết ----------

function postAuthor(a) {
  return el(
    'div',
    { class: 'user' },
    avatarOf(a),
    el('div', {}, el('div', { class: 'name' }, a.fullname || a.username || '(không tên)', violationBadge(a)), a.username ? el('a', { class: 'uname', href: BG.userUrl(a.username), target: '_blank', text: '@' + a.username }) : null),
  );
}

function postContent(p) {
  const text = el('div', { class: 'post-text clamp', title: 'Bấm để xem hết / thu gọn', text: p.text || '(không có chữ)' });
  text.addEventListener('click', () => text.classList.toggle('clamp'));
  const meta = el(
    'div',
    { class: 'post-meta' },
    p.type === 'ARTICLE' ? el('span', { class: 'tag accent', text: 'Article' }) : null,
    p.media.images ? el('span', { class: 'tag info', text: `🖼 ${p.media.images} ảnh` }) : null,
    p.media.videos ? el('span', { class: 'tag info', text: `🎬 ${p.media.videos} video` }) : null,
    p.media.files ? el('span', { class: 'tag info', text: `📎 ${p.media.files} tệp` }) : null,
    p.link ? el('a', { class: 'tag info', href: p.link, target: '_blank', rel: 'noreferrer', text: '🔗 ' + (BG.linkDomains(p.link)[0] || 'link') }) : null,
    p.full === false ? el('span', { class: 'tag warn', title: 'Chưa tải được nội dung đầy đủ, quy tắc chỉ xét phần này', text: 'Mới có 500 ký tự đầu' }) : null,
    p.commentsCount ? el('span', { class: 'tag info', text: `💬 ${p.commentsCount}` }) : null,
  );
  return el('div', {}, p.title ? el('div', { class: 'post-title', text: p.title }) : null, text, meta);
}

function postGroups(p, adminIds) {
  return el(
    'ul',
    { class: 'glist' },
    p.groups.map((x) =>
      el('li', {}, x.name || x.id, x.approval === 'WAITING_APPROVAL' ? el('span', { class: 'muted', text: ' · chờ duyệt' }) : null, adminIds && !adminIds.has(x.id) ? el('span', { class: 'muted', text: ' · không quản trị' }) : null),
    ),
  );
}
