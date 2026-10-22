// BeinIOS — Hướng dẫn riêng của webapp (Cài đặt → Về → Hướng dẫn). Thêm các chủ đề "ios-…" vào BG.HELP_TOPICS của addon
// (lib/help.js) và mục lục BG.IOS_HELP_INDEX; index.html dựng trang Hướng dẫn từ hai phần này. Không dẫn link ra ngoài.
(function (BG) {
  const IOS_TOPICS = {
    'ios-install': {
      title: '📲 Cài BeinIOS lên iPhone',
      sections: [
        {
          h: 'Thêm vào Màn hình chính',
          items: [
            [
              'Mở Safari, vào trang BeinIOS.',
              'Bấm Chia sẻ → Thêm vào Màn hình chính → Thêm.',
              'Từ nay mở BeinIOS từ biểu tượng trên Màn hình chính — dữ liệu của ứng dụng tách riêng với Safari.',
            ],
            'Lần đầu mở, ứng dụng tự hiện Proxy & Login để điền proxy và đăng nhập Beincom.',
          ],
        },
        {
          h: 'Dùng hằng ngày',
          items: [
            'Thanh dưới: Chat · Quản trị (Dashboard của addon) · Cài đặt. Mở một cuộc trò chuyện thì thanh dưới tự ẩn.',
            'Cập nhật: ứng dụng tự nhận bản mới khi mở lại; thấy "Có bản mới" thì chạm để cập nhật, hoặc Cài đặt → Tải lại ứng dụng.',
            'Cài đặt → Về → Addon BeinFusion mở bảng Có gì mới của addon.',
          ],
        },
      ],
    },

    'ios-proxy': {
      title: '🔑 Dựng proxy Cloudflare',
      sections: [
        {
          h: 'Vì sao cần proxy',
          items: [
            'Beincom chỉ cho trang group.beincom.com đọc kết quả, nên BeinIOS gửi mọi lệnh qua một proxy của riêng bạn trên Cloudflare (gói miễn phí là đủ).',
            'Proxy có khoá bí mật, chỉ nhận trang BeinIOS của bạn, chỉ chuyển tới máy chủ Beincom và không ghi nhật ký.',
          ],
        },
        {
          h: 'Tạo trên web (khoảng 5 phút)',
          items: [
            [
              'Đăng nhập Cloudflare → Workers & Pages → Create → Create Worker, đặt tên beinios-proxy → Deploy.',
              'Bấm Edit code, xoá mã mẫu, dán toàn bộ tệp cloudflare-proxy/worker.js trong mã BeinIOS → Deploy.',
              'Settings → Variables and Secrets → Add: ALLOWED_ORIGIN (Text) = địa chỉ trang BeinIOS, không kèm /BeinIOS/; PROXY_KEY (Secret) = một chuỗi ngẫu nhiên từ 32 ký tự.',
              'Settings → Observability: tắt Workers Logs (lệnh có cookie đăng nhập).',
              'Mở địa chỉ proxy thêm /health trên trình duyệt — thấy "status": "ok" là chạy.',
            ],
          ],
        },
        {
          h: 'Điền vào BeinIOS',
          items: ['Cài đặt → Proxy & Login: dán Địa chỉ (https://beinios-proxy.….workers.dev) và Khoá (PROXY_KEY), rồi đăng nhập Beincom. Không chia sẻ địa chỉ và khoá proxy.'],
        },
      ],
    },

    'ios-login': {
      title: '🔐 Đăng nhập Beincom',
      sections: [
        {
          h: 'Cách nhanh: từ addon trên máy tính',
          items: [
            [
              'Trên máy tính, mở cửa sổ ẩn danh, đăng nhập group.beincom.com (dùng Chat thì mở cả chat.beincom.com). Addon cần được bật "Cho phép ở chế độ ẩn danh".',
              'Dashboard addon → Cài đặt → 📱 BeinIOS → Chuyển đăng nhập sang BeinIOS. Lần đầu: mở mục Proxy của BeinIOS, điền địa chỉ + khoá như ở đây để có mã QR ngắn.',
              'Quét mã bằng Camera iPhone → mở trang → Chép.',
              'Ở BeinIOS: Cài đặt → Proxy & Login → Dán từ addon (iPhone hỏi thì bấm Dán).',
              'Đóng cửa sổ ẩn danh — đừng bấm Đăng xuất (đăng xuất làm phiên hết hiệu lực).',
            ],
            'Cửa sổ ẩn danh để BeinIOS có phiên riêng, không giành phiên với trình duyệt bạn đang dùng.',
          ],
        },
        {
          h: 'Cách khác: dán cURL từ F12 (không cần addon)',
          items: [
            [
              'Cửa sổ ẩn danh, đăng nhập group.beincom.com, bấm F12 → Network, lọc api.beincom.com, tải lại trang.',
              'Chuột phải một dòng → Copy → Copy as cURL (bash).',
              'Muốn dùng Chat: mở chat.beincom.com, lọc chat.beincom.com/api, chép một dòng như trên.',
              'Chuyển đoạn cURL sang iPhone, dán vào ô Beincom / Chat trong mục Cách khác của Proxy & Login.',
            ],
          ],
        },
        {
          h: 'Kiểm tra và giữ phiên',
          items: [
            'Bấm Lưu & kiểm tra: ứng dụng thử proxy, khoá, phiên Beincom và Chat — chỉ hiện số đếm, không hiện tên.',
            'Bật Tự làm mới phiên: khi Beincom báo hết hạn, ứng dụng tự làm mới một lần như web Beincom. Vẫn hết phiên thì dán đăng nhập mới.',
          ],
        },
      ],
    },

    'ios-notify': {
      title: '🔔 Thông báo trên iPhone',
      sections: [
        {
          h: 'Bật thông báo',
          items: [
            'Cài đặt → Thông báo. Chỉ có tác dụng khi mở BeinIOS từ biểu tượng trên Màn hình chính.',
            'Khi ứng dụng đang mở, thông báo hiện ở đầu màn hình; chạm vào sẽ tới đúng tab liên quan.',
            'Muốn tắt: Cài đặt của iPhone → Thông báo → BeinIOS.',
          ],
        },
      ],
    },

    'ios-limits': {
      title: '⚠ Giới hạn so với addon',
      sections: [
        {
          h: 'Khác với addon trên máy tính',
          items: [
            'Chỉ chạy khi ứng dụng đang mở: iPhone dừng ứng dụng chạy ngầm nên không quét định kỳ, không báo, không gửi Telegram khi đã đóng. Mở lại thì ứng dụng quét ngay.',
            'Không đăng nhập bằng mật khẩu trong ứng dụng (Beincom cần captcha) — dùng Dán từ addon hoặc cURL.',
            'Dữ liệu tách với addon: muốn mang quy tắc và cài đặt sang, trên máy tính Tải bản sao lưu rồi Khôi phục ở BeinIOS (Cài đặt → Sao lưu & khôi phục).',
            'Link tới trang Beincom (hồ sơ, bài gốc) mở ra Safari.',
            'AI trên web: Claude mở thẳng ứng dụng Claude (đã đăng nhập sẵn); ChatGPT / Gemini mở bằng link — iPhone tự mở ứng dụng nếu được, không thì mở trang web.',
          ],
        },
      ],
    },

    'ios-safety': {
      title: '🔒 An toàn',
      sections: [
        {
          h: 'Đăng nhập là chìa khoá tài khoản',
          items: [
            'Chỉ dán đăng nhập trên máy của bạn; xoá ghi chú / tin nhắn đã dùng để chuyển.',
            'Proxy & Login → Xoá đăng nhập khỏi máy này: xoá ngay.',
            'Dữ liệu lưu theo địa chỉ trang BeinIOS: các trang GitHub Pages khác của bạn cùng địa chỉ cũng đọc được — đừng đưa mã của người khác lên đó.',
            'Đăng nhập không có trong bản sao lưu. Proxy của riêng bạn có khoá, không ghi nhật ký.',
          ],
        },
      ],
    },

    'ios-history': {
      title: '🕘 Lịch sử BeinIOS',
      sections: [
        {
          h: '1.7.0 (23/10/2026)',
          items: [
            'Hướng dẫn ngay trong ứng dụng (Cài đặt → Về → Hướng dẫn), gom mọi chủ đề của BeinIOS và addon.',
            'AI trên web: Claude mở thẳng ứng dụng Claude trên iPhone, khỏi đăng nhập lại trên web.',
            'Cài đặt, Proxy & Login và các trang của addon gọn hơn: mô tả nằm trong gợi ý ⓘ, hướng dẫn dài trong ❓.',
          ],
        },
        {
          h: '1.6 (22/10/2026)',
          items: ['✨ Trả lời bình luận bằng AI, AI viết bài chào / vinh danh, tóm tắt bình luận (đi cùng addon 0.54–0.55).'],
        },
        {
          h: '1.5 (21/10/2026)',
          items: ['Hồ sơ cá nhân gọn hơn, Trang cá nhân sửa được trên Beincom, Nhật ký của tôi; thanh dưới kiểu Telegram; trang cài đặt con cùng kiểu iPhone.'],
        },
        {
          h: '1.4 (21/10/2026)',
          items: ['Cài đặt phân nhóm Quản trị / Tích hợp, Hồ sơ cá nhân kiểu Telegram, báo bản mới của addon.'],
        },
        {
          h: '1.1 – 1.3 (16–21/10/2026)',
          items: ['Đăng nhập bằng addon (Dán từ addon), mã QR ngắn qua proxy, giao diện điện thoại gọn hơn.'],
        },
        {
          h: '1.0 (16/10/2026)',
          items: ['Chạy thật phần nền của addon trên iPhone: proxy có khoá, lưu dữ liệu trong máy, tự làm mới phiên.'],
        },
      ],
    },
  };

  Object.assign(BG.HELP_TOPICS, IOS_TOPICS);
  // Mục lục của BeinIOS: phần riêng trước, rồi các chủ đề của addon (bỏ chủ đề chuyển đăng nhập — đã có ở ios-login)
  BG.IOS_HELP_INDEX = [
    { label: 'BeinIOS', topics: ['ios-install', 'ios-proxy', 'ios-login', 'ios-notify', 'ios-limits', 'ios-safety', 'ios-history'] },
    ...BG.HELP_INDEX.map((g) => ({ ...g, topics: g.topics.filter((k) => k !== 'beinios') })),
  ];
})(self.BG);
