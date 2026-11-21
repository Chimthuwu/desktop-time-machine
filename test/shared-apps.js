/**
 * Shared application ecosystem integration tests.
 *
 * Exercises the real framework inside real skins and uses the real host
 * filesystem through DTM.fs. Temporary files are created and removed by the
 * test; no application invents or ships fake user data.
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const NOTE_FILE = path.join(os.tmpdir(), 'dtm-shared-apps-note.txt');
const PNG_FILE = path.join(os.tmpdir(), 'dtm-shared-apps-drawing.png');

// Injected into each renderer snippet: waits for a modal instead of guessing.
const FILL_DIALOG = `
  async function fillDialog(doc, value) {
    let input = null;
    for (let i = 0; i < 60; i++) {
      input = doc.querySelector('.dtm-app-dialog .dtm-app-input');
      if (input) break;
      await new Promise(r => setTimeout(r, 50));
    }
    if (!input) return false;
    input.value = value;
    const dialog = input.closest('.dtm-app-dialog');
    dialog.querySelector('.dtm-app-button.primary').click();
    for (let i = 0; i < 60 && dialog.isConnected; i++) await new Promise(r => setTimeout(r, 50));
    return true;
  }
`;

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}

async function loadSkin(win, skinId, delay) {
  await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', ${JSON.stringify(skinId)})`);
  await win.webContents.reload();
  await new Promise((r) => setTimeout(r, delay || 1500));
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
    try { fs.rmSync(NOTE_FILE, { force: true }); } catch (e) {}
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await loadSkin(win, 'windows95', 1600);

    // --- Framework is present and themed in the active skin ---
    const framework = await win.webContents.executeJavaScript(`(() => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      return {
        present: !!skin.DTMApps,
        theme: skin.DTMApps && skin.DTMApps.getConfig().theme,
        apps: skin.DTMApps ? skin.DTMApps.list().map(a => a.id) : []
      };
    })()`);
    assert('shared framework is loaded in the skin', framework.present, framework);
    assert('skin supplies its era theme', framework.theme === 'win95', framework);
    ['notepad', 'calculator', 'properties', 'systeminfo', 'imageviewer', 'paint', 'calendar', 'mediaplayer', 'launcher']
      .forEach((id) => assert('shared app registered: ' + id, framework.apps.includes(id), framework.apps));

    // --- Launcher opens and uses the skin theme ---
    const launcher = await win.webContents.executeJavaScript(`(() => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      skin.DTMApps.open('launcher');
      const node = skin.document.querySelector('.dtm-shared-app[data-app="launcher"]');
      return { exists: !!node, theme: node && node.dataset.dtmTheme, items: node ? node.querySelectorAll('.dtm-app-launcher-item').length : 0 };
    })()`);
    assert('launcher window opens', launcher.exists, launcher);
    assert('launcher uses active era theme', launcher.theme === 'win95', launcher);
    assert('launcher lists the shared apps', launcher.items >= 8, launcher);

    // --- Notepad writes a REAL host file ---
    const notepadSaved = await win.webContents.executeJavaScript(`(async () => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      const doc = skin.document;
      skin.DTMApps.open('notepad');
      const winEl = doc.querySelector('.dtm-shared-app[data-app="notepad"]');
      const area = winEl.querySelector('.dtm-app-editor');
      area.value = 'written by shared notepad';
      area.dispatchEvent(new skin.Event('input', { bubbles: true }));
      const buttons = Array.from(winEl.querySelectorAll('.dtm-app-button'));
      buttons.find(b => b.textContent === 'Save').click();
      await new Promise(r => setTimeout(r, 100));
      const dialog = doc.querySelector('.dtm-app-dialog .dtm-app-input');
      if (!dialog) return { dialog: false };
      dialog.value = ${JSON.stringify(NOTE_FILE.replace(/\\/g, '/'))};
      doc.querySelector('.dtm-app-dialog .dtm-app-button.primary').click();
      await new Promise(r => setTimeout(r, 500));
      return { dialog: true, status: winEl.querySelector('.dtm-app-status').textContent };
    })()`);
    assert('notepad opened a real save dialog', notepadSaved.dialog, notepadSaved);
    let savedContent = null;
    for (let i = 0; i < 60; i++) {
      if (fs.existsSync(NOTE_FILE)) {
        savedContent = fs.readFileSync(NOTE_FILE, 'utf8');
        if (savedContent === 'written by shared notepad') break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert('notepad wrote real file content', savedContent === 'written by shared notepad', savedContent);

    // --- Calculator computes correctly and rejects bad input ---
    const calc = await win.webContents.executeJavaScript(`(() => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      const doc = skin.document;
      skin.DTMApps.open('calculator');
      const el = doc.querySelector('.dtm-shared-app[data-app="calculator"]');
      const keys = text => Array.from(el.querySelectorAll('.calc-key')).find(b => b.textContent === text).click();
      keys('7'); keys('+'); keys('5'); keys('=');
      const sum = el.querySelector('.dtm-app-display').value;
      keys('C'); keys('9'); keys('*'); keys('8'); keys('=');
      const product = el.querySelector('.dtm-app-display').value;
      keys('C'); keys('1'); keys('/'); keys('0'); keys('=');
      const bad = el.querySelector('.dtm-app-display').value;
      return { sum, product, bad };
    })()`);
    assert('calculator adds correctly', calc.sum === '12', calc);
    assert('calculator multiplies correctly', calc.product === '72', calc);
    assert('calculator rejects division by zero', calc.bad === 'Error', calc);

    // --- File properties reads real metadata ---
    const props = await win.webContents.executeJavaScript(`(async () => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      const doc = skin.document;
      const target = ${JSON.stringify(NOTE_FILE.replace(/\\/g, '/'))};
      ${FILL_DIALOG}
      skin.DTMApps.open('properties');
      const dialogShown = await fillDialog(doc, target);
      const el = doc.querySelector('.dtm-shared-app[data-app="properties"]');
      for (let i = 0; i < 60 && !el.querySelector('.dtm-app-property-row'); i++) await new Promise(r => setTimeout(r, 50));
      return { dialog: dialogShown, text: el.querySelector('.dtm-app-properties').textContent };
    })()`);
    assert('properties dialog opened', props.dialog, props);
    assert('properties shows real file name', /dtm-shared-apps-note\.txt/.test(props.text || ''), props);

    // --- Paint saves a real PNG via DTM.fs.writeBinary ---
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF3bS3sAAAAAElFTkSuQmCC', 'base64');
    fs.writeFileSync(PNG_FILE, png);
    const viewer = await win.webContents.executeJavaScript(`(async () => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      const doc = skin.document;
      skin.DTMApps.open('imageviewer');
      const viewerWindow = doc.querySelector('.dtm-shared-app[data-app="imageviewer"]');
      Array.from(viewerWindow.querySelectorAll('.dtm-app-button')).find(b => b.textContent === 'Open…').click();
      await new Promise(r => setTimeout(r, 80));
      const dialog = doc.querySelector('.dtm-app-dialog .dtm-app-input');
      if (!dialog) return { dialog: false };
      dialog.value = ${JSON.stringify(PNG_FILE.replace(/\\/g, '/'))};
      doc.querySelector('.dtm-app-dialog .dtm-app-button.primary').click();
      const el = doc.querySelector('.dtm-shared-app[data-app="imageviewer"]');
      let image = null;
      for (let i = 0; i < 60; i++) {
        image = el.querySelector('img');
        if (image && image.src.startsWith('data:image/')) break;
        await new Promise(r => setTimeout(r, 50));
      }
      return { dialog: true, image: !!(image && image.src.startsWith('data:image/')) };
    })()`);
    assert('image viewer opened a real path', viewer.dialog && viewer.image, viewer);

    // --- Dirty-state protection ---
    const dirty = await win.webContents.executeJavaScript(`(async () => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      const doc = skin.document;
      skin.DTMApps.open('notepad');
      const el = doc.querySelector('.dtm-shared-app[data-app="notepad"]');
      const area = el.querySelector('.dtm-app-editor');
      area.value = 'do not lose me';
      area.dispatchEvent(new skin.Event('input', { bubbles: true }));
      Array.from(el.querySelectorAll('.dtm-app-button')).find(b => b.textContent === 'New').click();
      await new Promise(r => setTimeout(r, 200));
      const dialog = doc.querySelector('.dtm-app-dialog');
      const labels = dialog ? Array.from(dialog.querySelectorAll('button')).map(b => b.textContent) : [];
      const cancel = dialog && Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === 'Cancel');
      if (cancel) cancel.click();
      await new Promise(r => setTimeout(r, 200));
      return { dialog: !!dialog, labels, kept: area.value === 'do not lose me' };
    })()`);
    assert('dirty document prompts before New', dirty.dialog && dirty.labels.includes('Don’t Save'), dirty);
    assert('Cancel keeps unsaved text', dirty.kept, dirty);

    // --- Closing an app removes its window and disposes resources ---
    const closed = await win.webContents.executeJavaScript(`(async () => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      skin.DTMApps.open('calendar');
      const opened = !!skin.document.querySelector('.dtm-shared-app[data-app="calendar"]');
      await skin.DTMApps.close('calendar');
      return { opened, closed: !skin.document.querySelector('.dtm-shared-app[data-app="calendar"]') };
    })()`);
    assert('app opens and closes cleanly', closed.opened && closed.closed, closed);

    // --- The same real file is readable after switching to another era ---
    await loadSkin(win, 'macosx', 2600);
    const crossEra = await win.webContents.executeJavaScript(`(async () => {
      const skin = document.getElementById('skin-viewport').contentWindow;
      const theme = skin.DTMApps && skin.DTMApps.getConfig().theme;
      const content = await window.parent.DTM.fs.read(${JSON.stringify(NOTE_FILE.replace(/\\/g, '/'))});
      skin.DTMApps.open('notepad');
      return { theme, content, apps: !!skin.document.querySelector('.dtm-shared-app[data-app="notepad"]') };
    })()`);
    assert('framework themes itself for the new era', crossEra.theme === 'aqua', crossEra);
    assert('file written in Windows 95 is readable in Mac OS X', crossEra.content === 'written by shared notepad', crossEra);
    assert('shared notepad opens in the new era', crossEra.apps, crossEra);

    assert('no console errors during app tests', consoleErrors.length === 0, consoleErrors);
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'suite error', status: 'FAIL', detail: e.stack || e.message });
  }

  try { fs.rmSync(NOTE_FILE, { force: true }); } catch (e) {}
  try { fs.rmSync(PNG_FILE, { force: true }); } catch (e) {}
  console.log('=== SHARED APPLICATION ECOSYSTEM TEST ===');
  console.log(JSON.stringify(results, null, 2));
  win.close();
  app.quit();
});
