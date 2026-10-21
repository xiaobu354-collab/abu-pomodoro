const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boot } = require('./support/main-harness.cjs');

test('preload exposes the phase-guarded rest skip channel', async () => {
  let bridge;
  const invoked = [];
  const electron = {
    contextBridge: { exposeInMainWorld(name, api) { assert.equal(name, 'mintTimer'); bridge = api; } },
    ipcRenderer: { invoke: async channel => { invoked.push(channel); return { done: true }; }, on() {}, removeListener() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8'), {
    require(name) { assert.equal(name, 'electron'); return electron; }
  });
  assert.equal(typeof bridge.reminder.skipBreak, 'function');
  await bridge.reminder.skipBreak();
  assert.deepEqual(invoked, ['reminder:skip-break']);
});

test('rest-only skip channel cannot skip an initial focus session', async t => {
  const h = await boot(); t.after(() => h.close());
  assert.ok(h.handlers.has('reminder:skip-break'));
  const before = await h.invoke('app:get-state');
  const result = await h.invoke('reminder:skip-break');
  assert.equal(result.timer.phase, 'focus');
  assert.equal(result.timer.status, 'idle');
  assert.equal(result.timer.remainingMs, before.timer.remainingMs);
  assert.equal(result.timer.focusSkinId, before.timer.focusSkinId);
  assert.equal(result.undo, null);
});

test('a late skip-rest click after natural auto-start cannot skip the new focus', async t => {
  const h = await boot({ auto: true }); t.after(() => h.close());
  assert.ok(h.handlers.has('reminder:skip-break'));
  await h.invoke('timer:toggle');
  await h.advance(300000);
  assert.equal((await h.invoke('app:get-state')).timer.phase, 'shortBreak');
  await h.advance(60000);
  const before = await h.invoke('app:get-state');
  assert.equal(before.timer.phase, 'focus');
  assert.equal(before.timer.status, 'running');
  const result = await h.invoke('reminder:skip-break');
  assert.equal(result.timer.phase, 'focus');
  assert.equal(result.timer.status, 'running');
  assert.equal(result.timer.focusSkinId, before.timer.focusSkinId);
  assert.equal(result.timer.completedFocusSessions, before.timer.completedFocusSessions);
  assert.equal(result.timer.remainingMs, before.timer.remainingMs);
});
