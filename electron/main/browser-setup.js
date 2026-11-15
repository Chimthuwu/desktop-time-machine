/**
 * Desktop Time Machine — retro browser provisioning
 *
 * The retro Internet Explorer is a real Ungoogled Chromium window, so a copy of
 * this app handed to someone else has to bring its own engine. On first use the
 * app fetches the official Windows installer, installs it silently for the
 * current user, and brands it the way this machine has it: an "Internet
 * Explorer" shortcut carrying the classic icon.
 *
 * A bundled installer wins over a download, so an offline copy can ship the
 * setup exe in resources/ and never touch the network.
 */

const { app } = require('electron');
const { execFile } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');
const chromium = require('./chromium');

const RELEASE_API =
  'https://api.github.com/repos/ungoogled-software/ungoogled-chromium-windows/releases/latest';
const ICON_FILE = 'internet-explorer.ico';
const SHORTCUT_FILE = 'Internet Explorer.lnk';
const SHORTCUT_ARGS = '--source-shortcut-location=desktop';
const SHORTCUT_DESCRIPTION = 'Access the Internet';
const INSTALL_TIMEOUT = 15 * 60 * 1000;
const DOWNLOAD_ATTEMPTS = 3;

let inFlight = null;

function installerSuffix() {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'ia32') return 'x86';
  return 'x64';
}

function resourceDirs() {
  const dirs = [
    path.join(__dirname, '..', '..', 'resources'),
    process.resourcesPath ? path.join(process.resourcesPath, 'resources') : null,
    process.resourcesPath || null
  ];
  return dirs.filter((dir, index) => dir && dirs.indexOf(dir) === index);
}

// An explicitly bundled installer beats anything the network offers.
function bundledInstaller() {
  const forced = process.env.DTM_CHROMIUM_INSTALLER;
  if (forced) {
    try { if (fs.existsSync(forced)) return forced; } catch (e) { /* unusable path */ }
  }
  const suffix = installerSuffix();
  const exact = ['ungoogled-chromium-installer-' + suffix + '.exe', 'ungoogled-chromium-installer.exe'];
  for (const dir of resourceDirs()) {
    for (const name of exact) {
      const file = path.join(dir, name);
      try { if (fs.existsSync(file)) return file; } catch (e) { /* unreadable drive */ }
    }
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (e) { continue; }
    const match = entries.find(
      (name) => /^ungoogled-chromium.*installer.*\.exe$/i.test(name) &&
        (name.includes(suffix) || /installer\.exe$/i.test(name))
    );
    if (match) return path.join(dir, match);
  }
  return null;
}

function getJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Too many redirects')); return; }
    const req = https.get(url, {
      headers: { 'User-Agent': 'desktop-time-machine', Accept: 'application/vnd.github+json' },
      timeout: 20000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(getJson(new URL(res.headers.location, url).toString(), redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('GitHub answered ' + res.statusCode));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Unreadable release list')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('The download server did not answer')));
  });
}

function downloadFile(url, dest, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) { reject(new Error('Too many redirects')); return; }
    const req = https.get(url, {
      headers: { 'User-Agent': 'desktop-time-machine' },
      timeout: 60000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadFile(new URL(res.headers.location, url).toString(), dest, onProgress, redirects + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('The installer download answered ' + res.statusCode));
        return;
      }
      const total = Number(res.headers['content-length']) || 0;
      let received = 0;
      const temp = dest + '.part';
      const out = fs.createWriteStream(temp);
      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        try { out.destroy(); } catch (e) {}
        try { fs.rmSync(temp, { force: true }); } catch (e) {}
        reject(error);
      };
      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress(received, total);
      });
      res.on('error', fail);
      out.on('error', fail);
      out.on('finish', () => {
        if (failed) return;
        if (total && received !== total) { fail(new Error('The installer download was incomplete')); return; }
        try { fs.renameSync(temp, dest); } catch (e) { fail(e); return; }
        resolve(dest);
      });
      res.pipe(out);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('The download stalled')));
  });
}

async function fetchInstaller(onProgress) {
  const suffix = installerSuffix();
  const release = await getJson(RELEASE_API);
  const assets = Array.isArray(release && release.assets) ? release.assets : [];
  const asset = assets.find((entry) => new RegExp('_installer_' + suffix + '\\.exe$', 'i').test(entry.name));
  if (!asset) throw new Error('The latest release has no ' + suffix + ' installer');
  const dest = path.join(app.getPath('temp'), 'dtm-' + asset.name);
  try {
    if (fs.existsSync(dest) && fs.statSync(dest).size === asset.size) return dest;
  } catch (e) { /* re-download below */ }
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      await downloadFile(asset.browser_download_url, dest, onProgress);
      return dest;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('The installer could not be downloaded');
}

