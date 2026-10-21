const test = require('node:test');
const assert = require('node:assert/strict');
const {checkAssets,validateSvg} = require('../scripts/check-assets.cjs');

test('public production assets retain fixed bytes, embedded PNGs, geometry, references and local-only resources', () => {
  assert.deepEqual(checkAssets(), {allPassed:true,releaseVersion:'1.0.33',assetFiles:42,companionSkins:20,focusSkins:3});
});

test('SVG validation rejects dangling references, duplicate IDs and active/external content', () => {
  for (const svg of [
    '<svg id="root"><path fill="url(#missing)"/></svg>',
    '<svg id="root"><g id="root"/></svg>',
    '<svg id="root"><image href="https://example.test/a.png"/></svg>',
    '<svg id="root"><script>alert(1)</script></svg>',
    '<svg id="root" onload="alert(1)"></svg>',
    '<svg id="root"><use href="#missing"/></svg>',
  ]) assert.throws(() => validateSvg(svg, [], 'root'));
});

test('SVG validation checks embedded PNG integrity instead of trusting its data URL label', () => {
  assert.throws(() => validateSvg('<svg id="root"><image href="data:image/png;base64,YmFk"/></svg>', [], 'root'));
  assert.doesNotThrow(() => validateSvg('<svg id="root"><g id="local"/><use href="#local"/></svg>', [], 'root'));
});
