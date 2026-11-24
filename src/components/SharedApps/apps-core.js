/**
 * Desktop Time Machine — Shared core applications.
 *
 * One implementation per application, used by every skin. All file operations
 * go through DTM.fs (real host filesystem in Electron); presentation comes
 * from the theme configured by the active skin.
 */
(function () {
  'use strict';
  var Apps = window.DTMApps;
  if (!Apps || Apps.__coreLoaded) return;
  Apps.__coreLoaded = true;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function toolbar() {
    return el('div', 'dtm-app-toolbar');
  }

  function button(label, handler) {
    var node = el('button', 'dtm-app-button', label);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }

  function status(node, text) {
    node.textContent = text || '';
  }

  function fs(ctx) {
    return ctx.DTM && ctx.DTM.fs ? ctx.DTM.fs : null;
  }

  // ---- Launcher: discover every shared app --------------------------------
  Apps.register({
    id: 'launcher',
    name: 'Applications',
    title: 'Applications',
    icon: '🧰',
    width: 440,
    height: 380,
    capabilities: ['launcher'],
    mount: function (root) {
      var list = el('div', 'dtm-app-launcher');
      root.appendChild(el('p', 'dtm-app-launcher-hint', 'Shared applications — the same programs on every era of this computer.'));
      root.appendChild(list);
      Apps.list().filter(function (def) { return def.id !== 'launcher'; }).forEach(function (def) {
        var item = el('button', 'dtm-app-launcher-item');
        item.type = 'button';
        item.append(el('span', 'dtm-app-launcher-icon', def.icon || '🗔'), el('span', '', def.name));
        item.addEventListener('dblclick', function () { Apps.open(def.id); });
        item.addEventListener('click', function () { Apps.open(def.id); });
        list.appendChild(item);
      });
      return { dispose: function () {} };
    }
  });

  // ---- Notepad: real open / edit / save -----------------------------------
  Apps.register({
    id: 'notepad',
    name: 'Notepad',
    title: 'Untitled - Notepad',
    icon: '📝',
    width: 560,
    height: 400,
    capabilities: ['text', 'filesystem'],
    mount: function (root, ctx) {
      var backend = fs(ctx);
      var path = '';
      var dirty = false;
      var bar = toolbar();
      var area = el('textarea', 'dtm-app-editor');
      area.spellcheck = false;
      area.setAttribute('aria-label', 'Document text');
      var foot = el('div', 'dtm-app-status');
      root.append(bar, area, foot);

      function updateTitle() {
        var name = path ? path.split(/[\\/]/).pop() : 'Untitled';
        ctx.close && (root.closest('.dtm-shared-app').querySelector('.dtm-app-title-text').textContent =
          (dirty ? '*' : '') + name + ' - Notepad');
      }
      function markDirty() { dirty = true; updateTitle(); }

      async function save(saveAs) {
        if (!backend) { status(foot, 'Filesystem unavailable'); return false; }
        var target = path;
        if (saveAs || !target) {
          var chosen = await ctx.prompt('Save As', 'Enter a full file path:', target || 'Untitled.txt');
          if (!chosen) return false;
          target = chosen;
        }
        try {
          var result = await backend.write(target, area.value);
          // Only commit the path and clear dirty after a successful write.
          path = (result && result.path) || target;
          dirty = false;
          updateTitle();
          status(foot, 'Saved ' + path);
          return true;
        } catch (error) {
          status(foot, 'Save failed: ' + error.message);
          return false;
        }
      }
      async function canDiscard() {
        if (!dirty) return true;
        var choice = await ctx.confirmDirty('Save changes to this document?');
        if (choice === 'cancel' || choice === null) return false;
        if (choice === 'save') return save(false);
        return true;
      }
      async function newDocument() {
        if (!await canDiscard()) return;
        area.value = ''; path = ''; dirty = false; updateTitle(); status(foot, '');
      }
      async function open() {
        if (!await canDiscard()) return;
        if (!backend) { status(foot, 'Filesystem unavailable'); return; }
        var chosen = await ctx.prompt('Open', 'Enter a full file path:', path);
        if (!chosen) return;
        try {
          var content = await backend.read(chosen);
          area.value = content;
          path = chosen;
          dirty = false;
          updateTitle();
          status(foot, 'Opened ' + chosen);
        } catch (error) { status(foot, 'Open failed: ' + error.message); }
      }

      bar.append(
        button('New', newDocument),
        button('Open…', open),
        button('Save', function () { save(false); }),
        button('Save As…', function () { save(true); })
      );
      area.addEventListener('input', markDirty);
      area.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          save(false);
        }
      });
      status(foot, 'Ready');
      return {
        beforeClose: canDiscard,
        dispose: function () {},
        onKeyDown: function () {}
      };
    }
  });

  // ---- Calculator: safe expression evaluation (no eval) -------------------
  function calculate(expression) {
    var tokens = expression.match(/(\d*\.?\d+|[+\-*/()%])/g);
    if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) return null;
    var pos = 0;
    function peek() { return tokens[pos]; }
    function factor() {
      var token = tokens[pos++];
      if (token === '-') return -factor();
      if (token === '+') return factor();
      if (token === '(') {
        var value = expressionValue();
        if (tokens[pos++] !== ')') return null;
        return value;
      }
      if (token === undefined || isNaN(Number(token))) return null;
      return Number(token);
    }
    function term() {
      var value = factor();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        var op = tokens[pos++];
        var next = factor();
        if (value === null || next === null) return null;
        value = op === '*' ? value * next : op === '/' ? value / next : value % next;
      }
      return value;
    }
    function expressionValue() {
      var value = term();
      while (peek() === '+' || peek() === '-') {
        var op = tokens[pos++];
        var next = term();
        if (value === null || next === null) return null;
        value = op === '+' ? value + next : value - next;
      }
      return value;
    }
    var result = expressionValue();
    return pos === tokens.length && result !== null && isFinite(result) ? result : null;
  }

  Apps.register({
    id: 'calculator',
    name: 'Calculator',
    icon: '🧮',
    width: 300,
    height: 360,
    capabilities: ['math'],
    mount: function (root) {
      var display = el('input', 'dtm-app-display');
      display.readOnly = true;
      display.value = '0';
      display.setAttribute('aria-label', 'Calculator display');
      var grid = el('div', 'dtm-app-calc-grid');
      root.append(display, grid);
      var keys = ['C', '(', ')', '%', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];
      function press(key) {
        if (key === 'C') { display.value = '0'; return; }
        if (key === '=') {
          var value = calculate(display.value);
          display.value = value === null ? 'Error' : String(Math.round(value * 1e10) / 1e10);
          return;
        }
        if (display.value === '0' || display.value === 'Error') display.value = '';
        display.value += key;
      }
      keys.forEach(function (key) {
        var node = button(key, function () { press(key); });
        node.className = 'dtm-app-button calc-key';
        grid.appendChild(node);
      });
      display.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') { event.preventDefault(); press('='); }
      });
      return { dispose: function () {} };
    }
  });

  // ---- File properties: real stat ----------------------------------------
  Apps.register({
    id: 'properties',
    name: 'File Properties',
    icon: '📋',
    width: 420,
    height: 320,
    capabilities: ['filesystem'],
    mount: function (root, ctx) {
      var backend = fs(ctx);
      var bar = toolbar();
      var info = el('div', 'dtm-app-properties');
      root.append(bar, info);
      async function show() {
        if (!backend) { info.textContent = 'Filesystem unavailable'; return; }
        var target = await ctx.prompt('Properties', 'Enter a file or folder path:');
        if (!target) return;
        try {
          var stat = await backend.stat(target);
          info.replaceChildren();
          [
            ['Name', stat.name],
            ['Type', stat.isDirectory ? 'Folder' : 'File'],
            ['Location', target],
            ['Size', stat.isDirectory ? '—' : (stat.size || 0) + ' bytes'],
            ['Created', stat.created ? new Date(stat.created).toLocaleString() : '—'],
            ['Modified', stat.modified ? new Date(stat.modified).toLocaleString() : '—'],
            ['Hidden', stat.hidden ? 'Yes' : 'No']
          ].forEach(function (pair) {
            var row = el('div', 'dtm-app-property-row');
            row.append(el('span', 'dtm-app-property-label', pair[0] + ':'), el('span', '', String(pair[1])));
            info.appendChild(row);
          });
        } catch (error) { info.textContent = 'Could not read properties: ' + error.message; }
      }
      bar.appendChild(button('Browse…', show));
      show();
      return { dispose: function () {} };
    }
  });

  // ---- System information: real host data --------------------------------
  Apps.register({
    id: 'systeminfo',
    name: 'System Information',
    icon: 'ℹ️',
    width: 520,
    height: 380,
    capabilities: ['system'],
    mount: function (root, ctx) {
      var list = el('div', 'dtm-app-info');
      list.textContent = 'Reading system information…';
      root.appendChild(list);
      var disposed = false;
      (async function () {
        var backend = fs(ctx);
        var rows = [];
        try {
          var info = await ctx.DTM.system.getInfo();
          Object.keys(info || {}).forEach(function (key) {
            rows.push([key, typeof info[key] === 'object' ? JSON.stringify(info[key]) : String(info[key])]);
          });
        } catch (e) { rows.push(['System', 'Unavailable: ' + e.message]); }
        if (backend) {
          try {
            var drives = await backend.getDrives();
            rows.push(['Drives', Array.isArray(drives) ? drives.map(function (d) {
              return d.letter + ': (' + Math.round((d.freeBytes || 0) / 1e9) + ' GB free of ' + Math.round((d.totalBytes || 0) / 1e9) + ' GB)';
            }).join(', ') : '—']);
          } catch (e) { rows.push(['Drives', 'Unavailable']); }
          try {
            var folders = await backend.getSpecialFolders();
            Object.keys(folders || {}).forEach(function (key) { rows.push([key, folders[key]]); });
          } catch (e) {}
        }
        if (disposed) return;
        list.replaceChildren();
        rows.forEach(function (pair) {
          var row = el('div', 'dtm-app-property-row');
          row.append(el('span', 'dtm-app-property-label', pair[0] + ':'), el('span', '', pair[1]));
          list.appendChild(row);
        });
      })();
      return { dispose: function () { disposed = true; } };
    }
  });

  // ---- Image viewer: real binary read via DTM.fs --------------------------
  function fileUrl(path) {
    return 'file:///' + String(path).replace(/\\/g, '/').replace(/ /g, '%20');
  }

  // A data URL avoids blob: URLs, which are blocked by the skins' img-src CSP.
  function imageDataUrl(buffer, path) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    var ext = String(path).split('.').pop().toLowerCase();
    var mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' }[ext] || 'image/png';
    return 'data:' + mime + ';base64,' + btoa(binary);
  }

  Apps.register({
    id: 'imageviewer',
    name: 'Image Viewer',
    icon: '🖼️',
    width: 620,
    height: 460,
    capabilities: ['images', 'filesystem'],
    mount: function (root, ctx) {
      var backend = fs(ctx);
      var bar = toolbar();
      var stage = el('div', 'dtm-app-image-stage', 'No image open');
      root.append(bar, stage);
      async function open() {
        if (!backend) { stage.textContent = 'Filesystem unavailable'; return; }
        var target = await ctx.prompt('Open Image', 'Enter a path to an image file:');
        if (!target) return;
        try {
          var data = await backend.readBinary(target);
          stage.replaceChildren();
          var img = el('img', 'dtm-app-image');
          img.src = imageDataUrl(data, target);
          img.alt = target;
          stage.appendChild(img);
        } catch (error) { stage.textContent = 'Could not open image: ' + error.message; }
      }
      bar.appendChild(button('Open…', open));
      return { dispose: function () {} };
    }
  });

  // ---- Paint: draw and save a real PNG ------------------------------------
  Apps.register({
    id: 'paint',
    name: 'Paint',
    icon: '🎨',
    width: 640,
    height: 480,
    capabilities: ['images', 'filesystem'],
    mount: function (root, ctx) {
      var backend = fs(ctx);
      var bar = toolbar();
      var color = el('input', 'dtm-app-color');
      color.type = 'color';
      color.value = '#000000';
      var width = el('select', 'dtm-app-select');
      [2, 4, 8, 16].forEach(function (size) {
        var option = el('option', '', size + ' px');
        option.value = String(size);
        width.appendChild(option);
      });
      var canvas = el('canvas', 'dtm-app-canvas');
      canvas.width = 560;
      canvas.height = 320;
      var foot = el('div', 'dtm-app-status');
      root.append(bar, canvas, foot);
      var paint = false;
      var dirty = false;
      status(foot, 'Ready');
      function point(event) {
        var rect = canvas.getBoundingClientRect();
        return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
      }
      canvas.addEventListener('pointerdown', function (event) {
        paint = true;
        var ctx2d = canvas.getContext('2d');
        var p = point(event);
        ctx2d.beginPath();
        ctx2d.moveTo(p.x, p.y);
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', function (event) {
        if (!paint) return;
        var p = point(event);
        var ctx2d = canvas.getContext('2d');
        ctx2d.strokeStyle = color.value;
        ctx2d.lineWidth = Number(width.value);
        ctx2d.lineCap = 'round';
        ctx2d.lineTo(p.x, p.y);
        ctx2d.stroke();
        dirty = true;
      });
      ['pointerup', 'pointercancel'].forEach(function (type) {
        canvas.addEventListener(type, function () { paint = false; });
      });
      bar.append(
        color,
        width,
        button('Clear', function () {
          var ctx2d = canvas.getContext('2d');
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
          dirty = true;
        }),
        button('Save PNG…', async function () {
          if (!backend) { status(foot, 'Filesystem unavailable'); return; }
          var target = await ctx.prompt('Save Image', 'Enter a .png file path:', 'Drawing.png');
          if (!target) return;
          try {
            var dataUrl = canvas.toDataURL('image/png');
            var binary = atob(dataUrl.split(',')[1]);
            var bytes = new Uint8Array(binary.length);
            for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            await backend.writeBinary(target, bytes);
            dirty = false;
            status(foot, 'Saved ' + target);
          } catch (error) { status(foot, 'Save failed: ' + error.message); }
        })
      );
      async function canDiscard() {
        if (!dirty) return true;
        var choice = await ctx.confirmDirty('Save this drawing?');
        if (choice === 'cancel' || choice === null) return false;
        if (choice === 'discard') return true;
        // Save: reuse the toolbar action, then only discard if it succeeded.
        var saveButton = Array.from(bar.querySelectorAll('.dtm-app-button')).find(function (b) { return b.textContent === 'Save PNG…'; });
        if (saveButton) saveButton.click();
        await new Promise(function (r) { setTimeout(r, 600); });
        return !dirty;
      }
      return { beforeClose: canDiscard, dispose: function () {} };
    }
  });

  // ---- Clock & calendar ---------------------------------------------------
  Apps.register({
    id: 'calendar',
    name: 'Clock & Calendar',
    icon: '📅',
    width: 420,
    height: 380,
    capabilities: ['clock'],
    mount: function (root) {
      var clock = el('div', 'dtm-app-clock');
      var grid = el('div', 'dtm-app-calendar');
      root.append(clock, grid);
      var timer = 0;
      function render() {
        var now = new Date();
        clock.textContent = now.toLocaleTimeString() + '\n' + now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        grid.replaceChildren();
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (day) {
          grid.appendChild(el('div', 'dtm-app-calendar-head', day));
        });
        for (var i = 0; i < new Date(now.getFullYear(), now.getMonth(), 1).getDay(); i++) grid.appendChild(el('div', ''));
        var days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        for (var d = 1; d <= days; d++) {
          var cell = el('div', d === now.getDate() ? 'dtm-app-calendar-day today' : 'dtm-app-calendar-day', String(d));
          grid.appendChild(cell);
        }
      }
      render();
      timer = window.setInterval(render, 1000);
      return { dispose: function () { window.clearInterval(timer); } };
    }
  });

  // ---- Media player: native picker + real media element ------------------
  Apps.register({
    id: 'mediaplayer',
    name: 'Media Player',
    icon: '🎬',
    width: 560,
    height: 420,
    capabilities: ['media', 'filesystem'],
    mount: function (root, ctx) {
      var backend = fs(ctx);
      // The era player (playlist, shuffle, repeat) when the skin loads it.
      if (window.DTMMediaPlayer) {
        var themeHost = root.closest ? root.closest('[data-dtm-theme]') : null;
        var player = window.DTMMediaPlayer.mount(root, {
          theme: (themeHost && themeHost.dataset.dtmTheme) || 'win98',
          pick: function () { return backend && backend.pickMedia ? backend.pickMedia() : null; },
          pickMany: function () { return backend && backend.pickMediaMany ? backend.pickMediaMany() : Promise.resolve([]); }
        });
        return { dispose: function () { player.dispose(); } };
      }
      var bar = toolbar();
      var stage = el('div', 'dtm-app-media-stage', 'No media loaded');
      root.append(bar, stage);
      async function open() {
        if (!backend) { stage.textContent = 'Filesystem unavailable'; return; }
        try {
          var picked = backend.pickMedia ? await backend.pickMedia() : null;
          var target = picked && picked.path;
          if (!target) target = await ctx.prompt('Open Media', 'Enter a path to an audio or video file:');
          if (!target) return;
          var url = picked && picked.url ? picked.url : fileUrl(target);
          var tag = /\.(mp4|mkv|avi|webm|mov)$/i.test(target) ? 'video' : 'audio';
          stage.replaceChildren();
          var media = el(tag, 'dtm-app-media');
          media.src = url;
          media.controls = true;
          media.autoplay = false;
          stage.appendChild(media);
        } catch (error) { stage.textContent = 'Could not open media: ' + error.message; }
      }
      bar.appendChild(button('Open…', open));
      return {
        dispose: function () {
          var media = stage.querySelector('audio,video');
          if (media) { media.pause(); media.removeAttribute('src'); }
        }
      };
    }
  });
})();
