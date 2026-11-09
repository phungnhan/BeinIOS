// Dashboard — Hồ sơ của bạn cho AI (khoá aiPersona: trong máy này, có trong sao lưu): bạn là ai, cộng đồng nào, bạn viết thế nào,
// điều AI không được viết, vài đoạn bạn tự viết. Gửi kèm mọi đề bài AI (BG.aiPersonaBlock — trả lời bình luận, bài đăng, mẫu bài
// chào / vinh danh; tóm tắt chỉ lấy tên và cộng đồng) để AI viết đúng giọng, đúng bối cảnh thay vì giọng chung chung.
// Mở từ Cài đặt › Trợ lý AI (#btn-ai-persona) và tab Trợ lý AI (#ai-persona-bar). Nạp sau aidraft.js, trước aihub.js.

const AP_FIELDS = BG.PERSONA_FIELDS;

// Tình trạng ngắn: số mục đã điền, đang bật / tắt
function personaInfo(p = data.aiPersona) {
  const n = BG.personaCount(p);
  const on = n > 0 && p.on !== false;
  return { n, on, text: !n ? 'Chưa điền — AI viết giọng chung chung' : `Đã điền ${n}/${AP_FIELDS.length} mục` + (on ? '' : ' · đang tắt') };
}

function renderPersonaRow(p = data.aiPersona) {
  if ($('ai-persona-status')) $('ai-persona-status').textContent = personaInfo(p).text;
}

function apForm() {
  return BG.cleanPersona({ on: $('ap-on').checked, ...Object.fromEntries(AP_FIELDS.map((k) => [k, $('ap-' + k).value])) });
}

function renderApPreview() {
  const p = apForm();
  const n = BG.personaCount(p);
  $('ap-count').textContent = n ? `Đã điền ${n}/${AP_FIELDS.length} mục` : 'Chưa điền mục nào';
  $('ap-samples-count').textContent = `${$('ap-samples').value.length}/${BG.PERSONA_MAX.samples} ký tự`;
  $('ap-preview').textContent = BG.aiPersonaBlock({ ...p, on: true }) || 'Chưa có gì để gửi — điền ít nhất một mục.';
}

function openPersona() {
  const p = BG.cleanPersona(data.aiPersona);
  $('ap-on').checked = p.on;
  for (const k of AP_FIELDS) $('ap-' + k).value = p[k];
  renderApPreview();
  $('ai-persona').showModal();
}

// Đoạn chính bạn viết trong kết quả quét: bài đăng (dài trước, tối đa 3) và câu trả lời bình luận (mới trước, tối đa 5)
function myWritings() {
  const me = data.state.me?.id;
  if (!me) return [];
  const clean = (t) => String(t || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const posts = (data.state.recentPosts || [])
    .filter((p) => p.actor?.id === me)
    .map((p) => clean([p.title, p.text].filter(Boolean).join('\n')))
    .filter((t) => t.length >= 30)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)
    .map((t) => t.slice(0, 1200));
  const replies = (data.state.recentComments || [])
    .filter((c) => c.actor?.id === me)
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .map((c) => clean(c.text))
    .filter((t) => t.length >= 15)
    .slice(0, 5)
    .map((t) => t.slice(0, 300));
  return [...new Set([...posts, ...replies])];
}

$('ap-fill-posts').addEventListener('click', () => {
  const box = $('ap-samples');
  const have = box.value.trim();
  const add = myWritings().filter((t) => !have.includes(t));
  if (!add.length) return toast(data.state.me?.id ? 'Chưa thấy bài hay câu trả lời nào của bạn trong kết quả quét — dán tay vài đoạn bạn từng viết.' : 'Chưa biết tài khoản của bạn — quét một lần rồi thử lại.', 'warn');
  box.value = [have, ...add].filter(Boolean).join('\n\n---\n\n').slice(0, BG.PERSONA_MAX.samples);
  renderApPreview();
  toast(`Đã thêm ${add.length} đoạn bạn từng viết — xem lại, bỏ đoạn không giống giọng bạn.`);
});

// Tên và phần giới thiệu trên trang cá nhân Beincom (chỉ điền ô đang trống)
$('ap-fill-me').addEventListener('click', async () => {
  const me = data.state.me || {};
  const btn = $('ap-fill-me');
  btn.disabled = true;
  let bio = '';
  let name = me.fullname || '';
  try {
    const r = await chrome.runtime.sendMessage({ type: 'selfInfo' });
    if (r?.status === 'ok') {
      bio = r.info?.bio || '';
      name = r.info?.fullname || name;
    }
  } catch {}
  btn.disabled = false;
  const filled = [];
  if (!$('ap-name').value.trim() && name) {
    $('ap-name').value = name;
    filled.push('tên');
  }
  if (!$('ap-about').value.trim() && bio) {
    $('ap-about').value = bio;
    filled.push('giới thiệu');
  }
  renderApPreview();
  toast(filled.length ? `Đã điền ${filled.join(' và ')} từ trang cá nhân Beincom — thêm cách xưng hô (vd: xưng mình).` : 'Không có gì mới để điền (ô đã có chữ, hoặc trang cá nhân chưa có giới thiệu).', filled.length ? '' : 'warn');
});

$('ap-save').addEventListener('click', async () => {
  const p = apForm();
  await chrome.storage.local.set({ aiPersona: p });
  $('ai-persona').close();
  const n = BG.personaCount(p);
  toast(!n ? 'Đã lưu (hồ sơ trống).' : p.on ? 'Đã lưu hồ sơ — từ giờ AI viết theo giọng của bạn.' : 'Đã lưu hồ sơ (đang tắt — AI chưa dùng).');
});

for (const id of ['ap-name', 'ap-about', 'ap-community', 'ap-voice', 'ap-avoid', 'ap-samples', 'ap-on']) $(id).addEventListener('input', renderApPreview);
for (const id of ['ap-cancel', 'ap-close']) $(id).addEventListener('click', () => $('ai-persona').close());
$('btn-ai-persona').addEventListener('click', openPersona);

// Đổi ở hộp này / khôi phục sao lưu / máy khác trong BeinIOS: dòng tình trạng ở Cài đặt cập nhật theo giá trị mới
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.aiPersona) renderPersonaRow(BG.cleanPersona(ch.aiPersona.newValue));
});
