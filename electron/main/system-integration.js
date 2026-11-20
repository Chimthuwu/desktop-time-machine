/**
 * System Integration Layer for Desktop Time Machine
 * Safe bridges to the underlying Windows host
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { shell } = require('electron');
const { spawn } = require('child_process');
const { isSafePath, isProtectedPath, isSafeExternalUrl, isApprovedProgram, getPinnedExecutablePath } = require('../security/permissions');

/**
 * Returns safe system information about the host
 */
function getSystemInfo() {
  const totalMem = Math.round(os.totalmem() / (1024 * 1024));
  const freeMem = Math.round(os.freemem() / (1024 * 1024));
  return {
    platform: os.platform(),
    release: os.release(),
    type: os.type(),
    arch: os.arch(),
    hostname: os.hostname(),
    username: os.userInfo().username,
    homeDir: os.homedir(),
    totalMemoryMB: totalMem,
    freeMemoryMB: freeMem,
    uptimeSeconds: Math.round(os.uptime())
  };
}

/**
 * Lists contents of a directory safely
 * @param {string} dirPath 
 */
async function listDirectory(dirPath) {
  const target = dirPath ? path.resolve(dirPath) : os.homedir();
  if (!isSafePath(target)) {
    throw new Error('Access denied: Path outside permitted boundaries');
  }

  try {
    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    const items = [];

    for (const entry of entries) {
      try {
        const fullPath = path.join(target, entry.name);
        const stats = await fs.promises.stat(fullPath);
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: stats.size,
          modified: stats.mtime
        });
      } catch (e) {
        // Skip unreadable or permission-restricted files
        items.push({
          name: entry.name,
          path: path.join(target, entry.name),
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: 0,
          error: 'Access restricted'
        });
      }
    }

    return {
      currentPath: target,
      parentPath: path.dirname(target) !== target ? path.dirname(target) : null,
      items
    };
  } catch (err) {
    throw new Error(`Failed to read directory: ${err.message}`);
  }
}

/**
 * Opens a file or path using the default Windows application
 * @param {string} targetPath 
 */
async function openPath(targetPath) {
  if (!isSafePath(targetPath) || isProtectedPath(targetPath, { destructive: true })) {
    throw new Error('Access denied: Invalid target path');
  }
  const errorMessage = await shell.openPath(targetPath);
  if (errorMessage) {
    throw new Error(errorMessage);
  }
  return { success: true };
}

/**
 * Opens an external web URL in the user's default browser
 * @param {string} urlString 
 */
async function openExternalUrl(urlString) {
  if (!isSafeExternalUrl(urlString)) {
    throw new Error('Access denied: Only HTTP and HTTPS URLs are permitted');
  }
  await shell.openExternal(urlString);
  return { success: true };
}

/**
 * Launches an approved external Windows application
 * @param {string} program 
 */
function launchProgram(program) {
  if (!isApprovedProgram(program)) {
    throw new Error(`Access denied: '${program}' is not in the approved program whitelist`);
  }

  const pinnedPath = getPinnedExecutablePath(program);
  if (!pinnedPath || !fs.existsSync(pinnedPath)) {
    throw new Error(`Executable not found at pinned system path`);
  }

  const child = spawn(pinnedPath, [], {
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  return { success: true, program, path: pinnedPath };
}

module.exports = {
  getSystemInfo,
  listDirectory,
  openPath,
  openExternalUrl,
  launchProgram
};
