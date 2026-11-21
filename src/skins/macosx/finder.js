(() => {
  'use strict';
  const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : (window.DTM || null);
  const desktop = window;

  function findActiveFinder() {
    return document.querySelector('.window.active[data-app="finder"]');
  }
  function clickActive(selector) {
    const button = findActiveFinder()?.querySelector(selector);
    if (button) button.click();
  }
  function menuItems() {
    return {
      File: [
        { label: 'New Finder Window', shortcut: '⌘N', action: () => window.openApp('finder', { newWindow: true }) },
        { label: 'New Folder', shortcut: '⇧⌘N', action: () => clickActive('.new-folder') },
        '-',
        { label: 'Close Window', shortcut: '⌘W', action: () => window.closeActiveWindow() }
      ],
      Edit: [
        { label: 'Select All', shortcut: '⌘A', action: () => clickActive('.finder-content') },
        { label: 'Get Info', action: () => window.openApp('about') }
      ],
      View: [
        { label: 'as Icons', action: () => clickActive('[data-view="icon"]') },
        { label: 'as List', action: () => clickActive('[data-view="list"]') }
      ],
      Go: [
        { label: 'Home', shortcut: '⇧⌘H', action: () => clickActive('[data-path=""]') },
        { label: 'Computer', action: () => clickActive('[data-path=""]') }
      ],
      Window: [
        { label: 'Minimize', shortcut: '⌘M', action: () => findActiveFinder()?.querySelector('.t-min')?.click() },
        { label: 'Bring All to Front', action: () => document.querySelectorAll('.window').forEach((win) => { win.style.display = 'flex'; }) }
      ],
      Help: [{ label: 'Mac Help', action: () => window.openApp('help') }]
    };
  }

  function appBody() {
    return `
      <div class="finder">
        <div class="aqua-toolbar">
          <button class="aqua-btn gray finder-back" title="Back">◀</button>
          <button class="aqua-btn gray finder-forward" title="Forward">▶</button>
          <button class="aqua-btn gray finder-up" title="Enclosing Folder">↑</button>
          <span class="spacer"></span>
          <button class="view-btn active" data-view="icon" title="Icon View">▦</button>
          <button class="view-btn" data-view="list" title="List View">☷</button>
          <button class="aqua-btn gray new-folder">New Folder</button>
          <input class="aqua-input finder-search" placeholder="Search" aria-label="Search this folder">
        </div>
        <div style="display:flex;flex:1;min-height:0">
          <aside class="finder-sidebar">
            <div class="sb-title">Places</div>
            <div class="sb-item selected" data-path=""><span class="sb-icon">🏠</span>Home</div>
            <div class="sb-item" data-path="Desktop"><span class="sb-icon">🖥️</span>Desktop</div>
            <div class="sb-item" data-path="Documents"><span class="sb-icon">📄</span>Documents</div>
            <div class="sb-item" data-path="Pictures"><span class="sb-icon">🖼️</span>Pictures</div>
            <div class="sb-title">Devices</div>
            <div class="sb-item" data-path=""><span class="sb-icon">💽</span>Macintosh HD</div>
          </aside>
          <main class="finder-main">
            <div class="finder-content"><div class="finder-grid"></div></div>
            <footer class="finder-statusbar"><span class="finder-path">Home</span><span class="spacer"></span><span class="finder-count">Loading…</span></footer>
          </main>
        </div>
      </div>`;
  }

  const SPECIAL_PLACES = ['Desktop', 'Documents', 'Pictures'];
  async function listPath(path) {
    if (!DTM || !DTM.system || !DTM.system.listDirectory) throw new Error('Finder cannot reach the file system.');
    let target = path;
    if (SPECIAL_PLACES.includes(path) && DTM.fs && DTM.fs.getSpecialFolders) {
      const folders = await DTM.fs.getSpecialFolders();
      target = folders[path.toLowerCase()] || folders['public' + path] || path;
    }
    return DTM.system.listDirectory(target);
  }

  function openItem(item, state, status) {
    if (item.isDirectory) {
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(item.path);
      state.historyIndex = state.history.length - 1;
      loadDirectory(state, item.path);
    } else if (DTM && DTM.system && DTM.system.openPath) {
      DTM.system.openPath(item.path).catch((error) => { status.textContent = error.message; });
    }
  }

  async function loadDirectory(state, path) {
    const { grid, pathLabel, countLabel, back, forward, up, search } = state;
    grid.replaceChildren();
    countLabel.textContent = 'Loading…';
    try {
      const result = await listPath(path);
      state.path = result.currentPath || path || '';
      state.parentPath = result.parentPath || null;
      pathLabel.textContent = state.path || 'Home';
      back.disabled = state.historyIndex <= 0;
      forward.disabled = state.historyIndex >= state.history.length - 1;
      up.disabled = !state.parentPath;
      const filter = search.value.trim().toLowerCase();
      const items = (result.items || []).filter((item) => !filter || item.name.toLowerCase().includes(filter));
      items.forEach((item) => {
        const node = document.createElement(state.view === 'list' ? 'div' : 'button');
        node.className = state.view === 'list' ? 'finder-icon finder-row' : 'finder-icon';
        if (state.view === 'list') node.innerHTML = '<span class="fi-img"></span><span class="fi-label"></span>';
        else node.innerHTML = '<span class="fi-img"></span><span class="fi-label"></span>';
        node.querySelector('.fi-img').textContent = item.isDirectory ? '📁' : '📄';
        node.querySelector('.fi-label').textContent = item.name;
        node.title = item.path;
        node.addEventListener('click', () => {
          grid.querySelectorAll('.finder-icon').forEach((icon) => icon.classList.toggle('selected', icon === node));
        });
        node.addEventListener('dblclick', () => openItem(item, state, countLabel));
        grid.appendChild(node);
      });
      countLabel.textContent = items.length + (items.length === 1 ? ' item' : ' items');
      state.refresh();
    } catch (error) {
      countLabel.textContent = error.message;
      pathLabel.textContent = 'Cannot open folder';
    }
  }

  function mountFinder(entry, options = {}) {
    const root = entry.body.querySelector('.finder');
    const grid = root.querySelector('.finder-grid');
    const pathLabel = root.querySelector('.finder-path');
    const countLabel = root.querySelector('.finder-count');
    const back = root.querySelector('.finder-back');
    const forward = root.querySelector('.finder-forward');
    const up = root.querySelector('.finder-up');
    const search = root.querySelector('.finder-search');
    const state = {
      path: options.path || '',
      parentPath: null,
      view: 'icon',
      history: [options.path || ''],
      historyIndex: 0,
      grid, pathLabel, countLabel, back, forward, up, search,
      refresh: () => {}
    };
    back.addEventListener('click', () => {
      if (state.historyIndex > 0) loadDirectory(state, state.history[--state.historyIndex]);
    });
    forward.addEventListener('click', () => {
      if (state.historyIndex + 1 < state.history.length) loadDirectory(state, state.history[++state.historyIndex]);
    });
    up.addEventListener('click', () => {
      if (state.parentPath) {
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(state.parentPath);
        state.historyIndex = state.history.length - 1;
        loadDirectory(state, state.parentPath);
      }
    });
    search.addEventListener('input', () => loadDirectory(state, state.path));
    root.querySelectorAll('.finder-sidebar .sb-item').forEach((item) => {
      item.addEventListener('click', () => {
        root.querySelectorAll('.finder-sidebar .sb-item').forEach((row) => row.classList.toggle('selected', row === item));
        state.history = [item.dataset.path || ''];
        state.historyIndex = 0;
        loadDirectory(state, item.dataset.path || '');
      });
    });
    root.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        state.view = button.dataset.view;
        root.querySelectorAll('[data-view]').forEach((view) => view.classList.toggle('active', view === button));
        grid.classList.toggle('list-view', state.view === 'list');
        loadDirectory(state, state.path);
      });
    });
    root.querySelector('.new-folder').addEventListener('click', async () => {
      const name = await window.hostPrompt('New Folder', 'Name this folder:', 'untitled folder');
      if (!name || !DTM || !DTM.fs) return;
      const separator = state.path.includes('/') ? '/' : '\\';
      const target = state.path ? state.path + separator + name : name;
      try {
        await DTM.fs.mkdir(target);
        loadDirectory(state, state.path);
      } catch (error) {
        countLabel.textContent = error.message;
      }
    });
    state.refresh = () => {};
    loadDirectory(state, state.path);
  }

  window.registerMacApp('finder', {
    name: 'Finder',
    title: 'Macintosh HD',
    icon: '💽',
    singleton: false,
    metal: true,
    width: 640,
    height: 440,
    body: appBody,
    mount: mountFinder,
    menus: menuItems()
  });
})();
