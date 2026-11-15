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
.dtm-explorer-grid { flex:1; overflow:auto; padding:8px; display:flex; flex-wrap:wrap; gap:10px;
  align-content:flex-start; background:#fff; }
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

  // Retro apps owned by the shell (see components/ShellApps).
  const RETRO_APP_RULES = [
    { app: 'discord', re: /discord/i },
    { app: 'mediaplayer', re: /potplayer/i }
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

  function isRetroBrowserShortcut(DTM, item) {
    if (!item || item.isDirectory) return Promise.resolve(false);
    if (WATERFOX_NAME_RE.test(item.name || '')) return Promise.resolve(true);
    // Shortcut targets are resolved lazily, only for the item being opened.
    if (!DTM || !DTM.fs || typeof DTM.fs.resolveShortcut !== 'function') return Promise.resolve(false);
    if (!/\.lnk$/i.test(item.path || '')) return Promise.resolve(false);
    return DTM.fs.resolveShortcut(item.path)
      .then((sc) => WATERFOX_TARGET_RE.test(String((sc && sc.target) || '')))
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
  }

  function unmountDesktop(skinId) {
    const entry = liveRenderers.get(skinId);
    if (!entry) return;
    entry.disposed = true;
    clearTimeout(entry.timer);
    for (const id of entry.watchIds || []) {
      try { entry.DTM.fs.unwatch(id); } catch {}
    }
    entry.watchIds.clear();
    entry.watchedPaths.clear();
    try {
      if (entry.view && entry.onResize) entry.view.removeEventListener('resize', entry.onResize);
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
    let visibleItems = [];

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
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        grid.querySelectorAll('.dtm-explorer-item').forEach((i) => i.classList.remove('selected'));
        row.classList.add('selected');
        selected = item;
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
      addr.value = p;
      grid.innerHTML = '<div class="dtm-loading">Reading directory…</div>';
      try {
        const res = await DTM.fs.list(p);
        selected = null;
        visibleItems = res.items;
        grid.innerHTML = '';
        if (res.parentPath) addRow({ name: '.. (Up)', path: res.parentPath, isDirectory: true });
        res.items.forEach(addRow);
        status.textContent = res.items.length + ' object(s)' + (res.truncated ? ' (truncated)' : '');
      } catch (e) {
        grid.innerHTML = '<div class="dtm-err">' + escapeHtml(e.message) + '</div>';
        status.textContent = 'Error';
      }
    }

    function getSelected() {
      if (!selected) { alert('Select a file or folder first.'); return null; }
      return selected;
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
      const item = getSelected(); if (!item) return;
      if (!confirm(doc, 'Send "' + item.name + '" to the Recycle Bin?')) return;
      try { await DTM.fs.recycle(item.path); load(current); }
      catch (e) { alert('Could not delete: ' + e.message); }
    });

    grid.addEventListener('click', () => {
      grid.querySelectorAll('.dtm-explorer-item').forEach((i) => i.classList.remove('selected'));
      selected = null;
    });

    load(current);
    return { wrap, refresh: () => load(current) };
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
          openWindow({ doc, skinId, desktop: opts.desktop, title: d.label || d.letter + ':', width: 620, height: 440, content: ex.wrap });
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
          openWindow({ doc, skinId, desktop: opts.desktop, title: lbl, width: 620, height: 440, content: ex.wrap });
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
      openWindow({ doc, skinId, desktop: opts.desktop, title: target, width: 640, height: 440, content: ex.wrap });
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
    const DTM = window.dtmEngine;
    const preload = window.dtmPreload;
    if (!DTM || !DTM.fs) { console.warn('[DTM mirror] engine.fs unavailable'); return; }
    injectCss(doc);

    // Hide the skin's own (fake) desktop icons — the real mirror replaces them.
    ['#iconGrid', '#desktop-icons'].forEach((sel) => {
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
    // #desktop that already starts below the menu bar. Reserve only the
    // bottom chrome: 28px Control Strip (+2 gutter) vs 64px Dock + 10 gutter.
    if (skinId === 'macos8') { layer.style.top = '0'; layer.style.bottom = '30px'; }
    else if (skinId === 'macosx') { layer.style.top = '0'; layer.style.bottom = '74px'; }
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

    function placeIcon(icon, slot) {
      const rows = Math.max(1, Math.floor((layer.clientHeight - ICON_PAD * 2) / TILE_H));
      let col, rowN;
      if (columnFlow) {
        col = Math.floor(slot / rows);
        rowN = slot % rows;
      } else {
        col = slot % 6;
        rowN = Math.floor(slot / 6);
      }
      icon.style.left = (ICON_PAD + col * TILE_W) + 'px';
      icon.style.top = (ICON_PAD + rowN * TILE_H) + 'px';
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

    function positionIcon(icon, path, slotOffset) {
      const saved = store.get(path);
      if (saved && typeof saved.x === 'number') {
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
        iconFor(DTM, item.path, 32).then((url) => {
          if (url) { img.src = url; img.style.display = 'block'; glyph.remove(); }
        });
      };
      fetchAndSet();

      icon.addEventListener('click', (e) => {
        e.stopPropagation();
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
      makeDraggable(icon, icon, doc, (x, y) => { store.set(item.path, { x, y }); });
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
      if (kind === 'computer') iconFor(DTM, 'C:\\', 32).then(showIcon);
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

      icon.addEventListener('click', (e) => { e.stopPropagation(); selectIcon(icon, e.ctrlKey || e.metaKey); });
      icon.addEventListener('dblclick', (e) => { e.stopPropagation(); systemActivate(kind); });
      icon.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showSystemMenu(e.clientX, e.clientY, kind); });
      icon.dataset.systemKind = kind;
      makeDraggable(icon, icon, doc, (x, y) => { store.set('system:' + kind, { x, y }); });
      return icon;
    }

    function systemActivate(kind) {
      if (kind === 'computer') openMyComputer({ doc, DTM, skinId, desktop });
      else if (kind === 'recycle') openRecycleBin({ doc, DTM, skinId, desktop });
      else if (kind === 'network') openNetwork({ doc, DTM, skinId, desktop });
      else if (kind === 'mediaplayer') openRetroApp(doc, 'mediaplayer');
    }

    async function openDesktopItem(item) {
      try {
        if (await openRetroShortcut(DTM, doc, item)) return;
        if (item.isDirectory) {
          const ex = buildExplorer({ doc, DTM, skinId, desktop, path: item.path });
          openWindow({ doc, skinId, desktop, title: item.name, width: 620, height: 440, content: ex.wrap });
          return;
        }
        // Both regular files and .lnk/.url shortcuts are handed to the shell so
        // arguments, working directories and associations stay intact.
        await DTM.system.openPath(item.path);
      } catch (e) { alert('Could not open "' + item.name + '": ' + e.message); }
    }

    // ---- context menus (Windows 95 structure) ----
    let clipboard = null;
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
      if (!clipboard) return;
      const base = desktopBase();
      if (!base) { alert('Desktop location unknown.'); return; }
      const dest = joinPath(base, clipboard.name);
      try {
        if (clipboard.mode === 'cut') await DTM.fs.move(clipboard.path, dest);
        else await DTM.fs.copy(clipboard.path, dest);
        clipboard = null;
        render(true);
      } catch (e) { alert('Could not paste: ' + e.message); }
    }

    function showContextMenu(x, y, item, icon) {
      closeMenus();
      const m = el(doc, 'div', 'dtm-context');
      menuAdd(m, 'Open', () => openDesktopItem(item));
      menuAdd(m, 'Explore', () => {
        const target = item.isDirectory ? item.path : (parentPathOf(item.path) || item.path);
        const ex = buildExplorer({ doc, DTM, skinId, desktop, path: target });
        openWindow({ doc, skinId, desktop, title: 'Exploring - ' + item.name, width: 620, height: 440, content: ex.wrap });
      });
      menuAdd(m, 'Find...', null, true);
      menuSep(m);
      menuAdd(m, 'Cut', () => { clipboard = { mode: 'cut', path: item.path, name: item.name }; });
      menuAdd(m, 'Copy', () => { clipboard = { mode: 'copy', path: item.path, name: item.name }; });
      menuAdd(m, 'Create Shortcut', null, true);
      menuAdd(m, 'Delete', () => deleteItem(item));
      menuAdd(m, 'Rename', () => startRename(item, icon));
      menuSep(m);
      menuSub(m, 'Send To', (sub) => {
        menuAdd(sub, 'Desktop (create shortcut)', null, true);
        menuAdd(sub, 'Mail Recipient', null, true);
        menuAdd(sub, 'My Documents', null, true);
      });
      menuSep(m);
      menuAdd(m, 'Properties', () => showProperties(item));
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
      if (skinWin && typeof skinWin.openApp === 'function') {
        skinWin.openApp('terminal', { cwd: base });
      } else {
        openTerminalHere();
      }
    }

    // Right-click on empty desktop space — Windows 95 menu structure.
    function showDesktopMenu(x, y) {
      closeMenus();
      const m = el(doc, 'div', 'dtm-context');

      menuSub(m, 'Arrange Icons', (sub) => {
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
      menuAdd(m, 'Line up Icons', () => {
        store.clear();
        if (!arrangeMode) arrangeMode = 'name';
        render(true);
      });
      menuSep(m);
      menuAdd(m, 'Refresh', () => {
        // Re-read the artwork too, so a shortcut whose icon changed while the
        // app was open is redrawn by this menu item alone.
        invalidateArtwork(null, state.items);
        if (DTM.fs.desktopLayoutReset) DTM.fs.desktopLayoutReset().catch(() => {});
        layoutState.loaded = false;
        layoutState.data = null;
        render(true);
      });
      menuSep(m);
      menuAdd(m, 'Paste', pasteIntoDesktop, !clipboard);
      menuAdd(m, 'Paste Shortcut', null, true);
      menuSub(m, 'New', (sub) => {
        menuAdd(sub, 'Folder', newFolder);
        menuAdd(sub, 'Shortcut', null, true);
        menuAdd(sub, 'Text Document', newTextDocument);
      });
      menuSep(m);
      menuAdd(m, 'Command Prompt Here', openCommandPromptHere);
      menuAdd(m, 'Open in Windows Terminal', openTerminalHere);
      menuSep(m);
      menuAdd(m, 'Properties', () => {
        const skinWin = doc.defaultView;
        if (skinWin && typeof skinWin.openApp === 'function') skinWin.openApp('display');
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
      const w = openWindow({ doc, skinId, desktop, title: 'Properties', width: 380, height: 280, content: wrap });
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

      arranged.items.forEach((item, idx) => {
        state.items.push(item);
        const icon = makeIcon(item);
        icon.dataset.index = String(state.items.length - 1);
        layer.appendChild(icon);
        positionIcon(icon, item.path, layoutActive ? 0 : 3);
      });

      const systemBase = layoutActive ? arranged.items.length : 0;
      systemIcons.forEach((icon, idx) => {
        const slot = systemBase + idx;
        icon.dataset.slot = String(slot);
        const kind = icon.dataset.systemKind;
        const saved = store.get('system:' + kind);
        if (saved && typeof saved.x === 'number') {
          icon.style.left = saved.x + 'px';
          icon.style.top = saved.y + 'px';
        } else {
          placeIcon(icon, slot);
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

    const renderer = { render, refreshIcons: () => invalidateArtwork(null, state.items), state, watchIds: new Set(), DTM, timer: null, watchedPaths: new Set(), layer, doc, view, disposed: false };
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
      layer.addEventListener(type, stopBand);
      view.addEventListener(type, stopBand);
    });
    view.addEventListener('blur', stopBand);

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
    doc.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.dtm-context') && !e.target.closest('.dtm-icon')) closeMenus();
    });
    // Column counts depend on the viewport height; dropped icons keep their
    // saved position and everything else is re-flowed into the new grid.
    renderer.onResize = () => {
      if (renderer.disposed) return;
      layer.querySelectorAll('.dtm-icon[data-slot]').forEach((icon) => placeIcon(icon, Number(icon.dataset.slot)));
      state.items.forEach((item, i) => {
        if (store.get(item.path)) return;
        const icon = layer.querySelector('.dtm-icon[data-index="' + i + '"]');
        if (icon) placeIcon(icon, i + (layoutActive ? 0 : 3));
      });
    };
    view.addEventListener('resize', renderer.onResize);

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
    // Real taskbar entries (running windows / pinned apps) route the same way.
    window.dtmEngine.retroAppForTaskbar = retroAppForEntry;
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
