const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SETTINGS, normalizeSettings } = require('../src/config');

test('focus theme defaults to writing and accepts both supported themes', () => {
  assert.equal(normalizeSettings({}).focusTheme, DEFAULT_SETTINGS.focusTheme);
  assert.equal(normalizeSettings({ focusTheme: 'writing' }).focusTheme, 'writing');
  assert.equal(normalizeSettings({ focusTheme: 'headphones' }).focusTheme, 'headphones');
  assert.equal(normalizeSettings({ focusTheme: 'unknown' }).focusTheme, 'writing');
});

test('split auto-start defaults and legacy migration preserve explicit choices', () => {
  assert.equal(DEFAULT_SETTINGS.autoStartBreak, false);
  assert.equal(DEFAULT_SETTINGS.launchAtLogin, true);
  assert.equal(DEFAULT_SETTINGS.autoStartFocus, false);
  assert.ok(!('autoStartNext' in DEFAULT_SETTINGS));
  for (const value of [true, false]) {
    const settings = normalizeSettings({ autoStartNext: value });
    assert.equal(settings.autoStartBreak, value);
    assert.equal(settings.autoStartFocus, value);
    assert.ok(!('autoStartNext' in settings));
  }
  assert.equal(normalizeSettings({ autoStartNext: true, autoStartFocus: false }).autoStartFocus, false);
});

test('enabled reminders are valid unique and never empty', () => {
  const { REMINDER_PACK_IDS } = require('../src/reminder-content');
  assert.deepEqual(normalizeSettings({ enabledReminderIds: ['stretch', 'missing', 'stretch'] }).enabledReminderIds, ['stretch']);
  for (const value of [[], ['missing'], null]) {
    assert.deepEqual(normalizeSettings({ enabledReminderIds: value }).enabledReminderIds, REMINDER_PACK_IDS);
  }
});

test('pause shortcut accepts safe accelerator combinations only', () => {
  for (const value of ['', 'Ctrl+Alt+P', 'CommandOrControl+Shift+Space', 'F8']) {
    assert.equal(normalizeSettings({ pauseShortcut: value }).pauseShortcut, value);
  }
  for (const value of [123, 'Ctrl+', 'Ctrl+Ctrl+P', 'P', 'Ctrl+P; run', 'Ctrl+Unknown']) {
    assert.equal(normalizeSettings({ pauseShortcut: value }).pauseShortcut, '');
  }
});
