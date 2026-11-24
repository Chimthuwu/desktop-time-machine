/**
 * IPC Handlers for Desktop Time Machine
 * Secure bridge between the Electron main process and renderer preload
 */

const { ipcMain, app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { isSafePath, isTrustedRendererUrl } = require('../security/permissions');
const browser = require('./browser');

// Required manifest fields for a skin to be considered valid
const MANIFEST_REQUIRED_FIELDS = ['id', 'name', 'era', 'version', 'entry', 'engineCompatibility', 'status'];
// Allowed status values
const MANIFEST_VALID_STATUSES = ['ready', 'roadmap', 'beta', 'deprecated'];

/**
 * Validates a parsed manifest object against the DTM Skin SDK spec.
 * Returns { valid: boolean, errors: string[] }
 */
function validateManifest(manifest, skinFolderName) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { valid: false, errors: ['Manifest must be a JSON object'] };
  }

  // Required fields
  for (const field of MANIFEST_REQUIRED_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  // ID must match folder name for predictability
  if (manifest.id && manifest.id !== skinFolderName) {
    errors.push(`Manifest id "${manifest.id}" does not match folder name "${skinFolderName}"`);
  }

  // Status must be a known value
  if (manifest.status && !MANIFEST_VALID_STATUSES.includes(manifest.status)) {
    errors.push(`Unknown status "${manifest.status}". Must be one of: ${MANIFEST_VALID_STATUSES.join(', ')}`);
  }

  // Optional metadata must have the right shape. Bad values degrade
  // gracefully instead of breaking the switcher.
  for (const field of ['name', 'era', 'period', 'version', 'description', 'author', 'icon', 'themeColor']) {
    if (manifest[field] !== undefined && typeof manifest[field] !== 'string') {
      errors.push(`"${field}" must be a string`);
    }
  }
  if (manifest.icon === '') errors.push(`"icon" must not be empty`);
  if (manifest.previewImage !== undefined && manifest.previewImage !== null && typeof manifest.previewImage !== 'string') {
    errors.push(`"previewImage" must be a string or null`);
  }

  // capabilities must be an array of strings if present
  if (manifest.capabilities !== undefined) {
    if (!Array.isArray(manifest.capabilities)) {
      errors.push(`"capabilities" must be an array`);
    } else if (manifest.capabilities.some((capability) => typeof capability !== 'string')) {
      errors.push(`"capabilities" must contain only strings`);
    }
  }

  // entry must not contain path separators (security: cannot escape skin directory)
  if (manifest.entry && (/[/\\]/.test(manifest.entry) || !/^[\w.-]+\.html$/i.test(manifest.entry))) {
    errors.push(`"entry" must be a .html filename only (no path separators)`);
  }

  // engineCompatibility must be a semver-like string
  if (manifest.engineCompatibility && !/^\d+\.\d+/.test(manifest.engineCompatibility)) {
    errors.push(`"engineCompatibility" must be in semver format (e.g. "1.0")`);
  }

  return { valid: errors.length === 0, errors };
}
const {
  getSystemInfo,
  getAccountPicture,
  openPath,
  openExternalUrl,
  launchProgram
} = require('./system-integration');
const fsService = require('./filesystem-service');
const desktopIntegration = require('./desktop-integration');
const desktopLayout = require('./desktop-layout');
const { getMainWindow, toggleFullScreen } = require('./window-manager');

