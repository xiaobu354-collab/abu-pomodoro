const path = require('node:path');
const fs = require('node:fs');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Notification,
  screen,
  Tray,
  globalShortcut
} = require('electron');
const { DEFAULT_SETTINGS, normalizeSettings } = require('./config');
const { createLoginStartup } = require('./login-startup');
const { localDateKey, completedSessionsForDate, prepareDailyStartup } = require('./daily-progress');
const { handleSquirrelEvent } = require('./squirrel-startup');
const { TimerEngine } = require('./timer-engine');
const {
  WINDOW_HEIGHT,
  windowWidthForMode,
  boundsForWindowMode
} = require('./window-mode');
const { ReminderController } = require('./reminder-controller');
const { normalizeRotation } = require('./reminder-rotation');
const { createReminderView } = require('./reminder-view');
const { REMINDER_PACK_IDS, getReminderPack } = require('./reminder-content');
const { COMPANION_THEMES, getCompanionAppearance } = require('./companion-themes');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const SETTINGS_WINDOW_HEIGHT = 750;

if (handleSquirrelEvent({ app })) app.quit();

let mainWindow;
let settingsWindow;
let tray;
let timer;
let settings;
let windowMode = 'compact';
let appData = {};
let tickInterval;
let moveSaveTimer;
let isQuitting = false;
let currentDateKey;
let lastTrayMenuKey;
let reminder;
let reminderView;
let miniHiddenByUser=false, cardActive=false, restoringWindows=true;
let undo=null, registeredShortcut='', shortcutError=null, settingsError=null, startupError=null;
let preferencesReadBlocked=false;
let expandedMiniPosition=null;
const smokeTestMode = process.argv.includes('--smoke-test');
const smokeReminderMode = process.argv.includes('--smoke-reminder');
const pairedThemeTrialMode = process.argv.includes('--paired-theme-trial')
  || (app.isPackaged && JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).pairedThemeTrialBuild === true);
const skinTrialMode = process.argv.includes('--skin-trial')
  || (app.isPackaged && JSON.parse(fs.readFileSync(path.join(__dirname,'..','package.json'),'utf8')).skinTrialBuild === true)
  || path.basename(process.execPath).startsWith('MintPomodoro-SkinTrial');
let trialSkinOffset = 0;
const loginStartup=createLoginStartup({app,packaged:app.isPackaged,paired:pairedThemeTrialMode,skin:skinTrialMode,smoke:smokeTestMode,execPath:process.execPath,getKnownPath:()=>appData.loginStartupPath});
if(process.argv[1]==='--squirrel-uninstall' && app.isPackaged){
  try{loginStartup.apply(false);}catch{startupError='启动项移除失败，请检查 Windows 启动应用设置。';}
}
const smokeOutput = smokeTestMode ? path.resolve(process.cwd(), 'artifacts') : null;
const smokeWindowEvents=[];
// Smoke checks use newly-created test windows only, without flashing over user apps.
if (smokeTestMode) app.on('browser-window-created', (_event, window) => {
  window.setOpacity(0);
  for(const event of ['ready-to-show','show','hide','closed','minimize'])window.on(event,()=>smokeWindowEvents.push({id:window.id,event,at:Date.now()}));
  window.webContents.on('did-finish-load',()=>smokeWindowEvents.push({id:window.id,event:'did-finish-load',at:Date.now()}));
});
if (smokeTestMode) app.setPath('userData', path.join(smokeOutput, 'smoke-profile'));
else if (pairedThemeTrialMode) {
  app.setPath('userData', path.join(app.getPath('appData'), 'MintPomodoro-CloudPairedTrial'));
} else if (skinTrialMode) {
  app.setPath('userData', path.join(app.getPath('appData'), 'MintPomodoro-SkinTrial'));
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

function dataFilePath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function readAppData() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFilePath(), 'utf8'));
    if(!saved || typeof saved !== 'object' || Array.isArray(saved))throw Error('Invalid preferences root');
    return saved;
  } catch(error) {
    if(error.code!=='ENOENT'){
      preferencesReadBlocked=true;
      settingsError='原设置读取失败：为保护原文件已停止保存。请检查文件和目录权限，重启应用后重试；本次临时运行不会保存。';
    }
    return {};
  }
}

function saveAppData(candidate=appData, timerState=timer?.exportState()) {
  if(preferencesReadBlocked)return false;
  const file = dataFilePath();
  try {
    if (timerState) candidate.timerSession = timerState;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary=file+'.pending';
    fs.writeFileSync(temporary, JSON.stringify(candidate, null, 2), 'utf8');
    fs.renameSync(temporary,file);
    return true;
  } catch {
    settingsError='设置保存失败：本机文件无法写入。请检查磁盘空间和目录权限后重试。';
    return false;
  }
}

function loadTodayProgress() {
  currentDateKey = localDateKey();
  return completedSessionsForDate(appData.dailyProgress);
}

function saveTodayProgress() {
  appData.dailyProgress = {
    date: currentDateKey,
    completedFocusSessions: timer.snapshot().completedFocusSessions
  };
  saveAppData();
}

function resetProgressAtNewDay() {
  const today = localDateKey();
  if (today === currentDateKey) return;
  currentDateKey = today;
  undo=null;
  timer.resetDailyProgress();
  reminder?.resetForDate();
  saveTodayProgress();
}

function validSavedPosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  return screen.getAllDisplays().some(({ workArea }) => (
    position.x < workArea.x + workArea.width - 80
    && position.x + 80 > workArea.x
    && position.y < workArea.y + workArea.height - 40
    && position.y + 40 > workArea.y
  ));
}

