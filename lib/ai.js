const store = require('./store');

const SYSTEM_PROMPT = `你是资深的微信公众号写作专家，深谙搜一搜SEO规则。
请根据给定关键词和热搜词，写一篇高点击、高质量、高可读性的公众号文章。

要求：
1. 标题：20-28字，包含核心关键词，自然融入热搜词，要有钩子（数字/反差/悬念/利益点），不夸张不标题党，符合公众号规范，禁止使用"震惊""速看""一文读懂"等已被滥用的词。
2. 摘要：80-110字，独立成段，自然引出正文。
3. 正文：1200-2000字，口语化、有节奏感，像和朋友聊天一样自然。绝对不要使用"一、二、三"这种死板罗列，不要使用"首先/其次/最后"这种学生作文式连接词。可以适当用小标题分段，但小标题要像金句、像疑问、像故事节点，而不是教科书目录。
4. 内容结构（按需自然组织，不要机械执行）：
   - 开场用一个具体的场景、故事、反常识观点或近期热点切入
   - 中间穿插真实案例、个人观察、数据细节
   - 结尾给一个清晰的观点或行动建议，引发共鸣或讨论
5. 在正文中标记 3-5 个适合配图的位置，用单独一行 [IMG: 配图描述（英文关键词）] 表示。第一处建议放在开头吸引视觉。
6. 配图描述用英文短词组（用于图库搜索），例如：[IMG: morning coffee desk workspace]
7. 全文严禁出现政治敏感、医疗保健夸大、金融投资承诺、违法违规、低俗等内容，确保过审。

输出严格 JSON：
{
  "title": "...",
  "digest": "...",
  "body": "...含[IMG:...]标记的正文，使用 \\n\\n 分段..."
}
不要任何额外说明、不要 markdown 代码块包裹。`;

const WEB_SEARCH_DIRECTIVE = `

【联网搜索已启用】请先用 web_search 工具检索 1-3 条与关键词最相关的近期新闻或事实资料（中文优先），再据此动笔：
- 正文中至少融入 2 处具体、可核实的事实（含时间/地点/人物/数据/官方表述等），避免空泛抒情。
- 不要在文中出现"据报道"以外的网址或脚注，也不要输出搜索过程，只输出最终 JSON。
- 仍按上述 JSON 格式输出。`;

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
  // 联网搜索时模型可能先输出搜索说明、再输出最终 JSON；最终结果通常在最后一段含 "{" 的文本里
  for (let i = texts.length - 1; i >= 0; i--) {
    if (texts[i].includes('{') && texts[i].includes('}')) return texts[i];
  }
  return texts[texts.length - 1];
}

async function callAnthropic(cfg, userPrompt, { webSearch = false } = {}) {
  const baseUrl = cfg.aiBaseUrl || 'https://api.anthropic.com';
  const body = {
    model: cfg.aiModel || 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: webSearch ? SYSTEM_PROMPT + WEB_SEARCH_DIRECTIVE : SYSTEM_PROMPT,
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

async function callOpenAI(cfg, userPrompt, { webSearch = false } = {}) {
  if (webSearch) {
    throw new Error('OpenAI 兼容接口（Chat Completions）暂不支持联网搜索；请把「AI 提供商」切换为 Anthropic Claude 后再开启联网搜索，或关闭该开关。');
  }
  const baseUrl = cfg.aiBaseUrl || 'https://api.openai.com';
  const body = {
    model: cfg.aiModel || 'gpt-4o',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
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

async function generateArticle({ keyword, related = [], extra = '', webSearch = false }) {
  const cfg = store.getConfig();
  if (!cfg.aiKey) throw new Error('未配置 AI API Key');
  const userPrompt = `核心关键词：${keyword}
相关/热搜词（自然融入即可，不必全用）：${related.join('、') || '无'}
${extra ? `补充要求：${extra}` : ''}

请输出 JSON。`;
  const text = cfg.aiProvider === 'openai'
    ? await callOpenAI(cfg, userPrompt, { webSearch })
    : await callAnthropic(cfg, userPrompt, { webSearch });
  const obj = parseJsonLoose(text);
  if (!obj.title || !obj.body) throw new Error('AI 返回缺少 title/body');
  return obj;
}

module.exports = { generateArticle };
