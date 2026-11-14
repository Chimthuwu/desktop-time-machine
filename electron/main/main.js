/**
 * Desktop Time Machine - Main Electron Process Entry
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { createMainWindow, getMainWindow } = require('./window-manager');
const { registerIpcHandlers } = require('./ipc-handlers');

// User request (2026-11-14): the app must stay muted — no startup sounds,
// skin audio or system beeps out of the speakers, ever.
app.commandLine.appendSwitch('mute-audio');

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

    // Chromium keeps file:// skin scripts in its disk cache between launches.
    // Without this, a launch after an update can render the previous desktop
    // mirror. Clearing it at boot keeps skin updates visible.
    try { await session.defaultSession.clearCache(); } catch {}

    const mainWindow = createMainWindow();

    // Load the engine host HTML
    const indexPath = path.join(__dirname, '../../src/index.html');
    mainWindow.loadFile(indexPath);

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
