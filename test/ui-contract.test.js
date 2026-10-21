const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererDirectory = path.join(__dirname, '..', 'src', 'renderer');

test('floating bar includes separate work and break illustrations', () => {
  const html = fs.readFileSync(path.join(rendererDirectory, 'floating.html'), 'utf8');
  assert.match(html, /class="phase-art tomato-art"/);
  assert.match(html, /class="phase-art fish-art"/);
});

test('approved focus skins replace manual theme selection with per-round rotation', () => {
  const html = fs.readFileSync(path.join(rendererDirectory, 'floating.html'), 'utf8');
  const script = fs.readFileSync(path.join(rendererDirectory, 'focus-skin.js'), 'utf8');
  const settingsHtml = fs.readFileSync(path.join(rendererDirectory, 'settings.html'), 'utf8');
  assert.match(html, /id="focusSkin"/);
  assert.match(script, /\['01', '02', '03'\]/);
  assert.match(script, /timer\.focusSkinId/);
  assert.match(settingsHtml, /自动轮换/);
  assert.doesNotMatch(settingsHtml, /name="focusTheme"/);
});

test('floating bar exposes an accessible phase transition message', () => {
  const html = fs.readFileSync(path.join(rendererDirectory, 'floating.html'), 'utf8');
  const script = fs.readFileSync(path.join(rendererDirectory, 'floating.js'), 'utf8');
  assert.match(html, /id="transitionToast" role="status" aria-live="assertive"/);
  assert.match(script, /onPhaseTransition\(showPhaseTransition\)/);
  assert.match(script, /去摸会儿鱼吧/);
  assert.match(script, /休息结束，开始专注/);
});

test('persistent phase copy includes caring messages for focus and breaks', () => {
  const html = fs.readFileSync(path.join(rendererDirectory, 'floating.html'), 'utf8');
  const script = fs.readFileSync(path.join(rendererDirectory, 'floating.js'), 'utf8');
  assert.match(html, /id="phaseMessage"/);
  assert.match(script, /不用赶，只做好眼前这一件事/);
  assert.match(script, /放心摸鱼，休息也在计划里/);
  assert.match(script, /离开屏幕，让脑子真正放个假/);
});

test('original mini hover swaps information for comfortably spaced controls and settings', () => {
  const html = fs.readFileSync(path.join(rendererDirectory, 'floating.html'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDirectory, 'floating.css'), 'utf8');
  assert.match(html, /id="settingsButton"/);
  assert.doesNotMatch(html, /id="modeButton"/);
  assert.match(css, /-webkit-app-region:\s*drag/);
  assert.match(css, /button\s*\{[^}]*-webkit-app-region:\s*no-drag/);
  assert.match(css, /preview-hover \.timer-controls[^}]*display:\s*flex/);
  assert.match(css, /preview-hover \.phase-copy[^}]*display:\s*none/);
  assert.match(css, /\.signal\s*\{[^}]*display:\s*flex/);
});

test('compact phase label uses tokenized readable typography', () => {
  const css = fs.readFileSync(path.join(rendererDirectory, 'floating.css'), 'utf8');
  assert.match(css, /--legacy-size-18:\s*18px/);
  assert.match(css, /\.phase\s*\{[^}]*font-size:\s*var\(--legacy-size-18\)/);
});

test('balloon html is a cloudless balloon-and-word overlay with tone-switched words', () => {
  const html = fs.readFileSync(path.join(rendererDirectory, 'balloon.html'), 'utf8');
  assert.match(html, /id="balloon"[^>]*type="button"/);
  assert.match(html, /data-tone="break"/);
  assert.match(html, /class="scene"/);
  assert.doesNotMatch(html, /cloud|sleepyFace|awakeFace/);
  assert.match(html, /href="#wordRest"/);
  assert.match(html, /href="#wordWork"/);
});

test('balloon css styles the scene, tone switch, and enter/leave animations', () => {
  const css = fs.readFileSync(path.join(rendererDirectory, 'balloon.css'), 'utf8');
  assert.match(css, /\.scene\s*\{/);
  assert.match(css, /\.b-teal/);
  assert.match(css, /data-tone="break"/);
  assert.match(css, /data-tone="focus"/);
  assert.match(css, /\.balloon\.enter/);
  assert.match(css, /@keyframes balloonIn/);
  assert.match(css, /@keyframes balloonOut/);
  assert.match(css, /prefers-reduced-motion/);
});

test('balloon renderer reacts to advance, show, and hide channels', () => {
  const script = fs.readFileSync(path.join(rendererDirectory, 'balloon.js'), 'utf8');
  assert.match(script, /onBalloonShow/);
  assert.match(script, /onBalloonHide/);
  assert.match(script, /advanceTransition/);
  assert.match(script, /getBalloonState/);
  assert.match(script, /tone: 'break'/);
  assert.match(script, /tone: 'focus'/);
  assert.match(script, /dataset\.tone = template\.tone/);
});

test('preload bridge exposes the reminder actions on window.mintTimer', () => {
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  for (const channel of ['get-state','start-break','toggle-pause','finish-break','snooze','collapse','start-focus','extend-break']) {
    assert.ok(preload.includes(`'reminder:${channel}'`));
  }
  assert.ok(preload.includes("subscribe('reminder:state'"));
});

test('main process uses the reminder controller and leaves balloon inactive', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /new ReminderController/);
  assert.match(main, /reminder\.onPhaseCompleted\(completed\)/);
  assert.doesNotMatch(main, /require\('\.\/balloon-window'\)/);
});

test('settings renderer skips focused duration inputs to avoid slider fight', () => {
  const script = fs.readFileSync(path.join(rendererDirectory, 'settings.js'), 'utf8');
  assert.match(script, /document\.activeElement === input/);
});

test('reminder view does not depend on floating bar visibility', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /getAnchor: \(\) => mainWindow/);
  const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'reminder-view.js'), 'utf8');
  assert.doesNotMatch(view, /getAnchor\(\)\.isVisible/);
});
