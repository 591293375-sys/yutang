export const UHD_PIXELS = 3840 * 2160;
export const DESKTOP_PIXELS = 6144 * 3456;

// Keep the native display crisp without accidentally allocating an 8K surface
// when a 4K CSS viewport is presented with devicePixelRatio = 2.
export function renderScale(width, height, deviceScale = 1, quality = 'high', desktopMode = false, displayScale = 0) {
  if (desktopMode && quality !== 'low') {
    // Desktop gets its own budget: at least 3840 px on the long edge, with
    // native 5K/6K retained. Preserve the panel's ratio (including 16:10).
    const desired = Math.max(deviceScale, Number.isFinite(displayScale) ? displayScale : 0, 3840 / Math.max(1, width, height));
    return Math.min(desired, Math.sqrt(DESKTOP_PIXELS / (Math.max(1, width) * Math.max(1, height))));
  }
  const pixelBudget = quality === 'low' ? 1920 * 1080 : UHD_PIXELS;
  return Math.min(quality === 'low' ? 1 : Math.max(1, deviceScale),
    Math.sqrt(pixelBudget / (Math.max(1, width) * Math.max(1, height))));
}

// All composited pond layers share one pixel grid. Limiting only the background
// to 3840 made a 5K/6K desktop appear soft even when the fish canvas reported 6K.
export function landscapeDimensions(width, height, scale, maxSurfaceSize = Infinity) {
  const safeScale = Math.min(scale, maxSurfaceSize / Math.max(1, width, height));
  return [Math.max(1, Math.round(width * safeScale)), Math.max(1, Math.round(height * safeScale))];
}

// ResizeObserver watches CSS boxes, so it can miss a Retina/display-scale change
// while the window remains the same logical size. Re-arm at each new density.
export function watchDeviceScale(onChange, target = window) {
  let query;
  const changed = () => { listen(); onChange(); };
  function listen() {
    query?.removeEventListener('change', changed);
    query = target.matchMedia?.(`(resolution: ${target.devicePixelRatio || 1}dppx)`);
    query?.addEventListener('change', changed);
  }
  listen();
  return () => query?.removeEventListener('change', changed);
}

export function createFishShadow() {
  const sprite = document.createElement('canvas');
  sprite.width = 288; sprite.height = 144;
  const ctx = sprite.getContext('2d');
  // Blur only once on this tiny private surface, never on the animated pond.
  ctx.scale(2, 2); ctx.translate(72, 36);
  ctx.filter = 'blur(4px)';
  ctx.fillStyle = '#082f29';
  ctx.beginPath(); ctx.ellipse(0, 0, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(-39, 0, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
  return sprite;
}
