const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kum3d', {
  saveStl: (name, data) => ipcRenderer.invoke('stl:save', { name, data }),
  readAsset: (name) => ipcRenderer.invoke('asset:read', name)
});
