const express = require('express');
const session = require('express-session');
const cron = require('node-cron');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./lib/store');
const trends = require('./lib/trends');
const pipeline = require('./lib/pipeline');
const themes = require('./lib/themes');
const news = require('./lib/news');
const writers = require('./lib/writers');
const FileSessionStore = require('./lib/session-store');
const { getDataDir } = require('./lib/paths');

const ACCESS_KEY = process.env.ACCESS_KEY || 'AIZAOWUJINHUA';
const PORT = Number(process.env.PORT) || 3030;
const SKIP_AUTH = process.env.MPAP_SKIP_AUTH === '1';

function loadOrCreateSessionSecret() {
  const secretFile = path.join(getDataDir(), 'session-secret');
  try { return fs.readFileSync(secretFile, 'utf8').trim(); } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, s, { mode: 0o600 });
  return s;
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: loadOrCreateSessionSecret(),
  resave: false,
  saveUninitialized: false,
  store: new FileSessionStore(),
  rolling: true,
  cookie: {
    maxAge: 365 * 24 * 3600 * 1000,
    httpOnly: true,
    sameSite: 'lax',
  },
}));

app.use((req, res, next) => {
  if (SKIP_AUTH) return next();
  const open = ['/login', '/api/login', '/style.css', '/app.js', '/favicon.ico'];
  if (req.path === '/' || open.includes(req.path)) return next();
  if (req.path.startsWith('/api/')) {
    if (!req.session.auth) return res.status(401).json({ error: 'unauthorized' });
    return next();
  }
  if (!req.session.auth) return res.redirect('/');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => {
  if (SKIP_AUTH || req.session.auth) return res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/login', (req, res) => {
  const { key } = req.body || {};
  if (key !== ACCESS_KEY) return res.status(403).json({ error: 'invalid key' });
  req.session.auth = true;
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/status', async (req, res) => {
  let publicIp = null;
  const ipSources = [
    { url: 'https://ip.3322.net', parse: (t) => t.trim() },
    { url: 'https://www.taobao.com/help/getip.php', parse: (t) => (t.match(/ip:"([\d.]+)"/) || [])[1] },
    { url: 'https://api.ipify.org?format=json', parse: (t) => JSON.parse(t).ip },
    { url: 'https://ifconfig.me/ip', parse: (t) => t.trim() },
  ];
  for (const src of ipSources) {
    try {
      const r = await fetch(src.url, { signal: AbortSignal.timeout(3000) });
      const t = await r.text();
      const ip = src.parse(t);
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) { publicIp = ip; break; }
    } catch {}
  }
  const ifaces = os.networkInterfaces();
  const localIps = [];
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) localIps.push(i.address);
    }
  }
  const cfg = store.getConfig();
  const accounts = cfg.accounts || [];
  res.json({
    publicIp,
    localIps,
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    nodeVersion: process.version,
    accountCount: accounts.length,
    appidConfigured: accounts.length > 0,
    aiConfigured: !!cfg.aiKey,
    imageProvider: cfg.imageProvider,
    imageSources: (() => {
      const m = cfg.imageKeys || {};
      const list = ['pexels', 'pixabay', 'unsplash'].filter(p => m[p]);
      if (cfg.enableBaidu) list.push('baidu');
      if (list.length) return list;
      if (cfg.imageKey && cfg.imageProvider && cfg.imageProvider !== 'placeholder') return [cfg.imageProvider];
      return [];
    })(),
    jobCount: store.getJobs().length,
  });
});

function maskKey(k) {
  return k ? '***' + k.slice(-4) : '';
}

app.get('/api/config', (req, res) => {
  const cfg = store.getConfig();
  const imageKeys = cfg.imageKeys || {};
  res.json({
    ...cfg,
    accounts: (cfg.accounts || []).map(a => ({
      id: a.id, name: a.name, appid: a.appid, secret: maskKey(a.secret),
    })),
    aiKey: maskKey(cfg.aiKey),
    imageKey: maskKey(cfg.imageKey),
    imageKeys: {
      pexels: maskKey(imageKeys.pexels),
      pixabay: maskKey(imageKeys.pixabay),
      unsplash: maskKey(imageKeys.unsplash),
    },
  });
});

