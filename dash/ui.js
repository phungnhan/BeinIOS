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

// Tên người: có mã Beincom thì bấm để mở cửa sổ Hồ sơ (dash/person.js)
function nameBtn(u) {
  const name = u.fullname || u.username || '(không tên)';
  if (!u.id) return name;
  return el('button', {
    type: 'button',
    class: 'name-btn',
    title: 'Xem hồ sơ',
    text: name,
    onclick: (e) => {
      e.stopPropagation();
      openProfile(u);
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
      el('div', { class: 'name' }, nameBtn(u), violationBadge(u)),
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
    el('div', {}, el('div', { class: 'name' }, nameBtn(a), violationBadge(a)), a.username ? el('a', { class: 'uname', href: BG.userUrl(a.username), target: '_blank', text: '@' + a.username }) : null),
  );
}

// Article hiện như thẻ trên web: ảnh bìa, tiêu đề, tóm tắt, số phút đọc, tag; nội dung (chữ thường) thu gọn bên dưới
function postContent(p) {
  const art = p.type === 'ARTICLE';
  const body = art ? BG.articlePlain(p.text) : p.text; // bài đã lưu từ bản cũ còn là JSON
  const text = el('div', { class: 'post-text clamp' + (art ? ' art-body' : ''), title: 'Bấm để xem hết / thu gọn', text: body || (art ? '' : '(không có chữ)') });
  text.addEventListener('click', () => text.classList.toggle('clamp'));
  const meta = el(
    'div',
    { class: 'post-meta' },
    art ? el('span', { class: 'tag accent', text: 'Article' }) : null,
    art && p.readMin ? el('span', { class: 'tag info', text: `⏱ ${p.readMin} phút đọc` }) : null,
    ...(p.tags || []).slice(0, 6).map((t) => el('span', { class: 'tag', text: '#' + t })),
    p.media.images ? el('span', { class: 'tag info', text: `🖼 ${p.media.images} ảnh` }) : null,
    p.media.videos ? el('span', { class: 'tag info', text: `🎬 ${p.media.videos} video` }) : null,
    p.media.files ? el('span', { class: 'tag info', text: `📎 ${p.media.files} tệp` }) : null,
    p.link ? el('a', { class: 'tag info', href: p.link, target: '_blank', rel: 'noreferrer', text: '🔗 ' + (BG.linkDomains(p.link)[0] || 'link') }) : null,
    p.full === false ? el('span', { class: 'tag warn', title: 'Chưa tải được nội dung đầy đủ, quy tắc chỉ xét phần này', text: 'Mới có 500 ký tự đầu' }) : null,
    p.reactions ? el('span', { class: 'tag info', text: `❤ ${p.reactions.toLocaleString('vi-VN')}` }) : null,
    p.commentsCount ? el('span', { class: 'tag info', text: `💬 ${p.commentsCount}` }) : null,
  );
  return el(
    'div',
    { class: art ? 'art-card' : null },
    art && p.cover ? el('img', { class: 'post-cover', src: p.cover, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    p.title ? el('div', { class: 'post-title', text: p.title }) : null,
    art && p.summary ? el('div', { class: 'art-summary', text: p.summary }) : null,
    body || !art ? text : null,
    meta,
  );
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

// ---------- Gợi ý ngắn (tooltip) và Hướng dẫn ----------
// Mô tả / hướng dẫn ngắn nằm trong data-tip: rê chuột hoặc đưa phím Tab tới thì hiện bong bóng; nút ⓘ (.tip-i) chạm để hiện
// (điện thoại). Bong bóng là popover nên nổi được trên hộp thoại đang mở. Hướng dẫn dài: hộp Hướng dẫn, mở bằng [data-help].
const tipBox = el('div', { class: 'tipbox', id: 'tipbox', role: 'tooltip' });
const tipPop = typeof tipBox.showPopover === 'function';
if (tipPop) tipBox.setAttribute('popover', 'manual');
else tipBox.hidden = true;
document.body.append(tipBox);
let tipFor = null;

function showTip(t) {
  const text = t?.dataset.tip;
  if (!text) return;
  tipFor?.removeAttribute('aria-describedby');
  tipFor = t;
  tipBox.textContent = text;
  if (tipPop) {
    if (!tipBox.matches(':popover-open')) tipBox.showPopover();
  } else {
    (t.closest('dialog[open]') || document.body).append(tipBox);
    tipBox.hidden = false;
  }
  t.setAttribute('aria-describedby', 'tipbox');
  // Phía trên phần tử, không đủ chỗ thì phía dưới; luôn nằm trong màn hình
  const r = t.getBoundingClientRect();
  const w = tipBox.offsetWidth;
  const h = tipBox.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  const top = r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8;
  Object.assign(tipBox.style, { left: left + 'px', top: top + 'px' });
}

function hideTip() {
  if (!tipFor) return;
  tipFor.removeAttribute('aria-describedby');
  tipFor = null;
  if (tipPop) {
    if (tipBox.matches(':popover-open')) tipBox.hidePopover();
  } else tipBox.hidden = true;
}

// Nút ⓘ: <button class="tip-i" data-tip="…">
function tipIcon(text) {
  return el('button', { type: 'button', class: 'tip-i', 'data-tip': text, 'aria-label': 'Gợi ý: ' + text }, 'i');
}

document.addEventListener('mouseover', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t && t !== tipFor) showTip(t);
  else if (!t && tipFor && !tipFor.classList.contains('tip-i')) hideTip();
});
document.addEventListener('mouseout', (e) => {
  if (tipFor && e.target.closest?.('[data-tip]') === tipFor && !tipFor.contains(e.relatedTarget)) hideTip();
});
document.addEventListener('focusin', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (t) showTip(t);
});
document.addEventListener('focusout', (e) => e.target === tipFor && hideTip());
document.addEventListener('click', (e) => {
  const t = e.target.closest?.('.tip-i');
  if (!t) return hideTip();
  e.preventDefault(); // ⓘ nằm trong <label>: không bật / tắt ô của nhãn
  if (tipFor === t) hideTip();
  else showTip(t);
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && hideTip());
window.addEventListener('scroll', hideTip, true);
window.addEventListener('resize', hideTip);

// Hộp Hướng dẫn: HELP_TOPICS[chủ đề] = { title, sections: [{ h, items: [chuỗi | [chuỗi…] (danh sách đánh số)] }] }
const HELP_TOPICS = {};
function openHelp(topic) {
  const t = HELP_TOPICS[topic];
  if (!t) return;
  hideTip();
  $('help-title').textContent = t.title;
  $('help-body').replaceChildren(
    ...t.sections.map((s) =>
      el(
        'section',
        {},
        el('h4', { text: s.h }),
        ...s.items.map((it) => (Array.isArray(it) ? el('ol', {}, it.map((x) => el('li', { text: x }))) : el('p', { text: it }))),
      ),
    ),
  );
  $('help-body').scrollTop = 0;
  $('help-dlg').showModal();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-help]');
  if (b) openHelp(b.dataset.help);
});
for (const id of ['help-x', 'help-ok']) $(id).addEventListener('click', () => $('help-dlg').close());
