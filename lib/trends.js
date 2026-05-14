async function fetchWeiboHot() {
  try {
    const res = await fetch('https://weibo.com/ajax/side/hotSearch', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = await res.json();
    const list = (data?.data?.realtime || []).map(x => x.word).filter(Boolean);
    return list.slice(0, 30);
  } catch { return []; }
}

async function fetchBaiduHot() {
  try {
    const res = await fetch('https://top.baidu.com/api/board?platform=wise&tab=realtime', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const data = await res.json();
    const list = (data?.data?.cards?.[0]?.content || []).map(x => x.word || x.query).filter(Boolean);
    return list.slice(0, 30);
  } catch { return []; }
}

async function fetchBaiduSuggest(keyword) {
  try {
    const url = `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(keyword)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    return (data?.g || []).map(x => x.q).filter(Boolean);
  } catch { return []; }
}

async function mineRelated(keyword) {
  const [weibo, baidu, sug] = await Promise.all([
    fetchWeiboHot(),
    fetchBaiduHot(),
    fetchBaiduSuggest(keyword),
  ]);
  const score = w => {
    let s = 0;
    if (w.includes(keyword)) s += 5;
    for (const ch of keyword) if (w.includes(ch)) s += 1;
    return s;
  };
  const all = [...new Set([...sug, ...weibo, ...baidu])];
  const ranked = all.map(w => [w, score(w)]).sort((a, b) => b[1] - a[1]);
  const related = ranked.filter(x => x[1] > 0).slice(0, 8).map(x => x[0]);
  if (related.length < 4) related.push(...sug.slice(0, 4 - related.length));
  return {
    related: [...new Set(related)],
    weiboHot: weibo.slice(0, 10),
    baiduHot: baidu.slice(0, 10),
  };
}

module.exports = { mineRelated, fetchWeiboHot, fetchBaiduHot, fetchBaiduSuggest };
