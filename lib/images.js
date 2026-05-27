const store = require('./store');
const { searchBaidu, baiduDownloadHeaders } = require('./baidu-images');
const articleImages = require('./article-images');

const CANDIDATE_COUNT = 8;

async function searchPexels(keyword, key) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${CANDIDATE_COUNT}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`pexels ${res.status}`);
  const data = await res.json();
  const photos = data?.photos || [];
  return photos.map(p => p.src?.large || p.src?.medium).filter(Boolean);
}

async function searchPixabay(keyword, key) {
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(keyword)}&image_type=photo&per_page=${CANDIDATE_COUNT}&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pixabay ${res.status}`);
  const data = await res.json();
  return (data?.hits || []).map(h => h.largeImageURL || h.webformatURL).filter(Boolean);
}

async function searchUnsplash(keyword, key) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=${CANDIDATE_COUNT}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  if (!res.ok) throw new Error(`unsplash ${res.status}`);
  const data = await res.json();
  return (data?.results || []).map(r => r.urls?.regular).filter(Boolean);
}

const PROVIDER_FNS = {
  pexels: searchPexels,
  pixabay: searchPixabay,
  unsplash: searchUnsplash,
  baidu: (keyword /* , key 不用 */) => searchBaidu(keyword),
};

function placeholder(keyword) {
  const seed = encodeURIComponent(keyword || 'article');
  return [
    `https://picsum.photos/seed/${seed}/1200/800`,
    `https://picsum.photos/seed/${seed}-2/1200/800`,
  ];
}

function activeProviders(cfg) {
  const keys = cfg.imageKeys || {};
  const list = [];
  for (const name of ['pexels', 'pixabay', 'unsplash']) {
    if (keys[name]) list.push({ name, key: keys[name] });
  }
  if (cfg.enableBaidu) list.push({ name: 'baidu', key: '' });
  if (!list.length && cfg.imageKey && cfg.imageProvider && PROVIDER_FNS[cfg.imageProvider]) {
    list.push({ name: cfg.imageProvider, key: cfg.imageKey });
  }
  return list;
}

// 在喂给 AI 挑图前，先按 URL/域名做一遍侵权黑名单过滤——
// Pexels/Pixabay/Unsplash 基本不会命中，主要是过滤百度图搜里夹带的剧照站/明星图源。
function copyrightSafe(url) {
  if (!url) return false;
  if (articleImages.isBlacklistedHost(url)) return false;
  if (articleImages.isBlacklistedUrl(url)) return false;
  return true;
}

