const store = require('./store');

const CANDIDATE_COUNT = 8;

async function searchPexels(keyword, key) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=${CANDIDATE_COUNT}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  const data = await res.json();
  const photos = data?.photos || [];
  return photos.map(p => p.src?.large || p.src?.medium).filter(Boolean);
}

async function searchPixabay(keyword, key) {
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(keyword)}&image_type=photo&per_page=${CANDIDATE_COUNT}&safesearch=true`;
  const res = await fetch(url);
  const data = await res.json();
  return (data?.hits || []).map(h => h.largeImageURL || h.webformatURL).filter(Boolean);
}

async function searchUnsplash(keyword, key) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=${CANDIDATE_COUNT}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: `Client-ID ${key}` } });
  const data = await res.json();
  return (data?.results || []).map(r => r.urls?.regular).filter(Boolean);
}

function placeholder(keyword) {
  const seed = encodeURIComponent(keyword || 'article');
  return [
    `https://picsum.photos/seed/${seed}/1200/800`,
    `https://picsum.photos/seed/${seed}-2/1200/800`,
  ];
}

async function searchImages(keyword) {
  const cfg = store.getConfig();
  if (cfg.imageProvider && cfg.imageKey) {
    try {
      if (cfg.imageProvider === 'pexels') return await searchPexels(keyword, cfg.imageKey);
      if (cfg.imageProvider === 'pixabay') return await searchPixabay(keyword, cfg.imageKey);
      if (cfg.imageProvider === 'unsplash') return await searchUnsplash(keyword, cfg.imageKey);
    } catch (e) {
      console.error('image search failed', e.message);
    }
  }
  return placeholder(keyword);
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载图片失败: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

// 用多模态模型从候选里挑最贴合的一张。失败/不支持时回退到第一张。
async function pickBestImage(query, candidates) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const cfg = store.getConfig();
  // 仅 Anthropic 路径支持视觉重排；OpenAI 兼容接口的视觉行为不一定可用，先 fallback。
  if (!cfg.aiKey || cfg.aiProvider === 'openai') return candidates[0];

  try {
    const baseUrl = cfg.aiBaseUrl || 'https://api.anthropic.com';
    const content = [
      {
        type: 'text',
        text: `你是公众号视觉编辑。下面 ${candidates.length} 张候选图按顺序对应索引 0 到 ${candidates.length - 1}。请挑一张最贴合「${query}」、最适合做公众号配图的图。\n挑选原则：\n- 与描述高度相关，不要张冠李戴。\n- 构图美观、有故事感，避免平庸图库腔。\n- 避免水印 / Logo / 模糊 / 低分辨率 / 拙劣摆拍。\n只输出一个 0 到 ${candidates.length - 1} 之间的数字，不要任何其他字符。`,
      },
      ...candidates.map(url => ({ type: 'image', source: { type: 'url', url } })),
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
      return candidates[0];
    }
    const data = await res.json();
    const text = (data?.content || []).filter(b => b?.type === 'text').map(b => b.text).join('');
    const m = text.match(/\d+/);
    if (!m) return candidates[0];
    const idx = parseInt(m[0], 10);
    if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) return candidates[idx];
    return candidates[0];
  } catch (e) {
    console.error('pickBestImage error:', e.message);
    return candidates[0];
  }
}

module.exports = { searchImages, downloadImage, pickBestImage };
