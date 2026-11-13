/**
 * Visual Audit & Repeated Switching Test for Desktop Time Machine
 * Captures pixel-perfect screenshots of both retro desktop environments and the Era Switcher.
 */

const { app, BrowserWindow } = require('electron');

// Keep test runs silent (user request: app must stay muted).
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

app.whenReady().then(async () => {
  await ensureDir(SCREENSHOTS_DIR);
  registerIpcHandlers();

  const win = new BrowserWindow({
    show: true, // Visible window ensures Chromium compositor renders every frame update
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  
  // Wait for initial skin iframe to be fully ready
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        const frame = document.getElementById('skin-viewport');
        if (frame && frame.contentWindow && typeof frame.contentWindow.openApp === 'function') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    })
  `);
  await new Promise(r => setTimeout(r, 800));

  console.log('[Audit] Taking Screenshot 1: Windows 95 Desktop...');
  // Close the initial about box so screenshot 1 shows clean desktop
  await win.webContents.executeJavaScript(`
    (() => {
      const frame = document.getElementById('skin-viewport');
      const aboutWin = frame.contentWindow.document.querySelector('.window[data-app="about"]');
      if (aboutWin) aboutWin.remove();
    })()
  `);
  await new Promise(r => setTimeout(r, 400));
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '01-win95-desktop.png'), img1.toPNG());

  console.log('[Audit] Opening Win95 Apps (Notepad & Minesweeper)...');
  const w95AppCheck = await win.webContents.executeJavaScript(`
    (() => {
      const frame = document.getElementById('skin-viewport');
      frame.contentWindow.openApp('notepad');
      frame.contentWindow.openApp('minesweeper');
      const doc = frame.contentWindow.document;
      return {
        notepad: !!doc.querySelector('.window[data-app="notepad"]'),
        minesweeper: !!doc.querySelector('.window[data-app="minesweeper"]')
      };
    })()
  `);
  console.log('[Audit] Win95 Apps Open Status:', w95AppCheck);
  await new Promise(r => setTimeout(r, 600));

  console.log('[Audit] Taking Screenshot 2: Windows 95 Applications...');
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '02-win95-apps.png'), img2.toPNG());

  console.log('[Audit] Opening Era Switcher (OS Museum)...');
  await win.webContents.executeJavaScript(`window.dtmSwitcherUI.open();`);
  await new Promise(r => setTimeout(r, 600));

  console.log('[Audit] Taking Screenshot 3: Era Switcher Modal...');
  const img3 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '03-era-switcher.png'), img3.toPNG());

  console.log('[Audit] Switching to Mac OS 8.1...');
  await win.webContents.executeJavaScript(`
    window.dtmSwitcherUI.close();
    window.dtmSkinManager.switchSkin('macos8');
  `);
  
  // Wait for Mac boot screen to clear and environment to mount
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        const frame = document.getElementById('skin-viewport');
        if (frame && frame.contentWindow && frame.contentWindow.document.getElementById('appleBtn')) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    })
  `);
  await new Promise(r => setTimeout(r, 1600));

  console.log('[Audit] Taking Screenshot 4: Mac OS 8.1 Desktop...');
  // Close about dialog for clean desktop shot
  await win.webContents.executeJavaScript(`
    (() => {
      const frame = document.getElementById('skin-viewport');
      const aboutWin = frame.contentWindow.document.querySelector('.window[data-app="about"]');
      if (aboutWin) aboutWin.remove();
    })()
  `);
  await new Promise(r => setTimeout(r, 400));
  const img4 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '04-macos8-desktop.png'), img4.toPNG());

  console.log('[Audit] Opening Mac OS 8.1 Apps (Calculator & SimpleText)...');
  const macAppCheck = await win.webContents.executeJavaScript(`
    (() => {
      const frame = document.getElementById('skin-viewport');
      frame.contentWindow.openApp('calculator');
      frame.contentWindow.openApp('simpletext');
      const doc = frame.contentWindow.document;
      return {
        calc: !!doc.querySelector('.window[data-app="calculator"]'),
        simpletext: !!doc.querySelector('.window[data-app="simpletext"]')
      };
    })()
  `);
  console.log('[Audit] Mac Apps Open Status:', macAppCheck);
  await new Promise(r => setTimeout(r, 600));

  console.log('[Audit] Taking Screenshot 5: Mac OS 8.1 Applications...');
  const img5 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '05-macos8-apps.png'), img5.toPNG());

  console.log('[Audit] Switching to Windows 98...');
  await win.webContents.executeJavaScript(`
    window.dtmSkinManager.switchSkin('windows98');
  `);
  
  // Wait for Win98 to load
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      const check = () => {
        const frame = document.getElementById('skin-viewport');
        if (frame && frame.contentWindow && frame.contentWindow.document.getElementById('startBtn') && frame.contentWindow.document.querySelector('.quick-launch')) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    })
  `);
  await new Promise(r => setTimeout(r, 1600));

  console.log('[Audit] Taking Screenshot 6: Windows 98 Desktop...');
  // Close about dialog for clean desktop shot
  await win.webContents.executeJavaScript(`
    (() => {
      const frame = document.getElementById('skin-viewport');
      const aboutWin = frame.contentWindow.document.querySelector('.window[data-app="about"]');
      if (aboutWin) aboutWin.remove();
    })()
  `);
  await new Promise(r => setTimeout(r, 400));
  const img6 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '06-win98-desktop.png'), img6.toPNG());

  console.log('[Audit] Opening Win98 Apps (Notepad, Paint, Explorer, Calculator)...');
  const w98AppCheck = await win.webContents.executeJavaScript(`
    (() => {
      const frame = document.getElementById('skin-viewport');
      frame.contentWindow.openApp('notepad');
      frame.contentWindow.openApp('paint');
      frame.contentWindow.openApp('explorer');
      frame.contentWindow.openApp('calculator');
      const doc = frame.contentWindow.document;
      return {
        notepad: !!doc.querySelector('.window[data-app="notepad"]'),
        paint: !!doc.querySelector('.window[data-app="paint"]'),
        explorer: !!doc.querySelector('.window[data-app="explorer"]'),
        calculator: !!doc.querySelector('.window[data-app="calculator"]')
      };
    })()
  `);
  console.log('[Audit] Win98 Apps Open Status:', w98AppCheck);
  await new Promise(r => setTimeout(r, 600));

  console.log('[Audit] Taking Screenshot 7: Windows 98 Applications...');
  const img7 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '07-win98-apps.png'), img7.toPNG());

  console.log('[Audit] Opening Era Switcher (OS Museum) with all three skins...');
  await win.webContents.executeJavaScript(`window.dtmSwitcherUI.open();`);
  await new Promise(r => setTimeout(r, 600));

  console.log('[Audit] Taking Screenshot 8: Era Switcher with Three Skins...');
  const img8 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '08-era-switcher-three.png'), img8.toPNG());

  console.log('[Audit] Performing Repeated Switching (Win95 -> Mac -> Win98 -> Win95 -> Mac -> Win98)...');
  const repeatedResults = [];
  for (let cycle = 1; cycle <= 2; cycle++) {
    const t0 = Date.now();
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('windows95');`);
    await new Promise(r => setTimeout(r, 1200));
    const win95Check = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        return {
          skin: 'windows95',
          hasStart: !!doc.getElementById('startBtn'),
          icons: doc.querySelectorAll('.desktop-icon').length
        };
      })()
    `);
    repeatedResults.push({ cycle, step: 'to-win95', durationMs: Date.now() - t0, check: win95Check });

    const t1 = Date.now();
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('macos8');`);
    await new Promise(r => setTimeout(r, 1500));
    const macCheck = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        return {
          skin: 'macos8',
          hasApple: !!doc.getElementById('appleBtn'),
          icons: doc.querySelectorAll('.desktop-icon').length
        };
      })()
    `);
    repeatedResults.push({ cycle, step: 'to-macos8', durationMs: Date.now() - t1, check: macCheck });
  }

  // Final return to Win95
  await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('windows95');`);
  await new Promise(r => setTimeout(r, 1200));
  const img9 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(SCREENSHOTS_DIR, '09-repeated-switching-win95.png'), img9.toPNG());

  console.log('=== VISUAL AUDIT & REPEATED SWITCHING COMPLETE ===');
  console.log(JSON.stringify({
    screenshots: fs.readdirSync(SCREENSHOTS_DIR),
    repeatedSwitching: repeatedResults
  }, null, 2));

  win.close();
  app.quit();
});
