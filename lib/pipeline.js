const ai = require('./ai');
const trends = require('./trends');
const news = require('./news');
const images = require('./images');
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
  log = () => {},
  onTextReady = () => {},
}) {
  log(`挖掘热搜词: ${keyword}`);
  const { related } = await trends.mineRelated(keyword);
  log(`相关词: ${related.join(' / ') || '无'}`);

  let newsContext = '';
  if (useNews) {
    log(newsCategory ? `抓取「${newsCategory}」类目新闻...` : `按关键词抓取新闻: ${keyword}`);
    try {
      const items = await news.fetchNews({ category: newsCategory, keyword, max: 5 });
      if (items.length) {
        newsContext = news.formatNewsAsContext(items);
        log(`已抓取 ${items.length} 条新闻作为参考素材`);
      } else {
        log('未抓到新闻（源不通或无结果），改为纯关键词生成');
      }
    } catch (e) {
      log(`新闻抓取失败（已跳过）: ${e.message}`);
    }
  }

  log(webSearch ? 'AI 生成文章中（已启用联网搜索）...' : 'AI 生成文章中...');
  const article = await ai.generateArticle({ keyword, related, extra, webSearch, newsContext });
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

  log('搜索配图中（多图源并行 + 多视角扩展 + 多模态挑图）...');
  const imgTags = extractImgTags(article.body);
  const imgUrlMap = {};
  const coverQuery = (article.coverQuery && article.coverQuery.trim()) || keyword;
  const ctxMap = buildImgContextMap(article.body);
  const coverCtx = buildCoverContext(article.title, article.body);

  const slots = [
    { kind: 'cover', query: coverQuery, context: coverCtx },
    ...imgTags.map(tag => ({ kind: 'tag', tag, query: tag, context: ctxMap[tag] || '' })),
  ];
  const expanded = await ai.expandImageQueries(slots.map(s => ({ query: s.query, context: s.context })));

  function interleaveDedupe(lists) {
    const seen = new Set();
    const out = [];
    const max = Math.max(...lists.map(l => l.length), 0);
    for (let i = 0; i < max; i++) {
      for (const l of lists) {
        const u = l[i];
        if (!u || seen.has(u)) continue;
        seen.add(u);
        out.push(u);
      }
    }
    return out;
  }

  async function pickFor(slot, queries) {
    const lists = await Promise.all(queries.map(q => images.searchImages(q)));
    const merged = interleaveDedupe(lists);
    return images.pickBestImage(slot.query, merged, slot.context);
  }

  const picks = await Promise.all(slots.map((s, i) => pickFor(s, expanded[i] || [s.query])));
  const [coverPick, ...tagPicks] = picks;
  const coverUrl = coverPick || null;
  imgUrlMap.__cover = coverUrl;
  imgTags.forEach((tag, i) => {
    if (tagPicks[i]) imgUrlMap[tag] = tagPicks[i];
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
    themeName,
    related,
    keyword,
    imagesPending: false,
  };
}

async function pushDraftFromContent({ title, digest = '', html, coverUrl, keyword = '', log = () => {} }) {
  const cfg = store.getConfig();
  if (!cfg.appid || !cfg.secret) throw new Error('未配置微信 APPID/Secret，无法推送草稿');
  if (!title || !title.trim()) throw new Error('标题不能为空');
  if (!html || !html.trim()) throw new Error('正文不能为空');

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
  const { mediaId: thumbMediaId } = await wechat.uploadImageMaterial(coverBuf, 'cover.jpg');

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
      const wxUrl = await wechat.uploadContentImage(buf, `${Date.now()}.jpg`);
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
  });
  log(`草稿已提交: ${draftId}`);

  store.pushHistory({ keyword, title: title.trim(), draftId, coverUrl: resolvedCover });
  return { draftId, html: finalHtml };
}

async function runFullPipeline({
  keyword, extra = '', pushDraft = true,
  themeName = themes.DEFAULT_THEME, webSearch = false,
  useNews = false, newsCategory = '',
  log = () => {},
}) {
  const content = await generateContent({ keyword, extra, themeName, webSearch, useNews, newsCategory, log });
  if (!pushDraft) {
    store.pushHistory({ keyword, title: content.title, draftId: null, coverUrl: content.coverUrl });
    return content;
  }
  const pushed = await pushDraftFromContent({
    title: content.title,
    digest: content.digest,
    html: content.html,
    coverUrl: content.coverUrl,
    keyword,
    log,
  });
  return { ...content, html: pushed.html, draftId: pushed.draftId };
}

module.exports = {
  runFullPipeline,
  generateContent,
  pushDraftFromContent,
  bodyToHtml,
  extractImgTags,
};
