/**
 * Desktop Time Machine - Main Electron Process Entry
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { createMainWindow, getMainWindow } = require('./window-manager');
const { registerIpcHandlers } = require('./ipc-handlers');
const browser = require('./browser');
const {
  shouldGrantPermissionRequest,
  shouldAllowPermissionCheck,
  DISPLAY_MEDIA_USE_SYSTEM_PICKER,
  displayMediaChoice
} = require('../security/permission-policy');

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

    // Least privilege: no camera, microphone, location, notification,
    // clipboard or display-capture access is granted silently. Permission
    // decisions are made by the shared policy module so they can be tested.
    const configureSession = (s) => {
      if (!s) return;
      try {
        s.setPermissionRequestHandler((webContents, permission, callback) => {
          const requestedOrigin = (() => {
            try { return webContents && webContents.getURL ? webContents.getURL() : ''; } catch { return ''; }
          })();
          callback(shouldGrantPermissionRequest(permission, { requestedOrigin }));
        });
      } catch {}
      try {
        s.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
          const origin = requestingOrigin || (() => {
            try { return webContents && webContents.getURL ? webContents.getURL() : ''; } catch { return ''; }
          })();
          return shouldAllowPermissionCheck(permission, { requestedOrigin: origin });
        });
      } catch {}
      try {
        s.setDisplayMediaRequestHandler((_request, callback) => {
          // The OS picker chooses the source. Never enumerate and pick one.
          try { callback(displayMediaChoice()); } catch {}
        }, { useSystemPicker: DISPLAY_MEDIA_USE_SYSTEM_PICKER });
      } catch {}
    };
    configureSession(session.defaultSession);
    try { configureSession(session.fromPartition('persist:dtm-web')); } catch {}

    // Chromium keeps file:// skin scripts in its disk cache between launches.
    // Without this, a launch after an update can render the previous desktop
    // mirror. Clearing it at boot keeps skin updates visible.
    try { await session.defaultSession.clearCache(); } catch {}

    const mainWindow = createMainWindow();
    // The window is not muted: skins are iframes of this WebContents, so a
    // mute here silenced every skin's media player too. Skin UI chimes are
    // disabled individually instead (see playChime in the Mac skins).

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
