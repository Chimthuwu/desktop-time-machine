/** Regression checks: Windows 98 folders open in its own Explorer, and Command Prompt here opens MS-DOS Prompt. */
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const fs = require('fs');
const os = require('os');
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
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'dtm-w98-'));
  const folder = path.join(work, 'Cartoons');
  fs.mkdirSync(folder);
  fs.writeFileSync(path.join(folder, 'toon.txt'), 'x');

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', 'windows98')`);
    await win.webContents.reload();
    await wait(2200);

    const hooks = await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      return { folder: typeof w.dtmOpenFolder, prompt: typeof w.dtmOpenCommandPrompt };
    })()`);
    assert('Windows 98 exposes the folder and Command Prompt hooks', hooks.folder === 'function' && hooks.prompt === 'function', JSON.stringify(hooks));

    // Double-clicking a folder opens the skin's own Explorer at that folder.
    const explorer = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      w.dtmOpenFolder(${JSON.stringify(folder)});
      await new Promise((r) => setTimeout(r, 900));
      const win = w.document.querySelector('.window[data-app="explorer"]:last-of-type') || w.document.querySelector('.window[data-app="explorer"]');
      const addr = w.document.querySelector('#exp-path');
      return { exists: !!win, addr: addr ? addr.value : null, items: w.document.querySelectorAll('.explorer-item').length };
    })()`);
    assert('folder opens an in-skin Explorer window', explorer.exists === true, JSON.stringify(explorer));
    assert('the Explorer shows the folder path', typeof explorer.addr === 'string' && explorer.addr.toLowerCase().includes('cartoons'), JSON.stringify(explorer));

    // Command Prompt here opens the MS-DOS Prompt in that folder.
    const dos = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      w.dtmOpenCommandPrompt(${JSON.stringify(folder)});
      await new Promise((r) => setTimeout(r, 700));
      const win = w.document.querySelector('.window[data-app="msdos"]');
      const input = w.document.querySelector('#termInput');
      const prompt = w.document.querySelector('#termPrompt');
      return { exists: !!win, hasInput: !!input, prompt: prompt ? prompt.textContent : null };
    })()`);
    assert('Command Prompt here opens the MS-DOS Prompt window', dos.exists === true, JSON.stringify(dos));
    assert('MS-DOS Prompt has a command line', dos.hasInput === true, JSON.stringify(dos));
    assert('MS-DOS Prompt starts in the chosen folder', typeof dos.prompt === 'string' && dos.prompt.toLowerCase().includes('cartoons'), JSON.stringify(dos));
  } catch (error) {
    assert('win98 folder and prompt suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {}
    console.log(JSON.stringify({ passed: results.passed, failed: results.failed, tests: results.tests }, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.quit();
  }
});
