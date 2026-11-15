/**
 * Desktop Time Machine — Waterfox dock ("Internet Explorer")
 *
 * Waterfox is a real Firefox-based app, so its rendering engine cannot be
 * embedded in a <webview>. Instead we run a private, chrome-less kiosk
 * instance on a dedicated profile and dock that window into the retro
 * Internet Explorer window's page area. The page itself is therefore real
 * Waterfox (Waterfox logins, Waterfox certificates, Waterfox extensions),
 * while the retro window supplies the 1998 window furniture.
 *
 * Navigation is driven over WebDriver BiDi (Waterfox's --remote-debugging-port),
 * and window placement over a small, long-lived PowerShell helper that calls
 * user32 directly — Electron cannot move foreign windows.
 */

const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROFILE_MARKER = 'waterfox-ie';
const WINDOW_CLASS_HINT = 'waterfox';
const MIN_PORT = 9300;
const PORT_RANGE = 90;

let helper = null; // long-lived PowerShell process
let helperReady = null;
let helperQueue = [];
let instance = null; // { proc, port, ws, context, sessionId, url, title }
let openPromise = null;

// ---------------------------------------------------------------------------
// Waterfox discovery & profile
// ---------------------------------------------------------------------------

function candidatePaths() {
  const list = [];
  if (process.env.DTM_WATERFOX) list.push(process.env.DTM_WATERFOX);
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['ProgramW6432'],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : null,
    'Z:\\Program Files'
  ].filter(Boolean);
  for (const root of roots) {
    list.push(path.join(root, 'Waterfox', 'waterfox.exe'));
    list.push(path.join(root, WINDOW_CLASS_HINT, WINDOW_CLASS_HINT + '.exe'));
  }
  return list;
}

function resolveWaterfoxPath() {
  // Explicit override (also lets the app run without Waterfox for testing).
  if (process.env.DTM_WATERFOX !== undefined) {
    const forced = String(process.env.DTM_WATERFOX);
    try { return forced && fs.existsSync(forced) ? forced : null; } catch (e) { return null; }
  }
  for (const candidate of candidatePaths()) {
    try { if (fs.existsSync(candidate)) return candidate; } catch (e) { /* unreadable drive */ }
  }
  return null;
}

function profileDir() {
  return path.join(app.getPath('userData'), PROFILE_MARKER);
}

