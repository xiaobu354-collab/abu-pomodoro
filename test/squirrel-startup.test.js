const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { handleSquirrelEvent } = require('../src/squirrel-startup');

function setup(event) {
  let quitCount = 0;
  let spawnCall;
  const child = new EventEmitter();
  const handled = handleSquirrelEvent({
    app: { quit: () => { quitCount += 1; } },
    argv: ['app.exe', event],
    execPath: 'C:\\Users\\Tester\\AppData\\Local\\mint_pomodoro\\app-1.0.1\\阿不番茄钟.exe',
    platform: 'win32',
    spawnProcess: (...args) => { spawnCall = args; return child; }
  });
  return { handled, child, get quitCount() { return quitCount; }, get spawnCall() { return spawnCall; } };
}

test('Squirrel install creates a shortcut and quits after Update.exe closes', () => {
  const result = setup('--squirrel-install');
  assert.equal(result.handled, true);
  assert.match(result.spawnCall[0], /Update\.exe$/);
  assert.deepEqual(result.spawnCall[1], ['--createShortcut=阿不番茄钟.exe']);
  assert.deepEqual(result.spawnCall[2], { detached: true });
  result.child.emit('close');
  assert.equal(result.quitCount, 1);
});

test('Squirrel uninstall removes the shortcut', () => {
  const result = setup('--squirrel-uninstall');
  assert.deepEqual(result.spawnCall[1], ['--removeShortcut=阿不番茄钟.exe']);
});

test('normal startup is not intercepted', () => {
  const result = setup('--smoke-test');
  assert.equal(result.handled, false);
  assert.equal(result.spawnCall, undefined);
});
