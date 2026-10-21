const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('ten complete unique packs and bounded PNG resources', () => {
  const { REMINDER_PACKS, getReminderPack } = require('../src/reminder-content');
  assert.equal(REMINDER_PACKS.length, 10);
  assert.equal(new Set(REMINDER_PACKS.map(p => p.id)).size, 10);
  for (const p of REMINDER_PACKS) {
    for (const state of ['start', 'running', 'finished']) assert.ok(p[state].title && p[state].body);
    const data = fs.readFileSync(path.join(__dirname, '../src/renderer', p.image));
    assert.equal(data.subarray(1, 4).toString(), 'PNG');
    assert.ok(Math.max(data.readUInt32BE(16), data.readUInt32BE(20)) <= 720);
    assert.ok(data.length < 1_000_000);
  }
  assert.equal(getReminderPack('missing').id, 'window-tea');
});

test('every named character offers three distinct complete selectable copy sets', () => {
  const { REMINDER_PACKS, getReminderPack } = require('../src/reminder-content');
  for (const pack of REMINDER_PACKS) {
    assert.ok(pack.name);
    assert.equal(pack.variants.length, 3);
    assert.equal(new Set(pack.variants.map(v => JSON.stringify(v))).size, 3);
    for (let index = 0; index < 3; index++) {
      const selected = getReminderPack(pack.id, index);
      assert.equal(selected.image, pack.image);
      assert.equal(selected.variantIndex, index);
      for (const phase of ['start', 'running', 'finished']) {
        assert.deepEqual(selected[phase], pack.variants[index][phase]);
        assert.ok(selected[phase].title && selected[phase].body);
      }
    }
    assert.equal(getReminderPack(pack.id, -1).variantIndex, 0);
    assert.equal(getReminderPack(pack.id, 99).variantIndex, 0);
  }
});
