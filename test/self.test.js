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
