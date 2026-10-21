const test = require('node:test');
const assert = require('node:assert/strict');
const { TimerEngine } = require('../src/timer-engine');
const { DEFAULT_SETTINGS } = require('../src/config');

const create = (saved) => new TimerEngine(DEFAULT_SETTINGS, () => 1000, 0, saved);

test('three approved skins rotate only when a break returns to focus', () => {
  const timer = create();
  assert.equal(timer.snapshot().focusSkinId, '01');
  for (const next of ['02', '03', '01']) {
    timer.start(); timer.pause(); timer.reset(); timer.resetDailyProgress();
    assert.notEqual(timer.snapshot().focusSkinId, next);
    timer.complete();
    const previous = timer.snapshot().focusSkinId;
    timer.startBreakExtension();
    assert.equal(timer.snapshot().focusSkinId, previous);
    timer.complete();
    assert.equal(timer.snapshot().focusSkinId, next);
  }
});

test('skip to next focus rotates, undo/restart restores the exact skin', () => {
  const timer = create();
  timer.skip();
  const before = timer.exportState();
  assert.equal(before.focusSkinIndex, 0);
  timer.skip();
  assert.equal(timer.snapshot().focusSkinId, '02');
  const restarted = create(timer.exportState());
  assert.equal(restarted.snapshot().focusSkinId, '02');
  const undone = create(before);
  assert.equal(undone.snapshot().focusSkinId, '01');
});

test('invalid saved skin indices safely use the first approved skin', () => {
  for (const focusSkinIndex of [-1, NaN, Infinity, '2', 1.5]) {
    assert.equal(create({ ...create().exportState(), focusSkinIndex }).snapshot().focusSkinId, '01');
  }
  assert.equal(create({ ...create().exportState(), focusSkinIndex: 5 }).snapshot().focusSkinId, '03');
});

test('taking two more minutes after rest does not skip the upcoming focus companion', () => {
  const timer=create();
  timer.complete();timer.complete();
  assert.equal(timer.snapshot().focusSkinId,'02');
  timer.startBreakExtension();timer.pause();
  const restarted=create(timer.exportState());
  restarted.complete();
  assert.equal(restarted.snapshot().focusSkinId,'02');
  restarted.skip();restarted.skip();
  assert.equal(restarted.snapshot().focusSkinId,'03');
});
