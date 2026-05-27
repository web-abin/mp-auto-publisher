const ai = require('./ai');
const trends = require('./trends');
const news = require('./news');
const images = require('./images');
const articleImages = require('./article-images');
const references = require('./references');
const wechat = require('./wechat');
const store = require('./store');
const themes = require('./themes');

const bodyToHtml = themes.renderBody;

function extractImgTags(body) {
  const re = /\[IMG:\s*(.+?)\]/gi;
  const tags = [];
  let m;
  while ((m = re.exec(body)) !== null) tags.push(m[1].trim());
  return [...new Set(tags)];
}

// 取每个 [IMG: xxx] 标签紧邻的正文段落（去掉 markdown 小标题、其它 IMG 占位），
// 用作挑图时的上下文，让视觉模型知道这张图要配的实际内容。
function buildImgContextMap(body) {
  const map = {};
  const re = /\[IMG:\s*(.+?)\]/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1].trim();
    if (map[tag]) continue;
    const idx = m.index;
    const before = body.slice(Math.max(0, idx - 400), idx);
    const after = body.slice(idx + m[0].length, idx + m[0].length + 400);
    const ctx = `${before}\n${after}`
      .replace(/\[IMG:[^\]]*\]/gi, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    map[tag] = ctx;
  }
  return map;
}

function buildCoverContext(title, body) {
  const head = body
    .replace(/\[IMG:[^\]]*\]/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  return `标题：${title}\n开头：${head}`;
}

function fallbackCoverUrl(seed) {
  const s = encodeURIComponent((seed || 'cover').slice(0, 40));
  return `https://picsum.photos/seed/${s}/1200/800`;
}

