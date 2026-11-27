/** Focused regression checks for the latest user-reported fixes. */
const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const NOTE = path.join(os.tmpdir(), 'dtm-user-fixes-note.txt');
const results = { passed: 0, failed: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}
async function loadSkin(win, id, delay) {
  await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', ${JSON.stringify(id)})`);
  await win.webContents.reload();
  await new Promise((r) => setTimeout(r, delay || 1800));
}
const FILL = `
async function fillPrompt(doc, value) {
  for (let i = 0; i < 60; i++) {
    const input = doc.querySelector('.dtm-modal-overlay input, .sheet-overlay input, .dtm-app-dialog .dtm-app-input');
    if (input) {
      input.value = value;
      const root = input.closest('.dtm-modal-overlay, .sheet-overlay, .dtm-app-dialog');
      const ok = root.querySelector('.hostprompt-ok') || root.querySelector('button:last-child');
      if (ok) ok.click();
      return true;
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}
`;

app.whenReady().then(async () => {
  registerIpcHandlers();
  try { fs.rmSync(NOTE, { force: true }); } catch (e) {}
  const win = new BrowserWindow({ show: false, width: 1280, height: 840, webPreferences: {
    preload: path.join(ROOT, 'electron/preload/index.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true
  } });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && !/Autoplay|ERR_/.test(message)) errors.push(message);
  });

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));

    // --- XP user + start menu ---
    await loadSkin(win, 'windowsXP', 2000);
    const xp = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      await new Promise(r => setTimeout(r, 300));
      return {
        user: doc.getElementById('xpUser').textContent,
        flyout: !!doc.querySelector('.programs-flyout [data-shared-app="notepad"]'),
        wallpaper: getComputedStyle(doc.getElementById('desktop')).backgroundImage
      };
    })()`);
    assert('XP Start menu shows the real Windows user', xp.user === os.userInfo().username, xp);
    assert('XP All Programs flyout exists', xp.flyout, xp);
    assert('XP uses the supplied Bliss wallpaper', /bliss-wallpaper\.jpg/.test(xp.wallpaper), xp.wallpaper);

    // --- mac OS 8: running indicators, recycle helpers, SimpleText save ---
    await loadSkin(win, 'macos8', 1800);
    const mac8 = await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      w.postMessage({ type: 'dtm:windows-state', windows: [{ id: 'x1', app: 'notepad', title: 'Test', icon: '📝', active: false, minimized: false }] }, '*');
      return { strip: !!doc.getElementById('csRunning'), recycle: typeof w.recycleSelected === 'function', trashRender: typeof w.renderTrashWindow === 'function', simpleTextSave: !!doc.querySelector('.window[data-app="simpletext"] .st-save') };
    })()`);
    await new Promise((r) => setTimeout(r, 200));
    const dot = await win.webContents.executeJavaScript(`document.getElementById('skin-viewport').contentDocument.querySelectorAll('#csRunning .cs-running-item').length`);
    assert('Mac OS 8 has a running-app strip', mac8.strip && dot >= 1, { mac8, dot });
    assert('Mac OS 8 exposes real recycle helpers', mac8.recycle && mac8.trashRender, mac8);

    const simpleText = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      w.openApp('simpletext');
      const winEl = doc.querySelector('.window[data-app="simpletext"]');
      ${FILL}
      winEl.querySelector('.st-save').click();
      const filled = await fillPrompt(doc, ${JSON.stringify(NOTE.replace(/\\/g, '/'))});
      await new Promise(r => setTimeout(r, 600));
      return { filled, status: winEl.querySelector('.st-status').textContent };
    })()`);
    const content = fs.existsSync(NOTE) ? fs.readFileSync(NOTE, 'utf8') : null;
    assert('Mac OS 8 SimpleText saves a real file', simpleText.filled && typeof content === 'string', { simpleText, content });

    // --- Shell browser tabs keep independent webviews ---
    await win.webContents.executeJavaScript(`window.dtmShellApps.open('browser','https://www.google.com/')`);
    await new Promise((r) => setTimeout(r, 800));
    const browserTabs = await win.webContents.executeJavaScript(`(async () => {
      const doc = document;
      const first = doc.querySelector('.dtmshell-win .dtmshell-tab-new');
      if (first) first.click();
      await new Promise(r => setTimeout(r, 900));
      const webviews = doc.querySelectorAll('.dtmshell-webviews webview');
      const tabs = doc.querySelectorAll('.dtmshell-win .dtmshell-tab');
      const displayed = Array.from(webviews).filter(v => v.style.display !== 'none').length;
      return { webviews: webviews.length, tabs: tabs.length, displayed };
    })()`);
    assert('shell browser creates one webview per tab', browserTabs.webviews >= 2, browserTabs);
    assert('only one tab webview is visible', browserTabs.displayed === 1, browserTabs);
    await win.webContents.executeJavaScript(`window.dtmShellApps.close('browser')`);

    // --- macOS Ctrl+F5 ---
    await loadSkin(win, 'macosx', 2800);
    const fsKey = await win.webContents.executeJavaScript(`(() => {
      const patchWindow = document.getElementById('skin-viewport').contentWindow;
      const event = new patchWindow.KeyboardEvent('keydown', { key: 'F5', ctrlKey: true, bubbles: true, cancelable: true });
      patchWindow.document.dispatchEvent(event);
      return event.defaultPrevented;
    })()`);
    assert('Ctrl+F5 works in Mac OS X', fsKey, fsKey);

    // --- Real host taskbar state in XP and Mac OS X ---
    await loadSkin(win, 'windowsXP', 2000);
    const xpHost = await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      w.DTMRealTaskbar.emit({
        pinned: [{ name: 'Calc', path: 'C:\\\\Windows\\\\System32\\\\calc.exe', icon: 'data:image/png;base64,AA==' }],
        windows: [{ pid: 42, title: 'Notepad - real', processName: 'notepad.exe', icon: 'data:image/png;base64,AA==' }],
        tray: [{ name: 'Volume', icon: 'data:image/png;base64,AA==' }]
      });
      return {
        pinned: doc.querySelectorAll('#realPinned .real-pin').length,
        task: doc.querySelectorAll('#tasks .real-task').length,
        taskTitle: (doc.querySelector('#tasks .real-task') || {}).title || '',
        tray: doc.querySelectorAll('#realTray .real-tray-item').length
      };
    })()`);
    assert('XP mirrors real pinned apps', xpHost.pinned === 1, xpHost);
    assert('XP mirrors real running windows', xpHost.task === 1 && /real/.test(xpHost.taskTitle), xpHost);
    assert('XP mirrors real tray items', xpHost.tray === 1, xpHost);

    await loadSkin(win, 'macosx', 2800);
    const macHost = await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      w.DTMRealTaskbar.emit({
        pinned: [],
        windows: [{ pid: 7, title: 'Word - real', processName: 'WINWORD.EXE', icon: 'data:image/png;base64,AA==' }],
        tray: [{ name: 'Volume', icon: 'data:image/png;base64,AA==' }]
      });
      const icons = Array.from(doc.querySelectorAll('#dock .dock-icon'));
      return {
        hostDock: doc.querySelectorAll('#dock .dock-host-app').length,
        tray: doc.querySelectorAll('#mb-extra .mb-tray-item').length,
        emptyTitles: icons.filter((i) => !i.title).length,
        aboutIcon: (w.macOSApps && w.macOSApps.about && w.macOSApps.about.icon) || ''
      };
    })()`);
    assert('Mac Dock mirrors real windows', macHost.hostDock >= 1, macHost);
    assert('Mac menu bar mirrors real tray items', macHost.tray === 1, macHost);
    assert('every Dock icon has a label', macHost.emptyTitles === 0, macHost);
    assert('About This Mac has a visible icon', macHost.aboutIcon === '🍎', macHost);

    // --- Ctrl+F5 in remaining skins ---
    for (const skin of ['amiga-workbench', 'beos', 'templeos']) {
      await loadSkin(win, skin, 1600);
      const handled = await win.webContents.executeJavaScript(`(() => {
        const w = document.getElementById('skin-viewport').contentWindow;
        const event = new w.KeyboardEvent('keydown', { key: 'F5', ctrlKey: true, bubbles: true, cancelable: true });
        w.document.dispatchEvent(event);
        return event.defaultPrevented;
      })()`);
      assert('Ctrl+F5 handled in ' + skin, handled, handled);
    }

    // --- Account picture API ---
    const picture = await win.webContents.executeJavaScript(`(async () => {
      const engine = window.DTM;
      const value = await engine.system.getAccountPicture();
      return { type: typeof value, prefix: typeof value === 'string' ? value.slice(0, 22) : '' };
    })()`);
    assert('account picture API resolves', picture.type === 'string' || picture.type === 'object', picture);
    if (picture.type === 'string') assert('account picture is a data URL', /^data:image\//.test(picture.prefix), picture);

    // --- Mac Dock artwork ---
    await loadSkin(win, 'macosx', 2800);
    const dockArt = await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentDocument;
      const icons = Array.from(doc.querySelectorAll('#dock .dock-icon'));
      const withArt = icons.filter((icon) => icon.querySelector('.dock-glyph img'));
      return { total: icons.length, art: withArt.length, sources: withArt.slice(0, 4).map((i) => i.querySelector('img').getAttribute('src')) };
    })()`);
    assert('Dock uses real icon artwork', dockArt.art >= 10, dockArt);
    assert('Dock artwork files are SVG assets', dockArt.sources.every((src) => /assets\/dock\/.*\.svg$/.test(src)), dockArt);

    // --- Win98 Control Panel entries are functional ---
    await loadSkin(win, 'windows98', 1800);
    const w98 = await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      w.openApp('control');
      const panel = doc.querySelector('.window[data-app="control"]');
      const items = panel ? Array.from(panel.querySelectorAll('.computer-item')).map((n) => n.textContent) : [];
      const fake = items.filter((label) => /Mouse|Keyboard|Modem|Accessibility|Regional|Power/.test(label));
      w.openApp('sys-info');
      const info = doc.querySelector('.window[data-app="sys-info"]');
      return { count: items.length, fake: fake.length, hasSharedButton: !!info && !!info.querySelector('[onclick*="systeminfo"]') };
    })()`);
    assert('Win98 Control Panel has no placeholder applets', w98.fake === 0, w98);
    assert('Win98 Control Panel entries launch real capabilities', w98.hasSharedButton, w98);

    assert('no unexpected console errors', errors.length === 0, errors);
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'suite error', status: 'FAIL', detail: e.stack || e.message });
  }

  try { fs.rmSync(NOTE, { force: true }); } catch (e) {}
  console.log('=== USER FIXES TEST ===');
  console.log(JSON.stringify(results, null, 2));
  win.close();
  app.exit(results.failed ? 1 : 0);
});
