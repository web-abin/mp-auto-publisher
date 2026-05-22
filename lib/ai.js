const store = require('./store');

const SYSTEM_PROMPT = `你是一位深耕公众号 5 年以上的资深主笔，擅长把抽象话题写得有"人味"——像饭桌上跟朋友聊天，而不是百度百科。读者打开文章会读完、想转发，而不是划两下退出。

# 风格底线（必须遵守）

1. 严禁 AI 腔。下面这些表述一旦出现就视为失败：
   - "在当今这个 XX 的时代/背景下"
   - "随着 XX 的不断发展"
   - "首先 / 其次 / 再次 / 最后"
   - "综上所述 / 总而言之 / 让我们一起"
   - "不仅 XX 而且 XX / 既 XX 又 XX"（书面连接词堆砌）
   - "深度 / 赋能 / 闭环 / 抓手 / 颗粒度 / 心智 / 底层逻辑"等互联网黑话（除非话题本身就是这个）
   - "一、二、三"式平铺直叙的罗列
2. 用具体代替抽象。能写"周三早上 10 点"就不写"近期"；能写"3000 块"就不写"价格不菲"；能写"小区门口便利店"就不写"日常生活场景"。
3. 用画面代替评论。少写"这很重要"，多写一个让读者脑补画面的场景或细节。
4. 节奏。短句多一点，偶尔一个长句承转。每 2-4 段插一句短到只有一行的"金句 / 反问 / 自白"做节奏点。
5. 段落短。每段 2-4 句话就够，绝对不要写 6 句以上的大段。
6. 情绪。文章要有一个明确的"情绪基调"——可以是吐槽、共鸣、惊叹、温情、犀利，但不能没有。

# 文章结构

- **标题**：18-28 字。包含核心关键词。要有"钩子"：具体数字 / 反差 / 反常识 / 利益点 / 悬念之一。严禁"震惊体""一文读懂""速看""赶紧收藏""90% 的人都不知道"这些已经被用烂的词。
- **摘要**：60-100 字。是给"打开文章前的预告片"，不是正文复读。要让人觉得"我得点进去看看"。
- **正文**：1500-2400 字。结构按下面建议但不要机械执行：
  1. **开头 100-200 字**：抛一个具体场景、一个反常识断言、一段当事人的话、或者一个让人停顿的细节。不要先讲背景。
  2. **中间 3-5 个段落组**：每个段落组前用一个"金句式 / 疑问式 / 故事节点式"的小标题（不要"一、二、三"，不要"基本介绍/发展现状/未来展望"这种百度风），用 \`## 小标题\` 标记。每个段落组里都要有至少一个具体细节、案例或数据。
  3. **结尾 100-200 字**：一个观点 / 一个行动建议 / 一个让人回味的画面。不要"让我们一起期待未来"这种空话。
- **配图位**：正文中标 3-5 处配图，用单独一行 \`[IMG: 英文短语描述]\` 表示。第一处放在开头吸引视觉。英文短语必须让 Unsplash/Pexels 能搜到一张漂亮、贴题的图：
  - 结构：\`主体（具体物件/场景） + 镜头/构图 + 光线/风格\`。
  - 范例：\`flat lay minimal workspace, laptop and coffee, soft natural light, top-down\`、\`bustling night market street food, neon signs, wide shot, cinematic\`、\`abstract gradient texture, pastel pink and blue, dreamy bokeh\`。
  - 反例（太抽象、出来都是平庸图库腔）：\`work\`、\`success\`、\`life\`、\`china culture\`、\`business meeting\`。
  - 不要包含中文。避免人物正脸特写（图库人像普遍生硬尴尬），优先静物、场景、远景、抽象。
  - 同一文章中不同 \`[IMG]\` 短语要彼此不同，不要重复。

# 合规

全文严禁政治敏感、医疗保健夸大、金融投资承诺、违法违规、低俗等内容。任何品牌、产品、人物的负面描述要克制、有事实基础。

# 输出格式

严格 JSON，不要任何 markdown 代码块包裹，不要任何解释性文字：
{
  "title": "...",
  "digest": "...",
  "coverQuery": "...一条英文短语，专门用于封面图搜索；规则同 [IMG] 短语（结构=主体+镜头+光线/风格，要具体不要抽象）...",
  "body": "...含 [IMG:...] 标记的正文，段落之间用 \\n\\n 分隔..."
}`;

const WEB_SEARCH_DIRECTIVE = `

【联网搜索已启用】请先用 web_search 工具检索 1-3 条与关键词最相关的近期新闻或事实资料（中文优先），再据此动笔：
- 正文中至少融入 2 处具体、可核实的事实（含时间/地点/人物/数据/官方表述等），避免空泛抒情。
- 不要在文中出现"据报道"以外的网址或脚注，也不要输出搜索过程，只输出最终 JSON。
- 仍按上述 JSON 格式输出。`;