async function generateContent({
  keyword,
  extra = '',
  themeName = themes.DEFAULT_THEME,
  webSearch = false,
  useNews = false,
  newsCategory = '',
  referenceLinks = [],
  writerPrompt = '',
  writerName = '',
  log = () => {},
  onTextReady = () => {},
}) {
  // 参考链接抓取与关键词热搜挖掘并行，节省时间。
  const refsP = (Array.isArray(referenceLinks) && referenceLinks.length)
    ? (log(`抓取 ${referenceLinks.length} 条参考链接的正文...`),
       references.fetchReferences(referenceLinks).catch(e => {
         log(`参考链接抓取出错（已跳过）: ${e.message}`);
         return [];
       }))
    : Promise.resolve([]);

  log(keyword ? `挖掘热搜词: ${keyword}` : '未提供关键词，直接按参考材料洗稿');
  const trendsResult = keyword
    ? await trends.mineRelated(keyword)
    : { related: [] };
  const related = trendsResult.related;
  log(`相关词: ${related.join(' / ') || '无'}`);

  const refs = await refsP;
  let referenceContext = '';
  if (refs.length) {
    referenceContext = references.formatReferencesAsContext(refs);
    log(`已成功抓取 ${refs.length}/${referenceLinks.length} 条参考材料 (共 ${referenceContext.length} 字)`);
  } else if (referenceLinks.length) {
    log('参考链接抓取全部失败，将按关键词正常生成');
  }

  let newsContext = '';
  let newsItems = [];
  if (useNews) {
    log(newsCategory ? `抓取「${newsCategory}」类目新闻...` : `按关键词抓取新闻: ${keyword}`);
    try {
      newsItems = await news.fetchNews({ category: newsCategory, keyword, max: 5 });
      if (newsItems.length) {
        newsContext = news.formatNewsAsContext(newsItems);
        log(`已抓取 ${newsItems.length} 条新闻作为参考素材`);
      } else {
        log('未抓到新闻（源不通或无结果），改为纯关键词生成');
      }
    } catch (e) {
      log(`新闻抓取失败（已跳过）: ${e.message}`);
    }
  }

  const writerLabel = writerName ? `写手：${writerName}` : '';
  const modeLabel = referenceContext
    ? '（基于参考链接洗稿）'
    : (webSearch ? '（已启用联网搜索）' : '');
  log(`${writerLabel ? writerLabel + ' · ' : ''}AI 生成文章中${modeLabel}...`);
  const article = await ai.generateArticle({ keyword, related, extra, webSearch, newsContext, referenceContext, systemPrompt: writerPrompt });
  log(`已生成: 《${article.title}》`);

  const placeholderHtml = bodyToHtml(article.body, {}, themeName);
  onTextReady({
    title: article.title,
    digest: article.digest,
    html: placeholderHtml,
    coverUrl: null,
    bodyRaw: article.body,
    imgUrlMap: {},
    themeName,
    related,
    keyword,
    imagesPending: true,
  });

  log('搜索配图中（参考网页 + 多图源并行 + 多视角扩展，默认每位置选第一张，可在预览里切换）...');
  const imgTags = extractImgTags(article.body);
  const imgUrlMap = {};
  const coverQuery = (article.coverQuery && article.coverQuery.trim()) || keyword;
  const ctxMap = buildImgContextMap(article.body);
  const coverCtx = buildCoverContext(article.title, article.body);

  const slots = [
    { kind: 'cover', query: coverQuery, context: coverCtx },
    ...imgTags.map(tag => ({ kind: 'tag', tag, query: tag, context: ctxMap[tag] || '' })),
  ];

  // 「参考网页配图」与「检索词扩展」并行启动，节省串行等待。
  // 参考链接是用户明确指定的，作为图源优先级最高；新闻次之；微信搜索兜底。
  const refLinks = refs.map(r => r.url).filter(Boolean);
  const articleLinks = [...refLinks, ...newsItems.map(n => n.link).filter(Boolean)];
  const wechatLinksP = keyword
    ? articleImages.searchSogouWeixinLinks(keyword, 5).catch(() => [])
    : Promise.resolve([]);
  const harvestP = wechatLinksP.then(wechatLinks => {
    if (!articleLinks.length && !wechatLinks.length) return [];
    log(`从 ${refLinks.length} 条参考链接 + ${articleLinks.length - refLinks.length} 条新闻 + ${wechatLinks.length} 条公众号文章抓取参考配图...`);
    return articleImages.harvestImages({ articleLinks, wechatLinks });
  }).catch(e => {
    log(`参考网页抓图失败（已跳过）: ${e.message}`);
    return [];
  });

  const [expanded, harvested] = await Promise.all([
    ai.expandImageQueries(slots.map(s => ({ query: s.query, context: s.context }))),
    harvestP,
  ]);
  const priorityPool = harvested
    .map(it => it.url)
    .filter(images.copyrightSafe);
  if (priorityPool.length) log(`参考网页共得 ${priorityPool.length} 张候选图（已过滤剧照/明星/水印）`);

  // 每个 slot 默认选候选列表第一张（参考网页 > Pexels > Pixabay > Unsplash > 百度 这个优先级）；
  // 视觉模型挑图省掉，用户在预览页可以手动切——快、省 token，效果可控。
  // 同一张参考图同篇不重复使用——避免上下两段配同一张图。
  const usedFromPriority = new Set();
  const CANDIDATES_PER_SOURCE = 3;
  async function pickFor(slot, queries) {
    // 按渠道分组的搜索结果，保留 source 信息以便前端展示「每个渠道一张」候选。
    const grouped = await Promise.all(queries.map(q => images.searchImagesGrouped(q)));
    const bySource = new Map();
    for (const g of grouped) {
      for (const [src, urls] of Object.entries(g || {})) {
        if (!bySource.has(src)) bySource.set(src, []);
        const arr = bySource.get(src);
        for (const u of urls) if (!arr.includes(u)) arr.push(u);
      }
    }
    const availablePriority = priorityPool.filter(u => !usedFromPriority.has(u));

    // 候选列表：参考网页置顶 + 每个图源前几张
    const candidates = [];
    const seen = new Set();
    const add = (source, url) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      candidates.push({ source, url });
    };
    for (const u of availablePriority.slice(0, CANDIDATES_PER_SOURCE)) add('reference', u);
    for (const [src, urls] of bySource) {
      for (const u of urls.slice(0, CANDIDATES_PER_SOURCE)) add(src, u);
    }
    const selected = candidates[0] ? candidates[0].url : null;
    if (selected && priorityPool.includes(selected)) usedFromPriority.add(selected);

    return { selected, candidates };
  }

  const coverSlot = slots[0];
  const tagSlots = slots.slice(1);
  const coverResult = await pickFor(coverSlot, expanded[0] || [coverSlot.query]);
  const tagResults = await Promise.all(
    tagSlots.map((s, i) => pickFor(s, expanded[i + 1] || [s.query])),
  );
  const coverUrl = coverResult.selected || null;
  imgUrlMap.__cover = coverUrl;
  imgTags.forEach((tag, i) => {
    if (tagResults[i].selected) imgUrlMap[tag] = tagResults[i].selected;
  });
  const imgCandidatesMap = { __cover: coverResult.candidates };
  imgTags.forEach((tag, i) => {
    imgCandidatesMap[tag] = tagResults[i].candidates;
  });
  log(`配图完成: 封面（query: ${coverQuery}）+ ${imgTags.length} 张文中图`);

  const html = bodyToHtml(article.body, imgUrlMap, themeName);
  return {
    title: article.title,
    digest: article.digest,
    html,
    coverUrl,
    bodyRaw: article.body,
    imgUrlMap,
    imgCandidatesMap,
    themeName,
    related,
    keyword,
    imagesPending: false,
  };
}

