const ai = require('./ai');
const trends = require('./trends');
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

async function generateContent({ keyword, extra = '', themeName = themes.DEFAULT_THEME, webSearch = false, log = () => {}, onTextReady = () => {} }) {
  log(`挖掘热搜词: ${keyword}`);
  const { related } = await trends.mineRelated(keyword);
  log(`相关词: ${related.join(' / ') || '无'}`);

  log(webSearch ? 'AI 生成文章中（已启用联网搜索）...' : 'AI 生成文章中...');
  const article = await ai.generateArticle({ keyword, related, extra, webSearch });
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

  log('搜索配图中...');
  const imgTags = extractImgTags(article.body);
  const imgUrlMap = {};
  const coverList = await images.searchImages(keyword);
  const coverUrl = coverList[0] || null;
  imgUrlMap.__cover = coverUrl;
  for (const tag of imgTags) {
    const list = await images.searchImages(tag);
    if (list[0]) imgUrlMap[tag] = list[0];
  }
  log(`配图完成: 封面 + ${imgTags.length} 张文中图`);

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
      throw new Error('封面图缺失，且正文中没有图片可作为封面');
    }
  }

  log('上传封面到微信素材库...');
  const coverBuf = await images.downloadImage(resolvedCover);
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

async function runFullPipeline({ keyword, extra = '', pushDraft = true, themeName = themes.DEFAULT_THEME, webSearch = false, log = () => {} }) {
  const content = await generateContent({ keyword, extra, themeName, webSearch, log });
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