function initialPosition(width) {
  const height=miniHeight();
  if (validSavedPosition(appData.windowPosition)) {
    const position=appData.windowPosition;
    const area=screen.getDisplayMatching({...position,width,height}).workArea;
    return {x:Math.max(area.x,Math.min(position.x,area.x+area.width-width)),
      y:Math.max(area.y,Math.min(position.y,area.y+area.height-height))};
  }
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: workArea.y + (skinTrialMode || pairedThemeTrialMode ? 120 : 26)
  };
}

function miniHeight(){return pairedThemeTrialMode?106:WINDOW_HEIGHT;}
function pairedAppearance(packId=null,forReminder=false){
  return pairedThemeTrialMode?getCompanionAppearance(timer.snapshot(),packId,forReminder):null;
}

function createMainWindow() {
  const width = windowWidthForMode(windowMode);
  const position = initialPosition(width);
  mainWindow = new BrowserWindow({
    width: windowWidthForMode(windowMode),
    height: miniHeight(),
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (smokeTestMode) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (process.argv.includes('--smoke-all-themes')) await runAllThemesSmokeCheck();
          else if (smokeReminderMode) await runReminderSmokeCheck();
          else {isQuitting=true;app.exit(0);}
        } catch(error) {
          console.error('Smoke verification failed:',error);
          fs.mkdirSync(smokeOutput,{recursive:true});
          fs.writeFileSync(path.join(smokeOutput,'smoke-error.txt'),error.stack || String(error));
          isQuitting=true;app.exit(1);
        }
      }, 500);
    });
  }
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'floating.html'));
  mainWindow.once('ready-to-show', () => syncVisibleWindows());
  mainWindow.on('move', () => {
    clearTimeout(moveSaveTimer);
    moveSaveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const { x, y } = mainWindow.getBounds();
      const temporary=expandedMiniPosition && expandedMiniPosition.expanded.x===x && expandedMiniPosition.expanded.y===y;
      appData.windowPosition = temporary ? expandedMiniPosition.original : { x, y };
      saveAppData();
    }, 250);
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();

  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const parentBounds = mainWindow.getBounds();
  const workArea = screen.getDisplayMatching(parentBounds).workArea;
  const x = Math.min(
    workArea.x + workArea.width - 500,
    Math.max(workArea.x, Math.round(parentBounds.x + (parentBounds.width - 500) / 2))
  );
  const y = Math.min(workArea.y + workArea.height - SETTINGS_WINDOW_HEIGHT, Math.max(workArea.y, parentBounds.y + 88));
  settingsWindow = new BrowserWindow({
    width: 500,
    height: SETTINGS_WINDOW_HEIGHT,
    x,
    y,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#f7fbfa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function statePayload() {
  const packIds=pairedThemeTrialMode?COMPANION_THEMES.map(theme=>theme.restPackId):REMINDER_PACK_IDS;
  const payload = { timer: timer.snapshot(), settings, windowMode,
    waitingForBreak:reminder?.viewName==='focusComplete',undo:undoPayload(),shortcutError,settingsError,startupError,startupUnavailable:loginStartup.unavailable,
    reminderPacks:packIds.map(id=>{const p=getReminderPack(id);return {id,name:p.name,image:p.image};}) };
  if(pairedThemeTrialMode){payload.appearance=pairedAppearance(reminder?.state.currentId);payload.companionThemes=COMPANION_THEMES;}
  if (skinTrialMode && !pairedThemeTrialMode) payload.timer.focusSkinId = String((Number(payload.timer.focusSkinId)-1+trialSkinOffset)%3+1).padStart(2,'0');
  return payload;
}
function undoPayload(){return undo && Date.now()<undo.expiresAt ? {label:undo.label,expiresAt:undo.expiresAt} : null;}
function syncVisibleWindows(){
  if(!mainWindow || mainWindow.isDestroyed() || restoringWindows)return;
  if(cardActive || miniHiddenByUser)mainWindow.hide();else mainWindow.show();
}
function hideToTray(){miniHiddenByUser=true;appData.miniHiddenByUser=true;saveAppData();mainWindow?.hide();}
function captureUndo(label){
  undo={label,expiresAt:Date.now()+5000,timer:timer.exportState(),completed:timer.completedFocusSessions,
    reminder:JSON.parse(JSON.stringify(reminder.exportState())),miniHiddenByUser,date:currentDateKey};
}
async function undoTimer(){
  if(!undoPayload() || undo.date!==currentDateKey){undo=null;broadcastState();return statePayload();}
  const previous=undo;undo=null;
  timer=new TimerEngine(settings,()=>Date.now(),previous.completed,previous.timer);
  reminder.timer=timer;miniHiddenByUser=previous.miniHiddenByUser;appData.miniHiddenByUser=miniHiddenByUser;
  await reminder.restoreState(previous.reminder);
  const result=timer.tick();if(result.completed)handleCompletedPhase(result.completed);
  persistAndBroadcast();syncVisibleWindows();return statePayload();
}

let lastBroadcastKey = '';

function broadcastState() {
  const payload = statePayload();
  // 250ms tick 会高频调用这里；渲染层真正消费的只有秒级变化，
  // 内容没变就跳过 IPC 与重绘（毫秒级 remainingMs 不进 key）。
  const key = [
    payload.timer.phase,
    payload.timer.status,
    payload.timer.remainingSeconds,
    payload.timer.completedFocusSessions,
    payload.timer.focusSkinId,
    payload.windowMode,
    JSON.stringify(payload.settings),payload.waitingForBreak,JSON.stringify(payload.undo),shortcutError,settingsError,startupError,
    reminder?.viewName,reminder?.visible,reminder?.state.currentId,JSON.stringify(payload.appearance)
  ].join('|');
  if (key === lastBroadcastKey) return;
  lastBroadcastKey = key;
  if(mainWindow && !mainWindow.isDestroyed()){
    const bounds=mainWindow.getBounds();const height=payload.undo&&!pairedThemeTrialMode?miniHeight()+36:miniHeight();
    if(bounds.height!==height){
      let target={...bounds,height};
      if(payload.undo){
        const area=screen.getDisplayMatching(bounds).workArea;
        target.y=Math.max(area.y,Math.min(bounds.y,area.y+area.height-height));
        expandedMiniPosition={original:{x:bounds.x,y:bounds.y},expanded:{x:target.x,y:target.y}};
      }else if(expandedMiniPosition){
        if(bounds.x===expandedMiniPosition.expanded.x && bounds.y===expandedMiniPosition.expanded.y)
          Object.assign(target,expandedMiniPosition.original);
        expandedMiniPosition=null;
      }
      mainWindow.setBounds(target,false);
    }
  }
  for (const window of [mainWindow, settingsWindow]) {
    if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
      window.webContents.send('state:changed', payload);
    }
  }
  reminder?.refresh();
  updateTrayMenu();
}

