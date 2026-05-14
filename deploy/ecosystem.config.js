const path = require('path');

module.exports = {
  apps: [{
    name: 'mp-auto-publisher',
    script: 'server.js',
    cwd: path.resolve(__dirname, '..'),
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3030,
      ACCESS_KEY: process.env.ACCESS_KEY || 'AIZAOWUJINHUA',
    },
    error_file: path.resolve(__dirname, '..', 'data', 'pm2-error.log'),
    out_file: path.resolve(__dirname, '..', 'data', 'pm2-out.log'),
    merge_logs: true,
    time: true,
  }],
};
