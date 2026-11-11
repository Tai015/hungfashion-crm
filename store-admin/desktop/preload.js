const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storeAdminLauncher', {
  isElectronApp: true,
  openLocal: () => ipcRenderer.invoke('launcher:open-local'),
  openTestCenter: () => ipcRenderer.invoke('launcher:open-test-center'),
  openDatabase: () => ipcRenderer.invoke('launcher:open-database'),
  openKafkaUi: () => ipcRenderer.invoke('launcher:open-kafka-ui'),
  openDeploy: () => ipcRenderer.invoke('launcher:open-deploy'),
  stopLocal: () => ipcRenderer.invoke('launcher:stop-local'),
  onLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('launcher:log', listener);
    return () => ipcRenderer.removeListener('launcher:log', listener);
  },
});
