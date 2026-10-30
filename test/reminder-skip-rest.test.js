const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { getReminderPack } = require('../src/reminder-content');
const { localDateKey } = require('../src/daily-progress');
const { boot } = require('./support/main-harness.cjs');

function rendererHarness(skipBreak = async () => ({}), actions = {}) {
  const nodes = new Map();
  const errors = [];
  const html = fs.readFileSync(path.join(__dirname, '../src/renderer/reminder.html'), 'utf8');
  for (const match of html.matchAll(/id="([^"]+)"/g)) {
    nodes.set(match[1], { hidden: false, disabled: false, textContent: '', src: '',
      dataset: {}, style: {}, classList: { toggle() {} }, addEventListener() {} });
  }
  let render;
  const reminder = { ...actions, skipBreak, onState(callback) { render = callback; }, getState: async () => null };
  const window = { mintTimer: { reminder }, location: { href: 'file:///app/src/renderer/reminder.html' } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/reminder.js'), 'utf8'), {
    window, document: { getElementById: id => nodes.get(id) }, URL, Date,
    console: { error: (...args) => errors.push(args) }
  });
  return { nodes, render, errors };
}

function payload(view, phase = 'shortBreak', status = 'idle', restId = 1) {
  return { visible: true, view, restId, pack: getReminderPack('window-tea'),
    timer: { phase, status, remainingSeconds: 300, remainingMs: 300000, totalMs: 300000 } };
}

test('running rest merges skip into the existing secondary button without a duplicate row', () => {
  const h = rendererHarness();
  for (const [view, phase, status] of [
    ['focusComplete', 'shortBreak', 'idle'], ['focusComplete', 'longBreak', 'idle'],
    ['breakRunning', 'shortBreak', 'running'], ['breakRunning', 'longBreak', 'paused']
  ]) {
    h.render(payload(view, phase, status));
    const skip = h.nodes.get('skipRestAction');
    assert.ok(skip, 'The card must include a skip-rest button');
    assert.equal(skip.hidden, view !== 'focusComplete');
    assert.equal(skip.textContent, view === 'focusComplete' ? '跳过' : '跳过休息');
    assert.equal(typeof skip.onclick, 'function');
    assert.equal(h.nodes.get('primaryAction').textContent,
      view === 'focusComplete' ? '休息' : status === 'paused' ? '继续' : '暂停');
    assert.equal(h.nodes.get('secondaryAction').textContent,
      view === 'focusComplete' ? '2分钟后提醒' : '跳过休息');
  }
  for (const view of ['breakComplete', 'focusAutoStarted']) {
    h.render(payload(view, 'focus'));
    assert.equal(h.nodes.get('skipRestAction').hidden, true);
    assert.equal(h.nodes.get('skipRestAction').onclick, null);
  }
});

test('focus completion presents rest, skip, snooze in reading and keyboard order with unchanged actions', async () => {
  const calls=[];
  const h=rendererHarness(async()=>{calls.push('skip');return {};},{startBreak:()=>calls.push('rest'),snooze:()=>calls.push('snooze')});
  h.render(payload('focusComplete'));
  const ids=['primaryAction','skipRestAction','secondaryAction'];
  assert.deepEqual(ids.map(id=>h.nodes.get(id).textContent),['休息','跳过','2分钟后提醒']);
  assert.ok(ids.every(id=>!h.nodes.get(id).hidden));
  assert.equal(h.nodes.get('tertiaryAction').hidden,true);
  const html=fs.readFileSync(path.join(__dirname,'../src/renderer/reminder.html'),'utf8');
  assert.ok(html.indexOf('id="primaryAction"')<html.indexOf('id="skipRestAction"'));
  assert.ok(html.indexOf('id="skipRestAction"')<html.indexOf('id="secondaryAction"'));
  await h.nodes.get('primaryAction').onclick();
  await h.nodes.get('skipRestAction').onclick();
  await h.nodes.get('secondaryAction').onclick();
  assert.deepEqual(calls,['rest','skip','snooze']);
});

test('the renamed running secondary button directly skips to focus with double-click protection', async () => {
  let calls = 0, resolve;
  const h = rendererHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  h.render(payload('breakRunning', 'longBreak', 'paused'));
  const button = h.nodes.get('secondaryAction');
  const click = button.onclick;
  const pending = click();
  click();
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  h.render(payload('breakRunning', 'longBreak', 'running'));
  assert.equal(button.disabled, true);
  resolve({timer: {phase: 'focus', status: 'running'}});
  await pending;
  click();
  assert.equal(calls, 1);
});

test('skip-rest dispatch is latched across double clicks and stale rest refreshes', async () => {
  let calls = 0, resolve;
  const h = rendererHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  h.render(payload('focusComplete'));
  const skip = h.nodes.get('skipRestAction');
  assert.ok(skip, 'The card must include a skip-rest button');
  const click = skip.onclick;
  const first = click();
  click();
  h.render(payload('breakRunning', 'shortBreak', 'running'));
  skip.onclick();
  assert.equal(calls, 1);
  assert.equal(skip.disabled, true);
  resolve({ timer: { phase: 'focus' } });
  await first;
  click();
  assert.equal(calls, 1, 'Old callbacks cannot skip the newly started focus');
  h.render(payload('focusComplete', 'shortBreak', 'idle', 2));
  assert.equal(skip.disabled, false);
  skip.onclick();
  assert.equal(calls, 2, 'A later rest cycle can be skipped normally');
  resolve({ timer: { phase: 'focus' } });
});

