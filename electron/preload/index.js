/**
 * Desktop Time Machine - Preload Script
 * Safely exposes a controlled bridge to renderer scripts via contextBridge
 */

const { contextBridge, ipcRenderer } = require('electron');

const dtmBridge = {
  // System Info
  getSystemInfo: () => ipcRenderer.invoke('dtm:get-system-info'),

  // Legacy filesystem browsing (kept for backward compatibility with older skins)
  listDirectory: (dirPath) => ipcRenderer.invoke('dtm:list-directory', dirPath),

  // Real filesystem API — shared by every skin
  fs: {
    list: (dirPath) => ipcRenderer.invoke('dtm:fs-list', dirPath),
    stat: (targetPath) => ipcRenderer.invoke('dtm:fs-stat', targetPath),
    read: (targetPath) => ipcRenderer.invoke('dtm:fs-read', targetPath),
    readBinary: (targetPath) => ipcRenderer.invoke('dtm:fs-read-binary', targetPath),
    write: (targetPath, content) => ipcRenderer.invoke('dtm:fs-write', targetPath, content),
    writeBinary: (targetPath, data) => ipcRenderer.invoke('dtm:fs-write-binary', targetPath, data),
    mkdir: (targetPath) => ipcRenderer.invoke('dtm:fs-mkdir', targetPath),
    rename: (targetPath, newName) => ipcRenderer.invoke('dtm:fs-rename', targetPath, newName),
    copy: (srcPath, destPath) => ipcRenderer.invoke('dtm:fs-copy', srcPath, destPath),
    move: (srcPath, destPath) => ipcRenderer.invoke('dtm:fs-move', srcPath, destPath),
    remove: (targetPath) => ipcRenderer.invoke('dtm:fs-remove', targetPath),
    removeRecursive: (targetPath) => ipcRenderer.invoke('dtm:fs-remove-recursive', targetPath),
    exists: (targetPath) => ipcRenderer.invoke('dtm:fs-exists', targetPath),
    getDrives: () => ipcRenderer.invoke('dtm:fs-drives'),
    getSpecialFolders: () => ipcRenderer.invoke('dtm:fs-special-folders'),

    // Phase 4 — real desktop mirroring & system integration
    getDesktop: () => ipcRenderer.invoke('dtm:fs-desktop'),
    resolveShortcut: (targetPath) => ipcRenderer.invoke('dtm:fs-resolve-shortcut', targetPath),
    icon: (targetPath, size) => ipcRenderer.invoke('dtm:fs-icon', targetPath, size),
    recycle: (targetPath) => ipcRenderer.invoke('dtm:fs-recycle', targetPath),
    recycleList: () => ipcRenderer.invoke('dtm:fs-recycle-list'),
    recycleEmpty: () => ipcRenderer.invoke('dtm:fs-recycle-empty'),
    watch: (watchPath) => ipcRenderer.invoke('dtm:fs-watch', watchPath),
    unwatch: (subId) => ipcRenderer.invoke('dtm:fs-unwatch', subId),
    network: () => ipcRenderer.invoke('dtm:fs-network')
  },

  // Real Windows taskbar mirror (pinned apps / running windows / tray items)
  getTaskbar: () => ipcRenderer.invoke('dtm:shell-taskbar'),
  activateWindow: (pid) => ipcRenderer.invoke('dtm:shell-activate-window', pid),
  openTerminal: (dirPath) => ipcRenderer.invoke('dtm:open-terminal', dirPath),

  // File / Path Execution
  openPath: (targetPath) => ipcRenderer.invoke('dtm:open-path', targetPath),

  // External Web Browsing
  openExternalUrl: (url) => ipcRenderer.invoke('dtm:open-external-url', url),

  // Application Launching
  launchProgram: (program) => ipcRenderer.invoke('dtm:launch-program', program),

  // Window Management
  toggleFullScreen: () => ipcRenderer.invoke('dtm:toggle-fullscreen'),
  minimizeWindow: () => ipcRenderer.invoke('dtm:minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('dtm:maximize-window'),
  exitApp: () => ipcRenderer.invoke('dtm:exit-app'),

  // Event subscription (used for live filesystem watch notifications)
  on: (channel, callback) => ipcRenderer.on(channel, (_event, ...args) => callback(...args)),

  // Skin Management
  getAvailableSkins: () => ipcRenderer.invoke('dtm:get-available-skins'),

  // Manifest Validation
  validateManifest: (manifest, skinFolderName) => ipcRenderer.invoke('dtm:validate-manifest', manifest, skinFolderName)
};

// Expose safe API to the renderer process
contextBridge.exposeInMainWorld('dtmPreload', dtmBridge);
