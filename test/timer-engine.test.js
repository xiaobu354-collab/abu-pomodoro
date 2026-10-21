const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS } = require('../src/config');
const { TimerEngine } = require('../src/timer-engine');

function createEngine(overrides = {}, completed = 0) {
  let time = 0;
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const engine = new TimerEngine(settings, () => time, completed);
  return {
    engine,
    advance(ms) { time += ms; },
    finish() {
      time += engine.snapshot().remainingMs;
      return engine.tick();
    }
  };
}

test('starts, pauses, and resumes without losing remaining time', () => {
  const clock = createEngine({ focusMinutes: 5 });
  clock.engine.start();
  clock.advance(60_000);
  clock.engine.tick();
  assert.equal(clock.engine.snapshot().remainingSeconds, 240);

  clock.engine.pause();
  clock.advance(60_000);
  assert.equal(clock.engine.snapshot().remainingSeconds, 240);

  clock.engine.start();
  clock.advance(60_000);
  clock.engine.tick();
  assert.equal(clock.engine.snapshot().remainingSeconds, 180);
});

test('a focus session transitions to a short break and waits for manual start', () => {
  const clock = createEngine({ focusMinutes: 5, shortBreakMinutes: 2, autoStartBreak: false });
  clock.engine.start();
  const result = clock.finish();

  assert.deepEqual(result.completed, { phase: 'focus', nextPhase: 'shortBreak' });
  assert.equal(result.snapshot.status, 'idle');
  assert.equal(result.snapshot.remainingSeconds, 120);
  assert.equal(result.snapshot.completedFocusSessions, 1);
});

test('natural transitions independently honor all four auto-start combinations', () => {
  for (const autoStartBreak of [true, false]) for (const autoStartFocus of [true, false]) {
    const clock = createEngine({ autoStartBreak, autoStartFocus });
    clock.engine.start();
    assert.equal(clock.finish().snapshot.status, autoStartBreak ? 'running' : 'idle');
    clock.engine.start();
    assert.equal(clock.finish().snapshot.status, autoStartFocus ? 'running' : 'idle');
    assert.equal(clock.engine.skip().snapshot.status, 'running');
  }
});

test('the configured fourth focus session transitions to a long break', () => {
  const clock = createEngine({ focusMinutes: 5, longBreakMinutes: 10, longBreakInterval: 4 }, 3);
  clock.engine.start();
  const result = clock.finish();

  assert.equal(result.completed.nextPhase, 'longBreak');
  assert.equal(result.snapshot.remainingSeconds, 600);
  assert.equal(result.snapshot.completedFocusSessions, 4);
});

test('a completed break always returns to focus', () => {
  const clock = createEngine({ focusMinutes: 5, shortBreakMinutes: 1 });
  clock.engine.start();
  clock.finish();
  clock.engine.start();
  const result = clock.finish();

  assert.deepEqual(result.completed, { phase: 'shortBreak', nextPhase: 'focus' });
  assert.equal(result.snapshot.remainingSeconds, 300);
});

test('auto-start begins the next phase immediately', () => {
  const clock = createEngine({ focusMinutes: 5, shortBreakMinutes: 1, autoStartBreak: true });
  clock.engine.start();
  const result = clock.finish();

  assert.equal(result.snapshot.phase, 'shortBreak');
  assert.equal(result.snapshot.status, 'running');
  assert.equal(result.snapshot.remainingSeconds, 60);
});

test('direct legacy engine construction still honors old auto-start in both directions', () => {
  for (const autoStartNext of [true, false]) {
    const settings = { focusMinutes: 5, shortBreakMinutes: 1, longBreakMinutes: 10, longBreakInterval: 4, autoStartNext };
    const engine = new TimerEngine(settings, () => 0);
    engine.start();
    assert.equal(engine.complete().snapshot.status, autoStartNext ? 'running' : 'idle');
    engine.start();
    assert.equal(engine.complete().snapshot.status, autoStartNext ? 'running' : 'idle');
  }
});

test('skipping focus starts a short break without counting a completed focus', () => {
  const clock = createEngine({ focusMinutes: 5, shortBreakMinutes: 2 }, 3);
  clock.engine.start();
  clock.advance(60_000);
  const result = clock.engine.skip();

  assert.deepEqual(result.skipped, { phase: 'focus', nextPhase: 'shortBreak' });
  assert.equal(result.snapshot.status, 'running');
  assert.equal(result.snapshot.remainingSeconds, 120);
  assert.equal(result.snapshot.completedFocusSessions, 3);
});

test('skipping a break immediately starts the next focus', () => {
  const clock = createEngine({ focusMinutes: 5, shortBreakMinutes: 1 });
  clock.engine.start();
  clock.finish();
  const result = clock.engine.skip();

  assert.deepEqual(result.skipped, { phase: 'shortBreak', nextPhase: 'focus' });
  assert.equal(result.snapshot.status, 'running');
  assert.equal(result.snapshot.remainingSeconds, 300);
});

test('daily reset clears only the cycle counter and keeps an active timer running', () => {
  const clock = createEngine({ focusMinutes: 5 }, 3);
  clock.engine.start();
  clock.advance(30_000);
  clock.engine.resetDailyProgress();

  const snapshot = clock.engine.snapshot();
  assert.equal(snapshot.completedFocusSessions, 0);
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.remainingSeconds, 270);
});

test('explicit completion and two-minute extension honor auto-start', () => {
  const clock = createEngine({ autoStartNext: false });
  clock.engine.startBreakExtension(120_000);
  assert.equal(clock.engine.snapshot().totalMs, 120_000);
  assert.equal(clock.engine.snapshot().remainingSeconds, 120);
  const result = clock.engine.complete();
  assert.equal(result.snapshot.phase, 'focus');
  assert.equal(result.snapshot.status, 'idle');
  assert.equal(result.snapshot.completedFocusSessions, 0);
});
test('restart restores running target time and paused remaining time', () => {
  const clock = createEngine({ focusMinutes: 5 });
  clock.engine.start(); clock.advance(60_000);
  const saved = clock.engine.exportState();
  const restored = new TimerEngine(DEFAULT_SETTINGS, () => 90_000, 0, saved);
  assert.equal(restored.snapshot().remainingSeconds, 210);
  restored.pause();
  const paused = new TimerEngine(DEFAULT_SETTINGS, () => 600_000, 0, restored.exportState());
  assert.equal(paused.snapshot().status, 'paused');
  assert.equal(paused.snapshot().remainingSeconds, 210);
});
