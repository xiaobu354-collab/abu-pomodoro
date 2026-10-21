const test = require('node:test');
const assert = require('node:assert/strict');
const { TimerEngine } = require('../src/timer-engine');
const { DEFAULT_SETTINGS } = require('../src/config');
function setup(auto = false, saved = {}) {
  const { ReminderController } = require('../src/reminder-controller');
  let now = 0, state = saved;
  const calls = [], notifications = [];
  const timer = new TimerEngine({...DEFAULT_SETTINGS, focusMinutes:1, shortBreakMinutes:1, autoStartBreak:auto, autoStartFocus:auto}, () => now);
  const view = { async show(p) {calls.push(p); return true;}, update(p) {calls.push(p);}, hide() {}, reposition() {}, destroy() {} };
  const controller = new ReminderController({timer, view, now:()=>now, dateKey:()=> '2026-10-14',
    loadState:()=>state, saveState:s=>{state=s;}, onTimerChanged:()=>{}, fallbackNotify:p=>notifications.push(p)});
  return {timer, controller, view, calls, notifications, advance(ms) {now+=ms;}, get saved() {return state;}};
}
test('manual flow, snooze, pause, collapse, end, extension all retain one character', async () => {
  const c = setup(); c.timer.start(); c.advance(60_000);
  await c.controller.onPhaseCompleted(c.timer.tick().completed);
  assert.equal(c.controller.getPayload().view, 'focusComplete');
  const id = c.controller.getPayload().pack.id;
  c.controller.snooze(); assert.equal(c.controller.getPayload().visible, false);
  c.advance(120_000); await c.controller.tick();
  assert.equal(c.controller.getPayload().pack.id, id);
  await c.controller.startBreak(); c.controller.togglePause();
  assert.equal(c.timer.status, 'paused');
  c.controller.togglePause(); c.controller.collapse();
  c.advance(1_000); c.controller.refresh();
  assert.equal(c.controller.getPayload().visible, false);
  assert.equal(c.timer.snapshot().remainingSeconds, 59);
  await c.controller.finishBreak();
  assert.equal(c.controller.getPayload().view, 'breakComplete');
  await c.controller.extendBreak();
  assert.equal(c.timer.snapshot().remainingSeconds, 120);
  assert.equal(c.controller.getPayload().pack.id, id);
  await c.controller.finishBreak(); c.controller.startFocus();
  assert.equal(c.timer.phase, 'focus'); assert.equal(c.timer.status, 'running');
  assert.equal(c.saved.currentId, null);
  c.controller.destroy();
});
test('auto-start acknowledgement hides after three seconds and fallback runs on failure', async () => {
  const c = setup(true);
  c.timer.start(); c.advance(60_000); await c.controller.onPhaseCompleted(c.timer.tick().completed);
  assert.equal(c.controller.getPayload().view, 'breakRunning');
  c.view.show = async () => false;
  c.advance(60_000); await c.controller.onPhaseCompleted(c.timer.tick().completed);
  assert.equal(c.controller.getPayload().view, 'focusAutoStarted');
  assert.equal(c.notifications.length, 1);
  c.advance(3_000); await c.controller.tick();
  assert.equal(c.controller.getPayload().visible, false);
  c.controller.destroy();
});
test('double-clicking early finish cannot complete an additional focus phase', async () => {
  const c = setup(); c.timer.startBreakExtension();
  await c.controller.ensureRunningBreak();
  await c.controller.finishBreak(); await c.controller.finishBreak();
  assert.equal(c.timer.phase, 'focus'); assert.equal(c.timer.completedFocusSessions, 0);
});
test('corrupted saved character is replaced when recovering a waiting rest card', async () => {
  const c = setup(false, {viewName:'focusComplete',visible:true,currentId:'missing',date:'2026-10-14'});
  c.timer.phase='shortBreak'; c.timer.reset();
  await c.controller.restore();
  assert.equal(c.controller.getPayload().visible,true);
  assert.ok(c.controller.getPayload().pack?.id);
});
