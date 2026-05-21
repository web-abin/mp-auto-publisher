const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { getDataDir } = require('./paths');

class FileSessionStore extends session.Store {
  constructor(opts = {}) {
    super(opts);
    this.file = opts.file || path.join(getDataDir(), 'sessions.json');
    this.cache = this._load();
    this._saveTimer = null;
  }
  _load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }
  _save() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.cache), { mode: 0o600 });
      } catch (e) { console.error('session save failed:', e.message); }
    }, 200);
  }
  _expiresOf(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : null;
  }
  get(sid, cb) {
    const s = this.cache[sid];
    if (!s) return cb(null, null);
    if (s.expires && s.expires < Date.now()) {
      delete this.cache[sid];
      this._save();
      return cb(null, null);
    }
    cb(null, s.data);
  }
  set(sid, sess, cb) {
    this.cache[sid] = { data: sess, expires: this._expiresOf(sess) };
    this._save();
    cb && cb(null);
  }
  destroy(sid, cb) {
    if (this.cache[sid]) { delete this.cache[sid]; this._save(); }
    cb && cb(null);
  }
  touch(sid, sess, cb) {
    if (this.cache[sid]) {
      this.cache[sid].expires = this._expiresOf(sess);
      this._save();
    }
    cb && cb(null);
  }
}

module.exports = FileSessionStore;
