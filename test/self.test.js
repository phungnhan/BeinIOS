// Kiểm tra Hồ sơ cá nhân (lib/self.js): tài khoản, quyền quản trị theo cộng đồng, trạng thái addon
const test = require('node:test');
const assert = require('node:assert/strict');
const BG = require('../common.js');

const groups = [
  { id: 'g1', name: 'Crypto Life', communityId: 'c9', isCommunity: true, roles: ['role_COMMUNITY_ADMIN'] },
  { id: 'g2', name: 'CL - General', communityId: 'c9', communityName: 'Crypto Life', roles: ['role_GROUP_ADMIN'] },
  { id: 'g4', name: 'CL - Hỏi đáp', communityId: 'c9', communityName: 'Crypto Life', roles: ['role_GROUP_ADMIN'] },
  { id: 'g3', name: 'Food', communityId: 'c8', isCommunity: true, roles: ['role_OWNER', 'role_COMMUNITY_ADMIN'] },
  // Chỉ quản trị group con (không quản trị community gốc)
  { id: 'g5', name: 'Bếp - Món chay', communityId: 'c7', communityName: 'Bếp Việt', roles: ['role_GROUP_ADMIN'] },
];

test('Hồ sơ cá nhân: gộp quyền theo cộng đồng (vai trò cao nhất, số group con), chủ sở hữu lên đầu', () => {
  const p = BG.selfProfile({ me: { id: 'u1', username: 'kai', fullname: 'Kai Crypto', avatar: 'https://media.beincom.com/a.png', verified: true }, groups, settings: { chatEnabled: false, intervalMin: 30 } });
  assert.equal(p.name, 'Kai Crypto');
  assert.equal(p.avatar, 'https://media.beincom.com/a.png');
  assert.equal(p.verified, true);
  assert.equal(p.summary, 'Quản trị 3 cộng đồng');
  const admin = p.sections.find((s) => s.title === 'Quyền quản trị');
  assert.equal(admin.note, '3 cộng đồng · 5 group đang quản trị · chủ 1 cộng đồng');
  assert.deepEqual(
    admin.rows.map((r) => [r.label, r.value]),
    [
      ['Food', 'Chủ sở hữu'],
      ['Crypto Life', 'Admin community · 2 group con'],
      ['Bếp Việt', 'Admin group · 1 group con'],
    ],
  );
  assert.equal(admin.rows[1].href, 'https://group.beincom.com/community-detail/c9');
  assert.equal(admin.rows[2].href, 'https://group.beincom.com/community-detail/c7', 'chỉ quản trị group con: vẫn có link trang cộng đồng');
  assert.deepEqual(p.links, [{ label: 'Trang cá nhân trên Beincom', href: 'https://group.beincom.com/users/kai' }]);
});

test('Hồ sơ cá nhân: tài khoản Chat, trạng thái quét, Chạy thử; chưa quét / chưa có tài khoản', () => {
  const t = Date.parse('2026-10-21T05:15:00Z');
  const p = BG.selfProfile({ me: { id: 'u1', username: 'kai', fullname: 'Kai' }, chatMe: { chatId: 'c1', username: 'kai.chat', pictureAt: 7 }, groups, settings: { chatEnabled: true, intervalMin: 120, dryRun: true }, lastScan: t, lastResult: { status: 'need_login' } });
  const acc = p.sections.find((s) => s.title === 'Tài khoản').rows;
  assert.deepEqual(acc.map((r) => r.label), ['Tên đăng nhập', 'Mã Beincom', 'Chat Beincom']);
  assert.equal(acc[1].copy, true);
  assert.deepEqual([acc[2].value, acc[2].tone], ['Đã kết nối · @kai.chat', 'ok']);
  const addon = p.sections.find((s) => s.title === 'Addon').rows;
  assert.match(addon[0].value, /cần đăng nhập$/);
  assert.equal(addon[0].tone, 'bad');
  assert.equal(addon[1].value, 'Mỗi 2 giờ');
  assert.equal(addon[2].tone, 'warn');
  assert.deepEqual([p.chatId, p.pictureAt], ['c1', 7]);

  const empty = BG.selfProfile({});
  assert.equal(empty.name, '');
  assert.match(empty.sections.find((s) => s.title === 'Quyền quản trị').note, /Chưa thấy cộng đồng nào/);
  assert.equal(empty.sections.find((s) => s.title === 'Addon').rows[0].value, 'Chưa quét');
  assert.deepEqual(empty.links, []);
  assert.equal(BG.selfProfile({ settings: { chatEnabled: true } }).sections[0].rows[0].value, 'Đang chờ kết nối');
});

