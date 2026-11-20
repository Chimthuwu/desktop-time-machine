/**
 * Least-privilege permission policy for Desktop Time Machine.
 *
 * The renderer never decides what a guest webview may do. Sensitive access
 * (camera, microphone, location, notifications, clipboard, display capture)
 * is denied unless a user has explicitly granted it through a system prompt.
 *
 * These helpers are deliberately pure so they can be unit tested without
 * starting Electron or touching real devices.
 */

// Checks that are safe to answer positively without granting access to user
// data or devices. Everything else is denied by default.
const CHECK_ALLOWLIST = new Set(['fullscreen']);

// No permission is granted silently. Guest sites may still ask the user
// through the browser's own UI where that is supported; this policy only
// controls automatic approvals made by the host application.
const REQUEST_ALLOWLIST = new Set();

/**
 * Decide whether a permission *request* may be granted automatically.
 *
 * @param {string} permission Chromium permission name
 * @param {{origin?: string, requestedOrigin?: string, embedderOrigin?: string}} [context]
 * @returns {boolean}
 */
function shouldGrantPermissionRequest(permission, context = {}) {
  if (typeof permission !== 'string') return false;
  const origin = context.requestedOrigin || context.origin || '';
  if (typeof origin !== 'string' || !origin) return false;
  return REQUEST_ALLOWLIST.has(permission.toLowerCase());
}

/**
 * Decide the answer to a Chromium permission *check*.
 *
 * @param {string} permission Chromium permission name
 * @param {{origin?: string, requestedOrigin?: string, embedderOrigin?: string}} [context]
 * @returns {boolean}
 */
function shouldAllowPermissionCheck(permission, context = {}) {
  if (typeof permission !== 'string') return false;
  return CHECK_ALLOWLIST.has(permission.toLowerCase());
}

/**
 * Display capture must never be silently selected. When supported, the
 * operating system picker is used so the user chooses the source.
 */
const DISPLAY_MEDIA_USE_SYSTEM_PICKER = true;

function displayMediaChoice() {
  // No automatic source selection. The system picker (when available) is the
  // only supported path; otherwise the capture request is denied.
  return {};
}

module.exports = {
  shouldGrantPermissionRequest,
  shouldAllowPermissionCheck,
  DISPLAY_MEDIA_USE_SYSTEM_PICKER,
  displayMediaChoice
};
