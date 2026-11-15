/**
 * Desktop Time Machine - Main Electron Process Entry
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { createMainWindow, getMainWindow } = require('./window-manager');
const { registerIpcHandlers } = require('./ipc-handlers');
const { hardenWebviews } = require('./webview-security');
const browser = require('./browser');

// Skin beeps/UI sounds stay muted (see setAudioMuted below), but the global
// mute-audio switch is intentionally NOT used: it would also silence the
// retro browser/Discord webviews, which need working audio for calls.

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpcHandlers();

    // Grant media/display-capture permissions so the retro browser and Discord
    // webviews can use the microphone, camera and (where supported) screen
    // sharing instead of being silently denied by Chromium's defaults.
    const { desktopCapturer } = require('electron');
    const configureSession = (s) => {
      if (!s) return;
      try {
        s.setPermissionRequestHandler((webContents, permission, callback) => {
          const allowed = ['media', 'display-capture', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
          callback(allowed.includes(permission));
        });
      } catch {}
      try { s.setPermissionCheckHandler(() => true); } catch {}
      try {
        s.setDisplayMediaRequestHandler(async (request, callback) => {
          try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
            const screen = sources.find((x) => String(x.id).startsWith('screen')) || sources[0];
            if (screen) callback({ video: screen });
            else callback({});
          } catch (e) {
            try { callback({}); } catch {}
          }
        }, { useSystemPicker: false });
      } catch {}
    };
    configureSession(session.defaultSession);
    try { configureSession(session.fromPartition('persist:dtm-web')); } catch {}

    // Chromium keeps file:// skin scripts in its disk cache between launches.
    // Without this, a launch after an update can render the previous desktop
    // mirror. Clearing it at boot keeps skin updates visible.
    try { await session.defaultSession.clearCache(); } catch {}

    const mainWindow = createMainWindow();
    hardenWebviews(mainWindow.webContents);
    // Keep the skin's UI beeps (MS-DOS prompt, macos8 chimes) silent while
    // leaving the browser/Discord webviews audible — they have their own
    // WebContents and are not affected by this flag.
    try { mainWindow.webContents.setAudioMuted(true); } catch {}

    // Load the engine host HTML
    const indexPath = path.join(__dirname, '../../src/index.html');
    mainWindow.loadFile(indexPath);

    // A copy handed to someone else has no Ungoogled Chromium yet, so the real
    // retro browser engine is provisioned in the background once the desktop is
    // up. On a machine that already has it this only refreshes branding.
    mainWindow.webContents.once('did-finish-load', () => {
      browser.ensure({ onProgress: (step) => {
        if (step.phase === 'download' && step.total) {
          const pct = Math.round((step.received / step.total) * 100);
          if (pct % 10 === 0) console.log('[DTM] Ungoogled Chromium download ' + pct + '%');
        } else if (step.phase === 'install') {
          console.log('[DTM] Installing ' + step.file);
        } else if (step.phase === 'done') {
          console.log('[DTM] Retro browser ready (' + step.exe + ')');
        }
      } }).then((result) => {
        if (!result || !result.ok) console.log('[DTM] Retro browser setup failed: ' + (result && result.error));
      }).catch(() => {});
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
