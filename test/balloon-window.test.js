const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BALLOON_WIDTH,
  BALLOON_HEIGHT,
  GAP_FROM_BAR,
  EDGE_PADDING,
  computeBalloonBounds,
  clamp
} = require('../src/balloon-window');

const WIDE_WORK_AREA = { x: 0, y: 0, width: 1920, height: 1080 };

test('clamp pins values inside the inclusive range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('balloon defaults stay within the exported dimensions', () => {
  assert.equal(BALLOON_WIDTH, 112);
  assert.equal(BALLOON_HEIGHT, 72);
  assert.equal(GAP_FROM_BAR, 0);
  assert.equal(EDGE_PADDING, 8);
});

test('balloon centers horizontally above the bar when space allows', () => {
  const bar = { x: 640, y: 400, width: 640, height: 76 };
  const bounds = computeBalloonBounds(bar, WIDE_WORK_AREA);
  assert.equal(bounds.width, BALLOON_WIDTH);
  assert.equal(bounds.height, BALLOON_HEIGHT);
  const expectedX = Math.round(bar.x + bar.width - BALLOON_WIDTH); // 右缘对齐
  assert.equal(bounds.x, expectedX);
  assert.equal(bounds.y, bar.y - BALLOON_HEIGHT - GAP_FROM_BAR);
});

test('balloon falls back to below the bar when the work area has no headroom', () => {
  const bar = { x: 600, y: 10, width: 640, height: 76 };
  const bounds = computeBalloonBounds(bar, WIDE_WORK_AREA);
  assert.equal(bounds.y, bar.y + bar.height + GAP_FROM_BAR);
});

test('balloon clamps horizontally inside the work area edges', () => {
  const rightBar = { x: WIDE_WORK_AREA.width - 200, y: 220, width: 640, height: 76 };
  const rightBounds = computeBalloonBounds(rightBar, WIDE_WORK_AREA);
  const maxX = WIDE_WORK_AREA.x + WIDE_WORK_AREA.width - BALLOON_WIDTH - EDGE_PADDING;
  assert.equal(rightBounds.x, maxX);

  // 右对齐语义下，只有 bar 右缘越过屏幕左边界才会触发左夹紧
  const leftBar = { x: -800, y: 220, width: 640, height: 76 };
  const leftBounds = computeBalloonBounds(leftBar, WIDE_WORK_AREA);
  assert.equal(leftBounds.x, WIDE_WORK_AREA.x + EDGE_PADDING);
});

test('balloon forceBelow places the bubble beneath the bar even with room above', () => {
  const bar = { x: 600, y: 220, width: 640, height: 76 };
  const bounds = computeBalloonBounds(bar, WIDE_WORK_AREA, { forceBelow: true });
  assert.equal(bounds.y, bar.y + bar.height + GAP_FROM_BAR);
});

test('balloon falls back inside the work area when neither above nor below fits', () => {
  const tinyWorkArea = { x: 0, y: 0, width: 1920, height: 206 };
  const bar = { x: 600, y: 0, width: 640, height: 76 };
  const bounds = computeBalloonBounds(bar, tinyWorkArea);
  assert.ok(bounds.y >= tinyWorkArea.y + EDGE_PADDING);
  assert.ok(bounds.y + bounds.height <= tinyWorkArea.y + tinyWorkArea.height - EDGE_PADDING);
});

test('balloon handles displays positioned to the right of the primary work area', () => {
  const offsetWorkArea = { x: 1920, y: 0, width: 1920, height: 1080 };
  const bar = { x: 2240, y: 360, width: 640, height: 76 };
  const bounds = computeBalloonBounds(bar, offsetWorkArea);
  const expectedX = Math.round(bar.x + bar.width - BALLOON_WIDTH); // 右缘对齐
  assert.equal(bounds.x, expectedX);
  assert.equal(bounds.y, bar.y - BALLOON_HEIGHT - GAP_FROM_BAR);
});

test('computeBalloonBounds returns null when bar or work area is missing', () => {
  assert.equal(computeBalloonBounds(null, WIDE_WORK_AREA), null);
  assert.equal(computeBalloonBounds({ x: 0, y: 0, width: 640, height: 76 }, null), null);
});
