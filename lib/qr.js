// BeinFusion — tạo mã QR (chuẩn ISO/IEC 18004: chế độ byte, phiên bản 1–40, chọn mặt nạ tốt nhất).
// Một phần của BG: common.js tạo BG, các phần trong lib/ nạp sau theo thứ tự BG.PARTS và gắn thêm hàm vào BG.
// Chỉ có hàm thuần. Dùng cho nút "Chuyển đăng nhập sang BeinIOS" (Dashboard → Cài đặt): điện thoại quét mã trên màn hình.
(function (part) {
  if (typeof module === 'object' && module.exports) module.exports = part;
  else part(self.BG);
})(function (BG) {
  const LEVELS = ['L', 'M', 'Q', 'H'];
  const FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };
  // Số mã sửa lỗi mỗi khối và số khối, theo mức sửa lỗi và phiên bản (chỉ số 0 không dùng)
  // prettier-ignore
  const ECC_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  };
  // prettier-ignore
  const NUM_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  };

  // Số ô dành cho dữ liệu + sửa lỗi (trừ hoa văn cố định, thông tin định dạng / phiên bản)
  function rawDataModules(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const align = Math.floor(ver / 7) + 2;
      n -= (25 * align - 10) * align - 55;
      if (ver >= 7) n -= 36;
    }
    return n;
  }
  const dataCodewords = (ver, level) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[level][ver] * NUM_BLOCKS[level][ver];
  const countBits = (ver) => (ver <= 9 ? 8 : 16); // độ dài ô "số byte" ở chế độ byte
  // Số byte tối đa ở chế độ byte
  const qrCapacity = (ver, level) => Math.floor((dataCodewords(ver, level) * 8 - 4 - countBits(ver)) / 8);

  // ---------- Reed–Solomon trên GF(256), đa thức 0x11D ----------
  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    const out = new Array(degree).fill(0);
    out[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) {
        out[j] = gfMul(out[j], root);
        if (j + 1 < degree) out[j] ^= out[j + 1];
      }
      root = gfMul(root, 2);
    }
    return out;
  }
  function rsRemainder(data, divisor) {
    const out = divisor.map(() => 0);
    for (const b of data) {
      const factor = b ^ out.shift();
      out.push(0);
      divisor.forEach((c, i) => (out[i] ^= gfMul(c, factor)));
    }
    return out;
  }

  // Chia dữ liệu thành khối, thêm mã sửa lỗi từng khối rồi xen kẽ các khối
  function addEcc(data, ver, level) {
    const numBlocks = NUM_BLOCKS[level][ver];
    const eccLen = ECC_PER_BLOCK[level][ver];
    const raw = Math.floor(rawDataModules(ver) / 8);
    const numShort = numBlocks - (raw % numBlocks);
    const shortLen = Math.floor(raw / numBlocks);
    const div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < numShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => {
        if (i !== shortLen - eccLen || j >= numShort) out.push(b[i]);
      });
    }
    return out;
  }

  function alignPositions(ver) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    const out = [6];
    for (let pos = ver * 4 + 17 - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  }

  function formatBits(level, mask) {
    const data = (FORMAT_BITS[level] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(ver) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    return (ver << 12) | rem;
  }
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  const MASKS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];

  // Ma trận có hoa văn cố định; m[y][x] = true là ô tối; fn[y][x] = ô của hoa văn (không chứa dữ liệu)
  function baseMatrix(ver) {
    const size = ver * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => {
      m[y][x] = dark;
      fn[y][x] = true;
    };
    for (let i = 0; i < size; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [
      [3, 3],
      [size - 4, 3],
      [3, size - 4],
    ]) {
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
        }
    }
    const pos = alignPositions(ver);
    const last = pos.length - 1;
    for (let i = 0; i <= last; i++)
      for (let j = 0; j <= last; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue; // trùng ô định vị
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    drawFormat(m, fn, 'L', 0); // chỗ cho thông tin định dạng (vẽ lại sau khi chọn mặt nạ)
    if (ver >= 7) {
      const vb = versionBits(ver);
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        set(a, b, bit(vb, i));
        set(b, a, bit(vb, i));
      }
    }
    return { size, m, fn };
  }

  function drawFormat(m, fn, level, mask) {
    const size = m.length;
    const bits = formatBits(level, mask);
    const set = (x, y, dark) => {
      m[y][x] = dark;
      fn[y][x] = true;
    };
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6));
    set(8, 8, bit(bits, 7));
    set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true); // ô tối cố định
  }

  // Đặt các byte theo đường zíc zắc từ góc dưới phải, từng cặp cột, bỏ cột định giờ số 6
  function placeData(m, fn, codewords) {
    const size = m.length;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && i < codewords.length * 8) {
            m[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  function applyMask(m, fn, mask) {
    const f = MASKS[mask];
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (!fn[y][x] && f(x, y)) m[y][x] = !m[y][x];
  }

  // Điểm phạt của chuẩn (càng thấp càng dễ quét): dải cùng màu, ô 2×2, mẫu giống ô định vị, cân bằng sáng tối
  function penalty(m) {
    const size = m.length;
    let score = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(m[y]);
    for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      const s = line.map((d) => (d ? '1' : '0')).join('');
      for (const pat of ['10111010000', '00001011101']) for (let k = s.indexOf(pat); k >= 0; k = s.indexOf(pat, k + 1)) score += 40;
    }
    for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
    let dark = 0;
    for (const row of m) for (const d of row) if (d) dark++;
    const total = size * size;
    score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }

  // Mã QR cho chuỗi text (UTF-8, chế độ byte). level: mức sửa lỗi tối thiểu; tự nâng mức nếu vẫn vừa cùng phiên bản.
  // Trả về { version, level, mask, size, modules } (modules[y][x] = true là ô tối), hoặc null nếu quá dài (> 2953 byte).
  function qrEncode(text, { level = 'L', minVersion = 1, maxVersion = 40, mask = -1 } = {}) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let ver = 0;
    for (let v = minVersion; v <= maxVersion; v++) {
      if (bytes.length <= qrCapacity(v, level)) {
        ver = v;
        break;
      }
    }
    if (!ver) return null;
    for (const up of LEVELS.slice(LEVELS.indexOf(level) + 1)) if (bytes.length <= qrCapacity(ver, up)) level = up;

    const capBits = dataCodewords(ver, level) * 8;
    const bits = [];
    const push = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    };
    push(4, 4); // chế độ byte
    push(bytes.length, countBits(ver));
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, capBits - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) push(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    const codewords = addEcc(data, ver, level);
    const { size, m, fn } = baseMatrix(ver);
    placeData(m, fn, codewords);
    let best = mask;
    if (best < 0) {
      let bestScore = Infinity;
      for (let k = 0; k < 8; k++) {
        const t = m.map((r) => r.slice());
        const tf = fn.map((r) => r.slice());
        applyMask(t, tf, k);
        drawFormat(t, tf, level, k);
        const sc = penalty(t);
        if (sc < bestScore) {
          bestScore = sc;
          best = k;
        }
      }
    }
    applyMask(m, fn, best);
    drawFormat(m, fn, level, best);
    return { version: ver, level, mask: best, size, modules: m };
  }

  // Hình SVG (chuỗi) của mã QR, có viền trắng 4 ô
  function qrSvg(qr, { border = 4, dark = '#000', light = '#fff' } = {}) {
    const n = qr.size + border * 2;
    const path = [];
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) path.push(`M${x + border},${y + border}h1v1h-1z`);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${path.join('')}" fill="${dark}"/></svg>`;
  }

  Object.assign(BG, {
    qrEncode,
    qrSvg,
    qrCapacity,
    // cho kiểm thử
    qrInternals: { gfMul, rsDivisor, rsRemainder, formatBits, versionBits, alignPositions, rawDataModules, addEcc, MASKS, dataCodewords, ECC_PER_BLOCK, NUM_BLOCKS },
  });
});
