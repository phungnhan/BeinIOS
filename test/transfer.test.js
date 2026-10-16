// Kiểm tra mã QR (lib/qr.js) và đóng gói đăng nhập cho BeinIOS (lib/transfer.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const BG = require('../common.js');
const Q = BG.qrInternals;

// ---------- Đối chiếu với số liệu của chuẩn QR ----------

test('QR: Reed–Solomon đúng ví dụ chuẩn (HELLO WORLD, 1-Q)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236];
  assert.deepEqual(Q.rsRemainder(data, Q.rsDivisor(13)), [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]);
});

test('QR: bit định dạng, bit phiên bản, vị trí ô căn chỉnh, dung lượng đúng bảng chuẩn', () => {
  const fmt = (l, m) => Q.formatBits(l, m).toString(2).padStart(15, '0');
  assert.equal(fmt('L', 0), '111011111000100');
  assert.equal(fmt('L', 1), '111001011110011');
  assert.equal(fmt('M', 0), '101010000010010');
  assert.equal(fmt('Q', 0), '011010101011111');
  assert.equal(fmt('H', 0), '001011010001001');
  assert.equal(Q.versionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
  assert.deepEqual(Q.alignPositions(1), []);
  assert.deepEqual(Q.alignPositions(2), [6, 18]);
  assert.deepEqual(Q.alignPositions(7), [6, 22, 38]);
  assert.deepEqual(Q.alignPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(Q.alignPositions(40), [6, 30, 58, 86, 114, 142, 170]);
  // Số byte tối đa ở chế độ byte (L, M, Q, H)
  const cap = {
    1: [17, 14, 11, 7],
    2: [32, 26, 20, 14],
    3: [53, 42, 32, 24],
    4: [78, 62, 46, 34],
    5: [106, 84, 60, 44],
    6: [134, 106, 74, 58],
    7: [154, 122, 86, 64],
    10: [271, 213, 151, 119],
    40: [2953, 2331, 1663, 1273],
  };
  for (const [v, list] of Object.entries(cap)) assert.deepEqual(['L', 'M', 'Q', 'H'].map((l) => BG.qrCapacity(Number(v), l)), list, 'phiên bản ' + v);
  // Mọi phiên bản: tổng mã chia đều được thành khối
  for (let v = 1; v <= 40; v++) for (const l of ['L', 'M', 'Q', 'H']) assert.ok(Q.dataCodewords(v, l) > 0);
});

// ---------- Đọc ngược mã QR đã tạo (ma trận sạch) để chắc mã quét ra đúng nội dung ----------

function readQr(m) {
  const size = m.length;
  const ver = (size - 17) / 4;
  const get = (x, y) => (m[y][x] ? 1 : 0);
  let f1 = 0;
  const pos1 = [...[0, 1, 2, 3, 4, 5].map((i) => [8, i]), [8, 7], [8, 8], [7, 8], ...[9, 10, 11, 12, 13, 14].map((i) => [14 - i, 8])];
  pos1.forEach(([x, y], i) => (f1 |= get(x, y) << i));
  let f2 = 0;
  for (let i = 0; i < 8; i++) f2 |= get(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= get(8, size - 15 + i) << i;
  assert.equal(f1, f2, 'hai bản thông tin định dạng khớp nhau');
  assert.equal(get(8, size - 8), 1, 'ô tối cố định');
  const info = (f1 ^ 0x5412) >>> 10;
  const level = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }[info >>> 3];
  const mask = info & 7;
  assert.equal(Q.formatBits(level, mask), f1, 'mã BCH của thông tin định dạng');
  if (ver >= 7) {
    let vb = 0;
    for (let i = 0; i < 18; i++) vb |= get(size - 11 + (i % 3), Math.floor(i / 3)) << i;
    assert.equal(vb, Q.versionBits(ver), 'thông tin phiên bản');
  }
  // Ô hoa văn cố định (tự dựng theo chuẩn, không dùng ma trận của lib)
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < size && y < size) fn[y][x] = true;
  };
  mark(0, 0, 9, 9);
  mark(size - 8, 0, 8, 9);
  mark(0, size - 8, 9, 8);
  mark(6, 0, 1, size);
  mark(0, 6, size, 1);
  const ap = Q.alignPositions(ver);
  // mọi giao điểm, trừ ba góc trùng ô định vị (ô căn chỉnh đè lên đường định giờ vẫn có)
  const last = ap.length - 1;
  ap.forEach((ay, j) => ap.forEach((ax, i) => !((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) && mark(ax - 2, ay - 2, 5, 5)));
  if (ver >= 7) {
    mark(size - 11, 0, 3, 6);
    mark(0, size - 11, 6, 3);
  }
  // Đọc bit theo đường zíc zắc, gỡ mặt nạ
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? size - 1 - vert : vert;
      for (const x of [right, right - 1]) if (!fn[y][x]) bits.push(get(x, y) ^ (Q.MASKS[mask](x, y) ? 1 : 0));
    }
  }
  assert.equal(bits.length, Q.rawDataModules(ver), 'số ô dữ liệu');
  const raw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) raw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // Gỡ xen kẽ khối, kiểm tra mã sửa lỗi từng khối
  const total = raw.length;
  const dataLen = Q.dataCodewords(ver, level);
  const eccLen = Q.ECC_PER_BLOCK[level][ver];
  assert.equal(eccLen * blocksOf(ver, level), total - dataLen);
  const nb = blocksOf(ver, level);
  const shortLen = Math.floor(total / nb);
  const numShort = nb - (total % nb);
  const blocks = Array.from({ length: nb }, (_, j) => ({ data: [], ecc: [], dlen: shortLen - eccLen + (j < numShort ? 0 : 1) }));
  let k = 0;
  for (let i = 0; i < shortLen - eccLen + 1; i++) for (const b of blocks) if (i < b.dlen) b.data.push(raw[k++]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) b.ecc.push(raw[k++]);
  for (const b of blocks) assert.deepEqual(Q.rsRemainder(b.data, Q.rsDivisor(eccLen)), b.ecc, 'mã sửa lỗi của khối');
  const stream = blocks.flatMap((b) => b.data).flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((i) => (byte >>> i) & 1));
  let p = 0;
  const take = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | stream[p++];
    return v;
  };
  assert.equal(take(4), 4, 'chế độ byte');
  const len = take(ver <= 9 ? 8 : 16);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = take(8);
  return { text: new TextDecoder().decode(out), ver, level, mask };
}
// Số khối theo bảng của chuẩn (bảng trong lib; tổng mã sửa lỗi đã đối chiếu qua dung lượng chuẩn ở trên)
const blocksOf = (ver, level) => Q.NUM_BLOCKS[level][ver];

