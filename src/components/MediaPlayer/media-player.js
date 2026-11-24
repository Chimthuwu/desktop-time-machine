/*
 * Desktop Time Machine — era media player (shared component).
 *
 * One playback engine with a playlist queue, shuffle and repeat. Each era gets
 * its own presentation through a theme name ('win98' looks like Windows Media
 * Player 6.4). Skins mount it into a root element:
 *
 *   DTMMediaPlayer.mount(root, { theme, pick, prompt })
 *
 * pick() resolves to { path, name, url } or null (the host's file picker).
 * The returned controller exposes add/play/pause/stop/next/prev and the
 * playlist state, which the test suite drives.
 */
(function () {
  'use strict';

  var STYLE_ID = 'dtm-mediaplayer-style';

  // Pure queue logic, kept separate so it can be tested directly.
  // state: { count, index, shuffle, repeat: 'off' | 'all' | 'one' }
  function nextIndex(state, random) {
    var count = state.count;
    if (!count) return -1;
    if (state.repeat === 'one' && state.index >= 0) return state.index;
    if (state.shuffle && count > 1) {
      var pick;
      do { pick = Math.floor((random || Math.random)() * count); } while (pick === state.index);
      return pick;
    }
    var next = state.index + 1;
    if (next < count) return next;
    return state.repeat === 'all' ? 0 : -1;
  }

  function prevIndex(state) {
    var count = state.count;
    if (!count) return -1;
    if (state.index > 0) return state.index - 1;
    return state.repeat === 'all' ? count - 1 : 0;
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var total = Math.floor(seconds);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // Win98 Windows Media Player 6.4 look. Only classes under .dtm-wmp are styled.
  var CSS = [
    '.dtm-wmp{font:11px Tahoma,Arial,sans-serif;color:#000;background:#c0c0c0;display:flex;flex-direction:column;height:100%;min-height:0;user-select:none}',
    '.dtm-wmp *{box-sizing:border-box}',
    '.dtm-wmp-menu{display:flex;gap:12px;padding:3px 6px;border-bottom:1px solid #808080}',
    '.dtm-wmp-main{display:flex;flex:1;min-height:0;gap:4px;padding:4px}',
    '.dtm-wmp-left{flex:1;display:flex;flex-direction:column;min-width:0}',
    '.dtm-wmp-screen{position:relative;flex:1;min-height:140px;background:#000;border:2px solid;border-color:#808080 #fff #fff #808080;display:flex;align-items:center;justify-content:center;overflow:hidden}',
    '.dtm-wmp-screen video{width:100%;height:100%;object-fit:contain;background:#000}',
    '.dtm-wmp-viz{position:absolute;inset:0;width:100%;height:100%}',
    '.dtm-wmp-title{position:absolute;left:8px;bottom:6px;color:#7fff7f;font:bold 12px "Courier New",monospace;text-shadow:0 0 4px #2f2}',
    '.dtm-wmp-status{display:flex;justify-content:space-between;padding:2px 4px;font:10px Tahoma,Arial;color:#000}',
    '.dtm-wmp-seek{width:100%;margin:2px 0}',
    '.dtm-wmp-transport{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin-top:3px}',
    '.dtm-wmp-btn{min-width:26px;height:22px;padding:0 6px;font:bold 11px Tahoma;background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;cursor:pointer}',
    '.dtm-wmp-btn:active,.dtm-wmp-btn.on{border-color:#404040 #fff #fff #404040;background:#b8b8b8}',
    '.dtm-wmp-time{white-space:nowrap;margin-left:auto;font:bold 12px "Courier New",monospace;background:#000;color:#7fff7f;padding:2px 6px;border:2px solid;border-color:#808080 #fff #fff #808080}',
    '.dtm-wmp-right{width:210px;display:flex;flex-direction:column;min-height:0;border:2px solid;border-color:#808080 #fff #fff #808080;background:#fff}',
    '.dtm-wmp-right-head{background:#000080;color:#fff;padding:2px 6px;font-weight:bold}',
    '.dtm-wmp-list{flex:1;overflow:auto;background:#fff;min-height:0}',
    '.dtm-wmp-item{padding:2px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:default}',
    '.dtm-wmp-item.current{background:#000080;color:#fff}',
    '.dtm-wmp-item.current::before{content:"\\25B6  "}',
    '.dtm-wmp-bottom{display:flex;gap:4px;padding:4px;border-top:1px solid #808080;flex-wrap:wrap}',
    '.dtm-wmp-vol{display:flex;align-items:center;gap:4px;margin-left:auto}'
  ].join('\n');

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(style);
  }

  function el(doc, tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function mount(root, options) {
    var opts = options || {};
    var doc = root.ownerDocument;
    ensureStyle(doc);

    var queue = [];
    var state = { index: -1, shuffle: false, repeat: 'off' };
    var stopped = true;

    var wrap = el(doc, 'div', 'dtm-wmp');
    wrap.dataset.theme = opts.theme || 'win98';
    var menu = el(doc, 'div', 'dtm-wmp-menu');
    var fileMenu = el(doc, 'div', 'dtm-wmp-filemenu');
    fileMenu.style.cssText = 'display:none;position:absolute;left:4px;top:20px;background:#c0c0c0;border:2px solid;border-color:#fff #404040 #404040 #fff;z-index:5;min-width:170px';
    function menuItem(label, handler) {
      var it = el(doc, 'div', 'dtm-wmp-menuitem', label);
      it.style.cssText = 'padding:3px 16px;cursor:default';
      it.addEventListener('click', function () { fileMenu.style.display = 'none'; handler(); });
      return it;
    }
    var fileLabel = el(doc, 'span', null, 'File');
    fileLabel.addEventListener('click', function (e) {
      e.stopPropagation();
      fileMenu.style.display = fileMenu.style.display === 'none' ? 'block' : 'none';
    });
    fileMenu.append(
      menuItem('Open… (replace playlist)…', function () { openFromPicker(true); }),
      menuItem('Add files…', function () { openFromPicker(false); }),
      menuItem('Clear playlist', function () { clearQueue(); }),
      menuItem('Exit', function () { stop(); })
    );
    menu.appendChild(fileLabel);
    ['View', 'Play', 'Favorites', 'Help'].forEach(function (label) { menu.appendChild(el(doc, 'span', null, label)); });

    var main = el(doc, 'div', 'dtm-wmp-main');
    var left = el(doc, 'div', 'dtm-wmp-left');
    var screen = el(doc, 'div', 'dtm-wmp-screen');
    var media = el(doc, 'video');
    media.preload = 'auto';
    media.volume = 1;
    media.muted = false;
    media.controls = false;
    var canvas = el(doc, 'canvas', 'dtm-wmp-viz');
    var title = el(doc, 'div', 'dtm-wmp-title', 'Windows Media Player');
    screen.append(media, canvas, title);

    var seek = el(doc, 'input', 'dtm-wmp-seek');
    seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.value = '0';
    var status = el(doc, 'div', 'dtm-wmp-status');
    var statusText = el(doc, 'span', null, 'Stopped');
    var counter = el(doc, 'span', null, '0 of 0');
    status.append(statusText, counter);

    function btn(label, title, handler) {
      var b = el(doc, 'button', 'dtm-wmp-btn', label);
      b.type = 'button';
      b.title = title;
      b.addEventListener('click', handler);
      return b;
    }
    var transport = el(doc, 'div', 'dtm-wmp-transport');
    var shuffleBtn = btn('Shuffle', 'Shuffle the queue', function () { state.shuffle = !state.shuffle; refreshToggles(); });
    var repeatBtn = btn('Repeat', 'Repeat: off, all or one', function () {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      refreshToggles();
    });
    var timeEl = el(doc, 'span', 'dtm-wmp-time', '0:00 / 0:00');
    transport.append(
      btn('|◀', 'Previous', function () { prev(); }),
      btn('▶', 'Play', function () { play(); }),
      btn('❙❙', 'Pause', function () { pause(); }),
      btn('■', 'Stop', function () { stop(); }),
      btn('▶|', 'Next', function () { next(); }),
      shuffleBtn, repeatBtn, timeEl
    );
    left.append(screen, seek, status, transport);

    var right = el(doc, 'div', 'dtm-wmp-right');
    right.appendChild(el(doc, 'div', 'dtm-wmp-right-head', 'Playlist'));
    var list = el(doc, 'div', 'dtm-wmp-list');
    right.appendChild(list);

    var bottom = el(doc, 'div', 'dtm-wmp-bottom');
    var volume = el(doc, 'input');
    volume.type = 'range'; volume.min = '0'; volume.max = '100'; volume.value = '100'; volume.title = 'Volume';
    var volWrap = el(doc, 'div', 'dtm-wmp-vol');
    volWrap.append(el(doc, 'span', null, 'Volume'), volume);
    bottom.append(
      btn('Add…', 'Add media files to the playlist', function () { openFromPicker(false); }),
      btn('Remove', 'Remove the selected track', function () { removeCurrent(); }),
      btn('Clear', 'Clear the playlist', function () { clearQueue(); }),
      volWrap
    );

    main.append(left, right);
    wrap.append(menu, fileMenu, main, bottom);
    wrap.style.position = 'relative';
    root.replaceChildren(wrap);
    // Exposed on the element so tests and the host can drive the player.
    wrap._controller = null;

    function refreshToggles() {
      shuffleBtn.classList.toggle('on', state.shuffle);
      repeatBtn.classList.toggle('on', state.repeat !== 'off');
      repeatBtn.textContent = state.repeat === 'one' ? 'Repeat 1' : 'Repeat';
    }

    function refreshList() {
      list.replaceChildren();
      queue.forEach(function (item, i) {
        var row = el(doc, 'div', 'dtm-wmp-item' + (i === state.index ? ' current' : ''), (i + 1) + '. ' + item.name);
        row.title = item.path || item.name;
        row.addEventListener('dblclick', function () { playAt(i); });
        row.addEventListener('click', function () { state.index = i; refreshList(); refreshCounter(); });
        list.appendChild(row);
      });
      refreshCounter();
    }

    function refreshCounter() {
      counter.textContent = (state.index >= 0 ? state.index + 1 : 0) + ' of ' + queue.length;
    }

    function setStatus(text) { statusText.textContent = text; }

    function playAt(index) {
      if (index < 0 || index >= queue.length) { stop(); return; }
      state.index = index;
      var item = queue[index];
      stopped = false;
      media.src = item.url;
      title.textContent = item.name;
      refreshList();
      setStatus('Loading…');
      media.play().catch(function () { setStatus('Ready'); });
    }

    function play() {
      if (!queue.length) return;
      if (state.index < 0) return playAt(0);
      if (!media.src) return playAt(state.index);
      stopped = false;
      media.play().catch(function () {});
    }

    function pause() { if (media.src) media.pause(); }

    function stop() {
      stopped = true;
      media.pause();
      try { media.currentTime = 0; } catch (e) {}
      setStatus('Stopped');
      timeEl.textContent = '0:00 / ' + formatTime(media.duration);
      seek.value = '0';
    }

    function next() { playAt(nextIndex({ count: queue.length, index: state.index, shuffle: state.shuffle, repeat: state.repeat })); }

    function prev() {
      if (media.currentTime > 3) { try { media.currentTime = 0; } catch (e) {} return; }
      playAt(prevIndex({ count: queue.length, index: state.index, repeat: state.repeat }));
    }

    function addItems(items) {
      var wasEmpty = queue.length === 0;
      items.forEach(function (item) { if (item && item.url) queue.push(item); });
      refreshList();
      if (wasEmpty && queue.length) { state.index = 0; refreshList(); }
    }

    function removeCurrent() {
      if (state.index < 0 || !queue.length) return;
      var removingPlaying = state.index === queue.indexOf(queue[state.index]) && !stopped;
      queue.splice(state.index, 1);
      if (!queue.length) { state.index = -1; media.pause(); media.removeAttribute('src'); title.textContent = 'Windows Media Player'; setStatus('Stopped'); }
      else if (state.index >= queue.length) state.index = queue.length - 1;
      if (removingPlaying && queue.length) playAt(state.index);
      refreshList();
    }

    function clearQueue() {
      queue = [];
      state.index = -1;
      media.pause();
      media.removeAttribute('src');
      title.textContent = 'Windows Media Player';
      setStatus('Stopped');
      refreshList();
    }

    // Open… replaces the playlist, Add… appends. Both take many files at once.
    async function openFromPicker(replace) {
      try {
        var picked = opts.pickMany ? await opts.pickMany() : (opts.pick ? [await opts.pick()] : []);
        var items = (picked || []).filter(function (p) { return p && p.url; }).map(function (p) {
          return { name: p.name || p.path, path: p.path, url: p.url };
        });
        if (!items.length) return;
        if (replace) clearQueue();
        addItems(items);
        playAt(queue.length - items.length);
      } catch (e) {
        setStatus('Could not open: ' + (e && e.message ? e.message : e));
      }
    }
    root.addEventListener('click', function () { fileMenu.style.display = 'none'; });

    media.addEventListener('playing', function () { setStatus('Playing'); });
    media.addEventListener('pause', function () { if (!media.ended && media.src) setStatus(stopped ? 'Stopped' : 'Paused'); });
    media.addEventListener('waiting', function () { setStatus('Buffering…'); });
    media.addEventListener('ended', function () {
      var upcoming = nextIndex({ count: queue.length, index: state.index, shuffle: state.shuffle, repeat: state.repeat });
      if (upcoming < 0) { stopped = true; setStatus('Stopped'); timeEl.textContent = '0:00 / ' + formatTime(media.duration); seek.value = '0'; return; }
      playAt(upcoming);
    });
    media.addEventListener('error', function () {
      setStatus('Cannot play this file');
      var upcoming = nextIndex({ count: queue.length, index: state.index, shuffle: state.shuffle, repeat: state.repeat });
      if (upcoming >= 0 && upcoming !== state.index) setTimeout(function () { playAt(upcoming); }, 600);
    });
    media.addEventListener('timeupdate', function () {
      timeEl.textContent = formatTime(media.currentTime) + ' / ' + formatTime(media.duration);
      if (isFinite(media.duration) && media.duration > 0) seek.value = String(Math.round(media.currentTime / media.duration * 1000));
    });
    seek.addEventListener('input', function () {
      if (isFinite(media.duration)) media.currentTime = Number(seek.value) / 1000 * media.duration;
    });
    volume.addEventListener('input', function () { media.volume = Number(volume.value) / 100; });

    refreshToggles();
    refreshList();

    var controller = {
      add: addItems,
      play: play,
      pause: pause,
      stop: stop,
      next: next,
      prev: prev,
      playAt: playAt,
      clear: clearQueue,
      setShuffle: function (on) { state.shuffle = !!on; refreshToggles(); },
      setRepeat: function (mode) { state.repeat = mode; refreshToggles(); },
      state: function () { return { count: queue.length, index: state.index, shuffle: state.shuffle, repeat: state.repeat, playing: !media.paused && !stopped, src: media.src }; },
      media: media,
      dispose: function () {
        media.pause();
        media.removeAttribute('src');
        try { media.load(); } catch (e) {}
      }
    };
    wrap._controller = controller;
    return controller;
  }

  window.DTMMediaPlayer = {
    mount: mount,
    nextIndex: nextIndex,
    prevIndex: prevIndex,
    formatTime: formatTime
  };
})();
