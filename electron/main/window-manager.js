/**
 * Window Manager for Desktop Time Machine
 * Controls the primary Electron application window and displays
 */

const { BrowserWindow, screen } = require('electron');
const path = require('path');

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
    backgroundColor: '#008080', // Classic Win95 Teal default
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Allows preload to bridge Node APIs securely
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

  // Handle external navigation prevention
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If it's a web link opened via window.open, don't let it hijack the app window
    return { action: 'deny' };
  });

  // Prevent top-frame navigation away from the local application
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
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
