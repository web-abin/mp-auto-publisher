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
  res.json({
    publicIp,
    localIps,
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
    nodeVersion: process.version,
    appidConfigured: !!cfg.appid,
    aiConfigured: !!cfg.aiKey,
    imageProvider: cfg.imageProvider,
    jobCount: store.getJobs().length,
  });
});

app.get('/api/config', (req, res) => {
  const cfg = store.getConfig();
  res.json({
    ...cfg,
    secret: cfg.secret ? '***' + cfg.secret.slice(-4) : '',
    aiKey: cfg.aiKey ? '***' + cfg.aiKey.slice(-4) : '',
    imageKey: cfg.imageKey ? '***' + cfg.imageKey.slice(-4) : '',
  });
});

app.post('/api/config', (req, res) => {
  const old = store.getConfig();
  const incoming = req.body || {};
  const merged = { ...old };
  for (const k of Object.keys(incoming)) {
    let v = incoming[k];
    if (v === '' || v === null || v === undefined) continue;
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

app.post('/api/restyle', (req, res) => {
  const { bodyRaw = '', imgUrlMap = {}, theme = themes.DEFAULT_THEME } = req.body || {};
  if (!bodyRaw) return res.status(400).json({ error: 'bodyRaw required' });
  const html = themes.renderBody(bodyRaw, imgUrlMap, theme);
  res.json({ html, themeName: theme });
});

app.post('/api/generate', (req, res) => {
  const { keyword, extra = '', theme = themes.DEFAULT_THEME, webSearch = false } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'keyword required' });
  const id = newTask();
  res.json({ taskId: id });
  (async () => {
    const t = taskLogs.get(id);
    try {
      const result = await pipeline.generateContent({
        keyword, extra, themeName: theme, webSearch: !!webSearch,
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
  const { title, digest = '', html, coverUrl = '', keyword = '' } = req.body || {};
  if (!title || !html) {
    return res.status(400).json({ error: 'title / html 必填' });
  }
  const id = newTask();
  res.json({ taskId: id });
  (async () => {
    const t = taskLogs.get(id);
    try {
      const result = await pipeline.pushDraftFromContent({
        title, digest, html, coverUrl, keyword,
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
    keyword, cron: cronExpr, extra = '', enabled = true,
    theme = themes.DEFAULT_THEME, webSearch = false,
  } = req.body || {};
  if (!keyword || !cronExpr) return res.status(400).json({ error: 'keyword 和 cron 必填' });
  if (!cron.validate(cronExpr)) return res.status(400).json({ error: 'cron 表达式不合法' });
  const jobs = store.getJobs();
  const id = crypto.randomBytes(6).toString('hex');
  const job = {
    id, keyword, cron: cronExpr, extra, enabled,
    theme, webSearch: !!webSearch,
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
      appendLog(id, `手动触发任务 ${job.keyword}${job.webSearch ? '（联网搜索）' : ''}`);
      const result = await pipeline.runFullPipeline({
        keyword: job.keyword, extra: job.extra, pushDraft: true,
        themeName: job.theme || themes.DEFAULT_THEME,
        webSearch: !!job.webSearch,
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
      console.log(`[CRON] 执行任务 ${job.keyword}${job.webSearch ? '（联网搜索）' : ''}`);
      const result = await pipeline.runFullPipeline({
        keyword: job.keyword, extra: job.extra, pushDraft: true,
        themeName: job.theme || themes.DEFAULT_THEME,
        webSearch: !!job.webSearch,
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
