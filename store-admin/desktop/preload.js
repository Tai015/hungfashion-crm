const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storeAdminLauncher', {
  openLocal: () => ipcRenderer.invoke('launcher:open-local'),
  openDatabase: () => ipcRenderer.invoke('launcher:open-database'),
  openKafkaUi: () => ipcRenderer.invoke('launcher:open-kafka-ui'),
  openRemote: (url) => ipcRenderer.invoke('launcher:open-remote', url),
  stopLocal: () => ipcRenderer.invoke('launcher:stop-local'),
  onLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('launcher:log', listener);
    return () => ipcRenderer.removeListener('launcher:log', listener);
  },
});