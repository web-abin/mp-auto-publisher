// 抓取用户提供的「参考链接」正文，喂给 AI 做洗稿。
// 与 article-images.js 区分：那个负责"从参考网页里抓配图"，这个负责"抓正文文字"。

const articleImages = require('./article-images');

const TIMEOUT_MS = 12000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_TEXT_PER_REF = 6000;     // 单篇正文上限（字符）
const MAX_TOTAL_REFS = 5;          // 同时洗稿最多 5 条

function stripTags(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#?\w+;/g, '')
    .replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim();
}

// 保留段落换行：把 <br> 和块级标签结束符换成 \n 再清洗
function stripTagsKeepBreaks(s) {
  return stripTags(
    String(s || '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6]|blockquote|tr|td)>/gi, '\n')
  );
}

async function fetchHtml(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { html: await res.text(), finalUrl: res.url || url };
}

function extractMainText(html, url) {
  let title = '';
  let text = '';

  // 微信公众号文章
  if (/mp\.weixin\.qq\.com/i.test(url)) {
    const t = html.match(/<h1[^>]+id=["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i)
           || html.match(/<h2[^>]+class=["']rich_media_title["'][^>]*>([\s\S]*?)<\/h2>/i);
    if (t) title = stripTags(t[1]);
    const b = html.match(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>\s*<script/i)
           || html.match(/<div[^>]+id=["']js_content["'][^>]*>([\s\S]*?)<\/div>/i);
    if (b) text = stripTagsKeepBreaks(b[1]);
  }

  // 通用：og:title / <title>
  if (!title) {
    const og = html.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:title["']/i);
    if (og) title = stripTags(og[1]);
  }
  if (!title) {
    const tt = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tt) title = stripTags(tt[1]);
  }

  // 通用正文：<article> > og:description+正文 > 所有 <p> 合并
  if (!text) {
    const art = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (art) text = stripTagsKeepBreaks(art[1]);
  }
  if (!text) {
    // 拼 og:description + 所有 >20 字符的 <p>
    const desc = html.match(/<meta[^>]+(?:property|name)=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const parts = [];
    if (desc) parts.push(stripTags(desc[1]));
    const ps = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(m => stripTagsKeepBreaks(m[1]))
      .filter(p => p.length > 20);
    parts.push(...ps);
    text = parts.join('\n\n');
  }

  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (text.length > MAX_TEXT_PER_REF) text = text.slice(0, MAX_TEXT_PER_REF) + '...';
  return { title: title.slice(0, 200), text };
}

function isAllowedUrl(url) {
  if (typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  return true;
}

async function fetchOne(rawUrl) {
  let target = rawUrl;
  // sogou 的 /link 跳一层
  if (/news\.sogou\.com\/link|weixin\.sogou\.com\/link/i.test(target)) {
    target = await articleImages.resolveSogouLink(target);
  }
  const { html, finalUrl } = await fetchHtml(target);
  const { title, text } = extractMainText(html, finalUrl);
  return { url: finalUrl, sourceUrl: rawUrl, title, text };
}

async function fetchReferences(urls) {
  const clean = [...new Set((urls || []).map(u => String(u || '').trim()).filter(isAllowedUrl))]
    .slice(0, MAX_TOTAL_REFS);
  if (!clean.length) return [];
  const results = await Promise.allSettled(clean.map(fetchOne));
  return results
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(it => it && it.text && it.text.length >= 80);
}

function formatReferencesAsContext(refs) {
  if (!refs || !refs.length) return '';
  return refs.map((r, i) => {
    const lines = [`【参考${i + 1}】${r.title || '(无标题)'}`];
    if (r.url) lines.push(`链接：${r.url}`);
    lines.push(`正文：\n${r.text}`);
    return lines.join('\n');
  }).join('\n\n=====\n\n');
}

module.exports = {
  fetchReferences,
  formatReferencesAsContext,
  // 导出便于测试/调试
  extractMainText,
};
