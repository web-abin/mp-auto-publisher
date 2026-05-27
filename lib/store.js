const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataDir } = require('./paths');

function ensure() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function read(name, fallback) {
  ensure();
  const file = path.join(getDataDir(), name);
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function write(name, data) {
  ensure();
  fs.writeFileSync(path.join(getDataDir(), name), JSON.stringify(data, null, 2));
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

// 兼容老配置：单 appid/secret → 迁移到 accounts 数组。
// 返回 { cfg, dirty }，dirty=true 表示结构变了需要回写。
function migrateConfig(cfg) {
  let dirty = false;
  if (!cfg) return { cfg, dirty };
  if (!Array.isArray(cfg.accounts)) {
    cfg.accounts = [];
    if (cfg.appid && cfg.secret) {
      const id = newId();
      cfg.accounts.push({ id, name: '默认公众号', appid: cfg.appid, secret: cfg.secret });
      cfg.defaultAccountId = id;
    }
    delete cfg.appid;
    delete cfg.secret;
    dirty = true;
  }
  if (!cfg.defaultAccountId && cfg.accounts.length) {
    cfg.defaultAccountId = cfg.accounts[0].id;
    dirty = true;
  }
  return { cfg, dirty };
}

function getConfig() {
  const raw = read('config.json', {
    accounts: [],
    defaultAccountId: '',
    aiProvider: 'anthropic',
    aiKey: '',
    aiModel: 'claude-sonnet-4-6',
    aiBaseUrl: '',
    imageProvider: 'pexels',
    imageKey: '',
    imageKeys: { pexels: '', pixabay: '', unsplash: '' },
    enableBaidu: false,
  });
  const { cfg, dirty } = migrateConfig(raw);
  if (dirty) write('config.json', cfg);
  return cfg;
}

function setConfig(cfg) { write('config.json', cfg); }

function getAccounts() {
  return getConfig().accounts || [];
}

function getAccount(id) {
  if (!id) return null;
  return getAccounts().find(a => a.id === id) || null;
}

function getDefaultAccount() {
  const cfg = getConfig();
  if (!cfg.accounts.length) return null;
  return cfg.accounts.find(a => a.id === cfg.defaultAccountId) || cfg.accounts[0];
}

function resolveAccount(id) {
  return (id && getAccount(id)) || getDefaultAccount();
}

function upsertAccount(input) {
  const cfg = getConfig();
  const accounts = cfg.accounts || [];
  const incoming = input || {};
  const name = (incoming.name || '').trim();
  const appid = (incoming.appid || '').trim();
  const secret = (incoming.secret || '').trim();
  if (!name) throw new Error('公众号名称必填');
  if (!appid) throw new Error('APPID 必填');

  if (incoming.id) {
    const idx = accounts.findIndex(a => a.id === incoming.id);
    if (idx < 0) throw new Error('账号不存在');
    if (accounts.some((a, i) => i !== idx && a.appid === appid)) {
      throw new Error('已存在相同 APPID 的账号');
    }
    accounts[idx] = {
      ...accounts[idx],
      name,
      appid,
      secret: secret || accounts[idx].secret,
    };
    cfg.accounts = accounts;
    setConfig(cfg);
    return accounts[idx];
  }

  if (!secret) throw new Error('新账号的 AppSecret 必填');
  if (accounts.some(a => a.appid === appid)) {
    throw new Error('已存在相同 APPID 的账号');
  }
  const account = { id: newId(), name, appid, secret };
  accounts.push(account);
  cfg.accounts = accounts;
  if (!cfg.defaultAccountId) cfg.defaultAccountId = account.id;
  setConfig(cfg);
  return account;
}

function deleteAccount(id) {
  const cfg = getConfig();
  const idx = (cfg.accounts || []).findIndex(a => a.id === id);
  if (idx < 0) return false;
  cfg.accounts.splice(idx, 1);
  if (cfg.defaultAccountId === id) {
    cfg.defaultAccountId = cfg.accounts.length ? cfg.accounts[0].id : '';
  }
  setConfig(cfg);
  // 同步清掉这个 appid 的 token 缓存
  const tokens = read('token.json', {}) || {};
  // 旧版结构是 { appid, token, expire }，新版是 { [appid]: { token, expire } }
  if (tokens.appid && !tokens[tokens.appid]) {
    if (tokens.appid === (cfg.accounts.find(a => a.id === id)?.appid)) {
      write('token.json', {});
    }
  }
  return true;
}

function setDefaultAccount(id) {
  const cfg = getConfig();
  if (!cfg.accounts.some(a => a.id === id)) throw new Error('账号不存在');
  cfg.defaultAccountId = id;
  setConfig(cfg);
  return cfg.defaultAccountId;
}

// === token 缓存（按 appid 分仓） ===
function getTokenFor(appid) {
  if (!appid) return null;
  const raw = read('token.json', {}) || {};
  // 兼容旧结构 { appid, token, expire }
  if (raw.token && raw.appid === appid) return { token: raw.token, expire: raw.expire };
  const entry = raw[appid];
  return entry ? { token: entry.token, expire: entry.expire } : null;
}

function setTokenFor(appid, token, expire) {
  if (!appid) return;
  const raw = read('token.json', {}) || {};
  // 老结构丢弃，统一新结构
  const next = {};
  for (const k of Object.keys(raw)) {
    if (k === 'token' || k === 'appid' || k === 'expire') continue;
    next[k] = raw[k];
  }
  next[appid] = { token, expire };
  write('token.json', next);
}

module.exports = {
  getConfig,
  setConfig,
  getAccounts,
  getAccount,
  getDefaultAccount,
  resolveAccount,
  upsertAccount,
  deleteAccount,
  setDefaultAccount,
  getTokenFor,
  setTokenFor,
  getJobs: () => read('jobs.json', []),
  setJobs: (jobs) => write('jobs.json', jobs),
  getHistory: () => read('history.json', []),
  pushHistory: (item) => {
    const all = read('history.json', []);
    all.unshift({ ...item, ts: Date.now() });
    write('history.json', all.slice(0, 200));
  },
};
