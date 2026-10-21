const path = require('node:path');
const { BrowserWindow, screen } = require('electron');
const REMINDER_WIDTH = 520;
const REMINDER_HEIGHT = 300;
function computeReminderBounds(_anchor, workArea) {
  const width = Math.min(REMINDER_WIDTH, workArea.width);
  const height = Math.min(REMINDER_HEIGHT, workArea.height);
  return {x:Math.round(workArea.x + (workArea.width-width)/2), y:Math.round(workArea.y+(workArea.height-height)/2), width, height};
}
function positionReminderWindow(win, anchor) {
  if (!win || win.isDestroyed()) return null;
  const display = anchor && !anchor.isDestroyed() ? screen.getDisplayMatching(anchor.getBounds()) : screen.getPrimaryDisplay();
  const bounds = computeReminderBounds(null, display.workArea);
  win.setBounds(bounds, false);
  return bounds;
}
function constrainReminderWindow(win, savedBounds) {
  if (!win || win.isDestroyed()) return null;
  const current = savedBounds || win.getBounds();
  if (!current || !Number.isFinite(current.x) || !Number.isFinite(current.y)) return null;
  const area = screen.getDisplayMatching(current).workArea;
  const width = Math.min(REMINDER_WIDTH, area.width), height = Math.min(REMINDER_HEIGHT, area.height);
  const bounds = {x:Math.round(Math.max(area.x, Math.min(current.x,area.x+area.width-width))),
    y:Math.round(Math.max(area.y,Math.min(current.y,area.y+area.height-height))),width,height};
  win.setBounds(bounds, false);
  return bounds;
}
function createReminderWindow({preloadPath} = {}) {
  return new BrowserWindow({width:REMINDER_WIDTH,height:REMINDER_HEIGHT,show:false,
    frame:false,transparent:true,movable:true,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,
    skipTaskbar:true,alwaysOnTop:true,hasShadow:false,
    webPreferences:{preload:preloadPath || path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
}
module.exports = {REMINDER_WIDTH, REMINDER_HEIGHT, computeReminderBounds, positionReminderWindow, constrainReminderWindow, createReminderWindow};
