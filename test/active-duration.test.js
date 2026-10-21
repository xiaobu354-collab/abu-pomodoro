const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS } = require('../src/config');
const { TimerEngine } = require('../src/timer-engine');
const { boot } = require('./support/main-harness.cjs');

const minute = 60_000;
const settings = { ...DEFAULT_SETTINGS, focusMinutes: 25, shortBreakMinutes: 5,
  longBreakMinutes: 10, autoStartBreak: true, autoStartFocus: true };

for (const phase of ['focus', 'shortBreak', 'longBreak']) {
  for (const paused of [false, true]) {
    test(`${phase} keeps its active total when settings change while ${paused ? 'paused' : 'running'}`, () => {
      let now = 0;
      const timer = new TimerEngine(settings, () => now);
      timer.phase = phase;
      timer.reset();
      const originalTotal = timer.snapshot().totalMs;
      timer.start();
      now += originalTotal / 5;
      if (paused) timer.pause();
      const originalEndAt = timer.endAt;
      timer.updateSettings({ ...settings, focusMinutes: 5, shortBreakMinutes: 30, longBreakMinutes: 60 });
      const snapshot = timer.snapshot();
      assert.equal(snapshot.remainingMs, originalTotal * 0.8);
      assert.equal(snapshot.totalMs, originalTotal);
      assert.ok(Math.abs((1 - snapshot.remainingMs / snapshot.totalMs) - 0.2) < 1e-10);
      assert.equal(timer.endAt, originalEndAt);
      if (paused) {
        now += minute;
        timer.start();
        assert.equal(timer.snapshot().totalMs, originalTotal);
        assert.equal(timer.snapshot().remainingMs, originalTotal * 0.8);
      }
    });
  }
}

test('reset, skip and natural completion adopt the newest phase duration', () => {
  const timer = new TimerEngine(settings, () => 0);
  timer.start();
  timer.updateSettings({ ...settings, focusMinutes: 5, shortBreakMinutes: 3 });
  assert.equal(timer.reset().totalMs, 5 * minute);
  assert.equal(timer.snapshot().remainingMs, 5 * minute);
  assert.equal(timer.skip().snapshot.totalMs, 3 * minute);
  assert.equal(timer.complete().snapshot.totalMs, 5 * minute);
  assert.equal(timer.complete().snapshot.totalMs, 3 * minute);
});

test('idle settings updates still reset the waiting phase to the newest duration', () => {
  const timer = new TimerEngine(settings, () => 0);
  timer.updateSettings({ ...settings, focusMinutes: 7 });
  assert.equal(timer.snapshot().remainingMs, 7 * minute);
  assert.equal(timer.snapshot().totalMs, 7 * minute);
});

for (const paused of [false, true]) {
  test(`saved active total survives ${paused ? 'paused' : 'running'} restart and undo reconstruction`, () => {
    let now = 0;
    const timer = new TimerEngine(settings, () => now);
    timer.start();
    now = 5 * minute;
    if (paused) timer.pause();
    const changedSettings = { ...settings, focusMinutes: 5 };
    timer.updateSettings(changedSettings);
    const saved = timer.exportState();
    assert.equal(saved.currentTotalMs, 25 * minute);
    timer.skip();
    const restored = new TimerEngine(changedSettings, () => now, 0, saved);
    assert.equal(restored.snapshot().totalMs, 25 * minute);
    assert.equal(restored.snapshot().remainingMs, 20 * minute);
    assert.equal(restored.snapshot().status, paused ? 'paused' : 'running');
    now += minute;
    assert.equal(restored.snapshot().remainingMs, (paused ? 20 : 19) * minute);
  });
}

test('two-minute extension retains its total through settings, persistence and role reuse', () => {
  let now = 0;
  const timer = new TimerEngine(settings, () => now);
  const initialRole = timer.snapshot().focusSkinId;
  const initialCycle = timer.snapshot().companionCycleIndex;
  timer.startBreakExtension();
  now = 30_000;
  timer.updateSettings({ ...settings, shortBreakMinutes: 30 });
  timer.pause();
  const saved = timer.exportState();
  assert.equal(saved.currentTotalMs, 120_000);
  const restored = new TimerEngine(settings, () => now, 0, saved);
  assert.equal(restored.snapshot().totalMs, 120_000);
  assert.equal(restored.snapshot().remainingMs, 90_000);
  restored.start();
  restored.complete();
  assert.equal(restored.snapshot().focusSkinId, initialRole);
  assert.equal(restored.snapshot().companionCycleIndex, initialCycle);
  assert.equal(restored.snapshot().totalMs, 25 * minute);
});

test('legacy saves and invalid totals fall back without reporting total below remaining', () => {
  for (const currentTotalMs of [undefined, null, 0, -1, NaN, Infinity, '1500000', 1, Number.MAX_VALUE]) {
    const saved = { phase: 'focus', status: 'paused', remainingMs: 20 * minute, currentTotalMs };
    const timer = new TimerEngine({ ...settings, focusMinutes: 5 }, () => 0, 0, saved);
    assert.equal(timer.snapshot().totalMs, 20 * minute, String(currentTotalMs));
  }
  const legacyExtension = new TimerEngine(settings, () => 0, 0,
    { phase: 'shortBreak', status: 'paused', remainingMs: 90_000, durationOverrideMs: 120_000 });
  assert.equal(legacyExtension.snapshot().totalMs, 120_000);
});

test('paired trial settings IPC preserves 20 percent progress and undo/restart total', async t => {
  const h = await boot({ args: ['--paired-theme-trial'] });
  t.after(() => h.close());
  await h.invoke('settings:update', { focusMinutes: 25 });
  await h.invoke('timer:toggle');
  await h.advance(5 * minute);
  await h.invoke('settings:update', { focusMinutes: 5 });
  let state = await h.invoke('app:get-state');
  assert.equal(state.timer.remainingMs, 20 * minute);
  assert.equal(state.timer.totalMs, 25 * minute);
  assert.ok(Math.abs(1 - state.timer.remainingMs / state.timer.totalMs - 0.2) < 1e-10);
  await h.invoke('timer:reset');
  state = await h.invoke('app:get-state');
  assert.equal(state.timer.totalMs, 5 * minute);
  assert.equal(state.timer.remainingMs, 5 * minute);
  state = await h.invoke('timer:undo');
  assert.equal(state.timer.totalMs, 25 * minute);
  assert.equal(state.timer.remainingMs, 20 * minute);
  await h.invoke('timer:toggle');
  const restarted = await boot({ args: ['--paired-theme-trial'], saved: h.saved() });
  t.after(() => restarted.close());
  const restored = await restarted.invoke('app:get-state');
  assert.equal(restored.timer.status, 'paused');
  assert.equal(restored.timer.totalMs, 25 * minute);
  assert.equal(restored.timer.remainingMs, 20 * minute);
});
