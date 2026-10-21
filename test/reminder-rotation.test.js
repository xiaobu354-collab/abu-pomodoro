const test = require('node:test');
const assert = require('node:assert/strict');
test('ten packs never repeat within 100 bags, including restart between draws', () => {
  const { takeNextPack, releaseCurrentPack } = require('../src/reminder-rotation');
  const ids = Array.from({ length: 10 }, (_, i) => String(i));
  let state = {}, last;
  for (let round = 0; round < 100; round++) {
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      const result = takeNextPack(state, '2026-10-14', ids, () => 0.3);
      assert.ok(!seen.has(result.id));
      if (i === 0 && last) assert.notEqual(result.id, last);
      seen.add(result.id); last = result.id;
      state = JSON.parse(JSON.stringify(releaseCurrentPack(result.state)));
    }
    assert.equal(seen.size, 10);
  }
});

test('disabling current character preserves it until release and filters future bag', () => {
  const { takeNextPack, releaseCurrentPack, normalizeRotation } = require('../src/reminder-rotation');
  const saved = { date: 'today', catalogIds: ['window-tea', 'b', 'c'], currentId: 'window-tea', lastId: 'window-tea', remainingIds: ['b', 'c'] };
  const state = normalizeRotation(saved, 'today', ['b', 'c'], () => 0);
  assert.equal(state.currentId, 'window-tea');
  assert.equal(takeNextPack(state, 'today', ['b', 'c']).id, 'window-tea');
  assert.ok(['b', 'c'].includes(takeNextPack(releaseCurrentPack(state), 'today', ['b', 'c']).id));
});

test('same-day corrupted catalog cannot legitimize a missing active character', () => {
  const { takeNextPack } = require('../src/reminder-rotation');
  const result = takeNextPack({ date: 'today', currentId: 'missing', lastId: 'missing',
    catalogIds: ['missing'], remainingIds: [] }, 'today', ['a', 'b'], () => 0);
  assert.ok(['a', 'b'].includes(result.id));
});

test('a newly catalogued id already in the remaining bag is not appended twice', () => {
  const { normalizeRotation } = require('../src/reminder-rotation');
  const state = normalizeRotation({ date: 'today', catalogIds: ['a'], remainingIds: ['b'] },
    'today', ['a', 'b'], () => 0);
  assert.deepEqual(state.remainingIds, ['b']);
});

test('changed bag avoids adjacent repeat when a new character is re-enabled', () => {
  const { takeNextPack } = require('../src/reminder-rotation');
  const saved = { date: 'today', catalogIds: ['a'], currentId: null, lastId: 'a', remainingIds: ['a'] };
  assert.equal(takeNextPack(saved, 'today', ['a', 'b'], () => 0).id, 'b');
});

test('a single enabled character remains usable across refill and restart', () => {
  const { takeNextPack, releaseCurrentPack } = require('../src/reminder-rotation');
  let state = {};
  for (let index = 0; index < 10; index++) {
    const result = takeNextPack(state, 'today', ['only']);
    assert.equal(result.id, 'only');
    state = JSON.parse(JSON.stringify(releaseCurrentPack(result.state)));
  }
});

test('a corrupt saved current id is discarded instead of permanently pinning fallback', () => {
  const { takeNextPack } = require('../src/reminder-rotation');
  const result = takeNextPack({ currentId: 'missing', catalogIds: ['a', 'b'] }, 'today', ['a', 'b'], () => 0);
  assert.ok(['a', 'b'].includes(result.id));
});
test('midnight resets future bag while current rest retains its character', () => {
  const { takeNextPack, normalizeRotation } = require('../src/reminder-rotation');
  const ids = ['a', 'b', 'c'];
  const { state, id } = takeNextPack({}, '2026-10-14', ids);
  const result = normalizeRotation(state, '2026-10-15', ids);
  assert.equal(result.currentId, id);
  assert.equal(result.remainingIds.length, 2);
  assert.ok(!result.remainingIds.includes(id));
});
test('catalog upgrades insert new ids without reinserting used ids', () => {
  const { takeNextPack, releaseCurrentPack, normalizeRotation } = require('../src/reminder-rotation');
  const result = takeNextPack({}, '2026-10-14', ['a', 'b', 'c']);
  const state = normalizeRotation(releaseCurrentPack(result.state), '2026-10-14', ['a', 'b', 'c', 'd']);
  assert.ok(state.remainingIds.includes('d'));
  assert.ok(!state.remainingIds.includes(result.id));
});