app.post('/api/config', (req, res) => {
  const old = store.getConfig();
  const incoming = req.body || {};
  const merged = { ...old };
  for (const k of Object.keys(incoming)) {
    let v = incoming[k];
    if (v === null || v === undefined) continue;
    if (k === 'accounts') continue; // 账号通过 /api/accounts 单独管理
    if (k === 'imageKeys' && v && typeof v === 'object') {
      const oldMap = merged.imageKeys || {};
      const next = { ...oldMap };
      for (const p of Object.keys(v)) {
        let pv = v[p];
        if (typeof pv !== 'string') continue;
        if (pv.startsWith('***')) continue;
        pv = pv.trim();
        if (!pv) continue; // 留空表示"不修改"——和顶层 key 保持一致，避免一次保存把其它图源 key 清掉
        next[p] = pv;
      }
      merged.imageKeys = next;
      continue;
    }
    if (v === '') continue;
    if (typeof v === 'string') {
      if (v.startsWith('***')) continue;
      v = v.trim();
      if (!v) continue;
    }
    merged[k] = v;
  }
  store.setConfig(merged);
  res.json({ ok: true });
});

// === 多公众号 CRUD ===
function publicAccount(a) {
  return { id: a.id, name: a.name, appid: a.appid, secret: maskKey(a.secret) };
}

app.get('/api/accounts', (req, res) => {
  const cfg = store.getConfig();
  res.json({
    accounts: (cfg.accounts || []).map(publicAccount),
    defaultAccountId: cfg.defaultAccountId || '',
  });
});

