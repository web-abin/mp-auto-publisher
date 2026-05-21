const path = require('path');
const fs = require('fs');

let cached = null;

function getDataDir() {
  if (cached) return cached;
  cached = process.env.MPAP_DATA_DIR
    ? process.env.MPAP_DATA_DIR
    : path.join(__dirname, '..', 'data');
  try { fs.mkdirSync(cached, { recursive: true }); } catch {}
  return cached;
}

module.exports = { getDataDir };
