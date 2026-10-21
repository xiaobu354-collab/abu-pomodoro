const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('mintTimer', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  toggleTimer: () => ipcRenderer.invoke('timer:toggle'),
  resetTimer: () => ipcRenderer.invoke('timer:reset'),
  skipTimer: () => ipcRenderer.invoke('timer:skip'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  closeSettings: () => ipcRenderer.invoke('settings:close'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  hideToTray: () => ipcRenderer.invoke('window:hide'),
  openMenu: () => ipcRenderer.invoke('window:menu'),
  undoTimer: () => ipcRenderer.invoke('timer:undo'),
  reminder: {
    reopen: () => ipcRenderer.invoke('reminder:reopen'),
    changePack: () => ipcRenderer.invoke('reminder:change-pack'),
    getState: () => ipcRenderer.invoke('reminder:get-state'),
    startBreak: () => ipcRenderer.invoke('reminder:start-break'),
    togglePause: () => ipcRenderer.invoke('reminder:toggle-pause'),
    finishBreak: () => ipcRenderer.invoke('reminder:finish-break'),
    skipBreak: () => ipcRenderer.invoke('reminder:skip-break'),
    snooze: () => ipcRenderer.invoke('reminder:snooze'),
    collapse: () => ipcRenderer.invoke('reminder:collapse'),
    startFocus: () => ipcRenderer.invoke('reminder:start-focus'),
    extendBreak: () => ipcRenderer.invoke('reminder:extend-break'),
    onState: (callback) => subscribe('reminder:state', callback)
  },
  onState: (callback) => subscribe('state:changed', callback),
  onPlaySound: (callback) => subscribe('sound:play', callback),
  onPhaseTransition: (callback) => subscribe('phase:transition', callback)
});
