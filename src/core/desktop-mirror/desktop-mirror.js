/**
 * Desktop Time Machine — Shared Real Desktop Mirror
 *
 * Attaches window.dtmEngine.mountDesktop(opts) to the engine. The host shell
 * (index.html) loads this script; skins call window.parent.DTM.mountDesktop()
 * from inside their iframe. All DOM is created in the *skin* document via
 * container.ownerDocument so the mirror works identically in every skin while
 * reusing each skin's own window CSS classes for an authentic look.
 *
 * Responsibilities (Phase 4 — Parts 1, 2, 3):
 *  - Render the REAL Windows Desktop (User + Public, de-duplicated) with the
 *    ACTUAL Windows shell icons (no emoji stand-ins).
 *  - Single / multi selection, double-click open, drag, context menu, rename,
 *    delete (safe Recycle Bin), new folder, refresh, open-file-location,
 *    properties — all against the real host filesystem.
 *  - System icons: My Computer (real drives), Recycle Bin (real contents),
 *    Network — functional, not decorative.
 *  - Per-skin icon position persistence.
 *  - Live updates via IPC filesystem watching.
 */
(function () {
  'use strict';

  const STYLE_ID = 'dtm-mirror-style';
  const CSS = `
.dtm-desktop-layer { position:absolute; inset:0; z-index:1; }
.dtm-icon {
  box-sizing:border-box; position:absolute; width:84px; height:84px; display:flex; flex-direction:column;
  align-items:center; gap:3px; padding:5px 2px; color:#fff; cursor:default;
  text-shadow:1px 1px #000; user-select:none; border:1px solid transparent;
}
.dtm-icon.selected { background:#000080; border:1px dotted #fff; }
.dtm-marquee { position:absolute; z-index:5; border:1px dotted #fff;
  background:rgba(0,0,128,.18); pointer-events:none; }
.dtm-icon-img { width:32px; height:32px; object-fit:contain; display:block;
  image-rendering:auto; filter:drop-shadow(1px 1px 0 rgba(0,0,0,0.4)); pointer-events:none; }
.dtm-icon-glyph { font-size:30px; line-height:32px; pointer-events:none; }
.dtm-icon-label { font:11px/13px Tahoma,Arial,sans-serif; text-align:center; word-break:break-word;
  max-width:80px; max-height:26px; overflow:hidden; display:-webkit-box;
  -webkit-box-orient:vertical; -webkit-line-clamp:2; pointer-events:none; }
.dtm-icon-label.input { background:#fff; color:#000; text-shadow:none; border:1px solid #000; outline:1px solid #000080; }
.dtm-window { box-shadow:2px 2px 0 #000; }
.dtm-explorer { display:flex; flex-direction:column; height:100%; width:100%; }
.dtm-explorer-toolbar { display:flex; gap:4px; padding:4px; flex-wrap:wrap; align-items:center;
  border-bottom:1px solid #808080; background:var(--gray,#c0c0c0); }
.dtm-explorer-addr { flex:1; min-width:120px; border:2px inset #fff; padding:2px 4px; font:11px Tahoma; }
.dtm-explorer-grid { position:relative; flex:1; overflow:auto; padding:8px; display:flex; flex-wrap:wrap; gap:10px;
  align-content:flex-start; background:#fff; }
.dtm-explorer-grid > .dtm-marquee { background:rgba(0,0,128,.18); border:1px dotted #000080; }
.dtm-explorer-item { width:80px; display:flex; flex-direction:column; align-items:center; text-align:center;
  padding:4px; cursor:pointer; border:1px solid transparent; color:#000; }
.dtm-explorer-item:hover, .dtm-explorer-item.selected { background:#000080; color:#fff; }
.dtm-explorer-item img { width:28px; height:28px; object-fit:contain; }
.dtm-explorer-item span { font:11px Tahoma; margin-top:2px; word-break:break-all; }
.dtm-loading, .dtm-err { padding:20px; font:12px Tahoma; color:#333; }
.dtm-err { color:#c00; }
.dtm-pad { padding:14px; font:12px Tahoma; }
.dtm-pad li { margin:4px 0; }
.dtm-btn { min-height:22px; padding:2px 8px; cursor:pointer;
  background:var(--gray,#c0c0c0); border:2px solid; border-color:#fff #404040 #404040 #fff;
  font:11px Tahoma; }
.dtm-btn:active { border-color:#404040 #fff #fff #404040; }
.dtm-status { padding:3px 8px; border:1px solid; border-color:#808080 #fff #fff #808080; margin:3px; }
.dtm-context { position:absolute; z-index:30000; background:var(--gray,#c0c0c0);
  border:2px solid; border-color:#fff #404040 #404040 #fff; padding:3px; min-width:160px;
  box-shadow:2px 2px #000; font:11px Tahoma; color:#000; outline:none; }
.dtm-context > div { position:relative; padding:6px 18px 6px 10px; cursor:default; }
.dtm-context > div:hover { background:#000080; color:#fff; }
.dtm-context hr { border:0; border-top:1px solid #808080; border-bottom:1px solid #fff; margin:3px 0; }
.dtm-context .dtm-sub { display:none; position:absolute; left:100%; top:-5px; min-width:170px;
  background:var(--gray,#c0c0c0); border:2px solid; border-color:#fff #404040 #404040 #fff;
  padding:3px; box-shadow:2px 2px #000; color:#000; z-index:31000; }
.dtm-context > div.open > .dtm-sub { display:block; }
.dtm-context .dtm-sub > div { padding:6px 18px 6px 22px; cursor:default; }
.dtm-context .dtm-sub > div:hover { background:#000080; color:#fff; }
.dtm-context > div.active, .dtm-context .dtm-sub > div.active { background:#000080; color:#fff; }
.dtm-context > div.open, .dtm-context .dtm-sub > div.open { background:#000080; color:#fff; }
.dtm-context .disabled { color:#808080; text-shadow:1px 1px #fff; pointer-events:none; }
.dtm-context .checked { font-weight:bold; }
.dtm-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.3); z-index:40000;
  display:flex; align-items:center; justify-content:center; }
.dtm-modal { width:340px; background:#c0c0c0; border:2px solid; border-color:#fff #404040 #404040 #fff;
  box-shadow:2px 2px 0 #000; font:11px Tahoma; }
.dtm-modal-bar { padding:4px 8px; font-weight:bold; color:#fff;
  background:linear-gradient(90deg,#000080,#1084d0); }
.dtm-modal-body { padding:12px; }
.dtm-modal-body input { width:100%; box-sizing:border-box; padding:3px 5px; font:11px Tahoma;
  border:2px inset #fff; margin-top:6px; }
.dtm-modal-row { display:flex; justify-content:flex-end; gap:6px; margin-top:12px; }
.dtm-modal-row button { min-width:70px; padding:3px 10px; cursor:pointer;
  border:2px solid; border-color:#fff #404040 #404040 #fff; background:#c0c0c0; font:11px Tahoma; }
`;

  function injectCss(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function el(doc, tag, cls, text) {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Shared icon cache — switching skins must not re-extract every shell icon.
  const iconCache = new Map();

  function iconFor(DTM, targetPath, size) {
    const key = size + ':' + String(targetPath).toLowerCase();
    const cached = iconCache.get(key);
    if (cached) return cached;
    const request = DTM.fs.icon(targetPath, size)
      .then((url) => url || null)
      .catch(() => null);
    iconCache.set(key, request);
    if (iconCache.size > 600) {
      // Drop the oldest half rather than growing without bound.
      const keys = Array.from(iconCache.keys()).slice(0, 300);
      keys.forEach((k) => iconCache.delete(k));
    }
    return request;
  }

  // Artwork is the only part of a desktop item that goes stale in place: a
  // shortcut can be re-pointed at a different icon, and an icon file can be
  // re-drawn without its path changing. Forgetting the cached images makes the
  // next render ask the host again instead of needing an app restart.
  function invalidateIcon(targetPath) {
    if (!targetPath) return;
    const suffix = ':' + String(targetPath).toLowerCase();
    for (const key of Array.from(iconCache.keys())) {
      if (key.endsWith(suffix)) iconCache.delete(key);
    }
  }

  // Shortcuts (and standalone .ico files) borrow artwork from another file, so
  // they are refreshed whenever anything on the desktop changes. Plain files
  // are keyed on themselves and only need refreshing when they are the target.
  function invalidateArtwork(changedPath, items) {
    invalidateIcon(changedPath);
    const changed = changedPath ? String(changedPath).toLowerCase() : null;
    (items || []).forEach((item) => {
      const p = item && item.path;
      if (!p) return;
      if (/\.(lnk|url|ico)$/i.test(p) || (changed && String(p).toLowerCase() === changed)) {
        invalidateIcon(p);
      }
    });
  }

  function joinPath(dir, name) {
    if (!dir) return name;
    return /[\\/]$/.test(dir) ? dir + name : dir + '\\' + name;
  }

  function parentPathOf(p) {
    if (!p) return null;
    const trimmed = String(p).replace(/[\\/]+$/, '');
    if (/^[a-zA-Z]:$/.test(trimmed)) return trimmed + '\\';
    const parts = trimmed.split(/[\\/]/);
    parts.pop();
    const parent = parts.join('\\');
    if (/^[a-zA-Z]:$/.test(parent)) return parent + '\\';
    return parent || null;
  }

  // Host items that duplicate a built-in system icon are not rendered twice.
  const SYSTEM_ICON_NAMES = new Set([
    'my computer', 'recycle bin', 'network', 'network neighborhood',
    'macintosh hd', 'trash'
  ]);

  function isSystemNamedHostItem(name) {
    const base = String(name || '').replace(/\.(lnk|url)$/i, '').trim().toLowerCase();
    return SYSTEM_ICON_NAMES.has(base);
  }

  // ---------------------------------------------------------------------------
  // Real app shortcuts stay inside the app.
  //
  // Waterfox, Discord and PotPlayer belong to the mirrored real desktop and
  // taskbar, so activating them opens the retro counterpart instead of
  // launching — or raising — the real Windows window over the retro session.
  // ---------------------------------------------------------------------------
  const WATERFOX_NAME_RE = /waterfox/i;
  const WATERFOX_TARGET_RE = /(^|[\\/])waterfox(\.exe)?$/i;

  // The retro browser is a Chromium window, so a desktop shortcut that launches
  // Chrome/Chromium — including one re-labelled "Internet Explorer" with the
  // classic icon — belongs to the in-app browser, not to a real browser window.
  const BROWSER_SHORTCUT_NAMES = /^(waterfox|internet explorer|google chrome|chrome|chromium|microsoft edge|ms edge)$/i;
  const BROWSER_TARGETS = /(^|[\\/])(waterfox|chrome|chromium|msedge|iexplore)(\.exe)?$/i;

  // Retro apps owned by the shell (see components/ShellApps).
  const RETRO_APP_RULES = [
    { app: 'discord', re: /discord/i },
    { app: 'mediaplayer', re: /potplayer/i }
  ];

  // Real Windows programs whose retro counterpart lives in the shared
  // application framework (components/SharedApps) instead of the shell. These
  // open inside the active skin rather than raising the real Windows window.
  const RETRO_SHARED_APP_RULES = [
    { app: 'notepad', re: /(^|[\\/])notepad(\.exe)?$/i },
    { app: 'calculator', re: /(^|[\\/])(calc|calculator|calculatorapp)(\.exe)?$/i },
    { app: 'paint', re: /(^|[\\/])(mspaint|paint)(\.exe)?$/i }
  ];

  // Maps a desktop item, pinned entry or running window to its retro app.
  // Window titles are deliberately ignored so a browser tab titled "Discord"
  // is never hijacked.
  function retroAppForEntry(entry) {
    if (!entry) return null;
    const probe = [entry.name, entry.processName, entry.path].filter(Boolean).join(' ');
    if (!probe) return null;
    for (const rule of RETRO_APP_RULES) {
      if (rule.re.test(probe)) return rule.app;
    }
    return null;
  }

  function retroSharedAppForEntry(entry) {
    if (!entry) return null;
    const probe = [entry.name, entry.processName, entry.path].filter(Boolean).join(' ');
    if (!probe) return null;
    for (const rule of RETRO_SHARED_APP_RULES) {
      if (rule.re.test(probe)) return rule.app;
    }
    return null;
  }

  function isRetroBrowserShortcut(DTM, item) {
    if (!item || item.isDirectory) return Promise.resolve(false);
    const label = String(item.name || '').replace(/\.(lnk|url)$/i, '').trim();
    if (BROWSER_SHORTCUT_NAMES.test(label) || WATERFOX_NAME_RE.test(item.name || '')) return Promise.resolve(true);
    // Shortcut targets are resolved lazily, only for the item being opened.
    if (!DTM || !DTM.fs || typeof DTM.fs.resolveShortcut !== 'function') return Promise.resolve(false);
    if (!/\.(lnk|url)$/i.test(item.path || '')) return Promise.resolve(false);
    return DTM.fs.resolveShortcut(item.path)
      .then((sc) => {
        const target = String((sc && sc.target) || '');
        if (!target) return false;
        // .url shortcuts carry a web address rather than an executable.
        if (/^(https?|file):/i.test(target) && !BROWSER_TARGETS.test(target)) return true;
        return BROWSER_TARGETS.test(target) || WATERFOX_TARGET_RE.test(target);
      })
      .catch(() => false);
  }

  function openRetroApp(doc, app) {
    if (!app) return false;
    const view = doc && doc.defaultView;
    try {
      // The shell owns the real windows, so asking it to launch the app works
      // from every skin (Windows and Mac alike).
      const target = view && view.parent ? view.parent : window;
      target.postMessage({ type: 'dtm:launch-webapp', app }, '*');
      return true;
    } catch {
      return false;
    }
  }

  function openRetroBrowser(doc) {
    return openRetroApp(doc, 'browser');
  }

  // Resolves true when the item was handled by opening a retro app.
  async function openRetroShortcut(DTM, doc, item) {
    const app = retroAppForEntry(item);
    if (app) return openRetroApp(doc, app);
    if (!(await isRetroBrowserShortcut(DTM, item))) return false;
    return openRetroApp(doc, 'browser');
  }

  // Per-skin icon position persistence.
  function makeStore(skinId) {    const key = 'dtm:icon-positions:' + skinId;
    let data = {};
    try { data = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { data = {}; }
    return {
      get(path) { return data[path]; },
      set(path, pos) { data[path] = pos; try { localStorage.setItem(key, JSON.stringify(data)); } catch {} },
      clear() { data = {}; try { localStorage.removeItem(key); } catch {} },
      all() { return data; }
    };
  }

  // One live renderer per skin, keyed by skin id. Filesystem change events are
  // dispatched from a single preload listener so repeated mounts/switches do
  // not accumulate listeners or leaked watchers.
  const liveRenderers = new Map();
  let changesBound = false;

  function bindChangeFeed(preload) {
    if (changesBound || !preload || typeof preload.on !== 'function') return;
    changesBound = true;
    preload.on('dtm:fs-changed', (payload) => {
      if (!payload || !payload.id) return;
      if (window.dtmEngine && window.dtmEngine.invalidateDesktop) {
        window.dtmEngine.invalidateDesktop();
      }
      const changed = payload.filename ? joinPath(payload.path, payload.filename) : payload.path;
      for (const entry of liveRenderers.values()) {
        if (!entry.watchIds || !entry.watchIds.has(payload.id)) continue;
        // Refresh the artwork before the re-render reads it, so a changed
        // shortcut icon shows up on the desktop as soon as the file changes.
        invalidateArtwork(changed, entry.state && entry.state.items);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          Promise.resolve(entry.render()).catch((err) => {
            console.warn('[DTM mirror] refresh after change failed:', err);
          });
        }, 400);
      }
    });

    // Icon artwork can live outside the watched desktop folders (a shortcut's
    // IconLocation on another drive, for instance), so the host watches those
    // files separately and asks for a fresh render when one is edited.
    preload.on('dtm:fs-icons-changed', () => {
      for (const entry of liveRenderers.values()) {
        if (entry.disposed) continue;
        invalidateArtwork(null, entry.state && entry.state.items);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          Promise.resolve(entry.render()).catch((err) => {
            console.warn('[DTM mirror] artwork refresh failed:', err);
          });
        }, 250);
      }
    });
  }

  function unmountDesktop(skinId) {
    const entry = liveRenderers.get(skinId);
    if (!entry) return;
    entry.disposed = true;
    clearTimeout(entry.timer);
    for (const id of entry.watchIds || []) {
      try { Promise.resolve(entry.DTM.fs.unwatch(id)).catch(() => {}); } catch {}
    }
    entry.watchIds.clear();
    entry.watchedPaths.clear();
    try {
      if (entry.view && entry.onResize) entry.view.removeEventListener('resize', entry.onResize);
      if (entry.resizeObserver) entry.resizeObserver.disconnect();
      for (const dispose of entry.listenerDisposers || []) dispose();
    } catch {}
    try {
      if (entry.layer && entry.layer.parentNode) entry.layer.remove();
    } catch {}
    liveRenderers.delete(skinId);
  }

  // ---------------------------------------------------------------------------
  // Modal prompt (Electron renderers reject window.prompt()).
  // ---------------------------------------------------------------------------
  function promptModal(doc, title, message, def) {
    return new Promise((resolve) => {
      const overlay = el(doc, 'div', 'dtm-modal-overlay');
      const modal = el(doc, 'div', 'dtm-modal');
      const bar = el(doc, 'div', 'dtm-modal-bar', title);
      const body = el(doc, 'div', 'dtm-modal-body');
      const label = el(doc, 'div', null, message);
      const input = el(doc, 'input');
      input.value = def || '';
      const row = el(doc, 'div', 'dtm-modal-row');
      const ok = el(doc, 'button', null, 'OK');
      const cancel = el(doc, 'button', null, 'Cancel');
      row.append(ok, cancel);
      body.append(label, input, row);
      modal.append(bar, body);
      overlay.appendChild(modal);
      doc.body.appendChild(overlay);
      const done = (v) => { overlay.remove(); resolve(v); };
      ok.addEventListener('click', () => done(input.value.trim()));
      cancel.addEventListener('click', () => done(null));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value.trim());
        if (e.key === 'Escape') done(null);
      });
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) done(null); });
      setTimeout(() => { input.focus(); input.select(); }, 30);
    });
  }

  function confirm(doc, msg) {
    try { return doc.defaultView.confirm(msg); } catch { return true; }
  }

  // ---------------------------------------------------------------------------
  // Generic window (reuses each skin's .window / .titlebar CSS).
  // ---------------------------------------------------------------------------
  function openWindow(opts) {
    const doc = opts.doc;
    const skinId = opts.skinId;
    const isMac = skinId === 'macos8' || skinId === 'macosx';
    const win = el(doc, 'div', 'window dtm-window');
    win.dataset.app = opts.app || 'explorer';
    win.dataset.icon = opts.icon || (isMac ? '📁' : '🗂️');
    win.style.width = (opts.width || 520) + 'px';
    win.style.height = (opts.height || 360) + 'px';
    const n = doc.querySelectorAll('.dtm-window').length;
    win.style.left = (40 + (n % 6) * 28) + 'px';
    win.style.top = (40 + (n % 6) * 24) + 'px';
    win.style.zIndex = 50 + n;

    const titlebar = el(doc, 'div', isMac ? 'title-bar' : 'titlebar');
    const titleText = el(doc, 'span', isMac ? 'title-text' : 'win-title', opts.title);
    titlebar.appendChild(titleText);
    const closeBtn = el(doc, 'button', isMac ? 'close-box' : 'win95-button', isMac ? '' : '×');
    closeBtn.addEventListener('click', () => { win.remove(); if (opts.onClose) opts.onClose(); });
    if (isMac) {
      titlebar.appendChild(closeBtn);
    } else {
      const controls = el(doc, 'div', 'title-controls');
      controls.appendChild(closeBtn);
      titlebar.appendChild(controls);
    }
    const body = el(doc, 'div', 'window-body');
    win.appendChild(titlebar);
    win.appendChild(body);
    opts.desktop.appendChild(win);
    makeDraggable(win, titlebar, doc);
    body.appendChild(opts.content);
    return { win, body };
  }

  function makeDraggable(win, handle, doc, onMove) {
    let ox = 0, oy = 0, moving = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      moving = true;
      ox = e.clientX - win.offsetLeft;
      oy = e.clientY - win.offsetTop;
      try { handle.setPointerCapture(e.pointerId); } catch {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (!moving) return;
      win.style.left = Math.max(0, e.clientX - ox) + 'px';
      win.style.top = Math.max(0, e.clientY - oy) + 'px';
    });
    const stop = () => { if (moving && onMove) { try { onMove(win.offsetLeft, win.offsetTop); } catch {} } moving = false; };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  // ---------------------------------------------------------------------------
  // Real file browser (shared by Explorer, My Computer, Recycle Bin).
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Keyboard model shared by the desktop and Explorer windows, with Windows
  // conventions: F2 rename, Delete, Enter open, Ctrl+A/C/X/V, arrow keys,
  // Escape to clear, and type-to-select (a letter jumps to the next item whose
  // name starts with it; repeating a letter cycles through them).
  // ---------------------------------------------------------------------------
  // Cut/copy/paste state shared by every surface (desktop and Explorer windows).
  let fileClipboard = null; // { mode: 'copy' | 'cut', items: [{ path, name }] }
  // Only the surface the user touched last reacts to keys.
  let activeFileSurface = null;

  function isTextEntry(target) {
    return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName || ''));
  }

  // Index of the item to select for the typed text, or -1.
  function findTypeAhead(names, typed, current) {
    const n = names.length;
    if (!n || !typed) return -1;
    const sameLetter = [...typed].every((c) => c === typed[0]);
    const needle = sameLetter ? typed[0] : typed;
    const base = current >= 0 ? current : 0;
    const skip = sameLetter && current >= 0 ? 1 : 0;
    for (let step = 0; step < n; step++) {
      const i = (base + skip + step) % n;
      if (String(names[i] || '').toLowerCase().startsWith(needle)) return i;
    }
    return -1;
  }

  // Typed characters are combined for about a second, like Explorer.
  function createTypeAhead() {
    let typed = '';
    let timer = null;
    return function (char, names, current) {
      clearTimeout(timer);
      timer = setTimeout(() => { typed = ''; }, 900);
      typed += char.toLowerCase();
      return findTypeAhead(names, typed, current);
    };
  }

  // Pastes the shared clipboard into a folder. Pasting a copy into the folder
  // it came from creates "Copy of <name>"; a cut is a move and clears the
  // clipboard afterwards. Returns true when a paste was attempted.
  async function pasteClipboard(DTM, dir) {
    const clip = fileClipboard;
    if (!clip || !dir) return false;
    const errors = [];
    for (const item of clip.items) {
      const sameFolder = String(parentPathOf(item.path) || '').toLowerCase() === String(dir).toLowerCase();
      try {
        if (clip.mode === 'cut') {
          if (!sameFolder) await DTM.fs.move(item.path, joinPath(dir, item.name));
        } else {
          const name = sameFolder ? 'Copy of ' + item.name : item.name;
          await DTM.fs.copy(item.path, joinPath(dir, name));
        }
      } catch (e) { errors.push(item.name + ': ' + e.message); }
    }
    if (clip.mode === 'cut') fileClipboard = null;
    if (errors.length) alert('Could not paste:\n' + errors.join('\n'));
    return true;
  }

  // ctx: items(), selected(), select(index), selectAll(), clear(), open(items),
  // rename(item), remove(items), paste(), up(), typeAhead(), backspace ('remove' | 'up').
  function handleFileKey(e, ctx) {
    if (e.defaultPrevented || e.altKey || isTextEntry(e.target)) return false;
    const key = e.key;
    const handled = () => { e.preventDefault(); return true; };
    if (e.ctrlKey || e.metaKey) {
      const k = key.toLowerCase();
      if (k === 'a') { ctx.selectAll(); return handled(); }
      if (k === 'c' || k === 'x') {
        const sel = ctx.selected();
        if (!sel.length) return false;
        fileClipboard = { mode: k === 'x' ? 'cut' : 'copy', items: sel.map((i) => ({ path: i.path, name: i.name })) };
        return handled();
      }
      if (k === 'v') { ctx.paste(); return handled(); }
      return false;
    }
    if (key === 'F2') {
      const sel = ctx.selected();
      if (sel.length !== 1) return false;
      ctx.rename(sel[0]);
      return handled();
    }
    if (key === 'Delete' || (key === 'Backspace' && ctx.backspace === 'remove')) {
      const sel = ctx.selected();
      if (!sel.length) return false;
      ctx.remove(sel);
      return handled();
    }
    if (key === 'Backspace' && ctx.backspace === 'up') { ctx.up(); return handled(); }
    if (key === 'Enter') {
      const sel = ctx.selected();
      if (!sel.length) return false;
      ctx.open(sel);
      return handled();
    }
    if (key === 'Escape') {
      if (!ctx.selected().length) return false;
      ctx.clear();
      return handled();
    }
    if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowLeft') {
      const items = ctx.items();
      if (!items.length) return false;
      const sel = ctx.selected();
      const cur = items.findIndex((i) => sel.some((s) => s.path === i.path));
      const forward = key === 'ArrowDown' || key === 'ArrowRight';
      const next = cur < 0 ? (forward ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, cur + (forward ? 1 : -1)));
      ctx.select(next);
      return handled();
    }
    if (key.length === 1 && key !== ' ') {
      const items = ctx.items();
      if (!items.length) return false;
      const sel = ctx.selected();
      const cur = items.findIndex((i) => sel.length > 0 && i.path === sel[0].path);
      const idx = ctx.typeAhead(key, items.map((i) => i.name), cur);
      if (idx < 0) return false;
      ctx.select(idx);
      return handled();
    }
    return false;
  }

  function buildExplorer(opts) {
    const doc = opts.doc;
    const DTM = opts.DTM;
    const skinId = opts.skinId;
    const wrap = el(doc, 'div', 'dtm-explorer');
    const toolbar = el(doc, 'div', 'dtm-explorer-toolbar');
    const mkBtn = (label) => el(doc, 'button', 'dtm-btn', label);
    const up = mkBtn('⬆ Up');
    const nf = mkBtn('📁 New Folder');
    const rn = mkBtn('✏️ Rename');
    const del = mkBtn('🗑️ Delete');
    const ref = mkBtn('🔄 Refresh');
    const addr = el(doc, 'input', 'dtm-explorer-addr');
    toolbar.append(up, nf, rn, del, ref, addr);
    const grid = el(doc, 'div', 'dtm-explorer-grid');
    const status = el(doc, 'div', 'dtm-status', '');
    wrap.append(toolbar, grid, status);

    let current = opts.path || '';
    let selected = null;
    // Ctrl-click and the rubber band select several rows at once; `selected`
    // stays the primary item the single-item actions (Rename) work on.
    let selection = [];
    let visibleItems = [];

    function setSelection(items) {
      selection = (items || []).filter(Boolean);
      selected = selection[0] || null;
      const paths = new Set(selection.map((i) => i.path));
      grid.querySelectorAll('.dtm-explorer-item').forEach((row) => {
        row.classList.toggle('selected', paths.has(row.dataset.path));
      });
    }

    async function fetchIcon(item) {
      return iconFor(DTM, item.path, 28);
    }

    function addRow(item) {
      const row = el(doc, 'div', 'dtm-explorer-item');
      row.dataset.path = item.path;
      row.dataset.dir = item.isDirectory ? '1' : '0';
      const img = el(doc, 'img');
      img.alt = '';
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const span = el(doc, 'span', null, item.name);
      row.append(img, span);
      row.title = item.path + (item.isDirectory ? '' : ('\n' + (item.size ? Math.round(item.size / 1024) + ' KB' : 'File')));
      row._item = item;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) {
          const already = selection.some((i) => i.path === item.path);
          setSelection(already ? selection.filter((i) => i.path !== item.path) : selection.concat(item));
        } else {
          setSelection([item]);
        }
      });
      row.addEventListener('dblclick', () => {
        if (item.isDirectory) load(item.path);
        else openItem(item);
      });
      grid.appendChild(row);
      fetchIcon(item).then((url) => { if (url) img.src = url; });
    }

    async function load(p) {
      current = p;
      wrap.dataset.dir = p;
      addr.value = p;
      grid.innerHTML = '<div class="dtm-loading">Reading directory…</div>';
      try {
        const res = await DTM.fs.list(p);
        selected = null;
        selection = [];
        visibleItems = res.items;
        grid.innerHTML = '';
        if (res.parentPath) addRow({ name: '.. (Up)', path: res.parentPath, isDirectory: true, isUp: true });
        res.items.forEach(addRow);
        status.textContent = res.items.length + ' object(s)' + (res.truncated ? ' (truncated)' : '');
      } catch (e) {
        grid.innerHTML = '<div class="dtm-err">' + escapeHtml(e.message) + '</div>';
        status.textContent = 'Error';
      }
    }

    function getSelected() {
      if (!selection.length) { alert('Select a file or folder first.'); return null; }
      return selection[0];
    }

    async function openItem(item) {
      try {
        if (await openRetroShortcut(DTM, doc, item)) return;
        // Hand shortcuts to the Windows shell so .lnk arguments, working
        // directories and .url associations behave exactly as natively.
        await DTM.system.openPath(item.path);
      } catch (e) { alert('Could not open: ' + e.message); }
    }

    up.addEventListener('click', () => {
      if (!current) return;
      const parent = parentPathOf(current);
      if (parent) load(parent);
    });
    addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(addr.value); });
    ref.addEventListener('click', () => {
      visibleItems.forEach((item) => invalidateIcon(item.path));
      load(current);
    });
    nf.addEventListener('click', async () => {
      const name = await promptModal(doc, 'New Folder', 'Name for the new folder:', 'New Folder');
      if (!name) return;
      try { await DTM.fs.mkdir(joinPath(current, name)); load(current); }
      catch (e) { alert('Could not create folder: ' + e.message); }
    });
    rn.addEventListener('click', async () => {
      const item = getSelected(); if (!item) return;
      const name = await promptModal(doc, 'Rename', 'Rename to:', item.name);
      if (!name || name === item.name) return;
      try { await DTM.fs.rename(item.path, name); load(current); }
      catch (e) { alert('Could not rename: ' + e.message); }
    });
    del.addEventListener('click', async () => {
      if (!selection.length) { alert('Select a file or folder first.'); return; }
      const targets = selection.slice();
      const question = targets.length > 1
        ? 'Send ' + targets.length + ' items to the Recycle Bin?'
        : 'Send "' + targets[0].name + '" to the Recycle Bin?';
      if (!confirm(doc, question)) return;
      try {
        for (const item of targets) await DTM.fs.recycle(item.path);
        load(current);
      } catch (e) { alert('Could not delete: ' + e.message); }
    });

    // Rubber-band selection: dragging empty space in the list selects every row
    // it touches, the same gesture the desktop itself uses.
    const band = { el: null, startX: 0, startY: 0, base: [], moved: false, keepOnClick: false };
    function bandPoint(e) {
      const box = grid.getBoundingClientRect();
      return { x: e.clientX - box.left + grid.scrollLeft, y: e.clientY - box.top + grid.scrollTop };
    }
    function bandRectAt(e) {
      const p = bandPoint(e);
      return {
        left: Math.min(p.x, band.startX),
        top: Math.min(p.y, band.startY),
        right: Math.max(p.x, band.startX),
        bottom: Math.max(p.y, band.startY)
      };
    }
    function stopBand() {
      if (!band.el) return;
      band.keepOnClick = band.moved;
      band.moved = false;
      band.el.remove();
      band.el = null;
    }
    grid.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== grid) return;
      const p = bandPoint(e);
      band.startX = p.x;
      band.startY = p.y;
      band.base = (e.ctrlKey || e.metaKey) ? selection.slice() : [];
      if (!band.base.length) setSelection([]);
      band.moved = false;
      band.el = el(doc, 'div', 'dtm-marquee');
      band.el.style.left = p.x + 'px';
      band.el.style.top = p.y + 'px';
      grid.appendChild(band.el);
      try { grid.setPointerCapture(e.pointerId); } catch {}
    });
    grid.addEventListener('pointermove', (e) => {
      if (!band.el) return;
      const rect = bandRectAt(e);
      band.el.style.left = rect.left + 'px';
      band.el.style.top = rect.top + 'px';
      band.el.style.width = Math.max(0, rect.right - rect.left) + 'px';
      band.el.style.height = Math.max(0, rect.bottom - rect.top) + 'px';
      band.moved = rect.right - rect.left > 2 || rect.bottom - rect.top > 2;

      const box = grid.getBoundingClientRect();
      const picked = [];
      grid.querySelectorAll('.dtm-explorer-item').forEach((row) => {
        const r = row.getBoundingClientRect();
        const itemRect = {
          left: r.left - box.left + grid.scrollLeft,
          top: r.top - box.top + grid.scrollTop,
          right: r.right - box.left + grid.scrollLeft,
          bottom: r.bottom - box.top + grid.scrollTop
        };
        const touched = !(itemRect.right < rect.left || itemRect.left > rect.right ||
          itemRect.bottom < rect.top || itemRect.top > rect.bottom);
        const keep = band.base.some((i) => i.path === row.dataset.path);
        row.classList.toggle('selected', touched || keep);
        if (touched && row._item) picked.push(row._item);
      });
      const seen = new Set();
      const merged = [];
      band.base.concat(picked).forEach((item) => {
        if (!item || seen.has(item.path)) return;
        seen.add(item.path);
        merged.push(item);
      });
      selection = merged;
      selected = merged[0] || null;
    });
    ['pointerup', 'pointercancel'].forEach((type) => {
      grid.addEventListener(type, stopBand);
      doc.addEventListener(type, stopBand);
    });

    grid.addEventListener('click', () => {
      // Finishing a rubber band must not wipe the selection it just made.
      if (band.keepOnClick) { band.keepOnClick = false; return; }
      setSelection([]);
    });

    // Keyboard: act only while this window is the one the user last touched.
    const explorerToken = {};
    const onPointer = () => { activeFileSurface = explorerToken; };
    wrap.addEventListener('pointerdown', onPointer, true);
    const fileItems = () => Array.from(grid.querySelectorAll('.dtm-explorer-item'))
      .map((row) => row._item)
      .filter((item) => item && !item.isUp);
    const keyContext = {
      items: fileItems,
      selected: () => selection.filter((item) => !item.isUp),
      select: (index) => { const item = fileItems()[index]; if (item) setSelection([item]); },
      selectAll: () => setSelection(fileItems()),
      clear: () => setSelection([]),
      open: (items) => {
        const first = items[0];
        if (first.isDirectory) load(first.path);
        else items.forEach((item) => openItem(item));
      },
      // Rename and Delete reuse the toolbar actions, so both behave the same.
      rename: (item) => { setSelection([item]); rn.click(); },
      remove: (items) => { setSelection(items); del.click(); },
      paste: async () => { if (await pasteClipboard(DTM, current)) load(current); },
      up: () => up.click(),
      backspace: 'up',
      typeAhead: createTypeAhead()
    };
    const onKey = (e) => {
      if (activeFileSurface !== explorerToken) return;
      handleFileKey(e, keyContext);
    };
    doc.addEventListener('keydown', onKey);

    wrap._refresh = () => load(current);
    load(current);
    return {
      wrap,
      refresh: () => load(current),
      dispose: () => {
        ['pointerup', 'pointercancel'].forEach((type) => doc.removeEventListener(type, stopBand));
        doc.removeEventListener('keydown', onKey);
        wrap.removeEventListener('pointerdown', onPointer, true);
        if (activeFileSurface === explorerToken) activeFileSurface = null;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // My Computer — real drives + special folders.
  // ---------------------------------------------------------------------------
  function openMyComputer(opts) {
    const doc = opts.doc, DTM = opts.DTM, skinId = opts.skinId;
    const wrap = el(doc, 'div', 'dtm-pad');
    wrap.innerHTML = '<div class="dtm-loading">Detecting drives…</div>';
    const w = openWindow({ doc, skinId, desktop: opts.desktop, title: 'My Computer',
      width: 560, height: 380, content: wrap });

    async function build() {
      wrap.innerHTML = '';
      const h = el(doc, 'div', null, 'Hard Disk Drives / Devices');
      h.style.fontWeight = 'bold'; h.style.marginBottom = '8px';
      wrap.appendChild(h);
      let drives;
      try { drives = await DTM.fs.getDrives(); } catch { drives = []; }
      const grid = el(doc, 'div'); grid.style.display = 'flex'; grid.style.flexWrap = 'wrap';
      grid.style.gap = '18px';
      (drives || []).forEach((d) => {
        const item = el(doc, 'div');
        item.style.cssText = 'width:110px;text-align:center;padding:8px;cursor:pointer;border:1px solid transparent;';
        item.innerHTML = '<div style="font-size:30px">💽</div><div>' + escapeHtml(d.label || d.letter + ':') + '</div>';
        if (d.type) { const t = el(doc, 'div', null, d.type); t.style.fontSize = '10px'; t.style.color = '#555'; item.appendChild(t); }
        if (d.totalBytes) { const c = el(doc, 'div', null, Math.round(d.freeBytes / 1073741824) + ' GB free of ' + Math.round(d.totalBytes / 1073741824) + ' GB'); c.style.fontSize = '10px'; c.style.color = '#555'; item.appendChild(c); }
        item.addEventListener('click', () => {
          const ex = buildExplorer({ doc, DTM, skinId, desktop: opts.desktop, path: d.path });
          openWindow({ doc, skinId, desktop: opts.desktop, title: d.label || d.letter + ':', width: 620, height: 440, content: ex.wrap, onClose: ex.dispose });
        });
        grid.appendChild(item);
      });
      wrap.appendChild(grid);

      let folders;
      try { folders = await DTM.fs.getSpecialFolders(); } catch { folders = {}; }
      const fl = el(doc, 'div', null, 'System Folders');
      fl.style.fontWeight = 'bold'; fl.style.margin = '16px 0 8px';
      wrap.appendChild(fl);
      const fg = el(doc, 'div'); fg.style.display = 'flex'; fg.style.flexWrap = 'wrap'; fg.style.gap = '18px';
      const labels = [['desktop', 'Desktop'], ['documents', 'Documents'], ['downloads', 'Downloads'], ['pictures', 'Pictures'], ['music', 'Music'], ['videos', 'Videos'], ['home', 'Home']];
      labels.forEach(([k, lbl]) => {
        const p = folders && folders[k];
        if (!p) return;
        const item = el(doc, 'div');
        item.style.cssText = 'width:110px;text-align:center;padding:8px;cursor:pointer;border:1px solid transparent;';
        item.innerHTML = '<div style="font-size:28px">📁</div><div>' + lbl + '</div>';
        item.addEventListener('click', () => {
          const ex = buildExplorer({ doc, DTM, skinId, desktop: opts.desktop, path: p });
          openWindow({ doc, skinId, desktop: opts.desktop, title: lbl, width: 620, height: 440, content: ex.wrap, onClose: ex.dispose });
        });
        fg.appendChild(item);
      });
      wrap.appendChild(fg);
    }
    build();
  }

  // ---------------------------------------------------------------------------
  // Recycle Bin — real contents.
  // ---------------------------------------------------------------------------
  function openRecycleBin(opts) {
    const doc = opts.doc, DTM = opts.DTM, skinId = opts.skinId;
    const wrap = el(doc, 'div', 'dtm-pad');
    const w = openWindow({ doc, skinId, desktop: opts.desktop, title: 'Recycle Bin',
      width: 480, height: 360, content: wrap });
    const tb = el(doc, 'div', 'dtm-explorer-toolbar');
    const empty = el(doc, 'button', 'dtm-btn', '🗑️ Empty Recycle Bin');
    const ref = el(doc, 'button', 'dtm-btn', '🔄 Refresh');
    tb.append(empty, ref);
    wrap.appendChild(tb);
    const list = el(doc, 'div'); list.style.marginTop = '8px';
    wrap.appendChild(list);

    async function refresh() {
      list.innerHTML = '<div class="dtm-loading">Reading Recycle Bin…</div>';
      let items;
      try { items = await DTM.fs.recycleList(); } catch (e) { list.innerHTML = '<div class="dtm-err">' + escapeHtml(e.message) + '</div>'; return; }
      if (!items || !items.length) { list.innerHTML = '<div style="padding:18px;text-align:center;">The Recycle Bin is empty.</div>'; return; }
      list.innerHTML = '';
      items.forEach((it) => {
        const row = el(doc, 'div');
        row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:5px;border-bottom:1px solid #ddd;';
        const img = el(doc, 'img'); img.style.cssText = 'width:20px;height:20px;';
        const p = it.deletedFrom || it.path;
        iconFor(DTM, p, 16).then((u) => { if (u) img.src = u; });
        const label = el(doc, 'div');
        label.innerHTML = '<b>' + escapeHtml(it.name) + '</b><br><span style="color:#666;font-size:10px;">' +
          escapeHtml(it.deletedFrom || 'location unknown') +
          (it.size ? ' · ' + Math.round(it.size / 1024) + ' KB' : '') + '</span>';
        row.append(img, label);
        list.appendChild(row);
      });
    }
    empty.addEventListener('click', async () => {
      if (!confirm(doc, 'Permanently delete everything in the Recycle Bin?')) return;
      try { await DTM.fs.recycleEmpty(); refresh(); }
      catch (e) { alert('Could not empty Recycle Bin: ' + e.message); }
    });
    ref.addEventListener('click', refresh);
    refresh();
  }

  // ---------------------------------------------------------------------------
  // Network Neighborhood — real mapped drives and shared folders.
  // ---------------------------------------------------------------------------
  function openNetwork(opts) {
    const doc = opts.doc, DTM = opts.DTM, skinId = opts.skinId;
    const wrap = el(doc, 'div', 'dtm-explorer');
    const toolbar = el(doc, 'div', 'dtm-explorer-toolbar');
    const ref = el(doc, 'button', 'dtm-btn', '🔄 Refresh');
    const addr = el(doc, 'input', 'dtm-explorer-addr');
    addr.placeholder = '\\\\server\\share';
    const go = el(doc, 'button', 'dtm-btn', 'Go');
    toolbar.append(ref, addr, go);
    const body = el(doc, 'div');
    body.style.cssText = 'flex:1;overflow:auto;padding:10px;background:#fff;';
    const status = el(doc, 'div', 'dtm-status', '');
    wrap.append(toolbar, body, status);

    openWindow({ doc, skinId, desktop: opts.desktop, title: 'Network Neighborhood', width: 640, height: 440, content: wrap });

    function openPathHere(target) {
      if (!target) return;
      const ex = buildExplorer({ doc, DTM, skinId, desktop: opts.desktop, path: target });
      openWindow({ doc, skinId, desktop: opts.desktop, title: target, width: 640, height: 440, content: ex.wrap, onClose: ex.dispose });
    }

    function addItem(container, label, subtitle, iconPath, target) {
      const item = el(doc, 'div');
      item.style.cssText = 'display:flex;gap:10px;align-items:center;padding:6px 8px;cursor:pointer;border:1px solid transparent;';
      item.title = 'Double-click to open ' + target;
      const img = el(doc, 'img');
      img.style.cssText = 'width:28px;height:28px;object-fit:contain;';
      iconFor(DTM, iconPath, 32).then((u) => { if (u) img.src = u; });
      const text = el(doc, 'div');
      text.innerHTML = '<div><b>' + escapeHtml(label) + '</b></div>' +
        '<div style="color:#555;font-size:10px;word-break:break-all;">' + escapeHtml(subtitle || '') + '</div>';
      item.append(img, text);
      item.addEventListener('mouseenter', () => { item.style.background = '#000080'; item.style.color = '#fff'; });
      item.addEventListener('mouseleave', () => { item.style.background = ''; item.style.color = ''; });
      item.addEventListener('dblclick', () => openPathHere(target));
      container.appendChild(item);
    }

    function addSection(title) {
      const h = el(doc, 'div', null, title);
      h.style.cssText = 'font-weight:bold;margin:10px 4px 6px;';
      body.appendChild(h);
      const box = el(doc, 'div');
      body.appendChild(box);
      return box;
    }

    async function load() {
      body.innerHTML = '<div class="dtm-loading">Searching for network locations…</div>';
      status.textContent = 'Please wait…';
      let data;
      try {
        data = await DTM.fs.network();
      } catch (e) {
        body.innerHTML = '<div class="dtm-err">' + escapeHtml(e.message) + '</div>';
        status.textContent = 'Error';
        return;
      }

      body.innerHTML = '';
      const drives = (data.drives || []).slice();
      const seen = new Set(drives.map((d) => String(d.path || '').toLowerCase()));
      (data.mappings || []).forEach((m) => {
        if (!m.localPath) return;
        const key = String(m.localPath).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        drives.push({ path: m.localPath, label: m.remotePath || m.localPath, type: 'Network' });
      });
      const shares = data.shares || [];

      status.textContent = drives.length + ' network drive(s), ' + shares.length + ' shared folder(s)' +
        (data.computerName ? ' · ' + data.computerName : '');

      if (!drives.length && !shares.length) {
        body.innerHTML = '<div style="padding:16px;line-height:1.7;">No mapped network drives or shared folders were found.<br>' +
          'Type a network path such as <b>\\\\server\\share</b> in the address bar and press <b>Go</b>.</div>';
        return;
      }
      if (drives.length) {
        const box = addSection('Network Drives');
        drives.forEach((d) => addItem(box, d.label || d.path, d.path, d.path, d.path));
      }
      if (shares.length) {
        const box = addSection('Shared Folders on This PC');
        shares.forEach((s) => addItem(box, s.name, s.path + (s.description ? ' — ' + s.description : ''), s.path, s.path));
      }
    }

    ref.addEventListener('click', load);
    go.addEventListener('click', () => openPathHere(addr.value.trim()));
    addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') openPathHere(addr.value.trim()); });
    load();
  }

  // ---------------------------------------------------------------------------
  // Mount: render the real desktop into the skin.
  // ---------------------------------------------------------------------------
  function mountDesktop(options) {
    const opts = options || {};
    const desktop = opts.desktop;
    const skinId = opts.skinId || 'windows95';
    if (!desktop) { console.warn('[DTM mirror] no desktop element provided'); return; }

    const doc = desktop.ownerDocument;
    const view = doc.defaultView;
    // Listeners added for this mount are removed explicitly on unmount so a
    // second mount into the same document cannot retain old drag/menu state.
    const listenerDisposers = [];
    const track = (target, type, handler, options) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, handler, options);
      listenerDisposers.push(() => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
    };
    const DTM = window.dtmEngine;
    const preload = window.dtmPreload;
    if (!DTM || !DTM.fs) { console.warn('[DTM mirror] engine.fs unavailable'); return; }
    injectCss(doc);

    // Hide the skin's own (fake) desktop icons — the real mirror replaces them.
    ['#iconGrid', '#desktop-icons', '#icons'].forEach((sel) => {
      const c = doc.querySelector(sel);
      if (c) c.style.display = 'none';
    });

    // Remove any previous layer for this skin and stop its watchers.
    unmountDesktop(skinId);
    const old = doc.querySelector('.dtm-desktop-layer');
    if (old) old.remove();
    bindChangeFeed(preload);

    const layer = el(doc, 'div', 'dtm-desktop-layer');
    layer.dataset.skin = skinId;
    // Windows skins pass the full-viewport desktop; both Mac skins pass a
    // #desktop that already starts below the menu bar. Reserve chrome so
    // mirrored icons don't overlap skin UI (taskbars, docks, screen bars).
    if (skinId === 'macos8') { layer.style.top = '0'; layer.style.bottom = '30px'; }
    else if (skinId === 'macosx') { layer.style.top = '0'; layer.style.bottom = '74px'; }
    else if (skinId === 'amiga-workbench') { layer.style.top = '25px'; layer.style.bottom = '0'; }
    else if (skinId === 'beos') { layer.style.top = '0'; layer.style.bottom = '0'; }
    else if (skinId === 'msnmessenger') { layer.style.top = '0'; layer.style.bottom = '34px'; }
    else if (skinId === 'windowsXP') { layer.style.top = '0'; layer.style.bottom = '38px'; }
    else { layer.style.top = '0'; layer.style.bottom = '42px'; }
    desktop.appendChild(layer);

    const store = makeStore(skinId);
    const state = { selection: new Set(), items: [] };

    // Real Windows desktop icon layout (names + positions). When available,
    // mirrored items follow the host's own arrangement order.
    const layoutState = { loaded: false, data: null };
    let layoutActive = false;

    // Explorer's display name may hide or keep a known extension depending on
    // the user's folder options (Waterfox vs Waterfox.lnk, .ahk, .exe), so an
    // item is matched on its full name and its extension-less forms.
    function layoutKeys(name) {
      const raw = String(name || '').trim().toLowerCase();
      const noKnown = raw.replace(/\.(lnk|url)$/i, '');
      const noExt = raw.replace(/\.[^.\\/]+$/, '');
      return [...new Set([raw, noKnown, noExt].filter(Boolean))];
    }

    async function ensureLayout() {
      if (layoutState.loaded) return layoutState.data;
      layoutState.loaded = true;
      try {
        // A slow shell probe must never hold up the icons; the next mount or
        // refresh picks the snapshot up.
        const layout = await Promise.race([
          DTM.fs.desktopLayout().catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500))
        ]);
        layoutState.data = (layout && Array.isArray(layout.items)) ? layout : null;
      } catch { layoutState.data = null; }
      return layoutState.data;
    }

    function orderItemsByLayout(items, layout) {
      if (!layout || !Array.isArray(layout.items) || !layout.items.length) {
        return { items, matched: 0 };
      }
      const spacing = (layout.spacing && layout.spacing.x > 0) ? layout.spacing : { x: 76, y: 104 };
      const byKey = new Map();
      layout.items.forEach((icon) => {
        layoutKeys(icon && icon.name).forEach((key) => {
          if (!byKey.has(key)) byKey.set(key, []);
          byKey.get(key).push(icon);
        });
      });
      const positioned = [];
      const rest = [];
      // Consume layout entries by identity so one real icon can never be placed
      // twice, even when several candidate keys match it.
      const used = new Set();
      items.forEach((item) => {
        let match = null;
        for (const key of layoutKeys(item.name)) {
          const hits = byKey.get(key);
          if (!hits) continue;
          match = hits.find((entry) => !used.has(entry)) || null;
          if (match) break;
        }
        if (match && typeof match.x === 'number' && typeof match.y === 'number') {
          used.add(match);
          positioned.push({ item, icon: match });
        } else {
          rest.push(item);
        }
      });
      positioned.sort((a, b) => {
        const colA = Math.round(a.icon.x / spacing.x);
        const colB = Math.round(b.icon.x / spacing.x);
        if (colA !== colB) return colA - colB;
        return a.icon.y - b.icon.y;
      });
      return { items: positioned.map((e) => e.item).concat(rest), matched: positioned.length };
    }

    // Classic Windows arranges desktop icons in columns running down the
    // screen, with the system icons occupying the first column. Both Mac skins
    // keep their existing top-left horizontal flow.
    const TILE_W = 92;
    const TILE_H = 100;
    const ICON_PAD = 14;
    const columnFlow = skinId === 'windows95' || skinId === 'windows98';
    const SYSTEM_SLOTS = { computer: 0, recycle: 1, network: 2 };

    // A skin that is mounted before its viewport has a size reports a zero
    // height, which used to collapse every icon into one row running off the
    // screen. Fall back to the window so a slot always has real geometry.
    function layerSize() {
      let w = layer.clientWidth;
      let h = layer.clientHeight;
      if (!w) w = view.innerWidth || 0;
      if (!h) h = Math.max(0, (view.innerHeight || 0) - 42);
      return { w, h };
    }

    function placeIcon(icon, slot) {
      const size = layerSize();
      const rows = Math.max(1, Math.floor((size.h - ICON_PAD * 2) / TILE_H));
      const cols = Math.max(1, Math.floor((size.w - ICON_PAD * 2) / TILE_W));
      let col, rowN;
      if (columnFlow) {
        col = Math.floor(slot / rows);
        rowN = slot % rows;
      } else {
        col = slot % cols;
        rowN = Math.floor(slot / cols);
      }
      icon.style.left = (ICON_PAD + col * TILE_W) + 'px';
      icon.style.top = (ICON_PAD + rowN * TILE_H) + 'px';
    }

    // A stored position can predate the current viewport (or a smaller window),
    // which would strand an icon outside the visible desktop for good.
    function savedPosition(key) {
      const saved = store.get(key);
      if (!saved || typeof saved.x !== 'number' || typeof saved.y !== 'number') return null;
      const size = layerSize();
      if (size.w > 0 && (saved.x < 0 || saved.x > size.w - 24)) return null;
      if (size.h > 0 && (saved.y < 0 || saved.y > size.h - 24)) return null;
      return saved;
    }

    function clearSelection() {
      layer.querySelectorAll('.dtm-icon.selected').forEach((i) => i.classList.remove('selected'));
      state.selection.clear();
    }

    // System icons have no path; their saved positions use the same key.
    function iconKey(icon) {
      return icon.dataset.system ? 'system:' + icon.dataset.systemKind : icon.dataset.path;
    }

    function selectIcon(icon, additive) {
      if (!additive) clearSelection();
      icon.classList.add('selected');
      state.selection.add(iconKey(icon));
    }

    // ---- Trash: drag-and-drop and the Delete key recycle real files ----

    // Any Trash in the skin (the desktop icon, or the Mac Dock) marks itself
    // with data-dtm-recycle so a drop is recognised wherever the user aims.
    function dropTargetAt(x, y, dragged) {
      // elementsFromPoint keeps the Trash visible under the icon being dragged;
      // the dragged nodes themselves must never count as a drop target.
      const stack = typeof doc.elementsFromPoint === 'function'
        ? doc.elementsFromPoint(x, y)
        : [doc.elementFromPoint(x, y)];
      for (const node of stack) {
        if (!node || !node.closest) continue;
        if (dragged && dragged.some((el) => el === node || el.contains(node))) continue;
        const target = node.closest('[data-dtm-recycle]');
        if (target) return target;
      }
      return null;
    }

    async function recycleNodes(nodes) {
      const paths = (nodes || [])
        .filter((node) => node && node.dataset.path && !node.dataset.system)
        .map((node) => node.dataset.path);
      if (!paths.length) return false;
      try {
        for (const path of paths) await DTM.fs.recycle(path);
        clearSelection();
        render(true);
        return true;
      } catch (error) {
        alert('Could not delete: ' + error.message);
        render();
        return false;
      }
    }

    function selectedDesktopNodes() {
      return Array.from(layer.querySelectorAll('.dtm-icon.selected[data-path]'))
        .filter((node) => !node.dataset.system);
    }

    // Keys act only while the desktop is the surface the user touched last.
    // Keyboard handling is shared with Explorer windows (see handleFileKey).
    const surfaceToken = {};
    track(doc, 'pointerdown', () => { activeFileSurface = null; }, true);
    track(layer, 'pointerdown', () => { activeFileSurface = surfaceToken; }, true);

    function desktopEntries() {
      return Array.from(layer.querySelectorAll('.dtm-icon[data-path]'))
        .filter((node) => !node.dataset.system)
        .map((node) => ({
          node,
          name: node.dataset.name || '',
          path: node.dataset.path,
          isDirectory: node.dataset.dir === '1',
          isShortcut: node.dataset.shortcut === '1'
        }))
        .sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
    }

    const desktopKeys = {
      items: desktopEntries,
      selected: () => desktopEntries().filter((entry) => entry.node.classList.contains('selected')),
      select: (index) => {
        const entry = desktopEntries()[index];
        if (!entry) return;
        clearSelection();
        selectIcon(entry.node, false);
      },
      selectAll: () => {
        clearSelection();
        desktopEntries().forEach((entry) => selectIcon(entry.node, true));
      },
      clear: () => clearSelection(),
      open: (items) => items.forEach((item) => openDesktopItem(item)),
      rename: (item) => startRename(item, item.node),
      remove: (items) => recycleNodes(items.map((item) => item.node)),
      paste: async () => {
        const base = desktopBase();
        if (!base) { alert('Desktop location unknown.'); return; }
        if (await pasteClipboard(DTM, base)) render(true);
      },
      backspace: 'remove',
      typeAhead: createTypeAhead()
    };

    // Files dropped from Windows land in the Explorer window under the pointer,
    // or on the desktop. They are copied into the real folder.
    async function dropFiles(paths, dir, explorer) {
      const failed = [];
      for (const src of paths) {
        const name = String(src).split(/[\\/]/).pop();
        try { await DTM.fs.copy(src, joinPath(dir, name)); }
        catch (e) { failed.push(name + ' (' + e.message + ')'); }
      }
      if (failed.length) alert('Could not copy: ' + failed.join('; '));
      if (explorer && explorer._refresh) explorer._refresh();
      else render(true);
    }
    track(view, 'message', (e) => {
      const d = e.data;
      if (!d || d.type !== 'dtm:file-drop' || !Array.isArray(d.paths) || !d.paths.length) return;
      const hit = doc.elementFromPoint(d.x, d.y);
      const explorer = hit && hit.closest ? hit.closest('.dtm-explorer') : null;
      const dir = explorer && explorer.dataset.dir ? explorer.dataset.dir : desktopBase();
      if (!dir) return;
      dropFiles(d.paths, dir, explorer);
    });

    // Delete and Backspace send the selection to the Trash, as Explorer does.
    track(doc, 'keydown', (e) => {
      if (activeFileSurface !== surfaceToken) return;
      handleFileKey(e, desktopKeys);
    });

    // Releases that never reach the icon (an ancestor captured the pointer)
    // still end every in-flight drag, so nothing stays glued to the cursor.
    const activeDrags = new Set();
    const stopActiveDrags = () => { activeDrags.forEach((stop) => stop()); };
    ['pointerup', 'pointercancel'].forEach((type) => {
      track(view, type, stopActiveDrags, true);
    });
    track(view, 'blur', stopActiveDrags);

    // Dragging one icon moves every icon that is selected with it, keeping the
    // arrangement the user picked, and each moved icon keeps its new position.
    function makeIconDraggable(icon, storeKey) {
      const DRAG_THRESHOLD = 3;
      let down = false, dragged = false, startX = 0, startY = 0, lastX = 0, lastY = 0, group = [];

      icon.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const key = iconKey(icon);
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        // Clicking an unselected icon selects it first, exactly like Explorer.
        if (!state.selection.has(key)) {
          if (!additive) clearSelection();
          icon.classList.add('selected');
          state.selection.add(key);
        }
        down = true;
        dragged = false;
        startX = e.clientX;
        startY = e.clientY;
        const selected = Array.from(layer.querySelectorAll('.dtm-icon.selected'));
        group = (selected.length ? selected : [icon]).map((node) => ({
          node, x: node.offsetLeft, y: node.offsetTop
        }));
        try { icon.setPointerCapture(e.pointerId); } catch {}
      });

      icon.addEventListener('pointermove', (e) => {
        if (!down) return;
        lastX = e.clientX;
        lastY = e.clientY;
        // A move only drags while the button is still held. Without this a
        // click whose pointerup lands elsewhere leaves the icon glued to the
        // cursor, so it slides around on a plain hover.
        if (e.buttons === 0) { down = false; return; }
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragged && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        dragged = true;
        group.forEach((entry) => {
          entry.node.style.left = Math.max(0, entry.x + dx) + 'px';
          entry.node.style.top = Math.max(0, entry.y + dy) + 'px';
        });
      });

      const stop = (event) => {
        if (!down) return;
        down = false;
        if (!dragged) return;
        // The click that follows a drag would otherwise clear the selection.
        icon._skipClick = true;
        const point = (event && typeof event.clientX === 'number')
          ? event : { clientX: lastX, clientY: lastY };
        // Dropping the selection on the Trash recycles it where it lands;
        // its layout position is left untouched.
        const draggedNodes = group.map((entry) => entry.node);
        if (dropTargetAt(point.clientX, point.clientY, draggedNodes)) {
          recycleNodes(draggedNodes);
          return;
        }
        // A refresh may have replaced the layer mid-drag. Detached nodes
        // report (0,0); never persist those coordinates.
        if (!icon.isConnected) return;
        group.forEach((entry) => {
          if (!entry.node.isConnected) return;
          store.set(iconKey(entry.node), {
            x: entry.node.offsetLeft, y: entry.node.offsetTop
          });
        });
        if (storeKey) store.set(storeKey, { x: icon.offsetLeft, y: icon.offsetTop });
      };
      icon.addEventListener('pointerup', stop);
      icon.addEventListener('pointercancel', stop);
      // Pointer capture can be taken by an ancestor (the skin's own desktop
      // rubber band), so the release is also watched on the whole view.
      activeDrags.add(stop);
    }

    function positionIcon(icon, path, slotOffset) {
      const saved = savedPosition(path);
      if (saved) {
        icon.style.left = saved.x + 'px';
        icon.style.top = saved.y + 'px';
        return;
      }
      // Without a host layout, slots 0-2 belong to My Computer / Recycle Bin /
      // Network and host items follow. With a host layout, host items come
      // first in their real arrangement order and system icons follow them.
      const idx = state.items.findIndex((i) => i.path === path);
      placeIcon(icon, idx + (typeof slotOffset === 'number' ? slotOffset : 3));
    }

    // ---- icon element factory ----
    function makeIcon(item) {
      const icon = el(doc, 'div', 'dtm-icon');
      icon.dataset.path = item.path;
      icon.dataset.name = item.name;
      icon.dataset.dir = item.isDirectory ? '1' : '0';
      icon.dataset.shortcut = item.isShortcut ? '1' : '0';
      const img = el(doc, 'img', 'dtm-icon-img');
      const fallback = item.isDirectory ? '📁' : (item.isShortcut ? '🔗' : '📄');
      img.alt = '';
      img.style.display = 'none';
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const glyph = el(doc, 'div', 'dtm-icon-glyph', fallback);
      // Explorer never shows the shortcut link extension on the desktop.
      const displayName = String(item.name).replace(/\.(lnk|url)$/i, '');
      const label = el(doc, 'div', 'dtm-icon-label', displayName);
      icon.title = item.name;
      icon.append(img, glyph, label);

      const fetchAndSet = () => {
        // Any browser shortcut opens the retro Internet Explorer, so it wears
        // the classic logo instead of whatever engine it really launches.
        isRetroBrowserShortcut(DTM, item)
          .then((isBrowser) => (isBrowser ? '../shared/icons/internet-explorer.ico' : iconFor(DTM, item.path, 32)))
          .then((url) => {
            if (url) { img.src = url; img.style.display = 'block'; glyph.remove(); }
          })
          .catch(() => {});
      };
      fetchAndSet();

      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        // Finishing a drag must not collapse a multi-selection to one icon.
        if (icon._skipClick) { icon._skipClick = false; return; }
        selectIcon(icon, e.ctrlKey || e.metaKey || e.shiftKey);
      });
      icon.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        openDesktopItem(item);
      });
      icon.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, item, icon);
      });
      makeIconDraggable(icon, item.path);
      return icon;
    }

    function makeSystemIcon(kind) {
      const icon = el(doc, 'div', 'dtm-icon');
      icon.dataset.system = kind;
      const isMac = skinId === 'macos8' || skinId === 'macosx';
      const glyph = { computer: isMac ? '🖥️' : '💻', recycle: '🗑️', network: '🌐', mediaplayer: '🎬' }[kind] || '📦';
      const labelText = isMac
        ? ({ computer: 'Macintosh HD', recycle: 'Trash', network: 'Network' }[kind] || kind)
        : ({ computer: 'My Computer', recycle: 'Recycle Bin', network: 'Network', mediaplayer: 'Windows Media Player' }[kind] || kind);
      const img = el(doc, 'img', 'dtm-icon-img');
      img.alt = '';
      img.style.display = 'none';
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const g = el(doc, 'div', 'dtm-icon-glyph', glyph);
      const label = el(doc, 'div', 'dtm-icon-label', labelText);
      icon.append(img, g, label);
      const showIcon = (u) => { if (u) { img.src = u; img.style.display = 'block'; g.remove(); } };
      // Windows skins draw the classic shell art: the host has no dependable
      // icon for special folders (Recycle Bin answers with a generic one) and a
      // retro desktop looks wrong with Windows 11 artwork on it.
      const CLASSIC_ART = {
        computer: '../shared/icons/win95/my-computer.ico',
        recycle: '../shared/icons/win95/recycle-bin.ico',
        network: '../shared/icons/win95/network.ico',
        mediaplayer: '../shared/icons/win95/media.ico'
      };
      if (!isMac && CLASSIC_ART[kind]) showIcon(CLASSIC_ART[kind]);
      else if (kind === 'computer') iconFor(DTM, 'C:\\', 32).then(showIcon);
      else if (kind === 'recycle') iconFor(DTM, 'C:\\$Recycle.Bin', 32).then(showIcon);
      else if (kind === 'mediaplayer') {
        // Prefer the real WMP executable icon, falling back to the glyph.
        const paths = [
          'C:\\Program Files\\Windows Media Player\\wmplayer.exe',
          'C:\\Program Files (x86)\\Windows Media Player\\wmplayer.exe'
        ];
        const tryNext = (i) => {
          if (i >= paths.length) return;
          iconFor(DTM, paths[i], 32).then((u) => (u ? showIcon(u) : tryNext(i + 1)));
        };
        tryNext(0);
      }

      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (icon._skipClick) { icon._skipClick = false; return; }
        selectIcon(icon, e.ctrlKey || e.metaKey);
      });
      icon.addEventListener('dblclick', (e) => { e.stopPropagation(); systemActivate(kind); });
      icon.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showSystemMenu(e.clientX, e.clientY, kind); });
      icon.dataset.systemKind = kind;
      if (kind === 'recycle') icon.dataset.dtmRecycle = '1';
      makeIconDraggable(icon, 'system:' + kind);
      return icon;
    }

    function systemActivate(kind) {
      if (kind === 'computer') openMyComputer({ doc, DTM, skinId, desktop });
      else if (kind === 'recycle') openRecycleBin({ doc, DTM, skinId, desktop });
      else if (kind === 'network') openNetwork({ doc, DTM, skinId, desktop });
      else if (kind === 'mediaplayer') openRetroApp(doc, 'mediaplayer');
    }

    // A skin that owns its Explorer (Windows 95 and 98) opens folders there,
    // so they wear the era's own Explorer window instead of the generic one.
    function skinOpenFolder(path) {
      const host = doc.defaultView;
      if (!host || typeof host.dtmOpenFolder !== 'function') return false;
      return host.dtmOpenFolder(path) === true;
    }

    async function openDesktopItem(item) {
      try {
        if (await openRetroShortcut(DTM, doc, item)) return;
        if (item.isDirectory) {
          if (skinOpenFolder(item.path)) return;
          const ex = buildExplorer({ doc, DTM, skinId, desktop, path: item.path });
          openWindow({ doc, skinId, desktop, title: item.name, width: 620, height: 440, content: ex.wrap, onClose: ex.dispose });
          return;
        }
        // Both regular files and .lnk/.url shortcuts are handed to the shell so
        // arguments, working directories and associations stay intact.
        await DTM.system.openPath(item.path);
      } catch (e) { alert('Could not open "' + item.name + '": ' + e.message); }
    }

    // ---- context menus (Windows 95 structure) ----
    let arrangeMode = null;
    let autoArrange = false;

    const SUBMENU_HOVER_DELAY = 420;
    const menuTimers = new Set();

    function closeMenus() {
      menuTimers.forEach((t) => clearTimeout(t));
      menuTimers.clear();
      doc.querySelectorAll('.dtm-context').forEach((m) => m.remove());
    }

    function menuAdd(menu, label, fn, disabled) {
      const item = el(doc, 'div', disabled ? 'disabled' : null, label);
      if (!disabled) {
        item.addEventListener('click', (ev) => { ev.stopPropagation(); closeMenus(); if (fn) fn(); });
      }
      menu.appendChild(item);
      return item;
    }

    function menuSep(menu) { menu.appendChild(el(doc, 'hr')); }

    function menuSub(menu, label, build) {
      const wrap = el(doc, 'div', null, label + '  ▸');
      const sub = el(doc, 'div', 'dtm-sub');
      build(sub);
      wrap.appendChild(sub);
      menu.appendChild(wrap);
      return wrap;
    }

    // ---- menu navigation: arrow keys, type-ahead, delayed submenus ----
    function submenuOf(item) {
      for (const child of item.children) {
        if (child.classList && child.classList.contains('dtm-sub')) return child;
      }
      return null;
    }

    // Selectable items of one menu level, in visual order.
    function childItems(container) {
      const items = [];
      for (const child of container.children) {
        if (child.tagName !== 'DIV' || child.classList.contains('dtm-sub')) continue;
        if (child.classList.contains('disabled')) continue;
        items.push(child);
      }
      return items;
    }

    function setMenuActive(item) {
      const menu = item.closest('.dtm-context');
      if (!menu) return;
      menu.querySelectorAll('.active').forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
    }

    function openSubmenu(item) {
      const sub = submenuOf(item);
      if (!sub) return;
      childItems(item.parentElement).forEach((sib) => { if (sib !== item) sib.classList.remove('open'); });
      item.classList.add('open');
      setMenuActive(item);
    }

    function closeSubmenu(sub) {
      if (sub && sub.parentElement) sub.parentElement.classList.remove('open');
    }

    // Windows only opens a flyout after the pointer rests on its parent, and
    // closes the previous flyout as soon as another item is targeted.
    function wireMenuLevel(container) {
      let timer = null;
      const clearTimer = () => {
        if (!timer) return;
        clearTimeout(timer);
        menuTimers.delete(timer);
        timer = null;
      };
      const itemFrom = (target) => {
        let node = target;
        while (node && node.parentElement !== container) node = node.parentElement;
        if (!node || node.tagName !== 'DIV') return null;
        if (node.classList.contains('dtm-sub') || node.classList.contains('disabled')) return null;
        return node;
      };

      container.addEventListener('pointerover', (e) => {
        // Events from a nested flyout belong to that flyout's own level.
        const sub = e.target.closest ? e.target.closest('.dtm-sub') : null;
        if (sub && sub !== container) return;
        const item = itemFrom(e.target);
        if (!item) return;
        clearTimer();
        setMenuActive(item);
        childItems(container).forEach((sib) => { if (sib !== item) sib.classList.remove('open'); });
        if (submenuOf(item)) {
          timer = setTimeout(() => {
            menuTimers.delete(timer);
            timer = null;
            if (item.isConnected) openSubmenu(item);
          }, SUBMENU_HOVER_DELAY);
          menuTimers.add(timer);
        }
      });
      container.addEventListener('pointerleave', clearTimer);
      container.addEventListener('click', (e) => {
        const sub = e.target.closest ? e.target.closest('.dtm-sub') : null;
        if (sub && sub !== container) return;
        const item = itemFrom(e.target);
        if (item && submenuOf(item)) openSubmenu(item);
      });
    }

    function onMenuKey(e, menu) {
      const active = menu.querySelector('.active');
      const inSub = !!(active && active.parentElement && active.parentElement.classList.contains('dtm-sub'));
      const level = inSub ? active.parentElement : menu;
      const items = childItems(level);
      const idx = active ? items.indexOf(active) : -1;
      const focusItem = (item) => {
        if (!item) return;
        setMenuActive(item);
        item.scrollIntoView({ block: 'nearest' });
      };
      const enterSubmenu = (item) => {
        openSubmenu(item);
        const sub = submenuOf(item);
        if (sub) focusItem(childItems(sub)[0]);
      };
      const handled = () => { e.preventDefault(); e.stopPropagation(); };

      switch (e.key) {
        case 'ArrowDown': handled(); focusItem(items[(idx + 1) % items.length]); return;
        case 'ArrowUp': handled(); focusItem(items[idx <= 0 ? items.length - 1 : idx - 1]); return;
        case 'Home': handled(); focusItem(items[0]); return;
        case 'End': handled(); focusItem(items[items.length - 1]); return;
        case 'ArrowRight':
          if (active && submenuOf(active)) { handled(); enterSubmenu(active); }
          return;
        case 'ArrowLeft':
          if (inSub) {
            handled();
            const sub = active.parentElement;
            const parentItem = sub.parentElement;
            closeSubmenu(sub);
            focusItem(parentItem);
          }
          return;
        case 'Enter':
        case ' ':
          if (!active) return;
          handled();
          if (submenuOf(active)) enterSubmenu(active);
          else active.click();
          return;
        case 'Escape':
          handled();
          if (inSub) {
            const sub = active.parentElement;
            const parentItem = sub.parentElement;
            closeSubmenu(sub);
            focusItem(parentItem);
          } else {
            closeMenus();
          }
          return;
        case 'Tab':
          closeMenus();
          return;
      }

      // Windows jumps to the next item beginning with the typed letter.
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const letter = e.key.toLowerCase();
        for (let i = 0; i < items.length; i++) {
          const item = items[(idx + 1 + i) % items.length];
          const label = item.textContent.replace(/^[^A-Za-z0-9]+/, '').toLowerCase();
          if (label.startsWith(letter)) {
            handled();
            focusItem(item);
            return;
          }
        }
      }
    }

    function attachMenu(menu) {
      menu.tabIndex = -1;
      menu.addEventListener('keydown', (e) => onMenuKey(e, menu));
      wireMenuLevel(menu);
      menu.querySelectorAll('.dtm-sub').forEach(wireMenuLevel);
      menu.focus();
    }

    function applyArrange(list) {
      if (!arrangeMode) return list;
      const copy = list.slice();
      const dirFirst = (a, b) => (a.isDirectory === b.isDirectory ? 0 : (a.isDirectory ? -1 : 1));
      if (arrangeMode === 'name') copy.sort((a, b) => dirFirst(a, b) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      else if (arrangeMode === 'type') copy.sort((a, b) => dirFirst(a, b) || String(a.extension || '').localeCompare(String(b.extension || '')) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
      else if (arrangeMode === 'size') copy.sort((a, b) => dirFirst(a, b) || (a.size || 0) - (b.size || 0));
      else if (arrangeMode === 'date') copy.sort((a, b) => dirFirst(a, b) || (b.modified || 0) - (a.modified || 0));
      return copy;
    }

    async function pasteIntoDesktop() {
      const base = desktopBase();
      if (!base) { alert('Desktop location unknown.'); return; }
      if (await pasteClipboard(DTM, base)) render(true);
    }

    function showContextMenu(x, y, item, icon) {
      closeMenus();
      const profiles = window.DTMContextMenus || {
        profileFor: () => 'generic',
        itemLabels: () => ({ open: 'Open', explore: 'Browse', cut: 'Cut', copy: 'Copy', delete: 'Delete', rename: 'Rename', properties: 'Properties' }),
        desktopOptions: () => ({ refresh: 'Refresh', properties: 'Properties', propertiesApp: 'about' })
      };
      const labels = profiles.itemLabels(profiles.profileFor(skinId));
      const m = el(doc, 'div', 'dtm-context');
      menuAdd(m, labels.open, () => openDesktopItem(item));
      menuAdd(m, labels.explore, () => {
        if (item.isDirectory && skinOpenFolder(item.path)) return;
        const target = item.isDirectory ? item.path : (parentPathOf(item.path) || item.path);
        const ex = buildExplorer({ doc, DTM, skinId, desktop, path: target });
        openWindow({ doc, skinId, desktop, title: 'Exploring - ' + item.name, width: 620, height: 440, app: 'explorer', icon: '📁', content: ex.wrap, onClose: ex.dispose });
      });
      if (labels.find) menuAdd(m, labels.find, null, true);
      menuSep(m);
      menuAdd(m, labels.cut, () => { fileClipboard = { mode: 'cut', items: [{ path: item.path, name: item.name }] }; });
      menuAdd(m, labels.copy, () => { fileClipboard = { mode: 'copy', items: [{ path: item.path, name: item.name }] }; });
      if (labels.alias) menuAdd(m, labels.alias, null, true);
      menuAdd(m, labels.delete, () => deleteItem(item));
      menuAdd(m, labels.rename, () => startRename(item, icon));
      if (labels.sendTo) {
        menuSep(m);
        menuSub(m, labels.sendTo, (sub) => {
          menuAdd(sub, 'Desktop (create shortcut)', null, true);
          menuAdd(sub, 'Mail Recipient', null, true);
          menuAdd(sub, 'My Documents', null, true);
        });
      }
      menuSep(m);
      menuAdd(m, labels.properties, () => showProperties(item));
      m.style.left = Math.min(x, view.innerWidth - 210) + 'px';
      m.style.top = Math.min(y, view.innerHeight - 300) + 'px';
      doc.body.appendChild(m);
      attachMenu(m);
    }

    function showSystemMenu(x, y, kind) {
      closeMenus();
      const m = el(doc, 'div', 'dtm-context');
      const add = (label, fn) => { const d = el(doc, 'div', null, label); d.addEventListener('click', () => { closeMenus(); fn(); }); m.appendChild(d); };
      add('Open', () => systemActivate(kind));
      if (kind === 'recycle') add('Empty Recycle Bin', async () => {
        if (confirm(doc, 'Permanently delete everything in the Recycle Bin?')) {
          try { await DTM.fs.recycleEmpty(); } catch (e) { alert(e.message); }
        }
      });
      m.appendChild(el(doc, 'hr'));
      add('Refresh', () => { invalidateArtwork(null, state.items); render(); });
      m.style.left = Math.min(x, view.innerWidth - 180) + 'px';
      m.style.top = Math.min(y, view.innerHeight - 160) + 'px';
      doc.body.appendChild(m);
      attachMenu(m);
    }

    function startRename(item, icon) {
      const label = icon.querySelector('.dtm-icon-label');
      if (!label) return;
      const input = el(doc, 'input', 'dtm-icon-label input');
      input.value = item.name;
      label.replaceWith(input);
      input.focus(); input.select();
      let done = false;
      const commit = async () => {
        if (done) return;
        done = true;
        const newName = input.value.trim();
        if (newName && newName !== item.name) {
          try { await DTM.fs.rename(item.path, newName); render(); }
          catch (e) { alert('Could not rename: ' + e.message); render(); }
        } else { render(); }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') { done = true; render(); }
      });
      input.addEventListener('blur', commit);
    }

    async function deleteItem(item) {
      if (!confirm(doc, 'Send "' + item.name + '" to the Recycle Bin?')) return;
      try { await DTM.fs.recycle(item.path); render(); }
      catch (e) { alert('Could not delete: ' + e.message); }
    }

    function desktopBase() {
      return state.lastPaths && (state.lastPaths.user || (state.lastPaths.all && state.lastPaths.all[0]));
    }

    async function newFolder() {
      const base = desktopBase();
      if (!base) { alert('Desktop location unknown.'); return; }
      const name = await promptModal(doc, 'New Folder', 'Name for the new folder:', 'New Folder');
      if (!name) return;
      try { await DTM.fs.mkdir(joinPath(base, name)); render(true); }
      catch (e) { alert('Could not create folder: ' + e.message); }
    }

    async function newTextDocument() {
      const base = desktopBase();
      if (!base) { alert('Desktop location unknown.'); return; }
      const entered = await promptModal(doc, 'New Text Document', 'Name for the new document:', 'New Text Document.txt');
      if (!entered) return;
      const name = /\.[^./\\]+$/.test(entered) ? entered : entered + '.txt';
      try { await DTM.fs.write(joinPath(base, name), ''); render(true); }
      catch (e) { alert('Could not create document: ' + e.message); }
    }

    async function openTerminalHere() {
      const base = desktopBase();
      if (!base) { alert('Desktop location unknown.'); return; }
      try { await DTM.system.openTerminal(base); }
      catch (e) { alert('Could not open a terminal: ' + e.message); }
    }

    function openCommandPromptHere() {
      const base = desktopBase();
      if (!base) { alert('Desktop location unknown.'); return; }
      const skinWin = doc.defaultView;
      if (skinWin && typeof skinWin.dtmOpenCommandPrompt === 'function') {
        skinWin.dtmOpenCommandPrompt(base);
      } else if (skinWin && typeof skinWin.openApp === 'function') {
        skinWin.openApp('terminal', { cwd: base });
      } else {
        openTerminalHere();
      }
    }

    // Right-click on empty desktop space — Windows 95 menu structure.
    function showDesktopMenu(x, y) {
      closeMenus();
      const profiles = window.DTMContextMenus || {
        profileFor: () => 'generic',
        itemLabels: () => ({ open: 'Open', explore: 'Browse', cut: 'Cut', copy: 'Copy', delete: 'Delete', rename: 'Rename', properties: 'Properties' }),
        desktopOptions: () => ({ refresh: 'Refresh', properties: 'Properties', propertiesApp: 'about' })
      };
      const options = profiles.desktopOptions(profiles.profileFor(skinId), skinId);
      const m = el(doc, 'div', 'dtm-context');

      if (options.arrange) menuSub(m, options.arrange, (sub) => {
        const addSort = (label, mode) => menuAdd(sub, (arrangeMode === mode ? '✓ ' : '   ') + label, () => {
          arrangeMode = mode; autoArrange = false; store.clear(); render(true);
        });
        addSort('by Name', 'name');
        addSort('by Type', 'type');
        addSort('by Size', 'size');
        addSort('by Date', 'date');
        menuSep(sub);
        menuAdd(sub, (autoArrange ? '✓ ' : '   ') + 'Auto Arrange', () => {
          autoArrange = !autoArrange;
          arrangeMode = autoArrange ? (arrangeMode || 'name') : null;
          store.clear();
          render(true);
        });
      });
      if (options.arrange) menuAdd(m, 'Line up Icons', () => {
        store.clear();
        if (!arrangeMode) arrangeMode = 'name';
        render(true);
      });
      menuSep(m);
      menuAdd(m, options.refresh, () => {
        // Re-read the artwork too, so a shortcut whose icon changed while the
        // app was open is redrawn by this menu item alone.
        invalidateArtwork(null, state.items);
        if (DTM.fs.desktopLayoutReset) DTM.fs.desktopLayoutReset().catch(() => {});
        layoutState.loaded = false;
        layoutState.data = null;
        render(true);
      });
      menuSep(m);
      menuAdd(m, 'Paste', pasteIntoDesktop, !fileClipboard);
      if (options.pasteShortcut) menuAdd(m, 'Paste Shortcut', null, true);
      menuSub(m, 'New', (sub) => {
        menuAdd(sub, 'Folder', newFolder);
        if (profiles.profileFor(skinId) === 'windows') menuAdd(sub, 'Shortcut', null, true);
        menuAdd(sub, 'Text Document', newTextDocument);
      });
      if (options.terminal) {
        menuSep(m);
        menuAdd(m, options.terminal, openCommandPromptHere);
      }
      menuSep(m);
      menuAdd(m, options.properties, () => {
        const skinWin = doc.defaultView;
        if (skinWin && typeof skinWin.openApp === 'function') skinWin.openApp(options.propertiesApp);
      });
      m.style.left = Math.min(x, view.innerWidth - 230) + 'px';
      m.style.top = Math.min(y, view.innerHeight - 330) + 'px';
      doc.body.appendChild(m);
      attachMenu(m);
    }

    async function showProperties(item) {
      const wrap = el(doc, 'div', 'dtm-pad');
      wrap.innerHTML = '<b>' + escapeHtml(item.name) + '</b><ul>' +
        '<li>Type: ' + (item.isDirectory ? 'Folder' : (item.isShortcut ? 'Shortcut' : 'File')) + '</li>' +
        '<li>Location: ' + escapeHtml(item.path) + '</li>' +
        (item.size ? '<li>Size: ' + Math.round(item.size / 1024) + ' KB</li>' : '') +
        '</ul>';
      // A shortcut can carry its own artwork, so its sheet gets the same
      // "Change Icon" row Explorer offers, without leaving the retro desktop.
      let preview = null;
      if (item.isShortcut && DTM.fs && typeof DTM.fs.pickIcon === 'function') {
        const row = el(doc, 'div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-top:12px;';
        const img = doc.createElement('img');
        img.alt = '';
        img.style.cssText = 'width:32px;height:32px;image-rendering:pixelated;flex:0 0 auto;';
        preview = img;
        iconFor(DTM, item.path, 32).then((url) => { if (url) img.src = url; }).catch(() => {});
        const btn = el(doc, 'button', null, 'Change Icon…');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const picked = await DTM.fs.pickIcon();
            if (!picked) return;
            await DTM.fs.setShortcutIcon(item.path, picked);
            // The shortcut always keeps its path, so its cached art must go.
            invalidateIcon(item.path);
            invalidateArtwork(null, state.items);
            const url = await iconFor(DTM, item.path, 32);
            if (url && preview) preview.src = url;
            render(true);
          } catch (err) {
            const fail = el(doc, 'div', null, err && err.message ? err.message : String(err));
            fail.style.cssText = 'margin-top:8px;color:#a00;font-size:11px;';
            wrap.appendChild(fail);
          } finally {
            btn.disabled = false;
          }
        });
        row.append(img, btn);
        wrap.appendChild(row);
      }

      const w = openWindow({
        doc, skinId, desktop, title: 'Properties', width: 380,
        height: item.isShortcut ? 340 : 280, content: wrap
      });
      // Shortcut targets are resolved lazily — never during desktop enumeration.
      if (item.isShortcut) {
        let target = item.target;
        if (!target) {
          try {
            const sc = await DTM.fs.resolveShortcut(item.path);
            target = sc && sc.target;
          } catch { target = null; }
        }
        if (target) {
          const li = el(doc, 'div', null, 'Target: ' + target);
          li.style.cssText = 'word-break:break-all;margin-top:6px;';
          wrap.appendChild(li);
        }
      }
      return w;
    }

    // ---- render ----
    let hasRendered = false;
    let renderSeq = 0;

    async function render(forceRefresh) {
      if (renderer.disposed) return;
      const seq = ++renderSeq;
      if (!hasRendered) {
        layer.innerHTML = '<div class="dtm-loading" style="position:absolute;left:14px;top:14px;">Loading desktop…</div>';
      }
      let data;
      try {
        const [desktopData] = await Promise.all([
          DTM.desktop && DTM.desktop.getItems
            ? DTM.desktop.getItems({ forceRefresh: forceRefresh === true })
            : DTM.fs.getDesktop(),
          ensureLayout()
        ]);
        data = desktopData;
      } catch (e) {
        // A failed refresh keeps the last successful desktop on screen.
        console.warn('[DTM mirror] Desktop refresh failed:', e && e.message ? e.message : e);
        if (!hasRendered && !renderer.disposed) {
          layer.innerHTML = '<div class="dtm-err" style="position:absolute;left:14px;top:14px;">Could not load desktop: ' + escapeHtml(e && e.message ? e.message : e) + '</div>';
        }
        return;
      }
      // The skin was unmounted (or a newer render started) while we waited.
      if (renderer.disposed || seq !== renderSeq) return;

      const paths = data.desktopPaths || {};
      state.lastPaths = paths;
      const allItems = data.items || [];
      if (data.timedOut && !allItems.length && hasRendered) {
        console.warn('[DTM mirror] Desktop refresh timed out; keeping previous contents.');
        return;
      }
      const items = allItems.filter((it) => !isSystemNamedHostItem(it.name));

      layer.innerHTML = '';
      state.items = [];

      const ordered = orderItemsByLayout(items, layoutState.data);
      layoutActive = ordered.matched > 0;
      const arranged = { items: applyArrange(ordered.items), matched: ordered.matched };

      const systemIcons = [
        makeSystemIcon('computer'),
        makeSystemIcon('recycle'),
        makeSystemIcon('network')
      ];
      // The Windows skins ship Windows Media Player; the Mac skins do not.
      if (/^windows/i.test(skinId)) systemIcons.push(makeSystemIcon('mediaplayer'));
      systemIcons.forEach((icon) => layer.appendChild(icon));

      // My Computer / Recycle Bin / Network keep the first slots, so a busy
      // desktop can never push them past the right edge and hide them.
      const firstItemSlot = systemIcons.length;
      arranged.items.forEach((item) => {
        state.items.push(item);
        const icon = makeIcon(item);
        icon.dataset.index = String(state.items.length - 1);
        layer.appendChild(icon);
        positionIcon(icon, item.path, firstItemSlot);
      });

      systemIcons.forEach((icon, idx) => {
        icon.dataset.slot = String(idx);
        const saved = savedPosition('system:' + icon.dataset.systemKind);
        if (saved) {
          icon.style.left = saved.x + 'px';
          icon.style.top = saved.y + 'px';
        } else {
          placeIcon(icon, idx);
        }
      });
      hasRendered = true;

      // Start live watching on every real desktop location (user + public).
      const wanted = [paths.user, paths.public].filter(Boolean);
      for (const watchPath of wanted) {
        if (renderer.disposed) break;
        const key = watchPath.toLowerCase();
        if (renderer.watchedPaths.has(key)) continue;
        // Reserve before awaiting so concurrent renders do not double-watch.
        renderer.watchedPaths.add(key);
        try {
          const sub = await DTM.fs.watch(watchPath);
          if (renderer.disposed) {
            // Unmounted while the watch request was in flight: don't leak it.
            try { DTM.fs.unwatch(sub); } catch {}
            break;
          }
          renderer.watchIds.add(sub);
        } catch (e) {
          // Watching is optional; the manual Refresh action still works.
          renderer.watchedPaths.delete(key);
        }
      }
    }

    const renderer = { render, refreshIcons: () => invalidateArtwork(null, state.items), state, watchIds: new Set(), DTM, timer: null, watchedPaths: new Set(), layer, doc, view, disposed: false, listenerDisposers };
    liveRenderers.set(skinId, renderer);

    // Rubber-band selection: dragging an empty stretch of desktop selects every
    // icon it touches, like the real shell. The box lives in the layer so the
    // selection keeps working whichever skin is mounted.
    const band = { el: null, startX: 0, startY: 0, base: [], moved: false, keepOnClick: false };
    function stopBand() {
      if (!band.el) return;
      band.keepOnClick = band.moved;
      band.moved = false;
      band.el.remove();
      band.el = null;
    }
    layer.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target !== layer) return;
      const box = layer.getBoundingClientRect();
      band.startX = e.clientX - box.left;
      band.startY = e.clientY - box.top;
      band.base = (e.ctrlKey || e.metaKey) ? Array.from(state.selection) : [];
      if (!band.base.length) clearSelection();
      band.moved = false;
      band.el = el(doc, 'div', 'dtm-marquee');
      band.el.style.left = band.startX + 'px';
      band.el.style.top = band.startY + 'px';
      layer.appendChild(band.el);
      try { layer.setPointerCapture(e.pointerId); } catch {}
    });
    layer.addEventListener('pointermove', (e) => {
      if (!band.el) return;
      const box = layer.getBoundingClientRect();
      const x = e.clientX - box.left;
      const y = e.clientY - box.top;
      const left = Math.min(x, band.startX);
      const top = Math.min(y, band.startY);
      const right = Math.max(x, band.startX);
      const bottom = Math.max(y, band.startY);
      band.el.style.left = left + 'px';
      band.el.style.top = top + 'px';
      band.el.style.width = Math.max(0, right - left) + 'px';
      band.el.style.height = Math.max(0, bottom - top) + 'px';
      band.moved = right - left > 2 || bottom - top > 2;
      layer.querySelectorAll('.dtm-icon').forEach((icon) => {
        const r = icon.getBoundingClientRect();
        const ir = { left: r.left - box.left, top: r.top - box.top, right: r.right - box.left, bottom: r.bottom - box.top };
        const touched = !(ir.right < left || ir.left > right || ir.bottom < top || ir.top > bottom);
        const key = iconKey(icon);
        const keep = band.base.includes(key);
        icon.classList.toggle('selected', touched || keep);
        if (touched) state.selection.add(key);
        else if (!keep) state.selection.delete(key);
      });
    });
    // Pointer capture can be refused, so the release is also watched on the
    // window; either one finishes the band.
    ['pointerup', 'pointercancel'].forEach((type) => {
      track(layer, type, stopBand);
      track(view, type, stopBand);
    });
    track(view, 'blur', stopBand);

    // Background click clears selection / closes menus; right-click offers real
    // Windows actions (new folder / text document / terminal here).
    layer.addEventListener('click', (e) => {
      if (e.target !== layer) return;
      // Finishing a rubber band must not wipe the selection it just made.
      if (band.keepOnClick) { band.keepOnClick = false; closeMenus(); return; }
      clearSelection();
      closeMenus();
    });
    layer.addEventListener('contextmenu', (e) => {
      if (e.target !== layer) return;
      e.preventDefault();
      e.stopPropagation();
      showDesktopMenu(e.clientX, e.clientY);
    });
    track(doc, 'pointerdown', (e) => {
      if (!e.target.closest('.dtm-context') && !e.target.closest('.dtm-icon')) closeMenus();
    });
    // Column counts depend on the viewport height; dropped icons keep their
    // saved position and everything else is re-flowed into the new grid.
    renderer.onResize = () => {
      if (renderer.disposed) return;
      // System icons never move with the grid once the user has placed them.
      layer.querySelectorAll('.dtm-icon[data-system][data-slot]').forEach((icon) => {
        if (store.get('system:' + icon.dataset.systemKind)) return;
        placeIcon(icon, Number(icon.dataset.slot));
      });
      state.items.forEach((item, i) => {
        const icon = layer.querySelector('.dtm-icon[data-index="' + i + '"]');
        if (!icon || store.get(item.path)) return;
        placeIcon(icon, i + layer.querySelectorAll('.dtm-icon[data-system]').length);
      });
    };
    view.addEventListener('resize', renderer.onResize);
    // A skin mounted before its viewport had a size only ever gets one resize
    // event from the iframe; watching the layer catches every geometry change.
    if (typeof view.ResizeObserver === 'function') {
      const ro = new view.ResizeObserver(() => renderer.onResize());
      ro.observe(layer);
      renderer.resizeObserver = ro;
    }

    render().catch((err) => {
      console.error('[DTM mirror] Desktop render failed:', err);
      if (!hasRendered) {
        layer.innerHTML = '<div class="dtm-err" style="position:absolute;left:14px;top:14px;">Could not load desktop: ' + escapeHtml(err && err.message ? err.message : err) + '</div>';
      }
    });
    return { refresh: render, layer, unmount: () => unmountDesktop(skinId) };
  }

  // Expose on the engine singleton.
  if (window.dtmEngine) {
    window.dtmEngine.mountDesktop = mountDesktop;
    window.dtmEngine.unmountDesktop = unmountDesktop;
    // Skins with their own real-taskbar mirror reuse the same shortcut routing.
    window.dtmEngine.openRetroShortcut = (item, doc) =>
      openRetroShortcut(window.dtmEngine, doc || document, item);
  window.dtmMirrorKeys = { findTypeAhead: findTypeAhead, handleFileKey: handleFileKey, pasteClipboard: pasteClipboard };
    // Real taskbar entries (running windows / pinned apps) route the same way.
    window.dtmEngine.retroAppForTaskbar = retroAppForEntry;
    window.dtmEngine.retroSharedAppForTaskbar = retroSharedAppForEntry;
    window.dtmEngine.openRetroApp = (app, doc) => openRetroApp(doc || document, app);
    // Lightweight diagnostics for verification tooling (no UI impact).
    window.dtmEngine.dtmDesktopStats = () => ({
      mounted: liveRenderers.size,
      changeFeedBound: changesBound,
      iconCache: iconCache.size
    });
  }
  // Also expose globally for convenience.
  window.dtmMountDesktop = mountDesktop;
})();
