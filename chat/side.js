// Trang Chat — khung bên phải (bình luận, tìm tin, tin đã ghim): kéo cạnh trái để đổi độ rộng (nhớ trong máy, bấm đúp
// về mặc định, phím ← → khi đang chọn cạnh); nút Phóng to ở khung bình luận: khung phủ cả phần cuộc trò chuyện.

const SIDE_KEY = 'beingroup-chat-side-w';
const SIDE_MIN = 320;
const CONV_MIN = 360; // màn rộng: chừa chỗ cho cuộc trò chuyện

// Rộng tối đa: màn rộng thì chừa danh sách bên trái và cuộc trò chuyện; màn hẹp (khung nổi) thì cả cửa sổ
function sideMaxW() {
  if (innerWidth <= 1180) return innerWidth;
  return Math.max(SIDE_MIN, innerWidth - $('side').getBoundingClientRect().width - CONV_MIN);
}

function sideSavedW() {
  try {
    return Number(localStorage.getItem(SIDE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setSideW(w, save = false) {
  const v = Math.round(Math.min(Math.max(w, SIDE_MIN), sideMaxW()));
  $('app').style.setProperty('--side-w', v + 'px');
  if (save)
    try {
      localStorage.setItem(SIDE_KEY, String(v));
    } catch {}
  return v;
}

function resetSideW() {
  $('app').style.removeProperty('--side-w');
  try {
    localStorage.removeItem(SIDE_KEY);
  } catch {}
}

// Độ rộng khung đang mở
function sideNowW() {
  const open = [...document.querySelectorAll('aside.thread')].find((x) => !x.hidden);
  return open ? open.getBoundingClientRect().width : sideSavedW() || 400;
}

function sideGrip() {
  const g = el('div', { class: 'side-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Đổi độ rộng khung', title: 'Kéo để đổi độ rộng · bấm đúp: về mặc định', tabindex: '0' });
  g.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    g.setPointerCapture?.(e.pointerId);
    document.body.classList.add('side-resizing');
    // Khung nằm sát mép phải cửa sổ: độ rộng = mép phải - vị trí chuột
    const move = (ev) => setSideW(innerWidth - ev.clientX);
    const up = (ev) => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', up);
      g.removeEventListener('pointercancel', up);
      document.body.classList.remove('side-resizing');
      setSideW(innerWidth - ev.clientX, true);
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', up);
    g.addEventListener('pointercancel', up);
  });
  g.addEventListener('dblclick', resetSideW);
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setSideW(sideNowW() + (e.key === 'ArrowLeft' ? 40 : -40), true);
  });
  return g;
}

// Phóng to / thu nhỏ khung bình luận (không nhớ: mở thread sau lại ở cỡ thường)
function setSideMax(on) {
  $('app').classList.toggle('side-max', on);
  const b = $('t-max');
  b.setAttribute('aria-pressed', String(on));
  b.title = on ? 'Thu nhỏ khung bình luận' : 'Phóng to khung bình luận';
  b.setAttribute('aria-label', b.title);
  b.querySelector('path').setAttribute('d', on ? 'M10 14v6H8v-2.6L3.4 22 2 20.6 6.6 16H4v-2h6Zm4-4V4h2v2.6L20.6 2 22 3.4 17.4 8H20v2h-6Z' : 'M3 21v-6h2v2.6L8.6 14 10 15.4 6.4 19H9v2H3Zm12-18h6v6h-2V6.4L15.4 10 14 8.6 17.6 5H15V3Z');
}

function initSide() {
  const w = sideSavedW();
  if (w) setSideW(w);
  for (const panel of document.querySelectorAll('aside.thread')) panel.prepend(sideGrip());
  $('t-max').addEventListener('click', () => setSideMax(!$('app').classList.contains('side-max')));
  // Cửa sổ đổi cỡ: độ rộng đã chọn vẫn chừa chỗ cho cuộc trò chuyện
  addEventListener('resize', () => sideSavedW() && setSideW(sideSavedW()));
}
