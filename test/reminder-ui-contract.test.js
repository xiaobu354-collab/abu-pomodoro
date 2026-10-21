const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('card exposes readable countdown and constrained controls', () => {
  const folder = path.join(__dirname, '../src/renderer');
  const html = fs.readFileSync(path.join(folder, 'reminder.html'), 'utf8');
  for (const id of ['reminderCard','mascot','badge','title','body','timer','progress','primaryAction','secondaryAction','tertiaryAction']) {
    assert.ok(html.includes(`id="${id}"`));
  }
  const js = fs.readFileSync(path.join(folder, 'reminder.js'), 'utf8');
  assert.ok(!js.includes('setInterval'));
  assert.ok(js.includes('onState(render)'));
  assert.ok(js.includes('error'));
});
test('card surface is draggable while action buttons stay clickable', () => {
  const css = fs.readFileSync(path.join(__dirname, '../src/renderer/reminder.css'), 'utf8');
  assert.match(css, /\.card\s*\{[^}]*-webkit-app-region:\s*drag/);
  assert.match(css, /button\s*\{[^}]*-webkit-app-region:\s*no-drag/);
});
