const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {TimerEngine} = require('../src/timer-engine');
const {ReminderController} = require('../src/reminder-controller');
const {DEFAULT_SETTINGS} = require('../src/config');
const {COMPANION_THEMES} = require('../src/companion-themes');

// Keep all profiles isolated and retained: no real Electron or user profile is used.
const profileRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'abu-expiry-'));
fs.mkdirSync(profileRoot, {recursive:true});
const harnessPath = path.resolve(__dirname, 'support/main-harness.cjs');
let source = fs.readFileSync(harnessPath, 'utf8');
source = source.replace("fs.mkdtempSync(path.join(os.tmpdir(),'reminder-test-'))", `fs.mkdtempSync(${JSON.stringify(path.join(profileRoot, 'profile-'))})`);
source = source.replace('let now=Date.now(), tick,', 'let now=Date.now(), clockStep=0, tick,');
source = source.replace('static now(){return now;}', 'static now(){const value=now;now+=clockStep;return value;}');
source = source.replace('async advance(ms){now+=ms;tick();await flush();}',
  'armAdvancingClock(value){now=value;clockStep=1;},async elapseWithoutTick(ms){now+=ms;await flush();},async advance(ms){now+=ms;tick();await flush();}');
const harnessModule = {exports:{}};
vm.runInNewContext(source, {module:harnessModule, exports:harnessModule.exports,
  require:createRequire(harnessPath), __dirname:path.dirname(harnessPath), console, process,
  setTimeout, clearTimeout, queueMicrotask, setImmediate}, {filename:harnessPath});
const {boot} = harnessModule.exports;
const state = h => h.invoke('app:get-state');
const card = h => h.invoke('reminder:get-state');
const launch = saved => boot({args:['--paired-theme-trial'], saved: {
  dailyProgress: { date: require('../src/daily-progress').localDateKey(), completedFocusSessions: 0 }, ...saved
}});
const combinations = [false, true].flatMap(autoStartBreak =>
  [false, true].map(autoStartFocus => ({autoStartBreak, autoStartFocus})));

for (const phase of ['focus', 'shortBreak']) {
  for (const channel of phase === 'focus' ? ['timer:toggle'] : ['timer:toggle', 'reminder:toggle-pause']) {
    for (const offset of [-1, 0]) {
      test(`advancing clock ${channel} ${phase} at deadline${offset} uses one action time`, async () => {
        const h = await launch({settings:{focusMinutes:5, shortBreakMinutes:1,
          autoStartBreak:false, autoStartFocus:false},
        timerSession:{phase, status:'idle', remainingMs:60_000, currentTotalMs:60_000, endAt:null}});
        try {
          await h.invoke('timer:toggle');
          h.armAdvancingClock(h.saved().timerSession.endAt + offset);
          await h.invoke(channel);
          const result = (await state(h)).timer;
          if (offset < 0) {
            assert.equal(result.phase, phase);
            assert.equal(result.status, 'paused');
            assert.equal(result.remainingMs, 1, 'click one millisecond before expiry must preserve that millisecond');
            assert.equal(result.completedFocusSessions, 0);
            assert.equal(result.companionCycleIndex, 0);
          } else {
            assert.equal(result.phase, phase === 'focus' ? 'shortBreak' : 'focus');
            assert.equal(result.status, 'idle');
            assert.equal(result.completedFocusSessions, phase === 'focus' ? 1 : 0);
            assert.equal(result.companionCycleIndex, phase === 'focus' ? 0 : 1);
            assert.equal(h.windows.flatMap(w => w.sent).filter(message => message.channel === 'sound:play').length, 1);
          }
        } finally {h.close();}
      });
    }
  }
}

for (const offset of [-1, 0]) {
  test(`advancing clock direct controller at deadline${offset} uses one action time`, async () => {
    let clock = 100 + offset;
    const now = () => clock++;
    const timer = new TimerEngine({...DEFAULT_SETTINGS, autoStartFocus:false}, now, 0,
      {phase:'shortBreak', status:'running', remainingMs:100, endAt:100});
    const controller = new ReminderController({timer, now, dateKey:()=> '2026-10-20',
      loadState:()=>({viewName:'breakRunning'}), saveState(){},
      view:{async show(){return true;}, update(){}, hide(){}, destroy(){}}, onTimerChanged(){}, fallbackNotify(){}});
    await controller.togglePause();
    if (offset < 0) {
      assert.equal(timer.phase, 'shortBreak');
      assert.equal(timer.status, 'paused');
      assert.equal(timer.remainingMs, 1);
    } else {
      assert.equal(timer.phase, 'focus');
      assert.equal(timer.status, 'idle');
      assert.equal(timer.companionCycleIndex, 1);
    }
    controller.destroy();
  });
}

