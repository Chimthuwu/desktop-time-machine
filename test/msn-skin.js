/** Regression checks: msnmessenger skin registration and Discord chrome per skin. */
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, webPreferences: {
    preload: path.join(ROOT, 'electron/preload/index.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true
  } });

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', 'msnmessenger')`);
    await win.webContents.reload();
    await wait(2200);

    const info = await win.webContents.executeJavaScript(`(() => {
      const m = window.dtmSkinManager;
      const s = m && m.skins && m.skins.get ? m.skins.get('msnmessenger') : null;
      return {
        registered: !!s,
        entry: s ? s.entry : null,
        current: m && m.getCurrentSkin ? m.getCurrentSkin().id : null,
        hasShell: !!window.dtmShellApps
      };
    })()`);
    assert('msnmessenger is registered', info.registered, JSON.stringify(info));
    assert('msnmessenger is the active skin', info.current === 'msnmessenger', JSON.stringify(info));
    assert('shell app API is exposed', info.hasShell, JSON.stringify(info));

    // Discord under MSN gets the msn chrome.
    await win.webContents.executeJavaScript(`window.dtmShellApps.open('discord')`);
    await wait(300);
    const msnChrome = await win.webContents.executeJavaScript(`(() => {
      const w = document.querySelector('#shell-app-layer .dtmshell-win');
      return {
        winMsn: !!(w && w.classList.contains('msn')),
        titleMsn: !!(w && w.querySelector('.dtmshell-title.msn'))
      };
    })()`);
    assert('Discord window uses msn chrome under MSN skin', msnChrome.winMsn && msnChrome.titleMsn, JSON.stringify(msnChrome));

    // Switching to Mac OS X must close the MSN-chrome Discord window.
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('macosx')`);
    await wait(2500);
    const closedOnMac = await win.webContents.executeJavaScript(`!window.dtmShellApps.isOpen('discord')`);
    assert('Discord window closes when chrome flavour changes to Mac', closedOnMac === true);

    // Reopening under Mac OS X uses Aqua chrome, not msn chrome.
    await win.webContents.executeJavaScript(`window.dtmShellApps.open('discord')`);
    await wait(300);
    const macChrome = await win.webContents.executeJavaScript(`(() => {
      const w = document.querySelector('#shell-app-layer .dtmshell-win');
      return { mac: !!(w && w.classList.contains('mac')), msn: !!(w && w.classList.contains('msn')) };
    })()`);
    assert('Discord window uses Aqua chrome under Mac OS X', macChrome.mac && !macChrome.msn, JSON.stringify(macChrome));
    await win.webContents.executeJavaScript(`window.dtmShellApps.close('discord')`);
  } catch (error) {
    assert('msn skin suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    const summary = { passed: results.passed, failed: results.failed, tests: results.tests };
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.exit(results.failed ? 1 : 0);
  }
});
