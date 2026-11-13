/**
 * Desktop Time Machine — Real Host Filesystem Service
 *
 * Single shared filesystem backend for every skin. All operations are
 * validated against the security policy in electron/security/permissions.js
 * and are reached only through validated IPC handlers — renderer processes
 * never touch Node fs APIs directly.
 *
 * Design notes:
 * - Paths are real absolute host paths (Windows). Relative input is resolved
 *   against the user's home directory.
 * - Read operations are allowed anywhere safe (so C: can be browsed).
 * - Write / create operations additionally refuse protected system locations.
 * - Destructive operations additionally refuse drive roots, the user home
 *   root and C:\Users.
 * - Windows hidden-file detection uses a pinned attrib.exe call (no shell,
 *   single wildcard invocation per listing). Falls back to dotfile detection.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const {
  isSafePath,
  isProtectedPath,
  getPinnedSystemBinary
} = require('../security/permissions');

const MAX_TEXT_BYTES = 8 * 1024 * 1024;        // 8 MB text read/write cap
const MAX_BINARY_BYTES = 64 * 1024 * 1024;     // 64 MB binary read/write cap
const MAX_LISTING_ENTRIES = 20000;             // hard cap per directory listing
const ATTRIB_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Path validation helpers
// ---------------------------------------------------------------------------

function resolveTarget(targetPath) {
  return targetPath ? path.resolve(targetPath) : os.homedir();
}

function assertReadable(target) {
  if (!isSafePath(target)) {
    throw new Error('Access denied: path is outside permitted boundaries');
  }
}

function assertWritable(target, { destructive = false } = {}) {
  if (!isSafePath(target)) {
    throw new Error('Access denied: path is outside permitted boundaries');
  }
  if (isProtectedPath(target, { destructive })) {
    throw new Error('Access denied: this location is protected');
  }
}

async function ensureParentDirectory(target) {
  const parent = path.dirname(target);
  try {
    const stats = await fsp.stat(parent);
    if (!stats.isDirectory()) {
      throw new Error(`Not a directory: ${parent}`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Parent directory does not exist: ${parent}`);
    }
    throw new Error(mapFsError(err, parent));
  }
}

function assertSimpleFileName(name) {
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('Invalid argument: name must be a non-empty string');
  }
  if (name.length > 255) {
    throw new Error('Invalid argument: name exceeds 255 characters');
  }
  if (/[\\/]/.test(name)) {
    throw new Error('Invalid argument: name must not contain path separators');
  }
  if (name === '.' || name === '..') {
    throw new Error('Invalid argument: name must not be "." or ".."');
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) {
    throw new Error('Invalid argument: name is a reserved device name');
  }
}

function mapFsError(err, target) {
  switch (err && err.code) {
    case 'ENOENT': return `Not found: ${target}`;
    case 'EACCES':
    case 'EPERM': return `Permission denied: ${target}`;
    case 'ENOTDIR': return `Not a directory: ${target}`;
    case 'EISDIR': return `Expected a file but found a directory: ${target}`;
    case 'ENOTEMPTY': return `Directory not empty: ${target}`;
    case 'EEXIST': return `Already exists: ${target}`;
    case 'EMFILE':
    case 'ENFILE': return 'Too many open files on the host';
    case 'EROFS': return 'The location is read-only';
    case 'EXDEV': return 'Cannot move across drives';
    case 'ENOSPC': return 'No space left on the device';
    default: return (err && err.message) ? err.message : 'Filesystem operation failed';
  }
}

// ---------------------------------------------------------------------------
// Hidden file detection (Windows attribute bit)
// ---------------------------------------------------------------------------

function runAttrib(args) {
  const attrib = getPinnedSystemBinary('attrib.exe');
  if (!attrib) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(attrib, args, {
      encoding: 'utf8',
      timeout: ATTRIB_TIMEOUT_MS,
      windowsHide: true
    }, (err, stdout) => {
      if (err || typeof stdout !== 'string') return resolve(null);
      resolve(stdout);
    });
  });
}

function parseAttribOutput(stdout) {
  const map = new Map();
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line) continue;
    const match = line.match(/([A-Za-z]:\\.*)$/);
    if (!match) continue;
    const attributes = line.slice(0, match.index);
    map.set(path.resolve(match[1]), /\bH\b/.test(attributes));
  }
  return map;
}

async function readHiddenFlags(dirPath) {
  const output = await runAttrib([path.join(dirPath, '*')]);
  if (!output) return null;
  return parseAttribOutput(output);
}

async function readHiddenFlag(filePath) {
  const output = await runAttrib([filePath]);
  if (!output) return null;
  return parseAttribOutput(output).get(path.resolve(filePath)) === true;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

async function statEntry(fullPath, dirent, hidden) {
  try {
    const stats = await fsp.stat(fullPath);
    return {
      name: dirent ? dirent.name : path.basename(fullPath),
      path: fullPath,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymlink: dirent ? dirent.isSymbolicLink() : false,
      size: stats.size,
      modified: stats.mtimeMs,
      created: stats.birthtimeMs,
      hidden: hidden === true
    };
  } catch (err) {
    return {
      name: dirent ? dirent.name : path.basename(fullPath),
      path: fullPath,
      isDirectory: dirent ? dirent.isDirectory() : false,
      isFile: dirent ? dirent.isFile() : false,
      isSymlink: dirent ? dirent.isSymbolicLink() : false,
      size: 0,
      modified: 0,
      created: 0,
      hidden: hidden === true,
      error: mapFsError(err, fullPath)
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lists a real directory. Returns { path, parentPath, items, truncated }.
 */
