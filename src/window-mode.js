const WINDOW_HEIGHT = 96;
const WINDOW_WIDTHS = Object.freeze({
  full: 640,
  compact: 270
});

function normalizeWindowMode(value) {
  return value === 'compact' ? 'compact' : 'full';
}

function windowWidthForMode(mode) {
  return WINDOW_WIDTHS[normalizeWindowMode(mode)];
}

function boundsForWindowMode(currentBounds, workArea, mode, height = WINDOW_HEIGHT) {
  const width = windowWidthForMode(mode);
  const centerX = currentBounds.x + currentBounds.width / 2;
  const maxX = Math.max(workArea.x, workArea.x + workArea.width - width);
  const maxY = Math.max(workArea.y, workArea.y + workArea.height - height);

  return {
    x: Math.min(maxX, Math.max(workArea.x, Math.round(centerX - width / 2))),
    y: Math.min(maxY, Math.max(workArea.y, currentBounds.y)),
    width,
    height
  };
}

module.exports = {
  WINDOW_HEIGHT,
  WINDOW_WIDTHS,
  normalizeWindowMode,
  windowWidthForMode,
  boundsForWindowMode
};