for (const method of ['start', 'pause', 'toggle', 'tick']) {
  test(`engine ${method} honors an explicit shared action time without reading clock again`, () => {
    let reads = 0;
    const timer = new TimerEngine(DEFAULT_SETTINGS, () => {reads++;return 100;}, 0,
      {phase:'focus', status:method === 'start' ? 'idle' : 'running', remainingMs:10, endAt:100});
    const result = timer[method](99);
    const snapshot = method === 'tick' ? result.snapshot : result;
    assert.equal(reads, 0, 'explicit action time must be forwarded to nested calls and snapshot');
    assert.equal(snapshot.remainingMs, method === 'start' ? 10 : 1);
    if (method === 'tick') assert.equal(result.completed, null);
  });
}

for (const automatic of combinations) {
  const label = `autoBreak=${automatic.autoStartBreak}, autoFocus=${automatic.autoStartFocus}`;
  test(`ten themes retain natural completion and outgoing rest cards (${label})`, async () => {
    const h = await launch({settings:{focusMinutes:5, shortBreakMinutes:1,
      longBreakMinutes:5, longBreakInterval:4, ...automatic}});
    const finishNaturally = async () => {
      if ((await state(h)).timer.status !== 'running') await h.invoke('timer:toggle');
      await h.advance((await state(h)).timer.remainingMs);
    };
    try {
      for (let i = 0; i < COMPANION_THEMES.length; i++) {
        const theme = COMPANION_THEMES[i];
        const next = COMPANION_THEMES[(i + 1) % COMPANION_THEMES.length];
        assert.equal((await state(h)).timer.companionThemeId, theme.id);
        await finishNaturally();
        const rest = await state(h);
        assert.equal(rest.timer.phase, (i + 1) % 4 === 0 ? 'longBreak' : 'shortBreak');
        assert.equal(rest.timer.status, automatic.autoStartBreak ? 'running' : 'idle');
        assert.equal((await card(h)).pack.id, theme.restPackId);
        assert.equal(rest.timer.completedFocusSessions, i + 1);
        await finishNaturally();
        const focus = await state(h);
        const completionCard = await card(h);
        assert.equal(focus.timer.phase, 'focus');
        assert.equal(focus.timer.status, automatic.autoStartFocus ? 'running' : 'idle');
        assert.equal(focus.timer.companionThemeId, next.id);
        assert.equal(focus.timer.companionCycleIndex, i + 1);
        assert.equal(focus.timer.completedFocusSessions, i + 1);
        assert.equal(completionCard.pack.id, theme.restPackId);
        assert.equal(completionCard.appearance.themeId, theme.id);
        if (automatic.autoStartFocus) {
          await h.advance(3000);
          assert.equal((await card(h)).visible, false);
        } else await h.invoke('reminder:start-focus');
      }
    } finally {h.close();}
  });
  for (const channel of ['timer:toggle', 'reminder:toggle-pause']) {
    for (const phase of channel === 'timer:toggle' ? ['focus', 'shortBreak', 'longBreak'] : ['shortBreak', 'longBreak']) {
      test(`${channel} settles expired ${phase} before toggling (${label})`, async () => {
        const duration = phase === 'shortBreak' ? 60_000 : 300_000;
        let h = await launch({settings:{focusMinutes:5, shortBreakMinutes:1, longBreakMinutes:5,
          longBreakInterval:4, ...automatic}, timerSession:{phase, status:'idle', remainingMs:duration,
          currentTotalMs:duration, endAt:null}});
        try {
          await h.invoke('timer:toggle');
          const beforeCard = await card(h);
          await h.elapseWithoutTick(duration + 10);
          assert.equal((await state(h)).timer.remainingMs, 0);
          await h.invoke(channel);
          const after = await state(h);
          const nextPhase = phase === 'focus' ? 'shortBreak' : 'focus';
          const nextAuto = phase === 'focus' ? automatic.autoStartBreak : automatic.autoStartFocus;
          assert.equal(after.timer.phase, nextPhase, 'expired stage must complete instead of pausing at zero');
          assert.equal(after.timer.status, nextAuto ? 'running' : 'idle', 'old click must not toggle the next stage');
          assert.equal(after.timer.completedFocusSessions, phase === 'focus' ? 1 : 0);
          assert.equal(after.timer.companionCycleIndex, phase === 'focus' ? 0 : 1);
          assert.equal(after.timer.companionThemeId, COMPANION_THEMES[phase === 'focus' ? 0 : 1].id);
          const afterCard = await card(h);
          assert.equal(afterCard.view, phase === 'focus' ? (nextAuto ? 'breakRunning' : 'focusComplete')
            : (nextAuto ? 'focusAutoStarted' : 'breakComplete'));
          if (phase !== 'focus') assert.equal(afterCard.pack.id, beforeCard.pack.id, 'completed card retains outgoing rest role');
          assert.equal(h.windows.flatMap(w => w.sent).filter(message => message.channel === 'sound:play').length, 1,
            'expiry must use the normal main-process completion path');

          // Further clicks may pause/start a new stage, but never settle it again.
          await h.invoke(channel);
          await h.invoke(channel);
          await h.advance(0);
          const repeated = await state(h);
          assert.equal(repeated.timer.phase, nextPhase);
          assert.equal(repeated.timer.completedFocusSessions, after.timer.completedFocusSessions);
          assert.equal(repeated.timer.companionCycleIndex, after.timer.companionCycleIndex);
          assert.equal(h.windows.flatMap(w => w.sent).filter(message => message.channel === 'sound:play').length, 1);
          const saved = h.saved();
          h.close();
          h = await launch(saved);
          await h.advance(0);
          const restored = await state(h);
          assert.equal(restored.timer.phase, repeated.timer.phase);
          assert.equal(restored.timer.status, repeated.timer.status);
          assert.equal(restored.timer.completedFocusSessions, repeated.timer.completedFocusSessions);
          assert.equal(restored.timer.companionCycleIndex, repeated.timer.companionCycleIndex);
          assert.equal(restored.timer.companionThemeId, repeated.timer.companionThemeId);
        } finally {h.close();}
      });
    }
  }

  for (const phase of ['shortBreak', 'longBreak']) {
    test(`direct controller pause settles expired ${phase} once (${label})`, async () => {
      let now = 0, saved = {}, changed = 0;
      const settings = {...DEFAULT_SETTINGS, focusMinutes:5, shortBreakMinutes:1, longBreakMinutes:5, ...automatic};
      let timer = new TimerEngine(settings, () => now, 0, {phase, status:'idle', remainingMs:60_000});
      const view = {async show(){return true;}, update(){}, hide(){}, destroy(){}};
      const makeController = () => new ReminderController({timer, view, now:()=>now,
        dateKey:()=> '2026-10-20', random:()=>0, loadState:()=>saved,
        saveState:value=>{saved=value;}, onTimerChanged:()=>{changed++;}, fallbackNotify(){}});
      let controller = makeController();
      timer.start();
      await controller.ensureRunningBreak();
      const outgoingPack = controller.getPayload().pack.id;
      now += 60_010;
      await controller.togglePause();
      assert.equal(timer.phase, 'focus', 'direct callers must not leave an expired break paused at zero');
      assert.equal(timer.status, automatic.autoStartFocus ? 'running' : 'idle');
      assert.equal(timer.companionCycleIndex, 1);
      assert.equal(timer.completedFocusSessions, 0);
      assert.equal(controller.getPayload().pack.id, outgoingPack);
      assert.equal(changed, 1);
      await controller.togglePause();
      await controller.togglePause();
      assert.equal(changed, 1);
      assert.equal(timer.tick().completed, null);
      const exported = timer.exportState();
      controller.destroy();
      timer = new TimerEngine(settings, () => now, 0, exported);
      controller = makeController();
      await controller.restore();
      await controller.togglePause();
      assert.equal(timer.phase, 'focus');
      assert.equal(timer.companionCycleIndex, 1);
      assert.equal(timer.completedFocusSessions, 0);
      controller.destroy();
    });
  }
}
