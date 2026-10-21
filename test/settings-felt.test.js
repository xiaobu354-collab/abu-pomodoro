const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('settings felt material is local, non-intercepting and keeps native controls', () => {
  const css = fs.readFileSync(path.join(root, 'src/renderer/settings.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/renderer/settings.html'), 'utf8');
  assert.match(css, /--felt-texture:/);
  assert.match(css, /assets\/settings-felt\/fiber\.png/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /-webkit-app-region:\s*drag/);
  assert.match(css, /-webkit-app-region:\s*no-drag/);
  assert.match(css, /::-webkit-slider-thumb/);
  assert.match(css, /prefers-reduced-motion/);
  for (const id of ['companionHint','companionDetail','focusMinutes','pauseShortcut','shortcutError','closeButton','reminderPacks']) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /default-src 'self'; style-src 'self'; script-src 'self'/);
  assert.ok(fs.existsSync(path.join(root, 'assets/settings-felt/fiber.png')));
});
