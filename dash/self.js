// Dashboard → avatar góc trên: Hồ sơ cá nhân — tài khoản đang đăng nhập, quyền quản trị theo cộng đồng, trạng thái addon.
// Nội dung dựng bằng BG.selfProfile (lib/self.js), dùng chung với trang Chat. Mở thẳng bằng địa chỉ #…&me=1.

async function selfProfileData() {
  const { state, settings, chatOverviewCache } = await chrome.storage.local.get(['state', 'settings', 'chatOverviewCache']);
  return BG.selfProfile({
    me: state?.me,
    chatMe: chatOverviewCache?.me,
    groups: state?.snapshot?.groups || [],
    settings: { ...BG.DEFAULT_SETTINGS, ...settings },
    lastScan: state?.lastScan,
    lastResult: state?.lastResult,
  });
}

// Ảnh đại diện: ảnh Beincom nếu có, không thì chữ cái đầu (màu theo mã tài khoản)
function selfAvatar(p, size) {
  const name = p.name || p.username || '?';
  const w = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  const box = el('span', { class: 'me-av', style: `--s: ${size}px; --h: ${[...String(p.id || name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 360}` }, ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase());
  if (p.avatar) {
    const img = el('img', { alt: '', src: p.avatar });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

async function renderMeBtn() {
  const btn = $('me-btn');
  if (!btn) return;
  const me = data.state?.me;
  btn.hidden = !me;
  if (!me) return;
  const p = { id: me.id, name: me.fullname || me.username, username: me.username, avatar: me.avatar };
  btn.title = `${p.name || 'Tài khoản'} — Hồ sơ cá nhân`;
  btn.replaceChildren(selfAvatar(p, 32));
}

async function openSelf() {
  const p = await selfProfileData();
  const d = $('me-card');
  $('me-head').replaceChildren(
    selfAvatar(p, 64),
    el('div', { class: 'me-who' }, el('b', {}, p.name || 'Tài khoản Beincom', p.verified ? el('span', { class: 'me-vb', title: 'Đã xác minh' }, '✓') : null), el('span', { class: 'muted' }, [p.username ? '@' + p.username : '', p.summary].filter(Boolean).join(' · '))),
  );
  $('me-body').replaceChildren(
    ...p.sections.map((s) =>
      el(
        'section',
        { class: 'me-sec' },
        el('h4', {}, s.title),
        s.note ? el('p', { class: 'muted small' }, s.note) : null,
        s.rows.length
          ? el(
              'div',
              { class: 'me-rows' },
              s.rows.map((r) =>
                el(
                  'div',
                  { class: 'me-row' },
                  el('span', { class: 'me-k' }, r.href ? el('a', { href: r.href, target: '_blank', rel: 'noopener noreferrer' }, r.label) : r.label),
                  el('span', { class: 'me-v' + (r.tone ? ' ' + r.tone : '') }, r.value),
                  r.copy ? el('button', { type: 'button', class: 'ghost sm', title: 'Chép', onclick: () => navigator.clipboard.writeText(r.value).then(() => toast('Đã chép ' + r.label)) }, 'Chép') : null,
                ),
              ),
            )
          : null,
      ),
    ),
    p.links.length ? el('div', { class: 'me-links' }, p.links.map((l) => el('a', { class: 'ghost-link', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label + ' ↗'))) : null,
  );
  if (!d.open) d.showModal();
}

$('me-btn').addEventListener('click', openSelf);
if (new URLSearchParams(location.hash.slice(1)).get('me')) setTimeout(openSelf, 0);
