/**
 * Phase 4 skin-system and engine-lifecycle regression tests.
 *
 * Runs the real skin manager, real IPC manifest discovery and the real
 * desktop mirror mount/unmount path inside Electron.
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');
const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
const ROOT = path.resolve(__dirname, '..');

function assert(name, condition, detail) {
  if (condition) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', detail });
  }
}

function skip(name, reason) {
  results.skipped++;
  results.tests.push({ name, status: 'SKIP', reason });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(ROOT, 'electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  const consoleErrors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && !/Autoplay|ERR_/.test(message)) consoleErrors.push(message);
  });

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await new Promise((r) => setTimeout(r, 1800));

    // --- Manifest discovery and validation ---
    const manifestCheck = await win.webContents.executeJavaScript(`(async () => {
      const skins = await window.dtmPreload.getAvailableSkins();
      const out = { count: skins.length, invalid: [], missingEntry: [] };
      for (const skin of skins) {
        const result = await window.dtmPreload.validateManifest(skin, skin.folder);
        if (!result.valid) out.invalid.push({ id: skin.id, errors: result.errors });
      }
      return out;
    })()`);
    assert('all 9 skins are discovered', manifestCheck.count === 9, manifestCheck);
    assert('every discovered manifest validates', manifestCheck.invalid.length === 0, manifestCheck.invalid);

    // --- Fallback registry agrees with manifests (single source of truth) ---
    const drift = await win.webContents.executeJavaScript(`(async () => {
      const skins = await window.dtmPreload.getAvailableSkins();
      const fields = ['name', 'era', 'period', 'author', 'icon', 'themeColor', 'status'];
      const problems = [];
      for (const manifest of skins) {
        const fallback = window.dtmSkinManager.fallbackSkins.find((s) => s.id === manifest.id);
        if (!fallback) { problems.push(manifest.id + ': no fallback'); continue; }
        for (const field of fields) {
          if (fallback[field] !== manifest[field]) {
            problems.push(manifest.id + '.' + field + ': ' + fallback[field] + ' != ' + manifest[field]);
          }
        }
        if (fallback.capabilities.join(',') !== manifest.capabilities.join(',')) {
          problems.push(manifest.id + '.capabilities differ');
        }
      }
      return problems;
    })()`);
    assert('fallback registry matches every manifest', drift.length === 0, drift);

    // --- Preview assets resolve from the shell document ---
    const previews = await win.webContents.executeJavaScript(`(async () => {
      const skins = await window.dtmPreload.getAvailableSkins();
      const out = [];
      for (const skin of skins) {
        if (!skin.previewImage) { out.push({ id: skin.id, missing: true }); continue; }
        const url = new URL(skin.previewImage, document.baseURI).href;
        const ok = await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth > 0);
          img.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 3000);
          img.src = url;
        });
        out.push({ id: skin.id, ok });
      }
      return out;
    })()`);
    const brokenPreviews = previews.filter((item) => !item.missing && !item.ok);
    assert('all configured preview images load', brokenPreviews.length === 0, brokenPreviews);

    // --- Skin switching does not leak desktop state ---
    const switchCheck = await win.webContents.executeJavaScript(`(async () => {
      const out = { steps: [] };
      for (const id of ['windows95', 'windowsXP', 'macos8']) {
        const ok = await window.dtmSkinManager.switchSkin(id);
        await new Promise((r) => setTimeout(r, 900));
        const doc = document.getElementById('skin-viewport').contentWindow.document;
        const layers = Array.from(doc.querySelectorAll('.dtm-desktop-layer'));
        out.steps.push({
          id, ok,
          active: window.dtmSkinManager.getCurrentSkin().id,
          layers: layers.length,
          layerSkin: layers[0] ? layers[0].dataset.skin : null
        });
      }
      out.iconKeys = Object.keys(localStorage).filter((key) => key.startsWith('dtm:icon-positions:'));
      return out;
    })()`);
    assert('each switch reports success', switchCheck.steps.every((step) => step.ok), switchCheck.steps);
    assert('each skin has exactly one desktop layer', switchCheck.steps.every((step) => step.layers === 1), switchCheck.steps);
    assert('desktop layer belongs to the active skin', switchCheck.steps.every((step) => step.layerSkin === step.active), switchCheck.steps);
    assert('icon positions are namespaced per skin', switchCheck.iconKeys.every((key) => key.startsWith('dtm:icon-positions:')), switchCheck.iconKeys);

    // --- Repeated mount/unmount into the same document does not pile up layers ---
    const mountCheck = await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      const host = doc.createElement('div');
      doc.body.appendChild(host);
      window.dtmEngine.mountDesktop({ desktop: host, skinId: 'phase4-isolation' });
      window.dtmEngine.mountDesktop({ desktop: host, skinId: 'phase4-isolation' });
      const afterMount = host.querySelectorAll('.dtm-desktop-layer').length;
      window.dtmEngine.unmountDesktop('phase4-isolation');
      const afterUnmount = host.querySelectorAll('.dtm-desktop-layer').length;
      const stats = window.dtmDesktopStats ? window.dtmDesktopStats() : null;
      host.remove();
      return { afterMount, afterUnmount, stats };
    })()`);
    assert('repeat mount leaves one layer', mountCheck.afterMount === 1, mountCheck);
    assert('unmount removes the layer', mountCheck.afterUnmount === 0, mountCheck);

    // --- Browser development fallback (no preload bridge) ---
    const browserWin = new BrowserWindow({ show: false, width: 800, height: 600 });
    try {
      await browserWin.loadFile(path.join(ROOT, 'src/index.html'));
      await new Promise((r) => setTimeout(r, 900));
      const fallback = await browserWin.webContents.executeJavaScript(`(async () => {
        try {
          const desktop = await window.dtmEngine.fs.getDesktop();
          return { ok: true, items: (desktop && desktop.items) || [], hasEngine: !!window.dtmEngine };
        } catch (e) { return { ok: false, error: e.message }; }
      })()`);
      assert('browser fallback exposes engine without preload', fallback.ok && fallback.hasEngine, fallback);
      assert('browser fallback returns a safe empty desktop', Array.isArray(fallback.items) && fallback.items.length === 0, fallback);
    } finally {
      browserWin.close();
    }

    assert('no unexpected console errors', consoleErrors.length === 0, consoleErrors);
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'suite error', status: 'FAIL', detail: e.stack || e.message });
  }

  console.log('=== PHASE 4 SKIN/LIFECYCLE TEST RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  win.close();
  app.exit(results.failed ? 1 : 0);
});