function phaseLabel(phase) {
  return { focus: '专注', shortBreak: '短休息', longBreak: '长休息' }[phase];
}

function handleCompletedPhase(completed) {
  undo=null;
  if (completed.phase === 'focus') saveTodayProgress();
  announcePhaseTransition({
    kind: 'completed',
    ...completed,
    started: timer.snapshot().status === 'running'
  });
  if (settings.soundEnabled && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sound:play', completed);
  }

  void reminder.onPhaseCompleted(completed);
}

function showFallbackNotification({ fromPhase, toPhase }) {
  if (!settings.notificationsEnabled || !Notification.isSupported()) return;
  const notification = new Notification({
    title: fromPhase === 'focus' ? '专注完成' : '休息结束',
    body: fromPhase === 'focus' ? `下一阶段：${phaseLabel(toPhase)}` : '准备开始下一轮专注',
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });
  notification.on('click', () => { void reminder.restoreVisibleState(); });
  notification.show();
}

function announcePhaseTransition(transition) {
  if (transition.kind === 'skipped' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('phase:transition', transition);
  }
}

function persistAndBroadcast() {
  saveTodayProgress();
  broadcastState();
}

function toggleTimer() {
  undo=null;
  const currentTime=Date.now();
  const result=timer.tick(currentTime);
  if(result.completed){handleCompletedPhase(result.completed);persistAndBroadcast();return statePayload();}
  timer.toggle(currentTime);
  void reminder.syncTimerAction();
  persistAndBroadcast();
  return statePayload();
}

function resetTimer() {
  captureUndo('已重置');
  timer.reset();
  void reminder.syncTimerAction();
  persistAndBroadcast();
  return statePayload();
}

function skipCurrentPhase() {
  captureUndo('已跳过');
  reminder.dismiss();
  const result = timer.skip();
  if (result.snapshot.phase !== 'focus') void reminder.ensureRunningBreak();
  saveTodayProgress();
  announcePhaseTransition({ kind: 'skipped', ...result.skipped, started: true });
  broadcastState();
  return statePayload();
}

