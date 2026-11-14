/**
 * Desktop Time Machine — Shell web apps
 *
 * The browser and Discord need a real browser engine, and Electron's
 * <webview> is only available in the top-level shell document — not inside a
 * skin's iframe. These windows are therefore drawn in the shell, styled as
 * Windows 95 windows, and positioned over the skin's desktop area. The skin
 * drives them with postMessage and mirrors their taskbar buttons.
 */
(function () {
  'use strict';

  const layer = document.getElementById('shell-app-layer');
  if (!layer) return;

  const PARTITION = 'persist:dtm-web';
  const APP_CONFIG = {
    browser: { title: 'Internet Explorer 4.0', icon: '🌐', url: 'https://www.google.com/' },
    discord: { title: 'Discord', icon: '💬', url: 'https://discord.com/app' }
  };

  // One live window per app, keyed by app id.
  const windows = new Map();
  let zTop = 900;

  function skinFrame() {
    return document.getElementById('skin-viewport');
  }

  function notifySkin(app, isOpen, minimized) {
    const frame = skinFrame();
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({
        type: 'dtm:webapp-state',
        app,
        title: (APP_CONFIG[app] && APP_CONFIG[app].title) || app,
        open: isOpen,
        minimized: !!minimized
      }, '*');
    } catch (e) { /* skin not mounted */ }
  }

  function setActive(app) {
    windows.forEach((entry, key) => {
      entry.win.classList.toggle('active', key === app);
    });
  }

  function focusWindow(app) {
    const entry = windows.get(app);
    if (!entry) return;
    entry.win.style.display = 'flex';
    entry.win.style.zIndex = String(++zTop);
    entry.win.classList.remove('max');
    entry.maximized = false;
    setActive(app);
    notifySkin(app, true, false);
  }

  function sendState(app) {
    const entry = windows.get(app);
    if (!entry) { notifySkin(app, false); return; }
    notifySkin(app, true, entry.win.style.display === 'none');
  }

  function closeWindow(app) {
    const entry = windows.get(app);
    if (!entry) return;
    try { entry.webview.stop(); } catch (e) {}
    entry.win.remove();
    windows.delete(app);
    setActive(null);
    notifySkin(app, false);
  }

  function minimizeWindow(app) {
    const entry = windows.get(app);
    if (!entry) return;
    entry.win.style.display = 'none';
    notifySkin(app, true, true);
  }

  function toggleMaximize(app) {
    const entry = windows.get(app);
    if (!entry) return;
    entry.maximized = !entry.maximized;
    entry.win.classList.toggle('max', entry.maximized);
    focusWindow(app);
  }

  function makeButtons(app) {
    const wrap = document.createElement('div');
    wrap.className = 'dtmshell-buttons';
    const min = document.createElement('button');
    min.textContent = '_';
    min.title = 'Minimize';
    const max = document.createElement('button');
    max.textContent = '□';
    max.title = 'Maximize';
    const close = document.createElement('button');
    close.textContent = '×';
    close.title = 'Close';
    min.addEventListener('click', (e) => { e.stopPropagation(); minimizeWindow(app); });
    max.addEventListener('click', (e) => { e.stopPropagation(); toggleMaximize(app); });
    close.addEventListener('click', (e) => { e.stopPropagation(); closeWindow(app); });
    wrap.append(min, max, close);
    return wrap;
  }

  function makeDraggable(win, handle) {
    let ox = 0, oy = 0, dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (win.classList.contains('max')) return;
      dragging = true;
      ox = e.clientX - win.offsetLeft;
      oy = e.clientY - win.offsetTop;
      try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxLeft = layer.clientWidth - 120;
      const maxTop = layer.clientHeight - 34;
      win.style.left = Math.max(-win.offsetWidth + 140, Math.min(maxLeft, e.clientX - ox)) + 'px';
      win.style.top = Math.max(0, Math.min(maxTop, e.clientY - oy)) + 'px';
    });
    const stop = () => { dragging = false; };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  function normalizeUrl(input) {
    let value = String(input || '').trim();
    if (!value) return APP_CONFIG.browser.url;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) value = 'https://' + value;
    return value;
  }

  function openWindow(app, requestedUrl) {
    const config = APP_CONFIG[app];
    if (!config) return;

    const existing = windows.get(app);
    if (existing) {
      if (requestedUrl) {
        try { existing.webview.loadURL(normalizeUrl(requestedUrl)); } catch (e) {}
      }
      focusWindow(app);
      return;
    }

    const win = document.createElement('div');
    win.className = 'dtmshell-win active';
    const offset = windows.size * 26;
    win.style.left = (56 + offset) + 'px';
    win.style.top = (36 + offset) + 'px';
    win.style.width = (app === 'browser' ? 780 : 900) + 'px';
    win.style.height = (app === 'browser' ? 540 : 600) + 'px';
    win.style.zIndex = String(++zTop);

    const titlebar = document.createElement('div');
    titlebar.className = 'dtmshell-title';
    const icon = document.createElement('span');
    icon.className = 'dtmshell-title-icon';
    icon.textContent = config.icon;
    const titleText = document.createElement('span');
    titleText.className = 'dtmshell-title-text';
    titleText.textContent = config.title;
    titlebar.append(icon, titleText, makeButtons(app));

    const body = document.createElement('div');
    body.className = 'dtmshell-body';

    let addressInput = null;
    let statusText = null;

    if (app === 'browser') {
      const toolbar = document.createElement('div');
      toolbar.className = 'dtmshell-toolbar';
      const mkBtn = (label, title, fn) => {
        const b = document.createElement('button');
        b.className = 'dtmshell-btn';
        b.textContent = label;
        b.title = title;
        b.addEventListener('click', fn);
        return b;
      };
      const back = mkBtn('⬅ Back', 'Back', () => { try { webview.goBack(); } catch (e) {} });
      const forward = mkBtn('➡ Forward', 'Forward', () => { try { webview.goForward(); } catch (e) {} });
      const stop = mkBtn('Stop', 'Stop', () => { try { webview.stop(); } catch (e) {} });
      const reload = mkBtn('Refresh', 'Refresh', () => { try { webview.reload(); } catch (e) {} });
      const home = mkBtn('Home', 'Home', () => { try { webview.loadURL(config.url); } catch (e) {} });
      addressInput = document.createElement('input');
      addressInput.className = 'dtmshell-addr';
      addressInput.value = config.url;
      addressInput.spellcheck = false;
      addressInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          try { webview.loadURL(normalizeUrl(addressInput.value)); } catch (err) {}
        }
      });
      const go = mkBtn('Go', 'Go', () => {
        try { webview.loadURL(normalizeUrl(addressInput.value)); } catch (e) {}
      });
      toolbar.append(back, forward, stop, reload, home, addressInput, go);
      body.appendChild(toolbar);
    } else {
      const toolbar = document.createElement('div');
      toolbar.className = 'dtmshell-toolbar';
      const reload = document.createElement('button');
      reload.className = 'dtmshell-btn';
      reload.textContent = 'Refresh';
      reload.addEventListener('click', () => { try { webview.reload(); } catch (e) {} });
      const home = document.createElement('button');
      home.className = 'dtmshell-btn';
      home.textContent = 'Discord Home';
      home.addEventListener('click', () => { try { webview.loadURL(config.url); } catch (e) {} });
      toolbar.append(reload, home);
      body.appendChild(toolbar);
    }

    const webview = document.createElement('webview');
    webview.className = 'dtmshell-web';
    webview.setAttribute('partition', PARTITION);
    webview.setAttribute('src', normalizeUrl(requestedUrl || config.url));
    body.appendChild(webview);

    const status = document.createElement('div');
    status.className = 'dtmshell-status';
    const statusLeft = document.createElement('span');
    statusLeft.textContent = 'Loading…';
    const statusRight = document.createElement('span');
    statusRight.textContent = app === 'browser' ? 'Microsoft Internet Explorer 4.0' : 'Discord for Windows 95';
    status.append(statusLeft, statusRight);
    body.appendChild(status);
    statusText = statusLeft;

    win.append(titlebar, body);
    layer.appendChild(win);
    windows.set(app, { win, webview, titleText, maximized: false });
    makeDraggable(win, titlebar);

    win.addEventListener('pointerdown', () => focusWindow(app));

    if (addressInput) {
      webview.addEventListener('did-navigate', (e) => {
        addressInput.value = e.url;
        statusText.textContent = e.url;
      });
      webview.addEventListener('did-navigate-in-page', (e) => {
        addressInput.value = e.url;
      });
    }

    webview.addEventListener('did-start-loading', () => { statusText.textContent = 'Opening page…'; });
    webview.addEventListener('did-stop-loading', () => { statusText.textContent = 'Done'; });
    webview.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return; // aborted navigations are not failures
      statusText.textContent = 'Could not load page (' + (e.errorDescription || e.errorCode) + ')';
    });
    webview.addEventListener('page-title-updated', (e) => {
      if (!e.title) return;
      titleText.textContent = app === 'browser' ? (e.title + ' - Internet Explorer') : e.title;
      document.title = e.title;
    });
    if (app === 'discord') {
      webview.addEventListener('did-navigate', (e) => {
        if (/discord\.com\/login|discord\.com\/app/.test(e.url)) statusText.textContent = e.url;
      });
    }

    focusWindow(app);
    notifySkin(app, true, false);
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'dtm:launch-webapp') {
      openWindow(data.app, data.url);
    } else if (data.type === 'dtm:webapp-focus') {
      focusWindow(data.app);
    } else if (data.type === 'dtm:webapp-close') {
      closeWindow(data.app);
    }
  });

  // Expose for diagnostics/tests.
  window.dtmShellApps = {
    open: openWindow,
    close: closeWindow,
    focus: focusWindow,
    isOpen: (app) => windows.has(app),
    listOpen: () => Array.from(windows.keys())
  };
})();
