/**
 * Desktop Time Machine — browser engine selection
 *
 * The retro Internet Explorer is backed by a real browser on a private
 * profile. Ungoogled Chromium is preferred when it is installed; Waterfox is
 * the fallback. Both expose the same small API, so the renderer and IPC layer
 * do not care which one is running.
 */

const chromium = require('./chromium');
const waterfox = require('./waterfox');
const browserSetup = require('./browser-setup');

function backend() {
  try {
    if (chromium.status().available) return chromium;
  } catch (e) { /* fall through to Waterfox */ }
  return waterfox;
}

module.exports = {
  status: () => backend().status(),
  // Installs Ungoogled Chromium when this machine has no real engine yet.
  ensure: (options) => browserSetup.ensure(options),
  open: (url) => backend().open(url),
  newTab: (url) => backend().newTab(url),
  switchTab: (tabId) => backend().switchTab(tabId),
  closeTab: (tabId) => backend().closeTab(tabId),
  getTabs: () => backend().getTabs(),
  navigate: (url) => backend().navigate(url),
  reload: () => backend().reload(),
  history: (delta) => backend().history(delta),
  state: () => backend().state(),
  dock: (rect) => backend().dock(rect),
  show: () => backend().show(),
  hide: () => backend().hide(),
  raise: () => backend().raise(),
  close: () => backend().close(),
  dispose() {
    try { chromium.dispose(); } catch (e) { /* already gone */ }
    try { waterfox.dispose(); } catch (e) { /* already gone */ }
  }
};
