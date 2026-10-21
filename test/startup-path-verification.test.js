const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createLoginStartup } = require('../src/login-startup');

const name = 'MintPomodoro-CloudPairedTrial';
const oldPath = 'C:\\Old\\Cloud.exe';
const newPath = 'C:\\New\\Cloud.exe';

test('enable rejects an ignored path update even when the known old entry remains enabled', () => {
  const app = {
    setLoginItemSettings() {},
    getLoginItemSettings: query => ({ launchItems: query.path === oldPath
      ? [{ name, path: oldPath, args: [], enabled: true }] : [] })
  };
  const api = createLoginStartup({ app, packaged: true, paired: true, execPath: newPath, getKnownPath: () => oldPath });
  assert.throws(() => api.apply(true), /启动项/);
  assert.equal(api.snapshot().path, oldPath);
});

test('enable verifies exact returned path, arguments, own name, user scope and enabled state', async t => {
  for (const [label, item] of [
    ['wrong executable', { path: oldPath }],
    ['unexpected arguments', { args: ['--quiet'] }],
    ['another product', { name: 'MintPomodoro' }],
    ['machine scope', { scope: 'machine' }],
    ['disabled entry', { enabled: false }]
  ]) {
    await t.test(label, () => {
      const app = { setLoginItemSettings() {}, getLoginItemSettings: () => ({
        launchItems: [{ name, path: newPath, args: [], enabled: true, ...item }]
      }) };
      const api = createLoginStartup({ app, packaged: true, paired: true, execPath: newPath });
      assert.throws(() => api.apply(true), /启动项/);
    });
  }
});

test('restore rejects a wrong returned path even when saved enabled state and arguments match', () => {
  const saved = { name, path: newPath, args: ['--quiet'], enabled: false };
  const app = { setLoginItemSettings() {}, getLoginItemSettings: () => ({
    launchItems: [{ ...saved, path: oldPath }]
  }) };
  const api = createLoginStartup({ app, packaged: true, paired: true, execPath: newPath });
  assert.throws(() => api.restore(saved), /恢复/);
});

test('disable rejects an ignored removal when the old enabled entry remains', () => {
  const app = {
    setLoginItemSettings() {},
    getLoginItemSettings: query => ({ launchItems: query.path === oldPath
      ? [{ name, path: oldPath, args: [], enabled: true }] : [] })
  };
  const api = createLoginStartup({ app, packaged: true, paired: true, execPath: newPath, getKnownPath: () => oldPath });
  assert.throws(() => api.apply(false), /启动项/);
});

function ignoredWritesHarness() {
  const file = path.join(__dirname, 'support/main-harness.cjs');
  const realRequire = createRequire(file), module = { exports: {} };
  const original = 'loginItems=value.openAtLogin?[{...value,enabled:value.enabled!==false}]:[];';
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.includes(original), 'harness startup write injection must match exactly');
  const retainedProfiles = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'abu-startup-'));
  fs.mkdirSync(retainedProfiles, { recursive: true });
  vm.runInNewContext(source.replace(original, '/* Simulate Windows silently refusing every startup write. */'), {
    module, exports: module.exports, __dirname: path.dirname(file),
    require(id) {
      if (id === 'node:os') return { ...realRequire(id), tmpdir: () => retainedProfiles };
      return realRequire(id);
    }, process, console, setTimeout, clearTimeout, setImmediate, queueMicrotask
  }, { filename: file });
  return module.exports.boot;
}

test('main retry preserves startup error and known old path when Windows silently refuses migration', async () => {
  const boot = ignoredWritesHarness();
  const h = await boot({ packaged: true, args: ['--paired-theme-trial'],
    saved: { settings: { launchAtLogin: true }, loginStartupPath: oldPath },
    loginItems: [{ name, path: oldPath, args: [], enabled: true }] });
  try {
    const before = await h.invoke('app:get-state');
    assert.ok(before.startupError);
    const after = await h.invoke('settings:update', { launchAtLogin: true });
    assert.ok(after.startupError, 'retry must not clear an uncorrected startup path failure');
    assert.equal(h.saved().loginStartupPath, oldPath, 'retry must retain the path still used by Windows');
    assert.equal(h.getLoginItems()[0].path, oldPath);
    assert.equal(after.settings.launchAtLogin, true);
  } finally {
    h.events.get('will-quit')?.();
  }
});
