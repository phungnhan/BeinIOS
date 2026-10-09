// Service worker — Article và Series: đọc chuyên mục, đăng / hẹn giờ Article, tạo Series.
// Giống web Beincom:
//  - Article: POST content/articles (hoặc content/manage/groups/{id}/articles khi đăng dưới tên group) tạo nháp
//             -> PUT content/articles/{id}/publish | schedule. Bước 2 lỗi thì xoá bản nháp (DELETE content/articles/{id}).
//  - Series:  POST content/series (hoặc content/manage/groups/{id}/series) — đăng luôn, không có nháp.
//  - Ảnh bìa tải trước như ảnh bài viết, chỉ khác resource ('article:cover' / 'series:cover').

async function doCategories() {
  return withClient(async (client) => {
    const r = await client.call('GET', 'content/category?name='); // như web: name rỗng = tất cả (17 chuyên mục)
    if (r.status === 401) return { ...NEED_LOGIN };
    if (!BG.isOk(r)) return { status: 'error', message: 'Đọc chuyên mục lỗi: ' + BG.errMsg(r) };
    return { status: 'ok', items: (r.body.data?.list || []).map(BG.slimCategory) };
  });
}

async function doComposeArticle({ groupIds, title, summary = '', content, categoryIds = [], coverId = '', tags = [], series = [], scheduledAt = null, asGroup = false, source = 'manual' }) {
  const err = BG.validateArticle({ groupIds, title, summary, content, categoryIds, hasCover: !!coverId, tags, series, scheduledAt, asGroup });
  if (err) return { status: 'error', message: err };
  const { settings, state, log } = await load();
  const known = new Map((state.snapshot?.groups || []).map((g) => [g.id, g]));
  const targets = groupIds.map((id) => known.get(id)).filter(Boolean);
  if (targets.length !== groupIds.length) return { status: 'error', message: 'Có group không còn trong danh sách — hãy quét lại' };
  if (asGroup && targets[0].canPostAsGroup === false) return { status: 'error', message: `${targets[0].name}: không có quyền đăng dưới tên group` };

  const action = scheduledAt ? 'schedule' : 'publish';
  const body = BG.articleBody({ groupIds, title, summary, content, categoryIds, coverId, tags, series, scheduledAt });
  const base = {
    kind: 'compose',
    source,
    action,
    groupId: targets[0].id,
    groupName: targets.map((g) => g.name).join(', '),
    communityName: [...new Set(targets.map((g) => g.communityName))].join(', '),
    snippet: (`[Article] ${asGroup ? '[Tên group] ' : ''}` + body.title + (body.summary ? ' — ' + body.summary : '')).replace(/\s+/g, ' ').slice(0, 120),
    scheduledAt: body.scheduledAt || null,
    ...(asGroup ? { asGroup: true } : {}),
  };

  let r;
  if (settings.dryRun) r = { status: 'ok', dry: true };
  else {
    r = await withClient(async (client) => {
      if (body.tags.length || body.series.length) {
        const v = await client.call('POST', 'content/contents/validate-series-tags', { groups: groupIds, series: body.series, tags: body.tags });
        if (v.status === 401) return { ...NEED_LOGIN };
        if (v.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(v.body, tags, series) };
      }
      const draft = { audience: { groupIds: [...groupIds] }, isEnableDonation: false };
      const d = asGroup ? await client.call('POST', `content/manage/groups/${targets[0].id}/articles`, draft) : await client.call('POST', 'content/articles', draft);
      if (d.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(d) || !d.body.data?.id) return { status: 'error', message: (asGroup ? 'Tạo Article nháp dưới tên group lỗi: ' : 'Tạo Article nháp lỗi: ') + BG.errMsg(d) };
      const id = d.body.data.id;
      const p = await client.call('PUT', `content/articles/${id}/${action}`, body);
      if (!BG.isOk(p)) {
        await client.call('DELETE', `content/articles/${id}`);
        if (p.body?.code === 'tag_series_invalid') return { status: 'error', message: BG.tagSeriesError(p.body, tags, series) };
        return { status: 'error', message: (action === 'schedule' ? 'Hẹn giờ Article lỗi: ' : 'Đăng Article lỗi: ') + BG.errMsg(p) };
      }
      return { status: 'ok', contentId: id, postStatus: p.body.data?.status || null };
    });
  }
  return finishCompose(r, { base, contentType: 'ARTICLE', settings, state, log });
}

async function doComposeSeries({ groupIds, title, summary = '', coverId = '', isImportant = false, asGroup = false, source = 'manual' }) {
  const err = BG.validateSeries({ groupIds, title, summary, hasCover: !!coverId, asGroup });
  if (err) return { status: 'error', message: err };
  const { settings, state, log } = await load();
  const known = new Map((state.snapshot?.groups || []).map((g) => [g.id, g]));
  const targets = groupIds.map((id) => known.get(id)).filter(Boolean);
  if (targets.length !== groupIds.length) return { status: 'error', message: 'Có group không còn trong danh sách — hãy quét lại' };
  if (asGroup && targets[0].canPostAsGroup === false) return { status: 'error', message: `${targets[0].name}: không có quyền tạo dưới tên group` };
  const body = BG.seriesBody({ groupIds, title, summary, coverId, isImportant });
  const base = {
    kind: 'compose',
    source,
    action: 'publish',
    groupId: targets[0].id,
    groupName: targets.map((g) => g.name).join(', '),
    communityName: [...new Set(targets.map((g) => g.communityName))].join(', '),
    snippet: (`[Series] ${asGroup ? '[Tên group] ' : ''}` + body.title + (body.summary ? ' — ' + body.summary : '')).replace(/\s+/g, ' ').slice(0, 120),
    scheduledAt: null,
    ...(asGroup ? { asGroup: true } : {}),
  };
  let r;
  if (settings.dryRun) r = { status: 'ok', dry: true };
  else {
    r = await withClient(async (client) => {
      const c = asGroup ? await client.call('POST', `content/manage/groups/${targets[0].id}/series`, body) : await client.call('POST', 'content/series', body);
      if (c.status === 401) return { ...NEED_LOGIN };
      if (!BG.isOk(c) || !c.body.data?.id) return { status: 'error', message: 'Tạo series lỗi: ' + BG.errMsg(c) };
      return { status: 'ok', contentId: c.body.data.id, postStatus: c.body.data.status || null };
    });
  }
  return finishCompose(r, { base, contentType: 'SERIES', settings, state, log });
}
