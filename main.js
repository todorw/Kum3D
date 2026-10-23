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

ipcMain.handle('stl:save', async (event, { name, data }) => {
  if (!(data instanceof Uint8Array)) throw new Error('Invalid STL data');
  const win = BrowserWindow.fromWebContents(event.sender);
  const safeName = String(name || 'model').replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim().slice(0, 100) || 'model';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Export STL',
    defaultPath: `${safeName}.stl`,
    filters: [{ name: 'STL', extensions: ['stl'] }]
  });
  if (canceled || !filePath) return null;
  const target = filePath.toLowerCase().endsWith('.stl') ? filePath : `${filePath}.stl`;
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
