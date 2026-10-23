const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kum3d', {
  chooseExport: (name) => ipcRenderer.invoke('export:choose', name),
  writeExport: (data) => ipcRenderer.invoke('export:write', data),
  readAsset: (name) => ipcRenderer.invoke('asset:read', name)
});
