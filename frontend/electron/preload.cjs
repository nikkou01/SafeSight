const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('safesight', {
  openPrintReport: (html) => ipcRenderer.invoke('open-print-window', html),
});