function updateTrayMenu() {
  if (!tray || !timer) return;
  const snapshot = timer.snapshot();
  const menuKey = `${snapshot.phase}:${snapshot.status}:${settings.alwaysOnTop}:${Boolean(reminder?.viewName)}:${Boolean(undoPayload())}`;
  if (menuKey === lastTrayMenuKey) return;
  lastTrayMenuKey = menuKey;
  tray.setToolTip(`阿不番茄钟 · ${phaseLabel(snapshot.phase)}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示悬浮窗', click: () => showMainWindow() },
    { type: 'separator' },
    {
      label: snapshot.status === 'running' ? '暂停计时' : '开始计时',
      click: () => toggleTimer()
    },
    { label: '重置当前计时', click: () => resetTimer() },
    { label: '跳过并开始下一阶段', click: () => skipCurrentPhase() },
    ...(reminder?.viewName ? [{label:'打开休息卡片',click:()=>{void reminder.restoreVisibleState();}}] : []),
    ...(undoPayload() ? [{label:'撤销上一步',click:()=>{void undoTimer();}}] : []),
    { label: '设置', click: () => createSettingsWindow() },
    { label: '隐藏到托盘', click: () => hideToTray() },
    { type: 'separator' },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: (item) => updateSettings({ alwaysOnTop: item.checked })
    },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]));
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', 'assets', 'icon.png'));
  tray.on('click', () => showMainWindow());
  updateTrayMenu();
}

// 拔显示器/改分辨率后，把留在已消失屏幕区域的悬浮条拉回可用工作区，
// 并重算可见气球的位置。悬浮条仍有任意一角在已知屏幕内时不动，避免多屏误跳。
function repositionOnDisplayChange() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const visibleOnSomeDisplay = screen.getAllDisplays().some(({ workArea }) => (
    bounds.x < workArea.x + workArea.width
    && bounds.x + bounds.width > workArea.x
    && bounds.y < workArea.y + workArea.height
    && bounds.y + bounds.height > workArea.y
  ));
  if (!visibleOnSomeDisplay) {
    const { workArea } = screen.getPrimaryDisplay();
    mainWindow.setBounds(boundsForWindowMode(bounds, workArea, windowMode, miniHeight()), true);
  }
  reminder?.reposition();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  miniHiddenByUser=false;appData.miniHiddenByUser=false;
  if(cardActive)reminder.collapse();
  saveAppData();syncVisibleWindows();
  mainWindow.focus();

}

function setWindowMode(nextMode) {
  windowMode = 'compact';
  appData.windowMode = windowMode;
  saveAppData();
  if (mainWindow && !mainWindow.isDestroyed()) {
    const currentBounds = mainWindow.getBounds();
    const workArea = screen.getDisplayMatching(currentBounds).workArea;
    mainWindow.setBounds(boundsForWindowMode(currentBounds, workArea, windowMode, miniHeight()), true);
  }
  broadcastState();
  return statePayload();
}

function readLaunchAtLogin() {
  return loginStartup.read(settings?.launchAtLogin);
}

function applyLaunchAtLogin(enabled) {
  return loginStartup.apply(enabled);
}

function updateSettings(patch) {
  if(!patch || typeof patch!=='object' || Array.isArray(patch))return statePayload();
  if(preferencesReadBlocked){broadcastState();return statePayload();}
  const next=normalizeSettings({ ...settings, ...patch });
  const previous=settings, oldShortcut=registeredShortcut;
  let newShortcutRegistered=false, startupTouched=false,startupSnapshot=null;
  settingsError=null;
  shortcutError=null;
  const invalidShortcut=Object.hasOwn(patch,'pauseShortcut') && patch.pauseShortcut && !next.pauseShortcut;
  if(invalidShortcut){
    next.pauseShortcut=registeredShortcut;
    shortcutError='快捷键格式无效，已保留原快捷键。请使用组合键，例如 Ctrl + Alt + P。';
  }else if(next.pauseShortcut!==registeredShortcut){
    if(next.pauseShortcut && !registerPauseShortcut(next.pauseShortcut)){
      shortcutError='快捷键不生效：组合键被占用或无法注册，已保留原快捷键。';
      next.pauseShortcut=registeredShortcut;
    }else{
      newShortcutRegistered=Boolean(next.pauseShortcut);
    }
  }
  const rollback=()=>{
    if(newShortcutRegistered)globalShortcut.unregister(next.pauseShortcut);
    if(startupTouched){try{loginStartup.restore(startupSnapshot);}catch{startupError='启动项回滚失败，系统状态不确定，请检查 Windows 启动应用设置。';}}
  };
  if (Object.prototype.hasOwnProperty.call(patch, 'launchAtLogin')) {
    try{
      startupSnapshot=loginStartup.snapshot();
      if(!loginStartup.isolated&&!loginStartup.unavailable&&previous.launchAtLogin&&!startupSnapshot&&!appData.loginStartupPath)throw Error('旧启动项路径未知');
      startupTouched=true;
      next.launchAtLogin=applyLaunchAtLogin(next.launchAtLogin);startupError=null;
    }
    catch{startupError='开机启动更改失败，无法核实 Windows 启动项；请检查系统设置后重试。';rollback();broadcastState();return statePayload();}
  }
  const candidate={...appData,settings:next};
  // Project both dependent states before committing: a failed write must leave
  // the live timer untouched, and no second write may be needed for consistency.
  const projectedTimer=new TimerEngine(next,()=>Date.now(),timer.completedFocusSessions,timer.exportState());
  projectedTimer.updateSettings(next);
  const projectedRotation=reminder?normalizeRotation(reminder.state,localDateKey(),
    pairedThemeTrialMode?COMPANION_THEMES.map(theme=>theme.restPackId):next.enabledReminderIds || REMINDER_PACK_IDS):null;
  if(reminder)candidate.reminderState={...reminder.exportState(),...projectedRotation};
  if(startupTouched&&!loginStartup.isolated&&!loginStartup.unavailable)candidate.loginStartupPath=loginStartup.launchPath;
  if(!saveAppData(candidate,projectedTimer.exportState())){rollback();broadcastState();return statePayload();}
  if(oldShortcut!==next.pauseShortcut){if(oldShortcut)globalShortcut.unregister(oldShortcut);registeredShortcut=next.pauseShortcut;}
  if(['focusMinutes','shortBreakMinutes','longBreakMinutes','longBreakInterval'].some(key=>next[key]!==settings[key]))undo=null;
  settings=next;appData=candidate;
  timer.updateSettings(settings);
  if(reminder)reminder.state=projectedRotation;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  }
  broadcastState();
  return statePayload();
}
function registerPauseShortcut(accelerator){
  try{return globalShortcut.register(accelerator,()=>{
    if(timer.status!=='running' && timer.status!=='paused')return;
    toggleTimer();
  });}catch{return false;}
}
function openMiniMenu(){
  Menu.buildFromTemplate([
    ...(skinTrialMode && !pairedThemeTrialMode ? [{label:'预览下一套外观', enabled:timer.phase==='focus', click:()=>{
      trialSkinOffset=(trialSkinOffset+1)%3; broadcastState();
    }}] : []),
    ...(reminder?.viewName?[{label:'打开休息卡片',click:()=>{void reminder.restoreVisibleState();}}]:[]),
    ...(undoPayload()?[{label:'撤销上一步',click:()=>{void undoTimer();}}]:[]),
    {label:'设置',click:()=>createSettingsWindow()},
    {label:'隐藏到托盘',click:()=>hideToTray()},
    {type:'separator'},{label:'退出',click:()=>{isQuitting=true;app.quit();}}
  ]).popup({window:mainWindow});
}

function registerIpcHandlers() {
  ipcMain.handle('app:get-state', () => statePayload());
  ipcMain.handle('timer:toggle', () => toggleTimer());
  ipcMain.handle('timer:reset', () => resetTimer());
  ipcMain.handle('timer:skip', () => skipCurrentPhase());
  ipcMain.handle('timer:undo', () => undoTimer());
  ipcMain.handle('settings:open', () => createSettingsWindow());
  ipcMain.handle('settings:close', () => settingsWindow?.close());
  ipcMain.handle('settings:update', (_event, patch) => updateSettings(patch));
  ipcMain.handle('settings:reset', () => updateSettings(DEFAULT_SETTINGS));
  ipcMain.handle('window:hide', () => hideToTray());
  ipcMain.handle('window:menu', () => openMiniMenu());
  ipcMain.handle('window:toggle-mode', () => setWindowMode('compact'));
  ipcMain.handle('reminder:get-state', () => reminder.getPayload());
  ipcMain.handle('reminder:skip-break', () => {
    // A delayed or repeated rest-card click must not skip the new focus round.
    if (timer.phase === 'focus' || !['focusComplete', 'breakRunning'].includes(reminder.viewName)) {
      return statePayload();
    }
    return skipCurrentPhase();
  });
  const reminderActions = {
    'start-break': 'startBreak', 'toggle-pause': 'togglePause', 'finish-break': 'finishBreak',
    snooze: 'snooze', collapse: 'collapse', 'start-focus': 'startFocus', 'extend-break': 'extendBreak',
    reopen:'restoreVisibleState','change-pack':'changePack'
  };
  for (const [action, method] of Object.entries(reminderActions)) {
    ipcMain.handle(`reminder:${action}`, async () => {
      const currentTime=Date.now();
      if(action==='toggle-pause' && reminder.viewName==='breakRunning' && timer.phase!=='focus'){
        const result=timer.tick(currentTime);
        if(result.completed){undo=null;handleCompletedPhase(result.completed);persistAndBroadcast();return reminder.getPayload();}
      }
      if(action==='finish-break'){
        if(reminder.viewName!=='breakRunning' || timer.phase==='focus')return;
        captureUndo('已结束休息');
      }else if(['start-break','toggle-pause','start-focus','extend-break'].includes(action))undo=null;
      await reminder[method](...(action==='toggle-pause'?[currentTime]:[]));persistAndBroadcast();return reminder.getPayload();
    });
  }
}

app.on('second-instance', () => showMainWindow());
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  app.setAppUserModelId(pairedThemeTrialMode ? 'com.abu.mintpomodoro.cloudpairedtrial' : skinTrialMode ? 'com.abu.mintpomodoro.skintrial' : 'com.abu.mintpomodoro');
  appData = prepareDailyStartup(readAppData());
  windowMode = 'compact';
  miniHiddenByUser=Boolean(appData.miniHiddenByUser);
  appData.windowMode = windowMode;
  settings = normalizeSettings(appData.settings);
  if(preferencesReadBlocked)startupError='原设置读取失败，未查询或更改开机启动项。请重启后重试。';
  else try{
    const hasPreference=typeof appData.settings?.launchAtLogin==='boolean';
    const actual=readLaunchAtLogin();
    if(hasPreference&&settings.launchAtLogin&&!actual&&!loginStartup.hasEntry&&!appData.loginStartupPath&&!loginStartup.isolated&&!loginStartup.unavailable)throw Error('旧启动项路径未知');
    if(!hasPreference && settings.launchAtLogin && !loginStartup.hasEntry)settings.launchAtLogin=applyLaunchAtLogin(true);
    else{
      settings.launchAtLogin=actual;
      // Keep the exact state/arguments when refreshing our own portable entry.
      if(!loginStartup.isolated&&!loginStartup.unavailable){
        const own=loginStartup.snapshot();
        if(own&&own.path!==loginStartup.launchPath)loginStartup.restore({...own,path:loginStartup.launchPath});
      }
    }
    if(!loginStartup.isolated&&!loginStartup.unavailable)appData.loginStartupPath=loginStartup.launchPath;
  }catch{startupError='无法核实旧启动项路径或系统状态；已保留原偏好。请在原程序位置重新切换启动项，或先检查 Windows 启动应用设置。';}
  appData.settings = settings;
  saveAppData();
  timer = new TimerEngine(settings, () => Date.now(), loadTodayProgress(), appData.timerSession);
  saveTodayProgress();
  if(settings.pauseShortcut){
    if(registerPauseShortcut(settings.pauseShortcut))registeredShortcut=settings.pauseShortcut;
    else shortcutError='快捷键不生效：组合键被占用，请在设置中重新选择。';
  }
  reminderView = createReminderView({
    getAnchor: () => mainWindow,
    onPositionChanged:bounds=>{if(reminder){reminder.position=bounds;reminder.persist();}},
    onClose:()=>reminder?.collapse(),canClose:()=>isQuitting,
    onFailure: () => {reminder?.handleViewFailure();showFallbackNotification({
      fromPhase: timer.phase === 'focus' ? 'shortBreak' : 'focus', toPhase: timer.phase
    });}
  });
  reminder = new ReminderController({
    timer,
    loadState: () => {
      const saved=appData.reminderState || {};
      if(pairedThemeTrialMode && saved.currentId && !COMPANION_THEMES.some(theme=>theme.restPackId===saved.currentId))return {...saved,currentId:null};
      return saved;
    },
    saveState: (state) => { appData.reminderState = state; saveAppData(); },
    view: reminderView, fallbackNotify: showFallbackNotification,
    onTimerChanged: persistAndBroadcast, dateKey: () => localDateKey(),
    getEnabledIds:()=>pairedThemeTrialMode?COMPANION_THEMES.map(theme=>theme.restPackId):settings.enabledReminderIds || REMINDER_PACK_IDS,getUndo:undoPayload,
    getPreferredPackId:()=>pairedThemeTrialMode?getCompanionAppearance(timer.snapshot()).restPackId:null,
    getAppearance:packId=>pairedAppearance(packId,true),
    onVisibilityChanged:visible=>{cardActive=visible;syncVisibleWindows();broadcastState();}
  });
  registerIpcHandlers();
  createMainWindow();
  createTray();
  const restored = timer.tick();
  if (restored.completed) {undo=null;await reminder.onPhaseCompleted(restored.completed);saveTodayProgress();}
  else await reminder.restore();
  restoringWindows=false;syncVisibleWindows();

  tickInterval = setInterval(() => {
    if(undo && !undoPayload())undo=null;
    resetProgressAtNewDay();
    const result = timer.tick();
    if (result.completed) handleCompletedPhase(result.completed);
    void reminder.tick();
    broadcastState();
  }, 250);

  screen.on('display-removed', repositionOnDisplayChange);
  screen.on('display-metrics-changed', repositionOnDisplayChange);
});

async function runAllThemesSmokeCheck() {
  if(!smokeTestMode || !pairedThemeTrialMode)throw new Error('All-theme smoke requires isolated paired trial mode');
  const checks={},themes=[],steps=[];
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const click=async(window,id)=>{
    window.focus();
    // Undo lives in normal artwork; other controls require the hover artwork.
    if(window===mainWindow){window.webContents.sendInputEvent({type:'mouseMove',x:170,y:id==='undoButton'?5:60});await pause(50);}
    const point=await window.webContents.executeJavaScript(`(async()=>{const end=Date.now()+8000;while(Date.now()<end){const n=document.getElementById(${JSON.stringify(id)}),b=n?.getBoundingClientRect();if(n&&!n.hidden&&!n.closest('[hidden]')&&b.width&&b.height&&getComputedStyle(n).visibility!=='hidden')return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};await new Promise(r=>setTimeout(r,40));}return {error:'Control not visible: '+${JSON.stringify(id)}};})()`);
    if(point.error)throw new Error(point.error);
    window.webContents.sendInputEvent({type:'mouseMove',...point});
    window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
    await pause(150);
    steps.push({id,point,phase:timer.phase,status:timer.status,themeId:timer.companionThemeId,view:reminder.viewName,undo:undoPayload(),cardVisible:reminderView.getWindow()?.isVisible()});
    fs.writeFileSync(path.join(smokeOutput,'smoke-steps.json'),JSON.stringify(steps,null,2));
  };
  const mini=async(id)=>{
    await mainWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+8000;while(!document.querySelector('#companionSkinSvg')||document.querySelector('#timerBar').dataset.companionSkin!==${JSON.stringify(id)}){if(Date.now()>end)throw new Error('Mini not ready: '+${JSON.stringify(id)});await new Promise(r=>setTimeout(r,40));}await document.fonts.ready;})()`);
  };
  const shot=async(window,name)=>{await window.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');fs.writeFileSync(path.join(smokeOutput,name+'.png'),(await window.webContents.capturePage()).toPNG());};
  fs.mkdirSync(smokeOutput,{recursive:true});
  reminder.dismiss();timer.phase='focus';timer.companionThemeId='cloud';timer.companionCycleIndex=0;
  timer.reuseFocusSkinAfterExtension=false;timer.reset();undo=null;broadcastState();syncVisibleWindows();
  checks.smokeProfileIsolated=app.getPath('userData')===path.join(smokeOutput,'smoke-profile');
  checks.pairedViewport=mainWindow.getBounds().width===270 && mainWindow.getBounds().height===106;
  for(const theme of COMPANION_THEMES){
    const row={id:theme.id,workAssetId:theme.workAssetId,restAssetId:theme.restAssetId,restPackId:theme.restPackId};
    await mini(theme.workAssetId);
    checks[theme.id+'Work']=timer.phase==='focus' && statePayload().appearance.themeId===theme.id;
    await shot(mainWindow,theme.id+'-work');
    await click(mainWindow,'skipButton');
    const win=reminderView.getWindow();
    if(!win)throw new Error('Missing rest card: '+theme.id);
    const payload=reminder.getPayload();
    checks[theme.id+'Card']=payload.pack.id===theme.restPackId && payload.appearance.miniAssetId===theme.restAssetId && payload.canChangePack===false;
    await win.webContents.executeJavaScript(`(async()=>{const end=Date.now()+8000,expected=new URL(${JSON.stringify(payload.pack.image)},window.location.href).href;while(!document.getElementById('mascot').complete||!document.getElementById('mascot').naturalWidth||document.getElementById('mascot').src!==expected){if(Date.now()>end)throw new Error('Card image not ready');await new Promise(r=>setTimeout(r,40));}await document.fonts.ready;})()`);
    await shot(win,theme.id+'-card');
    if(reminder.viewName==='focusComplete')await click(win,'primaryAction');
    if(timer.status!=='running')await click(win,'primaryAction');
    await click(win,'primaryAction');
    checks[theme.id+'Pause']=timer.status==='paused';
    await click(win,'tertiaryAction');
    await mini(theme.restAssetId);
    checks[theme.id+'Collapse']=mainWindow.isVisible() && !win.isVisible() && statePayload().appearance.miniAssetId===theme.restAssetId;
    await shot(mainWindow,theme.id+'-rest');
    await mainWindow.webContents.executeJavaScript('window.mintTimer.reminder.reopen()');
    await pause(100);
    const restId=reminder.restId,bounds=win.getBounds();
    await click(win,'secondaryAction');
    checks[theme.id+'Advance']=timer.phase==='focus' && timer.status==='running';
    // Skipping closes the card; its undo is now on the visible mini bar.
    await click(mainWindow,'undoButton');
    checks[theme.id+'Undo']=timer.phase!=='focus' && timer.status==='paused' && timer.companionThemeId===theme.id && reminder.state.currentId===theme.restPackId && reminder.restId===restId && win.getBounds().x===bounds.x && win.getBounds().y===bounds.y;
    await click(win,'secondaryAction');
    row.nextThemeId=statePayload().appearance.themeId;
    themes.push(row);
  }
  await mini('cloud-work');
  checks.allThemesReturnCloud=themes.length===10 && timer.phase==='focus' && statePayload().appearance.themeId==='cloud';
  const undoDeadline=Date.now()+8000;
  while(mainWindow.getBounds().height!==106 && Date.now()<undoDeadline)await pause(40);
  checks.undoExpiresToMiniHeight=mainWindow.getBounds().height===106;
  const report={version:app.getVersion(),checks,themes,userData:app.getPath('userData'),appearance:statePayload().appearance,mainBounds:mainWindow.getBounds()};
  fs.writeFileSync(path.join(smokeOutput,'smoke-reminder-report.json'),JSON.stringify(report,null,2));
  isQuitting=true;app.exit(Object.values(checks).every(Boolean)?0:1);
}

