const fs = require('fs');
const path = require('path');
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

module.exports = {
  getConfig: () => read('config.json', {
    appid: '',
    secret: '',
    aiProvider: 'anthropic',
    aiKey: '',
    aiModel: 'claude-sonnet-4-6',
    aiBaseUrl: '',
    imageProvider: 'pexels',
    imageKey: '',
    imageKeys: { pexels: '', pixabay: '', unsplash: '' },
    enableBaidu: false,
  }),
  setConfig: (cfg) => write('config.json', cfg),
  getJobs: () => read('jobs.json', []),
  setJobs: (jobs) => write('jobs.json', jobs),
  getHistory: () => read('history.json', []),
  pushHistory: (item) => {
    const all = read('history.json', []);
    all.unshift({ ...item, ts: Date.now() });
    write('history.json', all.slice(0, 200));
  },
  getTokenCache: () => read('token.json', {}),
  setTokenCache: (t) => write('token.json', t),
};
