/**
 * IPC Handlers for Desktop Time Machine
 * Secure bridge between the Electron main process and renderer preload
 */

const { ipcMain, app } = require('electron');
const fs = require('fs');
const path = require('path');

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
    return fsService.getDrives();
  });

  ipcMain.handle('dtm:fs-special-folders', async () => {
    return fsService.getSpecialFolders();
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
}

module.exports = {
  registerIpcHandlers
};