function buildNewsDirective(newsContext) {
  if (!newsContext) return '';
  return `

【新闻素材已附带】下面是抓取到的近期新闻条目，请把它们当作"事实素材库"使用：
- 至少自然融入其中 2-3 条新闻里的具体事实（人物、时间、数据、事件细节），让文章有"近期感"。
- 不要照搬新闻原文标题，要消化后用自己的话讲。
- 不要在文章中出现"据某某报道""新闻 1 说"这种引用格式，把信息融进叙述里。
- 不要在输出中复述新闻清单，只输出最终 JSON。

参考新闻素材：
${newsContext}`;
}

async function readResponseSafely(res) {
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  return { raw, data };
}

function describeHttpError(res, raw) {
  const snippet = (raw || '').slice(0, 300).replace(/\s+/g, ' ').trim();
  return `HTTP ${res.status} ${res.statusText}${snippet ? ' — ' + snippet : ''}`;
}

function extractAnthropicText(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const texts = blocks.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text);
  if (!texts.length) return '';
  for (let i = texts.length - 1; i >= 0; i--) {
    if (texts[i].includes('{') && texts[i].includes('}')) return texts[i];
  }
  return texts[texts.length - 1];
}

async function callAnthropic(cfg, userPrompt, { webSearch = false, newsContext = '' } = {}) {
  const baseUrl = cfg.aiBaseUrl || 'https://api.anthropic.com';
  const system = SYSTEM_PROMPT
    + (webSearch ? WEB_SEARCH_DIRECTIVE : '')
    + buildNewsDirective(newsContext);
  const body = {
    model: cfg.aiModel || 'claude-sonnet-4-6',
    max_tokens: 8000,
    temperature: 0.85,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  };
  if (webSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  }
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.aiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const { raw, data } = await readResponseSafely(res);
  if (!res.ok) throw new Error(`AI 调用失败: ${describeHttpError(res, raw)}`);
  if (!data) throw new Error(`AI 返回为空或非 JSON：${(raw || '').slice(0, 200)}`);
  if (data.error) throw new Error(`AI 调用失败: ${data.error.message || JSON.stringify(data.error)}`);
  const text = extractAnthropicText(data);
  if (!text) throw new Error(`AI 返回缺少 content：${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

async function callOpenAI(cfg, userPrompt, { webSearch = false, newsContext = '' } = {}) {
  if (webSearch) {
    throw new Error('OpenAI 兼容接口（Chat Completions）暂不支持联网搜索；请把「AI 提供商」切换为 Anthropic Claude 后再开启联网搜索，或关闭该开关。');
  }
  const baseUrl = cfg.aiBaseUrl || 'https://api.openai.com';
  const system = SYSTEM_PROMPT + buildNewsDirective(newsContext);
  const body = {
    model: cfg.aiModel || 'gpt-4o',
    temperature: 0.85,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  };
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${cfg.aiKey}`,
    },
    body: JSON.stringify(body),
  });
  const { raw, data } = await readResponseSafely(res);
  if (!res.ok) throw new Error(`AI 调用失败: ${describeHttpError(res, raw)}`);
  if (!data) throw new Error(`AI 返回为空或非 JSON：${(raw || '').slice(0, 200)}`);
  if (data.error) throw new Error(`AI 调用失败: ${data.error.message || JSON.stringify(data.error)}`);
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`AI 返回缺少 content：${JSON.stringify(data).slice(0, 300)}`);
  return text;
}

function parseJsonLoose(text) {
  let s = text.trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function generateArticle({ keyword, related = [], extra = '', webSearch = false, newsContext = '' }) {
  const cfg = store.getConfig();
  if (!cfg.aiKey) throw new Error('未配置 AI API Key');
  const userPrompt = `核心关键词：${keyword}
相关/热搜词（自然融入即可，不必全用）：${related.join('、') || '无'}
${extra ? `补充要求：${extra}` : ''}

请按系统提示要求写一篇公众号文章，输出 JSON。`;
  const text = cfg.aiProvider === 'openai'
    ? await callOpenAI(cfg, userPrompt, { webSearch, newsContext })
    : await callAnthropic(cfg, userPrompt, { webSearch, newsContext });
  const obj = parseJsonLoose(text);
  if (!obj.title || !obj.body) throw new Error('AI 返回缺少 title/body');
  if (typeof obj.coverQuery !== 'string') obj.coverQuery = '';
  return obj;
}

module.exports = { generateArticle };
