const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // Popup controls
  showPopup: () => ipcRenderer.send('show-popup'),
  minimizePopup: () => ipcRenderer.send('minimize-popup'),

  // Popup bounds
  getPopupBounds: () => ipcRenderer.invoke('get-popup-bounds'),
  savePopupBounds: (bounds) => ipcRenderer.send('save-popup-bounds', bounds),

  // Order count (sent from popup renderer to main process)
  sendOrderCount: (count) => ipcRenderer.send('send-order-count', count),

  // Bubble controls (sent from bubble renderer)
  bubbleClicked: () => ipcRenderer.send('bubble-clicked'),
  saveBubbleBounds: (bounds) => ipcRenderer.send('save-bubble-bounds', bounds),

  // Listen for order count updates (received by bubble renderer)
  onOrderCountChanged: (callback) => {
    const handler = (_event, count) => callback(count);
    ipcRenderer.on('order-count-changed', handler);
    return () => {
      ipcRenderer.removeListener('order-count-changed', handler);
    };
  },
});
