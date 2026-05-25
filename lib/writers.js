const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataDir } = require('./paths');
const { DEFAULT_SYSTEM_PROMPT } = require('./ai');

const FILE = 'writers.json';
const DEFAULT_ID = 'default';

function filePath() {
  return path.join(getDataDir(), FILE);
}

function readRaw() {
  try {
    const f = filePath();
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return null; }
}

function writeRaw(list) {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(list, null, 2));
}

function defaultWriter() {
  return {
    id: DEFAULT_ID,
    name: 'AI公众号写手',
    prompt: DEFAULT_SYSTEM_PROMPT,
    builtin: true,
  };
}

function ensureDefault(list) {
  if (!Array.isArray(list) || !list.length) return [defaultWriter()];
  const hasDefault = list.some(w => w && w.id === DEFAULT_ID);
  if (!hasDefault) list.unshift(defaultWriter());
  return list;
}

function listWriters() {
  const raw = readRaw();
  const list = ensureDefault(raw);
  if (!raw) writeRaw(list);
  return list;
}

function getWriter(id) {
  const list = listWriters();
  return list.find(w => w.id === id) || null;
}

function getWriterPrompt(id) {
  const w = id ? getWriter(id) : null;
  if (w && typeof w.prompt === 'string' && w.prompt.trim()) return w.prompt;
  return DEFAULT_SYSTEM_PROMPT;
}

// 完整替换列表，前端编辑写手卡片后一次性保存。
// 校验：name 必填；prompt 必填；保证至少留一个 builtin 默认写手（强制存在）。
function saveWriters(incoming) {
  if (!Array.isArray(incoming)) throw new Error('writers 必须是数组');
  const clean = [];
  const seenIds = new Set();
  for (const w of incoming) {
    if (!w || typeof w !== 'object') continue;
    const name = typeof w.name === 'string' ? w.name.trim() : '';
    const prompt = typeof w.prompt === 'string' ? w.prompt.trim() : '';
    if (!name) throw new Error('写手名称不能为空');
    if (!prompt) throw new Error(`写手「${name}」的提示词不能为空`);
    let id = typeof w.id === 'string' && w.id ? w.id : crypto.randomBytes(6).toString('hex');
    if (seenIds.has(id)) id = crypto.randomBytes(6).toString('hex');
    seenIds.add(id);
    clean.push({
      id,
      name,
      prompt,
      builtin: id === DEFAULT_ID,
    });
  }
  const finalList = ensureDefault(clean);
  writeRaw(finalList);
  return finalList;
}

module.exports = {
  listWriters,
  getWriter,
  getWriterPrompt,
  saveWriters,
  DEFAULT_ID,
};
