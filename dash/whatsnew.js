// Dashboard — Có gì mới: sau khi cập nhật addon, hiện các mục mới của CHANGELOG.md (đọc từ chính addon).
// Khoá `seenVersion` = bản đã xem (không có trong sao lưu / đồng bộ). Cài mới thì không hiện.

async function loadChangelog() {
  try {
    const r = await fetch(chrome.runtime.getURL('CHANGELOG.md'));
    return r.ok ? BG.changelogSections(await r.text()) : [];
  } catch {
    return [];
  }
}

function showWhatsNew(sections, title) {
  $('whatsnew-title').textContent = title;
  $('whatsnew-body').replaceChildren(
    ...sections.map((x) => {
      const body = el('div');
      body.innerHTML = BG.renderMarkdown(x.body); // renderMarkdown thoát HTML trước khi định dạng
      return el('section', {}, el('h4', { text: x.title }), body);
    }),
  );
  if (!$('whatsnew').open) $('whatsnew').showModal();
}

// Gọi một lần khi Dashboard mở
async function checkWhatsNew() {
  const version = chrome.runtime.getManifest().version;
  const { seenVersion, state } = await chrome.storage.local.get(['seenVersion', 'state']);
  if (seenVersion && BG.cmpVersion(version, seenVersion) <= 0) return;
  const sections = await loadChangelog();
  // Chưa ghi bản đã xem: cài mới thì thôi; đã dùng từ bản trước (có dữ liệu quét) thì hiện mục của bản này
  const seen = seenVersion || (state?.lastScan ? sections.find((x) => BG.cmpVersion(x.version, version) < 0)?.version : null);
  const list = BG.whatsNew(sections, seen, version);
  if (!list.length) return chrome.storage.local.set({ seenVersion: version });
  showWhatsNew(list, `BeinGroup đã cập nhật lên v${version}`);
}

$('whatsnew').addEventListener('close', () => chrome.storage.local.set({ seenVersion: chrome.runtime.getManifest().version }));
$('btn-whatsnew').addEventListener('click', async (e) => {
  e.preventDefault();
  const sections = await loadChangelog();
  if (!sections.length) return toast('Không đọc được danh sách thay đổi', 'err');
  showWhatsNew(sections.slice(0, 3), 'Có gì mới ở BeinGroup');
});
