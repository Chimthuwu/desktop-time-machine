/**
 * Phase 4 security regression tests.
 *
 * Exercises the real policy modules, IPC handlers and terminal backend. No
 * mocks are used for the logic under test; only real Windows-specific
 * operations are skipped when the host does not support them.
 */

const { app, BrowserWindow } = require('electron');
app.commandLine.appendSwitch('mute-audio');

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const permissions = require('../electron/security/permissions');
const policy = require('../electron/security/permission-policy');
const desktopIntegration = require('../electron/main/desktop-integration');
const chromium = require('../electron/main/chromium');
const waterfox = require('../electron/main/waterfox');
const systemIntegration = require('../electron/main/system-integration');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const results = { passed: 0, failed: 0, skipped: 0, tests: [] };

function assert(name, condition) {
  if (condition) {
    results.passed++;
    results.tests.push({ name, status: 'PASS' });
  } else {
    results.failed++;
    results.tests.push({ name, status: 'FAIL' });
  }
}

function skip(name, reason) {
  results.skipped++;
  results.tests.push({ name, status: 'SKIP', reason });
}

app.whenReady().then(async () => {
  try {
    registerIpcHandlers();

    // --- Permission policy: no silent grants ---
    for (const permission of ['media', 'display-capture', 'geolocation', 'notifications', 'clipboard-read', 'clipboard-sanitized-write']) {
      assert(
        `permission request denied: ${permission}`,
        policy.shouldGrantPermissionRequest(permission, { requestedOrigin: 'https://discord.com' }) === false
      );
      assert(
        `permission check denied: ${permission}`,
        policy.shouldAllowPermissionCheck(permission, { requestedOrigin: 'https://discord.com' }) === false
      );
    }
    assert('fullscreen check allowed (non-sensitive)', policy.shouldAllowPermissionCheck('fullscreen') === true);
    assert('display capture uses the system picker', policy.DISPLAY_MEDIA_USE_SYSTEM_PICKER === true);
    assert('display capture never auto-selects a source', Object.keys(policy.displayMediaChoice()).length === 0);

    // --- Trusted renderer URLs ---
    assert(
      'app file URL is a trusted renderer origin',
      permissions.isTrustedRendererUrl(pathToFileURL(path.join(ROOT, 'src/index.html')).href, ROOT)
    );
    assert('remote origin is not a trusted renderer', !permissions.isTrustedRendererUrl('https://evil.example/src/index.html', ROOT));
    assert('unrelated local file is not a trusted renderer', !permissions.isTrustedRendererUrl(pathToFileURL(path.join(os.tmpdir(), 'evil.html')).href, ROOT));
    assert('about:blank is not a trusted renderer', !permissions.isTrustedRendererUrl('about:blank', ROOT));
    assert('stale absolute path is not a trusted renderer', !permissions.isTrustedRendererUrl('file:///Z:/github/skinsos/src/index.html', ROOT));

    // --- Path hardening ---
    assert('trailing-dot credential path rejected', !permissions.isSafePath('C:\\Users\\me\\.ssh.\\id_rsa'));
    assert('8.3 short name credential path rejected', !permissions.isSafePath('C:\\Users\\me\\SSH~1\\id_rsa'));
    assert('UNC path rejected', !permissions.isSafePath('\\\\server\\share\\file.txt'));
    assert('reserved device name in a parent folder rejected', !permissions.isSafePath('C:\\CON\\file.txt'));
    assert('normal project path remains safe', permissions.isSafePath(ROOT));
    let openPathRejected = false;
    try { await systemIntegration.openPath('C:\\Windows\\win.ini'); } catch { openPathRejected = true; }
    assert('openPath rejects protected system files', openPathRejected);

    // A junction into a protected tree must be rejected through its real path.
    const junction = path.join(os.tmpdir(), 'dtm-phase4-junction-' + Date.now());
    try {
      fs.symlinkSync('C:\\Windows', junction, 'junction');
      assert('junction into Windows is rejected', !permissions.isSafePath(path.join(junction, 'System32', 'config', 'SAM')));
      // Unlink the junction itself; never remove recursively (that can follow it).
      fs.unlinkSync(junction);
    } catch (e) {
      skip('junction traversal check', e.message);
      try { fs.unlinkSync(junction); } catch {}
    }

    // --- External browser URL validation ---
    for (const browser of [chromium, waterfox]) {
      const name = browser === chromium ? 'chromium' : 'waterfox';
      assert(`${name} accepts https`, !!browser.safeUrl('https://archive.org/'));
      assert(`${name} rejects file URL`, browser.safeUrl('file:///C:/Windows/win.ini') === null);
      assert(`${name} rejects javascript URL`, browser.safeUrl('javascript:alert(1)') === null);
    }

    // --- Terminal allowlist: no arbitrary shell execution ---
    const ver = await desktopIntegration.runTerminalCommand('ver', ROOT);
    assert('VER command succeeds without a shell', ver.code === 0 && /Desktop Time Machine/.test(ver.stdout));
    const dir = await desktopIntegration.runTerminalCommand('dir', ROOT);
    assert('DIR command lists the real folder', dir.code === 0 && /package\.json/.test(dir.stdout));
    const bad = await desktopIntegration.runTerminalCommand('cmd /c echo pwned', ROOT);
    assert('arbitrary shell command rejected', bad.code === 1 && /not a supported command/.test(bad.stderr));
    const marker = path.join(os.tmpdir(), 'dtm-phase4-terminal-marker-' + Date.now());
    const redirect = await desktopIntegration.runTerminalCommand(`echo pwned > ${marker}`, ROOT);
    assert('shell redirection rejected', redirect.code === 1 && !fs.existsSync(marker));

    // --- IPC sender authorization (real preload + real handler) ---
    const untrusted = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: {
        preload: path.join(ROOT, 'electron/preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    try {
      await untrusted.loadURL('data:text/html,<html><body>untrusted</body></html>');
      const senderResult = await untrusted.webContents.executeJavaScript(`(async () => {
        const out = {};
        try { await window.dtmPreload.fs.list('.'); out.fs = 'allowed'; }
        catch (e) { out.fs = String(e.message); }
        try { window.dtmPreload.on('evil-channel', () => {}); out.event = 'allowed'; }
        catch (e) { out.event = String(e.message); }
        return out;
      })()`);
      assert('IPC filesystem call from untrusted origin blocked', /Unauthorized IPC sender/.test(senderResult.fs));
      assert('preload event channel allowlist enforced', /Unsupported event channel/.test(senderResult.event));
    } finally {
      untrusted.close();
    }
  } catch (e) {
    results.failed++;
    results.tests.push({ name: 'suite error', status: 'FAIL', reason: e.stack || e.message });
  }

  console.log('=== PHASE 4 SECURITY TEST RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  app.exit(results.failed ? 1 : 0);
});
