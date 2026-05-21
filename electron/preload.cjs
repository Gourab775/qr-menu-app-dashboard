const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getPopupBounds: () => ipcRenderer.invoke('get-popup-bounds'),
  savePopupBounds: (bounds) => ipcRenderer.send('save-popup-bounds', bounds),
});
