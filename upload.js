// Tải ảnh / video / tệp lên Beincom trước khi đăng bài. Chạy trong trang Dashboard vì phải gửi nội dung file
// (tin nhắn tới background chỉ chở được JSON). Phần gọi API cần đăng nhập vẫn do background làm.
// Giống web Beincom:
//  - Ảnh, video: uploadInit (xin link) -> gửi file thẳng lên kho lưu trữ (S3, không kèm cookie) -> uploadWait (chờ xử lý)
//  - Tệp: uploadInit (xin mã) -> gửi file tới API Beincom kèm cookie -> nhận thông tin tệp
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./common.js'));
  else root.Upload = factory(root.BG);
})(typeof self !== 'undefined' ? self : this, function (BG) {
  // POST multipart có báo tiến độ (0..1). status 0 = không đọc được phản hồi: mạng lỗi hoặc bị chặn CORS
  function xhrPost(url, form, { withCredentials = false, headers = {}, onProgress } = {}) {
    return new Promise((resolve) => {
      const x = new XMLHttpRequest();
      x.open('POST', url);
      x.withCredentials = withCredentials;
      for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
      if (onProgress) x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => resolve({ status: x.status, text: x.responseText });
      x.onerror = () => resolve({ status: 0, text: '' });
      x.send(form);
    });
  }

  // Lỗi S3 trả về dạng XML: <Error><Code>…</Code><Message>…</Message></Error>
  function s3Error(text) {
    const m = /<Message>([^<]*)<\/Message>/.exec(text || '');
    return m ? m[1] : '';
  }

  // Trường presigned_post gửi lên kho lưu trữ: như web Beincom (group.beincom.com, hàm tải ảnh của trình soạn bài)
  const S3_FIELDS = ['key', 'bucket', 'X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Security-Token', 'Policy', 'X-Amz-Signature'];

  // Hạn chờ tổng để Beincom xử lý xong (mỗi lượt uploadWait chỉ chờ tới khoảng 20 giây, chưa xong thì gọi lại)
  const WAIT_TOTAL_MS = { image: 180e3, video: 600e3 };
  const WAIT_GAP_MS = 2000; // lượt chờ trả lời ngay mà chưa xong: nghỉ chừng này rồi hỏi lại
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

  // send: gửi tin nhắn tới background (chrome.runtime.sendMessage); post: gửi multipart (xhrPost); now / sleep: đồng hồ.
  // Đổi được khi kiểm thử.
  function createUploader({ send, post = xhrPost, now = Date.now, sleep = sleepMs }) {
    // Chờ Beincom xử lý ảnh / video: gọi uploadWait nhiều lượt tới khi xong, báo lỗi, hoặc hết hạn chờ tổng
    // onWait(ms): báo đã chờ bao lâu sau mỗi lượt chưa xong (Dashboard ghi lên nút Đăng)
    async function waitProcessed(kind, id, unsure, onWait = () => {}) {
      const start = now();
      const deadline = start + WAIT_TOTAL_MS[kind];
      for (;;) {
        const t0 = now();
        const w = await send({ type: 'uploadWait', kind, id, unsure });
        if (w?.status !== 'pending') return w;
        onWait(now() - start);
        if (now() >= deadline) {
          const mins = WAIT_TOTAL_MS[kind] / 60e3;
          if (w.unsure) return { status: 'error', message: `File chưa lên được kho lưu trữ (đã chờ ${mins} phút; trình duyệt có thể đã chặn) — thử lại` };
          return { status: 'error', message: kind === 'video' ? `Beincom xử lý video quá lâu (đã chờ ${mins} phút) — thử lại sau` : `Beincom xử lý ảnh quá lâu (đã chờ ${mins} phút) — thử lại sau, hoặc dùng ảnh nhỏ hơn` };
        }
        if (now() - t0 < WAIT_GAP_MS) await sleep(WAIT_GAP_MS);
      }
    }

    async function uploadFile(id, file, onProgress) {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('upload_type', 'post_file');
      const r = await post(`${BG.API}upload/files/${id}`, form, { withCredentials: true, headers: { 'x-application': 'BIC_GROUP', 'x-platform': 'WEB' }, onProgress });
      if (r.status === 401) throw new Error('Phiên đăng nhập Beincom đã hết hạn');
      let body = null;
      try {
        body = JSON.parse(r.text);
      } catch {}
      const d = body?.data;
      if (r.status < 200 || r.status >= 300 || !d?.id) throw new Error('Tải tệp lỗi: ' + (body?.meta?.message || (r.status ? 'HTTP ' + r.status : 'không kết nối được Beincom')));
      return BG.mediaItem('file', id, d);
    }

    // kind: 'image' | 'video' | 'file'. Trả về đối tượng để đưa vào media của bài.
    // resource (ảnh): 'post:content' (mặc định) | 'article:cover' | 'series:cover' · onWait: xem waitProcessed
    async function upload(kind, file, onProgress = () => {}, { resource, onWait } = {}) {
      const init = await send({ type: 'uploadInit', kind, mimeType: file.type, ...(resource ? { resource } : {}) });
      if (init?.status === 'need_login') throw new Error('Phiên đăng nhập Beincom đã hết hạn');
      if (init?.status !== 'ok') throw new Error(init?.message || 'Không xin được chỗ tải lên');
      if (kind === 'file') {
        const item = await uploadFile(init.id, file, onProgress);
        onProgress(1);
        return item;
      }
      // Đúng các trường web Beincom gửi, đúng thứ tự (S3 cần file đứng sau cùng)
      const form = new FormData();
      const fields = init.fields || {};
      for (const k of S3_FIELDS) if (fields[k] != null) form.append(k, fields[k]);
      form.append('file', file, file.name || 'file');
      // KHÔNG theo dõi tiến độ: gắn theo dõi tiến độ tải lên buộc trình duyệt hỏi trước kho lưu trữ (CORS preflight), mà kho của
      // Beincom chỉ nhận trang group.beincom.com -> từ chối, file không được gửi đi (rồi chờ xử lý mãi). Gửi dạng thường thì file
      // lên kho bình thường, chỉ không đọc được phản hồi (status 0) — bước chờ xử lý kiểm tra. onProgress(-1): đang tải, chưa rõ %.
      onProgress(-1);
      const r = await post(init.url, form, {});
      // status 0: kho lưu trữ không cho trang addon đọc phản hồi (CORS); file có thể đã lên, bước chờ sẽ kiểm tra
      if (r.status && (r.status < 200 || r.status >= 300)) throw new Error('Tải lên kho lưu trữ lỗi: ' + (s3Error(r.text) || 'HTTP ' + r.status));
      onProgress(1);
      const w = await waitProcessed(kind, init.id, r.status === 0, onWait);
      if (w?.status === 'need_login') throw new Error('Phiên đăng nhập Beincom đã hết hạn');
      if (w?.status !== 'ok') throw new Error(w?.message || 'Beincom chưa xử lý xong file');
      return w.item;
    }

    return { upload };
  }

  return { xhrPost, s3Error, createUploader, WAIT_TOTAL_MS, S3_FIELDS };
});
