// 从「参考网页」抓正文配图：
// - 走新闻搜索拿到的源链接（sogou /link、各家媒体页）
// - 走微信搜索拿到的 mp.weixin.qq.com 链接
//
// 设计原则：
// 1) 尽量降低侵权风险——剧照/明星脸/影视海报/综艺截图/商品图/水印图全部直接拒绝；
// 2) 给出的候选都附 referer 提示，下载时不被反盗链；
// 3) 失败可降级，单条源挂了不影响其它源。

const TIMEOUT_MS = 8000;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_IMAGES_PER_PAGE = 6;
const MIN_W = 400;
const MIN_H = 280;

// 域名级黑名单：影视剧照/明星图/综艺截图/商品图聚集地，整站拒绝。
const HOST_BLACKLIST = [
  'douban.com', 'doubanio.com',
  'mtime.com', 'mtimg.com',
  '1905.com',
  'iqiyi.com', 'iqiyipic.com',
  'youku.com', 'ykimg.com',
  'mgtv.com', 'hitv.com',
  'qq.com/x/page', 'v.qq.com',
  'le.com', 'letvimg.com',
  'bilibili.com', 'hdslb.com',
  'weibo.com', 'weibocdn.com', 'sinaimg.cn',
  'xiaohongshu.com', 'xhscdn.com',
  'tiktok.com', 'douyin.com',
  'taobao.com', 'tmall.com', 'alicdn.com', 'jd.com', '360buyimg.com',
];

// URL/路径片段黑名单：水印、二维码、台标、剧照路径
const URL_PATTERN_BLACKLIST = [
  /watermark/i, /\bwm[-_]?\d/i,
  /qrcode|qr_?code|wechat_?qr/i,
  /\blogo\b/i, /avatar/i,
  /poster/i, /\bstill\b/i, /screenshot|screencap/i,
  /movie|tvplay|tvshow|drama|series|variety/i,
  /idol|fanmeeting|concert/i,
  /\bgg\b|\bads?\b|adsbygoogle/i,
];

// alt/title 中文黑名单词（很多媒体源码里 alt 写得很直白）
const ALT_BLACKLIST = [
  '剧照', '海报', '截图', '电影', '电视剧', '综艺', '明星', '演员', '艺人',
  '偶像', '写真', '演唱会', '粉丝', '颁奖', '红毯', '出席', '亮相',
  '官宣', '路透', '机场', '生图',
  '广告', '推广', '二维码', '关注', 'LOGO', '台标', '水印',
];

function lower(s) { return (s || '').toLowerCase(); }

function stripQuery(u) {
  try { const o = new URL(u); return o.origin + o.pathname; } catch { return u; }
}

function hostOf(u) {
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
}

function isBlacklistedHost(u) {
  const h = hostOf(u);
  if (!h) return false;
  return HOST_BLACKLIST.some(b => h === b || h.endsWith('.' + b) || h.includes(b));
}

function isBlacklistedUrl(u) {
  const s = lower(u);
  return URL_PATTERN_BLACKLIST.some(re => re.test(s));
}

function isBlacklistedAlt(alt) {
  if (!alt) return false;
  const u = alt.toUpperCase();
  return ALT_BLACKLIST.some(w => alt.includes(w) || u.includes(w.toUpperCase()));
}

function normalizeUrl(src, base) {
  if (!src) return '';
  let s = src.trim();
  if (!s) return '';
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('data:')) return '';
  try { return new URL(s, base).href; } catch { return ''; }
}

// 抽取 <img> 里的 src/data-src/data-original 等常见属性 + alt + width/height
function extractImgTags(html) {
  const out = [];
  const re = /<img\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const get = (name) => {
      const r = new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"|\\b${name}\\s*=\\s*'([^']+)'`, 'i');
      const x = r.exec(attrs);
      return x ? (x[1] || x[2] || '') : '';
    };
    // 公众号正文懒加载：data-src 优先
    const src = get('data-src') || get('data-original') || get('data-lazy-src') || get('src');
    if (!src) continue;
    const alt = get('alt') || get('title') || '';
    const w = parseInt(get('data-w') || get('width') || '0', 10) || 0;
    const h = parseInt(get('data-h') || get('height') || '0', 10) || 0;
    out.push({ src, alt, w, h });
  }
  return out;
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

