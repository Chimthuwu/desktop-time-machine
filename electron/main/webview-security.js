/**
 * Desktop Time Machine — webview hardening
 *
 * The shell uses <webview> for the in-app browser and Discord windows. Guest
 * content is remote, so every guest is forced into a sandbox without preload
 * or Node access, may only load http(s), and can never open new OS windows.
 */

const ALLOWED_WEB_URL = /^https?:\/\//i;

function isAllowedWebUrl(url) {
  return typeof url === 'string' && ALLOWED_WEB_URL.test(url);
}

function hardenWebviews(contents) {
  if (!contents) return;

  contents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!isAllowedWebUrl(params && params.src)) {
      event.preventDefault();
      return;
    }
    // Never inherit the host's preload or Node privileges in a remote guest.
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.webviewTag = false;
    if (params) params.allowpopups = false;
  });

  contents.on('did-attach-webview', (_event, guest) => {
    guest.setWindowOpenHandler(() => ({ action: 'deny' }));
    guest.on('will-navigate', (event, url) => {
      if (!isAllowedWebUrl(url)) event.preventDefault();
    });
    guest.on('will-redirect', (event, url) => {
      if (!isAllowedWebUrl(url)) event.preventDefault();
    });
  });
}

module.exports = { hardenWebviews, isAllowedWebUrl };
