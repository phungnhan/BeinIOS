// Đóng gói addon thành dist/BeinGroup-v<phiên bản>.zip để gửi cho admin khác: chỉ các tệp addon cần để chạy,
// kèm CHANGELOG.md và HUONG-DAN-CAI.html; trong zip là thư mục BeinGroup/ (giải nén ra là tải được ngay).
// Trước khi ghi, kiểm tra mọi tệp mà manifest, các trang HTML và service worker nhắc tới đều có trong gói.
//
// Chạy: node tools/pack.mjs
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FOLDER = 'BeinGroup';
// Không đưa vào gói: mã kiểm thử, công cụ, tài liệu cho người phát triển, tệp tạm
const SKIP_DIRS = new Set(['test', 'tools', 'dist', 'node_modules', '.git', '.github', '.vscode', '.idea', '.claude']);
const SKIP_FILES = new Set(['README.md', 'API.md', '.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'Thumbs.db', 'desktop.ini', '.DS_Store']);
const SKIP_EXT = new Set(['.zip', '.crx', '.pem', '.log']);

function walk(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) out.push(...walk(full, r));
    } else if (!SKIP_FILES.has(name) && !SKIP_EXT.has(path.extname(name).toLowerCase())) out.push(r);
  }
  return out;
}

// Tệp mà addon cần: theo manifest, thẻ <script> / <link> / ảnh trong các trang HTML, importScripts của service worker, BG.PARTS
function required(files) {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const need = new Map(); // tệp -> nơi nhắc tới
  const add = (f, from) => f && !need.has(f) && need.set(f.replace(/^\.\//, ''), from);
  add('manifest.json', 'gói');
  add(manifest.background?.service_worker, 'manifest.json');
  add(manifest.action?.default_popup, 'manifest.json');
  add(manifest.options_ui?.page, 'manifest.json');
  for (const p of [...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})]) add(p, 'manifest.json');
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const html = readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of html.matchAll(/\b(?:src|href)="([^"#:?]+)"/g)) add(path.posix.join(path.posix.dirname(f), m[1]), f);
  }
  const sw = readFileSync(path.join(ROOT, manifest.background.service_worker), 'utf8');
  for (const call of sw.matchAll(/importScripts\(([^)]*)\)/g)) for (const m of call[1].matchAll(/'([^']+\.js)'/g)) add(m[1], 'background.js');
  const BG = createRequire(import.meta.url)(path.join(ROOT, 'common.js'));
  for (const p of BG.PARTS) add(`lib/${p}.js`, 'BG.PARTS');
  return { manifest, need };
}

// ---------- Ghi tệp zip (deflate; tên tệp UTF-8) ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  if (zlib.crc32) return zlib.crc32(buf);
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function zip(entries) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const store = deflated.length >= data.length;
    const body = store ? data : deflated;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const files = walk(ROOT);
const { manifest, need } = required(files);
const missing = [...need].filter(([f]) => !files.includes(f));
if (missing.length) {
  console.error('Thiếu tệp addon cần:\n' + missing.map(([f, from]) => `  ${f} (nhắc ở ${from})`).join('\n'));
  process.exit(1);
}
for (const f of ['CHANGELOG.md', 'HUONG-DAN-CAI.html']) if (!files.includes(f)) throw new Error('Thiếu ' + f);
const version = manifest.version;
if (!new RegExp(`^## v${version.replace(/\./g, '\\.')}\\b`, 'm').test(readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'))) {
  console.error(`CHANGELOG.md chưa có mục cho v${version}`);
  process.exit(1);
}
const unused = files.filter((f) => !need.has(f) && !['CHANGELOG.md', 'HUONG-DAN-CAI.html'].includes(f));
const buf = zip(files.map((f) => ({ name: `${FOLDER}/${f}`, data: readFileSync(path.join(ROOT, f)) })));
mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', `BeinGroup-v${version}.zip`);
writeFileSync(out, buf);
console.log(`Đã tạo ${path.relative(ROOT, out)}: ${files.length} tệp, ${(buf.length / 1024).toFixed(0)} KB`);
if (unused.length) console.log('Có trong gói nhưng không trang nào nhắc tới (kiểm tra lại có cần không): ' + unused.join(', '));
