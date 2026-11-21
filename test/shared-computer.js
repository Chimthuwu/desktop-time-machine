/**
 * Architectural guard: every skin is a presentation of the SAME computer.
 *
 * Verifies that all registered skins read identical real host data through the
 * shared engine, and that per-skin browser storage only contains visual layout
 * preferences rather than a private copy of user files.
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const SKINS = ['windows95', 'windows98', 'windowsXP', 'macos8', 'macosx', 'amiga-workbench', 'beos', 'templeos'];
const results = { passed: 0, failed: 0, tests: [] };

function assert(name, condition, detail) {
  if (condition) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL', detail });
  }
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

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await new Promise((r) => setTimeout(r, 1200));

    const snapshots = [];
    for (const skinId of SKINS) {
      await win.webContents.executeJavaScript(
        `localStorage.setItem('dtm_active_skin', ${JSON.stringify(skinId)})`
      );
      await win.webContents.reload();
      await win.webContents.executeJavaScript(`new Promise((resolve) => {
        const started = Date.now();
        const check = () => {
          const ok = window.dtmSkinManager && window.dtmSkinManager.getCurrentSkin().id === ${JSON.stringify(skinId)};
          if (ok || Date.now() - started > 12000) resolve();
          else setTimeout(check, 100);
        };
        check();
      })`);
      if (skinId !== 'templeos') {
        await win.webContents.executeJavaScript(`new Promise((resolve) => {
          const started = Date.now();
          const check = () => {
            const frame = document.getElementById('skin-viewport');
            const doc = frame && frame.contentDocument;
            const ready = doc && doc.querySelectorAll('.dtm-icon').length > 0;
            if (ready || Date.now() - started > 12000) resolve();
            else setTimeout(check, 100);
          };
          check();
        })`);
      }
      await new Promise((r) => setTimeout(r, skinId === 'macosx' ? 1600 : 500));

      const data = await win.webContents.executeJavaScript(`(async () => {
        const w = window;
        const active = w.dtmSkinManager.getCurrentSkin().id;
        const desktop = await w.dtmEngine.fs.getDesktop();
        const listing = await w.dtmEngine.fs.list('');
        const doc = document.getElementById('skin-viewport').contentWindow.document;
        const mirrored = Array.from(doc.querySelectorAll('.dtm-icon'))
          .map((el) => el.dataset.path || el.querySelector('.dtm-icon-label')?.textContent || '')
          .filter(Boolean).sort();
        const layoutKeys = Object.keys(localStorage).filter((k) => k.startsWith('dtm:icon-positions:'));
        const layoutOnly = layoutKeys.every((key) => {
          try {
            const obj = JSON.parse(localStorage.getItem(key) || '{}');
            return obj && typeof obj === 'object' && !Array.isArray(obj) && Object.values(obj).every(
              (v) => v && typeof v === 'object' && Number.isFinite(v.x) && Number.isFinite(v.y)
            );
          } catch { return false; }
        });
        const desktopNames = (desktop.items || []).map((i) => i.name);
        return {
          active,
          desktopPaths: (desktop.items || []).map((i) => i.path).sort(),
          desktopNames,
          rootNames: (listing.items || []).map((i) => i.name).sort(),
          mirrored,
          layoutKeys,
          layoutOnly
        };
      })()`);
      snapshots.push({ skinId, ...data });
    }

    assert('all eight skins mounted', snapshots.every((s) => s.active === s.skinId), snapshots.map((s) => [s.skinId, s.active]));

    const reference = snapshots[0].desktopPaths.join('|');
    assert(
      'every skin sees the same real desktop items',
      snapshots.every((s) => s.desktopPaths.join('|') === reference),
      snapshots.map((s) => ({ skin: s.skinId, count: s.desktopPaths.length }))
    );
    assert(
      'every skin sees the same real home/root listing',
      snapshots.every((s) => s.rootNames.join('|') === snapshots[0].rootNames.join('|')),
      snapshots.map((s) => ({ skin: s.skinId, count: s.rootNames.length }))
    );
    assert(
      'no per-skin private file store is created',
      snapshots.every((s) => s.layoutOnly),
      snapshots.map((s) => ({ skin: s.skinId, keys: s.layoutKeys }))
    );
    assert(
      'mirrored desktop content comes from real host files',
      snapshots.filter((s) => s.skinId !== 'templeos').every((s) =>
        s.mirrored.some((label) => s.desktopNames.some((name) => label.includes(name) || name.includes(label)))
      ),
      snapshots.map((s) => ({ skin: s.skinId, mirrored: s.mirrored.length }))
    );
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'suite error', status: 'FAIL', detail: e.stack || e.message });
  }

  console.log('=== SHARED COMPUTER ARCHITECTURE TEST ===');
  console.log(JSON.stringify(results, null, 2));
  win.close();
  app.quit();
});
