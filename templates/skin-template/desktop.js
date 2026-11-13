/**
 * Desktop Time Machine - Skin Template JavaScript Entry Point
 * 
 * This is a starting point for a new historical desktop environment.
 * Replace ALL of this with your OS's authentic behaviour.
 * 
 * IMPORTANT: 
 * - Do NOT access Node.js/Electron APIs directly
 * - Use the shared engine API via window.DTM.engine
 * - Implement cleanup() to dispose of all resources on skin unload
 * - Keep your code isolated — don't pollute the global namespace unnecessarily
 */

// ============================================================================
// SKIN NAMESPACE — Keep your skin's code isolated
// ============================================================================
const YourSkin = (() => {
  // ---------------------------------------------------------------------------
  // PRIVATE STATE
  // ---------------------------------------------------------------------------
  let engine = null;
  let skinManager = null;
  let cleanupFunctions = [];
  let windows = new Map();
  let windowIdCounter = 0;
  let clockInterval = null;
  let isInitialized = false;

  // DOM element references
  let elements = {
    desktop: null,
    desktopIcons: null,
    startButton: null,
    startMenu: null,
    startMenuItems: null,
    taskbarApps: null,
    clock: null,
    contextMenu: null,
    windowsLayer: null,
  };

  // ---------------------------------------------------------------------------
  // ENGINE API ACCESS — Use window.DTM.engine for shared functionality
  // ---------------------------------------------------------------------------
  function getEngine() {
    if (!engine) {
      engine = window.DTM?.engine;
    }
    return engine;
  }

  function getSkinManager() {
    if (!skinManager) {
      skinManager = window.DTM?.skins;
    }
    return skinManager;
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE: INITIALIZATION
  // ---------------------------------------------------------------------------
  async function init() {
    if (isInitialized) {
      console.warn('[YourSkin] Already initialized');
      return;
    }

    console.log('[YourSkin] Initializing...');

    // Cache DOM elements
    cacheElements();

    // Set up clock
    startClock();

    // Set up event listeners
    setupEventListeners();

    // Set up desktop icons
    setupDesktopIcons();

    // Set up start menu
    setupStartMenu();

    // Set up context menu
    setupContextMenu();

    // Load initial windows if any (restore from session)
    // await restoreSession();

    // Register cleanup with engine
    const eng = getEngine();
    if (eng && eng.onSkinUnload) {
      eng.onSkinUnload('your-skin-id', cleanup);
    }

    isInitialized = true;
    console.log('[YourSkin] Initialized successfully');
  }

  // ---------------------------------------------------------------------------
  // LIFECYCLE: CLEANUP — MUST be implemented and thorough
  // ---------------------------------------------------------------------------
  function cleanup() {
    console.log('[YourSkin] Cleaning up...');

    // Stop clock
    if (clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }

    // Close all windows
    windows.forEach((win, id) => {
      closeWindow(id);
    });
    windows.clear();

    // Remove all registered cleanup functions
    cleanupFunctions.forEach(fn => {
      try { fn(); } catch (e) { console.error('[YourSkin] Cleanup error:', e); }
    });
    cleanupFunctions = [];

    // Remove event listeners (if using AbortController pattern)
    // abortController?.abort();

    // Clear DOM references
    elements = {
      desktop: null,
      desktopIcons: null,
      startButton: null,
      startMenu: null,
      startMenuItems: null,
      taskbarApps: null,
      clock: null,
      contextMenu: null,
      windowsLayer: null,
    };

    isInitialized = false;
    console.log('[YourSkin] Cleanup complete');
  }

  // Register a cleanup function to be called on unload
  function registerCleanup(fn) {
    cleanupFunctions.push(fn);
  }

  // ---------------------------------------------------------------------------
  // DOM ELEMENT CACHING
  // ---------------------------------------------------------------------------
  function cacheElements() {
    elements.desktop = document.getElementById('desktop');
    elements.desktopIcons = document.getElementById('desktopIcons');
    elements.startButton = document.getElementById('startButton');
    elements.startMenu = document.getElementById('startMenu');
    elements.startMenuItems = document.getElementById('startMenuItems');
    elements.taskbarApps = document.getElementById('taskbarApps');
    elements.clock = document.getElementById('clock');
    elements.contextMenu = document.getElementById('contextMenu');
    elements.windowsLayer = document.getElementById('windowsLayer');
  }

  // ---------------------------------------------------------------------------
  // CLOCK
  // ---------------------------------------------------------------------------
  function startClock() {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
    registerCleanup(() => {
      if (clockInterval) clearInterval(clockInterval);
    });
  }

  function updateClock() {
    if (!elements.clock) return;
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    elements.clock.textContent = `${hours}:${minutes}`;
  }

  // ---------------------------------------------------------------------------
  // EVENT LISTENERS
  // ---------------------------------------------------------------------------
  function setupEventListeners() {
    // Global click to close menus
    document.addEventListener('click', handleGlobalClick);
    registerCleanup(() => document.removeEventListener('click', handleGlobalClick));

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);
    registerCleanup(() => document.removeEventListener('keydown', handleKeydown));

    // Desktop right-click for context menu
    elements.desktop?.addEventListener('contextmenu', handleDesktopContextMenu);
    registerCleanup(() => elements.desktop?.removeEventListener('contextmenu', handleDesktopContextMenu));

    // Start button
    elements.startButton?.addEventListener('click', toggleStartMenu);
    registerCleanup(() => elements.startButton?.removeEventListener('click', toggleStartMenu));

    // Window dragging delegation (on windows layer)
    elements.windowsLayer?.addEventListener('mousedown', handleWindowMouseDown);
    registerCleanup(() => elements.windowsLayer?.removeEventListener('mousedown', handleWindowMouseDown));
  }

  function handleGlobalClick(e) {
    // Close start menu if clicking outside
    if (elements.startMenu && !elements.startMenu.classList.contains('hidden')) {
      if (!elements.startButton.contains(e.target) && !elements.startMenu.contains(e.target)) {
        closeStartMenu();
      }
    }

    // Close context menu if clicking outside
    if (elements.contextMenu && !elements.contextMenu.classList.contains('hidden')) {
      if (!elements.contextMenu.contains(e.target)) {
        closeContextMenu();
      }
    }
  }

  function handleKeydown(e) {
    // Escape closes menus
    if (e.key === 'Escape') {
      closeStartMenu();
      closeContextMenu();
    }

    // F8 or Ctrl+Shift+T opens Era Switcher (handled by engine)
    // Don't intercept — let the engine handle it
  }

  // ---------------------------------------------------------------------------
  // DESKTOP ICONS
  // ---------------------------------------------------------------------------
  function setupDesktopIcons() {
    if (!elements.desktopIcons) return;

    elements.desktopIcons.querySelectorAll('.dtm-icon').forEach(icon => {
      icon.addEventListener('click', (e) => {
        // Clear other selections
        elements.desktopIcons.querySelectorAll('.dtm-icon').forEach(i => i.classList.remove('selected'));
        icon.classList.add('selected');

        const app = icon.dataset.app;
        if (app) launchApp(app);
      });

      icon.addEventListener('dblclick', (e) => {
        const app = icon.dataset.app;
        if (app) launchApp(app);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // START MENU / APPLICATION LAUNCHER
  // ---------------------------------------------------------------------------
  function setupStartMenu() {
    if (!elements.startMenuItems) return;

    elements.startMenuItems.querySelectorAll('[data-app]').forEach(item => {
      item.addEventListener('click', () => {
        const app = item.dataset.app;
        launchApp(app);
        closeStartMenu();
      });
    });

    elements.startMenuItems.querySelectorAll('[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        handleStartMenuAction(action);
        closeStartMenu();
      });
    });
  }

  function toggleStartMenu() {
    if (!elements.startMenu) return;
    const isHidden = elements.startMenu.classList.toggle('hidden');
    if (!isHidden) {
      elements.startButton.classList.add('pressed');
    } else {
      elements.startButton.classList.remove('pressed');
    }
  }

  function closeStartMenu() {
    if (elements.startMenu && !elements.startMenu.classList.contains('hidden')) {
      elements.startMenu.classList.add('hidden');
      elements.startButton?.classList.remove('pressed');
    }
  }

  function handleStartMenuAction(action) {
    switch (action) {
      case 'about':
        showAboutDialog();
        break;
      case 'switch':
        openEraSwitcher();
        break;
      default:
        console.warn('[YourSkin] Unknown start menu action:', action);
    }
  }

  function showAboutDialog() {
    createWindow({
      title: 'About This Environment',
      width: 400,
      height: 300,
      content: `
        <div style="padding: 20px; text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">🖥️</div>
          <h2 style="margin-bottom: 8px;">Your Skin Name</h2>
          <p style="color: var(--dtm-fg-secondary); margin-bottom: 16px;">Version 1.0.0</p>
          <p style="margin-bottom: 16px;">A recreation of the [Your OS] desktop experience.</p>
          <p style="font-size: 11px; color: var(--dtm-fg-muted);">Built for Desktop Time Machine</p>
          <button class="dtm-window-btn" style="margin-top: 20px; padding: 6px 20px;" onclick="this.closest('.dtm-window').querySelector('.dtm-window-btn.close').click()">OK</button>
        </div>
      `,
      resizable: false,
      maximizable: false,
    });
  }

  function openEraSwitcher() {
    const eng = getEngine();
    if (eng && eng.emit) {
      eng.emit('dtm:open-switcher');
    }
  }

  // ---------------------------------------------------------------------------
  // CONTEXT MENU
  // ---------------------------------------------------------------------------
  function setupContextMenu() {
    if (!elements.contextMenu) return;

    elements.contextMenu.querySelectorAll('[data-action]').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        handleContextAction(action);
        closeContextMenu();
      });
    });
  }

  function handleDesktopContextMenu(e) {
    e.preventDefault();
    if (!elements.contextMenu) return;

    // Position at cursor
    elements.contextMenu.style.left = `${e.clientX}px`;
    elements.contextMenu.style.top = `${e.clientY}px`;
    elements.contextMenu.classList.remove('hidden');

    // Ensure menu stays on screen
    requestAnimationFrame(() => {
      const rect = elements.contextMenu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        elements.contextMenu.style.left = `${window.innerWidth - rect.width - 4}px`;
      }
      if (rect.bottom > window.innerHeight) {
        elements.contextMenu.style.top = `${window.innerHeight - rect.height - 4}px`;
      }
    });
  }

  function closeContextMenu() {
    if (elements.contextMenu && !elements.contextMenu.classList.contains('hidden')) {
      elements.contextMenu.classList.add('hidden');
    }
  }

  function handleContextAction(action) {
    switch (action) {
      case 'new-folder':
        console.log('[YourSkin] New folder');
        break;
      case 'new-file':
        console.log('[YourSkin] New file');
        break;
      case 'refresh':
        console.log('[YourSkin] Refresh desktop');
        break;
      case 'properties':
        showPropertiesDialog();
        break;
      default:
        console.warn('[YourSkin] Unknown context action:', action);
    }
  }

  function showPropertiesDialog() {
    createWindow({
      title: 'Properties',
      width: 360,
      height: 280,
      content: `
        <div style="padding: 20px;">
          <h3 style="margin-bottom: 16px;">Desktop Properties</h3>
          <div style="font-size: 12px; color: var(--dtm-fg-secondary); line-height: 1.8;">
            <p><strong>Environment:</strong> Your Skin Name</p>
            <p><strong>Version:</strong> 1.0.0</p>
            <p><strong>Engine:</strong> Desktop Time Machine 1.0</p>
            <p><strong>Desktop Icons:</strong> 3</p>
            <p><strong>Open Windows:</strong> ${windows.size}</p>
          </div>
          <button class="dtm-window-btn" style="margin-top: 20px; padding: 6px 20px; float: right;" onclick="this.closest('.dtm-window').querySelector('.dtm-window-btn.close').click()">OK</button>
        </div>
      `,
      resizable: false,
      maximizable: false,
    });
  }

  // ---------------------------------------------------------------------------
  // WINDOW MANAGEMENT — Use shared engine where possible, extend for your OS
  // ---------------------------------------------------------------------------
  function createWindow(options = {}) {
    const {
      title = 'Window',
      width = 480,
      height = 320,
      x = 50 + windows.size * 20,
      y = 50 + windows.size * 20,
      content = '',
      resizable = true,
      maximizable = true,
      minimizable = true,
      closable = true,
      icon = '📄',
      onClose = null,
    } = options;

    const id = `win-${++windowIdCounter}`;
    const zIndex = var_z_windows_base + windows.size;

    // Create window element
    const winEl = document.createElement('div');
    winEl.className = 'dtm-window';
    winEl.id = id;
    winEl.style.width = `${width}px`;
    winEl.style.height = `${height}px`;
    winEl.style.left = `${x}px`;
    winEl.style.top = `${y}px`;
    winEl.style.zIndex = zIndex;
    winEl.dataset.windowId = id;

    // Build window chrome (customise for your OS!)
    const controlsHtml = `
      ${minimizable ? '<button class="dtm-window-btn minimize" title="Minimize">_</button>' : ''}
      ${maximizable ? '<button class="dtm-window-btn maximize" title="Maximize">□</button>' : ''}
      ${closable ? '<button class="dtm-window-btn close" title="Close">×</button>' : ''}
    `;

    winEl.innerHTML = `
      <div class="dtm-window-titlebar">
        <span class="dtm-window-icon">${icon}</span>
        <span class="dtm-window-title">${escapeHtml(title)}</span>
        <div class="dtm-window-controls">${controlsHtml}</div>
      </div>
      <div class="dtm-window-content">${content}</div>
      <div class="dtm-window-statusbar">Ready</div>
    `;

    // Add to DOM
    elements.windowsLayer.appendChild(winEl);

    // Track window state
    const winState = {
      id,
      element: winEl,
      x, y, width, height,
      maximized: false,
      minimized: false,
      prevBounds: null,
      onClose,
    };
    windows.set(id, winState);

    // Set up window event listeners
    setupWindowEvents(winState);

    // Focus this window
    focusWindow(id);

    return id;
  }

  // Base z-index for windows (CSS custom property not accessible in JS easily)
  const var_z_windows_base = 100;

  function setupWindowEvents(winState) {
    const { element, id } = winState;
    const titlebar = element.querySelector('.dtm-window-titlebar');
    const closeBtn = element.querySelector('.dtm-window-btn.close');
    const maximizeBtn = element.querySelector('.dtm-window-btn.maximize');
    const minimizeBtn = element.querySelector('.dtm-window-btn.minimize');

    // Titlebar drag to move
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    const onMouseDown = (e) => {
      if (e.target.closest('.dtm-window-btn')) return;
      if (winState.maximized) return;

      isDragging = true;
      dragOffset.x = e.clientX - winState.x;
      dragOffset.y = e.clientY - winState.y;
      focusWindow(id);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      winState.x = e.clientX - dragOffset.x;
      winState.y = e.clientY - dragOffset.y;
      constrainWindowPosition(winState);
      element.style.left = `${winState.x}px`;
      element.style.top = `${winState.y}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    titlebar.addEventListener('mousedown', onMouseDown);
    registerCleanup(() => titlebar.removeEventListener('mousedown', onMouseDown));

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeWindow(id));
    }

    // Maximize button
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', () => toggleMaximize(id));
    }

    // Minimize button
    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => minimizeWindow(id));
    }

    // Focus on mousedown anywhere in window
    element.addEventListener('mousedown', () => focusWindow(id));
    registerCleanup(() => element.removeEventListener('mousedown', () => focusWindow(id)));

    // Double-click titlebar to maximize
    titlebar.addEventListener('dblclick', () => {
      if (maximizeBtn) toggleMaximize(id);
    });
  }

  function constrainWindowPosition(winState) {
    const minX = 0;
    const minY = 0;
    const maxX = window.innerWidth - Math.min(winState.width, 200);
    const maxY = window.innerHeight - Math.min(winState.height, 100) - 32; // Account for taskbar

    winState.x = Math.max(minX, Math.min(maxX, winState.x));
    winState.y = Math.max(minY, Math.min(maxY, winState.y));
  }

  function focusWindow(id) {
    const winState = windows.get(id);
    if (!winState) return;

    // Remove active from all
    windows.forEach((w, wId) => {
      w.element.classList.remove('active');
      w.element.classList.add('inactive');
      w.element.style.zIndex = var_z_windows_base + Array.from(windows.keys()).indexOf(wId);
    });

    // Add active to this
    winState.element.classList.add('active');
    winState.element.classList.remove('inactive');
    winState.element.style.zIndex = var_z_windows_base + windows.size + 10;

    // Update taskbar button
    updateTaskbarButtons();
  }

  function closeWindow(id) {
    const winState = windows.get(id);
    if (!winState) return;

    // Call custom onClose
    if (winState.onClose) {
      try { winState.onClose(); } catch (e) { console.error('[YourSkin] onClose error:', e); }
    }

    // Remove from DOM
    winState.element.remove();
    windows.delete(id);

    // Update taskbar
    updateTaskbarButtons();

    // Focus next window
    const remaining = Array.from(windows.keys());
    if (remaining.length > 0) {
      focusWindow(remaining[remaining.length - 1]);
    }
  }

  function toggleMaximize(id) {
    const winState = windows.get(id);
    if (!winState) return;

    if (winState.maximized) {
      // Restore
      winState.element.style.left = `${winState.prevBounds.x}px`;
      winState.element.style.top = `${winState.prevBounds.y}px`;
      winState.element.style.width = `${winState.prevBounds.width}px`;
      winState.element.style.height = `${winState.prevBounds.height}px`;
      winState.maximized = false;
    } else {
      // Maximize
      winState.prevBounds = {
        x: winState.x,
        y: winState.y,
        width: winState.width,
        height: winState.height,
      };
      winState.x = 0;
      winState.y = 0;
      winState.width = window.innerWidth;
      winState.height = window.innerHeight - 32; // Account for taskbar
      winState.element.style.left = '0px';
      winState.element.style.top = '0px';
      winState.element.style.width = `${winState.width}px`;
      winState.element.style.height = `${winState.height}px`;
      winState.maximized = true;
    }
  }

  function minimizeWindow(id) {
    const winState = windows.get(id);
    if (!winState) return;

    winState.minimized = true;
    winState.element.style.display = 'none';
    updateTaskbarButtons();
  }

  function restoreWindow(id) {
    const winState = windows.get(id);
    if (!winState) return;

    winState.minimized = false;
    winState.element.style.display = 'flex';
    focusWindow(id);
    updateTaskbarButtons();
  }

  // ---------------------------------------------------------------------------
  // TASKBAR BUTTONS
  // ---------------------------------------------------------------------------
  function updateTaskbarButtons() {
    if (!elements.taskbarApps) return;

    elements.taskbarApps.innerHTML = '';

    windows.forEach((winState, id) => {
      if (winState.minimized) return; // Don't show minimized in taskbar? Or show differently

      const btn = document.createElement('button');
      btn.className = `dtm-taskbar-btn ${winState.element.classList.contains('active') ? 'active' : ''}`;
      btn.dataset.windowId = id;
      btn.textContent = winState.element.querySelector('.dtm-window-title')?.textContent || 'Window';

      btn.addEventListener('click', () => {
        if (winState.minimized) {
          restoreWindow(id);
        } else if (winState.element.classList.contains('active')) {
          minimizeWindow(id);
        } else {
          focusWindow(id);
        }
      });

      elements.taskbarApps.appendChild(btn);
    });
  }

  // ---------------------------------------------------------------------------
  // APPLICATION LAUNCHER
  // ---------------------------------------------------------------------------
  function launchApp(appName) {
    switch (appName) {
      case 'welcome':
        createWindow({
          title: 'Welcome',
          width: 480,
          height: 360,
          icon: '📄',
          content: `
            <div style="padding: 20px; text-align: center;">
              <div style="font-size: 64px; margin-bottom: 16px;">🎉</div>
              <h2 style="margin-bottom: 12px;">Welcome to Your Skin Name!</h2>
              <p style="color: var(--dtm-fg-secondary); margin-bottom: 20px; line-height: 1.6;">
                This is a template for creating a new historical desktop environment
                for Desktop Time Machine.
              </p>
              <div style="text-align: left; font-size: 12px; color: var(--dtm-fg-muted); line-height: 1.8;">
                <p><strong>Next steps:</strong></p>
                <p>1. Replace this template with your OS's authentic UI</p>
                <p>2. Customize the CSS design tokens in desktop.css</p>
                <p>3. Implement your OS's unique window chrome</p>
                <p>4. Add your OS's authentic applications</p>
                <p>5. Hook up the shared engine APIs for filesystem, etc.</p>
              </div>
            </div>
          `,
        });
        break;

      case 'explorer':
        createWindow({
          title: 'File Explorer',
          width: 640,
          height: 480,
          icon: '📁',
          content: `
            <div style="padding: 12px;">
              <div style="display: flex; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--dtm-border-mid);">
                <button class="dtm-toolbar-btn" style="padding: 4px 8px; background: var(--dtm-bg-secondary); border: 1px solid var(--dtm-border-mid); cursor: pointer;">⬆ Up</button>
                <button class="dtm-toolbar-btn" style="padding: 4px 8px; background: var(--dtm-bg-secondary); border: 1px solid var(--dtm-border-mid); cursor: pointer;">🏠 Home</button>
                <button class="dtm-toolbar-btn" style="padding: 4px 8px; background: var(--dtm-bg-secondary); border: 1px solid var(--dtm-border-mid); cursor: pointer;">🔄 Refresh</button>
              </div>
              <div style="font-family: var(--dtm-font-mono); font-size: 12px; color: var(--dtm-fg-secondary); margin-bottom: 12px;">
                📂 Desktop / Your Skin
              </div>
              <div id="fileList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
                <!-- Files loaded via engine API -->
              </div>
            </div>
          `,
          onClose: () => console.log('[YourSkin] Explorer closed'),
        });
        // Load file listing via engine
        loadFileListing('explorer');
        break;

      case 'settings':
        createWindow({
          title: 'Settings',
          width: 500,
          height: 400,
          icon: '⚙️',
          content: `
            <div style="padding: 20px;">
              <h3 style="margin-bottom: 20px;">Settings</h3>
              <div style="display: flex; flex-direction: column; gap: 16px;">
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span>Show desktop icons</span>
                </label>
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                  <input type="checkbox" checked style="width: 16px; height: 16px;">
                  <span>Single-click to open</span>
                </label>
                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                  <input type="checkbox" style="width: 16px; height: 16px;">
                  <span>Auto-arrange icons</span>
                </label>
                <hr style="border: none; border-top: 1px solid var(--dtm-border-mid);">
                <div>
                  <label style="display: block; margin-bottom: 8px;">Theme Color</label>
                  <input type="color" value="#008080" style="width: 60px; height: 30px; border: 1px solid var(--dtm-border-mid); background: var(--dtm-bg-primary); cursor: pointer;">
                </div>
              </div>
            </div>
          `,
        });
        break;

      default:
        console.warn('[YourSkin] Unknown app:', appName);
    }
  }

  async function loadFileListing(windowType) {
    const eng = getEngine();
    if (!eng || !eng.fs) {
      console.warn('[YourSkin] Filesystem API not available');
      return;
    }

    try {
      // This would use the shared engine's filesystem API
      // const files = await eng.fs.list('/home/user/Desktop');
      // Render files...
      console.log('[YourSkin] File listing would be loaded via engine.fs.list()');
    } catch (e) {
      console.error('[YourSkin] Failed to load file listing:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // WINDOW MOUSE DOWN HANDLER (delegation)
  // ---------------------------------------------------------------------------
  function handleWindowMouseDown(e) {
    const winEl = e.target.closest('.dtm-window');
    if (winEl) {
      const id = winEl.dataset.windowId;
      focusWindow(id);
    }
  }

  // ---------------------------------------------------------------------------
  // UTILITY
  // ---------------------------------------------------------------------------
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------
  return {
    init,
    cleanup,
    launchApp,
    createWindow,
    getEngine,
    getSkinManager,
  };
})();

// ============================================================================
// BOOTSTRAP — Initialize when DOM is ready
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Small delay to ensure engine is ready
  setTimeout(() => YourSkin.init(), 100);
});

// ============================================================================
// HOT RELOAD SUPPORT (development)
// ============================================================================
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    YourSkin.cleanup();
  });
}

// Export for debugging
window.YourSkin = YourSkin;