app.post('/api/accounts', (req, res) => {
  const { id, name, appid, secret } = req.body || {};
  try {
    // 编辑场景：若 secret 是掩码或留空，按"不修改"处理
    const payload = { id, name, appid };
    if (secret && !String(secret).startsWith('***')) payload.secret = secret;
    const saved = store.upsertAccount(payload);
    res.json(publicAccount(saved));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  const ok = store.deleteAccount(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  // 同步把以该账号为目标的定时任务停掉并清掉 accountId（保留任务体，提示用户重新选）
  const jobs = store.getJobs();
  let dirty = false;
  for (const j of jobs) {
    if (j.accountId === req.params.id) {
      j.accountId = '';
      j.enabled = false;
      dirty = true;
      const t = scheduledTasks.get(j.id);
      if (t) { t.stop(); scheduledTasks.delete(j.id); }
    }
  }
  if (dirty) store.setJobs(jobs);
  res.json({ ok: true });
});

app.post('/api/accounts/default', (req, res) => {
  const { id } = req.body || {};
  try {
    const next = store.setDefaultAccount(id);
    res.json({ defaultAccountId: next });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/trends', async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'keyword required' });
  try {
    const data = await trends.mineRelated(keyword);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const taskLogs = new Map();
function newTask() {
  const id = crypto.randomBytes(6).toString('hex');
  taskLogs.set(id, { logs: [], done: false, result: null, error: null, revision: 0 });
  return id;
}
function bumpResult(id, result) {
  const t = taskLogs.get(id); if (!t) return;
  t.result = result;
  t.revision = (t.revision || 0) + 1;
}
function appendLog(id, msg) {
  const t = taskLogs.get(id); if (!t) return;
  t.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

app.get('/api/themes', (req, res) => {
  res.json({ themes: themes.listThemes(), default: themes.DEFAULT_THEME });
});

app.get('/api/writers', (req, res) => {
  res.json({ writers: writers.listWriters(), defaultId: writers.DEFAULT_ID });
});

app.post('/api/writers', (req, res) => {
  const { writers: list } = req.body || {};
  try {
    const saved = writers.saveWriters(list);
    res.json({ writers: saved });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/news-categories', (req, res) => {
  res.json({ categories: news.listCategories() });
});

app.post('/api/restyle', (req, res) => {
  const { bodyRaw = '', imgUrlMap = {}, theme = themes.DEFAULT_THEME } = req.body || {};
  if (!bodyRaw) return res.status(400).json({ error: 'bodyRaw required' });
  const html = themes.renderBody(bodyRaw, imgUrlMap, theme);
  res.json({ html, themeName: theme });
});

app.post('/api/generate', (req, res) => {
  const {
    keyword = '', extra = '', theme = themes.DEFAULT_THEME, webSearch = false,
    useNews = false, newsCategory = '', writerId = writers.DEFAULT_ID,
    referenceLinks = [],
  } = req.body || {};
  const refs = Array.isArray(referenceLinks)
    ? referenceLinks.map(s => String(s || '').trim()).filter(s => /^https?:\/\//i.test(s))
    : [];
  if (!keyword && !refs.length) return res.status(400).json({ error: 'keyword 或参考链接至少要填一个' });
  const id = newTask();
  res.json({ taskId: id });
  (async () => {
    const t = taskLogs.get(id);
    try {
      const writer = writers.getWriter(writerId) || writers.getWriter(writers.DEFAULT_ID);
      const result = await pipeline.generateContent({
        keyword, extra, themeName: theme, webSearch: !!webSearch,
        useNews: !!useNews, newsCategory,
        referenceLinks: refs,
        writerPrompt: writer ? writer.prompt : '',
        writerName: writer ? writer.name : '',
        log: (m) => appendLog(id, m),
        onTextReady: (partial) => bumpResult(id, partial),
      });
      bumpResult(id, result);
      t.done = true;
      appendLog(id, '✅ 生成完成，可在预览区调整后推送草稿');
    } catch (e) {
      t.error = e.message; t.done = true;
      appendLog(id, '❌ ' + e.message);
    }
  })();
});

app.post('/api/push-draft', (req, res) => {
  const { accountId = '', title, digest = '', html, coverUrl = '', keyword = '' } = req.body || {};
  if (!title || !html) {
    return res.status(400).json({ error: 'title / html 必填' });
  }
  const id = newTask();
  res.json({ taskId: id });
  (async () => {
    const t = taskLogs.get(id);
    try {
      const result = await pipeline.pushDraftFromContent({
        accountId, title, digest, html, coverUrl, keyword,
        log: (m) => appendLog(id, m),
      });
      t.result = result; t.done = true;
      appendLog(id, '✅ 已推送到草稿箱');
    } catch (e) {
      t.error = e.message; t.done = true;
      appendLog(id, '❌ ' + e.message);
    }
  })();
});

app.get('/api/task/:id', (req, res) => {
  const t = taskLogs.get(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(t);
});

app.get('/api/jobs', (req, res) => res.json(store.getJobs()));

app.post('/api/jobs', (req, res) => {
  const {
    accountId = '',
    keyword, cron: cronExpr, extra = '', enabled = true,
    theme = themes.DEFAULT_THEME, webSearch = false,
    useNews = false, newsCategory = '', writerId = writers.DEFAULT_ID,
  } = req.body || {};
  if (!keyword || !cronExpr) return res.status(400).json({ error: 'keyword 和 cron 必填' });
  if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'cron 表达式不合法' });
  const account = store.resolveAccount(accountId);
  if (!account) return res.status(400).json({ error: '请先在「配置」页添加至少一个公众号' });
  const jobs = store.getJobs();
  const id = crypto.randomBytes(6).toString('hex');
  const job = {
    id, accountId: account.id,
    keyword, cron: cronExpr, extra, enabled,
    theme, webSearch: !!webSearch,
    useNews: !!useNews, newsCategory: newsCategory || '',
    writerId: writerId || writers.DEFAULT_ID,
    lastRun: null, lastResult: null,
  };
  jobs.push(job);
  store.setJobs(jobs);
  if (enabled) scheduleJob(job);
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  const jobs = store.getJobs();
  const idx = jobs.findIndex(j => j.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  const removed = jobs.splice(idx, 1)[0];
  store.setJobs(jobs);
  const task = scheduledTasks.get(removed.id);
  if (task) { task.stop(); scheduledTasks.delete(removed.id); }
  res.json({ ok: true });
});

app.post('/api/jobs/:id/toggle', (req, res) => {
  const jobs = store.getJobs();
  const job = jobs.find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  job.enabled = !job.enabled;
  store.setJobs(jobs);
  const existing = scheduledTasks.get(job.id);
  if (existing) { existing.stop(); scheduledTasks.delete(job.id); }
  if (job.enabled) scheduleJob(job);
  res.json(job);
});

app.post('/api/jobs/:id/run', (req, res) => {
  const job = store.getJobs().find(j => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  const id = newTask();
  res.json({ taskId: id });
  (async () => {
    const t = taskLogs.get(id);
    try {
      appendLog(id, `手动触发任务 ${job.keyword}${job.webSearch ? '（联网搜索）' : ''}${job.useNews ? '（抓新闻）' : ''}`);
      const w = writers.getWriter(job.writerId) || writers.getWriter(writers.DEFAULT_ID);
      const result = await pipeline.runFullPipeline({
        accountId: job.accountId || '',
        keyword: job.keyword, extra: job.extra, pushDraft: true,
        themeName: job.theme || themes.DEFAULT_THEME,
        webSearch: !!job.webSearch,
        useNews: !!job.useNews,
        newsCategory: job.newsCategory || '',
        writerPrompt: w ? w.prompt : '',
        writerName: w ? w.name : '',
        log: (m) => appendLog(id, m),
      });
      t.result = result; t.done = true;
      const jobs = store.getJobs();
      const j = jobs.find(x => x.id === job.id);
      if (j) { j.lastRun = Date.now(); j.lastResult = `OK: ${result.title}`; store.setJobs(jobs); }
      appendLog(id, '✅ 完成');
    } catch (e) {
      t.error = e.message; t.done = true;
      appendLog(id, '❌ ' + e.message);
    }
  })();
});

app.get('/api/history', (req, res) => res.json(store.getHistory()));

const scheduledTasks = new Map();

function scheduleJob(job) {
  const task = cron.schedule(job.cron, async () => {
    try {
      console.log(`[CRON] 执行任务 ${job.keyword}${job.webSearch ? '（联网搜索）' : ''}${job.useNews ? '（抓新闻）' : ''}`);
      const w = writers.getWriter(job.writerId) || writers.getWriter(writers.DEFAULT_ID);
      const result = await pipeline.runFullPipeline({
        accountId: job.accountId || '',
        keyword: job.keyword, extra: job.extra, pushDraft: true,
        themeName: job.theme || themes.DEFAULT_THEME,
        webSearch: !!job.webSearch,
        useNews: !!job.useNews,
        newsCategory: job.newsCategory || '',
        writerPrompt: w ? w.prompt : '',
        writerName: w ? w.name : '',
        log: (m) => console.log(`  ${m}`),
      });
      const jobs = store.getJobs();
      const j = jobs.find(x => x.id === job.id);
      if (j) { j.lastRun = Date.now(); j.lastResult = `OK: ${result.title}`; store.setJobs(jobs); }
    } catch (e) {
      console.error(`[CRON] 失败:`, e.message);
      const jobs = store.getJobs();
      const j = jobs.find(x => x.id === job.id);
      if (j) { j.lastRun = Date.now(); j.lastResult = `ERR: ${e.message}`; store.setJobs(jobs); }
    }
  });
  scheduledTasks.set(job.id, task);
}

for (const job of store.getJobs()) {
  if (job.enabled) scheduleJob(job);
}

function startServer({ port = PORT, host = '0.0.0.0', silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const actualPort = server.address().port;
      if (!silent) {
        console.log(`\n✨ 微信公众号自动发文后台已启动`);
        console.log(`   本机访问:   http://localhost:${actualPort}`);
        const ifaces = os.networkInterfaces();
        for (const list of Object.values(ifaces)) {
          for (const i of list || []) {
            if (i.family === 'IPv4' && !i.internal) {
              console.log(`   局域网访问: http://${i.address}:${actualPort}`);
            }
          }
        }
        if (!SKIP_AUTH) console.log(`   登录密钥:   ${ACCESS_KEY}\n`);
      }
      resolve({ port: actualPort, url: `http://127.0.0.1:${actualPort}`, server });
    });
    server.on('error', reject);
  });
}

module.exports = { startServer, app };

if (require.main === module) {
  startServer().catch(e => {
    console.error('server failed:', e);
    process.exit(1);
  });
}