async function pushDraftFromContent({ accountId = '', title, digest = '', html, coverUrl, keyword = '', log = () => {} }) {
  const account = store.resolveAccount(accountId);
  if (!account) throw new Error('未配置任何公众号，请先到「配置」页添加');
  if (!account.appid || !account.secret) throw new Error(`公众号「${account.name || account.id}」缺少 APPID 或 AppSecret`);
  if (!title || !title.trim()) throw new Error('标题不能为空');
  if (!html || !html.trim()) throw new Error('正文不能为空');
  log(`目标公众号: ${account.name}（${account.appid}）`);

  let resolvedCover = (coverUrl || '').trim();
  if (!resolvedCover) {
    const firstImg = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (firstImg) {
      resolvedCover = firstImg[1];
      log(`未填封面，自动使用正文第一张图: ${resolvedCover}`);
    } else {
      resolvedCover = fallbackCoverUrl(keyword || title);
      log(`未填封面且正文无图，自动生成兜底封面: ${resolvedCover}`);
    }
  }

  log('上传封面到微信素材库...');
  let coverBuf;
  try {
    coverBuf = await images.downloadImage(resolvedCover);
  } catch (e) {
    log(`封面下载失败（${e.message}），改用兜底图`);
    resolvedCover = fallbackCoverUrl(keyword || title);
    coverBuf = await images.downloadImage(resolvedCover);
  }
  const { mediaId: thumbMediaId } = await wechat.uploadImageMaterial(coverBuf, 'cover.jpg', account.id);

  log('扫描并上传正文图片...');
  const imgUrls = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (/^https?:\/\/(mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn)/i.test(u)) continue;
    if (!imgUrls.includes(u)) imgUrls.push(u);
  }
  let finalHtml = html;
  for (const url of imgUrls) {
    try {
      const buf = await images.downloadImage(url);
      const wxUrl = await wechat.uploadContentImage(buf, `${Date.now()}.jpg`, account.id);
      finalHtml = finalHtml.split(url).join(wxUrl);
    } catch (e) {
      log(`文中图上传失败（已跳过）: ${e.message}`);
    }
  }

  log('提交到微信草稿箱...');
  const draftId = await wechat.addDraft({
    title: title.trim(),
    content: finalHtml,
    digest: (digest || '').trim(),
    thumbMediaId,
    accountId: account.id,
  });
  log(`草稿已提交: ${draftId}`);

  store.pushHistory({
    keyword,
    title: title.trim(),
    draftId,
    coverUrl: resolvedCover,
    accountId: account.id,
    accountName: account.name,
  });
  return { draftId, html: finalHtml, accountId: account.id, accountName: account.name };
}

async function runFullPipeline({
  accountId = '',
  keyword, extra = '', pushDraft = true,
  themeName = themes.DEFAULT_THEME, webSearch = false,
  useNews = false, newsCategory = '',
  writerPrompt = '', writerName = '',
  log = () => {},
}) {
  const content = await generateContent({ keyword, extra, themeName, webSearch, useNews, newsCategory, writerPrompt, writerName, log });
  if (!pushDraft) {
    store.pushHistory({ keyword, title: content.title, draftId: null, coverUrl: content.coverUrl });
    return content;
  }
  const pushed = await pushDraftFromContent({
    accountId,
    title: content.title,
    digest: content.digest,
    html: content.html,
    coverUrl: content.coverUrl,
    keyword,
    log,
  });
  return { ...content, html: pushed.html, draftId: pushed.draftId, accountId: pushed.accountId, accountName: pushed.accountName };
}

module.exports = {
  runFullPipeline,
  generateContent,
  pushDraftFromContent,
  bodyToHtml,
  extractImgTags,
};
