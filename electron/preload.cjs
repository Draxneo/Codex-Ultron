const { contextBridge, ipcRenderer } = require('electron');

const allowedSendChannels = new Set([
  'show-toast',
  'play-system-beep',
  'incoming-call-wake',
  'pop-out-phone',
  'ensure-phone-window',
  'launch-ultraphone',
  'telephony-policy-updated',
  'dial-number',
  'screen-pop',
  'switch-tab',
  'open-csr-intake',
  'csr-call-ended',
]);

const allowedReceiveChannels = new Set([
  'power-resume',
  'phone-popped-out',
  'phone-popped-in',
  'phone-window-shown',
  'dial-number',
  'screen-pop',
  'switch-tab',
  'csr-update',
  'csr-call-ended',
]);

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    if (allowedSendChannels.has(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on: (channel, listener) => {
    if (allowedReceiveChannels.has(channel)) {
      ipcRenderer.on(channel, listener);
    }
  },
  off: (channel, listener) => {
    if (allowedReceiveChannels.has(channel)) {
      ipcRenderer.removeListener(channel, listener);
    }
  },
  // Power & audio fallbacks for "screen off / tray" reliability
  playSystemBeep: () => ipcRenderer.send('play-system-beep'),
  incomingCallWake: (payload) => ipcRenderer.send('incoming-call-wake', payload),
  onPowerResume: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('power-resume', handler);
    return () => ipcRenderer.removeListener('power-resume', handler);
  },
});
