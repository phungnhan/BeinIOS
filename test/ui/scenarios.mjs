// Kịch bản kiểm thử giao diện: mỗi kịch bản mở trang mới (dữ liệu mẫu trong stub.js) rồi bấm như người dùng.
// Lỗi JavaScript trong trang (exception, console.error) làm kịch bản trượt.

const B64_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TABS = ['overview', 'members', 'content', 'reports', 'compose', 'stats', 'settings', 'log'];

const toastText = (page) => page.ev(`[...document.querySelectorAll('.toast')].map((t) => t.textContent).pop() || ''`);
const confirmOk = async (page) => {
  await page.until(() => document.getElementById('confirm')?.open || !!document.getElementById('confirm-title').textContent);
  await page.ev(`document.getElementById('confirm-ok').click(); true`);
};
const setValue = (page, id, value) =>
  page.call(
    (i, v) => {
      const e = document.getElementById(i);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    id,
    value,
  );
// Chọn file ảnh giả cho một <input type=file>
const pickImage = (page, id, name = 'anh.png') =>
  page.call(
    (i, n, b64) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bin], n, { type: 'image/png' }));
      const input = document.getElementById(i);
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      return true;
    },
    id,
    name,
    B64_PNG,
  );

export const scenarios = [
  {
    name: 'Mọi tab hiện được',
    async run({ page, url, assert }) {
      await page.open(url('dashboard'));
      for (const t of TABS) {
        await page.ev(`showTab(${JSON.stringify(t)}); true`);
        const info = await page.call((tab) => {
          const cards = [...document.querySelectorAll(`main > [data-tab="${tab}"]`)].filter((s) => !s.hidden);
          return { cards: cards.length, text: cards.reduce((n, c) => n + c.innerText.trim().length, 0) };
        }, t);
        assert.ok(info.cards > 0 && info.text > 20, `tab ${t} trống`);
      }
    },
  },
  {
    name: 'Popup',
    async run({ page, url, assert }) {
      await page.open(url('popup'), { width: 380, height: 600 });
      await page.until(() => document.getElementById('todo').children.length > 0);
      assert.ok(Number(await page.ev(`document.getElementById('flagged').textContent`)) > 0);
    },
  },
  {
    name: 'Đăng bài: nhắc tên rồi đăng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`document.querySelector('#compose-groups input[type=checkbox]').click(); true`);
      await page.call(() => {
        const ta = document.getElementById('compose-text');
        ta.focus();
        ta.value = 'Cảm ơn @ki';
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.dispatchEvent(new Event('input'));
        return true;
      });
      await page.until(() => document.querySelectorAll('#mention-pop .mention-item').length > 0);
      await page.ev(`document.getElementById('compose-text').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); true`);
      const v = await page.ev(`document.getElementById('compose-text').value`);
      assert.match(v, /^Cảm ơn @\w+ $/);
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__composes || []).length === 1);
      const m = await page.ev(`window.__composes[0]`);
      assert.equal(Object.keys(m.mentions).length, 1);
      assert.equal(m.scheduledAt, null);
    },
  },
  {
    name: 'Hẹn giờ: Giờ tốt nhất',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.call(() => {
        [...document.querySelectorAll('#compose-groups input[type=checkbox]')][1].click();
        const r = document.querySelector('input[name=compose-when][value=later]');
        r.checked = true;
        r.dispatchEvent(new Event('change'));
        return true;
      });
      assert.equal(await page.ev(`document.getElementById('btn-best-time').hidden`), false);
      await page.ev(`document.getElementById('btn-best-time').click(); true`);
      await page.until(() => document.querySelectorAll('#best-times button.best-chip').length > 0, 6000);
      const before = await page.ev(`document.getElementById('compose-at').value`);
      await page.ev(`document.querySelector('#best-times button.best-chip').click(); true`);
      const after = await page.ev(`document.getElementById('compose-at').value`);
      assert.ok(after && after !== before);
      assert.match(await page.ev(`document.getElementById('btn-compose').textContent`), /Hẹn giờ/);
    },
  },
  {
    name: 'Lịch tháng / tuần, nút +',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`loadScheduled(); true`);
      await page.until(() => sched.loaded);
      await page.ev(`document.querySelector('#sched-view button[data-f=month]').click(); true`);
      const m = await page.call(() => ({ days: document.querySelectorAll('#sched-cal .cal-day').length, items: document.querySelectorAll('#sched-cal .cal-item').length, list: document.getElementById('sched-list').hidden }));
      assert.ok(m.days >= 28 && m.items >= 5 && m.list);
      await page.call(() => {
        const days = [...document.querySelectorAll('#sched-cal .cal-day')].filter((d) => d.querySelector('.cal-add'));
        days.at(-1).querySelector('.cal-add').click();
        return true;
      });
      assert.equal(await page.ev(`document.querySelector('input[name=compose-when]:checked').value`), 'later');
      await page.ev(`document.querySelector('#sched-cal .cal-item').click(); true`);
      await page.until(() => document.querySelectorAll('#scheduled-body tr.flash').length === 1);
      assert.equal(await page.ev(`document.getElementById('sched-cal').hidden`), true);
    },
  },
  {
    name: 'Nhập CSV',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`readCsvFile(new File([BG.csvTemplate(csvGroups().slice(0, 2).map((g) => g.path))], 'mau.csv', { type: 'text/csv' })).then(() => true)`);
      const info = await page.call(() => ({ rows: document.querySelectorAll('#csv-body tr').length, bad: document.querySelectorAll('#csv-body tr.csv-bad').length, btn: document.getElementById('btn-csv-submit').textContent }));
      assert.deepEqual(info, { rows: 2, bad: 0, btn: 'Hẹn giờ 2 bài' });
      await page.ev(`document.getElementById('btn-csv-submit').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__composes || []).length === 2, 12000);
      assert.equal(await page.ev(`document.getElementById('btn-csv-submit').textContent`), 'Đã hẹn xong');
    },
  },
  {
    name: 'Article: trình soạn thảo',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      const sel = (text, s, e) =>
        page.call(
          (t, a, b) => {
            const ta = document.getElementById('art-content');
            ta.value = t;
            ta.focus();
            ta.setSelectionRange(a, b);
            ta.dispatchEvent(new Event('input'));
            return true;
          },
          text,
          s,
          e,
        );
      const click = (md) => page.ev(`document.querySelector('#art-toolbar button[data-md=${md}]').click(); true`);
      const val = () => page.ev(`document.getElementById('art-content').value`);
      await sel('Xin chào cả nhà', 4, 8);
      await click('bold');
      assert.equal(await val(), 'Xin **chào** cả nhà');
      await sel('Thị trường', 0, 0);
      await click('h2');
      assert.equal(await val(), '## Thị trường');
      await sel('Chữ', 3, 3);
      await click('table');
      assert.match(await val(), /\| Cột 1 \| Cột 2 \| Cột 3 \|\n\|---\|---\|---\|/);
      await sel('abc', 0, 3);
      await page.ev(`document.getElementById('art-content').dispatchEvent(new KeyboardEvent('keydown', { key: 'u', ctrlKey: true, bubbles: true })); true`);
      assert.equal(await val(), '++abc++');
      await page.ev(`document.querySelector('#art-view button[data-f=split]').click(); true`);
      await sel('## Mục\n- a\n| A | B |\n|---|---|\n| 1 | 2 |', 0, 0);
      const pv = await page.call(() => ({ split: document.getElementById('art-editor').classList.contains('split'), h2: document.querySelector('#art-preview h2')?.textContent, td: document.querySelectorAll('#art-preview td').length }));
      assert.deepEqual(pv, { split: true, h2: 'Mục', td: 2 });
    },
  },
  {
    name: 'Article hẹn giờ và Series',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`[...document.querySelectorAll('#art-groups input[type=checkbox]')][1].click(); true`);
      await setValue(page, 'art-title', 'Bản tin tuần');
      await setValue(page, 'art-content', '## Thị trường\nBTC tăng **8%**.');
      await page.until(() => document.querySelectorAll('#art-cats .art-chip').length > 0);
      await page.ev(`document.querySelector('#art-cats .art-chip').click(); true`);
      await pickImage(page, 'art-cover-file', 'bia.png');
      await page.call(() => {
        const r = document.querySelector('input[name=art-when][value=later]');
        r.checked = true;
        r.dispatchEvent(new Event('change'));
        return true;
      });
      await page.until(() => !document.getElementById('btn-art-submit').disabled);
      await page.ev(`document.getElementById('btn-art-submit').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__articles || []).length === 1, 6000);
      const a = await page.ev(`window.__articles[0]`);
      assert.equal(a.type, 'composeArticle');
      assert.ok(a.scheduledAt && a.categoryIds.length === 1 && a.coverId);
      assert.deepEqual(await page.ev(`window.__uploadResources`), ['article:cover']);
      // Series
      await page.ev(`document.querySelector('#article-mode button[data-f=series]').click(); true`);
      await setValue(page, 'art-title', 'Kiến thức ví');
      await pickImage(page, 'art-cover-file', 's.png');
      await page.until(() => !document.getElementById('btn-art-submit').disabled);
      await page.ev(`document.getElementById('btn-art-submit').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__articles || []).length === 2, 6000);
      assert.equal(await page.ev(`window.__articles[1].type`), 'composeSeries');
    },
  },
  {
    name: 'Sửa bài hẹn giờ',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=compose'));
      await page.ev(`loadScheduled(); true`);
      await page.until(() => sched.loaded);
      const edits = await page.ev(`[...document.querySelectorAll('#scheduled-body button')].filter((b) => b.textContent === 'Sửa').length`);
      assert.equal(edits, 1); // chỉ bài của chính mình
      await page.ev(`[...document.querySelectorAll('#scheduled-body button')].find((b) => b.textContent === 'Sửa').click(); true`);
      await page.until(() => !!compose.edit?.scheduled);
      assert.equal(await page.ev(`document.getElementById('btn-compose').textContent`), 'Lưu bài hẹn giờ');
      assert.notEqual(await page.ev(`getComputedStyle(document.getElementById('compose-at')).display`), 'none');
      await setValue(page, 'compose-text', 'Nội dung đã sửa');
      await page.ev(`document.getElementById('btn-compose').click(); true`);
      await confirmOk(page);
      await page.until(() => !!window.__lastEditSched);
      const m = await page.ev(`window.__lastEditSched`);
      assert.deepEqual([m.type, m.content], ['editScheduled', 'Nội dung đã sửa']);
      assert.equal(await page.ev(`!!compose.edit`), false);
    },
  },
  {
    name: 'Tự duyệt bài tin cậy: cài đặt và nút ⭐',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      await page.ev(`document.getElementById('autoApprovePosts').click(); true`);
      await setValue(page, 'trustedMembers', '@Lan, kai');
      await setValue(page, 'trustAfterApproved', '5');
      await page.until(() => chrome.storage.local.get('settings').then((o) => o.settings.trustAfterApproved === 5 && o.settings.trustedMembers.length === 2 && o.settings.autoApprovePosts));
      await page.ev(`showTab('content'); true`);
      await page.ev(`[...document.querySelectorAll('#approval-body button')].find((b) => b.textContent === '⭐').click(); true`);
      await page.until(() => [...document.querySelectorAll('#approval-body .tag')].some((t) => t.textContent.includes('Tin cậy')));
      const list = await page.ev(`chrome.storage.local.get('settings').then((o) => o.settings.trustedMembers)`);
      assert.equal(list.length, 3);
    },
  },
  {
    name: 'Quản lý tag',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      await page.until(() => document.querySelectorAll('#tags-body tr').length > 0);
      assert.equal(await page.ev(`document.getElementById('btn-tag-create').disabled`), true); // community đầu không có quyền
      await setValue(page, 'tags-group', 'gCL');
      await page.until(() => !document.getElementById('btn-tag-create').disabled);
      const unlocked = await page.ev(`[...document.querySelectorAll('#tags-body button.danger')].filter((b) => !b.disabled).length`);
      assert.equal(unlocked, 2); // chỉ tag chưa dùng
      await setValue(page, 'tags-new', 'defi');
      await page.ev(`document.getElementById('btn-tag-create').click(); true`);
      assert.match(await toastText(page), /đã có tag DEFI/);
      await setValue(page, 'tags-new', 'phân tích');
      await page.ev(`document.getElementById('btn-tag-create').click(); true`);
      await confirmOk(page);
      await page.until(() => (window.__tagActs || []).length === 1);
      assert.deepEqual(await page.ev(`window.__tagActs[0]`), { type: 'tagAct', action: 'create', groupId: 'gCL', name: 'PHÂN TÍCH' });
      await page.until(() => document.getElementById('tags-count').textContent === '7 tag');
    },
  },
  {
    name: 'Lọc bài và Dọn tài khoản',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=content'));
      await page.ev(`document.querySelector('#recent-filter button[data-f=all]').click(); true`);
      const rows = () => page.ev(`document.querySelectorAll('#recent-body tr:not(.empty-row)').length`);
      assert.equal(await rows(), 3);
      await setValue(page, 'recent-q', '@airdrop');
      assert.equal(await rows(), 1);
      await setValue(page, 'recent-q', '');
      await page.ev(`document.querySelector('#recent-body .cleanup-btn').click(); true`);
      await page.until(() => document.querySelectorAll('#confirm-list li').length > 0);
      await page.ev(`document.querySelector('#confirm-extra input[type=checkbox]').click(); true`);
      await confirmOk(page);
      await page.until(() => !!window.__cleanup);
      const m = await page.ev(`window.__cleanup`);
      assert.deepEqual([m.user.id, m.reasonType, m.ban], ['at1', 'SPAM', true]);
      await page.until(() => document.querySelectorAll('#recent-body tr:not(.empty-row)').length === 2);
    },
  },
  {
    name: 'Hiệu quả bài đã đăng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      await page.ev(`showTab('stats'); true`);
      await page.until(() => document.querySelectorAll('#ins-body tr').length === 5);
      assert.ok((await page.ev(`document.querySelectorAll('#ins-best .best-chip').length`)) > 0);
      await page.ev(`document.querySelector('#ins-sort button[data-f=score]').click(); true`);
      assert.match(await page.ev(`document.querySelector('#ins-body tr td').innerText`), /Bản tin thị trường/);
      await page.ev(`document.getElementById('btn-ins-refresh').click(); true`);
      await page.until(() => [...document.querySelectorAll('.toast')].some((t) => /Đã cập nhật số liệu/.test(t.textContent)));
    },
  },
  {
    name: 'Báo cáo tháng',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      const months = await page.ev(`[...document.querySelectorAll('#monthly-month option')].map((o) => [o.value, o.selected])`);
      assert.equal(months.length, 3);
      assert.deepEqual(months[1], [await page.ev(`BG.shiftMonth(BG.monthKey(), -1)`), true]); // mặc định tháng trước
      assert.equal(await page.ev(`document.getElementById('monthly-out').hidden`), true);
      await page.ev(`document.getElementById('btn-monthly-run').click(); true`);
      await page.until(() => !document.getElementById('monthly-out').hidden);
      assert.equal((await page.ev(`window.__monthly`)).groupId, 'gFood'); // community đầu tiên
      await setValue(page, 'monthly-group', 'gCL');
      assert.equal(await page.ev(`document.getElementById('monthly-out').hidden`), true); // đổi group: tạo lại
      await page.ev(`document.getElementById('btn-monthly-run').click(); true`);
      await page.until(() => !document.getElementById('monthly-out').hidden && window.__monthly.groupId === 'gCL');
      const info = await page.call(() => ({
        tiles: [...document.querySelectorAll('#monthly-tiles .stat-tile .value')].map((x) => x.textContent),
        posts: document.querySelectorAll('#monthly-posts tr').length,
        newAuthor: [...document.querySelectorAll('#monthly-authors tr')].some((tr) => /Người m1/.test(tr.textContent) && /Người mới/.test(tr.textContent)),
        text: document.getElementById('monthly-text').textContent,
      }));
      // 12361 hiện tại, sau tháng báo cáo có 1 người bị xoá => cuối tháng 12362; vào 5, rời 1 (m2 rời ngay ngày đầu)
      assert.deepEqual(info.tiles.slice(0, 4), ['12.362', '+5 / −1', '80%', '6']);
      assert.equal(info.posts, 5);
      assert.ok(info.newAuthor);
      assert.match(info.text, /^BeinGroup: báo cáo Tháng \d+\/\d{4} — Crypto Life\n• Thành viên: 12\.358 → 12\.362 \(\+4\)/);
      assert.match(info.text, /• Người mới trong tháng: 5 người · còn ở lại 4 \(80%\) · 1 tự rời · đã đăng bài 1/);
      assert.match(info.text, /• Bài viết: 6 bài \(tháng trước 4, \+50%\)/);
      await page.ev(`navigator.clipboard.writeText = async (t) => { window.__clip = t; }; document.getElementById('btn-monthly-copy').click(); true`);
      await page.until(() => window.__clip && /Đã sao chép báo cáo/.test([...document.querySelectorAll('.toast')].map((t) => t.textContent).join()));
      assert.equal(await page.ev(`window.__clip`), info.text);
      await page.ev(`document.getElementById('btn-monthly-tg').click(); true`);
      await page.until(() => !!window.__tgReport);
      const tg = await page.ev(`window.__tgReport`);
      assert.match(tg.title, /^BeinGroup: báo cáo Tháng \d+\/\d{4} — Crypto Life$/);
      assert.match(tg.text, /^• Thành viên:/);
      // Mở từ thông báo đầu tháng: tự tạo báo cáo tháng trước
      await page.open(url('dashboard', 'tab=stats&monthly=1'));
      await page.until(() => !!window.__monthly && !document.getElementById('monthly-out').hidden);
    },
  },
  {
    name: 'Thành viên mới có ở lại không',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=stats'));
      await setValue(page, 'ret-group', 'gCL');
      await page.ev(`document.querySelector('#ret-range button[data-f="60"]').click(); document.getElementById('btn-ret-run').click(); true`);
      await page.until(() => !document.getElementById('ret-out').hidden);
      assert.deepEqual(await page.ev(`window.__retention`), { type: 'retention', groupId: 'gCL', days: 60 });
      const info = await page.call(() => ({
        tiles: [...document.querySelectorAll('#ret-tiles .stat-tile .value')].map((x) => x.textContent),
        weeks: document.querySelectorAll('#ret-weeks tr').length,
        rows: document.querySelectorAll('#ret-body tr').length,
        status: [...document.querySelectorAll('#ret-body .tag')].map((t) => t.textContent),
        nudge: document.getElementById('btn-ret-nudge').textContent,
      }));
      assert.deepEqual(info.tiles, ['8', '75%', '83%', '–', '25%', '3']);
      assert.ok(info.weeks >= 4);
      assert.equal(info.rows, 8);
      assert.ok(info.status.includes('Tự rời trong ngày đầu') && info.status.includes('Bị xoá sau 9 ngày'));
      assert.match(info.nudge, /\(3\)$/);
      await page.ev(`document.querySelector('#ret-filter button[data-f="silent"]').click(); true`);
      assert.equal(await page.ev(`document.querySelectorAll('#ret-body tr').length`), 3);
      await page.ev(`document.querySelector('#ret-filter button[data-f="gone"]').click(); true`);
      assert.equal(await page.ev(`document.querySelectorAll('#ret-body tr').length`), 2);
      // Soạn bài nhắc người chưa hoạt động vào ô Đăng bài
      await page.ev(`document.getElementById('btn-ret-nudge').click(); true`);
      await page.until(() => currentTab === 'compose' && /@newbie1/.test(document.getElementById('compose-text').value));
      const c = await page.call(() => ({ text: document.getElementById('compose-text').value, groups: [...compose.groupIds], mentions: Object.keys(compose.mentions) }));
      assert.deepEqual(c.groups, ['gCL']);
      assert.ok(['newbie1', 'newbie6', 'newbie7'].every((k) => c.mentions.includes(k)));
      assert.match(c.text, /^Chào @newbie1, @newbie6, @newbie7 👋\n\nCác bạn vào Crypto Life/);
    },
  },
  {
    name: 'Có gì mới sau khi cập nhật',
    async run({ page, url, assert }) {
      // Đã xem tới v0.22.0: hiện các bản mới hơn, mới nhất trước
      await page.open(url('dashboard', 'tab=overview&seen=0.22.0'));
      await page.until(() => document.getElementById('whatsnew').open);
      const info = await page.call(() => ({
        title: document.getElementById('whatsnew-title').textContent,
        heads: [...document.querySelectorAll('#whatsnew-body h4')].map((h) => h.textContent),
        items: document.querySelectorAll('#whatsnew-body li').length,
        bold: !!document.querySelector('#whatsnew-body li b, #whatsnew-body li strong'),
      }));
      const version = await page.ev(`chrome.runtime.getManifest().version`);
      assert.equal(info.title, `BeinGroup đã cập nhật lên v${version}`);
      assert.ok(info.heads[0].startsWith(`v${version} — `));
      assert.ok(info.heads.every((h) => !/^v0\.(22|21|20)\./.test(h)));
      assert.ok(info.items >= 3 && info.bold);
      await page.ev(`document.getElementById('whatsnew-ok').click(); true`);
      await page.until(() => !document.getElementById('whatsnew').open);
      assert.equal(await page.ev(`chrome.storage.local.get('seenVersion').then((o) => o.seenVersion)`), version);
      // Link cuối trang: xem lại 3 bản mới nhất
      await page.ev(`document.getElementById('btn-whatsnew').click(); true`);
      await page.until(() => document.getElementById('whatsnew').open && document.querySelectorAll('#whatsnew-body h4').length === 3);
      // Đang dùng bản mới nhất thì không tự hiện
      await page.open(url('dashboard', 'tab=overview'));
      await new Promise((r) => setTimeout(r, 400));
      assert.equal(await page.ev(`document.getElementById('whatsnew').open`), false);
    },
  },
  {
    name: 'Mở từ thông báo việc đầu tuần',
    async run({ page, url }) {
      await page.open(url('dashboard', 'tab=compose&welcome=1'));
      await page.until(() => window.__msgs.some((m) => m.type === 'newMembers') && currentTab === 'compose');
    },
  },
  {
    name: 'Telegram: lưu cài đặt có nút xử lý',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=settings'));
      await page.ev(`document.getElementById('tg-enabled').click(); true`);
      await setValue(page, 'tg-token', '123456789:' + 'B'.repeat(35));
      await page.ev(`document.getElementById('btn-tg-chat').click(); true`);
      await page.until(() => !!document.getElementById('tg-chat').value);
      await page.ev(`document.getElementById('tg-actions').click(); document.getElementById('btn-tg-save').click(); true`);
      await page.until(() => chrome.storage.local.get('telegram').then((o) => !!o.telegram?.actions));
      const t = await page.ev(`chrome.storage.local.get('telegram').then((o) => o.telegram)`);
      assert.deepEqual([t.enabled, t.actions, !!t.chatId], [true, true, true]);
    },
  },
  {
    name: 'Việc cần làm',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=overview'));
      await page.until(() => document.querySelectorAll('#todo-list .todo-item').length >= 3);
    },
  },
  {
    name: 'Lỗi kỹ thuật',
    async run({ page, url, assert }) {
      await page.open(url('dashboard', 'tab=log'));
      await page.until(() => document.querySelectorAll('#diag-body tr:not(.empty-row)').length === 2);
      await page.ev(`navigator.clipboard.writeText = async (t) => { window.__clip = t; }; document.getElementById('btn-diag-copy').click(); true`);
      await page.until(() => [...document.querySelectorAll('.toast')].some((t) => /Đã sao chép báo cáo 2 lỗi/.test(t.textContent)));
      const clip = await page.ev(`window.__clip`);
      assert.match(clip.split('\n')[0], /^BeinGroup v\d+\.\d+\.\d+ · .* · 2 lỗi$/);
      assert.equal(clip.split('\n').filter((l) => /^\d\d:\d\d \d\d\/\d\d \[/.test(l)).length, 2);
      // Lỗi JavaScript của trang được ghi lại (lỗi cố ý nên bỏ khỏi danh sách lỗi của kịch bản)
      await page.ev(`setTimeout(() => { throw new Error('lỗi thử nghiệm'); }); true`);
      await page.until(() => chrome.storage.local.get('diagLog').then((o) => o.diagLog.some((e) => /lỗi thử nghiệm/.test(e.message))));
      page.problems.length = 0;
      await page.ev(`document.getElementById('btn-diag-reload').click(); true`);
      await page.until(() => document.querySelectorAll('#diag-body tr:not(.empty-row)').length === 3);
      await page.ev(`document.getElementById('btn-diag-clear').click(); true`);
      await page.until(() => document.querySelectorAll('#diag-body tr.empty-row').length === 1);
      assert.ok(true);
    },
  },
  {
    name: 'Màn hình điện thoại: không tràn ngang',
    async run({ page, url, assert }) {
      await page.open(url('dashboard'), { width: 390, height: 844, mobile: true });
      for (const t of TABS) {
        await page.ev(`showTab(${JSON.stringify(t)}); true`);
        const w = await page.ev(`document.documentElement.scrollWidth`);
        assert.ok(w <= 392, `tab ${t} rộng ${w}px`);
      }
    },
  },
];
