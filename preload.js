const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kum3d', {
  saveStl: (name, data) => ipcRenderer.invoke('stl:save', { name, data })
});
