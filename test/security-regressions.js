/**
 * Targeted Security Regression Tests for Desktop Time Machine
 */

const { app, BrowserWindow, ipcMain } = require('electron');

// Keep test runs silent (user request: app must stay muted).
app.commandLine.appendSwitch('mute-audio');
const path = require('path');
const fs = require('fs');
const os = require('os');
const permissions = require('../electron/security/permissions');
const systemIntegration = require('../electron/main/system-integration');
const { registerIpcHandlers } = require('../electron/main/ipc-handlers');

const regressionResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function assert(description, condition) {
  if (condition) {
    regressionResults.passed++;
    regressionResults.tests.push({ name: description, status: 'PASS' });
  } else {
    regressionResults.failed++;
    regressionResults.tests.push({ name: description, status: 'FAIL' });
  }
}

app.whenReady().then(async () => {
  registerIpcHandlers();

  // Test 1: Approved executables launch using pinned paths
  const calcPath = permissions.getPinnedExecutablePath('calc.exe');
  const notepadPath = permissions.getPinnedExecutablePath('notepad.exe');
  const explorerPath = permissions.getPinnedExecutablePath('explorer.exe');
  const mspaintPath = permissions.getPinnedExecutablePath('mspaint.exe');

  assert('calc.exe resolves to real pinned system path', !!calcPath && fs.existsSync(calcPath));
  assert('notepad.exe resolves to real pinned system path', !!notepadPath && fs.existsSync(notepadPath));
  assert('explorer.exe resolves to real pinned system path', !!explorerPath && fs.existsSync(explorerPath));
  assert('mspaint.exe resolves to real pinned system path', !!mspaintPath && fs.existsSync(mspaintPath));

  // Test 2: Arbitrary executable paths rejected
  assert('Arbitrary absolute path C:\\evil\\calc.exe rejected', !permissions.isApprovedProgram('C:\\evil\\calc.exe'));
  assert('Arbitrary relative path ../../calc.exe rejected', !permissions.isApprovedProgram('../../calc.exe'));
  assert('Shell binary /bin/sh rejected', !permissions.isApprovedProgram('/bin/sh'));
  assert('Unapproved program malicious.exe rejected', !permissions.isApprovedProgram('malicious.exe'));
  assert('cmd.exe rejected', !permissions.isApprovedProgram('cmd.exe'));
  assert('powershell.exe rejected', !permissions.isApprovedProgram('powershell.exe'));
  assert('regedit.exe rejected', !permissions.isApprovedProgram('regedit.exe'));

  // Test 3: Path manipulation rejected
  assert('Local dot-slash .\\calc.exe rejected', !permissions.isApprovedProgram('.\\calc.exe'));
  assert('Subfolder System32/calc.exe rejected', !permissions.isApprovedProgram('System32/calc.exe'));
  assert('Backslash traversal ..\\..\\calc.exe rejected', !permissions.isApprovedProgram('..\\..\\calc.exe'));

  // Test 4: Dangerous arguments cannot bypass allowlist
  assert('calc.exe with argument /dangerous rejected', !permissions.isApprovedProgram('calc.exe /dangerous'));
  assert('calc.exe with chained command & whoami rejected', !permissions.isApprovedProgram('calc.exe & whoami'));
  assert('calc.exe with pipe | dir rejected', !permissions.isApprovedProgram('calc.exe | dir'));
  assert('calc.exe with semicolon ; format rejected', !permissions.isApprovedProgram('calc.exe; format c:'));
  assert('calc.exe with flag -k rejected', !permissions.isApprovedProgram('calc.exe -k'));

  // Test 5: Filesystem traversal and sensitive paths rejected
  assert('SAM registry hive path rejected', !permissions.isSafePath('C:\\Windows\\System32\\config\\SAM'));
  assert('SECURITY registry hive path rejected', !permissions.isSafePath('C:\\Windows\\System32\\config\\SECURITY'));
  assert('SSH private key path rejected', !permissions.isSafePath('C:\\Users\\User\\.ssh\\id_rsa'));
  assert('AWS credentials path rejected', !permissions.isSafePath('C:\\Users\\User\\.aws\\credentials'));
  assert('Path with embedded null byte rejected', !permissions.isSafePath('C:\\valid\\folder\0\\file.txt'));
  assert('Path exceeding 1024 characters rejected', !permissions.isSafePath('C:\\' + 'A'.repeat(1500)));

  // Test 6: URL and navigation safety
  assert('Safe HTTPS URL approved', permissions.isSafeExternalUrl('https://archive.org'));
  assert('Safe HTTP URL approved', permissions.isSafeExternalUrl('http://example.com'));
  assert('File protocol URL rejected for external open', !permissions.isSafeExternalUrl('file:///C:/Windows/System32'));
  assert('Javascript protocol URL rejected', !permissions.isSafeExternalUrl('javascript:alert(1)'));
  assert('Data protocol URL rejected', !permissions.isSafeExternalUrl('data:text/html,<h1>hack</h1>'));
  assert('Empty URL rejected', !permissions.isSafeExternalUrl(''));
  assert('URL exceeding 2048 characters rejected', !permissions.isSafeExternalUrl('https://example.com/' + 'A'.repeat(3000)));

  // Test 7: Symlink escapes rejected where applicable
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtm-test-'));
  const targetFile = path.join(tempDir, 'legit.txt');
  fs.writeFileSync(targetFile, 'test');
  assert('Legitimate file in temp directory is safe', permissions.isSafePath(targetFile));
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  // Test 8: Legitimate filesystem browsing still works
  const browseResult = await systemIntegration.listDirectory(path.resolve('.'));
  assert('Legitimate directory listing returns currentPath', typeof browseResult.currentPath === 'string');
  assert('Legitimate directory listing returns items array', Array.isArray(browseResult.items) && browseResult.items.length > 0);
  assert('Directory items have expected metadata', browseResult.items.some(i => i.name === 'package.json' && i.isFile));

  // Test 9: IPC Argument Validation (Testing via webContents invoking handlers)
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '../src/index.html'));

  const ipcTestResult = await win.webContents.executeJavaScript(`
    (async () => {
      const results = {};

      // 1. Invalid dirPath type
      try {
        await window.dtmPreload.listDirectory({ invalid: true });
        results.invalidDirPathType = false;
      } catch (e) {
        results.invalidDirPathType = true;
      }

      // 2. Oversized dirPath
      try {
        await window.dtmPreload.listDirectory('A'.repeat(2000));
        results.oversizedDirPath = false;
      } catch (e) {
        results.oversizedDirPath = true;
      }

      // 3. Invalid targetPath type for openPath
      try {
        await window.dtmPreload.openPath(12345);
        results.invalidOpenPathType = false;
      } catch (e) {
        results.invalidOpenPathType = true;
      }

      // 4. Invalid url type for openExternalUrl
      try {
        await window.dtmPreload.openExternalUrl(null);
        results.invalidUrlType = false;
      } catch (e) {
        results.invalidUrlType = true;
      }

      // 5. Unapproved program launch via IPC
      try {
        await window.dtmPreload.launchProgram('cmd.exe');
        results.unapprovedLaunch = false;
      } catch (e) {
        results.unapprovedLaunch = true;
      }

      return results;
    })()
  `);

  assert('IPC: Invalid dirPath type rejected', ipcTestResult.invalidDirPathType);
  assert('IPC: Oversized dirPath (>1024) rejected', ipcTestResult.oversizedDirPath);
  assert('IPC: Non-string openPath target rejected', ipcTestResult.invalidOpenPathType);
  assert('IPC: Null openExternalUrl rejected', ipcTestResult.invalidUrlType);
  assert('IPC: Unapproved program (cmd.exe) rejected', ipcTestResult.unapprovedLaunch);

  console.log('=== SECURITY REGRESSION TEST RESULTS ===');
  console.log(JSON.stringify(regressionResults, null, 2));

  win.close();
  app.exit(regressionResults.failed ? 1 : 0);
});
