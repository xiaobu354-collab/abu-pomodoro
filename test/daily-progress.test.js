const test = require('node:test');
const assert = require('node:assert/strict');
const { localDateKey, completedSessionsForDate } = require('../src/daily-progress');

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
