/** Regression check: per-window document listeners must not leak on close.
 *
 * The Windows Media Player shell window registers a document-level `pointerdown`
 * dismiss handler per window (setMenu). If closeWindow does not remove it, every
 * open/close cycle leaves one behind. This suite patches the document listener
 * bookkeeping in the live page, cycles the media player window and asserts the
 * net listener count returns to zero.
 */
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const fs = require('fs');
const path = require('path');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function staticChecks() {
  const shell = fs.readFileSync(path.join(ROOT, 'src/components/ShellApps/shell-apps.js'), 'utf8');
  assert('setMenu stores its dismiss handler on the entry',
    /entry\.menuDismiss = \(e\) =>/.test(shell));
  assert('closeWindow removes the stored dismiss handler',
    /removeEventListener\('pointerdown', entry\.menuDismiss\)/.test(shell));
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = new BrowserWindow({ show: false, width: 1024, height: 768, webPreferences: {
    preload: path.join(ROOT, 'electron/preload/index.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true
  } });

  try {
    staticChecks();
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await wait(1500);

    // Count document pointerdown listeners added after this point.
    await win.webContents.executeJavaScript(`(() => {
      window.__pdNet = 0;
      const origAdd = document.addEventListener.bind(document);
      const origRemove = document.removeEventListener.bind(document);
      document.addEventListener = function (type, fn, opts) {
        if (type === 'pointerdown') window.__pdNet++;
        return origAdd(type, fn, opts);
      };
      document.removeEventListener = function (type, fn, opts) {
        if (type === 'pointerdown') window.__pdNet--;
        return origRemove(type, fn, opts);
      };
      return window.__pdNet;
    })()`);

    // One cycle: opening the player must register exactly one dismiss handler.
    await win.webContents.executeJavaScript(`window.dtmShellApps.open('mediaplayer')`);
    await wait(300);
    const whileOpen = await win.webContents.executeJavaScript(`window.__pdNet`);
    assert('opening the media player adds its dismiss handler', whileOpen >= 1, String(whileOpen));

    // Cycles: the count must return to the open-cycle baseline every close.
    const cycles = 3;
    for (let i = 0; i < cycles; i++) {
      await win.webContents.executeJavaScript(`window.dtmShellApps.close('mediaplayer')`);
      await wait(150);
      const afterClose = await win.webContents.executeJavaScript(`window.__pdNet`);
      if (afterClose !== 0) {
        assert(`media player cycle ${i + 1} leaves no dismiss handler behind`, false,
          `net pointerdown listeners after close: ${afterClose}`);
        break;
      }
      await win.webContents.executeJavaScript(`window.dtmShellApps.open('mediaplayer')`);
      await wait(150);
    }
    const finalCount = await win.webContents.executeJavaScript(`window.__pdNet`);
    await win.webContents.executeJavaScript(`window.dtmShellApps.close('mediaplayer')`).catch(() => {});
    const afterAll = await win.webContents.executeJavaScript(`window.__pdNet`);
    assert(`${cycles} open/close cycles leave no dismiss handlers behind`, afterAll === 0,
      `net pointerdown listeners after final close: ${afterAll} (last open count ${finalCount})`);
  } catch (error) {
    assert('shell listener suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    const summary = { passed: results.passed, failed: results.failed, tests: results.tests };
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.exit(results.failed ? 1 : 0);
  }
});
