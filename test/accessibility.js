/** Regression checks: static accessibility invariants and the shell's alert region. */
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

function sourceFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.(html|js)$/.test(entry.name)) found.push(full);
  }
  return found;
}

function staticChecks() {
  const shell = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
  const untitled = [];
  for (const file of sourceFiles(path.join(ROOT, 'src'))) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/<iframe\b[^>]*>/g)) {
      if (!/\btitle=/.test(match[0])) untitled.push(path.relative(ROOT, file));
    }
  }
  assert('every iframe in src has a title', untitled.length === 0, untitled.join(', '));
  assert('startup failure overlay is an alert region',
    /setAttribute\('role', 'alert'\)/.test(shell) && /aria-live="assertive"/.test(shell));

  const win98 = fs.readFileSync(path.join(ROOT, 'src/skins/windows98/desktop.html'), 'utf8');
  const requiredLabels = [
    'Recipient', 'Sender', 'Screen area', 'Read-ahead optimization',
    'Low memory allocation', 'Reserved memory in kilobytes',
    'MS-DOS command', 'Folder address', 'Web address', 'Screen saver wait in minutes'
  ];
  const missing = requiredLabels.filter((label) => !win98.includes(`aria-label="${label}"`));
  assert('Win98 unpaired controls have accessible names', missing.length === 0, missing.join(', '));
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

    const viewportTitle = await win.webContents.executeJavaScript(
      `document.querySelector('#skin-viewport')?.getAttribute('title') || ''`);
    assert('skin viewport exposes an accessible title', !!viewportTitle, viewportTitle);

    const alert = await win.webContents.executeJavaScript(`(() => {
      window.showStartupFailure('accessibility regression check');
      const overlay = document.getElementById('dtmStartupFailure');
      const detail = document.getElementById('dtmStartupFailureDetail');
      const result = {
        role: overlay && overlay.getAttribute('role'),
        live: detail && detail.getAttribute('aria-live'),
        message: detail && detail.textContent
      };
      if (overlay) overlay.remove();
      return result;
    })()`);
    assert('startup failure announces via role=alert', alert.role === 'alert', JSON.stringify(alert));
    assert('startup failure detail is an assertive live region', alert.live === 'assertive', JSON.stringify(alert));
    assert('startup failure detail carries the message', alert.message === 'accessibility regression check', JSON.stringify(alert));
  } catch (error) {
    assert('accessibility suite runs without exception', false, error && error.stack ? error.stack : String(error));
  } finally {
    const summary = { passed: results.passed, failed: results.failed, tests: results.tests };
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = results.failed ? 1 : 0;
    app.exit(results.failed ? 1 : 0);
  }
});
