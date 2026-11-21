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
  var windows = new Map();
  var idCounter = 0;
  var observers = [];
  var ids = new WeakMap();

  function idFor(node) {
    if (!ids.has(node)) ids.set(node, 'w' + (++idCounter));
    return ids.get(node);
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
      var nodes = doc.querySelectorAll('.window[data-app], .dtm-window, .win, .be-window, .wb-window, .dtmshell-win');
      Array.prototype.forEach.call(nodes, function (node) {
        if (!node.isConnected) return;
        var state = {
          id: idFor(node),
          app: node.dataset.app || (node.classList.contains('dtmshell-win') ? 'shell-app' : 'window'),
          icon: node.dataset.icon || '',
          title: text(node, ['.dtmshell-title-icon + .dtmshell-title-text', '.dtmshell-title-text', '.title-text', '.win-title', '.title', '.dtm-window-title']),
          minimized: node.style.display === 'none' || (node.offsetParent === null && node.style.position !== 'fixed'),
          active: node.classList.contains('active') || node.classList.contains('dtmshell-win'),
          open: true,
          maximized: node.classList.contains('max') || node.classList.contains('maximized')
        };
        if (!state.icon) {
          var glyph = node.querySelector('.dtmshell-title-icon');
          state.icon = glyph ? glyph.textContent.trim() : '';
        }
        found.push(state);
      });
    });

    // A single active window per context is enough for taskbar highlighting.
    var seenActive = false;
    found.forEach(function (state) {
      if (state.active && seenActive) state.active = false;
      if (state.active) seenActive = true;
    });

    var changed = found.length !== windows.size;
    var next = new Map();
    found.forEach(function (state) {
      next.set(state.id, state);
      var previous = windows.get(state.id);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(state)) changed = true;
    });
    windows = next;
    if (changed) broadcast();
  }

  function post(data) {
    if (!viewport || !viewport.contentWindow) return;
    try { viewport.contentWindow.postMessage(data, '*'); } catch (e) {}
  }

  function broadcast() {
    post({ type: 'dtm:windows-state', windows: Array.from(windows.values()) });
  }

  function find(id) {
    var docs = [];
    if (viewport && viewport.contentDocument) docs.push(viewport.contentDocument);
    if (layer) docs.push(layer.ownerDocument);
    for (var i = 0; i < docs.length; i++) {
      var nodes = docs[i].querySelectorAll('.window[data-app], .dtm-window, .win, .be-window, .wb-window, .dtmshell-win');
      for (var j = 0; j < nodes.length; j++) if (idFor(nodes[j]) === id) return nodes[j];
    }
    return null;
  }

  function control(data) {
    var node = find(data.id);
    if (!node) {
      if (data.app) post({ type: 'dtm:open-app', appId: data.app });
      return;
    }
    if (data.action === 'minimize') {
      node.style.display = 'none';
    } else if (data.action === 'activate') {
      node.style.display = '';
      node.classList.add('active');
      node.style.zIndex = String(Date.now() % 100000);
      try { node.dispatchEvent(new (node.ownerDocument.defaultView.Event)('pointerdown', { bubbles: true })); } catch (e) {}
    } else if (data.action === 'close') {
      var close = node.querySelector('.t-close, .dtmshell-buttons .close, .close, .dtm-window-close, .wb-close');
      if (close) close.click();
    }
    setTimeout(collect, 40);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'dtm:window-action') control(data);
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
      setTimeout(function () { watch(viewport.contentDocument); }, 300);
    });
  }
  if (layer && layer.ownerDocument) {
    var shellObserver = new MutationObserver(function () { collect(); });
    shellObserver.observe(layer, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }
  window.setInterval(collect, 700);
  setTimeout(collect, 1500);

  window.dtmWindows = {
    list: function () { return Array.from(windows.values()); },
    refresh: collect
  };
})();
