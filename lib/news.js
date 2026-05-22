// 国内可访问的新闻抓取：Sogou 新闻 优先，360 新闻 / Baidu 兜底
const TIMEOUT_MS = 8000;

const CATEGORY_MAP = {
  hot:     { label: '今日热点', queries: ['今日热点', '热点新闻'] },
  tech:    { label: '科技',     queries: ['科技 最新', '互联网 科技 新闻'] },
  ai:      { label: 'AI / 人工智能', queries: ['AI 人工智能 最新', '大模型 ChatGPT 最新'] },
  finance: { label: '财经',     queries: ['财经新闻 最新', '股市 财经'] },
  ent:     { label: '娱乐',     queries: ['娱乐新闻 明星', '娱乐圈 最新'] },
  sports:  { label: '体育',     queries: ['体育 最新', '体育赛事 新闻'] },
  game:    { label: '游戏',     queries: ['游戏 最新', '电竞 游戏新闻'] },
  car:     { label: '汽车',     queries: ['汽车 最新', '新能源车 新闻'] },
  edu:     { label: '教育',     queries: ['教育 最新政策', '高考 教育新闻'] },
  health:  { label: '健康',     queries: ['健康 养生 最新', '医疗健康 新闻'] },
  life:    { label: '生活',     queries: ['生活 资讯 最新'] },
  intl:    { label: '国际',     queries: ['国际新闻 最新'] },
};

function listCategories() {
  return Object.entries(CATEGORY_MAP).map(([key, v]) => ({ key, label: v.label }));
}

function stripHtml(s = '') {
  return s.replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&#?\w+;/g, '')
          .replace(/\s+/g, ' ').trim();
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// === 主源：Sogou 新闻搜索 ===
async function fetchFromSogou(query, count = 5) {
  const url = `https://news.sogou.com/news?query=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const items = [];
  // 每条新闻包在 <div class="vrwrap">...</div>，里面有 vr-title / news-from / star-wiki
  const blockRe = /<div[^>]+class="vrwrap"[^>]*>([\s\S]*?)<\/div>\s*<!--STATUS VR OK--/g;
  let m;
  while ((m = blockRe.exec(html)) && items.length < count) {
    const block = m[1];
    const titleM = block.match(/class="vr-title"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;
    const title = stripHtml(titleM[2]);
    if (!title) continue;
    let link = titleM[1];
    if (link.startsWith('/link')) link = 'https://news.sogou.com' + link;
    const fromM = block.match(/class="news-from[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    let source = '', pubDate = '';
    if (fromM) {
      const spans = [...fromM[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(x => stripHtml(x[1]));
      source = spans[0] || '';
      pubDate = spans[1] || '';
    }
    const absM = block.match(/class="star-wiki"[^>]*>([\s\S]*?)<\/p>/);
    const summary = absM ? stripHtml(absM[1]) : '';
    items.push({ title, summary, link, pubDate, source: source || 'sogou' });
  }
  return items;
}

// === 备源：360 新闻搜索 ===
async function fetchFrom360(query, count = 5) {
  const url = `https://news.so.com/ns?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const items = [];
  // 360 结构：每条结果在 <li class="res-list">，里面有 h3 + 摘要 p
  const blockRe = /<li[^>]+class="res-list"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = blockRe.exec(html)) && items.length < count) {
    const block = m[1];
    const titleM = block.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;
    const title = stripHtml(titleM[2]);
    if (!title) continue;
    const absM = block.match(/<p[^>]*class="res-desc"[^>]*>([\s\S]*?)<\/p>/)
              || block.match(/<p[^>]*class="res-rich"[^>]*>([\s\S]*?)<\/p>/);
    const summary = absM ? stripHtml(absM[1]) : '';
    const fromM = block.match(/<p[^>]*class="res-source"[^>]*>([\s\S]*?)<\/p>/);
    let source = '', pubDate = '';
    if (fromM) {
      const text = stripHtml(fromM[1]);
      const dateM = text.match(/(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d+\s*(?:小时|分钟|天)前)/);
      pubDate = dateM ? dateM[1] : '';
      source = text.replace(pubDate, '').trim();
    }
    items.push({ title, summary, link: titleM[1], pubDate, source: source || 'so360' });
  }
  return items;
}

async function fetchOneQuery(query, count = 5) {
  const errors = [];
  for (const fn of [fetchFromSogou, fetchFrom360]) {
    try {
      const list = await fn(query, count);
      if (list && list.length) return list;
      errors.push(`${fn.name}:empty`);
    } catch (e) {
      errors.push(`${fn.name}:${e.message}`);
    }
  }
  console.warn('[news] all sources failed for', query, errors.join(' / '));
  return [];
}

function dedup(items, max) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.title.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchNews({ category, keyword, max = 5 } = {}) {
  const queries = [];
  if (category && CATEGORY_MAP[category]) queries.push(...CATEGORY_MAP[category].queries);
  if (keyword) queries.push(keyword);
  if (!queries.length) queries.push('热点新闻');

  const all = [];
  for (const q of queries) {
    const list = await fetchOneQuery(q, max);
    all.push(...list);
    if (all.length >= max * 2) break;
  }
  return dedup(all, max);
}

function formatNewsAsContext(items) {
  if (!items || !items.length) return '';
  return items.map((it, i) => {
    const lines = [`【新闻${i + 1}】${it.title}`];
    if (it.source || it.pubDate) lines.push(`来源：${[it.source, it.pubDate].filter(Boolean).join(' · ')}`);
    if (it.summary) lines.push(`摘要：${it.summary.slice(0, 250)}`);
    return lines.join('\n');
  }).join('\n\n');
}

module.exports = {
  fetchNews,
  formatNewsAsContext,
  listCategories,
  CATEGORY_MAP,
};