test('QR: mã tạo ra đọc ngược đúng nội dung (nhiều độ dài, mọi mặt nạ, tiếng Việt, phiên bản lớn)', () => {
  const samples = ['A', 'Xin chào BeinIOS — đăng nhập ✓', 'https://phungnhan.github.io/BeinIOS/nhap.html#BEINIOS1.' + 'x'.repeat(200), 'y'.repeat(700), 'z'.repeat(2900)];
  for (const s of samples) {
    const q = BG.qrEncode(s);
    assert.ok(q, 'tạo được mã cho ' + s.length + ' ký tự');
    const r = readQr(q.modules);
    assert.equal(r.text, s);
    assert.equal(r.ver, q.version);
    assert.equal(r.mask, q.mask);
  }
  for (let mask = 0; mask < 8; mask++) assert.equal(readQr(BG.qrEncode('Mặt nạ ' + mask, { mask }).modules).text, 'Mặt nạ ' + mask);
  for (const level of ['M', 'Q', 'H']) {
    const q = BG.qrEncode('Mức sửa lỗi ' + level + ' '.repeat(40), { level });
    const r = readQr(q.modules);
    assert.equal(r.level, q.level);
    assert.ok(['L', 'M', 'Q', 'H'].indexOf(r.level) >= ['L', 'M', 'Q', 'H'].indexOf(level));
  }
  // Mọi phiên bản 1–40 ở mọi mức: đọc ngược đúng (mã ngắn nhất ép vào từng phiên bản)
  for (let v = 1; v <= 40; v++) for (const level of ['L', 'H']) assert.equal(readQr(BG.qrEncode('v' + v, { level, minVersion: v }).modules).text, 'v' + v, `phiên bản ${v}-${level}`);
});

