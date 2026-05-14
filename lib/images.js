const store = require('./store');

async function searchPexels(keyword, key) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=5&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  const data = await res.json();
  const photos = data?.photos || [];
  return photos.map(p => p.src?.large || p.src?.medium).filter(Boolean);
}

async function searchPixabay(keyword, key) {
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(keyword)}&image_type=photo&per_page=5&safesearch=true`;
  const res = await fetch(url);
  const data = await res.json();
  return (data?.hits || []).map(h => h.largeImageURL || h.webformatURL).filter(Boolean);
}

async function searchUnsplash(keyword, key) {
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keyword)}&per_page=5&orientation=landscape`;
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

module.exports = { searchImages, downloadImage };
