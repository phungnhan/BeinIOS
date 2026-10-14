// Trang Chat — ảnh lưu trong máy (Cache Storage của addon): avatar người, ảnh community, ảnh biểu cảm Beincom.
// Hiện ngay từ bản đã lưu, không chờ mạng. Link avatar / ảnh community có mốc đổi ảnh (?_=…): ảnh đổi là link mới -> tải
// bản mới, xoá bản cũ cùng đường dẫn. Ảnh biểu cảm (không có mốc) kiểm tra lại ngầm sau 7 ngày, trong lúc đó vẫn hiện bản cũ.

const IMG_CACHE = 'beingroup-img-v1';
const IMG_STALE = 7 * 864e5;
const IMG_HOSTS = /^https:\/\/(chat|group)\.beincom\.com\//i;
const IMG = new Map(); // link -> link blob: (đã có) | Promise (đang đọc)

const imgCacheOk = () => typeof caches !== 'undefined';

async function fetchImage(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) throw new Error('not image');
  return r;
}

// Bản lưu (hoặc tải rồi lưu) của một ảnh -> link blob: dùng ngay; không lưu được thì trả lại link gốc
async function loadCachedImage(url) {
  try {
    const cache = await caches.open(IMG_CACHE);
    let res = await cache.match(url);
    if (res) {
      // Ảnh không có mốc đổi ảnh: quá 7 ngày thì tải lại ngầm cho lần sau
      const at = Date.parse(res.headers.get('date') || '') || 0;
      if (!/[?&]_=/.test(url) && Date.now() - at > IMG_STALE) fetchImage(url).then((r) => cache.put(url, r)).catch(() => {});
    } else {
      res = await fetchImage(url);
      // Ảnh mới của cùng người / community: bỏ bản cũ (khác mốc ?_=)
      if (/[?&]_=/.test(url)) await cache.delete(url.split('?')[0], { ignoreSearch: true });
      await cache.put(url, res.clone());
    }
    return URL.createObjectURL(await res.blob());
  } catch {
    return url;
  }
}

function cachedImage(url) {
  const hit = IMG.get(url);
  if (hit) return hit;
  const p = loadCachedImage(url).then((src) => (IMG.set(url, src), src));
  IMG.set(url, p);
  return p;
}

// Gắn ảnh vào thẻ img: đã có trong bộ nhớ thì gắn ngay; chưa thì gắn khi đọc xong bản lưu (link khác nguồn Beincom: gắn thẳng)
function setImgSrc(img, url) {
  if (!url || !IMG_HOSTS.test(url) || !imgCacheOk()) return void (img.src = url);
  // data-src: link gốc (ảnh hiện bằng bản lưu blob:)
  img.dataset.src = url;
  const hit = IMG.get(url);
  if (typeof hit === 'string') return void (img.src = hit);
  cachedImage(url).then((src) => {
    if (img.dataset.src === url) img.src = src;
  });
}

// Tải sẵn ảnh biểu cảm của hàng nhanh khi trình duyệt rảnh (lần sau mở hộp chọn là có ngay)
function warmEmojiCache() {
  if (!imgCacheOk()) return;
  const run = () => BG.chatQuickReacts(recentReacts()).map(BG.chatCustomEmoji).filter(Boolean).forEach((u) => cachedImage(u));
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(run);
}
