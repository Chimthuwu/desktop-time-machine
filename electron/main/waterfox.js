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

let instance = null; // { proc, port, ws, send, tabs: Map<tabId, {contextId, url, title}>, activeTabId }
let openPromise = null;
let dockHelper = null;
let nextTabId = 1;

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
      // Create a new tab instead of navigating the current one
      const newTab = await newTab(url);
      show();
      return { ok: true, reused: true, tabId: newTab.tabId };
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
      
      // Initialize tabs map with the first tab
      const firstTabId = nextTabId++;
      const tabs = new Map();
      tabs.set(firstTabId, { contextId: top.context, url, title: 'Internet Explorer' });
      
      instance = { proc, port, ws, send, tabs, activeTabId: firstTabId };
    } catch (e) {
      try { proc.kill(); } catch (err) {}
      try { if (ws) ws.close(); } catch (err) {}
      return { ok: false, error: e.message };
    }

    const d = dockApi();
    await d.ensure();
    await d.find();
    d.send('hide');
    return { ok: true, tabId: firstTabId };
  })().finally(() => { openPromise = null; });
  return openPromise;
}

// Tab management functions
async function newTab(rawUrl) {
  if (!isRunning()) return { ok: false, error: 'Browser not running' };
  const url = safeUrl(rawUrl) || 'https://www.google.com/';
  try {
    // Create a new browsing context (tab) via browsingContext.create
    const result = await instance.send('browsingContext.create', { type: 'tab' });
    const contextId = result.context;
    const tabId = nextTabId++;
    
    // Navigate the new context to the URL
    await instance.send('browsingContext.navigate', { context: contextId, url, wait: 'none' });
    
    // Store tab info
    instance.tabs.set(tabId, { contextId, url, title: 'New Tab' });
    
    // Switch to the new tab
    instance.activeTabId = tabId;
    
    return { ok: true, tabId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function switchTab(tabId) {
  if (!isRunning()) return { ok: false };
  const tab = instance.tabs.get(tabId);
  if (!tab) return { ok: false, error: 'Tab not found' };
  try {
    await instance.send('browsingContext.activate', { context: tab.contextId });
    instance.activeTabId = tabId;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function closeTab(tabId) {
  if (!isRunning()) return { ok: false };
  if (!instance.tabs.has(tabId)) return { ok: false, error: 'Tab not found' };
  
  const tab = instance.tabs.get(tabId);
  try {
    await instance.send('browsingContext.close', { context: tab.contextId });
  } catch (e) {
    // Ignore errors
  }
  instance.tabs.delete(tabId);
  
  // If we closed the active tab, switch to another one
  if (instance.activeTabId === tabId) {
    const remainingTabs = Array.from(instance.tabs.keys());
    if (remainingTabs.length > 0) {
      await switchTab(remainingTabs[0]);
    } else {
      // No tabs left, close the browser
      await close();
    }
  }
  return { ok: true };
}

function getTabs() {
  if (!isRunning()) return { ok: false };
  const tabs = [];
  for (const [tabId, tab] of instance.tabs) {
    tabs.push({ tabId, url: tab.url, title: tab.title, active: tabId === instance.activeTabId });
  }
  return { ok: true, tabs, activeTabId: instance.activeTabId };
}

async function navigate(rawUrl) {
  const url = safeUrl(rawUrl);
  if (!url || !isRunning()) return { ok: false };
  const activeTab = instance.tabs.get(instance.activeTabId);
  if (!activeTab) return { ok: false };
  try {
    await instance.send('browsingContext.navigate', { context: activeTab.contextId, url, wait: 'none' });
    activeTab.url = url;
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function reload() {
  if (!isRunning()) return { ok: false };
  const activeTab = instance.tabs.get(instance.activeTabId);
  if (!activeTab) return { ok: false };
  try { await instance.send('browsingContext.reload', { context: activeTab.contextId }); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function history(delta) {
  if (!isRunning()) return { ok: false };
  const activeTab = instance.tabs.get(instance.activeTabId);
  if (!activeTab) return { ok: false };
  try {
    await instance.send('browsingContext.traverseHistory', { context: activeTab.contextId, delta: delta < 0 ? -1 : 1 });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function state() {
  if (!isRunning()) return { ok: false };
  const activeTab = instance.tabs.get(instance.activeTabId);
  if (!activeTab) return { ok: false };
  try {
    const res = await instance.send('script.evaluate', {
      expression: 'JSON.stringify({ url: location.href, title: document.title })',
      target: { context: activeTab.contextId },
      awaitPromise: false
    });
    const value = res && res.result && res.result.value;
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      activeTab.url = parsed.url || activeTab.url;
      activeTab.title = parsed.title || activeTab.title;
      return { ok: true, url: activeTab.url, title: activeTab.title };
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

module.exports = { status, open, navigate, reload, history, state, dock, show, hide, raise, close, dispose, newTab, switchTab, closeTab, getTabs };