test('failed skip-rest requests allow a deliberate retry', async () => {
  let calls = 0;
  const h = rendererHarness(async () => { calls++; if (calls === 1) throw new Error('IPC unavailable'); return {}; });
  h.render(payload('focusComplete'));
  const skip = h.nodes.get('skipRestAction');
  assert.ok(skip, 'The card must include a skip-rest button');
  await skip.onclick();
  assert.equal(skip.disabled, false);
  assert.equal(skip.title, '未能跳过休息，请重试');
  assert.equal(h.errors.length, 1);
  await skip.onclick();
  assert.equal(calls, 2);
});

test('undo restores the same rest id with an available skip action', async () => {
  let calls = 0;
  const h = rendererHarness(async () => { calls++; return { timer: { phase: 'focus', status: 'running' } }; });
  const rest = payload('breakRunning', 'longBreak', 'paused', 7);
  h.render(rest);
  const skip = h.nodes.get('skipRestAction');
  const oldClick = skip.onclick;
  await oldClick();
  await oldClick();
  assert.equal(calls, 1, 'Successful dispatch cannot skip the new focus again');
  // Undo can originate from the mini window or tray, not just this renderer.
  h.render(rest);
  assert.equal(skip.disabled, false, 'Undo restores the original rest id, not a new rest cycle');
  await skip.onclick();
  assert.equal(calls, 2);
});

for (const status of ['paused', 'idle']) {
  test(`a restored ${status} rest state arriving before the old focus response remains actionable`, async () => {
    let calls = 0, resolve;
    const focus = { timer: { phase: 'focus', status: 'running' } };
    const h = rendererHarness(() => {
      calls++;
      return calls === 1 ? new Promise(done => { resolve = done; }) : Promise.resolve(focus);
    });
    const rest = payload(status === 'idle' ? 'focusComplete' : 'breakRunning', 'longBreak', status, 7);
    h.render(rest);
    const skip = h.nodes.get('skipRestAction');
    const pending = skip.onclick();
    // Same-rest undo is a new authoritative idle/paused state even if its values match.
    h.render({ ...rest, timer: { ...rest.timer } });
    resolve(focus);
    await pending;
    assert.equal(skip.disabled, false, 'Old response must not leave the restored card disabled');
    assert.equal(h.nodes.get('reminderCard').dataset.view, rest.view);
    assert.equal(h.nodes.get('primaryAction').textContent, status === 'idle' ? '休息' : '继续');
    await skip.onclick();
    assert.equal(calls, 2, 'Old focus response must not replace the restored local timer phase');
  });
}

test('ordinary running countdown refreshes do not release the completed skip guard', async () => {
  let calls = 0, resolve;
  const h = rendererHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  const rest = payload('breakRunning', 'shortBreak', 'running', 8);
  h.render(rest);
  const skip = h.nodes.get('skipRestAction');
  const oldClick = skip.onclick;
  const pending = oldClick();
  h.render({ ...rest, timer: { ...rest.timer, remainingMs: 299000, remainingSeconds: 299 } });
  assert.equal(skip.disabled, true);
  resolve({ timer: { phase: 'focus', status: 'running' } });
  await pending;
  await oldClick();
  assert.equal(calls, 1, 'A routine countdown update cannot re-enable skipping the new focus');
});

for (const phase of ['shortBreak', 'longBreak']) {
  for (const status of ['idle', 'running', 'paused']) {
    test(`skip-rest IPC starts focus from ${phase}/${status}, preserves counts and supports exact undo`, async t => {
      const h = await boot({ saved: { dailyProgress: { date: localDateKey(), completedFocusSessions: 3 }, timerSession: {
        phase, status, remainingMs: 42000, endAt: Date.now() + 42000, focusSkinIndex: 0
      } } });
      t.after(() => h.close());
      assert.ok(h.handlers.has('reminder:skip-break'), 'A phase-guarded skip-rest channel is required');
      const before = await h.invoke('app:get-state');
      assert.equal(before.timer.phase, phase);
      const card = h.windows.find(w => w.options.width === 520);
      const currentPack = (await h.invoke('reminder:get-state')).pack.id;
      await h.invoke('reminder:skip-break');
      const after = await h.invoke('app:get-state');
      assert.equal(after.timer.phase, 'focus');
      assert.equal(after.timer.status, 'running');
      assert.equal(after.timer.completedFocusSessions, before.timer.completedFocusSessions);
      assert.equal(after.timer.focusSkinId, '02');
      assert.equal(card.visible, false);
      await h.invoke('reminder:skip-break');
      const repeated = await h.invoke('app:get-state');
      assert.equal(repeated.timer.phase, 'focus');
      assert.equal(repeated.timer.focusSkinId, '02');
      await h.invoke('timer:undo');
      const restored = await h.invoke('app:get-state');
      assert.equal(restored.timer.phase, phase);
      assert.equal(restored.timer.status, status);
      assert.equal(restored.timer.remainingSeconds, before.timer.remainingSeconds);
      assert.equal(restored.timer.focusSkinId, before.timer.focusSkinId);
      assert.equal((await h.invoke('reminder:get-state')).pack.id, currentPack);
      assert.equal(card.visible, true);
    });
  }
}
