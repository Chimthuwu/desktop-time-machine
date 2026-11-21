/**
 * Desktop Time Machine — shared window tracking.
 *
 * One source of truth for which windows exist, their identity, title, icon and
 * state. Skins receive the same snapshot and render it with their own era
 * conventions (XP taskbar buttons, Mac Dock indicators, Deskbar entries...).
 *
 * This does NOT manage windows; it observes them and relays control actions.
 */
(function () {
  'use strict';

  var layer = document.getElementById('shell-app-layer');
  var viewport = document.getElementById('skin-viewport');
  var SELECTOR = '.window[data-app], .dtm-window, .win, .be-window, .wb-window, .dtmshell-win, .dtm-shared-app';
  var windows = new Map();
  var idCounter = 0;
  var zCounter = 100;
  var activeId = null;
  var observers = [];
  var ids = new WeakMap();

  function idFor(node) {
    var id = node.getAttribute('data-window-id');
    if (!id) {
      id = 'w' + (++idCounter);
      node.setAttribute('data-window-id', id);
      ids.set(node, id);
    }
    return id;
  }

  function text(node, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var found = node.querySelector(selectors[i]);
      if (found && found.textContent.trim()) return found.textContent.trim();
    }
    return node.getAttribute('aria-label') || node.dataset.app || 'Window';
  }

  function collect() {
    var found = [];
    var docs = [];
    if (viewport && viewport.contentDocument) docs.push(viewport.contentDocument);
    if (layer) docs.push(layer.ownerDocument);

    docs.forEach(function (doc) {
      var nodes = doc.querySelectorAll(SELECTOR);
      Array.prototype.forEach.call(nodes, function (node) {
        if (!node.isConnected) return;
        var state = {
          id: idFor(node),
          app: node.dataset.app || (node.classList.contains('dtmshell-win') ? 'shell-app' : 'window'),
          icon: node.dataset.icon || '',
          title: text(node, [
            '.dtmshell-title-icon + .dtmshell-title-text',
            '.dtmshell-title-text',
            '.dtm-app-title-text',
            '.title-text', '.win-title', '.title', '.dtm-window-title'
          ]),
          minimized: node.style.display === 'none' || node.dataset.minimized === 'true',
          active: state_isActive(node),
          open: true,
          maximized: node.classList.contains('max') || node.classList.contains('maximized')
        };
        if (!state.icon) {
          var glyph = node.querySelector('.dtmshell-title-icon, .dtm-app-title-icon');
          state.icon = glyph ? glyph.textContent.trim() : '';
        }
        if (state.minimized) state.active = false;
        found.push(state);
      });
    });

    if (!found.some(function (state) { return state.active; }) && activeId) {
      var previous = found.find(function (state) { return state.id === activeId; });
      if (previous && !previous.minimized) previous.active = true;
    }
    if (activeId && !found.some(function (state) { return state.id === activeId && !state.minimized; })) activeId = null;

    var changed = found.length !== windows.size;
    var next = new Map();
    found.forEach(function (state) {
      next.set(state.id, state);
      var earlier = windows.get(state.id);
      if (!earlier || JSON.stringify(earlier) !== JSON.stringify(state)) changed = true;
    });
    windows = next;
    if (changed) broadcast();
  }

  function state_isActive(node) {
    if (activeId) return node.getAttribute('data-window-id') === activeId;
    return node.classList.contains('active') || node.classList.contains('dtmshell-win');
  }

  function post(data) {
    if (!viewport || !viewport.contentWindow) return;
    try { viewport.contentWindow.postMessage(data, '*'); } catch (e) {}
  }

  function broadcast() {
    post({ type: 'dtm:windows-state', windows: Array.from(windows.values()) });
  }

  function allNodes() {
    var docs = [];
    if (viewport && viewport.contentDocument) docs.push(viewport.contentDocument);
    if (layer) docs.push(layer.ownerDocument);
    var result = [];
    docs.forEach(function (doc) {
      Array.prototype.forEach.call(doc.querySelectorAll(SELECTOR), function (node) { result.push(node); });
    });
    return result;
  }

  function find(id) {
    return allNodes().find(function (node) { return idFor(node) === id; }) || null;
  }

  function deactivateOthers(node) {
    allNodes().forEach(function (other) {
      if (other !== node) {
        other.classList.remove('active');
        other.dataset.minimized = 'false';
      }
    });
  }

  function control(data) {
    var node = find(data.id);
    if (!node) {
      if (data.app) post({ type: 'dtm:open-app', appId: data.app });
      return;
    }
    if (data.action === 'minimize') {
      node.style.display = 'none';
      node.dataset.minimized = 'true';
      node.classList.remove('active');
      if (activeId === data.id) activeId = null;
    } else if (data.action === 'activate') {
      deactivateOthers(node);
      node.dataset.minimized = 'false';
      node.style.display = '';
      node.classList.add('active');
      node.style.zIndex = String(++zCounter);
      activeId = data.id;
      try { node.dispatchEvent(new (node.ownerDocument.defaultView.Event)('pointerdown', { bubbles: true })); } catch (e) {}
    } else if (data.action === 'close') {
      var close = node.querySelector('.t-close, .dtmshell-buttons .close, .close, .dtm-window-close, .wb-close');
      if (close) close.click();
    }
    collect();
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    // Only accept control messages from our own window or its skin iframe.
    var trusted = event.source === window || (viewport && event.source === viewport.contentWindow);
    if (!trusted) return;
    if (data.type === 'dtm:window-action') control(data);
    if (data.type === 'dtm:window-activated' && data.id) {
      var node = find(data.id);
      if (node) { deactivateOthers(node); activeId = data.id; node.style.zIndex = String(++zCounter); collect(); }
    }
  });

  function watch(doc) {
    if (!doc || !doc.body) return;
    observers.forEach(function (o) { try { o.disconnect(); } catch (e) {} });
    observers = [];
    var observer = new MutationObserver(function () { collect(); });
    observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    observers.push(observer);
    collect();
  }

  if (viewport) {
    viewport.addEventListener('load', function () {
      setTimeout(function () { watch(viewport.contentDocument); }, 200);
    });
  }
  if (layer && layer.ownerDocument) {
    var shellObserver = new MutationObserver(function () { collect(); });
    shellObserver.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  // Re-publish the current shared state whenever a new skin finishes loading.
  if (window.dtmEngine && typeof window.dtmEngine.on === 'function') {
    window.dtmEngine.on('dtm:skin-changed', function () {
      activeId = null;
      setTimeout(function () {
        watch(viewport && viewport.contentDocument);
        broadcast();
      }, 400);
    });
  }

  window.setInterval(collect, 700);
  setTimeout(collect, 1000);

  window.dtmWindows = {
    list: function () { return Array.from(windows.values()); },
    refresh: collect
  };
})();