// 解析 sogou /link?url=... 跳转：sogou 用 JS 跳，但有时也会直跳；
// 我们直接 GET 一次，跟随 302；拿不到就退回原 URL。
async function resolveSogouLink(url) {
  try {
    const { finalUrl, html } = await fetchHtml(url);
    // sogou 有时返回一段 <script>window.location.replace("...")</script>
    const jsM = html.match(/window\.location\.replace\(["']([^"']+)["']\)/);
    if (jsM) return jsM[1];
    const metaM = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+url=([^"'>\s]+)/i);
    if (metaM) return metaM[1];
    return finalUrl;
  } catch {
    return url;
  }
}

function filterCandidates(items, baseUrl) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const url = normalizeUrl(it.src, baseUrl);
    if (!url) continue;
    const key = stripQuery(url);
    if (seen.has(key)) continue;
    if (isBlacklistedHost(url)) continue;
    if (isBlacklistedUrl(url)) continue;
    if (isBlacklistedAlt(it.alt)) continue;
    // 尺寸有显式标注且过小，丢弃
    if (it.w && it.h && (it.w < MIN_W || it.h < MIN_H)) continue;
    // mp.weixin.qq.com 占位 src（透明 1x1 svg）跳过
    if (/data:image|svg\+xml/i.test(url)) continue;
    seen.add(key);
    out.push({ url, alt: it.alt, source: hostOf(baseUrl) });
    if (out.length >= MAX_IMAGES_PER_PAGE) break;
  }
  return out;
}

async function extractFromArticle(url) {
  if (!url) return [];
  let target = url;
  // sogou 包了一层 /link，先解开
  if (/news\.sogou\.com\/link/i.test(url) || /weixin\.sogou\.com\/link/i.test(url)) {
    target = await resolveSogouLink(url);
  }
  if (isBlacklistedHost(target)) return [];
  try {
    const { html, finalUrl } = await fetchHtml(target);
    const items = extractImgTags(html);
    return filterCandidates(items, finalUrl);
  } catch (e) {
    return [];
  }
}

// 微信搜狗：搜公众号文章
// type=2 是文章搜索；返回的链接还是 weixin.sogou.com/link?url=...，需要再解一次拿到真实的 mp.weixin.qq.com
async function searchSogouWeixinLinks(keyword, count = 5) {
  const url = `https://weixin.sogou.com/weixin?type=2&query=${encodeURIComponent(keyword)}&ie=utf8`;
  const { html } = await fetchHtml(url, { 'Referer': 'https://weixin.sogou.com/' });
  const links = [];
  // 文章卡片在 <div class="txt-box"><h3><a ...
  const blockRe = /<div[^>]+class="txt-box"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
  let m;
  while ((m = blockRe.exec(html)) && links.length < count) {
    const aM = m[1].match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"/);
    if (!aM) continue;
    let link = aM[1];
    if (link.startsWith('/link')) link = 'https://weixin.sogou.com' + link;
    if (!/sogou\.com\/link/i.test(link) && !/mp\.weixin\.qq\.com/i.test(link)) continue;
    links.push(link);
  }
  return links;
}

// 从一组「参考链接」批量抓图，并行 + 单条失败可降级
async function harvestImages({ articleLinks = [], wechatLinks = [], maxPerSource = MAX_IMAGES_PER_PAGE, maxTotal = 24 } = {}) {
  const all = [];
  const tasks = [];
  for (const u of articleLinks) tasks.push(extractFromArticle(u).then(list => ({ kind: 'news', list })));
  for (const u of wechatLinks) tasks.push(extractFromArticle(u).then(list => ({ kind: 'wechat', list })));
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const list = r.value.list || [];
    for (const it of list.slice(0, maxPerSource)) {
      all.push(it);
      if (all.length >= maxTotal) return all;
    }
  }
  return all;
}

// 给下载器使用：mp.weixin.qq.com 的图托管在 mmbiz.qpic.cn，公开访问 + 不需要登录态；
// 但部分媒体源会校验 Referer，统一带上原页面 origin 更稳。
function buildRefererHeaders(url) {
  const h = hostOf(url);
  if (/mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn/.test(h)) {
    return { 'User-Agent': UA, 'Referer': 'https://mp.weixin.qq.com/' };
  }
  return null;
}

module.exports = {
  harvestImages,
  extractFromArticle,
  searchSogouWeixinLinks,
  buildRefererHeaders,
  isBlacklistedHost,
  isBlacklistedUrl,
  isBlacklistedAlt,
  HOST_BLACKLIST,
};
