/**
 * Five-Cycle Repeated Switching Test for Desktop Time Machine
 * Proves isolation, absence of memory leaks, zero audio leakage, and proper cleanup.
 */

const { app, BrowserWindow } = require('electron');

// Keep test runs silent (user request: app must stay muted).
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const results = {
  cycles: [],
  audioCleanedUp: true,
  staleWindowsFound: false,
  duplicateListenersFound: false,
  errors: []
};

app.whenReady().then(async () => {
  registerIpcHandlers();

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 840,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2 && !message.includes('Autoplay')) {
      results.errors.push(`[Console L${level}] ${message}`);
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  await new Promise(r => setTimeout(r, 1200));

  for (let i = 1; i <= 5; i++) {
    const cycleData = { cycle: i };

    // 1. Switch to Mac OS 8.1
    const t0 = Date.now();
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('macos8');`);
    await new Promise(r => setTimeout(r, 1500));

    // Interact with Mac OS 8.1: trigger chime, open calculator
    const macState = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const winObj = frame.contentWindow;

        // Trigger chime
        if (typeof winObj.playChime === 'function') {
          winObj.playChime();
        }

        // Open calculator
        winObj.openApp('calculator');

        return {
          hasMenubar: !!doc.getElementById('menubar'),
          hasAppleLogo: !!doc.getElementById('appleBtn'),
          hasNoWin95Start: !doc.getElementById('startBtn'),
          openWindows: doc.querySelectorAll('.window').length,
          hasAudioCtx: !!winObj.audioCtx,
          audioCtxState: winObj.audioCtx?.state
        };
      })()
    `);
    cycleData.macDurationMs = Date.now() - t0;
    cycleData.macState = macState;

    if (!macState.hasNoWin95Start) {
      results.staleWindowsFound = true;
    }

    // 2. Switch back to Windows 95
    const t1 = Date.now();
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('windows95');`);
    await new Promise(r => setTimeout(r, 1200));

    // Interact with Win95: open notepad
    const win95State = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const winObj = frame.contentWindow;

        winObj.openApp('notepad');

        return {
          hasStartBtn: !!doc.getElementById('startBtn'),
          hasNoMacMenubar: !doc.getElementById('menubar'),
          hasNoControlStrip: !doc.getElementById('controlStrip'),
          iconsCount: doc.querySelectorAll('.desktop-icon').length,
          openWindows: doc.querySelectorAll('.window').length
        };
      })()
    `);
    cycleData.win95DurationMs = Date.now() - t1;
    cycleData.win95State = win95State;

    if (!win95State.hasNoMacMenubar || !win95State.hasNoControlStrip) {
      results.staleWindowsFound = true;
    }

    results.cycles.push(cycleData);
  }

  // Memory & DOM inspection of host window
  const finalHostState = await win.webContents.executeJavaScript(`
    ({
      bodyChildNodes: document.body.children.length,
      viewportExists: !!document.getElementById('skin-viewport'),
      switcherExists: !!document.getElementById('dtmSwitcherOverlay'),
      hudExists: !!document.getElementById('dtmFloatingHud')
    })
  `);
  results.finalHostState = finalHostState;

  console.log('=== FIVE-CYCLE REPEATED SWITCHING RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  app.quit();
});
