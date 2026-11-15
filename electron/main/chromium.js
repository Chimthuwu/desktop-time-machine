/**
 * Desktop Time Machine — Chromium dock ("Internet Explorer")
 *
 * Ungoogled Chromium is the preferred engine for the retro browser. Like the
 * Waterfox path it runs a private instance on a dedicated profile and docks
 * that window into the 1998 window's page area, so the page is real Chromium
 * while the chrome around it is ours.
 *
 * Chromium is started in app mode (--app, no tabs or address bar) with a
 * DevTools port, and navigation is driven over the DevTools protocol.
 */

const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { createDock } = require('./window-dock');

const PROFILE_MARKER = 'chromium-ie';
const PROCESS_NAME = 'chrome.exe';

let instance = null; // { proc, port, ws, send, url, title }
let openPromise = null;
let dockHelper = null;

// ---------------------------------------------------------------------------
// Discovery & profile
// ---------------------------------------------------------------------------

function candidatePaths() {
  const list = [];
  const local = process.env.LOCALAPPDATA;
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['ProgramW6432']
  ].filter(Boolean);

  if (local) {
    list.push(path.join(local, 'Chromium', 'Application', 'chrome.exe'));
    list.push(path.join(local, 'Programs', 'Ungoogled Chromium', 'chrome.exe'));
    list.push(path.join(local, 'Programs', 'Chromium', 'chrome.exe'));
  }
  for (const root of roots) {
    list.push(path.join(root, 'Ungoogled Chromium', 'chrome.exe'));
    list.push(path.join(root, 'Chromium', 'Application', 'chrome.exe'));
  }
  return list;
}

function resolveChromiumPath() {
  // Explicit override (also lets the app run without Chromium for testing).
  if (process.env.DTM_CHROMIUM !== undefined) {
    const forced = String(process.env.DTM_CHROMIUM);
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
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* read-only profile is not fatal */ }
  return dir;
}

function dockApi() {
  if (!dockHelper) {
    dockHelper = createDock({ dir: profileDir(), marker: PROFILE_MARKER, processName: PROCESS_NAME });
  }
  return dockHelper;
}

function isRunning() {
  return !!(instance && instance.ws && instance.ws.readyState === 1);
}

// ---------------------------------------------------------------------------
// DevTools plumbing
// ---------------------------------------------------------------------------

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function readDevToolsPort(profile, timeoutMs) {
  const file = path.join(profile, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const poll = () => {
      try {
        if (fs.existsSync(file)) {
          const port = Number(fs.readFileSync(file, 'utf8').split('\n')[0]);
          if (port > 0) { resolve(port); return; }
        }
      } catch (e) { /* the file is written in one go; retry */ }
      if (Date.now() > deadline) { resolve(0); return; }
      setTimeout(poll, 150);
    };
    poll();
  });
}

function httpJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: 2500 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('DevTools did not answer')));
  });
}

async function findPageTarget(port, wantedUrl) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const list = await httpJson(port, '/json/list');
      const pages = (Array.isArray(list) ? list : []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      const match = pages.find((t) => t.url === wantedUrl) ||
        pages.find((t) => /^(https?|file):/i.test(t.url)) ||
        pages[0];
      if (match) return match;
    } catch (e) { /* browser still starting */ }
    await sleep(250);
  }
  return null;
}

function connectWs(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') { reject(new Error('WebSocket unavailable')); return; }
    let settled = false;
    const deadline = Date.now() + timeoutMs;
    let ws = null;

    const attempt = () => {
      if (settled) return;
      if (Date.now() > deadline) { reject(new Error('Chromium DevTools did not answer')); return; }
      try { ws = new WebSocket(url); } catch (e) { setTimeout(attempt, 400); return; }
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

function cdpClient(ws) {
  let nextId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message || msg.error.code || 'DevTools error'));
      else resolve(msg.result || {});
    }
  };
  ws.onclose = () => {
    pending.forEach(({ reject, timer }) => { clearTimeout(timer); reject(new Error('Chromium connection closed')); });
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function status() {
  const exe = resolveChromiumPath();
  return {
    available: !!exe && process.platform === 'win32' && typeof WebSocket === 'function',
    engine: 'chromium',
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
    const exe = resolveChromiumPath();
    if (!exe) return { ok: false, error: 'Chromium is not installed.' };
    if (isRunning()) {
      try { await instance.send('Page.navigate', { url }); } catch (e) {}
      show();
      return { ok: true, reused: true };
    }

    const profile = ensureProfile();
    // A stale file from a previous run would point at a dead port.
    try { fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true }); } catch (e) {}

    let proc;
    try {
      proc = spawn(exe, [
        '--app=' + url,
        '--user-data-dir=' + profile,
        '--remote-debugging-port=0',
        '--remote-allow-origins=*',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-session-crashed-bubble',
        '--hide-crash-restore-bubble',
        '--disable-features=Translate,MediaRouter',
        '--window-size=1024,720',
        '--window-position=-2400,-2400'
      ], { detached: true, stdio: 'ignore' });
      proc.unref();
    } catch (e) {
      return { ok: false, error: 'Could not start Chromium: ' + e.message };
    }

    let ws;
    try {
      const port = await readDevToolsPort(profile, 25000);
      if (!port) throw new Error('Chromium did not open a debugging port');
      const target = await findPageTarget(port, url);
      if (!target) throw new Error('Chromium opened no page');
      ws = await connectWs(target.webSocketDebuggerUrl, 12000);
      const send = cdpClient(ws);
      await send('Page.enable');
      instance = { proc, port, ws, send, url, title: 'Internet Explorer' };
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
    await instance.send('Page.navigate', { url });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function reload() {
  if (!isRunning()) return { ok: false };
  try { await instance.send('Page.reload'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function history(delta) {
  if (!isRunning()) return { ok: false };
  try {
    const nav = await instance.send('Page.getNavigationHistory');
    const entries = (nav && nav.entries) || [];
    const index = (nav.currentIndex || 0) + (delta < 0 ? -1 : 1);
    if (index < 0 || index >= entries.length) return { ok: false };
    await instance.send('Page.navigateToHistoryEntry', { entryId: entries[index].id });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function state() {
  if (!isRunning()) return { ok: false };
  try {
    const res = await instance.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ url: location.href, title: document.title })',
      returnByValue: true
    });
    const value = res && res.result && res.result.value;
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      instance.url = parsed.url || instance.url;
      instance.title = parsed.title || instance.title;
      return { ok: true, url: instance.url, title: instance.title };
    }
  } catch (e) { /* navigation may destroy the context mid-flight */ }
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
  }, 3000).unref();
  return { ok: true };
}

function dispose() {
  try { close(); } catch (e) {}
  if (dockHelper) { dockHelper.dispose(); dockHelper = null; }
}

module.exports = { status, open, navigate, reload, history, state, dock, show, hide, raise, close, dispose };
