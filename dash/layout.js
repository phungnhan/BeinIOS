// Dashboard — gọn giao diện: mục lục nhanh đầu mỗi tab (từ 4 thẻ trở lên, bấm là tới thẻ) và nút thu gọn từng thẻ.
// Giao diện Hiện đại: mục lục thành hàng mục con — mỗi tab chỉ hiện một thẻ (xem subMode).
// Thẻ đã thu gọn nhớ trong trình duyệt này (localStorage, chỉ là tiện ích hiển thị; đọc / ghi lỗi thì bỏ qua).

const FOLD_KEY = 'beingroup-folded';
const TOC_MIN = 4;

function foldedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveFolded(set) {
  try {
    localStorage.setItem(FOLD_KEY, JSON.stringify([...set]));
  } catch {}
}

// Thẻ của một tab (kể cả thẻ nằm trong cột con, vd. tab Quy tắc & cài đặt), bỏ thẻ đang ẩn
function tabCards(tab) {
  return [...document.querySelectorAll('main section.card[id]')].filter((s) => s.closest('[data-tab]')?.dataset.tab === tab && !s.classList.contains('is-off') && s.querySelector(':scope > .card-head h2'));
}

// Tiêu đề thẻ, bỏ huy hiệu số bên trong (vd. "Việc cần làm 8" -> "Việc cần làm")
function cardTitle(s) {
  const h = s.querySelector(':scope > .card-head h2');
  const own = [...h.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
  return own || h.textContent.trim();
}

function setFolded(card, folded, { save = true } = {}) {
  card.classList.toggle('folded', folded);
  const b = card.querySelector(':scope > .card-head > .card-fold');
  if (b) {
    b.setAttribute('aria-expanded', String(!folded));
    b.title = folded ? 'Mở thẻ' : 'Thu gọn thẻ';
  }
  if (save) {
    const set = foldedIds();
    folded ? set.add(card.id) : set.delete(card.id);
    saveFolded(set);
  }
  // Mở lại: vẽ lại tab (biểu đồ cần chiều rộng thật)
  if (!folded && typeof renderTab === 'function' && card.closest('[data-tab]')?.dataset.tab === currentTab) renderTab(currentTab);
  renderToc();
}

// Thanh tab con (các thẻ trong tab) dính ngay dưới thanh tab lớn: ghi chiều cao thanh tab và thanh tab con để CSS đặt
// vị trí dính và chỗ dừng khi cuộn tới thẻ (scroll-margin)
function syncSticky() {
  const root = document.documentElement.style;
  root.setProperty('--tabs-h', ($('tabs')?.offsetHeight || 49) + 'px');
  const toc = $('tab-toc');
  root.setProperty('--toc-h', (toc && !toc.hidden ? toc.offsetHeight : 0) + 'px');
}
window.addEventListener('resize', syncSticky);

// ---------- Giao diện Hiện đại: mỗi tab một thẻ ----------
// Mục lục thành hàng mục con (từ 2 thẻ), bấm là chọn thẻ; thẻ khác của tab mang .sub-off (chỉ dashboard-modern.css ẩn, nên
// về Cổ điển là hiện lại đủ). Thẻ nhỏ đi kèm thẻ chính hiện cùng (Thống kê). Thẻ đã chọn nhớ theo tab. Tab Quy tắc & cài
// đặt đã chia mục riêng (dash/setnav.js) nên không áp.
const SUB_WITH = { 'stats-top-posts': 'stats', 'stats-top-authors': 'stats', 'stats-best': 'stats' };
const SUB_FIRST = { overview: 'todo', members: 'review' }; // thẻ mở đầu khi chưa chọn (không có thì thẻ đầu tiên)
const subMode = () => document.documentElement.dataset.ui === 'modern' && currentTab !== 'settings';

function subChosen(tab, leads) {
  let id = '';
  try {
    id = localStorage.getItem('beinfusion-sub-' + tab) || '';
  } catch {}
  return leads.find((c) => c.id === id) || leads.find((c) => c.id === SUB_FIRST[tab]) || leads[0] || null;
}

// lead = null: hiện đủ (tab ít thẻ)
function applySub(tab, lead) {
  for (const c of document.querySelectorAll('main section.card[id]')) {
    if (c.closest('[data-tab]')?.dataset.tab !== tab) continue;
    const on = !lead || c === lead || SUB_WITH[c.id] === lead.id;
    c.classList.toggle('sub-off', !on);
    if (on && lead && c.classList.contains('folded')) setFolded(c, false, { save: false }); // nút thu gọn ẩn ở giao diện này
  }
}

function selectSub(card) {
  const lead = $(SUB_WITH[card.id]) || card;
  try {
    localStorage.setItem('beinfusion-sub-' + currentTab, lead.id);
  } catch {}
  const was = lead.classList.contains('sub-off');
  applySub(currentTab, lead);
  renderToc();
  if (!was) return;
  window.scrollTo(0, 0);
  if (currentTab === 'stats' && typeof renderStats === 'function') renderStats(); // biểu đồ cần chiều rộng thật
}

// Số trên tiêu đề thẻ (vd. Việc cần làm 8) hiện cạnh tên mục con
const subCount = (c) => [...c.querySelectorAll(':scope > .card-head h2 :is(.badge, .tag)')].map((x) => x.textContent.trim()).find((t) => /^\d+$/.test(t) && t !== '0') || '';

// Chỗ nào cuộn tới một thẻ (mở từ thông báo, Việc đầu tuần, Lịch, #thẻ…) thì chọn thẻ đó trước — không phải sửa từng chỗ
const scrollIntoViewRaw = Element.prototype.scrollIntoView;
Element.prototype.scrollIntoView = function (...args) {
  const card = this.closest?.('main section.card[id]');
  if (card?.classList.contains('sub-off') && subMode()) selectSub(card);
  return scrollIntoViewRaw.apply(this, args);
};

function renderToc() {
  const nav = $('tab-toc');
  if (subMode()) {
    const leads = tabCards(currentTab).filter((c) => !c.hidden && !SUB_WITH[c.id]);
    nav.hidden = leads.length < 2;
    nav.classList.add('sub');
    nav.setAttribute('role', 'tablist');
    const on = nav.hidden ? null : subChosen(currentTab, leads);
    applySub(currentTab, on);
    if (on)
      nav.replaceChildren(
        ...leads.map((c) => {
          const n = subCount(c);
          return el('button', { type: 'button', role: 'tab', class: 'toc-chip' + (c === on ? ' on' : ''), 'aria-selected': String(c === on), onclick: () => selectSub(c) }, cardTitle(c), n ? el('span', { class: 'toc-n', text: n }) : null);
        }),
      );
    return syncSticky();
  }
  nav.classList.remove('sub');
  nav.removeAttribute('role');
  const cards = tabCards(currentTab);
  nav.hidden = cards.length < TOC_MIN;
  if (nav.hidden) return syncSticky();
  const anyOpen = cards.some((c) => !c.classList.contains('folded'));
  nav.replaceChildren(
    ...cards.map((c) =>
      el('button', {
        type: 'button',
        class: 'toc-chip' + (c.classList.contains('folded') ? ' folded' : ''),
        title: c.classList.contains('folded') ? 'Thẻ đang thu gọn — bấm để mở và tới thẻ' : 'Tới thẻ',
        text: cardTitle(c),
        onclick: () => {
          if (c.classList.contains('folded')) setFolded(c, false);
          c.scrollIntoView({ block: 'start', behavior: 'smooth' });
        },
      }),
    ),
    el('button', {
      type: 'button',
      class: 'toc-chip toc-all',
      text: anyOpen ? 'Thu gọn tất cả' : 'Mở tất cả',
      onclick: () => {
        for (const c of cards) setFolded(c, anyOpen);
      },
    }),
  );
  syncSticky();
}

// Nút thu gọn ở đầu mỗi thẻ; áp trạng thái đã nhớ
(function initFolding() {
  const folded = foldedIds();
  for (const card of document.querySelectorAll('main section.card[id]')) {
    const head = card.querySelector(':scope > .card-head');
    if (!head || !head.querySelector('h2')) continue;
    const b = el('button', { type: 'button', class: 'card-fold', 'aria-expanded': 'true', 'aria-controls': card.id, title: 'Thu gọn thẻ', text: '▾' });
    b.addEventListener('click', () => setFolded(card, !card.classList.contains('folded')));
    head.prepend(b);
    if (folded.has(card.id)) setFolded(card, true, { save: false });
  }
})();

// Nút ↑ lên đầu trang (mọi tab): hiện khi đã cuộn xuống gần một màn hình; bấm thì về đầu tab, đưa phím Tab về thanh tab
(function initToTop() {
  const btn = $('to-top');
  const update = () => (btn.hidden = window.scrollY < Math.max(400, window.innerHeight * 0.8));
  let frame = 0;
  window.addEventListener(
    'scroll',
    () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          update();
        });
    },
    { passive: true },
  );
  btn.addEventListener('click', () => {
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    document.querySelector('#tabs [aria-selected="true"]')?.focus({ preventScroll: true });
  });
  update();
})();