// The official installer takes /silent /install for a per-user install, which
// needs no elevation and leaves chrome.exe under %LOCALAPPDATA%.
function runInstaller(file) {
  return new Promise((resolve) => {
    execFile(file, ['/silent', '/install'], {
      windowsHide: true,
      timeout: INSTALL_TIMEOUT,
      maxBuffer: 1024 * 1024
    }, (error) => resolve(error || null));
  });
}

// Windows shortcuts are COM objects, so the browser icon is applied through
// WScript.Shell. Existing shortcuts are left untouched: the owner may have
// pointed theirs at their own icon art.
function brandShortcuts(exe) {
  const iconSource = path.join(__dirname, '..', '..', 'src', 'skins', 'shared', 'icons', 'win95', ICON_FILE);
  const iconTarget = path.join(app.getPath('userData'), ICON_FILE);
  try {
    fs.mkdirSync(path.dirname(iconTarget), { recursive: true });
    fs.copyFileSync(iconSource, iconTarget);
  } catch (e) { /* icon stays optional */ }
  const icon = fs.existsSync(iconTarget) ? iconTarget : exe;
  const targets = [path.join(app.getPath('desktop'), SHORTCUT_FILE)];
  if (process.env.APPDATA) {
    targets.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', SHORTCUT_FILE));
  }

  const script = [
    '$ws = New-Object -ComObject WScript.Shell',
    '$made = @()',
    'foreach ($p in $env:DTM_LNK_TARGETS.Split("`n")) {',
    '  if (-not $p) { continue }',
    '  if (Test-Path -LiteralPath $p) { continue }',
    '  $s = $ws.CreateShortcut($p)',
    '  $s.TargetPath = $env:DTM_LNK_EXE',
    '  $s.Arguments = $env:DTM_LNK_ARGS',
    '  $s.WorkingDirectory = $env:DTM_LNK_DIR',
    '  $s.Description = $env:DTM_LNK_DESC',
    '  $s.IconLocation = $env:DTM_LNK_ICON',
    '  $s.Save()',
    '  $made += $p',
    '}',
    'Write-Output ($made -join "`n")'
  ].join('\n');

  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        windowsHide: true,
        timeout: 30000,
        env: Object.assign({}, process.env, {
          DTM_LNK_TARGETS: targets.join('\n'),
          DTM_LNK_EXE: exe,
          DTM_LNK_ARGS: SHORTCUT_ARGS,
          DTM_LNK_DIR: path.dirname(exe),
          DTM_LNK_DESC: SHORTCUT_DESCRIPTION,
          DTM_LNK_ICON: icon + ',0'
        })
      },
      (error, stdout) => {
        const created = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        resolve({ created, error: error ? error.message : null });
      });
  });
}

/**
 * Makes sure a real browser engine is present and branded.
 * Resolves with { ok, exe, installed, shortcuts } or { ok: false, error }.
 */
function ensure(options = {}) {
  if (inFlight) return inFlight;
  const announce = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  inFlight = (async () => {
    let exe = chromium.executablePath();
    let installed = false;
    if (!exe) {
      let installer = bundledInstaller();
      let downloaded = false;
      if (installer) {
        announce({ phase: 'install', file: path.basename(installer) });
      } else {
        announce({ phase: 'download', received: 0, total: 0 });
        installer = await fetchInstaller((received, total) => {
          announce({ phase: 'download', received, total });
        });
        downloaded = true;
      }
      announce({ phase: 'install', file: path.basename(installer) });
      await runInstaller(installer);
      if (downloaded) { try { fs.rmSync(installer, { force: true }); } catch (e) { /* temp file */ } }
      exe = chromium.executablePath();
      if (!exe) throw new Error('The browser installer finished but no chrome.exe was found');
      installed = true;
    }
    const shortcuts = await brandShortcuts(exe);
    announce({ phase: 'done', installed, exe });
    return { ok: true, exe, installed, shortcuts };
  })()
    .catch((error) => ({ ok: false, error: error.message }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { ensure, bundledInstaller, installerSuffix };
