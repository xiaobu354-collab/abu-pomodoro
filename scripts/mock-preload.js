const { contextBridge } = require('electron');

const argumentValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
};

const previewPhase = argumentValue('mint-preview-phase', 'focus');
const previewTheme = argumentValue('mint-preview-theme', 'writing');
const previewWindowMode = argumentValue('mint-preview-window-mode', 'compact');
const previewTransition = argumentValue('mint-preview-show-transition', '0') === '1';
const isBreakPreview = previewPhase !== 'focus';

const state = {
  windowMode: previewWindowMode,
  undo: argumentValue('mint-preview-undo', '0') === '1' ? {label:'已重置',expiresAt:Date.now()+60000} : null,
  waitingForBreak: false,
  shortcutError: null,
  reminderPacks: ['window-tea','headphones-beanbag','cloud-nap','stretch','watering-sprout','book-nook','hammock','snack-picnic','bubble-soak','stargazing'].map((id,index)=>({id,name:['窗边热饮','耳机小憩','云朵小睡','伸个懒腰','浇水发芽','角落读书','吊床微风','零食野餐','泡泡放松','抬头看星'][index],image:`../../assets/rest-reminders/${String(index+1).padStart(2,'0')}-${id}.png`})),
  timer: {
    phase: previewPhase,
    status: 'running',
    remainingMs: isBreakPreview ? 3 * 60 * 1000 + 42 * 1000 : 17 * 60 * 1000 + 42 * 1000,
    remainingSeconds: isBreakPreview ? 3 * 60 + 42 : 17 * 60 + 42,
    totalMs: isBreakPreview ? 5 * 60 * 1000 : 25 * 60 * 1000,
    completedFocusSessions: 2
  },
  settings: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 10,
    longBreakInterval: 4,
    autoStartBreak: true,
    autoStartFocus: false,
    pauseShortcut: '',
    soundEnabled: true,
    notificationsEnabled: true,
    alwaysOnTop: true,
    launchAtLogin: false,
    focusTheme: previewTheme
  }
};

contextBridge.exposeInMainWorld('mintTimer', {
  reminder: {
    getState: async () => JSON.parse(decodeURIComponent(argumentValue('mint-preview-reminder', '%7B%7D'))),
    onState: () => () => {},
    startBreak: async () => {}, togglePause: async () => {}, finishBreak: async () => {},
    snooze: async () => {}, collapse: async () => {}, startFocus: async () => {}, extendBreak: async () => {},
    reopen: async () => {}, changePack: async () => {}
  },
  getState: async () => state,
  toggleTimer: async () => state,
  resetTimer: async () => state,
  skipTimer: async () => state,
  undoTimer: async () => state,
  openMenu: async () => {},
  openSettings: async () => {},
  closeSettings: async () => {},
  updateSettings: async (patch) => { Object.assign(state.settings,patch); return state; },
  resetSettings: async () => state,
  hideToTray: async () => {},
  onState: () => () => {},
  onPlaySound: () => () => {},
  onPhaseTransition: (callback) => {
    if (previewTransition) {
      setTimeout(() => callback({
        kind: 'completed',
        phase: 'focus',
        nextPhase: 'shortBreak',
        started: true
      }), 100);
    }
    return () => {};
  }
});

