// Trang Chat — xem ảnh phóng to ngay trong trang; nhiều ảnh thì chuyển qua lại như playlist.

// ---------- Xem ảnh phóng to (ngay trong trang; nhiều ảnh thì chuyển qua lại như playlist) ----------

const isImage = (f) => /^image\//.test(f.mime || '') && !!(f.url || f.mini);
const miniSrc = (f) => (f.mini ? 'data:image/jpeg;base64,' + f.mini.replace(/[^A-Za-z0-9+/=]/g, '') : '');
const V = { list: [], i: 0, zoom: false, swipe: null, swiped: false };

// Mọi ảnh của cuộc trò chuyện đang mở (cũ → mới)
function chatImages() {
  return sortedPosts()
    .filter((p) => !p.deleted && !p.system)
    .flatMap((p) => (p.files || []).filter(isImage).map((f) => ({ ...f, post: p })));
}

function openViewer(postId, fileId) {
  V.list = chatImages();
  V.i = Math.max(0, V.list.findIndex((x) => x.post.id === postId && x.id === fileId));
  if (!V.list.length) return;
  V.zoom = false;
  renderViewer();
  if (!$('viewer').open) $('viewer').showModal();
  $('v-close').focus();
}

function showImage(k) {
  if (k < 0 || k >= V.list.length || k === V.i) return;
  V.i = k;
  V.zoom = false;
  renderViewer();
}

function renderViewer() {
  const f = V.list[V.i];
  if (!f) return $('viewer').close();
  const n = V.list.length;
  $('v-name').textContent = f.name || 'Ảnh';
  $('v-meta').textContent = `${f.post.user.fullname || f.post.user.username || 'Người dùng'} · ${fullTime(f.post.createAt)}`;
  $('v-count').textContent = n > 1 ? `${V.i + 1} / ${n}` : '';
  // Ảnh chỉ có bản xem trước (máy chủ không cho link ảnh gốc): mở cuộc trò chuyện trên web
  $('v-open').href = f.url || $('conv-web').href;
  $('v-open').title = f.url ? 'Mở ảnh trong tab mới' : 'Mở trên web Beincom để xem ảnh gốc';
  $('v-prev').hidden = $('v-next').hidden = n < 2;
  $('v-prev').disabled = V.i === 0;
  $('v-next').disabled = V.i === n - 1;
  const stage = $('v-stage');
  stage.classList.remove('zoomed', 'can-zoom');
  stage.scrollTo(0, 0);
  const img = el('img', { src: f.url || miniSrc(f), alt: f.name || 'Ảnh', class: f.url ? null : 'blur', draggable: 'false' });
  // Ảnh lớn hơn khung: bấm vào ảnh để xem đúng cỡ
  img.addEventListener('load', () => stage.classList.toggle('can-zoom', !!f.url && (img.naturalWidth > img.clientWidth + 1 || img.naturalHeight > img.clientHeight + 1)));
  img.addEventListener('error', () => {
    if (f.mini && !img.classList.contains('blur')) {
      img.src = miniSrc(f);
      img.classList.add('blur');
    }
  });
  stage.replaceChildren(...[img, f.url ? null : el('p', { class: 'v-note' }, 'Đây là ảnh xem trước — bấm Mở tab mới để xem ảnh gốc trên web Beincom.')].filter(Boolean));
  const thumbs = $('v-thumbs');
  thumbs.hidden = n < 2;
  if (n > 1) {
    thumbs.replaceChildren(
      ...V.list.map((x, k) =>
        el('button', { type: 'button', class: 'v-thumb' + (k === V.i ? ' on' : ''), title: `Ảnh ${k + 1}${x.name ? ': ' + x.name : ''}`, 'aria-label': `Ảnh ${k + 1}`, 'aria-current': k === V.i ? 'true' : null, onclick: () => showImage(k) }, el('img', { src: x.url || miniSrc(x), alt: '', loading: 'lazy', draggable: 'false' })),
      ),
    );
    thumbs.children[V.i]?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  // Tải trước ảnh hai bên để chuyển cho nhanh
  for (const k of [V.i - 1, V.i + 1]) if (V.list[k]?.url) new Image().src = V.list[k].url;
}

function flashTo(id) {
  const n = $('m-' + id);
  if (!n) return;
  n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  n.classList.remove('flash');
  void n.offsetWidth;
  n.classList.add('flash');
}

function updateJump() {
  const show = !!S.sel && !nearBottom();
  $('jump').hidden = !show;
  if (!show) S.newBelow = 0;
  $('jump-n').textContent = S.newBelow ? `${S.newBelow} tin mới` : '';
}
