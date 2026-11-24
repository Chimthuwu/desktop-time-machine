(() => {
  'use strict';

  const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : (window.DTM || null);
  const apps = window.macOSApps = window.macOSApps || {};
  const windows = new Map();
  let zTop = 100;
  let winCount = 0;
  let activeWindow = null;
  let activeApp = 'finder';
  let openMenu = null;

  const appleMark = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>';

  function registerMacApp(id, definition) {
    apps[id] = definition;
    renderDock();
    if (id === activeApp) updateMenus(id);
  }

  // Shell windows (Discord, browser, ...) are drawn above this whole iframe, so
  // a Mac window can only be seen when the shell parks its own windows first.
  function parkShellWindows() {
    if (window.parent) window.parent.postMessage({ type: 'dtm:webapp-park' }, '*');
  }

  function focusWindow(win) {
    parkShellWindows();
    activeWindow = win;
    windows.forEach((entry) => {
      const active = entry.win === win;
      entry.win.classList.toggle('active', active);
      entry.win.classList.toggle('inactive', !active);
      if (active) entry.win.style.zIndex = String(++zTop);
    });
    const entry = [...windows.values()].find((item) => item.win === win);
    if (entry) {
      activeApp = entry.app;
      updateMenus(entry.app);
    }
    updateDockDots();
  }

  function renderHostTray(items) {
    const extra = document.getElementById('mb-extra');
    if (!extra) return;
    extra.replaceChildren();
    const seen = new Set();
    items.forEach((item) => {
      const key = item.icon || item.name;
      if (seen.has(key)) return;
      seen.add(key);
      const button = document.createElement('button');
      button.className = 'mb-tray-item';
      button.title = (item.name || 'Tray item') + ' — click to open in Windows';
      if (item.icon) {
        const image = document.createElement('img');
        image.src = item.icon; image.alt = '';
        button.appendChild(image);
      } else button.textContent = window.DTMRealTaskbar.glyphFor(item.name);
      button.addEventListener('click', () => window.DTMRealTaskbar.invokeTray(item));
      extra.appendChild(button);
    });
  }

  function updateDockDots() {
    const dock = document.getElementById('dock');
    if (!dock) return;
    dock.querySelectorAll('.dock-icon[data-app]').forEach((icon) => {
      const id = icon.dataset.app;
      const dot = icon.querySelector('.running-dot');
      if (!dot) return;
      const isRunning = sharedWindows.length
        ? sharedWindows.some((state) => !state.minimized && (state.app === id || (id === 'trash' && state.app === 'trash')))
        : [...windows.values()].some((entry) => entry.app === id);
      dot.style.display = isRunning ? '' : 'none';
    });
  }

  let sharedWindows = [];
  let hostWindows = [];
  const DOCK_ART = '../../../assets/dock/';
  function dockGlyph(id, fallback) {
    const span = document.createElement('span');
    span.className = 'dock-glyph';
    if (['finder','simpletext','calculator','stickies','safari','sharedapps','terminal','activity','preferences','about','help','preview','trash'].includes(id)) {
      const image = document.createElement('img');
      image.src = DOCK_ART + id + '.svg';
      image.alt = '';
      span.appendChild(image);
    } else {
      span.textContent = fallback || '🪟';
      span.style.fontSize = '34px';
    }
    return span;
  }
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.type === 'dtm:windows-state') {
      sharedWindows = data.windows || [];
      updateDockDots();
    }
    if (data && data.type === 'dtm:host-taskbar') {
      hostWindows = (data.windows || []);
      renderHostTray(data.tray || []);
    }
  });

  function renderDock() {
    const dock = document.getElementById('dock');
    if (!dock) return;
    // Trash is appended explicitly below the separator; skip the registered
    // copy so the Dock does not show two identical Trash icons.
    const definitions = Object.entries(apps).filter(([id, app]) => app.dock !== false && id !== 'trash');
    dock.replaceChildren();
    definitions.forEach(([id, app]) => {
      const icon = document.createElement('div');
      icon.className = 'dock-icon';
      icon.dataset.app = id;
      icon.title = app.name || app.title || id;
      icon.setAttribute('role', 'button');
      icon.tabIndex = 0;
      const glyph = dockGlyph(id, app.icon || '📄');
      const gloss = document.createElement('span');
      gloss.className = 'dock-gloss';
      const label = document.createElement('span');
      label.className = 'dock-label';
      label.textContent = app.name || app.title || id;
      const dot = document.createElement('span');
      dot.className = 'running-dot';
      const isRunning = sharedWindows.length
        ? sharedWindows.some((state) => !state.minimized && (state.app === id || (app.title && state.title === app.title)))
        : [...windows.values()].some((entry) => entry.app === id);
      dot.style.display = isRunning ? '' : 'none';
      icon.append(glyph, gloss, label, dot);
      icon.addEventListener('click', () => {
        const existing = [...windows.values()].find((entry) => entry.app === id);
        if (existing) {
          if (existing.win.style.display === 'none') existing.win.style.display = 'flex';
          focusWindow(existing.win);
        } else {
          openApp(id);
        }
      });
      icon.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          icon.click();
        }
      });
      dock.appendChild(icon);
    });
    (hostWindows || []).forEach((item) => {
      const icon = document.createElement('div');
      icon.className = 'dock-icon dock-host-app';
      icon.title = item.title + (item.processName ? ' (' + item.processName + ')' : '') + ' — real Windows application';
      const glyph = document.createElement('span');
      glyph.className = 'dock-glyph';
      if (item.icon) {
        const image = document.createElement('img');
        image.src = item.icon; image.alt = '';
        image.style.cssText = 'width:100%;height:100%;object-fit:contain';
        glyph.appendChild(image);
      } else glyph.textContent = '🪟';
      const gloss = document.createElement('span');
      gloss.className = 'dock-gloss';
      const dot = document.createElement('span');
      dot.className = 'running-dot';
      icon.append(glyph, gloss, dot);
      icon.addEventListener('click', () => {
        // A real window that maps to a shell app (Discord) is opened by the
        // taskbar helper itself; every other route needs the shell to step
        // aside so the skin's own window is not left hidden behind it.
        let shellApp = null;
        try {
          if (DTM && DTM.retroAppForTaskbar) shellApp = DTM.retroAppForTaskbar({ processName: item.processName, path: item.path });
        } catch (error) { /* mapping is best-effort */ }
        if (!shellApp) parkShellWindows();
        window.DTMRealTaskbar.activateWindow(item);
      });
      dock.appendChild(icon);
    });

    sharedWindows.filter((state) => state.minimized).forEach((state) => {
      const item = document.createElement('div');
      item.className = 'dock-icon dock-minimized';
      item.title = state.title;
      const glyph = document.createElement('span');
      glyph.className = 'dock-glyph';
      glyph.style.fontSize = '30px';
      glyph.textContent = state.icon || '🪟';
      const gloss = document.createElement('span');
      gloss.className = 'dock-gloss';
      const label = document.createElement('span');
      label.className = 'dock-label';
      label.textContent = state.title || 'Window';
      item.append(glyph, gloss, label);
      item.addEventListener('click', () => {
        // Shell windows are already the top layer; only skin-hosted windows
        // need the shell to park before they can be seen.
        if (state.app !== 'shell-app') parkShellWindows();
        window.parent.postMessage({ type: 'dtm:window-action', id: state.id, app: state.app, action: 'activate' }, '*');
      });
      dock.appendChild(item);
    });
    const separator = document.createElement('span');
    separator.className = 'dock-sep';
    dock.appendChild(separator);
    const trash = document.createElement('div');
    trash.className = 'dock-icon';
    trash.dataset.app = 'trash';
    // Lets the real desktop mirror treat the Dock as a drop target for files.
    trash.dataset.dtmRecycle = '1';
    trash.title = 'Trash';
    trash.replaceChildren(dockGlyph('trash', '🗑️'));
    const trashGloss = document.createElement('span');
    trashGloss.className = 'dock-gloss';
    const trashLabel = document.createElement('span');
    trashLabel.className = 'dock-label';
    trashLabel.textContent = 'Trash';
    trash.append(trashGloss, trashLabel);
    trash.addEventListener('click', () => openApp('trash'));
    dock.appendChild(trash);
  }

  function updateMenus(appId) {
    activeApp = appId || 'finder';
    const def = apps[activeApp] || apps.finder || {};
    const name = document.getElementById('mb-app-name');
    const menus = document.getElementById('mb-menus');
    if (name) name.textContent = def.name || def.title || 'Finder';
    if (!menus) return;
    menus.replaceChildren();
    const definitions = def.menus || {};
    Object.entries(definitions).forEach(([label, items]) => {
      const wrap = document.createElement('div');
      wrap.className = 'mb-menu';
      const title = document.createElement('div');
      title.className = 'mb-menu-title';
      title.textContent = label;
      const list = document.createElement('div');
      list.className = 'mb-dropdown';
      (items || []).forEach((item) => {
        if (item === '-') {
          const sep = document.createElement('div');
          sep.className = 'dd-sep';
          list.appendChild(sep);
          return;
        }
        const button = document.createElement('div');
        button.className = 'dd-item';
        const text = document.createElement('span');
        text.textContent = item.label;
        button.appendChild(text);
        if (item.shortcut) {
          const shortcut = document.createElement('span');
          shortcut.className = 'dd-shortcut';
          shortcut.textContent = item.shortcut;
          button.appendChild(shortcut);
        }
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          closeMenus();
          try { if (item.action) item.action(); } catch (error) { console.warn('[Mac OS X] Menu action failed:', error); }
        });
        list.appendChild(button);
      });
      title.addEventListener('click', (event) => {
        event.stopPropagation();
        if (openMenu === wrap) closeMenus();
        else {
          closeMenus();
          openMenu = wrap;
          wrap.classList.add('open');
        }
      });
      wrap.append(title, list);
      menus.appendChild(wrap);
    });
  }

  function closeMenus() {
    if (openMenu) openMenu.classList.remove('open');
    openMenu = null;
    document.querySelectorAll('#appleMenu.open').forEach((menu) => menu.classList.remove('open'));
  }

  function openAppleMenu(event) {
    if (event) event.stopPropagation();
    closeMenus();
    document.getElementById('appleMenu')?.classList.toggle('open');
  }

  function closeWindow(win) {
    const entry = [...windows.values()].find((item) => item.win === win);
    if (!entry) return;
    try { if (entry.appDef.onClose) entry.appDef.onClose(entry); } catch (error) {}
    entry.win.remove();
    windows.delete(entry.id);
    if (activeWindow === win) {
      activeWindow = null;
      const next = [...windows.values()].at(-1);
      if (next) focusWindow(next.win);
      else updateMenus('finder');
    }
    renderDock();
  }

  function createWindow(appId, options = {}) {
    const appDef = apps[appId];
    if (!appDef) return null;
    if (appDef.singleton && !options.newWindow) {
      const previous = [...windows.values()].find((entry) => entry.app === appId);
      if (previous) {
        previous.win.style.display = 'flex';
        focusWindow(previous.win);
        return previous;
      }
    }
    const id = 'macosx-window-' + (++winCount);
    const width = options.width || appDef.width || 520;
    const height = options.height || appDef.height || 360;
    const win = document.createElement('section');
    win.className = 'window active' + (appDef.metal ? ' metal' : '');
    win.dataset.app = appId;
    win.style.width = width + 'px';
    win.style.height = height + 'px';
    win.style.left = Math.max(12, Math.min(innerWidth - width - 18, 82 + winCount * 22)) + 'px';
    win.style.top = Math.max(30, Math.min(innerHeight - height - 82, 58 + winCount * 18)) + 'px';
    win.style.zIndex = String(++zTop);

    const bar = document.createElement('header');
    bar.className = 'titlebar';
    const traffic = document.createElement('div');
    traffic.className = 'traffic';
    const close = document.createElement('button');
    close.className = 't-close';
    close.title = 'Close';
    close.setAttribute('aria-label', 'Close');
    const minimize = document.createElement('button');
    minimize.className = 't-min';
    minimize.title = 'Minimize';
    minimize.setAttribute('aria-label', 'Minimize');
    const zoom = document.createElement('button');
    zoom.className = 't-zoom';
    zoom.title = 'Zoom';
    zoom.setAttribute('aria-label', 'Zoom');
    traffic.append(close, minimize, zoom);
    const title = document.createElement('span');
    title.className = 'title-text';
    title.innerHTML = appDef.titleHtml || '';
    if (!appDef.titleHtml) title.textContent = appDef.title || appDef.name || appId;
    bar.append(traffic, title);

    const body = document.createElement('div');
    body.className = 'window-body';
    body.innerHTML = typeof appDef.body === 'function' ? appDef.body(options) : (appDef.body || '');
    const resize = document.createElement('div');
    resize.className = 'resize-handle';
    win.append(bar, body, resize);
    document.getElementById('windows').appendChild(win);

    const entry = { id, app: appId, appDef, win, bar, body, title, maximized: false, previousRect: null };
    windows.set(id, entry);
    close.addEventListener('click', (event) => { event.stopPropagation(); window.requestCloseWindow(win); });
    minimize.addEventListener('click', (event) => {
      event.stopPropagation();
      win.style.display = 'none';
      renderDock();
    });
    zoom.addEventListener('click', (event) => { event.stopPropagation(); toggleZoom(entry); });
    bar.addEventListener('dblclick', (event) => {
      if (!event.target.closest('.traffic')) toggleZoom(entry);
    });
    let drag = null;
    bar.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.traffic') || entry.maximized) return;
      drag = { x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop };
      bar.setPointerCapture(event.pointerId);
      focusWindow(win);
    });
    bar.addEventListener('pointermove', (event) => {
      if (!drag) return;
      win.style.left = Math.max(-win.offsetWidth + 90, Math.min(innerWidth - 70, drag.left + event.clientX - drag.x)) + 'px';
      win.style.top = Math.max(0, Math.min(innerHeight - 42, drag.top + event.clientY - drag.y)) + 'px';
    });
    bar.addEventListener('pointerup', () => { drag = null; });
    bar.addEventListener('pointercancel', () => { drag = null; });
    win.addEventListener('pointerdown', () => focusWindow(win));
    resize.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const rect = win.getBoundingClientRect();
      const start = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
      resize.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        win.style.width = Math.max(280, start.width + moveEvent.clientX - start.x) + 'px';
        win.style.height = Math.max(180, start.height + moveEvent.clientY - start.y) + 'px';
      };
      const stop = () => {
        resize.removeEventListener('pointermove', move);
        resize.removeEventListener('pointerup', stop);
        resize.removeEventListener('pointercancel', stop);
      };
      resize.addEventListener('pointermove', move);
      resize.addEventListener('pointerup', stop);
      resize.addEventListener('pointercancel', stop);
    });
    focusWindow(win);
    try { if (appDef.mount) appDef.mount(entry, options); } catch (error) { console.error('[Mac OS X] App failed to mount:', error); }
    renderDock();
    return entry;
  }

  function toggleZoom(entry) {
    const { win } = entry;
    if (!entry.maximized) {
      const rect = win.getBoundingClientRect();
      entry.previousRect = { left: win.style.left, top: win.style.top, width: win.style.width, height: win.style.height };
      entry.maximized = true;
      win.classList.add('max');
      win.style.left = '4px';
      win.style.top = '26px';
      win.style.width = Math.max(280, innerWidth - 8) + 'px';
      win.style.height = Math.max(180, innerHeight - 100) + 'px';
    } else {
      entry.maximized = false;
      win.classList.remove('max');
      if (entry.previousRect) Object.assign(win.style, entry.previousRect);
    }
  }

  function openApp(appId, options = {}) {
    const appDef = apps[appId];
    if (!appDef) return null;
    if (appDef.launch) {
      appDef.launch(options);
      return null;
    }
    return createWindow(appId, options);
  }

  function showContextMenu(x, y, items) {
    document.querySelectorAll('.ctx-menu').forEach((menu) => menu.remove());
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = Math.min(x, innerWidth - 190) + 'px';
    menu.style.top = Math.min(y, innerHeight - 180) + 'px';
    items.forEach((item) => {
      if (item === '-') {
        const separator = document.createElement('div');
        separator.className = 'ctx-sep';
        menu.appendChild(separator);
        return;
      }
      const button = document.createElement('div');
      button.className = 'ctx-item';
      button.textContent = item.label;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        menu.remove();
        if (item.action) item.action();
      });
      menu.appendChild(button);
    });
    document.body.appendChild(menu);
    return menu;
  }

  function hostPrompt(title, message, defaultValue = '') {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sheet-overlay';
      const sheet = document.createElement('div');
      sheet.className = 'sheet';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const description = document.createElement('p');
      description.textContent = message;
      const input = document.createElement('input');
      input.className = 'aqua-input';
      input.value = defaultValue;
      input.style.width = '100%';
      const actions = document.createElement('div');
      actions.className = 'sheet-actions';
      const cancel = document.createElement('button');
      cancel.className = 'aqua-btn gray';
      cancel.textContent = 'Cancel';
      const ok = document.createElement('button');
      ok.className = 'aqua-btn';
      ok.textContent = 'OK';
      const done = (value) => { overlay.remove(); resolve(value); };
      cancel.addEventListener('click', () => done(null));
      ok.addEventListener('click', () => done(input.value.trim()));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') done(input.value.trim());
        if (event.key === 'Escape') done(null);
      });
      actions.append(cancel, ok);
      sheet.append(heading, description, input, actions);
      overlay.appendChild(sheet);
      document.body.appendChild(overlay);
      input.focus();
      input.select();
    });
  }

  function hostConfirm3(title, message, choices) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'sheet-overlay';
      const sheet = document.createElement('div');
      sheet.className = 'sheet';
      const heading = document.createElement('h3');
      heading.textContent = title;
      const description = document.createElement('p');
      description.textContent = message;
      const actions = document.createElement('div');
      actions.className = 'sheet-actions';
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        overlay.remove();
        resolve(value);
      };
      choices.forEach((choice, index) => {
        const button = document.createElement('button');
        button.className = 'aqua-btn' + (choice.primary ? '' : ' gray');
        button.textContent = choice.label;
        button.addEventListener('click', () => done(choice.id));
        actions.appendChild(button);
        if (index === choices.length - 1) button.focus();
      });
      sheet.append(heading, description, actions);
      overlay.appendChild(sheet);
      document.body.appendChild(overlay);
    });
  }

  // Reusable dirty-state guard: apps register an async handler for their
  // window; close controls call requestCloseWindow and honour a false result.
  const closeGuards = new WeakMap();
  window.registerCloseGuard = (win, handler) => closeGuards.set(win, handler);
  window.requestCloseWindow = async (win) => {
    const guard = win && closeGuards.get(win);
    if (guard) {
      try { if (await guard() === false) return false; } catch (e) { console.warn('[Mac OS X] close guard failed:', e); }
    }
    closeWindow(win);
    return true;
  };

  function shutDown() {
    const overlay = document.createElement('div');
    overlay.className = 'sheet-overlay';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML = '<h3>Shut Down</h3><p>Do you want to shut down this Macintosh?</p>';
    const actions = document.createElement('div');
    actions.className = 'sheet-actions';
    const cancel = document.createElement('button');
    cancel.className = 'aqua-btn gray';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => overlay.remove();
    const restart = document.createElement('button');
    restart.className = 'aqua-btn gray';
    restart.textContent = 'Restart';
    restart.onclick = () => location.reload();
    const exit = document.createElement('button');
    exit.className = 'aqua-btn';
    exit.textContent = 'Shut Down';
    exit.onclick = () => { if (DTM && DTM.system && DTM.system.exit) DTM.system.exit(); };
    actions.append(cancel, restart, exit);
    sheet.appendChild(actions);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
  }

  function renderDesktopIcons() {
    const container = document.getElementById('desktop-icons');
    const definitions = [
      { id: 'disk', app: 'finder', label: 'Macintosh HD', icon: '💽' },
      { id: 'home', app: 'finder', label: 'Home', icon: '🏠' },
      { id: 'applications', app: 'finder', label: 'Applications', icon: '📁' },
      { id: 'readme', app: 'simpletext', label: 'Read Me', icon: '📄' },
      { id: 'safari', app: 'safari', label: 'Safari', icon: '🧭' }
    ];
    container.replaceChildren();
    definitions.forEach((definition, index) => {
      const icon = document.createElement('div');
      icon.className = 'desktop-icon';
      icon.dataset.app = definition.app;
      icon.dataset.id = definition.id;
      icon.style.right = '20px';
      icon.style.top = (16 + index * 84) + 'px';
      const image = document.createElement('div');
      image.className = 'di-img';
      image.textContent = definition.icon;
      const label = document.createElement('div');
      label.className = 'di-label';
      label.textContent = definition.label;
      icon.append(image, label);
      icon.addEventListener('click', (event) => {
        event.stopPropagation();
        container.querySelectorAll('.desktop-icon').forEach((item) => item.classList.toggle('selected', item === icon));
      });
      icon.addEventListener('dblclick', () => openApp(definition.app, { path: definition.id === 'home' ? '' : undefined }));
      icon.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showContextMenu(event.clientX, event.clientY, [
          { label: 'Open', action: () => openApp(definition.app, { path: definition.id === 'home' ? '' : undefined }) },
          { label: 'Get Info', action: () => openApp('about') }
        ]);
      });
      container.appendChild(icon);
    });
  }

  function bindMenus() {
    const apple = document.getElementById('mb-apple');
    if (apple) {
      apple.innerHTML = appleMark;
      apple.addEventListener('click', openAppleMenu);
    }
    if (!document.getElementById('appleMenu')) {
      const appleMenu = document.createElement('div');
      appleMenu.id = 'appleMenu';
      appleMenu.className = 'mb-menu';
      appleMenu.style.cssText = 'position:fixed;left:4px;top:24px;z-index:12000;flex-direction:column;min-width:190px;padding:4px;background:#f2f2f2;color:#111;border:1px solid #999;box-shadow:2px 2px 6px rgba(0,0,0,.3)';
      appleMenu.innerHTML = '<div class="am-item" data-app="about" style="padding:5px 9px;cursor:default">About This Mac</div>' +
        '<div class="am-item" style="padding:5px 9px;cursor:default">Shut Down…</div>' +
        '<div class="am-item" style="padding:5px 9px;cursor:default">Restart…</div>' +
        '<div class="am-item" style="padding:5px 9px;cursor:default">Play Startup Chime</div>';
      document.body.appendChild(appleMenu);
    }
    document.querySelectorAll('#appleMenu [data-app="about"]').forEach((item) => item.addEventListener('click', () => {
      closeMenus();
      openApp('about');
    }));
    document.querySelectorAll('#appleMenu .am-item').forEach((item) => {
      if (item.textContent.includes('Shut Down')) item.addEventListener('click', () => { closeMenus(); shutDown(); });
      if (item.textContent.includes('Restart')) item.addEventListener('click', () => { closeMenus(); location.reload(); });
      if (item.textContent.includes('Play Startup Chime')) item.addEventListener('click', () => { closeMenus(); playChime(); });
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.mb-menu') && !event.target.closest('#appleMenu')) closeMenus();
      if (!event.target.closest('.ctx-menu')) document.querySelectorAll('.ctx-menu').forEach((menu) => menu.remove());
    });
    document.getElementById('desktop')?.addEventListener('contextmenu', (event) => {
      if (event.target.closest('.desktop-icon')) return;
      event.preventDefault();
      showContextMenu(event.clientX, event.clientY, [
        { label: 'New Finder Window', action: () => openApp('finder', { newWindow: true }) },
        { label: 'Get Info', action: () => openApp('about') },
        '-',
        { label: 'Switch Era…', action: () => window.parent.postMessage('dtm:open-switcher', '*') }
      ]);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'F8' || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 't')) {
      event.preventDefault();
      window.parent.postMessage('dtm:open-switcher', '*');
    } else if (event.key==='F5') {
      event.preventDefault();
      const engine = window.DTM || (window.parent && window.parent.DTM);
      if (engine && engine.system && engine.system.toggleFullScreen) engine.system.toggleFullScreen();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      if (activeWindow) window.requestCloseWindow(activeWindow);
    }
  });

  function closeActiveWindow() {
    if (activeWindow) closeWindow(activeWindow);
  }

  function boot() {
    if (window.DTMRealTaskbar) {
      let lastSignature = '';
      window.DTMRealTaskbar.start((data) => {
        hostWindows = data.windows || [];
        renderHostTray(data.tray || []);
        const signature = hostWindows.map((w) => w.pid || w.title).join('|');
        if (signature !== lastSignature) { lastSignature = signature; renderDock(); }
      }, 8000);
    }
    renderDesktopIcons();
    bindMenus();
    updateMenus('finder');
    renderDock();
    const clock = document.getElementById('mb-clock');
    const updateClock = () => { if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    updateClock();
    clock.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showMacDateTimePanel();
    });

    function showMacDateTimePanel() {
      const panel = document.createElement('div');
      panel.className = 'dtm-mac-datetime-panel';
      panel.innerHTML = `
        <div class="dtm-mac-datetime-header">Date & Time</div>
        <div class="dtm-mac-datetime-content">
          <div id="dtm-mac-date" class="dtm-mac-datetime-date"></div>
          <div id="dtm-mac-time" class="dtm-mac-datetime-time"></div>
        </div>
        <div class="dtm-mac-datetime-close">Close</div>
      `;
      panel.addEventListener('click', (e) => {
        if (e.target.classList.contains('dtm-mac-datetime-close') || e.target.classList.contains('dtm-mac-datetime-panel')) {
          document.body.removeChild(panel);
        }
      });
      document.body.appendChild(panel);
      requestAnimationFrame(() => updateMacDateTime(panel));
      const timeout = setInterval(() => updateMacDateTime(panel), 60000);
      return () => { clearInterval(timeout); document.body.removeChild(panel); };
    }

    function updateMacDateTime(panel) {
      const now = new Date();
      const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      panel.querySelector('#dtm-mac-date').textContent = dateStr;
          panel.querySelector('#dtm-mac-time').textContent = timeStr;
        }
    window.setInterval(updateClock, 15000);
    window.setTimeout(() => {
      document.getElementById('boot-screen')?.classList.add('done');
      window.setTimeout(() => {
        const screen = document.getElementById('boot-screen');
        if (screen) screen.style.display = 'none';
        openApp('finder');
      }, 650);
    }, 700);
  }

  window.registerMacApp = registerMacApp;
  window.openApp = openApp;
  window.createMacWindow = createWindow;
  window.focusMacWindow = focusWindow;
  window.closeActiveWindow = closeActiveWindow;
  window.closeMacWindow = closeWindow;
  window.updateMenus = updateMenus;
  window.showContextMenu = showContextMenu;
  window.hostPrompt = hostPrompt;
  window.hostConfirm3 = hostConfirm3;
  window.shutDown = shutDown;
  window.playChime = () => {
    // UI chimes stay silent: the host window is no longer muted (media plays).
    return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audio = new AudioCtx();
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        const start = audio.currentTime + index * 0.16;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(start + 0.55);
      });
      setTimeout(() => audio.close(), 1500);
    } catch (e) { /* audio is optional */ }
  };
  window.macWindowEntries = windows;
  boot();
})();
