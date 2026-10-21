const test = require('node:test');
const assert = require('node:assert/strict');
test('reminder centers on secondary display and shrinks only on tiny work areas', () => {
  const { computeReminderBounds } = require('../src/reminder-window');
  assert.deepEqual(computeReminderBounds({}, {x:1920,y:40,width:1600,height:900}), {x:2460,y:340,width:520,height:300});
  assert.deepEqual(computeReminderBounds({}, {x:-500,y:0,width:400,height:200}), {x:-500,y:0,width:400,height:200});
});
