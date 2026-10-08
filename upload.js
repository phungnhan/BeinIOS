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

  // send: gửi tin nhắn tới background (chrome.runtime.sendMessage); post: gửi multipart (xhrPost). Đổi được khi kiểm thử.
  function createUploader({ send, post = xhrPost }) {
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
    async function upload(kind, file, onProgress = () => {}) {
      const init = await send({ type: 'uploadInit', kind, mimeType: file.type });
      if (init?.status === 'need_login') throw new Error('Phiên đăng nhập Beincom đã hết hạn');
      if (init?.status !== 'ok') throw new Error(init?.message || 'Không xin được chỗ tải lên');
      if (kind === 'file') {
        const item = await uploadFile(init.id, file, onProgress);
        onProgress(1);
        return item;
      }
      const form = new FormData();
      for (const [k, v] of Object.entries(init.fields || {})) form.append(k, v);
      form.append('file', file, file.name || 'file'); // S3 cần file đứng sau cùng
      const r = await post(init.url, form, { onProgress });
      // status 0: kho lưu trữ không cho trang addon đọc phản hồi (CORS); file có thể đã lên, bước chờ sẽ kiểm tra
      if (r.status && (r.status < 200 || r.status >= 300)) throw new Error('Tải lên kho lưu trữ lỗi: ' + (s3Error(r.text) || 'HTTP ' + r.status));
      onProgress(1);
      const w = await send({ type: 'uploadWait', kind, id: init.id, unsure: r.status === 0 });
      if (w?.status === 'need_login') throw new Error('Phiên đăng nhập Beincom đã hết hạn');
      if (w?.status !== 'ok') throw new Error(w?.message || 'Beincom chưa xử lý xong file');
      return w.item;
    }

    return { upload };
  }

  return { xhrPost, s3Error, createUploader };
});
