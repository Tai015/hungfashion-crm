const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('storeAdminLauncher', {
  openLocal: () => ipcRenderer.invoke('launcher:open-local'),
  openDatabase: () => ipcRenderer.invoke('launcher:open-database'),
  openKafkaUi: () => ipcRenderer.invoke('launcher:open-kafka-ui'),
  openDeploy: () => ipcRenderer.invoke('launcher:open-deploy'),
  stopLocal: () => ipcRenderer.invoke('launcher:stop-local'),
  runE2e: (target) => ipcRenderer.invoke('launcher:run-e2e', target),
  stopE2e: () => ipcRenderer.invoke('launcher:stop-e2e'),
  openE2eReport: () => ipcRenderer.invoke('launcher:open-e2e-report'),
  openGithubActions: () => ipcRenderer.invoke('launcher:open-github-actions'),
  onE2eStatus: (callback) => {
    const listener = (_event, running) => callback(running);
    ipcRenderer.on('launcher:e2e-status', listener);
    return () => ipcRenderer.removeListener('launcher:e2e-status', listener);
  },
  onLog: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('launcher:log', listener);
    return () => ipcRenderer.removeListener('launcher:log', listener);
  },
});
