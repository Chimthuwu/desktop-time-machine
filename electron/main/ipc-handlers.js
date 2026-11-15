/**
 * IPC Handlers for Desktop Time Machine
 * Secure bridge between the Electron main process and renderer preload
 */

const { ipcMain, app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { isSafePath } = require('../security/permissions');
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

  // capabilities must be an array if present
  if (manifest.capabilities !== undefined && !Array.isArray(manifest.capabilities)) {
    errors.push(`"capabilities" must be an array`);
  }

  // entry must not contain path separators (security: cannot escape skin directory)
  if (manifest.entry && /[/\\]/.test(manifest.entry)) {
    errors.push(`"entry" must be a filename only (no path separators)`);
  }

  // engineCompatibility must be a semver-like string
  if (manifest.engineCompatibility && !/^\d+\.\d+/.test(manifest.engineCompatibility)) {
    errors.push(`"engineCompatibility" must be in semver format (e.g. "1.0")`);
  }

  return { valid: errors.length === 0, errors };
}
const {
  getSystemInfo,
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
  ipcMain.handle('dtm:get-system-info', async () => {
    return getSystemInfo();
  });

  // Filesystem Browsing (legacy shape used by Windows 95/98 Explorer)
  ipcMain.handle('dtm:list-directory', async (_event, dirPath) => {
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
  ipcMain.handle('dtm:fs-list', async (_event, dirPath) => {
    assertPathArg(dirPath, 'dirPath');
    return fsService.listDirectory(dirPath);
  });

  ipcMain.handle('dtm:fs-stat', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.statPath(targetPath);
  });

  ipcMain.handle('dtm:fs-read', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.readFileText(targetPath);
  });

  ipcMain.handle('dtm:fs-read-binary', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.readFileBinary(targetPath);
  });

  ipcMain.handle('dtm:fs-write', async (_event, targetPath, content) => {
    assertPathArg(targetPath, 'targetPath');
    if (typeof content !== 'string') {
      throw new Error('Invalid argument: content must be a string');
    }
    return fsService.writeFileText(targetPath, content);
  });

  ipcMain.handle('dtm:fs-write-binary', async (_event, targetPath, data) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.writeFileBinary(targetPath, data);
  });

  ipcMain.handle('dtm:fs-mkdir', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.makeDirectory(targetPath);
  });

  ipcMain.handle('dtm:fs-rename', async (_event, targetPath, newName) => {
    assertPathArg(targetPath, 'targetPath');
    if (typeof newName !== 'string' || newName.length === 0) {
      throw new Error('Invalid argument: newName must be a non-empty string');
    }
    if (newName.length > 255) {
      throw new Error('Invalid argument: newName exceeds 255 characters');
    }
    return fsService.renamePath(targetPath, newName);
  });

  ipcMain.handle('dtm:fs-copy', async (_event, srcPath, destPath) => {
    assertPathArg(srcPath, 'srcPath');
    assertPathArg(destPath, 'destPath');
    return fsService.copyPath(srcPath, destPath);
  });

  ipcMain.handle('dtm:fs-move', async (_event, srcPath, destPath) => {
    assertPathArg(srcPath, 'srcPath');
    assertPathArg(destPath, 'destPath');
    return fsService.movePath(srcPath, destPath);
  });

  ipcMain.handle('dtm:fs-remove', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.removePath(targetPath);
  });

  ipcMain.handle('dtm:fs-remove-recursive', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.removeRecursive(targetPath);
  });

  ipcMain.handle('dtm:fs-exists', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return fsService.existsPath(targetPath);
  });

  ipcMain.handle('dtm:fs-drives', async () => {
    // Use the enhanced drive enumeration (real labels, types, capacity) with a
    // graceful Node fallback inside desktop-integration.
    return desktopIntegration.getEnhancedDrives();
  });

  ipcMain.handle('dtm:fs-special-folders', async () => {
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
  ipcMain.handle('dtm:fs-desktop', async () => {
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
  ipcMain.handle('dtm:fs-desktop-layout', async () => {
    return desktopLayout.getDesktopLayout();
  });

  ipcMain.handle('dtm:fs-desktop-layout-reset', async () => {
    desktopLayout.invalidate();
    return true;
  });

  // Resolve a real .lnk / .url shortcut target.
  ipcMain.handle('dtm:fs-resolve-shortcut', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return desktopIntegration.resolveShortcut(targetPath);
  });

  // Extract the ACTUAL Windows shell icon for a path as a PNG data URL.
  ipcMain.handle('dtm:fs-icon', async (_event, targetPath, size) => {
    assertPathArg(targetPath, 'targetPath');
    const iconSize = Number(size) === 16 || Number(size) === 48 ? Number(size) : 32;
    return desktopIntegration.getFileIcon(targetPath, iconSize);
  });

  // Pick a local audio/video file for the retro Windows Media Player.
  ipcMain.handle('dtm:fs-pick-media', async () => {
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

  // Safe recycle-bin delete (moves the real file to the Recycle Bin).
  ipcMain.handle('dtm:fs-recycle', async (_event, targetPath) => {
    assertPathArg(targetPath, 'targetPath');
    return desktopIntegration.recycleItem(targetPath);
  });

  // Enumerate the real Recycle Bin.
  ipcMain.handle('dtm:fs-recycle-list', async () => {
    return desktopIntegration.listRecycleBin();
  });

  // Empty the real Recycle Bin.
  ipcMain.handle('dtm:fs-recycle-empty', async () => {
    return desktopIntegration.emptyRecycleBin();
  });

  // -----------------------------------------------------------------------
  // Real-time filesystem watching (live desktop updates)
  // -----------------------------------------------------------------------
  const watchers = new Map();
  const wcDestroyBound = new WeakSet();
  let watchSeq = 0;

  ipcMain.handle('dtm:fs-watch', (event, watchPath) => {
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

  ipcMain.handle('dtm:fs-unwatch', (_event, id) => {
    const entry = watchers.get(id);
    if (entry) entry.cleanup();
    return { success: true };
  });

  // -----------------------------------------------------------------------
  // Network Neighborhood + real Windows taskbar mirror + terminal
  // -----------------------------------------------------------------------
  ipcMain.handle('dtm:fs-network', async () => {
    return desktopIntegration.getNetworkLocations();
  });

  ipcMain.handle('dtm:shell-taskbar', async () => {
    return desktopIntegration.getTaskbarState();
  });

  ipcMain.handle('dtm:shell-tray-invoke', async (_event, name) => {
    if (typeof name !== 'string' || !name.trim() || name.length > 200) {
      throw new Error('Invalid argument: name must be a tray item label');
    }
    return desktopIntegration.invokeTrayItem(name);
  });

  ipcMain.handle('dtm:shell-activate-window', async (_event, pid) => {
    if (typeof pid !== 'number' || !Number.isFinite(pid)) {
      throw new Error('Invalid argument: pid must be a number');
    }
    return desktopIntegration.activateWindow(pid);
  });

  ipcMain.handle('dtm:open-terminal', async (_event, dirPath) => {
    assertPathArg(dirPath, 'dirPath');
    return desktopIntegration.openTerminal(dirPath);
  });

  ipcMain.handle('dtm:terminal-run', async (_event, command, cwd) => {
    if (typeof command !== 'string') throw new Error('Invalid argument: command must be a string');
    assertPathArg(cwd, 'cwd');
    return desktopIntegration.runTerminalCommand(command, cwd);
  });

  // Open Path
  ipcMain.handle('dtm:open-path', async (_event, targetPath) => {
    if (typeof targetPath !== 'string' || targetPath.length === 0 || targetPath.length > 1024) {
      throw new Error('Invalid argument: targetPath must be a non-empty string under 1024 characters');
    }
    return openPath(targetPath);
  });

  // Open External URL
  ipcMain.handle('dtm:open-external-url', async (_event, url) => {
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
      throw new Error('Invalid argument: url must be a non-empty string under 2048 characters');
    }
    return openExternalUrl(url);
  });

  // Launch Program
  ipcMain.handle('dtm:launch-program', async (_event, program) => {
    if (typeof program !== 'string' || program.length === 0 || program.length > 64) {
      throw new Error('Invalid argument: program must be a valid executable name under 64 characters');
    }
    return launchProgram(program);
  });

  // Window Controls
  ipcMain.handle('dtm:toggle-fullscreen', async () => {
    return toggleFullScreen();
  });

  ipcMain.handle('dtm:exit-app', async () => {
    app.quit();
    return { success: true };
  });

  ipcMain.handle('dtm:minimize-window', async () => {
    const win = getMainWindow();
    if (win) win.minimize();
    return { success: true };
  });

  ipcMain.handle('dtm:maximize-window', async () => {
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
  ipcMain.handle('dtm:get-available-skins', async () => {
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
  ipcMain.handle('dtm:validate-manifest', async (_event, manifest, skinFolderName) => {
    if (typeof manifest !== 'object' || manifest === null) {
      return { valid: false, errors: ['manifest must be a JSON object'] };
    }
    if (typeof skinFolderName !== 'string') {
      return { valid: false, errors: ['skinFolderName must be a string'] };
    }
    return validateManifest(manifest, skinFolderName);
  });

  // Retro "Internet Explorer" — a docked, real Chromium (or Waterfox) window.
  ipcMain.handle('dtm:waterfox-status', async () => browser.status());
  ipcMain.handle('dtm:waterfox-open', async (_event, url) => browser.open(url));
  ipcMain.handle('dtm:waterfox-navigate', async (_event, url) => browser.navigate(url));
  ipcMain.handle('dtm:waterfox-reload', async () => browser.reload());
  ipcMain.handle('dtm:waterfox-history', async (_event, delta) => browser.history(Number(delta)));
  ipcMain.handle('dtm:waterfox-state', async () => browser.state());
  ipcMain.handle('dtm:waterfox-dock', async (_event, rect) => browser.dock(rect));
  ipcMain.handle('dtm:waterfox-show', async () => browser.show());
  ipcMain.handle('dtm:waterfox-hide', async () => browser.hide());
  ipcMain.handle('dtm:waterfox-raise', async () => browser.raise());
  ipcMain.handle('dtm:waterfox-close', async () => browser.close());

  app.on('before-quit', () => {
    try { browser.dispose(); } catch (e) { /* already gone */ }
  });
}

module.exports = {
  registerIpcHandlers
};
