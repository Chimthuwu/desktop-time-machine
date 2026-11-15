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
const { createDock } = require('./window-dock');

const PROFILE_MARKER = 'waterfox-ie';
const WINDOW_CLASS_HINT = 'waterfox';
const MIN_PORT = 9300;
const PORT_RANGE = 90;

let instance = null; // { proc, port, ws, context, sessionId, url, title }
let openPromise = null;
let dockHelper = null;

function dockApi() {
  if (!dockHelper) dockHelper = createDock({ dir: profileDir(), marker: PROFILE_MARKER, processName: 'waterfox.exe' });
  return dockHelper;
}

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

    const d = dockApi();
    await d.ensure();
    await d.find();
    d.send('hide');
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
  dockApi().send('move ' + x + ' ' + y + ' ' + w + ' ' + h);
  return { ok: true };
}

function show() {
  dockApi().send('show');
  // Kiosk mode re-applies its fullscreen geometry a moment after being shown,
  // which would leave the page covering the whole screen. Re-assert the
  // docked rect as that transition settles.
  [300, 900, 1800, 3000].forEach((delay) => {
    setTimeout(() => { if (isRunning()) dockApi().send('raise'); }, delay);
  });
  return { ok: true };
}

function hide() {
  dockApi().send('hide');
  return { ok: true };
}

function raise() {
  dockApi().send('raise');
  return { ok: true };
}

function close() {
  if (!instance) return { ok: true };
  const proc = instance.proc;
  try { if (instance.ws) instance.ws.close(); } catch (e) {}
  dockApi().send('close');
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
  if (dockHelper) { dockHelper.dispose(); dockHelper = null; }
}

module.exports = { status, open, navigate, reload, history, state, dock, show, hide, raise, close, dispose };
