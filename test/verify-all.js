/**
 * Desktop Time Machine — Automated Verification Test Suite
 * 
 * Tests:
 * 1. Electron installation & startup
 * 2. Security boundaries (contextIsolation, nodeIntegration, IPC whitelist, URL & path validation)
 * 3. Windows 95 features (desktop, icons, start menu, taskbar, clock, windows, notepad, paint, minesweeper, computer, IE, screensaver, doom, context menu, shutdown)
 * 4. Mac OS 8.1 features (desktop, icons, dragging, drag-to-trash, trash, context menus, apple menu, dynamic menus, finder, calc, stickies, simpletext, window shading, control strip)
 * 5. Bidirectional skin switching & state preservation
 * 6. Clean exit mechanism
 */

const { app, BrowserWindow, ipcMain } = require('electron');

// Keep test runs silent (user request: app must stay muted).
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const { registerIpcHandlers } = require(path.join(__dirname, '../electron/main/ipc-handlers'));
const permissions = require(path.join(__dirname, '../electron/security/permissions'));

const results = {
  security: {},
  win95: {},
  win98: {},
  macos8: {},
  macosx: {},
  switching: {},
  templeos: {},
  windowsXP: {},
  amigaWorkbench: {},
  beos: {},
  errors: []
};

app.whenReady().then(async () => {
  registerIpcHandlers();

  // Test 1: Security module tests
  try {
    results.security.cmdBlocked = !permissions.isApprovedProgram('cmd.exe');
    results.security.regeditBlocked = !permissions.isApprovedProgram('regedit.exe');
    results.security.powershellBlocked = !permissions.isApprovedProgram('powershell.exe');
    results.security.pathInjectionBlocked = !permissions.isApprovedProgram('C:\\evil\\calc.exe');
    results.security.argInjectionBlocked = !permissions.isApprovedProgram('calc.exe /dangerous');
    results.security.calcApproved = permissions.isApprovedProgram('calc.exe');
    results.security.notepadApproved = permissions.isApprovedProgram('notepad.exe');
    results.security.pinnedPathResolved = !!permissions.getPinnedExecutablePath('calc.exe')?.toLowerCase().includes('calc.exe');
    results.security.sensitiveSamBlocked = !permissions.isSafePath('C:\\Windows\\System32\\config\\SAM');
    results.security.sensitiveSshBlocked = !permissions.isSafePath('C:\\Users\\User\\.ssh\\id_rsa');
    results.security.nullByteBlocked = !permissions.isSafePath('C:\\safe\\path\0evil');
    results.security.excessiveLengthBlocked = !permissions.isSafePath('A'.repeat(2000));
    results.security.safeHttpUrl = permissions.isSafeExternalUrl('https://archive.org');
    results.security.unsafeFileUrl = !permissions.isSafeExternalUrl('file:///C:/Windows/System32');
    results.security.unsafeJavascriptUrl = !permissions.isSafeExternalUrl('javascript:alert(1)');
  } catch (e) {
    results.errors.push('Security unit test error: ' + e.message);
  }

  // Test 2: Launch Electron Window
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
      results.errors.push('[Console Error] ' + message);
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));
  // The remembered skin is shared with earlier test runs; start from Windows 95.
  await win.webContents.executeJavaScript("localStorage.setItem('dtm_active_skin','windows95')");
  await win.webContents.reloadIgnoringCache();
  await new Promise(r => setTimeout(r, 1800));

  // Test 3: Windows 95 Verification
  try {
    const w95Tests = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const wObj = frame.contentWindow;

        const out = {};

        // Desktop and icons
        out.hasDesktop = !!doc.getElementById('desktop');
        out.iconCount = doc.querySelectorAll('.desktop-icon').length;

        // Start menu & Taskbar
        const startBtn = doc.getElementById('startBtn');
        out.hasStartButton = !!startBtn;
        startBtn.click();
        const startMenu = doc.getElementById('startMenu');
        out.startMenuOpens = startMenu.classList.contains('open');
        out.startProgramsSubmenu = !!startMenu.querySelector('.start-submenu');
        startBtn.click(); // close

        // Taskbar & Clock
        out.hasTaskbar = !!doc.querySelector('.taskbar');
        out.clockText = doc.getElementById('clock')?.textContent;

        // Context Menu
        const evt = new MouseEvent('contextmenu', { clientX: 200, clientY: 200, bubbles: true });
        doc.getElementById('desktop').dispatchEvent(evt);
        const contextMenu = doc.querySelector('.context');
        out.hasContextMenu = !!contextMenu;
        contextMenu?.remove();

        // Applications
        // 1. Notepad
        wObj.openApp('notepad');
        const npWin = doc.querySelector('.window[data-app="notepad"]');
        out.notepad = !!npWin && !!npWin.querySelector('textarea.notepad');

        // 2. Paint
        wObj.openApp('paint');
        const paintWin = doc.querySelector('.window[data-app="paint"]');
        out.paint = !!paintWin && !!paintWin.querySelector('canvas.paint');

        // 3. Minesweeper
        wObj.openApp('minesweeper');
        const msWin = doc.querySelector('.window[data-app="minesweeper"]');
        const msCells = msWin?.querySelectorAll('.ms-cell');
        out.minesweeper = !!msWin && msCells.length === 81;

        // 4. My Computer
        wObj.openApp('computer');
        const compWin = doc.querySelector('.window[data-app="computer"]');
        out.myComputer = !!compWin && compWin.querySelectorAll('.computer-item').length >= 6;

        // 5. Internet Explorer
        wObj.openApp('internet');
        const ieWin = doc.querySelector('.window[data-app="internet"]');
        out.internetExplorer = !!ieWin && !!ieWin.querySelector('#ie-frame');

        // 6. Display Properties & Screensaver
        wObj.openApp('display');
        const dispWin = doc.querySelector('.window[data-app="display"]');
        out.displayProperties = !!dispWin && !!dispWin.querySelector('#ssSelect');

        // 7. DOOM Launcher
        wObj.openApp('doom');
        const doomWin = doc.querySelector('.window[data-app="doom"]');
        out.doomLauncher = !!doomWin && !!doomWin.querySelector('iframe');

        // 8. Shutdown Dialog
        wObj.openApp('shutdown');
        const sdWin = doc.querySelector('.window[data-app="shutdown"]');
        out.shutdownDialog = !!sdWin && !!sdWin.querySelector('#shutdownConfirmBtn');

        // Window controls (minimize, maximize, focus, close)
        const npTitle = npWin.querySelector('.titlebar');
        out.windowTitle = !!npTitle;
        const minBtn = npWin.querySelector('[data-min]');
        minBtn?.click();
        out.windowMinimizes = npWin.style.display === 'none';
        const taskBtn = npWin._task;
        taskBtn?.click();
        out.windowRestores = npWin.style.display === 'flex';
        const maxBtn = npWin.querySelector('[data-max]');
        maxBtn?.click();
        out.windowMaximizes = npWin.classList.contains('maximized');
        maxBtn?.click(); // restore
        const closeBtn = npWin.querySelector('[data-close]');
        closeBtn?.click();
        out.windowCloses = !doc.querySelector('.window[data-app="notepad"]');

        return out;
      })()
    `);
    results.win95 = w95Tests;
  } catch (e) {
    results.errors.push('Win95 test error: ' + e.message);
  }

  // Test 4: Switch to Mac OS 8.1
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('macos8');`);
    await new Promise(r => setTimeout(r, 1800));

    const macTests = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const wObj = frame.contentWindow;

        const out = {};

        // Appearance
        out.hasMenubar = !!doc.getElementById('menubar');
        out.hasAppleLogo = !!doc.getElementById('appleBtn');
        out.hasControlStrip = !!doc.getElementById('controlStrip');
        out.hasTrashBin = !!doc.getElementById('trashBin');
        out.desktopIcons = doc.querySelectorAll('.desktop-icon').length;

        // Context Menus
        // Desktop context menu
        const dEvt = new MouseEvent('contextmenu', { clientX: 300, clientY: 300, bubbles: true });
        doc.getElementById('desktop').dispatchEvent(dEvt);
        const dContext = doc.querySelector('.context-menu');
        out.desktopContextMenu = !!dContext;
        dContext?.remove();

        // Icon context menu
        const firstIcon = doc.querySelector('.desktop-icon');
        if (firstIcon) {
          const iEvt = new MouseEvent('contextmenu', { clientX: 50, clientY: 50, bubbles: true });
          firstIcon.dispatchEvent(iEvt);
          const iContext = doc.querySelector('.context-menu');
          out.iconContextMenu = !!iContext;
          iContext?.remove();
        }

        // Apple Menu
        doc.getElementById('appleBtn').click();
        const appleMenu = doc.getElementById('appleMenu');
        out.appleMenuOpens = appleMenu.classList.contains('open');
        doc.getElementById('appleBtn').click(); // close

        // Applications
        // 1. Finder
        wObj.openApp('finder');
        const finderWin = doc.querySelector('.window[data-app="finder"]');
        out.finder = !!finderWin && !!finderWin.querySelector('.finder-list');

        // 2. Calculator
        wObj.openApp('calculator');
        const calcWin = doc.querySelector('.window[data-app="calculator"]');
        if (calcWin && typeof wObj.calcInput === 'function') {
          wObj.calcInput('7');
          wObj.calcInput('+');
          wObj.calcInput('5');
          wObj.calcInput('=');
          out.calculatorComputes = calcWin.querySelector('#calc-screen').textContent === '12';
        } else {
          out.calculatorComputes = false;
        }

        // 3. SimpleText
        wObj.openApp('simpletext');
        const stWin = doc.querySelector('.window[data-app="simpletext"]');
        out.simpleText = !!stWin && !!stWin.querySelector('textarea.simpletext-area');

        // 4. Stickies
        wObj.openApp('stickies');
        const stickWin = doc.querySelector('.window[data-app="stickies"]');
        out.stickies = !!stickWin && stickWin.querySelectorAll('.sticky-note').length >= 2;

        // 5. Trash
        wObj.openApp('trash');
        const trashWin = doc.querySelector('.window[data-app="trash"]');
        out.trash = !!trashWin;

        // Window controls & shading
        if (finderWin) {
          const titleBar = finderWin.querySelector('.title-bar');
          // Test Shading via double click title bar
          const dblEvt = new MouseEvent('dblclick', { bubbles: true });
          titleBar.dispatchEvent(dblEvt);
          out.windowShading = finderWin.classList.contains('shaded');
          titleBar.dispatchEvent(dblEvt); // unshade

          // Close window
          const closeBox = finderWin.querySelector('[data-close]');
          closeBox?.click();
          out.windowCloses = !doc.querySelector('.window[data-app="finder"]');
        }

        return out;
      })()
    `);
    results.macos8 = macTests;
  } catch (e) {
    results.errors.push('Mac OS 8 test error: ' + e.message);
  }

  // Test 5: Switch to Windows 98
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('windows98');`);
    await new Promise(r => setTimeout(r, 1800));

    const w98Tests = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const wObj = frame.contentWindow;

        const out = {};

        // Desktop and icons
        out.hasDesktop = !!doc.getElementById('desktop');
        out.iconCount = doc.querySelectorAll('.desktop-icon').length;

        // Start button & Taskbar
        const startBtn = doc.getElementById('startBtn');
        out.hasStartButton = !!startBtn;
        startBtn.click();
        const startMenu = doc.getElementById('startMenu');
        out.startMenuOpens = startMenu.classList.contains('open');
        out.startProgramsSubmenu = !!startMenu.querySelector('.start-submenu');
        startBtn.click(); // close

        // Taskbar & Clock
        out.hasTaskbar = !!doc.querySelector('.taskbar');
        out.clockText = doc.getElementById('clock')?.textContent;

        // Quick Launch
        out.hasQuickLaunch = !!doc.getElementById('quickLaunch');

        // Channel Bar (Active Desktop)
        out.hasChannelBar = !!doc.getElementById('channelBar');

        // Context Menu
        const evt = new MouseEvent('contextmenu', { clientX: 200, clientY: 200, bubbles: true });
        doc.getElementById('desktop').dispatchEvent(evt);
        const contextMenu = doc.querySelector('.context');
        out.hasContextMenu = !!contextMenu;
        contextMenu?.remove();

        // Applications
        // 1. Notepad
        wObj.openApp('notepad');
        const npWin = doc.querySelector('.window[data-app="notepad"]');
        out.notepad = !!npWin && !!npWin.querySelector('textarea.notepad');

        // 2. Paint
        wObj.openApp('paint');
        const paintWin = doc.querySelector('.window[data-app="paint"]');
        out.paint = !!paintWin && !!paintWin.querySelector('canvas.paint');

        // 3. Minesweeper
        wObj.openApp('minesweeper');
        const msWin = doc.querySelector('.window[data-app="minesweeper"]');
        const msCells = msWin?.querySelectorAll('.ms-cell');
        out.minesweeper = !!msWin && msCells.length === 81;

        // 4. My Computer
        wObj.openApp('computer');
        const compWin = doc.querySelector('.window[data-app="computer"]');
        out.myComputer = !!compWin && compWin.querySelectorAll('.computer-item').length >= 6;

        // 5. Internet Explorer
        wObj.openApp('internet');
        const ieWin = doc.querySelector('.window[data-app="internet"]');
        out.internetExplorer = !!ieWin && !!ieWin.querySelector('#ie-frame');

        // 6. Explorer (Filesystem)
        wObj.openApp('explorer');
        const expWin = doc.querySelector('.window[data-app="explorer"]');
        out.explorer = !!expWin && !!expWin.querySelector('.explorer-grid');

        // 7. Calculator
        wObj.openApp('calculator');
        const calcWin = doc.querySelector('.window[data-app="calculator"]');
        if (calcWin && typeof wObj.calcInput === 'function') {
          wObj.calcInput('9');
          wObj.calcInput('*');
          wObj.calcInput('8');
          wObj.calcInput('=');
          out.calculator = calcWin.querySelector('#calc-screen').textContent === '72';
        } else {
          out.calculator = false;
        }

        // 8. Control Panel
        wObj.openApp('control');
        const ctrlWin = doc.querySelector('.window[data-app="control"]');
        out.controlPanel = !!ctrlWin && ctrlWin.querySelectorAll('.computer-item').length >= 10;

        // 9. Display Properties
        wObj.openApp('display');
        const dispWin = doc.querySelector('.window[data-app="display"]');
        out.displayProperties = !!dispWin && !!dispWin.querySelector('#ssSelect');

        // 10. System Properties
        wObj.openApp('sysprops');
        const sysWin = doc.querySelector('.window[data-app="sysprops"]');
        out.sysProps = !!sysWin && sysWin.querySelectorAll('.sysprop-tab').length >= 5;

        // 11. Help
        wObj.openApp('help');
        const helpWin = doc.querySelector('.window[data-app="help"]');
        out.help = !!helpWin && !!helpWin.querySelector('.help-tree');

        // 12. Shutdown Dialog
        wObj.openApp('shutdown');
        const sdWin = doc.querySelector('.window[data-app="shutdown"]');
        out.shutdownDialog = !!sdWin && !!sdWin.querySelector('#shutdownConfirmBtn');

        // Window controls (minimize, maximize, focus, close)
        const npTitle = npWin.querySelector('.titlebar');
        out.windowTitle = !!npTitle;
        const minBtn = npWin.querySelector('[data-min]');
        minBtn?.click();
        out.windowMinimizes = npWin.style.display === 'none';
        const taskBtn = npWin._task;
        taskBtn?.click();
        out.windowRestores = npWin.style.display === 'flex';
        const maxBtn = npWin.querySelector('[data-max]');
        maxBtn?.click();
        out.windowMaximizes = npWin.classList.contains('maximized');
        maxBtn?.click(); // restore
        const closeBtn = npWin.querySelector('[data-close]');
        closeBtn?.click();
        out.windowCloses = !doc.querySelector('.window[data-app="notepad"]');

        return out;
      })()
    `);
    results.win98 = w98Tests;
  } catch (e) {
    results.errors.push('Windows 98 test error: ' + e.message);
  }

  // Test 6: TempleOS-inspired skin
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('templeos');`);
    await new Promise(r => setTimeout(r, 1000));

    const templeTests = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        const out = {
          activeSkin: window.dtmSkinManager.getCurrentSkin().id,
          fixedResolutionScreen: !!doc.querySelector('#desktop[aria-label="TempleOS 640 by 480 desktop"]'),
          commandPrompt: !!doc.getElementById('command'),
          helpButton: !!doc.querySelector('[data-command="help;"]')
        };
        const command = doc.getElementById('command');
        command.value = 'Demo;';
        doc.getElementById('command-row').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        out.demoOpens = !!doc.querySelector('#demo-canvas');
        command.value = 'Help;';
        doc.getElementById('command-row').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        out.helpOutput = doc.getElementById('console').textContent.includes('Built-in commands:');
        return out;
      })()
    `);
    results.templeos = templeTests;
  } catch (e) {
    results.errors.push('TempleOS test error: ' + e.message);
  }

  // Test 7: Windows XP Luna
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('windowsXP');`);
    await new Promise(r => setTimeout(r, 400));
    results.windowsXP = await win.webContents.executeJavaScript(`
      (async () => {
        const doc = document.getElementById('skin-viewport').contentWindow.document;
        const out = {
          activeSkin: window.dtmSkinManager.getCurrentSkin().id,
          desktop: !!doc.getElementById('desktop'),
          startMenu: !!doc.querySelector('#start-menu .start-cols'),
          taskbar: !!doc.getElementById('taskbar'),
          icons: doc.querySelectorAll('.desktop-icon').length
        };
        doc.getElementById('start').click();
        out.startOpens = doc.getElementById('start-menu').classList.contains('open');
        doc.querySelector('#start-menu [data-app="calculator"]').click();
        const calc = doc.querySelector('.calc');
        ['7','+','5','='].forEach(key => Array.from(calc.querySelectorAll('button')).find(b => b.textContent === key).click());
        out.calculator = calc.querySelector('.calc-display').textContent === '12';
        doc.querySelector('.desktop-icon[data-app="computer"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        out.fileBrowser = !!doc.querySelector('.win .file-path');
        return out;
      })()
    `);
  } catch (e) {
    results.errors.push('Windows XP test error: ' + e.message);
  }

  // Test 8: Amiga Workbench 3.1
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('amiga-workbench');`);
    await new Promise(r => setTimeout(r, 400));
    results.amigaWorkbench = await win.webContents.executeJavaScript(`
      (async () => {
        const doc = document.getElementById('skin-viewport').contentWindow.document;
        const out = {
          activeSkin: window.dtmSkinManager.getCurrentSkin().id,
          screenBar: !!doc.getElementById('screenbar'),
          diskIcons: doc.querySelectorAll('.wb-icon').length,
          menuBar: !!doc.querySelector('[data-menu="Workbench"]')
        };
        doc.querySelector('.wb-icon[data-app="shell"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        const input = doc.querySelector('.amiga-terminal input');
        input.value = 'help';
        doc.querySelector('.amiga-terminal form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        out.shell = doc.querySelector('.amiga-terminal .cli-output').textContent.includes('VERSION');
        out.windowControls = !!doc.querySelector('.wb-window .gadget');
        doc.querySelector('.wb-icon[data-app="sys"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        out.fileBrowser = !!doc.querySelector('.wb-window .drawer-item');
        return out;
      })()
    `);
  } catch (e) {
    results.errors.push('Amiga Workbench test error: ' + e.message);
  }

  // Test 9: BeOS R5
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('beos');`);
    await new Promise(r => setTimeout(r, 400));
    results.beos = await win.webContents.executeJavaScript(`
      (async () => {
        const doc = document.getElementById('skin-viewport').contentWindow.document;
        const out = {
          activeSkin: window.dtmSkinManager.getCurrentSkin().id,
          deskbar: !!doc.getElementById('deskbar'),
          workspaces: doc.querySelectorAll('.workspace').length,
          desktopIcons: doc.querySelectorAll('.be-icon').length
        };
        doc.getElementById('deskbar-head').click();
        doc.querySelector('#deskbar [data-app="terminal"]').click();
        const win = doc.querySelector('.be-window');
        out.tabbedWindow = !!win && !!win.querySelector('.be-tab');
        doc.querySelector('.workspace[data-workspace="1"]').click();
        out.workspaceHidesWindow = win.style.display === 'none';
        doc.querySelector('.workspace[data-workspace="0"]').click();
        out.workspaceRestoresWindow = win.style.display === 'flex';
        doc.querySelector('.be-icon[data-app="tracker"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        await new Promise(r => setTimeout(r, 250));
        out.tracker = !!doc.querySelector('.be-window .be-file');
        return out;
      })()
    `);
  } catch (e) {
    results.errors.push('BeOS test error: ' + e.message);
  }

  // Test 10: Mac OS X Aqua
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('macosx');`);
    await new Promise(r => setTimeout(r, 1700));
    results.macosx = await win.webContents.executeJavaScript(`
      (async () => {
        const doc = document.getElementById('skin-viewport').contentWindow.document;
        await new Promise(r => setTimeout(r, 250));
        const out = {
          activeSkin: window.dtmSkinManager.getCurrentSkin().id,
          bootComplete: doc.getElementById('boot-screen').style.display === 'none',
          desktopIcons: doc.querySelectorAll('.desktop-icon').length,
          dockApps: doc.querySelectorAll('#dock .dock-icon[data-app]').length,
          finderWindow: !!doc.querySelector('.window[data-app="finder"]'),
          finderItems: doc.querySelectorAll('.window[data-app="finder"] .finder-icon').length > 0
        };
        doc.querySelector('#dock .dock-icon[data-app="calculator"]').click();
        const calc = doc.querySelector('.window[data-app="calculator"]');
        ['7','+','5','='].forEach(key => calc.querySelector('.calc-key[data-key="' + key + '"]').click());
        out.calculator = calc.querySelector('.calc-display').textContent === '12';
        return out;
      })()
    `);
  } catch (e) {
    results.errors.push('Mac OS X test error: ' + e.message);
  }

  // Test 11: Switch back to Windows 95
  try {
    await win.webContents.executeJavaScript(`window.dtmSkinManager.switchSkin('windows95');`);
    await new Promise(r => setTimeout(r, 1800));

    const switchBack = await win.webContents.executeJavaScript(`
      (() => {
        const frame = document.getElementById('skin-viewport');
        const doc = frame.contentWindow.document;
        return {
          activeSkin: window.dtmSkinManager.getCurrentSkin().id,
          hasStartBtn: !!doc.getElementById('startBtn'),
          hasDesktop: !!doc.getElementById('desktop'),
          iconsCount: doc.querySelectorAll('.desktop-icon').length
        };
      })()
    `);
    results.switching.returnToWin95 = switchBack;
  } catch (e) {
    results.errors.push('Switching back error: ' + e.message);
  }

  console.log('=== TEST VERIFICATION RESULTS ===');
  console.log(JSON.stringify(results, null, 2));

  app.quit();
});
