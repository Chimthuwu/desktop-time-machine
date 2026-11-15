/**
 * Desktop Time Machine — Real Desktop Integration
 *
 * Backend helpers that live entirely in the Electron main process and are
 * reached only through validated IPC handlers. Every function operates on the
 * REAL Windows host filesystem and uses Windows shell APIs where practical.
 *
 * PowerShell scripts are built from single-quoted strings (concatenated with
 * '\n') so the backticks used by PowerShell escape sequences (e.g. `n) remain
 * literal and do NOT terminate a JavaScript template literal.
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { isSafePath, isProtectedPath } = require('../security/permissions');

let _app = null;
function getApp() {
  if (!_app) {
    // eslint-disable-next-line global-require
    _app = require('electron').app;
  }
  return _app;
}

let _shell = null;
function getShell() {
  if (!_shell) {
    // eslint-disable-next-line global-require
    _shell = require('electron').shell;
  }
  return _shell;
}

const PS_TIMEOUT_MS = 15000;

function toBase64(text) {
  return Buffer.from(String(text), 'utf8').toString('base64');
}

function runPowerShell(script, expectJson = false) {
  return new Promise((resolve, reject) => {
    const args = [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' + script
    ];
    execFile('powershell.exe', args, {
      windowsHide: true,
      timeout: PS_TIMEOUT_MS,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    }, (err, stdout) => {
      if (err) return reject(err);
      const out = (stdout || '').trim();
      if (expectJson) {
        try { resolve(JSON.parse(out)); }
        catch (e) { reject(new Error('Could not parse shell response: ' + out)); }
        return;
      }
      resolve(out);
    });
  });
}

let _desktopCache = null;
let _desktopCacheAt = 0;
const DESKTOP_CACHE_TTL_MS = 30000;
const DESKTOP_DEBUG = process.env.DTM_DESKTOP_DEBUG === '1';

function debugLog(...args) {
  if (DESKTOP_DEBUG) console.log('[dtm:desktop]', ...args);
}

// ---------------------------------------------------------------------------
// Desktop known-folder discovery
//
// Historically this used a PowerShell + COM Shell.Application probe. On some
// hosts that call can hang forever (a blocked COM/shell provider), which made
// `dtm:fs-desktop` — and therefore every skin's desktop — wait indefinitely.
// Discovery is now registry-first with hard per-step timeouts and environment
// fallbacks, so it can never block the shared desktop mount.
// ---------------------------------------------------------------------------

const REG_QUERY_TIMEOUT_MS = 2500;
const DESKTOP_DISCOVERY_TIMEOUT_MS = 4000;

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

function expandEnvironmentVariables(value) {
  if (!value) return value;
  return String(value).replace(/%([^%]+)%/g, (match, name) => {
    // Windows environment variable names are case-insensitive.
    let v = process.env[name];
    if (v === undefined) {
      const upper = name.toUpperCase();
      const key = Object.keys(process.env).find((k) => k.toUpperCase() === upper);
      if (key) v = process.env[key];
    }
    return v === undefined ? match : v;
  });
}

function queryRegistryValue(keyPath, valueName) {
  const regExe = require('../security/permissions').getPinnedSystemBinary('reg.exe') ||
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
  return new Promise((resolve) => {
    execFile(regExe, ['query', keyPath, '/v', valueName], {
      windowsHide: true,
      timeout: REG_QUERY_TIMEOUT_MS,
      encoding: 'utf8'
    }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      // Example line:
      //     Desktop    REG_EXPAND_SZ    C:\Users\Serge\OneDrive\Desktop
      for (const line of String(stdout).split(/\r?\n/)) {
        const m = line.match(/^\s*\S(?:.*?)\s{2,}(REG_[A-Z_]+)\s{2,}(.*)$/);
        if (m && m[2] !== undefined) return resolve(m[2].trim());
      }
      resolve(null);
    });
  });
}

function isExistingDirectory(p) {
  if (!p) return false;
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function firstExistingDirectory(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const expanded = path.resolve(expandEnvironmentVariables(candidate));
    if (isExistingDirectory(expanded)) return expanded;
  }
  return null;
}

function uniqueDirectories(list) {
  const seen = new Set();
  const out = [];
  for (const dir of list) {
    if (!dir) continue;
    const resolved = path.resolve(dir);
    const key = resolved.toLowerCase().replace(/[\\/]+$/, '');
    if (seen.has(key)) continue;
    if (!isExistingDirectory(resolved)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

async function getDesktopPaths() {
  if (_desktopCache && (Date.now() - _desktopCacheAt) < DESKTOP_CACHE_TTL_MS) return _desktopCache;
  const started = Date.now();

  const home = os.homedir();
  const userProfile = process.env.USERPROFILE || home;
  const publicRoot = process.env.PUBLIC || path.join(path.parse(home).root || 'C:\\', 'Users', 'Public');
  const oneDriveRoots = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial
  ].filter(Boolean);

  let registryUserDesktop = null;
  let registryCommonDesktop = null;
  try {
    const discovered = await withTimeout(Promise.all([
      queryRegistryValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', 'Desktop'),
      queryRegistryValue('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', 'Common Desktop')
    ]), DESKTOP_DISCOVERY_TIMEOUT_MS, [null, null]);
    registryUserDesktop = discovered && discovered[0];
    registryCommonDesktop = discovered && discovered[1];
  } catch {
    // Registry lookup is best-effort; environment fallbacks below always run.
  }

  const userCandidates = [
    registryUserDesktop && expandEnvironmentVariables(registryUserDesktop),
    path.join(userProfile, 'Desktop'),
    ...oneDriveRoots.map((root) => path.join(root, 'Desktop')),
    path.join(home, 'Desktop')
  ];

  const commonCandidates = [
    registryCommonDesktop && expandEnvironmentVariables(registryCommonDesktop),
    path.join(publicRoot, 'Desktop'),
    path.join('C:\\Users\\Public', 'Desktop')
  ];

  const all = uniqueDirectories([...userCandidates, ...commonCandidates]);
  const user = firstExistingDirectory(userCandidates) || path.resolve(path.join(userProfile, 'Desktop'));
  const common = firstExistingDirectory(commonCandidates);

  _desktopCache = {
    user: path.resolve(user),
    public: common ? path.resolve(common) : null,
    oneDrive: oneDriveRoots.length ? path.resolve(oneDriveRoots[0]) : null,
    all
  };
  _desktopCacheAt = Date.now();
  debugLog('discovery', {
    ms: _desktopCacheAt - started,
    registryUserDesktop,
    registryCommonDesktop,
    user: _desktopCache.user,
    public: _desktopCache.public,
    all: _desktopCache.all
  });
  return _desktopCache;
}

async function resolveShortcut(shortcutPath) {
  const resolved = path.resolve(shortcutPath);
  if (!isSafePath(resolved)) throw new Error('Access denied: shortcut path outside permitted boundaries');

  // Internet shortcuts (.url) are INI files, not WScript shortcuts. Reading the
  // URL directly is fast and avoids spawning PowerShell for the common case.
  if (/\.url$/i.test(resolved)) {
    let text = '';
    try { text = await fsp.readFile(resolved, 'utf8'); } catch { text = ''; }
    const urlMatch = text.match(/^\s*URL\s*=\s*(.+?)\s*$/mi);
    const iconMatch = text.match(/^\s*IconFile\s*=\s*(.+?)\s*$/mi);
    const target = urlMatch ? urlMatch[1] : null;
    return {
      target,
      arguments: '',
      workingDirectory: '',
      description: '',
      icon: iconMatch ? iconMatch[1] : '',
      exists: true,
      targetExists: !!target,
      kind: 'url'
    };
  }

  // Native .lnk parsing is instant; the WScript fallback below only runs for
  // links the native reader rejects (corrupt links, unusual link formats).
  if (/\.lnk$/i.test(resolved)) {
    try {
      const sc = getShell().readShortcutLink(resolved);
      let targetExists = false;
      if (sc && sc.target) {
        try { targetExists = fs.existsSync(sc.target); } catch { targetExists = false; }
      }
      return {
        target: sc.target || null,
        arguments: sc.args || '',
        workingDirectory: sc.cwd || '',
        description: sc.description || '',
        icon: sc.icon || '',
        exists: true,
        targetExists,
        kind: 'lnk'
      };
    } catch (err) {
      // Fall through to the WScript.Shell probe.
    }
  }

  const b64 = toBase64(resolved);
  const script =
    '$bytes = [System.Convert]::FromBase64String(\'' + b64 + '\')\n' +
    '$p = [System.Text.Encoding]::UTF8.GetString($bytes)\n' +
    '$ws = New-Object -ComObject WScript.Shell\n' +
    '$sc = $ws.CreateShortcut($p)\n' +
    '$exists = Test-Path $p\n' +
    '$targetExists = $false\n' +
    'if ($sc.TargetPath) { try { $targetExists = Test-Path $sc.TargetPath } catch { $targetExists = $false } }\n' +
    '$obj = [PSCustomObject]@{\n' +
    '  target = $sc.TargetPath\n' +
    '  arguments = $sc.Arguments\n' +
    '  workingDirectory = $sc.WorkingDirectory\n' +
    '  description = $sc.Description\n' +
    '  exists = $exists\n' +
    '  targetExists = $targetExists\n' +
    '}\n' +
    '$obj | ConvertTo-Json -Compress\n';

  const json = await runPowerShell(script, true);
  return {
    target: json.target || null,
    arguments: json.arguments || '',
    workingDirectory: json.workingDirectory || '',
    description: json.description || '',
    exists: !!json.exists,
    targetExists: !!json.targetExists
  };
}

async function getFileIcon(filePath, size = 32) {
  const resolved = path.resolve(filePath);
  if (!isSafePath(resolved)) throw new Error('Access denied: icon path outside permitted boundaries');

  let iconPath = resolved;
  if (/\.lnk$/i.test(resolved)) {
    // Read the shortcut natively — resolving every link through PowerShell made
    // a full desktop of icons take tens of seconds.
    try {
      const sc = getShell().readShortcutLink(resolved);
      if (sc && sc.target && isSafePath(sc.target) && fs.existsSync(sc.target)) {
        iconPath = sc.target;
      }
    } catch {
      // fall back to the link file itself
    }
  } else if (/\.url$/i.test(resolved)) {
    try {
      const sc = await resolveShortcut(resolved);
      const target = sc && sc.target;
      if (target && /^[a-zA-Z]:\\/.test(target) && isSafePath(target) && fs.existsSync(target)) {
        iconPath = target;
      }
    } catch {
      // fall back to the link file itself
    }
  }

  const app = getApp();
  const nativeImage = await app.getFileIcon(iconPath, { size });
  return nativeImage.toDataURL();
}

async function recycleItem(targetPath) {
  const resolved = path.resolve(targetPath);
  if (!isSafePath(resolved)) throw new Error('Access denied: path outside permitted boundaries');
  if (isProtectedPath(resolved, { destructive: true })) throw new Error('Access denied: this location is protected');

  try {
    await fsp.access(resolved);
  } catch {
    throw new Error('Not found: ' + resolved);
  }

  const b64 = toBase64(resolved);
  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch {
    throw new Error('Not found: ' + resolved);
  }
  // DeleteFile only handles files; directories need DeleteDirectory.
  const recycleCall = stat.isDirectory() ? 'DeleteDirectory' : 'DeleteFile';
  const script =
    'Add-Type -AssemblyName Microsoft.VisualBasic\n' +
    '$bytes = [System.Convert]::FromBase64String(\'' + b64 + '\')\n' +
    '$p = [System.Text.Encoding]::UTF8.GetString($bytes)\n' +
    '[Microsoft.VisualBasic.FileIO.FileSystem]::' + recycleCall + '(\n' +
    '  $p,\n' +
    '  [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,\n' +
    '  [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin\n' +
    ')\n' +
    "'OK'\n";

  try {
    await runPowerShell(script);
    return { success: true, path: resolved, recycled: true };
  } catch (err) {
    throw new Error('Could not move to Recycle Bin: ' + err.message);
  }
}

async function listRecycleBin() {
  const script =
    '$shell = New-Object -ComObject Shell.Application\n' +
    '$bin = $shell.Namespace(0xA)\n' +
    'if (-not $bin) { \'[]\'; exit }\n' +
    '$items = @()\n' +
    'foreach ($item in $bin.Items()) {\n' +
    '  $delFrom = \'\'\n' +
    '  try { $delFrom = $item.ExtendedProperty(\'System.Recycle.DeletedFrom\') } catch {}\n' +
    '  $size = 0\n' +
    '  try { $size = $item.Size } catch {}\n' +
    '  $items += [PSCustomObject]@{\n' +
    '    name = $item.Name\n' +
    '    path = $item.Path\n' +
    '    size = $size\n' +
    '    deletedFrom = $delFrom\n' +
    '  }\n' +
    '}\n' +
    '$items | ConvertTo-Json -Compress\n';

  try {
    const json = await runPowerShell(script, true);
    return Array.isArray(json) ? json : [];
  } catch {
    return [];
  }
}

async function emptyRecycleBin() {
  const script =
    '$shell = New-Object -ComObject Shell.Application\n' +
    '$bin = $shell.Namespace(0xA)\n' +
    'if ($bin) {\n' +
    '  $bin.Items() | ForEach-Object { try { $_.InvokeVerb(\'Delete\') } catch {} }\n' +
    '}\n' +
    "'OK'\n";

  try {
    await runPowerShell(script);
    return { success: true };
  } catch (err) {
    throw new Error('Could not empty Recycle Bin: ' + err.message);
  }
}

const DRIVE_TYPE_MAP = {
  0: 'Unknown',
  2: 'Removable',
  3: 'Fixed',
  4: 'Network',
  5: 'CD-ROM',
  6: 'RAM Disk'
};

async function getEnhancedDrives() {
  const fallback = scanDrivesNode();
  try {
    const script =
      'Get-CimInstance Win32_LogicalDisk | ForEach-Object {\n' +
      '  [PSCustomObject]@{\n' +
      '    letter = $_.DeviceID.TrimEnd(\':\')\n' +
      '    label = $_.VolumeName\n' +
      '    type = $_.DriveType\n' +
      '    total = $_.Size\n' +
      '    free = $_.FreeSpace\n' +
      '  }\n' +
      '} | ConvertTo-Json -Compress\n';

    const json = await runPowerShell(script, true);
    const list = Array.isArray(json) ? json : (json ? [json] : []);
    return list.map((d) => ({
      letter: d.letter,
      path: d.letter + ':\\',
      label: d.label && d.label.length ? d.letter + ': (' + d.label + ')' : d.letter + ':',
      rawLabel: d.label || '',
      type: DRIVE_TYPE_MAP[d.type] || 'Unknown',
      totalBytes: Number(d.total) || 0,
      freeBytes: Number(d.free) || 0,
      available: true
    }));
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Network Neighborhood — mapped drives, this PC's shares, UNC browsing.
// ---------------------------------------------------------------------------
async function getNetworkLocations() {
  const computerName = process.env.COMPUTERNAME || os.hostname();

  // The three probes are independent — run them together so a slow or
  // unavailable SMB provider cannot serialize the whole window.
  const [mappingJson, shareJson, allDrives] = await Promise.all([
    withTimeout(runPowerShell(
      'Get-SmbMapping | ForEach-Object {\n' +
      '  [PSCustomObject]@{ local = $_.LocalPath; remote = $_.RemotePath; status = "" + $_.Status }\n' +
      '} | ConvertTo-Json -Compress\n', true), 4000, null).catch(() => null),
    withTimeout(runPowerShell(
      'Get-SmbShare | Where-Object { -not $_.Special } | ForEach-Object {\n' +
      '  [PSCustomObject]@{ name = $_.Name; local = $_.Path; description = "" + $_.Description }\n' +
      '} | ConvertTo-Json -Compress\n', true), 4000, null).catch(() => null),
    withTimeout(getEnhancedDrives(), 4000, []).catch(() => [])
  ]);

  const toList = (json) => (Array.isArray(json) ? json : (json ? [json] : []));

  const mappings = toList(mappingJson).filter(Boolean).map((m) => ({
    localPath: m.local || null,
    remotePath: m.remote || null,
    status: m.status || ''
  }));

  const shares = toList(shareJson).filter(Boolean).map((s) => ({
    name: s.name,
    path: '\\\\' + computerName + '\\' + s.name,
    localPath: s.local || null,
    description: s.description || ''
  }));

  const drives = (Array.isArray(allDrives) ? allDrives : []).filter((d) => d && d.type === 'Network');

  return { computerName, mappings, shares, drives };
}

// ---------------------------------------------------------------------------
// Real Windows taskbar mirror — pinned apps, running windows, tray items.
// ---------------------------------------------------------------------------

async function listPinnedTaskbarApps() {
  const dirs = [];
  if (process.env.APPDATA) {
    dirs.push(path.join(process.env.APPDATA, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'));
  }
  if (process.env.PROGRAMDATA) {
    dirs.push(path.join(process.env.PROGRAMDATA, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar'));
  }

  const out = [];
  const seen = new Set();
  for (const dir of dirs) {
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(lnk|url)$/i.test(entry.name)) continue;
      const key = entry.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const fullPath = path.join(dir, entry.name);
      let icon = null;
      try { icon = await getFileIcon(fullPath, 16); } catch { icon = null; }
      out.push({ name: entry.name.replace(/\.(lnk|url)$/i, ''), path: fullPath, icon });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  return out;
}

// Only windows observed in the latest enumeration may be activated.
let _lastWindowPids = new Set();

async function listRunningWindows() {
  try {
    const script =
      '$items = @()\n' +
      'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne "" } | ForEach-Object {\n' +
      '  $exe = $null\n' +
      '  try { $exe = $_.Path } catch { }\n' +
      '  $items += [PSCustomObject]@{ pid = $_.Id; name = $_.ProcessName; title = $_.MainWindowTitle; path = $exe }\n' +
      '}\n' +
      'ConvertTo-Json -InputObject @($items) -Compress\n';
    const json = await withTimeout(runPowerShell(script, true), 5000, null);
    const list = Array.isArray(json) ? json : (json ? [json] : []);
    const windows = [];
    for (const w of list) {
      if (!w || !w.pid || !w.title) continue;
      // The host shell window itself is not a "real app" in the mirror.
      if (w.title === 'Desktop Time Machine') continue;
      let icon = null;
      if (w.path) { try { icon = await getFileIcon(w.path, 16); } catch { icon = null; } }
      windows.push({
        pid: Number(w.pid),
        processName: w.name || '',
        title: w.title,
        path: w.path || null,
        icon
      });
    }
    windows.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
    _lastWindowPids = new Set(windows.map((w) => w.pid));
    return windows;
  } catch {
    _lastWindowPids = new Set();
    return [];
  }
}

// Shell flyout buttons are hosted by explorer.exe, whose icon is a plain
// folder, so their art has to come from name matching instead.
function shellTrayKind(name) {
  const n = String(name || '').toLowerCase();
  if (/network|wi-?fi|wireless|ethernet|wlan|airplane|internet access/.test(n)) return 'network';
  if (/volume|sound|audio|speaker|mute/.test(n)) return 'volume';
  if (/battery|power/.test(n)) return 'battery';
  if (/security|shield|defender|virus|threat/.test(n)) return 'security';
  if (/bluetooth/.test(n)) return 'bluetooth';
  if (/notification|action center/.test(n)) return 'notification';
  if (/input indicator|keyboard|language/.test(n)) return 'input';
  return 'other';
}

const SHELL_TRAY_OWNERS = /^(explorer|ShellExperienceHost|StartMenuExperienceHost|SystemSettings|TextInputHost)$/i;

async function listTrayItems() {
  try {
    const script =
      'Add-Type -AssemblyName UIAutomationClient\n' +
      'Add-Type -AssemblyName UIAutomationTypes\n' +
      '$items = @()\n' +
      '$root = [System.Windows.Automation.AutomationElement]::RootElement\n' +
      '$condClass = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, "TrayNotifyWnd")\n' +
      '$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condClass)\n' +
      'if (-not $tray) { $tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condClass) }\n' +
      'if ($tray) {\n' +
      '  $all = $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)\n' +
      '  $seen = @{}\n' +
      '  foreach ($b in $all) {\n' +
      '    $n = $b.Current.Name\n' +
      '    $cls = $b.Current.ClassName\n' +
      '    if (-not $n) { continue }\n' +
      '    if ($cls -eq "TrayClockWClass" -or $cls -eq "TrayShowDesktopButtonWClass") { continue }\n' +
      '    if ($n -match "^System Clock") { continue }\n' +
      '    if ($seen.ContainsKey($n)) { continue }\n' +
      '    $seen[$n] = $true\n' +
      '    $ownerId = $b.Current.ProcessId\n' +
      '    $exe = $null\n' +
      '    $pn = ""\n' +
      '    try { $proc = [System.Diagnostics.Process]::GetProcessById($ownerId); $pn = $proc.ProcessName; $exe = $proc.MainModule.FileName } catch { }\n' +
      '    $items += [PSCustomObject]@{ name = $n; owner = $ownerId; process = $pn; path = $exe }\n' +
      '  }\n' +
      '}\n' +
      'ConvertTo-Json -InputObject @($items) -Compress\n';
    const json = await withTimeout(runPowerShell(script, true), 5000, null);
    const list = Array.isArray(json) ? json : (json ? [json] : []);
    const items = [];
    for (const t of list) {
      if (!t || !t.name) continue;
      const kind = shellTrayKind(t.name);
      const shellOwned = SHELL_TRAY_OWNERS.test(t.process || '');
      let icon = null;
      if (kind === 'other' && !shellOwned && t.path) {
        try { icon = await getFileIcon(t.path, 16); } catch { icon = null; }
      }
      items.push({ name: t.name, pid: Number(t.owner) || null, processName: t.process || '', kind, icon });
    }
    return items;
  } catch {
    return [];
  }
}

let _taskbarCache = null;
let _taskbarCacheAt = 0;

async function getTaskbarState() {
  if (_taskbarCache && (Date.now() - _taskbarCacheAt) < 5000) return _taskbarCache;
  const [pinned, windows, tray] = await Promise.all([
    listPinnedTaskbarApps(),
    listRunningWindows(),
    listTrayItems()
  ]);
  _taskbarCache = { pinned, windows, tray };
  _taskbarCacheAt = Date.now();
  return _taskbarCache;
}

async function activateWindow(pid) {
  const id = Number(pid);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid window process');
  if (!_lastWindowPids.has(id)) throw new Error('That window is no longer running');
  await runPowerShell('(New-Object -ComObject WScript.Shell).AppActivate(' + id + ')');
  return { success: true, pid: id };
}

// Opens an interactive shell in a validated folder. The command string is
// constant — the directory travels through an environment variable — so no
// user-controlled text is ever parsed by the shell.
async function openTerminal(dirPath) {
  const resolved = path.resolve(dirPath || os.homedir());
  if (!isSafePath(resolved)) throw new Error('Access denied: terminal path outside permitted boundaries');
  let stat;
  try { stat = await fsp.stat(resolved); } catch { throw new Error('Folder not found: ' + resolved); }
  if (!stat.isDirectory()) throw new Error('Terminal path is not a folder');
  if (process.platform !== 'win32') throw new Error('Terminal launch is only supported on Windows');

  const env = { ...process.env, DTM_TERM_CWD: resolved };
  const options = { cwd: resolved, env, detached: true, stdio: 'ignore', windowsHide: false };

  // A GUI process cannot hand a console to a child directly, so `start` creates
  // the console window. The directory still travels via the environment, never
  // as shell text.
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const comspec = process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe');
  spawn(comspec, [
    '/c', 'start', '', 'powershell.exe',
    '-NoExit', '-Command', 'Set-Location -LiteralPath $env:DTM_TERM_CWD'
  ], options).unref();
  return { success: true, path: resolved, terminal: 'powershell' };
}

// Runs a single command in the REAL host shell for the in-skin Command
// Prompt and returns its output. The command itself is user-supplied (that is
// what a terminal is), but every invocation is non-interactive, time-limited,
// runs as the current user with the app's environment, and starts in a
// validated folder.
const MAX_TERMINAL_COMMAND = 2000;
const MAX_TERMINAL_OUTPUT = 200 * 1024;
const TERMINAL_TIMEOUT_MS = 20000;

async function runTerminalCommand(command, cwd) {
  if (typeof command !== 'string' || !command.trim()) throw new Error('Command must be a non-empty string');
  if (command.length > MAX_TERMINAL_COMMAND) throw new Error('Command is too long');
  if (command.includes('\0')) throw new Error('Invalid command');

  const resolved = path.resolve(cwd || os.homedir());
  if (!isSafePath(resolved)) throw new Error('Access denied: terminal path outside permitted boundaries');
  let stat;
  try { stat = await fsp.stat(resolved); } catch { throw new Error('Folder not found: ' + resolved); }
  if (!stat.isDirectory()) throw new Error('Terminal path is not a folder');
  if (process.platform !== 'win32') throw new Error('Command Prompt is only supported on Windows');

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const exe = fs.existsSync(powershell) ? powershell : 'powershell.exe';
  const script = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; ' + command;

  return new Promise((resolve) => {
    const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-Command', script], {
      cwd: resolved,
      windowsHide: true,
      env: process.env
    });
    let stdout = '';
    let stderr = '';
    let done = false;
    let timer = null;

    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    };

    child.stdout.on('data', (chunk) => {
      if (stdout.length < MAX_TERMINAL_OUTPUT) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < MAX_TERMINAL_OUTPUT) stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => { stderr += err.message; finish(-1); });
    child.on('close', (code) => finish(code === null ? -1 : code));

    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(-2);
    }, TERMINAL_TIMEOUT_MS);
  });
}

function scanDrivesNode() {
  const drives = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = letter + ':\\';
    try {
      if (!fs.existsSync(root)) continue;
      const stats = fs.statfsSync(root);
      const totalBytes = stats.bsize * stats.blocks;
      const freeBytes = stats.bsize * stats.bavail;
      drives.push({
        letter,
        path: root,
        label: letter + ':',
        rawLabel: '',
        type: letter === 'A' || letter === 'B' ? 'Removable' : 'Fixed',
        totalBytes,
        freeBytes,
        available: true
      });
    } catch (err) {
      drives.push({ letter, path: root, label: letter + ':', rawLabel: '', type: 'Unknown', error: err.message, available: false });
    }
  }
  return drives;
}

// Tray buttons on Windows 11 are XAML islands: they expose no automation
// pattern and ignore posted clicks, and the flyouts they open cannot be driven
// from a full-screen window. The real settings page behind each area is the
// closest thing Windows exposes programmatically, so that is what opens.
const TRAY_SETTINGS = {
  notification: { uri: 'ms-settings:notifications', label: 'Notifications settings' },
  network: { uri: 'ms-settings:network-status', label: 'Network settings' },
  volume: { uri: 'ms-settings:sound', label: 'Sound settings' },
  battery: { uri: 'ms-settings:batterysaver', label: 'Battery settings' },
  bluetooth: { uri: 'ms-settings:bluetooth', label: 'Bluetooth settings' },
  input: { uri: 'ms-settings:regionlanguage', label: 'Language settings' },
  security: { uri: 'ms-settings:windowsdefender', label: 'Security settings' },
  other: null
};

// Clicking a mirrored tray button runs the real one, so the flyout that opens
// is the genuine Windows panel rather than a copy of it.
async function invokeTrayItem(name) {
  const wanted = String(name || '').trim();
  if (!wanted || wanted.length > 200) throw new Error('Invalid tray item');
  const fallback = TRAY_SETTINGS[shellTrayKind(wanted)] || null;
  const encoded = toBase64(wanted);
  const script =
    'Add-Type -AssemblyName UIAutomationClient\n' +
    'Add-Type -AssemblyName UIAutomationTypes\n' +
    '$name = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String("' + encoded + '"))\n' +
    '$root = [System.Windows.Automation.AutomationElement]::RootElement\n' +
    '$condClass = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ClassNameProperty, "TrayNotifyWnd")\n' +
    '$tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $condClass)\n' +
    'if (-not $tray) { $tray = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condClass) }\n' +
    'if (-not $tray) { "notray"; exit }\n' +
    '$el = $null\n' +
    '$all = $tray.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)\n' +
    'foreach ($b in $all) { if ($b.Current.Name -ieq $name) { $el = $b; break } }\n' +
    'if (-not $el) { foreach ($b in $all) { if ($b.Current.Name -and $b.Current.Name -ilike ($name + "*")) { $el = $b; break } } }\n' +
    'if ($el) {\n' +
    '  $pat = $null\n' +
    '  if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pat)) { $pat.Invoke(); "invoked"; exit }\n' +
    '  if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$pat)) { $pat.Toggle(); "toggled"; exit }\n' +
    '}\n' +
    '"nopattern"\n';
  const result = await withTimeout(runPowerShell(script), 8000, null);
  if (result === null) throw new Error('The notification area did not respond');
  if (result === 'invoked' || result === 'toggled') return { success: true, action: result, name: wanted };
  if (result === 'notray') throw new Error('Could not reach the Windows notification area');
  if (!fallback) throw new Error('That tray icon cannot be opened directly');
  await getShell().openExternal(fallback.uri);
  return { success: true, action: 'settings', settings: fallback.label, name: wanted };
}

module.exports = {
  getDesktopPaths,
  resolveShortcut,
  getFileIcon,
  recycleItem,
  listRecycleBin,
  emptyRecycleBin,
  getEnhancedDrives,
  scanDrivesNode,
  getNetworkLocations,
  getTaskbarState,
  invokeTrayItem,
  activateWindow,
  openTerminal,
  runTerminalCommand
};
