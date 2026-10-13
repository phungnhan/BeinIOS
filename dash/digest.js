// Dashboard — tab Tổng quan: Việc đầu tuần. Khi lần quét có nhiều việc định kỳ cùng lúc (tóm tắt tuần, chào thành viên mới,
// bài nhắc người mới, bài thảo luận, báo cáo tháng), service worker gộp một thông báo và lưu danh sách ở `periodicDigest`.

const DIGEST_ACTIONS = {
  weekly: { text: 'Xem tóm tắt', run: () => (showTab('overview'), $('weekly').scrollIntoView({ block: 'start' })) },
  welcome: { text: 'Mở', run: () => openWelcome() },
  nudge: { text: 'Mở bài nhắc', run: () => openNudge() },
  prompt: { text: 'Mở bài thảo luận', run: () => openPrompts() },
  monthly: { text: 'Xem báo cáo', run: () => openMonthly() },
};

function digestShown() {
  const d = data.periodicDigest;
  return !!d && !d.dismissed && Date.now() - d.at < 7 * 864e5;
}

function renderDigest() {
  const d = data.periodicDigest;
  $('digest').classList.toggle('is-off', !digestShown());
  if (!digestShown()) return;
  const left = d.items.filter((x) => !d.done?.[x.kind]).length;
  $('digest-at').textContent = left ? `${left}/${d.items.length} việc chưa làm · ${fmtTime(d.at)}` : `Đã xong hết 🎉 · ${fmtTime(d.at)}`;
  $('digest-list').replaceChildren(
    ...d.items.map((x) => {
      const done = !!d.done?.[x.kind];
      const a = DIGEST_ACTIONS[x.kind];
      return el(
        'li',
        { class: done ? 'done' : '' },
        el('span', { class: 'digest-mark', text: done ? '✓' : '•' }),
        el('span', { class: 'digest-line', text: x.line }),
        a ? el('button', { type: 'button', class: done ? 'ghost sm' : 'primary sm', text: a.text, onclick: () => runDigest(x.kind) }) : null,
      );
    }),
  );
}

async function saveDigest(patch) {
  data.periodicDigest = { ...data.periodicDigest, ...patch };
  await chrome.storage.local.set({ periodicDigest: data.periodicDigest });
  renderDigest();
}

function runDigest(kind) {
  saveDigest({ done: { ...data.periodicDigest.done, [kind]: true } });
  DIGEST_ACTIONS[kind]?.run();
}

// Mở từ thông báo gộp (#tab=overview&digest=1)
function openDigest() {
  showTab('overview');
  renderDigest();
  if (digestShown()) $('digest').scrollIntoView({ block: 'start' });
}

$('btn-digest-hide').addEventListener('click', () => saveDigest({ dismissed: true }));