// 交错合并多个图源的结果，再按 URL 去重，避免单一来源风格垄断。
function interleaveDedupe(lists) {
  const seen = new Set();
  const out = [];
  const max = Math.max(...lists.map(l => l.length), 0);
  for (let i = 0; i < max; i++) {
    for (const l of lists) {
      const u = l[i];
      if (!u || seen.has(u)) continue;
      if (!copyrightSafe(u)) continue;
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

async function searchImages(keyword) {
  const cfg = store.getConfig();
  const providers = activeProviders(cfg);
  if (!providers.length) return placeholder(keyword);

  const results = await Promise.all(providers.map(async (p) => {
    try {
      return await PROVIDER_FNS[p.name](keyword, p.key);
    } catch (e) {
      console.error(`image search ${p.name} failed:`, e.message);
      return [];
    }
  }));
  const merged = interleaveDedupe(results);
  return merged.length ? merged : placeholder(keyword);
}

// 同 searchImages，但保留每个渠道的来源信息，给前端的「候选切换」用。
// 返回：{ [source]: [url, url, ...] }，已过滤侵权黑名单。
async function searchImagesGrouped(keyword) {
  const cfg = store.getConfig();
  const providers = activeProviders(cfg);
  if (!providers.length) return { placeholder: placeholder(keyword) };

  const entries = await Promise.all(providers.map(async (p) => {
    try {
      const urls = await PROVIDER_FNS[p.name](keyword, p.key);
      return [p.name, (urls || []).filter(copyrightSafe)];
    } catch (e) {
      console.error(`image search ${p.name} failed:`, e.message);
      return [p.name, []];
    }
  }));
  const out = {};
  for (const [name, urls] of entries) if (urls.length) out[name] = urls;
  return out;
}

async function downloadImage(url) {
  const headers = baiduDownloadHeaders(url) || articleImages.buildRefererHeaders(url) || undefined;
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

// 上限：避免一次喂太多图给视觉模型，token / 延迟都会爆。
const MAX_VISION_CANDIDATES = 12;

// 用多模态模型从候选里挑最贴合的一张。
// context: 这张图实际要配的段落原文（中文），让模型基于"段落讲了啥"而不是仅凭 query 短语来挑。
async function pickBestImage(query, candidates, context = '') {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const cfg = store.getConfig();
  if (!cfg.aiKey || cfg.aiProvider === 'openai') return candidates[0];

  const pool = candidates.slice(0, MAX_VISION_CANDIDATES);

  try {
    const baseUrl = cfg.aiBaseUrl || 'https://api.anthropic.com';
    const ctx = (context || '').trim().slice(0, 600);
    const guidance = ctx
      ? `这张图要配下面这段公众号正文（中文）：\n"""\n${ctx}\n"""\n参考英文检索词：「${query}」\n请挑一张最贴合"段落实际讲述内容"的图，而不是仅看检索词是否字面匹配。`
      : `请挑一张最贴合「${query}」、最适合做公众号配图的图。`;
    const content = [
      {
        type: 'text',
        text: `你是公众号视觉编辑。下面 ${pool.length} 张候选图按顺序对应索引 0 到 ${pool.length - 1}。${guidance}\n挑选原则：\n- 必须与段落主题强相关，不能张冠李戴；宁可挑抽象/场景图，也不要"长得像但内容不对"的图。\n- 构图美观、有故事感或氛围感，避免平庸图库腔。\n- 避免水印 / Logo / 模糊 / 低分辨率 / 拙劣摆拍 / 与正文情绪相反的图。\n- 不同段落不应反复出现极其相似的画面。\n\n【硬性禁用——出现以下任一情况，绝对不能选，宁可没图】\n- 影视剧照、综艺截图、电影/电视剧海报、宣传立牌；\n- 任何可辨认的明星/演员/艺人/网红/真实公众人物的正脸或半身像；\n- 演唱会、颁奖礼、红毯、机场街拍、粉丝活动现场；\n- 商品摆拍特写、电商主图、品牌 Logo 占大面积；\n- 看起来像某媒体/某账号原创摄影作品（带角标、署名、水印、台标）；\n- 公开人物（政商军体）的新闻照——任何一眼能认出"这是谁"的图。\n如果所有候选都触犯以上任意一条，请输出 -1。\n\n请只输出一个 -1 或 0 到 ${pool.length - 1} 之间的数字，不要任何其他字符。`,
      },
      ...pool.map(url => ({ type: 'image', source: { type: 'url', url } })),
    ];
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.aiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.aiModel || 'claude-sonnet-4-6',
        max_tokens: 8,
        messages: [{ role: 'user', content }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('pickBestImage HTTP', res.status, t.slice(0, 200));
      return pool[0];
    }
    const data = await res.json();
    const text = (data?.content || []).filter(b => b?.type === 'text').map(b => b.text).join('');
    const m = text.match(/-?\d+/);
    if (!m) return pool[0];
    const idx = parseInt(m[0], 10);
    if (idx === -1) return null; // 全部触犯侵权红线，宁可不配图
    if (Number.isInteger(idx) && idx >= 0 && idx < pool.length) return pool[idx];
    return pool[0];
  } catch (e) {
    console.error('pickBestImage error:', e.message);
    return pool[0];
  }
}

module.exports = { searchImages, searchImagesGrouped, downloadImage, pickBestImage, copyrightSafe };
