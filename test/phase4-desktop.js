/**
 * Focused regression checks for desktop authenticity work:
 * shared window tracking, XP taskbar, platform-specific context menus,
 * Mac Dock state, Safari tabs and the XP wallpaper asset.
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const results = { passed: 0, failed: 0, tests: [] };
function assert(name, condition, detail) {
  if (condition) { results.passed++; results.tests.push({ name, status: 'PASS' }); }
  else { results.failed++; results.tests.push({ name, status: 'FAIL', detail }); }
}

async function loadSkin(win, id, delay) {
  await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', ${JSON.stringify(id)})`);
  await win.webContents.reload();
  await new Promise((r) => setTimeout(r, delay || 1600));
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  const win = new BrowserWindow({
    show: false, width: 1280, height: 840,
    webPreferences: {
      preload: path.join(ROOT, 'electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && !/Autoplay|ERR_/.test(message)) errors.push(message);
  });

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));
    await loadSkin(win, 'windowsXP', 1800);

    // --- XP wallpaper is a real raster asset ---
    const wallpaper = await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      return getComputedStyle(doc.getElementById('desktop')).backgroundImage;
    })()`);
    assert('XP uses the Bliss wallpaper asset', /bliss-wallpaper\.png/.test(wallpaper), wallpaper);
    assert('wallpaper asset exists on disk', fs.existsSync(path.join(ROOT, 'assets/bliss-wallpaper.png')));

    // --- XP taskbar tracks real windows ---
    const tracked = await win.webContents.executeJavaScript(`(async () => {
      const frame = document.getElementById('skin-viewport');
      const w = frame.contentWindow; const doc = w.document;
      doc.getElementById('start').click();
      doc.querySelector('#start-menu [data-app="editor"]').click();
      await new Promise(r => setTimeout(r, 600));
      const before = doc.querySelectorAll('#tasks .task').length;
      const first = doc.querySelector('#tasks .task');
      const title = first ? first.textContent : '';
      const icon = first ? !!first.querySelector('.task-icon') : false;
      doc.getElementById('start').click();
      doc.querySelector('#start-menu [data-app="calculator"]').click();
      await new Promise(r => setTimeout(r, 600));
      const after = doc.querySelectorAll('#tasks .task').length;
      first.click();
      await new Promise(r => setTimeout(r, 300));
      const minimizedStillListed = doc.querySelectorAll('#tasks .task').length;
      const minimizedState = !!doc.querySelector('#tasks .task.minimized');
      doc.querySelectorAll('#tasks .task')[1].click();
      await new Promise(r => setTimeout(r, 300));
      return { before, after, title, icon, minimizedStillListed, minimizedState };
    })()`);
    assert('XP taskbar gains a button for a new window', tracked.before >= 1, tracked);
    assert('taskbar button shows title and icon', tracked.title.length > 0 && tracked.icon, tracked);
    assert('multiple windows get separate buttons', tracked.after >= 2, tracked);
    assert('minimized windows remain represented', tracked.minimizedStillListed >= 1 && tracked.minimizedState, tracked);

    // --- Context menus are OS-specific ---
    await loadSkin(win, 'macosx', 2600);
    const macMenu = await win.webContents.executeJavaScript(`(async () => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      const layer = doc.querySelector('.dtm-desktop-layer');
      layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      await new Promise(r => setTimeout(r, 150));
      const menu = doc.querySelector('.dtm-context');
      const text = menu ? menu.textContent : '';
      if (menu) menu.remove();
      return text;
    })()`);
    assert('Mac context menu has no Windows terminal entries',
      !/Command Prompt Here|Windows Terminal/.test(macMenu), macMenu);
    assert('Mac context menu uses Mac terminology', /Get Info|New/.test(macMenu), macMenu);

    await loadSkin(win, 'windows95', 1600);
    const winMenu = await win.webContents.executeJavaScript(`(async () => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      const layer = doc.querySelector('.dtm-desktop-layer');
      layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      await new Promise(r => setTimeout(r, 150));
      const menu = doc.querySelector('.dtm-context');
      const text = menu ? menu.textContent : '';
      if (menu) menu.remove();
      return text;
    })()`);
    assert('Windows context menu keeps Command Prompt Here', /Command Prompt Here/.test(winMenu), winMenu);

    // --- Safari tabs use the shared browser engine ---
    await loadSkin(win, 'macosx', 2600);
    const tabs = await win.webContents.executeJavaScript(`(async () => {
      const frame = document.getElementById('skin-viewport');
      const w = frame.contentWindow; const doc = w.document;
      w.openApp('safari');
      await new Promise(r => setTimeout(r, 300));
      doc.querySelector('.safari-tab-add').click();
      await new Promise(r => setTimeout(r, 700));
      doc.querySelector('.safari-tab-add').click();
      await new Promise(r => setTimeout(r, 1200));
      const initial = doc.querySelectorAll('.safari-tab').length;
      const webviews = document.querySelectorAll('#shell-app-layer .dtmshell-safari-web webview').length;
      const active = doc.querySelectorAll('.safari-tab.active').length;
      if (initial > 1) doc.querySelector('.safari-tab:not(.active) .safari-tab-close').click();
      await new Promise(r => setTimeout(r, 600));
      const afterClose = doc.querySelectorAll('.safari-tab').length;
      return { initial, webviews, active, afterClose };
    })()`);
    assert('Safari shows multiple tabs', tabs.initial >= 2, tabs);
    assert('each tab has a real webview', tabs.webviews >= 2, tabs);
    assert('active tab is indicated', tabs.active === 1, tabs);
    assert('closing a tab works', tabs.afterClose === tabs.initial - 1, tabs);

    assert('no unexpected console errors', errors.length === 0, errors);
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'suite error', status: 'FAIL', detail: e.stack || e.message });
  }

  console.log('=== DESKTOP AUTHENTICITY TEST ===');
  console.log(JSON.stringify(results, null, 2));
  win.close();
  app.quit();
});
