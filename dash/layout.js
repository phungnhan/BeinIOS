// Dashboard — gọn giao diện: mục lục nhanh đầu mỗi tab (từ 4 thẻ trở lên, bấm là tới thẻ) và nút thu gọn từng thẻ.
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

function renderToc() {
  const nav = $('tab-toc');
  const cards = tabCards(currentTab);
  nav.hidden = cards.length < TOC_MIN;
  if (nav.hidden) return;
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