async function listDirectory(dirPath) {
  const target = resolveTarget(dirPath);
  assertReadable(target);

  try {
    const entries = await fsp.readdir(target, { withFileTypes: true });
    entries.sort((a, b) => {
      const aDir = a.isDirectory() ? 0 : 1;
      const bDir = b.isDirectory() ? 0 : 1;
      if (aDir !== bDir) return aDir - bDir;
      return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
    });

    const hiddenMap = await readHiddenFlags(target);
    const items = [];
    let truncated = false;

    for (const entry of entries) {
      if (items.length >= MAX_LISTING_ENTRIES) {
        truncated = true;
        break;
      }
      const fullPath = path.join(target, entry.name);
      const hidden = hiddenMap ? hiddenMap.get(path.resolve(fullPath)) === true : entry.name.startsWith('.');
      items.push(await statEntry(fullPath, entry, hidden));
    }

    return {
      path: target,
      parentPath: path.dirname(target) !== target ? path.dirname(target) : null,
      items,
      truncated
    };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Returns metadata for a file or directory.
 */
async function statPath(targetPath) {
  const target = resolveTarget(targetPath);
  assertReadable(target);

  try {
    const stats = await fsp.stat(target);
    const hidden = await readHiddenFlag(target);
    return {
      name: path.basename(target),
      path: target,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymlink: stats.isSymbolicLink(),
      size: stats.size,
      modified: stats.mtimeMs,
      created: stats.birthtimeMs,
      hidden: hidden === true
    };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Reads a text file (UTF-8).
 */
async function readFileText(targetPath) {
  const target = resolveTarget(targetPath);
  assertReadable(target);

  let stats;
  try {
    stats = await fsp.stat(target);
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
  if (stats.isDirectory()) {
    throw new Error(`Expected a file but found a directory: ${target}`);
  }
  if (stats.size > MAX_TEXT_BYTES) {
    throw new Error(`File is too large to read as text (${stats.size} bytes). Maximum is ${MAX_TEXT_BYTES} bytes.`);
  }

  try {
    return await fsp.readFile(target, 'utf8');
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Reads a binary file. Resolves to an ArrayBuffer (structured-clone safe).
 */
async function readFileBinary(targetPath) {
  const target = resolveTarget(targetPath);
  assertReadable(target);

  let stats;
  try {
    stats = await fsp.stat(target);
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
  if (stats.isDirectory()) {
    throw new Error(`Expected a file but found a directory: ${target}`);
  }
  if (stats.size > MAX_BINARY_BYTES) {
    throw new Error(`File is too large to read (${stats.size} bytes). Maximum is ${MAX_BINARY_BYTES} bytes.`);
  }

  try {
    const buffer = await fsp.readFile(target);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Writes a UTF-8 text file.
 */
async function writeFileText(targetPath, content) {
  if (typeof content !== 'string') {
    throw new Error('Invalid argument: content must be a string');
  }
  const target = resolveTarget(targetPath);
  assertWritable(target);
  await ensureParentDirectory(target);

  try {
    await fsp.writeFile(target, content, 'utf8');
    return { success: true, path: target, bytes: Buffer.byteLength(content, 'utf8') };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Writes a binary file from an ArrayBuffer / typed array / Buffer.
 */
async function writeFileBinary(targetPath, data) {
  const target = resolveTarget(targetPath);
  assertWritable(target);
  await ensureParentDirectory(target);

  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (ArrayBuffer.isView(data)) {
    buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else {
    throw new Error('Invalid argument: data must be binary (ArrayBuffer or typed array)');
  }

  if (buffer.byteLength > MAX_BINARY_BYTES) {
    throw new Error(`Data is too large to write (${buffer.byteLength} bytes). Maximum is ${MAX_BINARY_BYTES} bytes.`);
  }

  try {
    await fsp.writeFile(target, buffer);
    return { success: true, path: target, bytes: buffer.byteLength };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Creates a directory (recursive).
 */
async function makeDirectory(targetPath) {
  const target = resolveTarget(targetPath);
  assertWritable(target);

  try {
    await fsp.mkdir(target, { recursive: true });
    return { success: true, path: target };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Removes a file or an empty directory.
 */
async function removePath(targetPath) {
  const target = resolveTarget(targetPath);
  assertWritable(target, { destructive: true });

  let stats;
  try {
    stats = await fsp.lstat(target);
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }

  try {
    if (stats.isDirectory() && !stats.isSymbolicLink()) {
      await fsp.rmdir(target);
    } else {
      await fsp.unlink(target);
    }
    return { success: true, path: target };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Removes a file or directory recursively.
 */
async function removeRecursive(targetPath) {
  const target = resolveTarget(targetPath);
  assertWritable(target, { destructive: true });

  try {
    await fsp.rm(target, { recursive: true, force: false });
    return { success: true, path: target };
  } catch (err) {
    throw new Error(mapFsError(err, target));
  }
}

/**
 * Checks whether a path exists.
 */
async function existsPath(targetPath) {
  const target = resolveTarget(targetPath);
  assertReadable(target);
  try {
    await fsp.lstat(target);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw new Error(mapFsError(err, target));
  }
}

async function copyDirectory(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  let skippedSymlinks = 0;
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      skippedSymlinks++;
      continue;
    }
    if (entry.isDirectory()) {
      await copyDirectory(from, to);
    } else if (entry.isFile()) {
      await fsp.copyFile(from, to);
    }
  }
  return skippedSymlinks;
}

/**
 * Copies a file or directory (recursive for directories).
 */
async function copyPath(srcPath, destPath) {
  const src = resolveTarget(srcPath);
  const dest = resolveTarget(destPath);
  assertReadable(src);
  assertWritable(dest);

  let stats;
  try {
    stats = await fsp.stat(src);
  } catch (err) {
    throw new Error(mapFsError(err, src));
  }

  try {
    let skippedSymlinks = 0;
    if (stats.isDirectory()) {
      skippedSymlinks = await copyDirectory(src, dest);
    } else {
      await ensureParentDirectory(dest);
      await fsp.copyFile(src, dest);
    }
    return { success: true, src, dest, skippedSymlinks };
  } catch (err) {
    throw new Error(mapFsError(err, dest));
  }
}

/**
 * Moves or renames a file/directory. Falls back to copy+delete across drives.
 */
async function movePath(srcPath, destPath) {
  const src = resolveTarget(srcPath);
  const dest = resolveTarget(destPath);
  assertWritable(src, { destructive: true });
  assertWritable(dest);
  await ensureParentDirectory(dest);

  try {
    await fsp.rename(src, dest);
    return { success: true, src, dest };
  } catch (err) {
    if (err.code === 'EXDEV') {
      try {
        const result = await copyPath(src, dest);
        await fsp.rm(src, { recursive: true, force: true });
        return { success: true, src, dest, copied: true, skippedSymlinks: result.skippedSymlinks };
      } catch (copyErr) {
        throw new Error(mapFsError(copyErr, dest));
      }
    }
    throw new Error(mapFsError(err, src));
  }
}

/**
 * Renames a file/directory inside its current parent directory.
 */
async function renamePath(srcPath, newName) {
  const src = resolveTarget(srcPath);
  assertSimpleFileName(newName);
  const dest = path.join(path.dirname(src), newName);
  return movePath(src, dest);
}

/**
 * Enumerates available drives (A:–Z:). Missing/empty drives are reported
 * with an error instead of being hidden.
 */
function getDrives() {
  const drives = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      if (!fs.existsSync(root)) continue;
      const stats = fs.statfsSync(root);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bavail;
      drives.push({
        letter,
        path: root,
        label: `${letter}:`,
        totalBytes,
        freeBytes,
        removable: letter === 'A' || letter === 'B'
      });
    } catch (err) {
      drives.push({
        letter,
        path: root,
        label: `${letter}:`,
        error: mapFsError(err, root)
      });
    }
  }
  return drives;
}

/**
 * Resolves the user's real special folders (Desktop, Documents, ...),
 * accounting for OneDrive redirection where possible.
 */
function getSpecialFolders() {
  const home = os.homedir();
  const userProfile = process.env.USERPROFILE || home;
  const oneDrive = process.env.OneDrive || '';
  const oneDriveCommercial = process.env.OneDriveCommercial || process.env.OneDriveConsumer || '';

  const candidates = {
    home: [home],
    desktop: [
      path.join(userProfile, 'Desktop'),
      path.join(oneDrive, 'Desktop'),
      path.join(oneDriveCommercial, 'Desktop'),
      path.join(home, 'Desktop')
    ],
    documents: [
      path.join(userProfile, 'Documents'),
      path.join(oneDrive, 'Documents'),
      path.join(oneDriveCommercial, 'Documents'),
      path.join(home, 'Documents')
    ],
    downloads: [path.join(userProfile, 'Downloads'), path.join(home, 'Downloads')],
    pictures: [
      path.join(userProfile, 'Pictures'),
      path.join(oneDrive, 'Pictures'),
      path.join(home, 'Pictures')
    ],
    music: [path.join(userProfile, 'Music'), path.join(home, 'Music')],
    videos: [
      path.join(userProfile, 'Videos'),
      path.join(oneDrive, 'Videos'),
      path.join(home, 'Videos')
    ]
  };

  const folders = {};
  for (const [key, list] of Object.entries(candidates)) {
    const found = list.find((candidate) => {
      if (!candidate) return false;
      try {
        return fs.existsSync(candidate);
      } catch {
        return false;
      }
    });
    folders[key] = found || null;
  }
  return folders;
}

module.exports = {
  MAX_TEXT_BYTES,
  MAX_BINARY_BYTES,
  MAX_LISTING_ENTRIES,
  listDirectory,
  statPath,
  readFileText,
  readFileBinary,
  writeFileText,
  writeFileBinary,
  makeDirectory,
  removePath,
  removeRecursive,
  existsPath,
  copyPath,
  movePath,
  renamePath,
  getDrives,
  getSpecialFolders
};
