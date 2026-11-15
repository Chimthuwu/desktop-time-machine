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
    discord: { title: 'Discord', icon: '💬', url: 'https://discord.com/app' },
    mediaplayer: { title: 'Windows Media Player', icon: '🎬' }
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
    // The docked Waterfox window is a real Windows window; re-raise it above
    // the shell after the OS activates us.
    if (entry.waterfox && entry.wfReady) setTimeout(() => { try { wfBridge.raise(); } catch (e) {} }, 0);
    if (entry.waterfox && !entry.wfReady && entry.begin) entry.begin();
  }

  function sendState(app) {
    const entry = windows.get(app);
    if (!entry) { notifySkin(app, false); return; }
    notifySkin(app, true, entry.win.style.display === 'none');
  }

  function closeWindow(app) {
    const entry = windows.get(app);
    if (!entry) return;
    if (app === 'browser') closeMenus();
    if (entry.video) { try { entry.video.pause(); } catch (e) {} }
    try { if (entry.webview) entry.webview.stop(); } catch (e) {}
    if (entry.waterfox && wfBridge) {
      lastDockRect = null;
      lastDockShown = null;
      try { wfBridge.close(); } catch (e) {}
    }
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
    if (app === 'mediaplayer') { openMediaPlayer(requestedUrl); return; }
    if (app === 'browser') { openBrowser(requestedUrl); return; }

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
    win.style.width = '900px';
    win.style.height = '600px';
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

    let statusText = null;

    {
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
    statusRight.textContent = 'Discord for Windows 95';
    status.append(statusLeft, statusRight);
    body.appendChild(status);
    statusText = statusLeft;

    win.append(titlebar, body);
    layer.appendChild(win);
    windows.set(app, { win, webview, titleText, maximized: false });
    makeDraggable(win, titlebar);

    win.addEventListener('pointerdown', () => focusWindow(app));

    webview.addEventListener('did-start-loading', () => { statusText.textContent = 'Opening page…'; });
    webview.addEventListener('did-stop-loading', () => { statusText.textContent = 'Done'; });
    webview.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return; // aborted navigations are not failures
      statusText.textContent = 'Could not load page (' + (e.errorDescription || e.errorCode) + ')';
    });
    webview.addEventListener('page-title-updated', (e) => {
      if (!e.title) return;
      titleText.textContent = e.title;
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

  // -------------------------------------------------------------------------
  // Retro "Internet Explorer" — a docked, real browser window
  //
  // The browser engine is a separate process (Ungoogled Chromium by default,
  // Waterfox as a fallback), so it cannot render inside a <webview>. Instead a
  // private, chrome-less instance is docked into this window's page area,
  // which keeps real browser rendering (logins, certificates) inside the 1998
  // window furniture. Navigation is driven over DevTools (or WebDriver BiDi).
  // -------------------------------------------------------------------------

  const preloadBridge = window.dtmPreload || {};
  const wfBridge = preloadBridge.waterfox || null;
  let wfAvailable = null;
  let wfEngine = 'browser';
  const engineName = () => (wfEngine === 'chromium' ? 'Chromium' : wfEngine === 'waterfox' ? 'Waterfox' : 'Browser');
  let wfSetup = null;
  let lastDockRect = null;
  let lastDockShown = null;
  let dockTimer = null;
  let stateTimer = null;
  let lastAssertAt = 0;
  let overlayHold = false;

  async function waterfoxAvailable() {
    if (wfAvailable !== null) return wfAvailable;
    if (!wfBridge) { wfAvailable = false; return false; }
    try {
      const s = await wfBridge.status();
      wfAvailable = !!(s && s.available);
      if (s && s.engine) wfEngine = s.engine;
    } catch (e) { wfAvailable = false; }
    return wfAvailable;
  }

  // A friend's machine has no Ungoogled Chromium, so the first visit to the
  // retro browser starts a silent install and reports it in the status bar
  // until the real engine can take over.
  function provisionRealBrowser() {
    if (wfSetup || !wfBridge || typeof wfBridge.ensure !== 'function') return wfSetup;
    const say = (message) => {
      const entry = windows.get('browser');
      if (entry && entry.statusLeft) entry.statusLeft.textContent = message;
    };
    say('Setting up Ungoogled Chromium…');
    wfSetup = wfBridge.ensure()
      .then(async (result) => {
        wfAvailable = null;
        const ok = await waterfoxAvailable();
        if (ok) say('Ungoogled Chromium is ready — reopen Internet Explorer');
        else say('Could not set up Ungoogled Chromium' + (result && result.error ? ': ' + result.error : ''));
        return ok;
      })
      .catch(() => { say('Could not set up Ungoogled Chromium'); return false; })
      .finally(() => { wfSetup = null; });
    return wfSetup;
  }

  function openBrowser(requestedUrl) {
    const existing = windows.get('browser');
    if (existing) {
      if (requestedUrl) navigateBrowser(existing, requestedUrl);
      focusWindow('browser');
      return;
    }
    const startUrl = normalizeUrl(requestedUrl || APP_CONFIG.browser.url);
    waterfoxAvailable().then((ok) => {
      const openNow = windows.get('browser');
      if (openNow) { navigateBrowser(openNow, startUrl); return; }
      if (ok) { buildWaterfoxBrowser(startUrl); return; }
      buildWebviewBrowser(startUrl);
      provisionRealBrowser();
    });
  }

  function browserChrome(startUrl) {
    const config = APP_CONFIG.browser;
    const win = document.createElement('div');
    win.className = 'dtmshell-win active';
    const offset = windows.size * 26;
    win.style.left = (56 + offset) + 'px';
    win.style.top = (36 + offset) + 'px';
    win.style.width = '780px';
    win.style.height = '540px';
    win.style.zIndex = String(++zTop);

    const titlebar = document.createElement('div');
    titlebar.className = 'dtmshell-title';
    const icon = document.createElement('span');
    icon.className = 'dtmshell-title-icon';
    icon.textContent = config.icon;
    const titleText = document.createElement('span');
    titleText.className = 'dtmshell-title-text';
    titleText.textContent = config.title;
    titlebar.append(icon, titleText, makeButtons('browser'));

    const body = document.createElement('div');
    body.className = 'dtmshell-body';
    const toolbar = document.createElement('div');
    toolbar.className = 'dtmshell-toolbar';
    body.appendChild(toolbar);

    const status = document.createElement('div');
    status.className = 'dtmshell-status';
    const statusLeft = document.createElement('span');
    statusLeft.textContent = 'Ready';
    const statusRight = document.createElement('span');
    statusRight.textContent = 'Microsoft Internet Explorer 4.0';
    status.append(statusLeft, statusRight);

    win.append(titlebar, body);
    layer.appendChild(win);
    makeDraggable(win, titlebar);
    win.addEventListener('pointerdown', () => focusWindow('browser'));

    return { win, body, toolbar, status, statusLeft, titleText, startUrl };
  }

  // -------------------------------------------------------------------------
  // 1998-style menu bar (File / View)
  //
  // The docked Waterfox window is a separate Windows window sitting above this
  // one, so a dropdown opened over the page area would be hidden behind it.
  // Opening a menu therefore parks the page (the same way clicking outside
  // does) and closing the menu docks it again.
  // -------------------------------------------------------------------------

  let openMenu = null;
  let menuRelease = null;

  function closeMenus() {
    if (openMenu) {
      openMenu.wrap.classList.remove('open');
      openMenu.list.setAttribute('aria-hidden', 'true');
      openMenu = null;
    }
    if (menuRelease) {
      const release = menuRelease;
      menuRelease = null;
      release();
    }
  }

  function makeMenuBar(defs, holdPage) {
    const menubar = document.createElement('div');
    menubar.className = 'dtmshell-menubar';

    defs.forEach((def) => {
      const wrap = document.createElement('div');
      wrap.className = 'dtmshell-menu';
      const title = document.createElement('button');
      title.className = 'dtmshell-menu-title';
      title.textContent = def.label;
      const list = document.createElement('div');
      list.className = 'dtmshell-menu-list';
      list.setAttribute('role', 'menu');
      list.setAttribute('aria-hidden', 'true');

      const openThis = () => {
        if (openMenu && openMenu.wrap === wrap) return;
        closeMenus();
        wrap.classList.add('open');
        list.setAttribute('aria-hidden', 'false');
        openMenu = { wrap, title, list };
        if (holdPage) menuRelease = holdPage();
      };
      title.addEventListener('click', (event) => {
        event.stopPropagation();
        if (openMenu && openMenu.wrap === wrap) closeMenus();
        else openThis();
      });
      // Once one menu is down, sliding across the bar switches menus.
      title.addEventListener('mouseenter', () => { if (openMenu) openThis(); });

      def.items.forEach((item) => {
        if (item === '-') {
          const sep = document.createElement('div');
          sep.className = 'dtmshell-menu-sep';
          list.appendChild(sep);
          return;
        }
        const button = document.createElement('button');
        button.className = 'dtmshell-menu-item';
        button.textContent = item.label;
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          closeMenus();
          try { item.action(); } catch (e) { /* command failed, keep the window usable */ }
        });
        list.appendChild(button);
      });

      wrap.append(title, list);
      menubar.appendChild(wrap);
    });

    return menubar;
  }

  function browserMenuDefinitions(cmd) {
    return [
      { label: 'File', items: [
        { label: 'Open Location…', action: cmd.openLocation },
        '-',
        { label: 'Back', action: cmd.back },
        { label: 'Forward', action: cmd.forward },
        { label: 'Refresh', action: cmd.refresh },
        { label: 'Go to Home Page', action: cmd.home },
        '-',
        { label: 'Close', action: cmd.close }
      ] },
      { label: 'View', items: [
        { label: 'Back', action: cmd.back },
        { label: 'Forward', action: cmd.forward },
        { label: 'Refresh', action: cmd.refresh }
      ] }
    ];
  }

  function browserButton(label, title, fn) {
    const b = document.createElement('button');
    b.className = 'dtmshell-btn';
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', fn);
    return b;
  }

  function browserAddress(frame, submit) {
    const input = document.createElement('input');
    input.className = 'dtmshell-addr';
    input.value = frame.startUrl;
    input.spellcheck = false;
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      submit(input.value);
    });
    return input;
  }

  function buildWaterfoxBrowser(startUrl) {
    if (!wfBridge) { buildWebviewBrowser(startUrl); return; }
    const frame = browserChrome(startUrl);
    const pane = document.createElement('div');
    pane.className = 'dtmshell-pane';
    const paneMsg = document.createElement('div');
    paneMsg.className = 'dtmshell-pane-msg';
    paneMsg.textContent = 'Starting ' + engineName() + '…';
    pane.appendChild(paneMsg);

    const entry = {
      win: frame.win,
      titleText: frame.titleText,
      maximized: false,
      waterfox: true,
      wfReady: false,
      pane,
      paneMsg,
      statusLeft: frame.statusLeft
    };

    const address = browserAddress(frame, (value) => navigateBrowser(entry, value));
    entry.addressInput = address;

    const cmd = {
      back: () => { wfBridge.history(-1).then(() => refreshBrowserState(entry)); },
      forward: () => { wfBridge.history(1).then(() => refreshBrowserState(entry)); },
      refresh: () => { wfBridge.reload().then(() => refreshBrowserState(entry)); },
      home: () => navigateBrowser(entry, APP_CONFIG.browser.url),
      openLocation: () => { address.focus(); address.select(); },
      close: () => closeWindow('browser')
    };

    // Park the page while a dropdown is open so it cannot cover the menu.
    const holdPage = () => {
      if (!entry.wfReady) return null;
      overlayHold = true;
      lastDockShown = false;
      try { wfBridge.hide(); } catch (e) {}
      return () => {
        overlayHold = false;
        lastDockRect = null;
        lastDockShown = null;
        if (windows.has('browser')) syncBrowserDock();
      };
    };

    frame.toolbar.append(
      browserButton('⬅ Back', 'Back', cmd.back),
      browserButton('➡ Forward', 'Forward', cmd.forward),
      browserButton('Refresh', 'Refresh', cmd.refresh),
      browserButton('Home', 'Home', cmd.home),
      address,
      browserButton('Go', 'Go', () => navigateBrowser(entry, address.value))
    );
    frame.body.insertBefore(makeMenuBar(browserMenuDefinitions(cmd), holdPage), frame.toolbar);
    frame.body.append(pane, frame.status);

    windows.set('browser', entry);
    lastDockRect = null;
    lastDockShown = null;
    startDockSync();

    entry.begin = () => {
      entry.wfReady = false;
      entry.stateFails = 0;
      entry.paneMsg.textContent = 'Starting ' + engineName() + '…';
      entry.statusLeft.textContent = 'Starting ' + engineName() + '…';
      wfBridge.open(startUrl).then((res) => {
        if (!windows.has('browser')) { try { wfBridge.close(); } catch (e) {} return; }
        if (!res || !res.ok) {
          entry.paneMsg.textContent = 'Could not start ' + engineName() + (res && res.error ? ': ' + res.error : '.');
          entry.statusLeft.textContent = engineName() + ' unavailable';
          return;
        }
        entry.wfReady = true;
        entry.paneMsg.textContent = engineName() + ' page hidden — click the window to bring it back.';
        entry.statusLeft.textContent = engineName() + ' is rendering this page';
        lastDockRect = null;
        lastDockShown = null;
        syncBrowserDock();
        startStatePolling();
        refreshBrowserState(entry);
      }).catch((e) => {
        entry.paneMsg.textContent = 'Could not start ' + engineName() + ': ' + e.message;
      });
    };

    focusWindow('browser');
    entry.begin();
  }

  function buildWebviewBrowser(startUrl) {
    const frame = browserChrome(startUrl);
    const webview = document.createElement('webview');
    webview.className = 'dtmshell-web';
    webview.setAttribute('partition', PARTITION);
    webview.setAttribute('src', startUrl);

    const address = browserAddress(frame, (value) => {
      try { webview.loadURL(normalizeUrl(value)); } catch (e) {}
    });

    const cmd = {
      back: () => { try { webview.goBack(); } catch (e) {} },
      forward: () => { try { webview.goForward(); } catch (e) {} },
      refresh: () => { try { webview.reload(); } catch (e) {} },
      home: () => { try { webview.loadURL(APP_CONFIG.browser.url); } catch (e) {} },
      openLocation: () => { address.focus(); address.select(); },
      close: () => closeWindow('browser')
    };

    // Chromium can draw the dropdown over the webview, but hiding the page
    // while the menu is open keeps the list readable in every case.
    const holdPage = () => {
      webview.style.visibility = 'hidden';
      return () => { if (webview.isConnected) webview.style.visibility = ''; };
    };

    frame.toolbar.append(
      browserButton('⬅ Back', 'Back', cmd.back),
      browserButton('➡ Forward', 'Forward', cmd.forward),
      browserButton('Stop', 'Stop', () => { try { webview.stop(); } catch (e) {} }),
      browserButton('Refresh', 'Refresh', cmd.refresh),
      browserButton('Home', 'Home', cmd.home),
      address,
      browserButton('Go', 'Go', () => { try { webview.loadURL(normalizeUrl(address.value)); } catch (e) {} })
    );
    frame.body.insertBefore(makeMenuBar(browserMenuDefinitions(cmd), holdPage), frame.toolbar);
    frame.body.append(webview, frame.status);

    windows.set('browser', {
      win: frame.win,
      webview,
      titleText: frame.titleText,
      statusLeft: frame.statusLeft,
      maximized: false
    });
    focusWindow('browser');

    webview.addEventListener('did-navigate', (e) => {
      address.value = e.url;
      frame.statusLeft.textContent = e.url;
    });
    webview.addEventListener('did-navigate-in-page', (e) => { address.value = e.url; });
    webview.addEventListener('did-start-loading', () => { frame.statusLeft.textContent = 'Opening page…'; });
    webview.addEventListener('did-stop-loading', () => { frame.statusLeft.textContent = 'Done'; });
    webview.addEventListener('did-fail-load', (e) => {
      if (e.errorCode === -3) return;
      frame.statusLeft.textContent = 'Could not load page (' + (e.errorDescription || e.errorCode) + ')';
    });
    webview.addEventListener('page-title-updated', (e) => {
      if (!e.title) return;
      frame.titleText.textContent = e.title + ' - Internet Explorer';
      document.title = e.title;
    });
  }

  function navigateBrowser(entry, value) {
    if (!entry) return;
    const url = normalizeUrl(value);
    if (entry.webview) {
      try { entry.webview.loadURL(url); } catch (e) {}
      return;
    }
    if (entry.waterfox && entry.wfReady && wfBridge) {
      entry.statusLeft.textContent = 'Opening page…';
      wfBridge.navigate(url).then(() => { setTimeout(() => refreshBrowserState(entry), 700); });
    }
  }

  function refreshBrowserState(entry) {
    if (!entry || !entry.waterfox || !wfBridge) return;
    wfBridge.state().then((st) => {
      if (!st || !st.ok) {
        entry.stateFails = (entry.stateFails || 0) + 1;
        // Waterfox was closed by hand (Alt+F4 on the docked page).
        if (entry.wfReady && entry.stateFails >= 3) {
          entry.wfReady = false;
          lastDockRect = null;
          lastDockShown = null;
          entry.paneMsg.textContent = engineName() + ' was closed — click the window to open it again.';
          entry.statusLeft.textContent = engineName() + ' closed';
          try { wfBridge.hide(); } catch (e) {}
        }
        return;
      }
      entry.stateFails = 0;
      if (document.activeElement !== entry.addressInput) entry.addressInput.value = st.url;
      entry.titleText.textContent = (st.title ? st.title + ' - ' : '') + 'Internet Explorer';
      entry.statusLeft.textContent = st.url;
    }).catch(() => {});
  }

  function startStatePolling() {
    if (stateTimer) return;
    stateTimer = setInterval(() => {
      const entry = windows.get('browser');
      if (!entry || !entry.waterfox || !entry.wfReady) return;
      if (!entry.win.classList.contains('active') || entry.win.style.display === 'none') return;
      refreshBrowserState(entry);
    }, 1500);
  }

  // Where the docked Waterfox window should sit, in physical screen pixels.
  function browserPageRect(entry) {
    const rect = entry.pane.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const frameX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
    const frameY = Math.max(0, window.outerHeight - window.innerHeight - frameX);
    const dpr = window.devicePixelRatio || 1;
    return {
      x: Math.round((window.screenX + frameX + rect.left) * dpr),
      y: Math.round((window.screenY + frameY + rect.top) * dpr),
      w: Math.round(rect.width * dpr),
      h: Math.round(rect.height * dpr)
    };
  }

  function syncBrowserDock() {
    bindSkinDocument();
    if (overlayHold) return;
    const entry = windows.get('browser');
    if (!entry || !entry.waterfox || !entry.wfReady || !wfBridge) return;
    // Minimizing the whole shell must not leave a page floating on the desktop.
    const active = entry.win.classList.contains('active') && entry.win.style.display !== 'none' && !document.hidden;
    if (active) {
      const rect = browserPageRect(entry);
      if (rect && (!lastDockRect || Math.abs(rect.x - lastDockRect.x) > 1 || Math.abs(rect.y - lastDockRect.y) > 1 ||
        Math.abs(rect.w - lastDockRect.w) > 2 || Math.abs(rect.h - lastDockRect.h) > 2)) {
        lastDockRect = rect;
        wfBridge.dock(rect);
        lastAssertAt = Date.now();
      } else if (Date.now() - lastAssertAt > 3000 && lastDockRect) {
        // Kiosk windows can re-assert fullscreen when they are activated;
        // re-applying the bounds keeps the page inside its retro frame.
        lastAssertAt = Date.now();
        wfBridge.dock(lastDockRect);
        wfBridge.raise();
      }
    }
    if (active !== lastDockShown) {
      lastDockShown = active;
      if (active) { wfBridge.raise(); wfBridge.show(); }
      else wfBridge.hide();
    }
  }

  function startDockSync() {
    if (dockTimer) return;
    dockTimer = setInterval(syncBrowserDock, 60);
  }

  // Any click outside the browser window (desktop, Start menu, another
  // window) drops it out of the foreground: park the Waterfox window so it
  // cannot float over the rest of the retro UI.
  function deactivateBrowser(entry) {
    if (!entry || !entry.waterfox || !entry.wfReady || !wfBridge) return;
    if (entry.win.classList.contains('active')) {
      entry.win.classList.remove('active');
      entry.paneMsg.textContent = engineName() + ' page hidden — click the window to bring it back.';
    }
    if (lastDockShown !== false) {
      lastDockShown = false;
      wfBridge.hide();
    }
  }

  document.addEventListener('pointerdown', (event) => {
    const entry = windows.get('browser');
    if (!entry || entry.win.contains(event.target)) return;
    deactivateBrowser(entry);
  }, true);

  // Dismiss an open menu on any click elsewhere, or on Escape.
  document.addEventListener('pointerdown', (event) => {
    if (!openMenu) return;
    if (openMenu.wrap.contains(event.target)) return;
    closeMenus();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openMenu) closeMenus();
  }, true);

  // The skin's desktop and Start menu live in the skin iframe, whose clicks
  // never reach this document. Bind each freshly loaded skin document.
  let boundSkinDoc = null;
  function bindSkinDocument() {
    const frame = skinFrame();
    const doc = frame && frame.contentDocument;
    if (!doc || doc === boundSkinDoc) return;
    boundSkinDoc = doc;
    doc.addEventListener('pointerdown', () => deactivateBrowser(windows.get('browser')), true);
  }

  function formatTime(seconds) {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
  }

  /**
   * Windows Media Player 6.4–style window with real local playback.
   * PotPlayer taskbar entries route here instead of raising the real app.
   */
  function openMediaPlayer(clip) {
    if (typeof clip === 'string') clip = { url: clip };
    const app = 'mediaplayer';
    const config = APP_CONFIG[app];
    const existing = windows.get(app);
    if (existing) {
      if (clip && clip.url) loadClip(existing, clip);
      focusWindow(app);
      return;
    }

    const win = document.createElement('div');
    win.className = 'dtmshell-win dtmwmp active';
    win.style.left = '88px';
    win.style.top = '44px';
    win.style.width = '640px';
    win.style.height = '540px';
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
    body.className = 'dtmshell-body dtmwmp-body';

    const menubar = document.createElement('div');
    menubar.className = 'dtmwmp-menubar';
    body.appendChild(menubar);

    const screen = document.createElement('div');
    screen.className = 'dtmwmp-screen';
    const video = document.createElement('video');
    video.className = 'dtmwmp-video';
    video.preload = 'metadata';
    const placeholder = document.createElement('div');
    placeholder.className = 'dtmwmp-placeholder';
    placeholder.textContent = 'File ▸ Open…';
    const placeholderSub = document.createElement('div');
    placeholderSub.className = 'dtmwmp-placeholder-sub';
    placeholderSub.textContent = 'Open an audio or video file to play it here.';
    screen.append(placeholder, placeholderSub, video);
    body.appendChild(screen);

    const seekRow = document.createElement('div');
    seekRow.className = 'dtmwmp-seekrow';
    const seek = document.createElement('input');
    seek.type = 'range';
    seek.className = 'dtmwmp-seek';
    seek.min = '0';
    seek.max = '0';
    seek.step = '0.1';
    seek.value = '0';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'dtmwmp-time';
    timeLabel.textContent = '00:00 / 00:00';
    seekRow.append(seek, timeLabel);
    body.appendChild(seekRow);

    const controls = document.createElement('div');
    controls.className = 'dtmwmp-controls';
    const mkControl = (label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'dtmshell-btn dtmwmp-btn';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    };
    const playBtn = mkControl('▶', 'Play', () => { video.play().catch(() => {}); });
    const pauseBtn = mkControl('❙❙', 'Pause', () => { video.pause(); });
    const stopBtn = mkControl('■', 'Stop', () => { video.pause(); video.currentTime = 0; });
    const muteBtn = mkControl('🔊', 'Mute', () => {
      video.muted = !video.muted;
      muteBtn.textContent = video.muted ? '🔇' : '🔊';
    });
    const volume = document.createElement('input');
    volume.type = 'range';
    volume.className = 'dtmwmp-volume';
    volume.min = '0';
    volume.max = '100';
    volume.value = '70';
    volume.title = 'Volume';
    volume.addEventListener('input', () => { video.volume = Number(volume.value) / 100; });
    controls.append(playBtn, pauseBtn, stopBtn, muteBtn, volume);
    body.appendChild(controls);

    const status = document.createElement('div');
    status.className = 'dtmshell-status';
    const statusLeft = document.createElement('span');
    statusLeft.textContent = 'Ready';
    const statusRight = document.createElement('span');
    statusRight.textContent = config.title;
    status.append(statusLeft, statusRight);
    body.appendChild(status);

    win.append(titlebar, body);
    layer.appendChild(win);

    const entry = { win, video, titleText, maximized: false, clipName: null };
    windows.set(app, entry);
    makeDraggable(win, titlebar);
    win.addEventListener('pointerdown', () => focusWindow(app));
    video.volume = 0.7;

    function showVideo(on) {
      video.style.display = on ? 'block' : 'none';
      placeholder.style.display = on ? 'none' : 'block';
      placeholderSub.style.display = on ? 'none' : 'block';
    }
    showVideo(false);

    video.addEventListener('loadedmetadata', () => {
      seek.max = String(Number.isFinite(video.duration) ? video.duration : 0);
      timeLabel.textContent = formatTime(0) + ' / ' + formatTime(video.duration);
      showVideo(true);
      statusLeft.textContent = entry.clipName || 'Media';
    });
    video.addEventListener('timeupdate', () => {
      if (!seek.dragging) seek.value = String(video.currentTime || 0);
      timeLabel.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
    });
    video.addEventListener('error', () => {
      showVideo(false);
      statusLeft.textContent = 'Cannot play this file (unsupported format)';
    });
    video.addEventListener('ended', () => { statusLeft.textContent = 'Stopped'; });
    video.addEventListener('play', () => { statusLeft.textContent = entry.clipName || 'Playing'; });
    video.addEventListener('pause', () => {
      if (!video.ended && video.currentTime > 0) statusLeft.textContent = 'Paused';
    });

    seek.addEventListener('pointerdown', () => { seek.dragging = true; });
    seek.addEventListener('pointerup', () => { seek.dragging = false; });
    seek.addEventListener('input', () => {
      if (!Number.isFinite(video.duration)) return;
      video.currentTime = Number(seek.value) || 0;
    });

    async function pickAndOpen() {
      let picked = null;
      try {
        const engine = window.dtmEngine;
        if (engine && engine.fs && engine.fs.pickMedia) picked = await engine.fs.pickMedia();
      } catch (e) { picked = null; }
      if (!picked) return;
      loadClip(entry, { url: picked.url, name: picked.name || picked.path });
    }

    function setMenu() {
      const menus = [
        { label: 'File', items: [
          { label: 'Open…', run: pickAndOpen },
          { label: 'Close', run: () => closeWindow(app) }
        ] },
        { label: 'View', items: [
          { label: 'Full Screen', run: () => { video.requestFullscreen && video.requestFullscreen().catch(() => {}); } },
          { label: 'Normal Size', run: () => toggleMaximize(app) }
        ] },
        { label: 'Play', items: [
          { label: 'Play', run: () => { video.play().catch(() => {}); } },
          { label: 'Pause', run: () => { video.pause(); } },
          { label: 'Stop', run: () => { video.pause(); video.currentTime = 0; } }
        ] },
        { label: 'Help', items: [
          { label: 'About Windows Media Player', run: () => { statusLeft.textContent = 'Windows Media Player 6.4 (Desktop Time Machine)'; } }
        ] }
      ];

      const closeAll = () => {
        menubar.querySelectorAll('.dtmwmp-menu-list').forEach((el) => { el.style.display = 'none'; });
      };

      let openList = null;
      menus.forEach((menu) => {
        const wrap = document.createElement('div');
        wrap.className = 'dtmwmp-menu';
        const label = document.createElement('button');
        label.className = 'dtmwmp-menu-title';
        label.textContent = menu.label;
        const list = document.createElement('div');
        list.className = 'dtmwmp-menu-list';
        list.style.display = 'none';
        menu.items.forEach((item) => {
          const row = document.createElement('button');
          row.className = 'dtmwmp-menu-item';
          row.textContent = item.label;
          row.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAll();
            try { item.run(); } catch (err) {}
          });
          list.appendChild(row);
        });
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          const wasOpen = openList === list && list.style.display !== 'none';
          closeAll();
          if (!wasOpen) { list.style.display = 'block'; openList = list; }
        });
        wrap.append(label, list);
        menubar.appendChild(wrap);
      });

      document.addEventListener('pointerdown', (e) => {
        if (!menubar.contains(e.target)) closeAll();
      });
      win.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    }
    setMenu();

    focusWindow(app);
    notifySkin(app, true, false);

    if (clip && clip.url) loadClip(entry, clip);
  }

  function loadClip(entry, clip) {
    if (!entry || !clip || !clip.url) return;
    entry.clipName = clip.name || 'Media';
    entry.video.src = clip.url;
    try { entry.video.load(); } catch (e) {}
    entry.video.play().catch(() => {});
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
