const test = require('node:test');
const assert = require('node:assert/strict');
const { localDateKey, completedSessionsForDate, prepareDailyStartup } = require('../src/daily-progress');
const { TimerEngine } = require('../src/timer-engine');
const { DEFAULT_SETTINGS } = require('../src/config');

test('localDateKey uses the local calendar date', () => {
  assert.equal(localDateKey(new Date(2026, 6, 22, 23, 59)), '2026-07-22');
});

test('same-day restart restores the focus count', () => {
  const saved = { date: '2026-07-22', completedFocusSessions: 3 };
  assert.equal(completedSessionsForDate(saved, new Date(2026, 6, 22, 9, 0)), 3);
});

test('the next local day starts from zero', () => {
  const saved = { date: '2026-07-22', completedFocusSessions: 3 };
  assert.equal(completedSessionsForDate(saved, new Date(2026, 6, 23, 0, 1)), 0);
});

test('same-day startup keeps the saved session and reminder', () => {
  const saved = { dailyProgress: { date: '2026-10-24', completedFocusSessions: 2 },
    timerSession: { phase: 'focus', status: 'paused', remainingMs: 123000 },
    reminderState: { currentId: 'cloud' } };
  assert.deepEqual(prepareDailyStartup(saved, new Date(2026, 9, 24, 10)), saved);
});

for (const phase of ['focus', 'shortBreak', 'longBreak']) {
  for (const status of ['idle', 'paused', 'running']) {
    test(`next-day startup resets ${status} ${phase} without auto-starting`, () => {
      const now = new Date(2026, 9, 24, 8).getTime();
      const saved = { settings: { focusMinutes: 35 },
        dailyProgress: { date: '2026-10-23', completedFocusSessions: 3 },
        timerSession: { phase, status, remainingMs: 12000, endAt: now - 1000,
          durationOverrideMs: 120000, reuseFocusSkinAfterExtension: true,
          companionThemeId: 'bubble', companionCycleIndex: 8, focusSkinIndex: 2 },
        reminderState: { currentId: 'cloud', viewName: 'card' } };
      const prepared = prepareDailyStartup(saved, new Date(now));
      const timer = new TimerEngine({ ...DEFAULT_SETTINGS, focusMinutes: 35,
        autoStartBreak: true, autoStartFocus: true }, () => now,
      completedSessionsForDate(prepared.dailyProgress, new Date(now)), prepared.timerSession);
      assert.equal(timer.phase, 'focus');
      assert.equal(timer.status, 'idle');
      assert.equal(timer.snapshot().remainingMs, 35 * 60000);
      assert.equal(timer.completedFocusSessions, 0);
      assert.equal(timer.endAt, null);
      assert.equal(timer.durationOverrideMs, null);
      assert.equal(timer.companionThemeId, 'bubble');
      assert.equal(prepared.reminderState, null);
      assert.equal(timer.tick().completed, null);
      assert.equal(saved.timerSession.remainingMs, 12000);
      assert.deepEqual(prepared.settings, saved.settings);
    });
  }
}

test('undated legacy session starts a fresh day safely', () => {
  const prepared = prepareDailyStartup({ timerSession: { phase: 'shortBreak', status: 'paused', remainingMs: 1000 } });
  assert.equal(prepared.timerSession.phase, undefined);
  assert.equal(prepared.dailyProgress.completedFocusSessions, 0);
});

test('an active round spanning midnight is not interrupted by daily count reset', () => {
  let now = new Date(2026, 9, 23, 23, 59).getTime();
  const timer = new TimerEngine(DEFAULT_SETTINGS, () => now, 3);
  timer.start();
  const endAt = timer.endAt;
  now += 120000;
  timer.resetDailyProgress();
  assert.equal(timer.tick().completed, null);
  assert.equal(timer.status, 'running');
  assert.equal(timer.endAt, endAt);
});