function ensureProfile() {
  const dir = profileDir();
  const chrome = path.join(dir, 'chrome');
  try {
    fs.mkdirSync(chrome, { recursive: true });
    const userJs = path.join(dir, 'user.js');
    const prefs = [
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("browser.aboutwelcome.enabled", false);',
      'user_pref("browser.startup.homepage_override.mstone", "ignore");',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      'user_pref("app.update.enabled", false);',
      'user_pref("browser.sessionstore.resume_from_crash", false);',
      'user_pref("browser.tabs.warnOnClose", false);',
      'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);',
      ''
    ].join('\n');
    const current = fs.existsSync(userJs) ? fs.readFileSync(userJs, 'utf8') : '';
    if (current !== prefs) fs.writeFileSync(userJs, prefs, 'utf8');
    // Kiosk already hides the browser UI; this is belt and braces in case the
    // window is ever shown non-kiosk.
    const css = path.join(chrome, 'userChrome.css');
    const rules = [
      '@-moz-document url("chrome://browser/content/browser.xhtml") {',
      '  #TabsToolbar, #nav-bar, #PersonalToolbar, #sidebar-box { visibility: collapse !important; }',
      '}',
      ''
    ].join('\n');
    if (!fs.existsSync(css) || fs.readFileSync(css, 'utf8') !== rules) fs.writeFileSync(css, rules, 'utf8');
  } catch (e) {
    // A read-only profile dir is not fatal; Waterfox will just use its defaults.
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Window helper (user32 via PowerShell)
// ---------------------------------------------------------------------------

const HELPER_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class DtmWin {',
  '  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }',
  '  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int t, bool repaint);',
  '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);',
  '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int t, uint flags);',
  '  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '}',
  '"@',
  '$script:hwnd = [IntPtr]::Zero',
  '$script:rect = @(0, 0, 0, 0)',
  'function Find-MainWindow([string]$marker) {',
  '  for ($i = 0; $i -lt 120; $i++) {',
  '    $procs = @(Get-CimInstance Win32_Process -Filter "Name=\'waterfox.exe\'" |',
  '      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($marker) } |',
  '      ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } |',
  '      Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })',
  '    if ($procs.Count -gt 0) { return $procs[0].MainWindowHandle }',
  '    Start-Sleep -Milliseconds 250',
  '  }',
  '  return [IntPtr]::Zero',
  '}',
  '"ready"',
  '[Console]::Out.Flush()',
  'while ($true) {',
  '  $line = [Console]::ReadLine()',
  '  if ($null -eq $line) { break }',
  '  $p = $line.Trim() -split "\\s+"',
  '  if ($p.Length -eq 0) { continue }',
  '  try {',
  '    switch ($p[0]) {',
  "      'find' {",
  '        $script:hwnd = Find-MainWindow $p[1]',
  '        if ($script:hwnd -ne [IntPtr]::Zero) { "hwnd=" + $script:hwnd.ToInt64() } else { "hwnd=0" }',
  '      }',
  "      'move' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        $script:rect = @([int]$p[1], [int]$p[2], [int]$p[3], [int]$p[4])',
  '        [void][DtmWin]::MoveWindow($script:hwnd, $script:rect[0], $script:rect[1], $script:rect[2], $script:rect[3], $true)',
  '        "ok"',
  '      }',
  "      'show' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        [void][DtmWin]::ShowWindow($script:hwnd, 8)',
  '        if ($script:rect[2] -gt 0) { [void][DtmWin]::MoveWindow($script:hwnd, $script:rect[0], $script:rect[1], $script:rect[2], $script:rect[3], $true) }',
  '        [void][DtmWin]::SetWindowPos($script:hwnd, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013)',
  '        "ok"',
  '      }',
  "      'hide' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        [void][DtmWin]::ShowWindow($script:hwnd, 0)',
  '        "ok"',
  '      }',
  "      'raise' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        if ($script:rect[2] -gt 0) { [void][DtmWin]::MoveWindow($script:hwnd, $script:rect[0], $script:rect[1], $script:rect[2], $script:rect[3], $true) }',
  '        [void][DtmWin]::SetWindowPos($script:hwnd, [IntPtr]::Zero, 0, 0, 0, 0, 0x0013)',
  '        "ok"',
  '      }',
  "      'close' {",
  '        if ($script:hwnd -eq [IntPtr]::Zero) { "err nohwnd"; break }',
  '        [void][DtmWin]::PostMessage($script:hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)',
  '        "ok"',
  '      }',
  "      'quit' {",
  '        "bye"',
  '        break',
  '      }',
  '      default { "err unknown" }',
  '    }',
  '  } catch { "err " + $_.Exception.Message }',
  '  [Console]::Out.Flush()',
  '}',
  ''
].join('\r\n');

function ensureHelper() {
  if (helperReady) return helperReady;
  helperReady = new Promise((resolve, reject) => {
    let scriptPath;
    try {
      const dir = profileDir();
      fs.mkdirSync(dir, { recursive: true });
      scriptPath = path.join(dir, 'dock-window.ps1');
      fs.writeFileSync(scriptPath, HELPER_SCRIPT, 'utf8');
    } catch (e) { reject(e); return; }

    const powershell = process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : 'powershell.exe';
    try {
      helper = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      });
    } catch (e) { reject(e); return; }

    helper.on('error', (err) => { helper = null; reject(err); });
    helper.on('exit', () => { helper = null; helperReady = null; });
    helper.stdin.on('error', () => {});

    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line === 'ready') resolve(true);
        helperQueue.shift();
      }
    };
    helper.stdout.on('data', onData);
    setTimeout(() => reject(new Error('window helper did not start')), 10000).unref();
  });
  return helperReady;
}

function helperSend(command) {
  if (!helper || !helper.stdin.writable) return;
  helperQueue.push(command);
  try { helper.stdin.write(command + '\r\n'); } catch (e) { /* helper died */ }
}

async function findWindow() {
  await ensureHelper();
  helperSend('find ' + PROFILE_MARKER);
  // The helper answers asynchronously; give it room to find the window.
  await new Promise((r) => setTimeout(r, 1200));
}

// ---------------------------------------------------------------------------
// WebDriver BiDi client
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function connectBidi(port, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') { reject(new Error('WebSocket unavailable')); return; }
    let settled = false;
    const deadline = Date.now() + timeoutMs;
    let ws = null;

    const attempt = () => {
      if (settled) return;
      if (Date.now() > deadline) { reject(new Error('Waterfox remote agent did not answer')); return; }
      try { ws = new WebSocket('ws://127.0.0.1:' + port + '/session'); }
      catch (e) { setTimeout(attempt, 400); return; }
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        resolve(ws);
      };
      ws.onerror = () => {
        try { ws.close(); } catch (e) {}
        if (!settled) setTimeout(attempt, 400);
      };
    };
    attempt();
  });
}

function bidiClient(ws) {
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.type === 'error') reject(new Error(msg.error + ': ' + (msg.message || '')));
      else resolve(msg.result || {});
    }
  };
  ws.onclose = () => {
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new Error('Waterfox connection closed')); });
    pending.clear();
  };
  return (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    try { ws.send(JSON.stringify({ id, method, params: params || {} })); }
    catch (e) { pending.delete(id); clearTimeout(timer); reject(e); }
  });
}

function pickPort() {
  return MIN_PORT + Math.floor(Math.random() * PORT_RANGE);
}

