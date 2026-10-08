// Kiểm tra luồng tải ảnh / video / tệp (upload.js) với background và kho lưu trữ giả lập
const test = require('node:test');
const assert = require('node:assert/strict');
const BG = require('../common.js');
const Upload = require('../upload.js');

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'anh.png', { type: 'image/png' });

// sendReplies: trả lời cho từng loại tin nhắn; postReply: phản hồi khi gửi multipart
function fake({ sendReplies = {}, postReply = { status: 204, text: '' } } = {}) {
  const sent = [];
  const posts = [];
  const send = async (m) => {
    sent.push(m);
    const r = sendReplies[m.type];
    return typeof r === 'function' ? r(m) : r;
  };
  const post = async (url, form, opts) => {
    posts.push({ url, keys: [...form.keys()], form, opts });
    opts.onProgress?.(0.5);
    return typeof postReply === 'function' ? postReply(url) : postReply;
  };
  return { sent, posts, uploader: Upload.createUploader({ send, post }) };
}

const S3 = { status: 'ok', id: 'up1', url: 'https://bucket.s3.amazonaws.com/', fields: { key: 'post/up1', bucket: 'b', Policy: 'p', 'X-Amz-Signature': 's' } };

test('tải ảnh: xin link, gửi lên kho lưu trữ (file đứng cuối), chờ xử lý', async () => {
  const f = fake({ sendReplies: { uploadInit: S3, uploadWait: { status: 'ok', item: { url: 'https://media.beincom.com/x', id: 'up1', width: 4 } } } });
  const progress = [];
  const item = await f.uploader.upload('image', png(), (p) => progress.push(p));
  assert.deepEqual(item, { url: 'https://media.beincom.com/x', id: 'up1', width: 4 });
  assert.deepEqual(f.sent, [
    { type: 'uploadInit', kind: 'image', mimeType: 'image/png' },
    { type: 'uploadWait', kind: 'image', id: 'up1', unsure: false },
  ]);
  assert.equal(f.posts[0].url, S3.url);
  assert.deepEqual(f.posts[0].keys, ['key', 'bucket', 'Policy', 'X-Amz-Signature', 'file']);
  assert.equal(f.posts[0].opts.withCredentials, undefined); // kho lưu trữ không cần cookie
  assert.deepEqual(progress, [0.5, 1]);
});

test('tải ảnh: kho lưu trữ báo lỗi thì dừng, không chờ xử lý', async () => {
  const f = fake({ sendReplies: { uploadInit: S3 }, postReply: { status: 403, text: '<Error><Code>EntityTooLarge</Code><Message>Your proposed upload exceeds the maximum allowed size</Message></Error>' } });
  await assert.rejects(f.uploader.upload('image', png()), /exceeds the maximum allowed size/);
  assert.deepEqual(f.sent.map((m) => m.type), ['uploadInit']);
});

test('tải ảnh: không đọc được phản hồi (CORS) thì nhờ bước chờ kiểm tra file đã lên chưa', async () => {
  const f = fake({ sendReplies: { uploadInit: S3, uploadWait: (m) => (m.unsure ? { status: 'error', message: 'File chưa lên được kho lưu trữ' } : { status: 'ok' }) }, postReply: { status: 0, text: '' } });
  await assert.rejects(f.uploader.upload('video', new File(['x'], 'v.mp4', { type: 'video/mp4' })), /chưa lên được/);
  assert.equal(f.sent.at(-1).unsure, true);
});

test('tải tệp: gửi tới API Beincom kèm cookie, đổi khoá sang camelCase', async () => {
  const f = fake({
    sendReplies: { uploadInit: { status: 'ok', id: 'f9' } },
    postReply: { status: 201, text: JSON.stringify({ data: { id: 'f9', origin_url: 'https://media.beincom.com/f9.pdf', properties: { name: 'a.pdf', mime_type: 'application/pdf', size: 10 } } }) },
  });
  const item = await f.uploader.upload('file', new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
  assert.deepEqual(item, { id: 'f9', url: 'https://media.beincom.com/f9.pdf', name: 'a.pdf', mimeType: 'application/pdf', size: 10 });
  assert.equal(f.posts[0].url, BG.API + 'upload/files/f9');
  assert.deepEqual(f.posts[0].keys, ['file', 'upload_type']);
  assert.equal(f.posts[0].form.get('upload_type'), 'post_file');
  assert.equal(f.posts[0].opts.withCredentials, true);
  assert.deepEqual(f.sent.map((m) => m.type), ['uploadInit']); // tệp không có bước chờ
});

test('tải lên: hết phiên đăng nhập / tệp lỗi đều báo rõ', async () => {
  const a = fake({ sendReplies: { uploadInit: { status: 'need_login' } } });
  await assert.rejects(a.uploader.upload('image', png()), /hết hạn/);
  const b = fake({ sendReplies: { uploadInit: { status: 'ok', id: 'f1' } }, postReply: { status: 401, text: '' } });
  await assert.rejects(b.uploader.upload('file', new File(['x'], 'a.txt', { type: 'text/plain' })), /hết hạn/);
  const c = fake({ sendReplies: { uploadInit: { status: 'ok', id: 'f1' } }, postReply: { status: 400, text: JSON.stringify({ meta: { message: 'File type is not supported' } }) } });
  await assert.rejects(c.uploader.upload('file', new File(['x'], 'a.txt', { type: 'text/plain' })), /File type is not supported/);
});

test('s3Error: lấy câu báo lỗi trong XML', () => {
  assert.equal(Upload.s3Error('<Error><Message>Access Denied</Message></Error>'), 'Access Denied');
  assert.equal(Upload.s3Error('không phải XML'), '');
});
