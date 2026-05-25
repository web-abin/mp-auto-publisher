// 百度图片搜索（走未公开的 acjson 接口）。
// 注意：返回的是百度抓取自第三方网站的图片，版权状态不明，公众号配图存在侵权风险，请自行评估。
// 我们优先使用百度自家 CDN 的缩略/中等图（更稳定、不易 403）。

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CONTROL_CHARS_RE = /[\x00-\x1F]+/g;

function buildAcjsonUrl(keyword, { pn = 0, rn = 30 } = {}) {
  const params = new URLSearchParams({
    tn: 'resultjson_com',
    logid: String(Date.now()),
    ipn: 'rj',
    ct: '201326592',
    fp: 'result',
    word: keyword,
    queryWord: keyword,
    cl: '2',
    lm: '-1',
    ie: 'utf-8',
    oe: 'utf-8',
    st: '-1',
    face: '0',
    nc: '1',
    pn: String(pn),
    rn: String(rn),
    gsm: '1e',
  });
  return `https://image.baidu.com/search/acjson?${params.toString()}`;
}

function isBaiduCdn(u) {
  try {
    const h = new URL(u).hostname;
    return /(^|\.)baidu\.com$|(^|\.)bdimg\.com$|(^|\.)bdstatic\.com$/i.test(h);
  } catch { return false; }
}

// 选择最稳的可访问 URL：优先百度自家 CDN，避免源站 403。
function pickStableUrl(item) {
  const candidates = [item.middleURL, item.hoverURL, item.thumbURL];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http') && isBaiduCdn(c)) return c;
  }
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

async function searchBaidu(keyword, limit = 16) {
  if (!keyword) return [];
  const url = buildAcjsonUrl(keyword);
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Referer': 'https://image.baidu.com/',
      'Accept': 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`baidu ${res.status}`);
  const raw = await res.text();

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // 百度偶尔返回含控制字符的非严格 JSON，清洗后再 parse
    const cleaned = raw.replace(CONTROL_CHARS_RE, ' ');
    try { data = JSON.parse(cleaned); }
    catch (e) { throw new Error(`baidu json parse failed: ${e.message}`); }
  }

  const items = Array.isArray(data?.data) ? data.data : [];
  const urls = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const u = pickStableUrl(it);
    if (!u) continue;
    const w = Number(it.width) || 0;
    const h = Number(it.height) || 0;
    if (w && h && (w < 400 || h < 300)) continue;
    urls.push(u);
    if (urls.length >= limit) break;
  }
  return urls;
}

// 下载百度 CDN 图片需要带 Referer，否则会 403。
function baiduDownloadHeaders(url) {
  if (!isBaiduCdn(url)) return null;
  return {
    'User-Agent': UA,
    'Referer': 'https://image.baidu.com/',
  };
}

module.exports = { searchBaidu, isBaiduCdn, baiduDownloadHeaders };
