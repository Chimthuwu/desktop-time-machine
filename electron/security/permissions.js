/**
 * Security Policies and Permissions for Desktop Time Machine
 * 
 * Enforces strict boundaries:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - Controlled IPC handlers with type/length validation
 * - Whitelisted executables pinned to Windows System directory
 * - Symlink and path traversal protection
 * - URL and protocol validation
 */

const path = require('path');
const os = require('os');
const fs = require('fs');

// Approved executable names that can be launched safely (NO cmd.exe, powershell.exe, regedit.exe)
const APPROVED_PROGRAMS = new Set([
  'notepad.exe',
  'calc.exe',
  'mspaint.exe',
  'explorer.exe'
]);

// Sensitive paths that must never be accessed or traversed via filesystem APIs
const SENSITIVE_PATH_PATTERNS = [
  /\\System32\\config\\(SAM|SECURITY|SYSTEM|DEFAULT)$/i,
  /[\\/]\.ssh([\\/]|$)/i,
  /[\\/]\.aws([\\/]|$)/i,
  /[\\/]\.gnupg([\\/]|$)/i,
  /[\\/]\.git([\\/]|$)/i
];

// Raw device namespaces (\\.\ and \\?\) bypass normal path handling — never allow them
const BLOCKED_DEVICE_NAMESPACE = /^\\\\[.?]\\/;

// Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Validates whether an external URL is safe to open via shell.openExternal
 * @param {string} urlString 
 * @returns {boolean}
 */
function isSafeExternalUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  if (urlString.length > 2048) return false;

  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    // Must have a valid non-empty hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a filesystem path to ensure it is within safe boundaries and does not contain null bytes or sensitive locations
 * @param {string} targetPath 
 * @returns {boolean}
 */
function isSafePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (targetPath.length > 1024) return false;

  // Disallow null bytes or control characters
  if (targetPath.includes('\0')) return false;

  // Disallow raw device namespaces (\\.\ and \\?\)
  if (BLOCKED_DEVICE_NAMESPACE.test(targetPath)) return false;

  const resolved = path.resolve(targetPath);

  // Disallow Windows reserved device names
  if (RESERVED_DEVICE_NAME.test(path.basename(resolved))) return false;

  // Check against sensitive system and credential patterns
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(resolved)) {
      return false;
    }
  }

  // Symlink check: if file/folder exists, resolve canonical real path
  try {
    if (fs.existsSync(resolved)) {
      const canonical = fs.realpathSync(resolved);
      for (const pattern of SENSITIVE_PATH_PATTERNS) {
        if (pattern.test(canonical)) {
          return false;
        }
      }
    }
  } catch {
    // If realpath fails (e.g. broken link or permission error), consider unsafe
    return false;
  }

  return true;
}

/**
 * Validates program execution request.
 * Enforces:
 * - Must be a simple string (no paths, slashes, backslashes, spaces, or arguments allowed)
 * - Must strictly match approved program whitelist
 * @param {string} program 
 * @returns {boolean}
 */
function isApprovedProgram(program) {
  if (!program || typeof program !== 'string') return false;
  if (program.length > 64) return false;

  // Reject paths, arguments, or shell metacharacters
  if (!/^[a-zA-Z0-9_\-]+\.exe$/i.test(program.trim())) {
    return false;
  }

  const baseName = program.trim().toLowerCase();
  return APPROVED_PROGRAMS.has(baseName);
}

/**
 * Resolves an approved program to its pinned, verified Windows System binary path.
 * Prevents executable substitution attacks via relative paths.
 * @param {string} program 
 * @returns {string|null}
 */
function getPinnedExecutablePath(program) {
  if (!isApprovedProgram(program)) return null;

  const baseName = program.trim().toLowerCase();
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';

  let resolvedPath;
  if (baseName === 'explorer.exe') {
    resolvedPath = path.join(systemRoot, 'explorer.exe');
  } else {
    resolvedPath = path.join(systemRoot, 'System32', baseName);
  }

  // Fallback: If not found in System32 (e.g. 64-bit redirection on some hosts), check SysWOW64
  if (!fs.existsSync(resolvedPath)) {
    const wowPath = path.join(systemRoot, 'SysWOW64', baseName);
    if (fs.existsSync(wowPath)) {
      resolvedPath = wowPath;
    }
  }

  return resolvedPath;
}

/**
 * Resolves a pinned Windows system binary (e.g. attrib.exe) from
 * System32/SysWOW64. Returns null when the binary cannot be found.
 * @param {string} name - bare executable name such as "attrib.exe"
 * @returns {string|null}
 */
function getPinnedSystemBinary(name) {
  if (!name || typeof name !== 'string') return null;
  if (!/^[a-zA-Z0-9_\-]+\.exe$/i.test(name)) return null;

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const candidates = [
    path.join(systemRoot, 'System32', name),
    path.join(systemRoot, 'SysWOW64', name)
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function normalizeForCompare(targetPath) {
  return path.resolve(targetPath).replace(/[\\/]+$/, '').toLowerCase();
}

function isSameOrInside(candidateNorm, protectedNorm) {
  return candidateNorm === protectedNorm || candidateNorm.startsWith(protectedNorm + '\\');
}

/**
 * Determines whether a path is protected from write/destructive operations.
 *
 * - Write level: drive roots plus anything inside the Windows directory,
 *   System32, SysWOW64, Program Files and ProgramData.
 * - Destructive level: everything above, plus the exact user home root,
 *   the exact C:\Users root, and all sensitive credential locations.
 *
 * Reading/browsing stays allowed — the user must be able to browse C:.
 *
 * @param {string} targetPath
 * @param {{destructive?: boolean}} [options]
 * @returns {boolean}
 */
function isProtectedPath(targetPath, { destructive = false } = {}) {
  if (!targetPath || typeof targetPath !== 'string') return false;

  const resolved = path.resolve(targetPath);
  const normalized = normalizeForCompare(resolved);
  const root = path.parse(resolved).root;

  // Drive roots such as C:\
  if (/^[a-z]:$/.test(normalized)) return true;

  const systemRoot = normalizeForCompare(process.env.SystemRoot || 'C:\\Windows');
  const writeProtectedDirs = [
    systemRoot,
    normalizeForCompare(path.join(systemRoot, 'System32')),
    normalizeForCompare(path.join(systemRoot, 'SysWOW64')),
    normalizeForCompare(path.join(root, 'Program Files')),
    normalizeForCompare(path.join(root, 'Program Files (x86)')),
    normalizeForCompare(path.join(root, 'ProgramData'))
  ];

  for (const protectedDir of writeProtectedDirs) {
    if (isSameOrInside(normalized, protectedDir)) return true;
  }

  if (destructive) {
    if (normalized === normalizeForCompare(os.homedir())) return true;
    if (normalized === normalizeForCompare(path.join(root, 'Users'))) return true;
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(resolved)) return true;
    }
  }

  return false;
}

module.exports = {
  isSafeExternalUrl,
  isSafePath,
  isApprovedProgram,
  getPinnedExecutablePath,
  getPinnedSystemBinary,
  isProtectedPath,
  APPROVED_PROGRAMS,
  SENSITIVE_PATH_PATTERNS,
  BLOCKED_DEVICE_NAMESPACE,
  RESERVED_DEVICE_NAME
};