function registerIpcHandlers() {
  const FS_PATH_LIMIT = 1024;
  const APP_ROOT = path.resolve(__dirname, '../..');

  /**
   * Every IPC channel is restricted to the application's own local window.
   * Guest webviews (remote sites) never receive the preload bridge and must
   * not be able to reach filesystem, shell or system handlers.
   */
  function handle(channel, listener) {
    ipcMain.handle(channel, (event, ...args) => {
      let senderUrl = '';
      try { senderUrl = event && event.sender && !event.sender.isDestroyed() ? event.sender.getURL() : ''; } catch {}
      if (!isTrustedRendererUrl(senderUrl, APP_ROOT)) {
        throw new Error('Unauthorized IPC sender');
      }
      return listener(event, ...args);
    });
  }

  /**
   * Validates an optional/required filesystem path argument coming from IPC.
   * @param {*} value
   * @param {string} name
   */
  function assertPathArg(value, name) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      throw new Error(`Invalid argument: ${name} must be a string`);
    }
    if (typeof value === 'string' && value.length > FS_PATH_LIMIT) {
      throw new Error(`Invalid argument: ${name} exceeds maximum length of ${FS_PATH_LIMIT} characters`);
    }
  }

  // System Info
  handle('dtm:get-system-info', async () => {
    return getSystemInfo();
  });

  handle('dtm:system-account-picture', async () => getAccountPicture());

  // Filesystem Browsing (legacy shape used by Windows 95/98 Explorer)
  handle('dtm:list-directory', async (_event, dirPath) => {
    assertPathArg(dirPath, 'dirPath');
    const result = await fsService.listDirectory(dirPath);
    return {
      currentPath: result.path,
      parentPath: result.parentPath,
      items: result.items,
      truncated: result.truncated
    };
  });

  // -----------------------------------------------------------------------
  // Real filesystem API — one shared backend for every skin
  // -----------------------------------------------------------------------
  handle('dtm:fs-list', async (_event, dirPath) => {
    assertPathArg(dirPath, 'dirPath');
    return fsService.listDirectory(dirPath);
  });

  handle('dtm:fs-stat', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.statPath(targetPath);
  });

  handle('dtm:fs-read', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.readFileText(targetPath);
  });

  handle('dtm:fs-read-binary', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.readFileBinary(targetPath);
  });

  handle('dtm:fs-write', async (_event, targetPath, content) => {
    assertPathArg(targetPath, 'targetPath');
    if (typeof content !== 'string') {
      throw new Error('Invalid argument: content must be a string');
    }
    return fsService.writeFileText(targetPath, content);
  });

  handle('dtm:fs-write-binary', async (_event, targetPath, data) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.writeFileBinary(targetPath, data);
  });

  handle('dtm:fs-mkdir', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.makeDirectory(targetPath);
  });

  handle('dtm:fs-rename', async (_event, targetPath, newName) => {
    assertPathArg(targetPath, 'targetPath');
    if (typeof newName !== 'string' || newName.length === 0) {
      throw new Error('Invalid argument: newName must be a non-empty string');
    }
    if (newName.length > 255) {
      throw new Error('Invalid argument: newName exceeds 255 characters');
    }
    return fsService.renamePath(targetPath, newName);
  });

  handle('dtm:fs-copy', async (_event, srcPath, destPath) => {
    assertPathArg(srcPath, 'srcPath');
    assertPathArg(destPath, 'destPath');
    return fsService.copyPath(srcPath, destPath);
  });

  handle('dtm:fs-move', async (_event, srcPath, destPath) => {
    assertPathArg(srcPath, 'srcPath');
    assertPathArg(destPath, 'destPath');
    return fsService.movePath(srcPath, destPath);
  });

  handle('dtm:fs-remove', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.removePath(targetPath);
  });

  handle('dtm:fs-remove-recursive', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.removeRecursive(targetPath);
  });

  handle('dtm:fs-exists', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.existsPath(targetPath);
  });

  handle('dtm:fs-drives', async () => {
    // Use the enhanced drive enumeration (real labels, types, capacity) with a
    // graceful Node fallback inside desktop-integration.
    return desktopIntegration.getEnhancedDrives();
  });

  handle('dtm:fs-special-folders', async () => {
    const folders = fsService.getSpecialFolders();
    try {
      const desktopPaths = await desktopIntegration.getDesktopPaths();
      if (desktopPaths.user) folders.desktop = desktopPaths.user;
      if (desktopPaths.public) folders.publicDesktop = desktopPaths.public;
    } catch {
      // Keep the environment-based result if known-folder discovery fails.
    }
    return folders;
  });

  // -----------------------------------------------------------------------
  // Real Desktop mirroring (Phase 4)
  // -----------------------------------------------------------------------

  // Combined listing of every real Desktop location (User, redirected
  // OneDrive Desktop, Public), de-duplicated by item name.
  handle('dtm:fs-desktop', async () => {
    const started = Date.now();
    const dbg = process.env.DTM_DESKTOP_DEBUG === '1';
    try {
      const paths = await desktopIntegration.getDesktopPaths();
      const dirs = [];
      const pushDir = (d) => {
        if (!d) return;
        const resolved = path.resolve(d);
        if (!dirs.some((x) => x.toLowerCase() === resolved.toLowerCase())) dirs.push(resolved);
      };
      pushDir(paths.user);
      pushDir(paths.public);
      (paths.all || []).forEach(pushDir);

      const seen = new Set();
      const items = [];
      const errors = [];
      for (const dir of dirs) {
        let result;
        const dirStarted = Date.now();
        try {
          result = await fsService.listDirectory(dir);
        } catch (err) {
          errors.push({ path: dir, error: err.message });
          continue;
        }
        if (dbg) console.log('[dtm:desktop] list', dir, Date.now() - dirStarted + 'ms', result.items.length + ' items');
        for (const it of result.items) {
          const key = path.basename(it.path).toLowerCase();
          if (seen.has(key)) continue; // de-duplicate Public/redirected copies
          seen.add(key);
          const isShortcut = /\.(lnk|url)$/i.test(it.name);
          items.push({
            name: it.name,
            path: it.path,
            dir,
            isDirectory: it.isDirectory,
            isFile: it.isFile,
            isShortcut,
            // Shortcut targets are resolved lazily (open / properties) so the
            // desktop render never waits on a shell call per item.
            target: null,
            extension: path.extname(it.name).slice(1).toLowerCase(),
            hidden: it.hidden,
            size: it.size,
            modified: it.modified
          });
        }
      }
      items.sort((a, b) => {
        const ad = a.isDirectory ? 0 : 1;
        const bd = b.isDirectory ? 0 : 1;
        if (ad !== bd) return ad - bd;
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      });
      return { desktopPaths: paths, items, errors };
    } catch (err) {
      throw new Error('Could not read desktop: ' + err.message);
    } finally {
      if (dbg) console.log('[dtm:desktop] total', Date.now() - started + 'ms');
    }
  });

  // Real desktop icon layout (names + positions from IFolderView2).
  handle('dtm:fs-desktop-layout', async () => {
    return desktopLayout.getDesktopLayout();
  });

  handle('dtm:fs-desktop-layout-reset', async () => {
    desktopLayout.invalidate();
    return true;
  });

  // Resolve a real .lnk / .url shortcut target.
  handle('dtm:fs-resolve-shortcut', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return desktopIntegration.resolveShortcut(targetPath);
  });

  // Extract the ACTUAL Windows shell icon for a path as a PNG data URL.
  handle('dtm:fs-icon', async (_event, targetPath, size) => {
    assertPathArg(targetPath, 'targetPath');
    const iconSize = Number(size) === 16 || Number(size) === 48 ? Number(size) : 32;
    // Artwork can live far from the desktop (a shortcut's IconLocation), so the
    // file that gets drawn is watched from here — see watchIconFile.
    desktopIntegration.getIconSource(targetPath)
      .then((source) => { if (source) watchIconFile(source); })
      .catch(() => {});
    return desktopIntegration.getFileIcon(targetPath, iconSize);
  });

  // A .ico drawn somewhere outside the watched desktop folders is watched
  // through its own directory, so editing that art updates the desktop icons
  // without a manual Refresh.
  const iconDirWatches = new Map();
  let iconsChangedTimer = null;

  function broadcastIconsChanged() {
    clearTimeout(iconsChangedTimer);
    iconsChangedTimer = setTimeout(() => {
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send('dtm:fs-icons-changed');
      });
    }, 250);
  }

  function watchIconFile(iconPath) {
    if (!/\.ico$/i.test(String(iconPath))) return;
    const dir = path.dirname(iconPath);
    const name = path.basename(iconPath).toLowerCase();
    const key = dir.toLowerCase();
    const existing = iconDirWatches.get(key);
    if (existing) {
      existing.names.add(name);
      return;
    }
    const names = new Set([name]);
    let watcher;
    try {
      // Watching the directory (rather than the file) survives the icon being
      // replaced by a rename, which is how most icon editors save.
      watcher = fs.watch(dir, { recursive: false }, (_evt, filename) => {
        if (filename && !names.has(String(filename).toLowerCase())) return;
        broadcastIconsChanged();
      });
    } catch {
      return;
    }
    const entry = { watcher, names };
    watcher.on('error', () => {
      try { watcher.close(); } catch {}
      iconDirWatches.delete(key);
    });
    iconDirWatches.set(key, entry);
    if (process.env.DTM_DESKTOP_DEBUG === '1') {
      console.log('[dtm:watch-icons] add', dir, 'icons=' + names.size);
    }
  }

  // Pick a local audio/video file for the retro Windows Media Player.
  handle('dtm:fs-pick-media', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Media',
      properties: ['openFile'],
      filters: [
        // Formats the embedded Chromium engine can actually decode.
        { name: 'Media Files', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    return {
      path: filePath,
      name: path.basename(filePath),
      // The shell document is loaded from file://, so a file URL loads directly.
      url: pathToFileURL(filePath).href
    };
  });

  // Several media files at once (the player's playlist).
  handle('dtm:fs-pick-media-many', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media Files', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return [];
    return result.filePaths.map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
      url: pathToFileURL(filePath).href
    }));
  });

  // Pick replacement icon art for a shortcut (Properties > Change Icon).
  handle('dtm:fs-pick-icon', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Change Icon',
      properties: ['openFile'],
      filters: [
        { name: 'Icons', extensions: ['ico'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // Re-point a shortcut at another icon file.
  handle('dtm:fs-set-shortcut-icon', async (_event, targetPath, iconPath) => {
    assertPathArg(targetPath, 'targetPath');
    assertPathArg(iconPath, 'iconPath');
    const result = await desktopIntegration.setShortcutIcon(targetPath, iconPath);
    // The new artwork may live anywhere, so start watching it right away.
    if (result && result.icon) watchIconFile(result.icon);
    return result;
  });

  // Safe recycle-bin delete (moves the real file to the Recycle Bin).
  handle('dtm:fs-recycle', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return desktopIntegration.recycleItem(targetPath);
  });

  // Enumerate the real Recycle Bin.
  handle('dtm:fs-recycle-list', async () => {
    return desktopIntegration.listRecycleBin();
  });

  // Empty the real Recycle Bin.
  handle('dtm:fs-recycle-empty', async () => {
    return desktopIntegration.emptyRecycleBin();
  });

  // -----------------------------------------------------------------------
  // Real-time filesystem watching (live desktop updates)
  // -----------------------------------------------------------------------
  const watchers = new Map();
  const wcDestroyBound = new WeakSet();
  let watchSeq = 0;

  handle('dtm:fs-watch', (event, watchPath) => {
    assertPathArg(watchPath, 'watchPath');
    if (!isSafePath(watchPath)) {
      throw new Error('Access denied: path outside permitted boundaries');
    }
    const wc = event.sender;
    const id = 'w' + (++watchSeq);
    let watcher;
    try {
      watcher = fs.watch(watchPath, { recursive: false }, (_evt, filename) => {
        // Desktop changes can move icons; drop the cached layout snapshot.
        desktopLayout.invalidate();
        if (wc && !wc.isDestroyed()) {
          wc.send('dtm:fs-changed', { id, path: watchPath, filename: filename || null });
        }
      });
    } catch (err) {
      throw new Error('Could not watch path: ' + err.message);
    }
    const entry = { watcher, wc };
    const cleanup = () => {
      try { watcher.close(); } catch {}
      watchers.delete(id);
      if (process.env.DTM_DESKTOP_DEBUG === '1') {
        console.log('[dtm:watch] drop', id, 'active=' + watchers.size);
      }
    };
    entry.cleanup = cleanup;
    watchers.set(id, entry);
    // A single destroyed-listener per WebContents closes every watcher it owns.
    if (!wcDestroyBound.has(wc)) {
      wcDestroyBound.add(wc);
      wc.once('destroyed', () => {
        wcDestroyBound.delete(wc);
        for (const [, w] of watchers) {
          if (w.wc === wc) w.cleanup();
        }
      });
    }
    if (process.env.DTM_DESKTOP_DEBUG === '1') {
      console.log('[dtm:watch] add', id, watchPath, 'active=' + watchers.size);
    }
    return id;
  });

  handle('dtm:fs-unwatch', (_event, id) => {
    const entry = watchers.get(id);
    if (entry) entry.cleanup();
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // Network Neighborhood + real Windows taskbar mirror + terminal
  // -----------------------------------------------------------------------
  handle('dtm:fs-network', async () => {
    return desktopIntegration.getNetworkLocations();
  });

  handle('dtm:shell-taskbar', async () => {
    return desktopIntegration.getTaskbarState();
  });

  handle('dtm:shell-tray-invoke', async (_event, name) => {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
      throw new Error('Invalid argument: name must be a tray item label');
    }
    return desktopIntegration.invokeTrayItem(name);
  });

  handle('dtm:shell-tray-overflow', async () => {
    return desktopIntegration.toggleTrayOverflow();
  });

  handle('dtm:shell-tray-overflow-click', async (_event, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error('Invalid coordinates');
    }
    return desktopIntegration.clickTrayOverflowAt(x, y);
  });

  handle('dtm:system-volume-get', async () => {
    return desktopIntegration.getSystemVolume();
  });

  handle('dtm:system-volume-set', async (_event, level, muted) => {
    if (typeof level !== 'number' || !Number.isFinite(level)) {
      throw new Error('Invalid argument: level must be a number');
    }
    return desktopIntegration.setSystemVolume(level, muted === null ? null : !!muted);
  });

  handle('dtm:shell-activate-window', async (_event, pid) => {
    if (typeof pid !== 'number' || !Number.isFinite(pid)) {
      throw new Error('Invalid argument: pid must be a number');
    }
    return desktopIntegration.activateWindow(pid);
  });

  handle('dtm:open-terminal', async (_event, dirPath) => {
    assertPathArg(dirPath, 'dirPath');
    return desktopIntegration.openTerminal(dirPath);
  });

  handle('dtm:terminal-run', async (_event, command, cwd) => {
    if (typeof command !== 'string') throw new Error('Invalid argument: command must be a string');
    assertPathArg(cwd, 'cwd');
    return desktopIntegration.runTerminalCommand(command, cwd);
  });

  // Open Path
  handle('dtm:open-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || targetPath.length === 0 || targetPath.length > 1024) {
      throw new Error('Invalid argument: targetPath must be a non-empty string under 1024 characters');
    }
    return openPath(targetPath);
  });

  // Open External URL
  handle('dtm:open-external-url', async (_event, url) => {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
      throw new Error('Invalid argument: url must be a non-empty string under 2048 characters');
    }
    return openExternalUrl(url);
  });

  // Launch Program
  handle('dtm:launch-program', async (_event, program) => {
    if (typeof program !== 'string' || program.length === 0 || program.length > 64) {
      throw new Error('Invalid argument: program must be a valid executable name under 64 characters');
    }
    return launchProgram(program);
  });

  // Window Controls
  handle('dtm:toggle-fullscreen', async () => {
    return toggleFullScreen();
  });

  handle('dtm:exit-app', async () => {
    app.quit();
    return { success: true };
  });

  handle('dtm:minimize-window', async () => {
    const win = getMainWindow();
    if (win) win.minimize();
    return { success: true };
  });

  handle('dtm:maximize-window', async () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
    return { success: true };
  });

  // Load Available Skins
  handle('dtm:get-available-skins', async () => {
    const skinsDir = path.join(__dirname, '../../src/skins');
    const skins = [];

    try {
      if (fs.existsSync(skinsDir)) {
        const entries = await fs.promises.readdir(skinsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const manifestPath = path.join(skinsDir, entry.name, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
              try {
                const manifestContent = await fs.promises.readFile(manifestPath, 'utf8');
                const manifest = JSON.parse(manifestContent);

                // Validate manifest against SDK spec
                const validation = validateManifest(manifest, entry.name);
                if (!validation.valid) {
                  console.warn(`[DTM] Skin "${entry.name}" has manifest validation warnings:`, validation.errors);
                }

                // A manifest can be well formed but point at a missing entry
                // file. Report it clearly; do not prevent other skins loading.
                if (typeof manifest.entry === 'string' && !/[/\\]/.test(manifest.entry)) {
                  const entryFile = path.join(skinsDir, entry.name, manifest.entry);
                  if (!fs.existsSync(entryFile)) {
                    validation.valid = false;
                    validation.errors.push(`Entry file is missing: ${manifest.entry}`);
                    console.warn(`[DTM] Skin "${entry.name}" entry file is missing: ${manifest.entry}`);
                  }
                }

                skins.push({
                  id: entry.name,
                  ...manifest,
                  folder: entry.name,
                  _manifestValid: validation.valid,
                  _manifestErrors: validation.errors
                });
              } catch (parseErr) {
                console.error(`Error parsing manifest for skin ${entry.name}:`, parseErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load skins directory:', err);
    }

    return skins;
  });

  // Manifest Validation — called by skin manager to validate a manifest before loading
  handle('dtm:validate-manifest', async (_event, manifest, skinFolderName) => {
    if (typeof manifest !== 'object' || manifest === null) {
      return { valid: false, errors: ['manifest must be a JSON object'] };
    }
    if (typeof skinFolderName !== 'string') {
      return { valid: false, errors: ['skinFolderName must be a string'] };
    }
    return validateManifest(manifest, skinFolderName);
  });

  // Retro "Internet Explorer" — a docked, real Chromium (or Waterfox) window.
  handle('dtm:waterfox-status', async () => browser.status());
  handle('dtm:browser-ensure', async () => browser.ensure());
  handle('dtm:waterfox-open', async (_event, url) => browser.open(url));
  handle('dtm:waterfox-new-tab', async (_event, url) => browser.newTab(url));
  handle('dtm:waterfox-switch-tab', async (_event, tabId) => browser.switchTab(tabId));
  handle('dtm:waterfox-close-tab', async (_event, tabId) => browser.closeTab(tabId));
  handle('dtm:waterfox-get-tabs', async () => browser.getTabs());
  handle('dtm:waterfox-navigate', async (_event, url) => browser.navigate(url));
  handle('dtm:waterfox-reload', async () => browser.reload());
  handle('dtm:waterfox-history', async (_event, delta) => browser.history(Number(delta)));
  handle('dtm:waterfox-state', async () => browser.state());
  handle('dtm:waterfox-dock', async (_event, rect) => browser.dock(rect));
  handle('dtm:waterfox-show', async () => browser.show());
  handle('dtm:waterfox-hide', async () => browser.hide());
  handle('dtm:waterfox-raise', async () => browser.raise());
  handle('dtm:waterfox-close', async () => browser.close());

  app.on('before-quit', () => {
    try { browser.dispose(); } catch (e) { /* already gone */ }
  });
}

module.exports = {
  registerIpcHandlers
};
