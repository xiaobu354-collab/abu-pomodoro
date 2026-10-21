const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = name => fs.readFileSync(require('node:path').join(__dirname, '..', name), 'utf8');
test('original mini uses a hover settings gear and independent undo, no menu or full entry', () => {
  const html=read('src/renderer/floating.html'), js=read('src/renderer/floating.js');
  assert.match(html,/id="settingsButton"/); assert.match(html,/id="undoRow"/);
  assert.doesNotMatch(html,/id="(?:modeButton|menuButton)"/); assert.match(js,/openSettings\(\)/); assert.match(js,/undoTimer\(\)/);
  assert.match(js,/waitingForBreak/);
});
test('settings separates automation and offers roles and shortcut errors', () => {
  const html=read('src/renderer/settings.html'),js=read('src/renderer/settings.js'),css=read('src/renderer/settings.css');
  for(const id of ['autoStartBreak','autoStartFocus','reminderPacks','pauseShortcut','shortcutError','disableShortcut']) assert.ok(html.includes(`id="${id}"`));
  assert.doesNotMatch(html,/id="autoStartNext"/); assert.match(js,/enabledReminderIds/); assert.match(js,/shortcutError/); assert.match(css,/overflow-y:\s*auto/);
});
test('theme text keeps valid white-space property after color tokenization',()=>{
 assert.doesNotMatch(read('src/renderer/settings.css'),/var\([^)]*\)-space:/);
 assert.match(read('src/renderer/settings.css'),/white-space:\s*nowrap/);
});
test('original fractional letter spacing remains valid after tokenization',()=>{
 const css=read('src/renderer/floating.css');
 assert.equal(css.includes('.var('),false);
 assert.match(css,/--legacy-size-0_5:\s*0\.5px/);
 assert.match(css,/--legacy-size-0_1:\s*0\.1px/);
});
test('card provides change-pack and bottom undo with preload channels', () => {
  const html=read('src/renderer/reminder.html'),js=read('src/renderer/reminder.js'),preload=read('src/preload.js');
  assert.match(html,/id="changePack"/); assert.match(html,/id="undoRow"/); assert.match(js,/changePack\(\)/); assert.match(js,/undoTimer\(\)/);
  for(const channel of ['window:menu','timer:undo','reminder:reopen','reminder:change-pack']) assert.ok(preload.includes(channel));
});
