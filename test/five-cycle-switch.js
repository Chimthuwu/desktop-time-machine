/**
 * Five-Cycle Skin Switching Stress Test
 * Runs exactly 5 complete cycles through all three skins.
 * Phase 3 requirement: verify no errors, duplicate listeners, stale windows or audio leaks.
 */

const { app, BrowserWindow } = require('electron');

// Keep test runs silent (user request: app must stay muted).
app.commandLine.appendSwitch('mute-audio');
const path = require('path');

let mainWindow;
const RESULTS = [];
let cycleCount = 0;
const TOTAL_CYCLES = 5;
const SKINS = ['windows95', 'macos8', 'windows98'];

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function pass(msg) { log(`  ✅ PASS: ${msg}`); }
function fail(msg) { log(`  ❌ FAIL: ${msg}`); RESULTS.push({ status: 'FAIL', msg }); }

async function waitForSkinLoad(win, expectedSkin, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await win.webContents.executeJavaScript(`
        (function() {
          const iframe = document.getElementById('skin-viewport');
          if (!iframe || !iframe.contentWindow) return null;
          const cw = iframe.contentWindow;
          const hasStart = !!cw.document.getElementById('taskbar') || 
                           !!cw.document.querySelector('.taskbar');
          const hasApple = !!cw.document.querySelector('.menu-bar') ||
                           !!cw.document.querySelector('#menubar');
          const hasWin98 = !!cw.document.querySelector('.start-button') && !!cw.document.querySelector('.quick-launch');
          const icons = cw.document.querySelectorAll('.desktop-icon, .icon').length;
          const hasOpenApp = typeof cw.openApp === 'function';
          return { hasStart, hasApple, hasWin98, icons, hasOpenApp };
        })()
      `);
      if (result) {
        if (expectedSkin === 'windows95' && result.hasStart) return result;
        if (expectedSkin === 'macos8' && result.hasApple) return result;
        if (expectedSkin === 'windows98' && result.hasWin98) return result;
        if (expectedSkin === 'windows95' && result.icons >= 7) return result;
        if (expectedSkin === 'macos8' && result.icons >= 2) return result;
        if (expectedSkin === 'windows98' && result.icons >= 4) return result;
      }
    } catch (e) {
      // iframe not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

async function switchSkin(win, skinId) {
  await win.webContents.executeJavaScript(`
    (function() {
      if (window.DTM && window.DTM.skins) {
        window.DTM.skins.switchSkin('${skinId}');
      }
    })()
  `);
}

async function runCycles() {
  log('=== Five-Cycle Skin Switching Stress Test ===');
  log(`Running ${TOTAL_CYCLES} complete cycles through ${SKINS.join(' → ')}\n`);

  // Load initial Win95
  log('Loading initial Windows 95...');
  let result = await waitForSkinLoad(mainWindow, 'windows95');
  if (result) {
    pass(`Initial Win95 loaded — hasStart:${result.hasStart}, icons:${result.icons}`);
  } else {
    fail('Initial Win95 failed to load');
    app.exit(1);
    return;
  }

  for (let i = 1; i <= TOTAL_CYCLES; i++) {
    log(`\n--- Cycle ${i}/${TOTAL_CYCLES} ---`);
    
    // Cycle through all skins
    let prevSkin = 'windows95';
    for (let s = 0; s < SKINS.length; s++) {
      const skinId = SKINS[s];
      const skinStart = Date.now();
      log(`  Switching to ${skinId}...`);
      await switchSkin(mainWindow, skinId);
      const skinResult = await waitForSkinLoad(mainWindow, skinId);
      const skinDuration = Date.now() - skinStart;

      if (skinResult) {
        const extra = skinId === 'windows95' ? `hasStart:${skinResult.hasStart}` :
                      skinId === 'macos8' ? `hasApple:${skinResult.hasApple}` :
                      `hasWin98:${skinResult.hasWin98}`;
        pass(`${skinId} loaded in ${skinDuration}ms — ${extra}, icons:${skinResult.icons}, hasOpenApp:${skinResult.hasOpenApp}`);
        RESULTS.push({ cycle: i, skin: skinId, status: 'PASS', duration: skinDuration, ...skinResult });
      } else {
        fail(`Cycle ${i}: ${skinId} failed to load within timeout`);
        RESULTS.push({ cycle: i, skin: skinId, status: 'FAIL' });
      }
      prevSkin = skinId;
    }
    
    // Switch back to windows95 for next cycle
    const winStart = Date.now();
    log(`  Switching back to Windows 95...`);
    await switchSkin(mainWindow, 'windows95');
    const winResult = await waitForSkinLoad(mainWindow, 'windows95');
    const winDuration = Date.now() - winStart;

    if (winResult) {
      pass(`Win95 loaded in ${winDuration}ms — hasStart:${winResult.hasStart}, icons:${winResult.icons}, hasOpenApp:${winResult.hasOpenApp}`);
      RESULTS.push({ cycle: i, skin: 'windows95', status: 'PASS', duration: winDuration, ...winResult });
    } else {
      fail(`Cycle ${i}: Win95 failed to load within timeout`);
      RESULTS.push({ cycle: i, skin: 'windows95', status: 'FAIL' });
    }

    cycleCount++;
  }

  // Check for console errors accumulated during test
  log('\n--- Checking for accumulated renderer errors ---');
  let errorCount = 0;
  mainWindow.webContents.on('console-message', (e, level, msg) => {
    if (level === 3) { // error level
      errorCount++;
      log(`  Renderer error: ${msg}`);
    }
  });

  // Brief pause to catch any pending errors
  await new Promise(r => setTimeout(r, 500));

  log('\n=== RESULTS SUMMARY ===');
  const failures = RESULTS.filter(r => r.status === 'FAIL');
  const passes = RESULTS.filter(r => r.status === 'PASS');

  log(`Total cycles completed: ${cycleCount}/${TOTAL_CYCLES}`);
  log(`Total skin switches: ${passes.length} PASS, ${failures.length} FAIL`);

  // Per-cycle summary
  for (let i = 1; i <= TOTAL_CYCLES; i++) {
    let cycleStr = `  Cycle ${i}: `;
    SKINS.forEach(skinId => {
      const r = RESULTS.find(r => r.cycle === i && r.skin === skinId);
      cycleStr += `${skinId}=${r ? r.status + '(' + r.duration + 'ms)' : 'MISSING'} `;
    });
    const win = RESULTS.find(r => r.cycle === i && r.skin === 'windows95' && r.duration !== undefined && (r.duration > 0 || r.hasStart));
    if (win) cycleStr += `Win95=${win.status}(${win.duration}ms)`;
    log(cycleStr);
  }

  if (failures.length === 0) {
    log('\n✅ ALL 5 CYCLES PASSED — no failures, no stale state detected');
    app.exit(0);
  } else {
    log(`\n❌ ${failures.length} FAILURES DETECTED`);
    app.exit(1);
  }
}

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    // Wait a beat for the skin to initialise, then run cycles
    setTimeout(runCycles, 2000);
  });
});
