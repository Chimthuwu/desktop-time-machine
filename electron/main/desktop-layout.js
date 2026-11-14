/**
 * Desktop Time Machine — real desktop icon layout
 *
 * Reads the icon names and positions Explorer itself uses for the desktop via
 * IFolderView2 (see read-desktop-layout.ps1). Positions are returned both in
 * virtual-desktop pixels and normalised 0..1 form. The PowerShell probe is
 * cached briefly because it costs a process spawn.
 */
const { execFile } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'read-desktop-layout.ps1');
const TTL_MS = 15000;
const TIMEOUT_MS = 8000;

let cache = null;
let cacheAt = 0;

function virtualBounds() {
  try {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    if (!displays.length) return { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const d of displays) {
      x1 = Math.min(x1, d.bounds.x);
      y1 = Math.min(y1, d.bounds.y);
      x2 = Math.max(x2, d.bounds.x + d.bounds.width);
      y2 = Math.max(y2, d.bounds.y + d.bounds.height);
    }
    return {
      x: x1, y: y1, width: x2 - x1, height: y2 - y1,
      scale: screen.getPrimaryDisplay().scaleFactor || 1
    };
  } catch {
    return { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };
  }
}

function readRaw() {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT],
      { windowsHide: true, timeout: TIMEOUT_MS, maxBuffer: 4 << 20, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(String(stderr || err.message).trim()));
        const text = String(stdout).trim();
        if (!text) return reject(new Error('empty layout output'));
        try { resolve(JSON.parse(text)); }
        catch { reject(new Error('invalid layout JSON')); }
      });
  });
}

async function getDesktopLayout() {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'not windows', autoArrange: false, spacing: { x: 76, y: 104 }, bounds: virtualBounds(), items: [] };
  }
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;

  const bounds = virtualBounds();
  const widthPx = Math.max(1, bounds.width * bounds.scale);
  const heightPx = Math.max(1, bounds.height * bounds.scale);

  let raw;
  try {
    raw = await readRaw();
  } catch (e) {
    raw = { autoArrange: false, spacing: { x: 76, y: 104 }, count: 0, items: [], error: String(e.message || e) };
  }

  // GetSpacing can fail on some desktop view modes and leave a zeroed POINT.
  const spacing = (raw.spacing && raw.spacing.x > 0 && raw.spacing.y > 0)
    ? raw.spacing
    : { x: 76, y: 104 };

  const items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((it) => it && Number.isFinite(it.x) && Number.isFinite(it.y))
    .map((it) => ({
      name: String(it.name || ''),
      x: it.x,
      y: it.y,
      nx: Math.min(1, Math.max(0, (it.x - bounds.x * bounds.scale) / widthPx)),
      ny: Math.min(1, Math.max(0, (it.y - bounds.y * bounds.scale) / heightPx))
    }));

  cache = {
    ok: !raw.error,
    error: raw.error || null,
    autoArrange: !!raw.autoArrange,
    spacing,
    bounds,
    items
  };
  cacheAt = Date.now();
  return cache;
}

module.exports = {
  getDesktopLayout,
  invalidate: () => { cache = null; cacheAt = 0; }
};
