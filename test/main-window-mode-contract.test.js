const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourceDirectory = path.join(__dirname, '..', 'src');

test('main process migrates the stored window mode to compact', () => {
  const main = fs.readFileSync(path.join(sourceDirectory, 'main.js'), 'utf8');
  assert.match(main, /windowMode = 'compact'/);
  assert.match(main, /appData\.windowMode = windowMode/);
  assert.match(main, /const payload = \{ timer: timer\.snapshot\(\), settings, windowMode,/);
  assert.match(main, /width: windowWidthForMode\(windowMode\)/);
});

test('legacy toggle remains compact while native menu replaces full mode', () => {
  const main = fs.readFileSync(path.join(sourceDirectory, 'main.js'), 'utf8');
  const preload = fs.readFileSync(path.join(sourceDirectory, 'preload.js'), 'utf8');
  assert.match(main, /function setWindowMode\(nextMode\)/);
  assert.match(main, /boundsForWindowMode\(currentBounds, workArea, windowMode, miniHeight\(\)\)/);
  assert.match(main, /ipcMain\.handle\('window:toggle-mode'/);
  assert.doesNotMatch(main, /切换为完整模式/);
  assert.match(main, /打开休息卡片/);
  assert.match(preload, /window:menu/);
});
