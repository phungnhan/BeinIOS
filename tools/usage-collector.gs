// BeinFusion — nơi nhận báo cáo sử dụng ẩn danh (Google Apps Script gắn với một Google Sheet, triển khai dạng Web app).
// Addon chỉ gửi khi admin đã đồng ý; mỗi báo cáo là một dòng ở trang "Báo cáo". Hướng dẫn: tools/HUONG-DAN-THU-THAP.md
//
// Báo cáo gồm số đếm và cài đặt — không có tên group, tên thành viên, nội dung bài. Mã cài đặt là chuỗi ngẫu nhiên
// do addon tạo lúc admin đồng ý (để biết báo cáo nào cùng một máy), ghi chú là thứ admin tự điền (vd. tên).

var SHEET = 'Báo cáo';
var HEADERS = ['Nhận lúc', 'Mã cài đặt', 'Phiên bản', 'Trình duyệt', 'Dùng từ', 'Ngày có dùng (30 ngày)', 'Community', 'Group', 'Đang bật', 'Tính năng dùng (30 ngày)', 'Thao tác: tổng / tự động / Telegram / bấm tay / lỗi', 'Lỗi kỹ thuật', 'Tự kiểm tra: dùng được / bỏ qua / lỗi', 'Mục tự kiểm tra lỗi', 'Ghi chú'];
var MIN_GAP_SECONDS = 6 * 3600; // mỗi máy tối đa một báo cáo mỗi 6 giờ

function doGet() {
  return ContentService.createTextOutput('BeinFusion: nơi nhận báo cáo sử dụng đang chạy.');
}

function doPost(e) {
  var d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'json' });
  }
  if (!d || !['BeinGroup', 'BeinFusion'].includes(d.app) || d.v !== 1 || typeof d.installId !== 'string' || !/^[\w-]{8,64}$/.test(d.installId)) return reply({ ok: false, error: 'format' });

  var cache = CacheService.getScriptCache();
  if (cache.get(d.installId)) return reply({ ok: true, skipped: true });
  cache.put(d.installId, '1', MIN_GAP_SECONDS);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS);
      sh.setFrozenRows(1);
    }
    sh.appendRow(row(d, new Date()));
  } finally {
    lock.releaseLock();
  }
  return reply({ ok: true });
}

// Một dòng của bảng từ báo cáo (mọi ô là chữ đã làm sạch hoặc số)
function row(d, now) {
  var a = d.actions || {};
  var c = d.selfCheck || {};
  var features = d.features && typeof d.features === 'object' ? d.features : {};
  return [
    now,
    text(d.installId, 64),
    text(d.version, 20),
    text(d.browser, 40),
    text(d.since, 10),
    num(d.activeDays),
    num(d.communities),
    num(d.groups),
    text((d.flags || []).join(', '), 400),
    text(
      Object.keys(features)
        .map(function (k) {
          return k + ' ' + num(features[k]);
        })
        .join(' · '),
      1500,
    ),
    [num(a.total), num(a.auto), num(a.telegram), num(a.manual), num(a.failed)].join(' / '),
    text(num(d.errors && d.errors.count) + ((d.errors && d.errors.top && d.errors.top.length) ? ' — ' + d.errors.top.join('; ') : ''), 1500),
    c.ok == null ? '' : [num(c.ok), num(c.skip), num(c.fail)].join(' / '),
    text((c.failing || []).join(', '), 400),
    text(d.note, 80),
  ];
}

// Chữ an toàn cho ô Sheet: cắt độ dài, bỏ ký tự điều khiển, không để Sheet hiểu là công thức (= + - @)
function text(x, max) {
  var s = String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function num(x) {
  var n = Number(x);
  return isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
