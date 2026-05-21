const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('公众号自动发文');

const userDataDir = path.join(app.getPath('appData'), '公众号自动发文');
const dataDir = path.join(userDataDir, 'data');
try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}

process.env.MPAP_DATA_DIR = dataDir;
process.env.MPAP_SKIP_AUTH = '1';

migrateOldDataIfNeeded();

let mainWindow = null;
let serverPromise = null;

function migrateOldDataIfNeeded() {
  const target = path.join(dataDir, 'config.json');
  if (fs.existsSync(target)) return;

  const candidates = [
    path.join(__dirname, 'data'),
    process.resourcesPath ? path.join(process.resourcesPath, 'data') : null,
  ].filter(Boolean);

  for (const src of candidates) {
    if (!fs.existsSync(path.join(src, 'config.json'))) continue;
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      const to = path.join(dataDir, name);
      try {
        if (!fs.existsSync(to) && fs.statSync(from).isFile()) {
          fs.copyFileSync(from, to);
        }
      } catch {}
    }
    break;
  }
}

async function createWindow() {
  const { startServer } = require('./server');
  serverPromise = startServer({ port: 0, host: '127.0.0.1', silent: true });
  const { url } = await serverPromise;

  const iconPath = path.join(__dirname, 'public', 'logo.png');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    title: '公众号自动发文',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.loadURL(url);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '原始大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = path.join(__dirname, 'build', 'icon.png');
    if (fs.existsSync(dockIcon)) {
      try { app.dock.setIcon(dockIcon); } catch {}
    }
  }
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
