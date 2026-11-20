/**
 * Window Manager for Desktop Time Machine
 * Controls the primary Electron application window and displays
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { hardenWebviews } = require('./webview-security');

let mainWindow = null;

function createMainWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  // Choose a comfortable window size that fits 1080p and scaling
  const width = Math.min(1280, Math.floor(screenWidth * 0.9));
  const height = Math.min(840, Math.floor(screenHeight * 0.9));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    title: 'Desktop Time Machine',
    icon: path.join(__dirname, '../../assets/desktop-time-machine.ico'),
    backgroundColor: '#008080', // Classic Win95 Teal default
    // The skin is the window: no native title bar or menu bar above it. The
    // window is movable/resizable through the usual edge handles, can be
    // minimized or closed from the skin's own menus, and Alt+F4 still works.
    frame: false,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Allows preload to bridge Node APIs securely
      webviewTag: true, // In-app browser + Discord guests (hardened in main)
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Every window gets the same webview hardening, including windows created
  // later when the app is re-activated on macOS.
  hardenWebviews(mainWindow.webContents);

  // Handle external navigation prevention
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If it's a web link opened via window.open, don't let it hijack the app window
    return { action: 'deny' };
  });

  // Prevent top-frame navigation away from the local application
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      const localPath = decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1');
      const resolved = path.resolve(localPath);
      const appRoot = path.resolve(__dirname, '../..');
      if (parsed.protocol !== 'file:' || !(resolved === appRoot || resolved.startsWith(appRoot + path.sep))) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function toggleFullScreen() {
  if (!mainWindow) return false;
  const isFullScreen = mainWindow.isFullScreen();
  mainWindow.setFullScreen(!isFullScreen);
  return !isFullScreen;
}

module.exports = {
  createMainWindow,
  getMainWindow,
  toggleFullScreen
};
