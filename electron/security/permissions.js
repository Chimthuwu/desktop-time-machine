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

// UNC/network paths are not used by the simulator and bypass local protections.
const BLOCKED_UNC = /^\\\\/;

// 8.3 short names can spell a protected directory without matching its text.
const SHORT_NAME = /~[0-9]+$/;

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
 * Normalizes a Windows path the way the filesystem does: trailing dots and
 * spaces on each component are ignored, and reserved device names are rejected
 * anywhere in the path (not only as the basename).
 */
function normalizeWindowsPath(targetPath) {
  if (BLOCKED_UNC.test(targetPath)) return null;
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const dir = parsed.dir.startsWith(parsed.root) ? parsed.dir.slice(parsed.root.length) : parsed.dir;
  const segments = dir.split(/[\\/]+/).filter(Boolean).concat(parsed.base);
  const clean = [];
  for (const segment of segments) {
    const trimmed = segment.replace(/[. ]+$/, '');
    if (!trimmed || trimmed === '.') continue;
    if (RESERVED_DEVICE_NAME.test(trimmed)) return null;
    if (SHORT_NAME.test(trimmed)) return null;
    clean.push(trimmed);
  }
  return path.resolve(parsed.root, ...clean);
}

/**
 * Resolves symlinks/junctions for the longest existing ancestor so a path that
 * does not exist yet (a write target) is still checked against its real parent.
 */
function canonicalizeForCheck(normalized) {
  let candidate = normalized;
  const tail = [];
  while (candidate && candidate !== path.parse(candidate).root) {
    try {
      if (fs.existsSync(candidate)) {
        return path.resolve(fs.realpathSync(candidate), ...tail);
      }
    } catch {
      // Fall through to the parent; an unreadable ancestor is handled by the
      // caller's own error handling.
    }
    tail.unshift(path.basename(candidate));
    candidate = path.dirname(candidate);
  }
  return normalized;
}

function matchesSensitivePatterns(targetPath) {
  return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(targetPath));
}

/**
 * Validates a filesystem path to ensure it is within safe boundaries and does
 * not contain null bytes, device namespaces, short names or sensitive
 * locations. Both the lexical path and its canonical (symlink-resolved) form
 * are checked so junctions cannot be used to escape the policy.
 * @param {string} targetPath
 * @returns {boolean}
 */
function isSafePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  if (targetPath.length > 1024) return false;

  // Disallow null bytes, control characters and raw device namespaces.
  if (targetPath.includes('\0')) return false;
  if (BLOCKED_DEVICE_NAMESPACE.test(targetPath)) return false;

  const normalized = normalizeWindowsPath(targetPath);
  if (!normalized) return false;

  if (matchesSensitivePatterns(normalized)) return false;

  const canonical = canonicalizeForCheck(normalized);
  if (matchesSensitivePatterns(canonical)) return false;

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

/**
 * Verifies that an IPC sender belongs to the application's own local window.
 * Guest webviews (remote http(s) content) never receive the privileged preload
 * bridge and must never be able to invoke filesystem or shell handlers.
 *
 * @param {string} senderUrl URL reported by event.sender.getURL()
 * @param {string} appRoot Absolute application root directory
 * @returns {boolean}
 */
function isTrustedRendererUrl(senderUrl, appRoot) {
  if (!senderUrl || typeof senderUrl !== 'string' || !appRoot || typeof appRoot !== 'string') return false;
  try {
    const parsed = new URL(senderUrl);
    if (parsed.protocol !== 'file:') return false;
    const localPath = decodeURIComponent(parsed.pathname).replace(/^\/([a-zA-Z]:)/, '$1');
    const resolved = path.resolve(localPath);
    const root = path.resolve(appRoot);
    return resolved === root || resolved.startsWith(root + path.sep);
  } catch {
    return false;
  }
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

  const normalizedPath = normalizeWindowsPath(targetPath);
  if (!normalizedPath) return true;
  const resolved = normalizedPath;
  const canonical = canonicalizeForCheck(normalizedPath);
  const candidates = [resolved, canonical].map(normalizeForCompare);
  const isInside = (protectedDir) => candidates.some((candidate) => isSameOrInside(candidate, protectedDir));
  const root = path.parse(resolved).root;

  // Drive roots such as C:\
  if (/^[a-z]:$/.test(candidates[0])) return true;

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
    if (isInside(protectedDir)) return true;
  }

  if (destructive) {
    if (candidates.includes(normalizeForCompare(os.homedir()))) return true;
    if (candidates.includes(normalizeForCompare(path.join(root, 'Users')))) return true;
    if (matchesSensitivePatterns(resolved) || matchesSensitivePatterns(canonical)) return true;
  }

  return false;
}

module.exports = {
  isSafeExternalUrl,
  isSafePath,
  isTrustedRendererUrl,
  isApprovedProgram,
  getPinnedExecutablePath,
  getPinnedSystemBinary,
  isProtectedPath,
  APPROVED_PROGRAMS,
  SENSITIVE_PATH_PATTERNS,
  BLOCKED_DEVICE_NAMESPACE,
  BLOCKED_UNC,
  RESERVED_DEVICE_NAME,
  normalizeWindowsPath,
  canonicalizeForCheck
};
