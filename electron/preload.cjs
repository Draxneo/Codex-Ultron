const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  off: (channel, listener) => ipcRenderer.removeListener(channel, listener),
  // Power & audio fallbacks for "screen off / tray" reliability
  playSystemBeep: () => ipcRenderer.send('play-system-beep'),
  incomingCallWake: (payload) => ipcRenderer.send('incoming-call-wake', payload),
  onPowerResume: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('power-resume', handler);
    return () => ipcRenderer.removeListener('power-resume', handler);
  },
});
