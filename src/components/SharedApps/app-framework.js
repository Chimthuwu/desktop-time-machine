/**
 * Desktop Time Machine — Shared Application Framework
 *
 * One implementation of application lifecycle, window chrome and dialogs,
 * reused inside every skin iframe. The active skin supplies only a theme name;
 * it never reimplements the application logic.
 *
 * Public API: window.DTMApps
 *   configure({ skinId, theme })
 *   register(definition)
 *   open(appId, options) -> instance
 *   close(appId), focus(appId), list(), isOpen(appId)
 *   prompt(title, message, defaultValue) -> Promise<string|null>
 *   confirm(title, message) -> Promise<boolean>
 */
(function () {
  'use strict';
  if (window.DTMApps && window.DTMApps.__framework) return;

  var config = { skinId: 'windows95', theme: 'win95' };
  var registry = new Map();
  var instances = new Map();
  var zTop = 50000;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function withErrorBoundary(node, message, fn) {
    try {
      return fn();
    } catch (error) {
      var box = el('div', 'dtm-app-error', message + ': ' + (error && error.message ? error.message : String(error)));
      node.replaceChildren(box);
      return { dispose: function () {} };
    }
  }

  function promptModal(title, message, defaultValue, kind) {
    return new Promise(function (resolve) {
      var shade = el('div', 'dtm-app-modal-shade');
      var dialog = el('div', 'dtm-app-dialog');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      var heading = el('h3', 'dtm-app-dialog-title', title);
      var body = el('div', 'dtm-app-dialog-body');
      body.appendChild(el('p', '', message));
      var input = null;
      if (kind !== 'confirm') {
        input = el('input', 'dtm-app-input');
        input.type = 'text';
        input.value = defaultValue == null ? '' : String(defaultValue);
        body.appendChild(input);
      }
      var actions = el('div', 'dtm-app-dialog-actions');
      var cancel = el('button', 'dtm-app-button', 'Cancel');
      var ok = el('button', 'dtm-app-button primary', kind === 'confirm' ? 'OK' : 'Save');
      actions.append(cancel, ok);
      dialog.append(heading, body, actions);
      shade.appendChild(dialog);
      document.body.appendChild(shade);

      var settled = false;
      function done(value) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey, true);
        shade.remove();
        resolve(value);
      }
      function onKey(event) {
        if (event.key === 'Escape') { event.preventDefault(); done(null); }
        else if (event.key === 'Enter') { event.preventDefault(); done(input ? input.value : true); }
      }
      cancel.addEventListener('click', function () { done(null); });
      ok.addEventListener('click', function () { done(input ? input.value : true); });
      shade.addEventListener('pointerdown', function (event) { if (event.target === shade) done(null); });
      document.addEventListener('keydown', onKey, true);
      if (input) { input.focus(); input.select(); } else { ok.focus(); }
    });
  }

  function makeWindow(instance) {
    var def = instance.definition;
    var win = el('section', 'dtm-shared-app');
    win.dataset.app = def.id;
    win.dataset.theme = config.theme;
    win.style.width = (def.width || 520) + 'px';
    win.style.height = (def.height || 380) + 'px';
    var count = instances.size;
    win.style.left = Math.max(8, Math.min(window.innerWidth - (def.width || 520) - 8, 96 + count * 24)) + 'px';
    win.style.top = Math.max(8, Math.min(window.innerHeight - (def.height || 380) - 8, 64 + count * 20)) + 'px';
    win.style.zIndex = String(++zTop);

    var bar = el('header', 'dtm-app-titlebar');
    var glyph = el('span', 'dtm-app-title-icon', def.icon || '🗔');
    var title = el('span', 'dtm-app-title-text', def.title || def.name || def.id);
    var controls = el('div', 'dtm-app-controls');
    var minimize = el('button', 'dtm-app-control', '—');
    minimize.title = 'Minimize';
    var maximize = el('button', 'dtm-app-control', '□');
    maximize.title = 'Maximize';
    var close = el('button', 'dtm-app-control close', '×');
    close.title = 'Close';
    controls.append(minimize, maximize, close);
    bar.append(glyph, title, controls);

    var body = el('div', 'dtm-app-body');
    win.append(bar, body);
    document.body.appendChild(win);

    minimize.addEventListener('click', function (event) {
      event.stopPropagation();
      win.style.display = 'none';
    });
    maximize.addEventListener('click', function (event) {
      event.stopPropagation();
      instance.maximized = !instance.maximized;
      win.classList.toggle('maximized', instance.maximized);
      focus(instance);
    });
    close.addEventListener('click', function (event) {
      event.stopPropagation();
      closeApp(def.id);
    });

    var drag = null;
    bar.addEventListener('pointerdown', function (event) {
      if (event.target.closest('button') || instance.maximized) return;
      drag = { x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop };
      try { bar.setPointerCapture(event.pointerId); } catch (e) {}
      focus(instance);
    });
    bar.addEventListener('pointermove', function (event) {
      if (!drag) return;
      win.style.left = Math.max(-win.offsetWidth + 80, Math.min(window.innerWidth - 80, drag.left + event.clientX - drag.x)) + 'px';
      win.style.top = Math.max(0, Math.min(window.innerHeight - 40, drag.top + event.clientY - drag.y)) + 'px';
    });
    bar.addEventListener('pointerup', function () { drag = null; });
    bar.addEventListener('pointercancel', function () { drag = null; });
    bar.addEventListener('dblclick', function (event) {
      if (event.target.closest('button')) return;
      maximize.click();
    });
    win.addEventListener('pointerdown', function () { focus(instance); });
    win.addEventListener('keydown', function (event) {
      if (instance.app && instance.app.onKeyDown) instance.app.onKeyDown(event);
      if (event.key === 'Escape' && def.closeOnEscape !== false) {
        event.preventDefault();
        closeApp(def.id);
      }
    });

    instance.win = win;
    instance.body = body;
  }

  function focus(instance) {
    if (!instance || !instance.win) return;
    instance.win.style.zIndex = String(++zTop);
    instances.forEach(function (other) {
      if (other.win) other.win.classList.toggle('active', other === instance);
    });
  }

  function closeApp(appId) {
    var instance = instances.get(appId);
    if (!instance) return false;
    try { if (instance.app && instance.app.dispose) instance.app.dispose(); } catch (e) {}
    try { if (instance.win) instance.win.remove(); } catch (e) {}
    instances.delete(appId);
    return true;
  }

  function openApp(appId, options) {
    options = options || {};
    var def = registry.get(appId);
    if (!def) {
      console.warn('[DTMApps] Unknown application:', appId);
      return null;
    }
    var existing = instances.get(appId);
    if (existing && !options.multiple) {
      if (existing.win) existing.win.style.display = 'flex';
      focus(existing);
      return existing;
    }
    var instance = { id: appId, definition: def, maximized: false, options: options, app: null };
    makeWindow(instance);
    instances.set(appId, instance);
    instance.app = withErrorBoundary(instance.body, 'Could not start ' + (def.name || appId), function () {
      return def.mount(instance.body, {
        appId: appId,
        options: options,
        DTM: window.DTM || (window.parent && window.parent.DTM) || null,
        prompt: function (title, message, defaultValue) {
          return promptModal(title, message, defaultValue, 'prompt');
        },
        close: function () { closeApp(appId); }
      });
    });
    focus(instance);
    return instance;
  }

  var api = {
    __framework: true,
    configure: function (next) {
      Object.assign(config, next || {});
      return config;
    },
    getConfig: function () { return Object.assign({}, config); },
    register: function (def) {
      if (!def || !def.id) throw new Error('Application definition needs an id');
      registry.set(def.id, def);
      return def;
    },
    open: openApp,
    close: closeApp,
    focus: function (appId) { focus(instances.get(appId)); },
    isOpen: function (appId) { return instances.has(appId); },
    list: function () { return Array.from(registry.values()).map(function (def) { return Object.assign({}, def, { mount: undefined }); }); },
    openInstances: function () { return Array.from(instances.keys()); },
    prompt: function (title, message, defaultValue) { return promptModal(title, message, defaultValue, 'prompt'); },
    confirm: function (title, message) { return promptModal(title, message, null, 'confirm'); },
    closeAll: function () { Array.from(instances.keys()).forEach(closeApp); }
  };

  window.DTMApps = api;

  // Shell/skin integration: a skin may request a shared app by postMessage.
  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.type !== 'dtm:open-app') return;
    if (data.appId) openApp(data.appId, data.options || {});
  });

  // Era-independent access to the shared application launcher.
  window.addEventListener('keydown', function (event) {
    if (event.altKey && event.key && event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      openApp('launcher');
    }
  });
})();
