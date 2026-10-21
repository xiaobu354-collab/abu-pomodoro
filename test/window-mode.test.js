const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WINDOW_HEIGHT,
  normalizeWindowMode,
  windowWidthForMode,
  boundsForWindowMode
} = require('../src/window-mode');

test('window mode accepts compact and defaults every other value to full', () => {
  assert.equal(normalizeWindowMode('compact'), 'compact');
  assert.equal(normalizeWindowMode('full'), 'full');
  assert.equal(normalizeWindowMode('broken'), 'full');
  assert.equal(normalizeWindowMode(undefined), 'full');
});

test('window mode exposes the exact full and compact dimensions', () => {
  assert.equal(WINDOW_HEIGHT, 96);
  assert.equal(windowWidthForMode('full'), 640);
  assert.equal(windowWidthForMode('compact'), 270);
  assert.equal(windowWidthForMode('broken'), 640);
});

test('compact bounds preserve the window center when space is available', () => {
  assert.deepEqual(
    boundsForWindowMode(
      { x: 100, y: 20, width: 640, height: 76 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      'compact'
    ),
    { x: 285, y: 20, width: 270, height: 96 }
  );
});

test('full bounds clamp expansion to the active display work area', () => {
  assert.deepEqual(
    boundsForWindowMode(
      { x: 1750, y: 1050, width: 270, height: 76 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      'full'
    ),
    { x: 1280, y: 984, width: 640, height: 96 }
  );
});

test('bounds support displays positioned left of the primary display', () => {
  assert.deepEqual(
    boundsForWindowMode(
      { x: -1300, y: 30, width: 640, height: 76 },
      { x: -1920, y: 0, width: 1920, height: 1080 },
      'compact'
    ),
    { x: -1115, y: 30, width: 270, height: 96 }
  );
});

test('paired mini height is included when clamping to the screen bottom',()=>{
  assert.deepEqual(boundsForWindowMode({x:100,y:1050,width:270,height:96},
    {x:0,y:0,width:1920,height:1080},'compact',106),{x:100,y:974,width:270,height:106});
});
