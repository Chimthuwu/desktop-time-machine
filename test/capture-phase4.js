/**
 * Visual verification captures for the desktop authenticity work.
 * Run with: npx electron test/capture-phase4.js
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadSkin(win, id, delay) {
  await win.webContents.executeJavaScript(`localStorage.setItem('dtm_active_skin', ${JSON.stringify(id)})`);
  await win.webContents.reload();
  await wait(delay || 1800);
}

async function capture(win, name) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await win.webContents.executeJavaScript('document.body.offsetHeight');
      await wait(250);
      const image = await win.webContents.capturePage();
      fs.writeFileSync(path.join(OUT, name), image.toPNG());
      console.log('[capture]', name);
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await wait(400);
    }
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    show: true, width: 1280, height: 840,
    webPreferences: {
      preload: path.join(ROOT, 'electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });

  try {
    await win.loadFile(path.join(ROOT, 'src/index.html'));

    // --- Windows XP ---
    await loadSkin(win, 'windowsXP', 2200);
    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      doc.getElementById('start').click();
      doc.querySelector('#start-menu [data-app="editor"]').click();
      doc.getElementById('start').click();
      doc.querySelector('#start-menu [data-app="calculator"]').click();
      const wins = Array.from(doc.querySelectorAll('.win'));
      if (wins[0]) { wins[0].style.left = '610px'; wins[0].style.top = '120px'; }
      if (wins[1]) { wins[1].style.left = '120px'; wins[1].style.top = '160px'; }
    })()`);
    await wait(600);
    await capture(win, 'phase4-xp-desktop.png');

    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      doc.getElementById('start').click();
    })()`);
    await wait(400);
    await capture(win, 'phase4-xp-start.png');

    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      doc.querySelector('#start-menu [data-app="all-programs"]').click();
    })()`);
    await wait(400);
    await capture(win, 'phase4-xp-programs.png');

    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      doc.querySelector('#start').click();
      const desk = doc.getElementById('desktop');
      desk.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 700, clientY: 420 }));
    })()`);
    await wait(400);
    await capture(win, 'phase4-xp-context.png');

    // --- Mac OS X ---
    await loadSkin(win, 'macosx', 3000);
    await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      const boot = doc.getElementById('boot-screen');
      if (boot) boot.style.display = 'none';
      w.openApp('calculator');
      w.openApp('stickies');
      const calc = doc.querySelector('.window[data-app="calculator"]');
      const notes = doc.querySelector('.window[data-app="stickies"]');
      if (calc) { calc.style.left = '700px'; calc.style.top = '80px'; }
      if (notes) { notes.style.left = '170px'; notes.style.top = '120px'; }
    })()`);
    await wait(700);
    await capture(win, 'phase4-mac-desktop.png');

    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      doc.getElementById('mb-apple').click();
    })()`);
    await wait(400);
    await capture(win, 'phase4-mac-apple-menu.png');

    await win.webContents.executeJavaScript(`(async () => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      const apple = doc.getElementById('appleMenu');
      if (apple) apple.classList.remove('open');
      const finder = doc.querySelector('.window[data-app="finder"]');
      if (finder) finder.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const fileMenu = Array.from(doc.querySelectorAll('#mb-menus .mb-menu')).find((m) => m.textContent.trim().startsWith('File'));
      const title = fileMenu && fileMenu.querySelector('.mb-menu-title');
      if (title) title.click();
    })()`);
    await wait(400);
    await capture(win, 'phase4-mac-finder-menu.png');

    await win.webContents.executeJavaScript(`(async () => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      w.openApp('safari');
      await new Promise(r => setTimeout(r, 400));
      const add = doc.querySelector('.safari-tab-add');
      if (add) add.click();
      await new Promise(r => setTimeout(r, 800));
      if (add) add.click();
      await new Promise(r => setTimeout(r, 1200));
    })()`);
    await wait(500);
    await capture(win, 'phase4-mac-safari-tabs.png');

    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      const layer = doc.querySelector('.dtm-desktop-layer');
      layer.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 520, clientY: 480 }));
    })()`);
    await wait(400);
    await capture(win, 'phase4-mac-context.png');

    console.log('[capture] complete');
  } finally {
    win.close();
    app.quit();
  }
});