test('Hồ sơ cá nhân: thông tin trang cá nhân Beincom, số thành viên / việc chờ theo cộng đồng, hoạt động 30 ngày, ô số liệu', () => {
  const now = Date.parse('2026-11-09T05:00:00Z');
  const gs = [
    { id: 'g1', name: 'Crypto Life', communityId: 'c9', isCommunity: true, roles: ['role_COMMUNITY_ADMIN'], userCount: 12000, pendingTotal: 3, approvalCount: 2, reportIds: ['r1'] },
    { id: 'g2', name: 'CL - General', communityId: 'c9', communityName: 'Crypto Life', roles: ['role_GROUP_ADMIN'], userCount: 900, pendingTotal: 1, approvalCount: 2 },
    { id: 'g5', name: 'Bếp - Món chay', communityId: 'c7', communityName: 'Bếp Việt', roles: ['role_GROUP_ADMIN'], userCount: 640 },
  ];
  const info = BG.slimSelfInfo({ id: 'u1', username: 'kai', fullname: 'Kai Crypto', avatar: 'a.png', description: ' Admin ', gender: 'FEMALE', birthday: '1995-04-20', language: ['vi', 'xx'], relationship_status: 'MARRIED', email: 'kai@example.com', country_code: '+84', phone: '912345678', city: '', is_verified: true });
  const day = 864e5;
  const log = [
    { time: now - day, kind: 'member', action: 'approve', status: 'ok', source: 'manual' },
    { time: now - 2 * day, kind: 'member', action: 'approve', status: 'ok', source: 'auto' },
    { time: now - 3 * day, kind: 'post', action: 'hide', status: 'ok' },
    { time: now - 3 * day, kind: 'post', action: 'hide', status: 'error' },
    { time: now - 40 * day, kind: 'manage', action: 'ban', status: 'ok' },
  ];
  const p = BG.selfProfile({ me: { id: 'u1', username: 'kai', fullname: 'Kai' }, groups: gs, info, log, version: '0.63.0', now });
  assert.deepEqual([p.name, p.bio, p.verified], ['Kai Crypto', 'Admin', true]);
  const sec = (k) => p.sections.find((s) => s.key === k);
  assert.deepEqual(p.sections.map((s) => s.key), ['account', 'info', 'admin', 'activity', 'addon']);
  assert.deepEqual(sec('info').rows.map((r) => [r.label, r.value]), [
    ['Họ và tên', 'Kai Crypto'],
    ['Giới tính', 'Nữ'],
    ['Ngày sinh', '20/04/1995'],
    ['Ngôn ngữ', 'Tiếng Việt, xx'],
    ['Tình trạng quan hệ', 'Đã kết hôn'],
    ['Email', 'kai@example.com'],
    ['Điện thoại', '+84 912345678'],
    ['Thành phố', 'Chưa có'],
  ]);
  assert.equal(sec('info').rows.find((r) => r.label === 'Thành phố').tone, 'none');
  assert.match(sec('info').note, /xác minh/);
  assert.deepEqual(sec('admin').rows.map((r) => [r.label, r.value, r.tone]), [
    ['Crypto Life', 'Admin community · 1 group con · 12.000 thành viên · 7 việc chờ', undefined],
    ['Bếp Việt', 'Admin group · 1 group con · 640 thành viên', undefined],
  ]);
  assert.deepEqual(sec('activity').rows.map((r) => [r.label, r.value]), [
    ['Duyệt thành viên', '2 · 1 tự động'],
    ['Ẩn bài', '1'],
    ['Thao tác lỗi', '1'],
  ]);
  assert.deepEqual(p.stats.map((x) => [x.key, x.value]), [
    ['communities', '2'],
    ['groups', '3'],
    ['members', '12.640'],
    ['pending', '7'],
    ['activity', '3'],
  ]);
  assert.equal(p.stats.find((x) => x.key === 'pending').hint, '4 yêu cầu · 2 bài · 1 báo cáo');
  assert.equal(sec('addon').rows[0].value, 'v0.63.0');
  // Trang Chat (không truyền nhật ký / thông tin): như trước — Tài khoản, Quyền quản trị, Addon
  assert.deepEqual(BG.selfProfile({ groups: gs }).sections.map((s) => s.title), ['Tài khoản', 'Quyền quản trị', 'Addon']);
  assert.equal(BG.selfProfile({ log: [] }).sections.find((s) => s.key === 'activity').note, 'Chưa có thao tác nào trong 30 ngày qua.');
  assert.equal(BG.slimSelfInfo(null), null);
});

test('Hồ sơ cá nhân chạy được ở trang chỉ nạp common.js + lib/self.js (trang Tài khoản của BeinIOS): không cần lib khác', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const ctx = vm.createContext({ console });
  ctx.self = ctx;
  for (const f of ['common.js', 'lib/self.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
  const p = ctx.BG.selfProfile({ groups, log: [{ time: Date.now() - 1000, kind: 'member', action: 'approve', status: 'ok' }] });
  assert.deepEqual(JSON.parse(JSON.stringify(p.sections.map((s) => s.key))), ['account', 'admin', 'activity', 'addon']);
  assert.equal(p.stats.find((x) => x.key === 'activity').value, '1');
});
