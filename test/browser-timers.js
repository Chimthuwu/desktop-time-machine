/** Regression check: the browser shell window's timers must not outlive it.
 *
 * The (dormant, real-engine) browser path starts a 60 ms dock-sync interval
 * and a 1.5 s state-poll interval that belong to the browser window. Neither
 * was ever cleared, so closing the window left both looping forever. This
 * suite statically asserts the clearing paths exist, and probes the live
 * webview browser open/close cycle for interval leaks.
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
  assert('syncBrowserDock parks the 60 ms loop when the browser window is gone',
    /function syncBrowserDock[\s\S]{0,400}if \(!windows\.has\('browser'\)\) \{[\s\S]{0,300}clearInterval\(dockTimer\)/.test(shell));
  assert('the state-poll beat stops its 1.5 s interval when the window is gone',
    /stateTimer = setInterval\(\(\) => \{[\s\S]{0,300}if \(!entry\) \{[\s\S]{0,200}clearInterval\(stateTimer\)/.test(shell));
  assert('closeWindow clears the dock-sync timer',
    /if \(app === 'browser'\) \{\s*\r?\n\s*if \(dockTimer\) \{ clearInterval\(dockTimer\); dockTimer = null; \}\s*\r?\n\s*if \(stateTimer\) \{ clearInterval\(stateTimer\); stateTimer = null; \}/.test(shell));
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

    // Track live intervals by their period so unrelated timers cannot muddy
    // the count. The dock loop runs at 60 ms, the state poll at 1500 ms.
    await win.webContents.executeJavaScript(`(() => {
      window.__ivMs = new Map();
      const oi = window.setInterval.bind(window);
      const oc = window.clearInterval.bind(window);
      window.setInterval = function (fn, ms, ...a) { const id = oi(fn, ms, ...a); window.__ivMs.set(id, ms); return id; };
      window.clearInterval = function (id) { window.__ivMs.delete(id); return oc(id); };
      return true;
    })()`);
    const countOf = (ms) => win.webContents.executeJavaScript(
      `[...window.__ivMs.values()].filter((m) => m === ${ms}).length`);

    // The live webview browser starts no periodic timers — opening and
    // closing one must not leave any behind.
    await win.webContents.executeJavaScript(`window.dtmShellApps.open('browser')`);
    await wait(400);
    const browser60 = await countOf(60);
    const browser1500 = await countOf(1500);
    assert('the live webview browser starts no dock-sync interval',
      browser60 === 0, `60 ms intervals while the webview browser is open: ${browser60}`);
    assert('the live webview browser starts no state-poll interval',
      browser1500 === 0, `1500 ms intervals while the webview browser is open: ${browser1500}`);

    await win.webContents.executeJavaScript(`window.dtmShellApps.close('browser')`);
    await wait(250);
    const afterClose60 = await countOf(60);
    const afterClose1500 = await countOf(1500);
    assert('closing the webview browser leaves no 60 ms intervals',
      afterClose60 === 0, `60 ms intervals after close: ${afterClose60}`);
    assert('closing the webview browser leaves no 1500 ms intervals',
      afterClose1500 === 0, `1500 ms intervals after close: ${afterClose1500}`);
  } catch (error) {
    assert('browser timer suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    const summary = { passed: results.passed, failed: results.failed, tests: results.tests };
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.exit(results.failed ? 1 : 0);
  }
});