function isRunning() {
  return !!(instance && instance.ws && instance.ws.readyState === 1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function status() {
  const exe = resolveWaterfoxPath();
  return {
    available: !!exe && process.platform === 'win32' && typeof WebSocket === 'function',
    path: exe,
    running: isRunning(),
    profile: profileDir()
  };
}

function safeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^https?:/i.test(value) || /^about:/i.test(value) || /^file:/i.test(value)) return value;
  return null;
}

async function open(rawUrl) {
  if (openPromise) return openPromise;
  openPromise = (async () => {
    const url = safeUrl(rawUrl) || 'https://www.google.com/';
    if (!status().available) return { ok: false, error: 'Waterfox is not installed.' };
    if (isRunning()) {
      try { await instance.send('browsingContext.navigate', { context: instance.context, url, wait: 'none' }); } catch (e) {}
      show();
      return { ok: true, reused: true };
    }

    const exe = resolveWaterfoxPath();
    const profile = ensureProfile();
    const port = pickPort();

    let proc;
    try {
      proc = spawn(exe, ['--kiosk', '--no-remote', '--profile', profile, '--remote-debugging-port', String(port), url], {
        detached: true,
        stdio: 'ignore'
      });
      proc.unref();
    } catch (e) {
      return { ok: false, error: 'Could not start Waterfox: ' + e.message };
    }

    let ws;
    try {
      ws = await connectBidi(port, 25000);
      const send = bidiClient(ws);
      await send('session.new', { capabilities: {} });
      const tree = await send('browsingContext.getTree', {});
      const contexts = (tree && tree.contexts) || [];
      const top = contexts.find((c) => !c.parent) || contexts[0];
      if (!top) throw new Error('Waterfox opened no browsing context');
      instance = { proc, port, ws, send, context: top.context, url, title: 'Internet Explorer' };
    } catch (e) {
      try { proc.kill(); } catch (err) {}
      try { if (ws) ws.close(); } catch (err) {}
      return { ok: false, error: e.message };
    }

    await ensureHelper();
    await findWindow();
    helperSend('hide');
    return { ok: true };
  })().finally(() => { openPromise = null; });
  return openPromise;
}

async function navigate(rawUrl) {
  const url = safeUrl(rawUrl);
  if (!url || !isRunning()) return { ok: false };
  try {
    await instance.send('browsingContext.navigate', { context: instance.context, url, wait: 'none' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function reload() {
  if (!isRunning()) return { ok: false };
  try { await instance.send('browsingContext.reload', { context: instance.context }); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function history(delta) {
  if (!isRunning()) return { ok: false };
  try {
    await instance.send('browsingContext.traverseHistory', { context: instance.context, delta: delta < 0 ? -1 : 1 });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function state() {
  if (!isRunning()) return { ok: false };
  try {
    const res = await instance.send('script.evaluate', {
      expression: 'JSON.stringify({ url: location.href, title: document.title })',
      target: { context: instance.context },
      awaitPromise: false
    });
    const value = res && res.result && res.result.value;
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      instance.url = parsed.url || instance.url;
      instance.title = parsed.title || instance.title;
      return { ok: true, url: instance.url, title: instance.title };
    }
  } catch (e) { /* navigation may destroy the realm mid-flight */ }
  return { ok: false };
}

function dock(rect) {
  if (!rect) return { ok: false };
  const x = Math.round(Number(rect.x) || 0);
  const y = Math.round(Number(rect.y) || 0);
  const w = Math.max(120, Math.round(Number(rect.w) || 0));
  const h = Math.max(80, Math.round(Number(rect.h) || 0));
  helperSend('move ' + x + ' ' + y + ' ' + w + ' ' + h);
  return { ok: true };
}

function show() {
  helperSend('show');
  // Kiosk mode re-applies its fullscreen geometry a moment after being shown,
  // which would leave the page covering the whole screen. Re-assert the
  // docked rect as that transition settles.
  [300, 900, 1800, 3000].forEach((delay) => {
    setTimeout(() => { if (isRunning()) helperSend('raise'); }, delay);
  });
  return { ok: true };
}

function hide() {
  helperSend('hide');
  return { ok: true };
}

function raise() {
  helperSend('raise');
  return { ok: true };
}

function close() {
  if (!instance) return { ok: true };
  const proc = instance.proc;
  try { if (instance.ws) instance.ws.close(); } catch (e) {}
  helperSend('close');
  instance = null;
  setTimeout(() => {
    if (!proc || proc.killed) return;
    try { proc.kill(); } catch (e) {}
    if (process.platform === 'win32' && proc.pid) {
      try { execFile('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true }, () => {}); } catch (e) {}
    }
  }, 4000).unref();
  return { ok: true };
}

function dispose() {
  try { close(); } catch (e) {}
  if (helper) {
    try { helperSend('quit'); } catch (e) {}
    try { helper.stdin.end(); } catch (e) {}
    try { helper.kill(); } catch (e) {}
    helper = null;
    helperReady = null;
  }
}

module.exports = { status, open, navigate, reload, history, state, dock, show, hide, raise, close, dispose };