test('QR: chọn phiên bản nhỏ nhất, tự nâng mức sửa lỗi khi còn chỗ, quá dài thì trả null', () => {
  const q = BG.qrEncode('a'.repeat(17));
  assert.equal(q.version, 1);
  assert.equal(q.level, 'L');
  const small = BG.qrEncode('a'.repeat(7));
  assert.equal(small.version, 1);
  assert.equal(small.level, 'H'); // 7 byte vừa cả mức H ở phiên bản 1
  assert.equal(BG.qrEncode('a'.repeat(18)).version, 2);
  assert.equal(BG.qrEncode('a'.repeat(2953)).version, 40);
  assert.equal(BG.qrEncode('a'.repeat(2954)), null);
  const svg = BG.qrSvg(q);
  assert.match(svg, /^<svg [^>]*viewBox="0 0 29 29"/);
  assert.ok(/<path d="[Mhvz0-9,-]+"/.test(svg), 'SVG chỉ có lệnh vẽ bằng số');
});

// ---------- Đóng gói đăng nhập ----------

const ck = (name, value) => ({ name, value, domain: '.beincom.com', httpOnly: true });

test('BeinIOS: đóng gói gộp cookie trùng giữa các máy chủ, bỏ cookie thống kê, đọc lại đúng', () => {
  const jars = {
    api: [ck('sid', 'S1'), ck('_ga', 'GA1'), ck('mp_abc_mixpanel', '{}'), ck('__cf_bm', 'bot'), ck('Bic.Auth.deviceId', 'dev%201')],
    chat: [ck('sid', 'S1'), ck('MMAUTHTOKEN', 'M1')],
    auth: [ck('sid', 'S1'), ck('rt', 'R1'), ck('Bic.Auth.deviceId', 'dev%201')],
  };
  const p = BG.beiniosPack(jars, 1792000000000);
  assert.match(p.text, /^BEINIOS1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(p.count, { api: 2, chat: 2, auth: 3 });
  assert.equal(p.total, 4); // sid, deviceId, MMAUTHTOKEN, rt — mỗi cái một lần
  const u = BG.beiniosUnpack(p.text);
  assert.deepEqual(u, { at: 1792000000000, api: { sid: 'S1', 'Bic.Auth.deviceId': 'dev%201' }, chat: { sid: 'S1', MMAUTHTOKEN: 'M1' }, auth: { sid: 'S1', rt: 'R1', 'Bic.Auth.deviceId': 'dev%201' } });
  // Link trang nhận (mã QR) và đoạn dán kèm chữ thừa vẫn đọc được
  const link = BG.beiniosImportUrl(p.text);
  assert.equal(link, 'https://phungnhan.github.io/BeinIOS/nhap.html#' + p.text);
  assert.deepEqual(BG.beiniosUnpack(link), u);
  assert.deepEqual(BG.beiniosUnpack('  ' + p.text + '\n'), u);
  // Cùng tên khác giá trị ở hai máy chủ: giữ cả hai
  const two = BG.beiniosUnpack(BG.beiniosPack({ api: [ck('sid', 'A')], chat: [ck('sid', 'C')] }).text);
  assert.deepEqual([two.api, two.chat, two.auth], [{ sid: 'A' }, { sid: 'C' }, {}]);
});

test('BeinIOS: không có cookie Beincom (chỉ cookie thống kê) -> không tạo mã; đoạn hỏng -> null', () => {
  assert.deepEqual(BG.beiniosPack({ api: [ck('_ga', 'x')], chat: [], auth: [ck('rt', 'R')] }), { text: '', count: { api: 0, chat: 0, auth: 1 }, total: 0 });
  assert.equal(BG.beiniosUnpack('BEINIOS1.@@@'), null);
  assert.equal(BG.beiniosUnpack('sid=abc'), null);
  assert.equal(BG.beiniosUnpack('BEINIOS1.' + Buffer.from('{"v":2,"c":[]}').toString('base64url')), null);
});

test('BeinIOS: đoạn mẫu cố định (BeinIOS pwa-shim.js kiểm tra đọc đúng cùng đoạn này)', () => {
  const text = BG.beiniosPack({ api: [ck('sid', 'S1')], chat: [ck('MMAUTHTOKEN', 'M1')], auth: [ck('sid', 'S1'), ck('rt', 'R1')] }, 1792000000000).text;
  assert.equal(text, 'BEINIOS1.' + Buffer.from(JSON.stringify({ v: 1, t: 1792000000000, c: [['sid', 'S1', 5], ['MMAUTHTOKEN', 'M1', 2], ['rt', 'R1', 4]] })).toString('base64url'));
});