async function runReminderSmokeCheck() {
  const checks={};
  const waitForSettings=async()=>{
    const deadline=Date.now()+8000;
    while(settingsWindow && !settingsWindow.isVisible() && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
    smokeWindowEvents.push({event:'settings-wait-end',at:Date.now(),visible:settingsWindow?.isVisible(),loading:settingsWindow?.webContents.isLoading()});
  };
  const clickControl=async (window,id)=>{
    if(window===mainWindow){
      window.focus();
      window.webContents.sendInputEvent({type:'mouseMove',x:170,y:pairedThemeTrialMode?(id==='undoButton'?5:60):timer.phase==='focus'?57:38});
      await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(resolve))');
    }
    const point=await window.webContents.executeJavaScript(`(()=>{const b=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)};})()`);
    window.webContents.sendInputEvent({type:'mouseMove',...point});
    window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
    await new Promise(resolve=>setTimeout(resolve,120));
  };
  reminder.dismiss();timer.phase='focus';timer.companionThemeId='cloud';timer.companionCycleIndex=0;
  timer.reuseFocusSkinAfterExtension=false;timer.reset();undo=null;broadcastState();syncVisibleWindows();mainWindow.focus();
  const waitForMini=async(id)=>{
    const selector=pairedThemeTrialMode?'#companionSkinSvg':'#focusSkinSvg';
    await mainWindow.webContents.executeJavaScript(`(async()=>{const end=Date.now()+8000;while(!document.querySelector(${JSON.stringify(selector)})${pairedThemeTrialMode?' || document.querySelector("#timerBar").dataset.companionSkin!=='+JSON.stringify(id):''}){if(Date.now()>end)throw new Error('Mini skin not ready');await new Promise(r=>setTimeout(r,40));}await document.fonts.ready;})()`);
  };
  const miniShot=async(name)=>{
    if(!pairedThemeTrialMode)return;
    fs.mkdirSync(smokeOutput,{recursive:true});
    fs.writeFileSync(path.join(smokeOutput,name+'.png'),(await mainWindow.webContents.capturePage()).toPNG());
  };
  await waitForMini('cloud-work');
  checks.focusSkinLoaded=true;
  if(pairedThemeTrialMode){
    checks.workAppearance=statePayload().appearance.miniAssetId==='cloud-work';
    checks.pairedViewport=mainWindow.getBounds().width===270 && mainWindow.getBounds().height===106;
    checks.smokeProfileIsolated=app.getPath('userData')===path.join(smokeOutput,'smoke-profile');
    mainWindow.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});
    await miniShot('packaged-cloud-work');
  }
  const initialSkin=timer.snapshot().focusSkinId;
  await clickControl(mainWindow,'toggleButton');checks.focusStart=timer.status==='running';
  await clickControl(mainWindow,'toggleButton');checks.focusPause=timer.status==='paused';
  await clickControl(mainWindow,'resetButton');checks.focusReset=timer.status==='idle' && timer.snapshot().remainingMs===timer.durationFor('focus') && timer.snapshot().focusSkinId===initialSkin;
  await clickControl(mainWindow,'settingsButton');
  checks.focusSettingsCreated=Boolean(settingsWindow);
  await waitForSettings();
  checks.focusSettings=Boolean(settingsWindow?.isVisible());settingsWindow?.close();mainWindow.focus();
  await clickControl(mainWindow,'skipButton');checks.focusSkip=timer.phase==='shortBreak';
  await undoTimer();checks.focusUndo=timer.phase==='focus' && timer.snapshot().focusSkinId===initialSkin;
  reminder.dismiss();
  undo=null;
  timer.phase = 'focus';
  timer.reset();
  timer.start();
  timer.endAt = Date.now();
  const result = timer.tick();
  await reminder.onPhaseCompleted(result.completed);
  const win = reminderView.getWindow();
  checks.singleTimerVisible=!mainWindow.isVisible() && Boolean(win?.isVisible());
  if(!win)throw new Error('Reminder window did not open');
  const original=win.getBounds();
  const moved={...original,x:original.x+50,y:original.y+30};
  win.setBounds(moved,false);
  if(reminder.viewName==='focusComplete')await clickControl(win,'primaryAction');
  await clickControl(win,'primaryAction');
  checks.pauseButton=timer.status==='paused';
  await clickControl(win,'tertiaryAction');
  checks.collapseSwitch=mainWindow.isVisible() && !win.isVisible();
  if(pairedThemeTrialMode){
    await waitForMini('cloud-rest');
    checks.restAppearance=statePayload().appearance.miniAssetId==='cloud-rest' && reminder.getPayload().pack.id==='cloud-nap';
    checks.cardAppearance=reminder.getPayload().appearance.miniAssetId==='cloud-rest' && reminder.getPayload().canChangePack===false;
    await miniShot('packaged-cloud-rest');
  }
  mainWindow.focus();
  mainWindow.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});
  mainWindow.webContents.sendInputEvent({type:'mouseMove',x:150,y:pairedThemeTrialMode?60:38});
  await new Promise(resolve=>setTimeout(resolve,120));
  const settingsHit=await mainWindow.webContents.executeJavaScript(`(()=>{const n=document.getElementById('settingsButton'),b=n.getBoundingClientRect();return {display:getComputedStyle(n.parentElement).display,left:b.left,width:b.width};})()`);
  await clickControl(mainWindow,'settingsButton');
  await waitForSettings();
  checks.settingsButton=Boolean(settingsWindow?.isVisible());
  settingsWindow?.close();
  await mainWindow.webContents.executeJavaScript('window.mintTimer.reminder.reopen()');
  checks.reopenSwitch=!mainWindow.isVisible() && win.isVisible();
  checks.positionRetained=win.getBounds().x===moved.x && win.getBounds().y===moved.y;
  const packId=reminder.state.currentId;
  const breakPhase=timer.phase;
  const remaining=timer.snapshot().remainingSeconds;
  await clickControl(win,'secondaryAction');
  checks.finishBreak=timer.phase==='focus';
  await clickControl(mainWindow,'undoButton');
  checks.undo=timer.phase===breakPhase && timer.status==='paused' && timer.snapshot().remainingSeconds===remaining && reminder.state.currentId===packId;
  if(pairedThemeTrialMode){
    await clickControl(win,'secondaryAction');
    checks.centralSkipRest=timer.phase==='focus' && timer.status==='running' && statePayload().appearance.miniAssetId==='checklist-work';
    await undoTimer();
    checks.centralSkipUndo=timer.phase===breakPhase && reminder.state.currentId===packId && reminder.getPayload().appearance.miniAssetId==='cloud-rest';
    await clickControl(win,'secondaryAction');
    await waitForMini('checklist-work');
    await miniShot('packaged-checklist-work');
    // Reach the next rest through the real work control, keeping the mini/card handoff.
    await clickControl(mainWindow,'skipButton');
    checks.checklistCard=reminder.getPayload().pack.id==='stretch' && reminder.getPayload().appearance.miniAssetId==='checklist-rest';
    fs.writeFileSync(path.join(smokeOutput,'packaged-checklist-card.png'),(await win.webContents.capturePage()).toPNG());
    if(reminder.viewName==='focusComplete')await clickControl(win,'primaryAction');
    await clickControl(win,'primaryAction');
    checks.checklistPause=timer.status==='paused';
    await clickControl(win,'tertiaryAction');
    await waitForMini('checklist-rest');
    await miniShot('packaged-checklist-rest');
    checks.checklistCollapse=mainWindow.isVisible() && !win.isVisible();
    await mainWindow.webContents.executeJavaScript('window.mintTimer.reminder.reopen()');
    const checklistRestId=reminder.restId;
    const checklistBounds=win.getBounds();
    await clickControl(win,'secondaryAction');
    checks.checklistReturnsCloud=timer.phase==='focus' && statePayload().appearance.miniAssetId==='cloud-work'
      && reminder.getPayload().appearance.miniAssetId==='checklist-rest';
    await clickControl(win,'undoButton');
    checks.checklistUndo=timer.phase!=='focus' && timer.companionThemeId==='checklist-stretch'
      && reminder.state.currentId==='stretch' && reminder.restId===checklistRestId
      && win.getBounds().x===checklistBounds.x && win.getBounds().y===checklistBounds.y;
  }
  const hotkey='Control+Alt+Shift+F24',occupied='Control+Alt+Shift+F23';
  updateSettings({pauseShortcut:hotkey});
  checks.shortcutRegistration=!shortcutError && globalShortcut.isRegistered(hotkey);
  globalShortcut.register(occupied,()=>{});
  updateSettings({pauseShortcut:occupied});
  checks.shortcutConflict=Boolean(shortcutError) && settings.pauseShortcut===hotkey && globalShortcut.isRegistered(hotkey);
  updateSettings({pauseShortcut:''});globalShortcut.unregister(occupied);
  const report = {
    version:app.getVersion(),checks,settingsHit,userData:app.getPath('userData'),appearance:statePayload().appearance,smokeWindowEvents,
    mainVisible: mainWindow.isVisible(), mainBounds: mainWindow.getBounds(), windowMode,
    autoStartBreak: settings.autoStartBreak,autoStartFocus:settings.autoStartFocus,
    reminderCreated: Boolean(win), reminderVisible: Boolean(win && win.isVisible()),
    reminderBounds: win?.getBounds(), reminderPayload: reminder.getPayload()
  };
  fs.mkdirSync(smokeOutput, { recursive: true });
  fs.writeFileSync(path.join(smokeOutput, 'smoke-reminder-report.json'), JSON.stringify(report, null, 2));
  isQuitting = true;
  app.exit(report.reminderVisible && Object.values(checks).every(Boolean) ? 0 : 1);
}

app.on('will-quit', () => {
  clearInterval(tickInterval);
  clearTimeout(moveSaveTimer);
  reminder?.destroy();
  globalShortcut.unregisterAll();
});
