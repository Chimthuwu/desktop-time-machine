(() => {
  'use strict';
  const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : (window.DTM || null);

  function launchBrowser(url = 'https://www.apple.com/') {
    if (window.parent) {
      window.parent.postMessage({ type: 'dtm:launch-webapp', app: 'browser', url }, '*');
    } else if (DTM && DTM.system && DTM.system.openExternalUrl) {
      DTM.system.openExternalUrl(url);
    }
  }

  function activeWindow(appId) {
    return document.querySelector('.window.active[data-app="' + appId + '"]');
  }

  function simpleTextBody() {
    return `
      <div class="app-fill">
        <div class="textedit-toolbar">
          <button class="aqua-btn gray st-open">Open…</button>
          <button class="aqua-btn gray st-save">Save</button>
          <span class="spacer"></span>
          <select class="aqua-select st-font"><option>Times New Roman</option><option>Helvetica</option><option>Courier New</option></select>
          <button class="format-btn" data-format="bold"><b>B</b></button>
          <button class="format-btn" data-format="italic"><i>I</i></button>
        </div>
        <textarea class="textedit-area" spellcheck="false" aria-label="SimpleText document"></textarea>
        <div class="textedit-status">Untitled</div>
      </div>`;
  }

  function mountSimpleText(entry, options = {}) {
    const area = entry.body.querySelector('.textedit-area');
    const status = entry.body.querySelector('.textedit-status');
    const font = entry.body.querySelector('.st-font');
    const save = entry.body.querySelector('.st-save');
    const open = entry.body.querySelector('.st-open');
    const doc = { path: options.path || null, dirty: false };
    if (options.text) area.value = options.text;
    if (doc.path) status.textContent = doc.path;
    area.addEventListener('input', () => {
      doc.dirty = true;
      status.textContent = (doc.path || 'Untitled') + ' — Edited';
    });
    font.addEventListener('change', () => { area.style.fontFamily = font.value; area.focus(); });
    entry.body.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => {
      const start = area.selectionStart, end = area.selectionEnd;
      if (button.dataset.format === 'bold') area.style.fontWeight = area.style.fontWeight === 'bold' ? 'normal' : 'bold';
      else area.style.fontStyle = area.style.fontStyle === 'italic' ? 'normal' : 'italic';
      area.setSelectionRange(start, end);
      area.focus();
      button.classList.toggle('active');
    }));
    async function saveDocument(saveAs = false) {
      if (!DTM || !DTM.fs) { status.textContent = 'File system unavailable'; return; }
      let target = doc.path;
      if (saveAs || !target) target = await window.hostPrompt('Save SimpleText Document', 'Save to a full file path:', target || 'Untitled.txt');
      if (!target) return;
      try {
        await DTM.fs.write(target, area.value);
        doc.path = target;
        doc.dirty = false;
        status.textContent = target;
      } catch (error) { status.textContent = error.message; }
    }
    save.addEventListener('click', () => saveDocument(!doc.path));
    open.addEventListener('click', async () => {
      const path = await window.hostPrompt('Open SimpleText Document', 'Enter a full file path:');
      if (!path || !DTM || !DTM.fs) return;
      try {
        area.value = await DTM.fs.read(path);
        doc.path = path;
        doc.dirty = false;
        status.textContent = path;
      } catch (error) { status.textContent = error.message; }
    });
    area.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDocument(!doc.path);
      }
    });
    entry.documentState = doc;
  }

  function calculatorBody() {
    return `
      <div class="calc-wrap">
        <div class="calc-display" aria-live="polite">0</div>
        <div class="calc-grid">
          <button class="calc-key clear">AC</button><button class="calc-key sign">±</button><button class="calc-key percent">%</button><button class="calc-key op" data-key="/">÷</button>
          <button class="calc-key" data-key="7">7</button><button class="calc-key" data-key="8">8</button><button class="calc-key" data-key="9">9</button><button class="calc-key op" data-key="*">×</button>
          <button class="calc-key" data-key="4">4</button><button class="calc-key" data-key="5">5</button><button class="calc-key" data-key="6">6</button><button class="calc-key op" data-key="-">−</button>
          <button class="calc-key" data-key="1">1</button><button class="calc-key" data-key="2">2</button><button class="calc-key" data-key="3">3</button><button class="calc-key op" data-key="+">+</button>
          <button class="calc-key wide" data-key="0">0</button><button class="calc-key decimal" data-key=".">.</button><button class="calc-key eq" data-key="=">=</button>
        </div>
      </div>`;
  }

  function mountCalculator(entry) {
    let display = '0', first = null, operation = null, replace = false;
    const output = entry.body.querySelector('.calc-display');
    function set(value) { display = String(value); output.textContent = display; }
    function input(key) {
      if (key === 'AC') { first = null; operation = null; replace = false; set('0'); return; }
      if (key === '±') { set(String(-Number(display))); return; }
      if (key === '%') { set(String(Number(display) / 100)); return; }
      if (['+', '-', '*', '/'].includes(key)) { first = Number(display); operation = key; replace = true; return; }
      if (key === '=') {
        if (operation === null || first === null) return;
        const second = Number(display);
        const value = operation === '+' ? first + second : operation === '-' ? first - second : operation === '*' ? first * second : (second === 0 ? 'Error' : first / second);
        set(value);
        operation = null;
        first = null;
        replace = true;
        return;
      }
      if (key === '.') {
        if (replace) { set('0.'); replace = false; }
        else if (!display.includes('.')) set(display + '.');
      } else {
        set(replace || display === '0' || display === 'Error' ? key : display + key);
        replace = false;
      }
    }
    entry.body.querySelectorAll('[data-key]').forEach((button) => button.addEventListener('click', () => input(button.dataset.key)));
    entry.body.querySelector('.clear').addEventListener('click', () => input('AC'));
    entry.body.querySelector('.sign').addEventListener('click', () => input('±'));
    entry.body.querySelector('.percent').addEventListener('click', () => input('%'));
    entry.body.addEventListener('keydown', (event) => {
      if (/^[0-9.+\-*/=]$/.test(event.key)) input(event.key);
      else if (event.key === 'Enter') input('=');
      else if (event.key === 'Escape') input('AC');
    });
  }

  function stickiesBody() {
    return '<div class="stickies-container"></div>';
  }

  function mountStickies(entry) {
    const container = entry.body.querySelector('.stickies-container');
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('macosx-stickies') || '[]'); } catch (error) {}
    if (!saved.length) saved = ['Buy more RAM.\n16MB is not enough!', 'Call Steve about the iMac launch.'];
    function persist() {
      try { localStorage.setItem('macosx-stickies', JSON.stringify([...container.querySelectorAll('textarea')].map((area) => area.value))); } catch (error) {}
    }
    saved.forEach((value) => {
      const note = document.createElement('div');
      note.className = 'sticky-note';
      const area = document.createElement('textarea');
      area.spellcheck = false;
      area.value = value;
      area.addEventListener('input', persist);
      note.appendChild(area);
      container.appendChild(note);
    });
    entry.addSticky = () => {
      const note = document.createElement('div');
      note.className = 'sticky-note';
      const area = document.createElement('textarea');
      area.placeholder = 'New note';
      area.addEventListener('input', persist);
      note.appendChild(area);
      container.appendChild(note);
      area.focus();
      persist();
    };
  }

  function safariBody() {
    return `
      <div class="safari-wrap">
        <div class="safari-toolbar">
          <button class="view-btn safari-back" title="Back">◀</button>
          <button class="view-btn safari-forward" title="Forward">▶</button>
          <button class="view-btn safari-reload" title="Reload">↻</button>
          <input class="safari-url" value="https://www.apple.com/" aria-label="Web address">
          <button class="aqua-btn safari-go">Go</button>
        </div>
        <div class="safari-bookmarks"><span data-url="https://www.apple.com/">Apple</span><span data-url="https://en.wikipedia.org/">Wikipedia</span><span data-url="https://archive.org/">Internet Archive</span></div>
        <div class="safari-start">
          <h1><span>Safari</span></h1>
          <div class="safari-search"><input placeholder="Search the web or enter an address"><button class="aqua-btn">Search</button></div>
          <p>Favorites</p>
          <button class="aqua-btn gray safari-launch">Open Page</button>
        </div>
      </div>`;
  }

  function mountSafari(entry) {
    const address = entry.body.querySelector('.safari-url');
    const search = entry.body.querySelector('.safari-search input');
    const go = (value) => {
      const text = String(value || address.value || '').trim();
      if (!text) return;
      const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : (/^[\w.-]+\.[a-z]{2,}/i.test(text) ? 'https://' + text : 'https://www.google.com/search?q=' + encodeURIComponent(text));
      address.value = url;
      launchBrowser(url);
    };
    entry.body.querySelector('.safari-go').addEventListener('click', () => go());
    entry.body.querySelector('.safari-launch').addEventListener('click', () => go(search.value || address.value));
    address.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(); });
    search.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(search.value); });
    entry.body.querySelectorAll('.safari-bookmarks span').forEach((bookmark) => bookmark.addEventListener('click', () => go(bookmark.dataset.url)));
  }

  function terminalBody() {
    return `
      <div class="app-fill">
        <div class="terminal-wrap">
          <div class="t-line t-dim">Mac OS X Version 10.3 (Build 7B85)</div>
          <div class="t-line">Welcome to Darwin!</div>
          <div class="t-line t-dim">Type help for available commands.</div>
          <div class="t-line terminal-output"></div>
          <form class="terminal-form"><span class="t-prompt">computer:~ user$ </span><input class="t-input" aria-label="Terminal command" autocomplete="off"></form>
        </div>
      </div>`;
  }

  function mountTerminal(entry) {
    const output = entry.body.querySelector('.terminal-output');
    const form = entry.body.querySelector('.terminal-form');
    const input = entry.body.querySelector('.t-input');
    const history = [];
    let historyIndex = 0;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const command = input.value.trim();
      input.value = '';
      if (!command) return;
      history.push(command);
      historyIndex = history.length;
      const line = document.createElement('div');
      line.className = 't-line';
      line.textContent = 'computer:~ user$ ' + command;
      output.appendChild(line);
      const result = document.createElement('div');
      result.className = 't-line';
      const [verb, ...args] = command.split(/\s+/);
      if (verb === 'help') result.textContent = 'help  ls  pwd  date  clear  open <path>';
      else if (verb === 'pwd') result.textContent = (await DTM?.fs?.list(''))?.path || 'Macintosh HD';
      else if (verb === 'date') result.textContent = new Date().toString();
      else if (verb === 'clear') output.replaceChildren();
      else if (verb === 'ls' || verb === 'dir') {
        try {
          const listing = await DTM.system.listDirectory(args.join(' ') || '');
          result.textContent = listing.items.map((item) => item.name + (item.isDirectory ? '/' : '')).join('\n') || '(empty)';
        } catch (error) { result.className += ' t-error'; result.textContent = error.message; }
      } else if (verb === 'open') {
        try { await DTM.system.openPath(args.join(' ')); } catch (error) { result.className += ' t-error'; result.textContent = error.message; }
      } else {
        result.className += ' t-error';
        result.textContent = 'command not found: ' + verb;
      }
      if (result.textContent) output.appendChild(result);
      output.scrollTop = output.scrollHeight;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp' && historyIndex > 0) input.value = history[--historyIndex];
      if (event.key === 'ArrowDown' && historyIndex < history.length) input.value = history[++historyIndex] || '';
    });
    window.setTimeout(() => input.focus(), 30);
  }

  function activityBody() {
    return `
      <div class="am-wrap">
        <div>CPU Usage</div><div class="am-graph"><canvas width="520" height="74"></canvas></div>
        <div class="am-stats"><span><b class="cpu-value">12%</b>CPU Usage</span><span><b>512 MB</b>Physical Memory</span><span><b>27</b>Processes</span></div>
        <table class="am-table"><thead><tr><th>Process Name</th><th>% CPU</th><th>Threads</th></tr></thead><tbody>
          <tr><td>Finder</td><td>2.1</td><td>8</td></tr><tr><td>WindowServer</td><td>1.4</td><td>5</td></tr><tr><td>Dock</td><td>0.8</td><td>3</td></tr>
        </tbody></table>
      </div>`;
  }

  function mountActivity(entry) {
    const canvas = entry.body.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let tick = 0;
    const draw = () => {
      if (!canvas.isConnected) return;
      const width = canvas.width, height = canvas.height;
      ctx.fillStyle = '#101010'; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#2dbd4d'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x < width; x += 4) {
        const y = height - 7 - Math.abs(Math.sin((x + tick) / 42) * 18 + Math.sin((x + tick) / 13) * 8);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      tick += 12;
    };
    draw();
    entry.timer = window.setInterval(draw, 750);
  }

  function aboutBody() {
    return `
      <div class="about-mac">
        <div class="apple-big">${document.getElementById('mb-apple').innerHTML}</div>
        <h2>Mac OS X</h2><p>Version 10.3.9</p><p>Built-in Memory: 512 MB</p>
        <p>Darwin Kernel Version 7.9.0</p>
        <button class="aqua-btn about-more">More Info…</button>
      </div>`;
  }

  function preferencesBody() {
    return `
      <div class="help-body">
        <h3>System Preferences</h3>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:10px">
          <button class="aqua-btn gray pref-wallpaper" data-wallpaper="aqua">Aqua</button>
          <button class="aqua-btn gray pref-wallpaper" data-wallpaper="graphite">Graphite</button>
          <button class="aqua-btn gray pref-wallpaper" data-wallpaper="blue">Blue</button>
        </div>
        <p>Choose a desktop appearance. Changes take effect immediately.</p>
      </div>`;
  }

  function mountPreferences(entry) {
    entry.body.querySelectorAll('[data-wallpaper]').forEach((button) => button.addEventListener('click', () => {
      const colors = { aqua: ['#7fb7f0', '#17457c'], graphite: ['#aaa', '#444'], blue: ['#397bd3', '#072a57'] };
      const pair = colors[button.dataset.wallpaper];
      document.getElementById('desktop').style.background = `radial-gradient(ellipse at 28% 18%,rgba(255,255,255,.30),transparent 55%),linear-gradient(135deg,${pair[0]},${pair[1]})`;
    }));
  }

  const simpleTextMenus = {
    File: [
      { label: 'New', shortcut: '⌘N', action: () => window.openApp('simpletext') },
      { label: 'Open…', shortcut: '⌘O', action: () => activeWindow('simpletext')?.querySelector('.st-open')?.click() },
      { label: 'Save', shortcut: '⌘S', action: () => activeWindow('simpletext')?.querySelector('.st-save')?.click() },
      '-',
      { label: 'Close Window', shortcut: '⌘W', action: () => window.closeActiveWindow() }
    ],
    Edit: [
      { label: 'Undo', shortcut: '⌘Z', action: () => document.execCommand('undo') },
      '-',
      { label: 'Cut', shortcut: '⌘X', action: () => document.execCommand('cut') },
      { label: 'Copy', shortcut: '⌘C', action: () => document.execCommand('copy') },
      { label: 'Paste', shortcut: '⌘V', action: () => document.execCommand('paste') },
      { label: 'Select All', shortcut: '⌘A', action: () => activeWindow('simpletext')?.querySelector('textarea')?.select() }
    ],
    Format: [{ label: 'Bold', action: () => activeWindow('simpletext')?.querySelector('[data-format="bold"]')?.click() }]
  };

  window.registerMacApp('simpletext', {
    name: 'SimpleText', title: 'Untitled — SimpleText', icon: '📝', width: 540, height: 390,
    body: simpleTextBody, mount: mountSimpleText, menus: simpleTextMenus
  });
  window.registerMacApp('calculator', {
    name: 'Calculator', title: 'Calculator', icon: '🔢', width: 300, height: 350,
    body: calculatorBody, mount: mountCalculator,
    menus: { View: [{ label: 'Basic', action: () => {} }], Help: [{ label: 'Calculator Help', action: () => window.openApp('help') }] }
  });
  window.registerMacApp('stickies', {
    name: 'Stickies', title: 'Stickies', icon: '🗒️', width: 420, height: 320,
    body: stickiesBody, mount: mountStickies,
    menus: { File: [{ label: 'New Note', action: () => activeWindow('stickies')?.addSticky?.() }], Edit: [{ label: 'Select All', action: () => activeWindow('stickies')?.querySelector('textarea')?.select() }] }
  });
  window.registerMacApp('trash', {
    name: 'Trash', title: 'Trash', icon: '🗑️', width: 420, height: 300,
    body: () => '<div class="help-body"><h3>Trash</h3><p>The Trash is empty.</p></div>',
    menus: { Finder: [{ label: 'Empty Trash…', action: () => window.openApp('trash') }] }
  });
  window.registerMacApp('safari', {
    name: 'Safari', title: 'Safari', icon: '🧭', width: 780, height: 540,
    body: safariBody, mount: mountSafari,
    menus: { File: [{ label: 'New Window', shortcut: '⌘N', action: () => window.openApp('safari', { newWindow: true }) }, { label: 'Close Window', shortcut: '⌘W', action: () => window.closeActiveWindow() }], View: [{ label: 'Reload Page', action: () => activeWindow('safari')?.querySelector('.safari-reload')?.click() }] }
  });
  window.registerMacApp('terminal', {
    name: 'Terminal', title: 'Terminal', icon: '⌨️', width: 620, height: 390,
    body: terminalBody, mount: mountTerminal,
    menus: { Shell: [{ label: 'New Window', shortcut: '⌘N', action: () => window.openApp('terminal') }, { label: 'Close Window', shortcut: '⌘W', action: () => window.closeActiveWindow() }] }
  });
  window.registerMacApp('activity', {
    name: 'Activity Monitor', title: 'Activity Monitor', icon: '📈', width: 620, height: 420,
    body: activityBody, mount: mountActivity, onClose: (entry) => window.clearInterval(entry.timer),
    menus: { View: [{ label: 'Update Frequency', action: () => {} }] }
  });
  window.registerMacApp('preferences', {
    name: 'System Preferences', title: 'System Preferences', icon: '⚙️', width: 480, height: 330,
    body: preferencesBody, mount: mountPreferences,
    menus: { View: [{ label: 'Show All Preferences', action: () => {} }] }
  });
  window.registerMacApp('about', {
    name: 'About This Mac', title: 'About This Mac', icon: '', width: 370, height: 330,
    body: aboutBody,
    mount: (entry) => entry.body.querySelector('.about-more').addEventListener('click', () => window.openApp('activity'))
  });
  window.registerMacApp('help', {
    name: 'Mac Help', title: 'Mac Help', icon: '❔', width: 480, height: 350,
    body: () => '<div class="help-body"><h3>Mac Help</h3><p>Use the Finder to browse your files, the Dock to open applications, and the Apple menu for system commands.</p><p>Press <kbd>F8</kbd> to switch eras.</p></div>',
    menus: { Help: [{ label: 'Mac Help', action: () => window.openApp('help') }] }
  });
  window.registerMacApp('preview', {
    name: 'Preview', title: 'Preview', icon: '🖼️', width: 600, height: 420,
    body: () => '<div class="preview-wrap"><div class="preview-stage"><div class="preview-empty">No document selected</div></div><div class="preview-info">Preview</div></div>',
    menus: { File: [{ label: 'Open…', action: () => window.hostPrompt('Open Preview', 'Enter a path to open:') }] }
  });
})();
