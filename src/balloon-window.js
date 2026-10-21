const path = require('node:path');
const { BrowserWindow, screen } = require('electron');

const BALLOON_WIDTH = 112;
// 1.0.23: 64→72。漂浮动画峰值上移 4px + hover 2px，原顶部余量仅 ~2px 会被窗口裁掉
const BALLOON_HEIGHT = 72;
const GAP_FROM_BAR = 0;
const EDGE_PADDING = 8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeBalloonBounds(barBounds, workArea, options = {}) {
  const {
    forceBelow = false,
    width = BALLOON_WIDTH,
    height = BALLOON_HEIGHT,
    gap = GAP_FROM_BAR,
    padding = EDGE_PADDING
  } = options;
  if (!barBounds || !workArea) return null;

  const centerX = barBounds.x + barBounds.width / 2;
  // 2026-09-11 定位改版：气球窗口右缘贴迷你条右缘（原为水平居中）
  const desiredX = Math.round(barBounds.x + barBounds.width - width);
  const targetX = clamp(
    desiredX,
    workArea.x + padding,
    workArea.x + workArea.width - width - padding
  );

  const aboveY = barBounds.y - height - gap;
  const belowY = barBounds.y + barBounds.height + gap;
  const canFitAbove = aboveY >= workArea.y + padding;
  const canFitBelow = belowY + height <= workArea.y + workArea.height - padding;

  let targetY;
  let placement;
  if (forceBelow || !canFitAbove) {
    placement = canFitBelow ? 'below' : 'float';
    targetY = canFitBelow
      ? belowY
      : clamp(barBounds.y, workArea.y + padding, workArea.y + workArea.height - height - padding);
  } else {
    placement = 'above';
    targetY = aboveY;
  }

  return { x: targetX, y: targetY, width, height, placement };
}

function positionBalloon(balloon, bar, options = {}) {
  if (!balloon || balloon.isDestroyed() || !bar || bar.isDestroyed()) return null;
  const workArea = screen.getDisplayMatching(bar.getBounds()).workArea;
  const bounds = computeBalloonBounds(bar.getBounds(), workArea, options);
  if (!bounds) return null;
  balloon.setBounds(bounds, false);
  return { ...bounds, workArea };
}

function createBalloonWindow({ preloadPath } = {}) {
  const balloon = new BrowserWindow({
    width: BALLOON_WIDTH,
    height: BALLOON_HEIGHT,
    minWidth: BALLOON_WIDTH,
    minHeight: BALLOON_HEIGHT,
    maxWidth: BALLOON_WIDTH,
    maxHeight: BALLOON_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      preload: preloadPath || path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  balloon.loadFile(path.join(__dirname, 'renderer', 'balloon.html'));
  return balloon;
}

module.exports = {
  BALLOON_WIDTH,
  BALLOON_HEIGHT,
  GAP_FROM_BAR,
  EDGE_PADDING,
  clamp,
  computeBalloonBounds,
  positionBalloon,
  createBalloonWindow
};
