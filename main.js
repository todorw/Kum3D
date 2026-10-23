const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Kum3D',
    backgroundColor: '#111317',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

const assets = {
  model: path.join(__dirname, 'assets', 'models', 'u2netp.onnx'),
  runtime: path.join(__dirname, 'build', 'ort.wasm')
};

ipcMain.handle('asset:read', async (event, name) => {
  if (!Object.hasOwn(assets, name)) throw new Error('Unknown asset');
  return new Uint8Array(await fs.readFile(assets[name]));
});

let pendingExport = null;

ipcMain.handle('export:choose', async (event, name) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const safeName = String(name || 'model').replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim().slice(0, 100) || 'model';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export model',
    defaultPath: `${safeName}.stl`,
    filters: [
      { name: 'STL', extensions: ['stl'] },
      { name: '3MF', extensions: ['3mf'] }
    ]
  });
  if (canceled || !filePath) return null;
  const extension = path.extname(filePath).toLowerCase();
  const format = extension === '.3mf' ? '3mf' : 'stl';
  pendingExport = extension === '.3mf' || extension === '.stl' ? filePath : `${filePath}.stl`;
  return { path: pendingExport, format };
});

ipcMain.handle('export:write', async (event, data) => {
  if (!pendingExport || !(data instanceof Uint8Array)) throw new Error('Nothing to export');
  const target = pendingExport;
  pendingExport = null;
  await fs.writeFile(target, data);
  return target;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
