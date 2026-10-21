// Run: electron scripts/capture-docs.cjs (no real app startup or settings writes).
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'abu-docs-'));
app.setPath('userData', profile);
app.setPath('sessionData', profile);
app.disableHardwareAcceleration();
// This batch intentionally destroys each hidden window before opening the next.
// Do not let the default last-window lifecycle quit midway through the batch.
app.on('window-all-closed', () => {});
const { DEFAULT_SETTINGS } = require('../src/config');
const { COMPANION_THEMES } = require('../src/companion-themes');
const { getReminderPack } = require('../src/reminder-content');
const state = {
  settings: { ...DEFAULT_SETTINGS },
  companionThemes: COMPANION_THEMES,
  appearance: { mode: 'paired', ...COMPANION_THEMES[0] },
  reminderPacks: COMPANION_THEMES.map(t => {
    const pack = getReminderPack(t.restPackId);
    return { id: pack.id, name: pack.name, image: pack.image };
  }),
  settingsError: null, startupError: null, startupUnavailable: false
};
ipcMain.handle('app:get-state', () => state);
ipcMain.handle('settings:update', () => state);
ipcMain.handle('settings:reset', () => state);
ipcMain.handle('settings:close', () => undefined);
const images = path.join(root, 'docs', 'images');
async function settle(win) {
  await win.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
  await new Promise(resolve => setTimeout(resolve, 350));
}
async function viewport(win, width, height) {
  win.webContents.debugger.attach('1.3');
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false
  });
}
async function screenshot(win, clip) {
  const result = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, clip: { ...clip, scale: 1 }
  });
  const png = Buffer.from(result.data, 'base64');
  if (png.readUInt32BE(16) !== clip.width || png.readUInt32BE(20) !== clip.height) throw new Error('Screenshot dimensions were clipped');
  return png;
}
app.whenReady().then(async () => {
  fs.mkdirSync(images, { recursive: true });
  const sheet = new BrowserWindow({ width: 1200, height: 2200, show: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false } });
  await sheet.loadFile(path.join(root, 'docs', 'showcase.html'));
  await viewport(sheet, 1200, 2200);
  await settle(sheet);
  for (const [id, name] of [['hero', 'hero.png'], ['gallery', 'theme-gallery.png']]) {
    const rect = await sheet.webContents.executeJavaScript(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`);
    fs.writeFileSync(path.join(images, name), await screenshot(sheet, rect));
  }
  sheet.destroy();
  const settings = new BrowserWindow({ width: 500, height: 1550, show: false, frame: false,
    webPreferences: { offscreen: true, preload: path.join(root, 'src', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await settings.loadFile(path.join(root, 'src', 'renderer', 'settings.html'));
  await viewport(settings, 500, 1550);
  await settle(settings);
  const check = await settings.webContents.executeJavaScript(`({error:document.querySelector('#settingsError').textContent,roles:document.querySelectorAll('.role-option').length,hint:document.querySelector('#companionHint').textContent,startup:document.querySelector('#launchAtLogin').checked})`);
  if (check.error || check.roles !== 10 || !check.hint.includes('10套') || !check.startup) throw new Error('Clean settings state verification failed');
  fs.writeFileSync(path.join(images, 'settings.png'), await screenshot(settings, {x: 0, y: 0, width: 500, height: 1550}));
  settings.destroy();
  for (const name of ['hero.png', 'theme-gallery.png', 'settings.png']) {
    const data = fs.readFileSync(path.join(images, name));
    if (data.length < 24 || data.readUInt32BE(16) === 0 || data.readUInt32BE(20) === 0) throw new Error(`Empty documentation screenshot: ${name}`);
  }
  console.log('Generated hero.png, theme-gallery.png, settings.png; isolated mock settings verified.');
  app.quit();
}).catch(error => { console.error(error.message); app.exit(1); });
