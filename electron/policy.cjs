'use strict';

function allowedEntry(candidate, entry) {
  try {
    const current = new URL(candidate);
    const trusted = new URL(entry);
    current.hash = '';
    trusted.hash = '';
    return current.href === trusted.href;
  } catch { return false; }
}

function requireBoolean(value) {
  if (typeof value !== 'boolean') throw new TypeError('Expected a boolean setting.');
  return value;
}

function pointForBounds(point, bounds) {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || bounds.width <= 0 || bounds.height <= 0) return null;
  const x = point.x - bounds.x;
  const y = point.y - bounds.y;
  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return null;
  return { x, y, normalizedX: x / bounds.width, normalizedY: y / bounds.height };
}

function parseHelperLine(line) {
  if (typeof line !== 'string' || line.length > 4096) return null;
  try {
    const data = JSON.parse(line);
    if (data.event === 'ready') return { event: 'ready' };
    if (data.event === 'denied') return { event: 'denied' };
    if (data.event === 'click' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      return { event: 'click', x: data.x, y: data.y };
    }
  } catch { /* Malformed native data never crosses into the renderer. */ }
  return null;
}

function displayMetrics(display) {
  const width = display?.bounds?.width, height = display?.bounds?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scaleFactor = Number.isFinite(display.scaleFactor) && display.scaleFactor > 0 ? display.scaleFactor : 1;
  return { id: display.id, width, height, scaleFactor,
    pixelWidth: Math.round(width * scaleFactor), pixelHeight: Math.round(height * scaleFactor) };
}

module.exports = { allowedEntry, requireBoolean, pointForBounds, parseHelperLine, displayMetrics };
