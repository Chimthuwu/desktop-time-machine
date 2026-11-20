/**
 * Capture polished gallery screenshots of the headline skins:
 * Windows 95, Windows XP and Mac OS X.
 *
 * Run with: npm run screenshots
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const ROOT = path.join(__dirname, '..');
const SCREENSHOTS_DIR = path.join(ROOT, 'screenshots');
const INDEX = path.join(ROOT, 'src/index.html');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadSkin(win, skinId, readyCheck, settleMs = 700) {
  await win.webContents.executeJavaScript(
    `localStorage.setItem('dtm_active_skin', ${JSON.stringify(skinId)})`
  );
  await win.webContents.reloadIgnoringCache();
  await win.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame && frame.contentWindow && frame.contentWindow.document;
        const mirrorReady = doc && !doc.querySelector('.dtm-desktop-layer .dtm-loading');
        if (doc && ${readyCheck} && mirrorReady || Date.now() - started > 12000) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    })
  `);
  await wait(settleMs);
}

async function capture(win, filename) {
  const target = path.join(SCREENSHOTS_DIR, filename);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      // Force a compositor frame before capturing; Chromium can otherwise
      // hand back a stale frame after the skin swaps.
      await win.webContents.executeJavaScript('document.body.offsetHeight');
      await wait(250);
      const image = await win.webContents.capturePage();
      fs.writeFileSync(target, image.toPNG());
      console.log('[gallery] wrote', path.relative(ROOT, target));
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`[gallery] capture retry ${attempt}: ${error.message}`);
      await wait(500);
    }
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const win = new BrowserWindow({
    show: true,
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
    await win.loadFile(INDEX);
    await wait(600);

    // --- Windows 95: classic teal desktop with a couple of era apps open ---
    // The wallpaper is persisted; force the iconic solid teal for the shot.
    await win.webContents.executeJavaScript(
      "localStorage.setItem('dtm.wallpaper.windows95', 'teal')"
    );
    await loadSkin(
      win,
      'windows95',
      `frame.contentWindow.document.getElementById('startBtn')`
    );
    const win95Apps = await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      const about = doc.querySelector('.window[data-app="about"]');
      if (about) about.remove();
      if (typeof w.openApp !== 'function') return { error: 'openApp unavailable' };
      w.openApp('notepad');
      w.openApp('minesweeper');
      const mines = doc.querySelector('.window[data-app="minesweeper"]');
      const notepad = doc.querySelector('.window[data-app="notepad"]');
      if (mines) { mines.style.left = '90px'; mines.style.top = '130px'; }
      if (notepad) { notepad.style.left = '560px'; notepad.style.top = '170px'; }
      return { notepad: !!notepad, minesweeper: !!mines };
    })()`);
    console.log('[gallery] win95 apps:', win95Apps);
    await wait(700);
    await capture(win, 'gallery-win95.png');

    // --- Windows XP: the Luna desktop with its iconic two-column Start menu ---
    await loadSkin(
      win,
      'windowsXP',
      `frame.contentWindow.document.getElementById('start')`,
      900
    );
    await win.webContents.executeJavaScript(`(() => {
      const doc = document.getElementById('skin-viewport').contentWindow.document;
      doc.getElementById('start').click();
    })()`);
    await wait(400);
    await capture(win, 'gallery-winxp.png');

    // --- Mac OS X: Aqua desktop with Finder and Calculator ---
    await loadSkin(
      win,
      'macosx',
      `frame.contentWindow.document.getElementById('boot-screen') && frame.contentWindow.document.getElementById('dock')`,
      2200
    );
    await win.webContents.executeJavaScript(`(() => {
      const w = document.getElementById('skin-viewport').contentWindow;
      const doc = w.document;
      const boot = doc.getElementById('boot-screen');
      if (boot) boot.style.display = 'none';
      const finder = doc.querySelector('.window[data-app="finder"]');
      if (finder) finder.remove();
      w.openApp('stickies');
      w.openApp('calculator');
      const calc = doc.querySelector('.window[data-app="calculator"]');
      const stickies = doc.querySelector('.window[data-app="stickies"]');
      if (calc) { calc.style.left = '120px'; calc.style.top = '110px'; }
      if (stickies) { stickies.style.left = '480px'; stickies.style.top = '150px'; }
    })()`);
    await wait(500);
    await capture(win, 'gallery-macosx.png');

    console.log('[gallery] complete');
  } finally {
    win.close();
    app.quit();
  }
});
