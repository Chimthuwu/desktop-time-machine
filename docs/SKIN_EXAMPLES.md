# Desktop Time Machine — Skin Implementation Examples

**Version:** 1.0  
**Purpose:** Annotated reference implementations for Windows 95 and Mac OS 8 skins

---

## Overview

This document walks through the actual implementation of the two shipped skins, showing how they map to the SDK specification. Use these as patterns when building new skins.

> **Key Principle:** These skins look and behave completely differently. They share the same engine but implement their own window managers, shells, and visual languages. Your skin should too.

---

## Windows 95 Skin (`src/skins/windows95/`)

### Manifest Analysis

```json
// src/skins/windows95/manifest.json
{
  "id": "windows95",
  "name": "Windows 95",
  "era": "1995",
  "period": "1995",
  "version": "1.0.0",
  "description": "The landmark 32-bit operating system that introduced the Start button, taskbar, grey 3D bevels, and modern desktop paradigm.",
  "author": "Desktop Time Machine",
  "entry": "desktop.html",
  "engineCompatibility": "1.0",
  "status": "ready",
  "icon": "🪟",
  "themeColor": "#008080",
  "previewImage": "assets/preview.png",
  "capabilities": [
    "window-management",
    "filesystem",
    "application-launcher",
    "desktop-icons",
    "start-menu",
    "taskbar",
    "screensaver"
  ],
  "meta": {
    "developer": "Microsoft",
    "releaseDate": "1995-08-24",
    "successor": "Windows 98",
    "kernelFamily": "Win9x",
    "historicalNote": "First Windows version to include the Start button and taskbar. Sold 7 million copies in five weeks."
  }
}
```

**SDK Mapping:**
- `capabilities` → Era Switcher tags
- `themeColor` → Card accent, active skin highlight
- `icon` → Card icon (🪟)
- `previewImage` → Card preview image
- `meta` → Historical details panel

---

### Desktop HTML Structure

```html
<!-- src/skins/windows95/desktop.html (simplified) -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Windows 95 - Desktop Time Machine</title>
  <link rel="stylesheet" href="desktop.css">
</head>
<body>
  <!-- Desktop background + icons -->
  <div class="win95-desktop" id="desktop">
    <div class="win95-desktop-icons" id="desktopIcons">
      <!-- 8 icons: My Computer, Recycle Bin, IE, Notepad, Paint, Minesweeper, Doom, Display Props -->
      <div class="win95-icon" data-app="my-computer">...</div>
      ...
    </div>
  </div>

  <!-- Taskbar (always visible) -->
  <div class="win95-taskbar" id="taskbar">
    <button class="win95-start-btn" id="startBtn">
      <span class="win95-start-flag"></span> Start
    </button>
    <div class="win95-taskbar-buttons" id="taskbarButtons"></div>
    <div class="win95-tray" id="tray">
      <div class="win95-clock" id="clock">9:18 PM</div>
    </div>
  </div>

  <!-- Start Menu (hidden by default) -->
  <div class="win95-start-menu hidden" id="startMenu">
    <div class="win95-start-menu-left">
      <div class="win95-start-menu-item" data-app="notepad">Notepad</div>
      <div class="win95-start-menu-item" data-app="paint">Paint</div>
      <div class="win95-start-menu-item" data-app="minesweeper">Minesweeper</div>
      <div class="win95-start-menu-separator"></div>
      <div class="win95-start-menu-item" data-app="doom">Doom Launcher</div>
      <div class="win95-start-menu-separator"></div>
      <div class="win95-start-menu-item" data-action="shutdown">Shut Down...</div>
    </div>
    <div class="win95-start-menu-right">
      <div class="win95-start-menu-item" data-action="switch">Switch Environment…</div>
    </div>
  </div>

  <!-- Context Menu -->
  <div class="win95-context-menu hidden" id="contextMenu">...</div>

  <!-- Window Layer (all windows go here) -->
  <div class="win95-windows-layer" id="windowsLayer"></div>

  <script type="module" src="desktop.js"></script>
</body>
</html>
```

**Key Structural Elements:**
1. **Desktop layer** — Background + icons (z-index: 1)
2. **Taskbar** — Fixed bottom, always visible (z-index: 500)
3. **Start Menu** — Popup from Start button (z-index: 600)
4. **Context Menu** — Right-click popup (z-index: 1000)
5. **Windows Layer** — Container for all app windows (z-index: 100)

---

### CSS Design Tokens (Win95 Palette)

```css
/* src/skins/windows95/desktop.css — :root tokens */
:root {
  /* Classic Win95 teal/grey palette */
  --win95-bg: #008080;                    /* Teal desktop */
  --win95-bg-dither: url("data:image/svg+xml,..."); /* Subtle pattern */
  
  --win95-window-bg: #c0c0c0;             /* Window background */
  --win95-title-active: #000080;          /* Active titlebar (navy) */
  --win95-title-inactive: #808080;        /* Inactive titlebar (grey) */
  --win95-title-text: #ffffff;            /* Titlebar text */
  
  --win95-btn-face: #c0c0c0;              /* Button face */
  --win95-btn-highlight: #ffffff;         /* 3D highlight (top/left) */
  --win95-btn-shadow: #808080;            /* 3D shadow (bottom/right) */
  --win95-btn-darkshadow: #404040;        /* Dark shadow */
  --win95-btn-text: #000000;              /* Button text */
  
  --win95-border-light: #ffffff;          /* Inset highlight */
  --win95-border-dark: #404040;           /* Inset shadow */
  --win95-border-mid: #808080;            /* Flat border */
  
  --win95-selection: #000080;             /* Selection highlight */
  --win95-selection-text: #ffffff;
  
  /* Fonts */
  --win95-font-ui: 'MS Sans Serif', 'Segoe UI', Tahoma, sans-serif;
  --win95-font-mono: 'Courier New', Courier, monospace;
  
  /* Sizing */
  --win95-taskbar-h: 28px;
  --win95-titlebar-h: 22px;
  --win95-icon-size: 64px;
  --win95-icon-label-w: 80px;
}
```

**Authentic Details:**
- **3D Bevels:** Every button/window uses `border: 2px solid` with `border-color: highlight shadow shadow highlight` for raised, reversed for pressed
- **Teal Desktop:** `#008080` with subtle noise pattern
- **Navy Titlebars:** `#000080` active, `#808080` inactive
- **MS Sans Serif:** Authentic system font (with fallbacks)

---

### Window Manager (Win95 Style)

```javascript
// src/skins/windows95/desktop.js — Window creation (excerpt)
function createWindow(options) {
  const {
    title = 'Window',
    width = 480,
    height = 320,
    x = cascadeOffset(),
    y = cascadeOffset(),
    content = '',
    icon = '📄',
    resizable = true,
    maximizable = true,
    minimizable = true,
    closable = true,
  } = options;

  const id = `win-${++windowId}`;
  const winEl = document.createElement('div');
  winEl.className = 'win95-window';
  winEl.dataset.windowId = id;
  
  // AUTHENTIC WIN95 WINDOW CHROME
  winEl.innerHTML = `
    <div class="win95-titlebar" data-window-id="${id}">
      <div class="win95-titlebar-left">
        <img class="win95-window-icon" src="${getIcon(icon)}" alt="">
        <span class="win95-window-title">${escapeHtml(title)}</span>
      </div>
      <div class="win95-titlebar-right">
        ${minimizable ? '<button class="win95-title-btn minimize" title="Minimize">_</button>' : ''}
        ${maximizable ? '<button class="win95-title-btn maximize" title="Maximize">□</button>' : ''}
        ${closable ? '<button class="win95-title-btn close" title="Close">×</button>' : ''}
      </div>
    </div>
    <div class="win95-window-content">${content}</div>
    ${resizable ? '<div class="win95-resize-handle"></div>' : ''}
  `;

  // 3D BORDERS via CSS
  // .win95-window { border: 2px solid; border-color: #fff #404040 #404040 #fff; }
  
  // Drag to move (titlebar)
  // Double-click titlebar to maximize
  // Resize handle bottom-right
  // Taskbar button management
  // Z-order management on focus
  
  return id;
}
```

**Win95-Specific Behaviors:**
- Titlebar double-click → maximize/restore
- Titlebar drag → move window
- Minimize → hides window, shows taskbar button as raised
- Maximize → fills screen minus taskbar
- Close → removes window, cleans up taskbar button
- Active window: navy titlebar, raised taskbar button
- Inactive window: grey titlebar, depressed taskbar button

---

### Start Menu Implementation

```javascript
// desktop.js — Start Menu (excerpt)
function toggleStartMenu() {
  const menu = document.getElementById('startMenu');
  const btn = document.getElementById('startBtn');
  const isHidden = menu.classList.toggle('hidden');
  btn.classList.toggle('pressed', !isHidden);
  
  if (!isHidden) {
    // Position at button
    const rect = btn.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.bottom = `${rect.bottom + 2}px`;
  }
}

// Start menu items launch apps
menu.querySelectorAll('[data-app]').forEach(item => {
  item.addEventListener('click', () => {
    launchApp(item.dataset.app);
    toggleStartMenu();
  });
});

// Shutdown dialog
menu.querySelector('[data-action="shutdown"]').addEventListener('click', () => {
  showShutdownDialog();
  toggleStartMenu();
});
```

**Authentic Win95 Start Menu:**
- Two-column layout (programs left, actions right)
- 3D raised border (`border-color: #fff #404040 #404040 #fff`)
- Hover highlight: navy background, white text
- Shutdown dialog with Restart/Shutdown/Cancel options

---

### Engine Integration (Win95 Apps)

```javascript
// desktop.js — App launching with engine integration
async function launchApp(appName) {
  switch (appName) {
    case 'notepad':
      createWindow({
        title: 'Notepad - Untitled',
        width: 600,
        height: 400,
        icon: '📝',
        content: await loadAppTemplate('notepad'),
      });
      break;

    case 'paint':
      createWindow({
        title: 'Paint - Untitled',
        width: 640,
        height: 480,
        icon: '🎨',
        content: await loadAppTemplate('paint'),
      });
      break;

    case 'minesweeper':
      createWindow({
        title: 'Minesweeper',
        width: 340,
        height: 380,
        icon: '💣',
        content: await loadAppTemplate('minesweeper'),
        resizable: false,
        maximizable: false,
      });
      break;

    case 'doom':
      // LAUNCHES REAL EXECUTABLE via engine
      const eng = window.DTM.engine;
      if (eng && eng.process) {
        try {
          await eng.process.spawn('doom.exe', ['-iwad', 'doom.wad']);
        } catch (e) {
          showError('Could not launch DOOM: ' + e.message);
        }
      }
      break;

    case 'my-computer':
    case 'explorer':
      // FILE MANAGER using engine.fs
      createWindow({
        title: 'My Computer',
        width: 600,
        height: 400,
        icon: '💻',
        content: await loadAppTemplate('explorer'),
      });
      // Load directory listing via engine
      loadExplorerContent('/home/user');
      break;
  }
}
```

**Key Point:** The DOOM launcher uses `engine.process.spawn()` — the ONLY way to launch real executables. The allowlist in `permissions.js` controls what's permitted.

---

### Cleanup Implementation

```javascript
// desktop.js — Cleanup (excerpt)
function cleanup() {
  console.log('[Win95] Cleaning up...');
  
  // 1. Stop clock
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  
  // 2. Close all windows
  windows.forEach((win, id) => closeWindow(id));
  windows.clear();
  
  // 3. Remove event listeners
  document.removeEventListener('click', handleGlobalClick);
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('contextmenu', handleContextMenu);
  
  // 4. Clear timers/intervals from apps
  appTimers.forEach(t => clearInterval(t));
  appTimers = [];
  
  // 5. Cancel animation frames
  animationFrames.forEach(id => cancelAnimationFrame(id));
  animationFrames = [];
  
  // 6. Dispose audio contexts
  if (startSound) startSound.pause();
  if (audioCtx) audioCtx.close();
  
  // 7. Clear DOM references
  elements = {};
  
  // 8. Clear global namespace
  window.Win95 = null;
  
  console.log('[Win95] Cleanup complete');
}

// REGISTER ON INIT
engine.onSkinUnload('windows95', cleanup);
```

---

## Mac OS 8 Skin (`src/skins/macos8/`)

### Manifest Analysis

```json
// src/skins/macos8/manifest.json
{
  "id": "macos8",
  "name": "Mac OS 8",
  "era": "1997",
  "period": "1997",
  "version": "1.0.0",
  "description": "The classic Macintosh Platinum appearance with authentic grey dither background, top menu bar, Apple menu, and Control Strip.",
  "author": "Desktop Time Machine",
  "entry": "desktop.html",
  "engineCompatibility": "1.0",
  "status": "ready",
  "icon": "💻",
  "themeColor": "#888888",
  "previewImage": "assets/preview.png",
  "capabilities": [
    "window-management",
    "desktop-icons",
    "apple-menu",
    "control-strip",
    "calculator",
    "sound-chimes",
    "trash-bin"
  ],
  "meta": {
    "developer": "Apple Computer",
    "releaseDate": "1997-07-26",
    "successor": "Mac OS 9",
    "kernelFamily": "Classic Mac OS",
    "historicalNote": "Mac OS 8 sold 1.2 million copies in its first two weeks and introduced the Platinum visual theme."
  }
}
```

**Different Capabilities:**
- `apple-menu` instead of `start-menu`
- `control-strip` instead of `taskbar`
- `trash-bin` (drag-to-trash)
- `sound-chimes` (system sounds)

---

### Desktop HTML Structure

```html
<!-- src/skins/macos8/desktop.html (simplified) -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Mac OS 8 - Desktop Time Machine</title>
  <link rel="stylesheet" href="desktop.css">
</head>
<body>
  <!-- Menu Bar (always at top) -->
  <div class="macos8-menubar" id="menubar">
    <div class="macos8-apple-menu" id="appleMenu">
      <button class="macos8-apple-btn" id="appleBtn">🍎</button>
      <div class="macos8-menu hidden" id="appleMenuDropdown">
        <div class="macos8-menu-item" data-action="about">About This Computer</div>
        <div class="macos8-menu-separator"></div>
        <div class="macos8-menu-item" data-app="calculator">Calculator</div>
        <div class="macos8-menu-item" data-app="simpletext">SimpleText</div>
        <div class="macos8-menu-item" data-app="stickies">Stickies</div>
        <div class="macos8-menu-separator"></div>
        <div class="macos8-menu-item" data-action="shutdown">Shut Down…</div>
      </div>
    </div>
    <div class="macos8-app-menu" id="appMenu">
      <!-- Current app's menus appear here -->
    </div>
    <div class="macos8-menubar-right">
      <div class="macos8-control-strip" id="controlStrip">...</div>
    </div>
  </div>

  <!-- Desktop with icons -->
  <div class="macos8-desktop" id="desktop">
    <div class="macos8-desktop-icons" id="desktopIcons">
      <div class="macos8-icon" data-app="macintosh-hd">💾 Macintosh HD</div>
      <div class="macos8-icon" data-app="trash">🗑️ Trash</div>
      <div class="macos8-icon" data-app="floppy">💾 Floppy</div>
    </div>
  </div>

  <!-- Window Layer -->
  <div class="macos8-windows-layer" id="windowsLayer"></div>

  <script type="module" src="desktop.js"></script>
</body>
</html>
```

**Key Differences from Win95:**
- **Menu bar at TOP** (not taskbar at bottom)
- **Apple menu** (not Start menu) — single global menu
- **App-specific menus** — change based on focused window
- **Control Strip** — right side of menu bar (not system tray)
- **Trash icon** on desktop (drag-to-delete)
- **No taskbar** — window list in Application menu

---

### CSS Design Tokens (Platinum)

```css
/* src/skins/macos8/desktop.css — :root tokens */
:root {
  /* Platinum grey dither */
  --macos8-bg: #aaa8a8;
  --macos8-bg-pattern: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><rect fill='%23999' width='2' height='2'/><rect fill='%23bbb' x='2' y='2' width='2' height='2'/></svg>");
  
  --macos8-menubar-bg: #e8e8e8;
  --macos8-menubar-border: #aaa;
  
  --macos8-window-bg: #ffffff;
  --macos8-title-active: #e8e8e8;       /* Platinum titlebar */
  --macos8-title-inactive: #d8d8d8;
  --macos8-title-text: #000000;
  --macos8-title-pattern: linear-gradient(180deg, #f8f8f8, #e0e0e0);
  
  --macos8-btn-face: #e8e8e8;
  --macos8-btn-highlight: #ffffff;
  --macos8-btn-shadow: #aaa;
  --macos8-btn-darkshadow: #888;
  --macos8-btn-text: #000000;
  
  --macos8-selection: #003399;          /* Classic blue selection */
  --macos8-selection-text: #ffffff;
  
  /* Fonts — Chicago/Charcoal/Monaco */
  --macos8-font-ui: 'Charcoal', 'San Francisco', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --macos8-font-mono: 'Monaco', 'Menlo', 'Courier New', monospace;
  
  /* Sizing */
  --macos8-menubar-h: 20px;
  --macos8-titlebar-h: 20px;
  --macos8-icon-size: 64px;
  --macos8-icon-label-w: 96px;          /* Wider labels */
}
```

**Authentic Mac OS 8 Details:**
- **Platinum Gradient:** Subtle vertical gradient on titlebars
- **Grey Dither Background:** 4×4 pattern `#aaa8a8` with `#999`/`#bbb` dots
- **Blue Selection:** `#003399` (not navy like Win95)
- **Chicago/Charcoal Fonts:** Mac system fonts
- **Rounded Window Corners:** Subtle (via CSS border-radius)
- **Window Shading:** Double-click titlebar → roll up (WindowShade)

---

### Window Manager (Mac OS 8 Style)

```javascript
// src/skins/macos8/desktop.js — Window creation (excerpt)
function createWindow(options) {
  const {
    title = 'Window',
    width = 480,
    height = 320,
    x = cascadeOffset(),
    y = cascadeOffset() + 20, // Below menubar
    content = '',
    icon = '📄',
    resizable = true,
    closable = true,
    zoomable = true,        // Mac has "zoom" not "maximize"
    shadeable = true,       // WindowShade (double-click titlebar)
  } = options;

  const id = `win-${++windowId}`;
  const winEl = document.createElement('div');
  winEl.className = 'macos8-window';
  winEl.dataset.windowId = id;
  
  // AUTHENTIC MAC OS 8 WINDOW CHROME
  winEl.innerHTML = `
    <div class="macos8-titlebar" data-window-id="${id}">
      <div class="macos8-titlebar-left">
        <div class="macos8-window-controls">
          ${closable ? '<button class="macos8-close-btn" title="Close">●</button>' : ''}
          ${zoomable ? '<button class="macos8-zoom-btn" title="Zoom">●</button>' : ''}
          ${shadeable ? '<button class="macos8-shade-btn" title="Minimize">●</button>' : ''}
        </div>
      </div>
      <div class="macos8-titlebar-center">
        <img class="macos8-window-icon" src="${getIcon(icon)}" alt="">
        <span class="macos8-window-title">${escapeHtml(title)}</span>
      </div>
      <div class="macos8-titlebar-right">
        ${resizable ? '<div class="macos8-grow-box"></div>' : ''}
      </div>
    </div>
    <div class="macos8-window-content">${content}</div>
  `;

  // Mac OS 8 SPECIFIC BEHAVIORS:
  // - Close button: red ● (top-left)
  // - Zoom button: green ● (top-left) — "smart zoom" to content size
  // - Shade button: yellow ● (top-left) — WindowShade roll-up
  // - Grow box: bottom-right corner (only on resizable)
  // - Titlebar: centered title, proxy icon left of title
  // - Double-click titlebar → WindowShade (roll up)
  // - Drag titlebar → move
  // - Drag grow box → resize
  // - Proxy icon drag → file operations (not implemented)
  
  return id;
}
```

**Mac-Specific Behaviors:**
- **Three traffic-light buttons:** Red (close), Green (zoom), Yellow (minimize/shade)
- **WindowShade:** Double-click titlebar rolls window up to titlebar only
- **Zoom:** Green button does "smart zoom" to fit content, not full-screen
- **Grow box:** Only bottom-right corner, distinct diagonal lines
- **Proxy icon:** Document icon in titlebar (drag to move file — not implemented)

---

### Apple Menu & Control Strip

```javascript
// desktop.js — Apple Menu (excerpt)
function setupAppleMenu() {
  const btn = document.getElementById('appleBtn');
  const menu = document.getElementById('appleMenuDropdown');
  
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
      positionMenu(menu, btn);
    }
  });
  
  // App menu items
  menu.querySelectorAll('[data-app]').forEach(item => {
    item.addEventListener('click', () => {
      launchApp(item.dataset.app);
      menu.classList.add('hidden');
    });
  });
  
  // Shutdown
  menu.querySelector('[data-action="shutdown"]').addEventListener('click', () => {
    showShutdownDialog();
    menu.classList.add('hidden');
  });
  
  // Click outside closes
  document.addEventListener('click', () => menu.classList.add('hidden'));
}

// Control Strip (right side of menubar)
function setupControlStrip() {
  const strip = document.getElementById('controlStrip');
  // Volume, brightness, battery, etc. modules
  strip.innerHTML = `
    <div class="macos8-strip-module" title="Volume">
      <button class="macos8-strip-btn">🔊</button>
      <input type="range" class="macos8-strip-slider" min="0" max="100" value="75">
    </div>
    <div class="macos8-strip-module" title="Brightness">
      <button class="macos8-strip-btn">☀️</button>
      <input type="range" class="macos8-strip-slider" min="0" max="100" value="80">
    </div>
    <div class="macos8-strip-module" title="Battery">
      <span class="macos8-battery">🔋 85%</span>
    </div>
  `;
}
```

**Authentic Mac OS 8:**
- Apple menu: About, Calculator, SimpleText, Stickies, Shut Down
- Control Strip: Volume, Brightness, Battery, File Sharing, AppleTalk, etc.
- Click-and-hold or click-to-open behavior
- Modules slide out from right edge

---

### Trash Implementation

```javascript
// desktop.js — Trash (excerpt)
function setupTrash() {
  const trashIcon = document.querySelector('[data-app="trash"]');
  let trashContents = [];
  
  // Drag and drop to trash
  document.addEventListener('dragstart', (e) => {
    if (e.target.classList.contains('macos8-icon')) {
      e.dataTransfer.setData('text/plain', e.target.dataset.app);
      e.target.classList.add('dragging');
    }
  });
  
  document.addEventListener('dragend', (e) => {
    e.target.classList.remove('dragging');
  });
  
  trashIcon.addEventListener('dragover', (e) => {
    e.preventDefault();
    trashIcon.classList.add('drag-over');
  });
  
  trashIcon.addEventListener('dragleave', () => {
    trashIcon.classList.remove('drag-over');
  });
  
  trashIcon.addEventListener('drop', (e) => {
    e.preventDefault();
    trashIcon.classList.remove('drag-over');
    const appId = e.dataTransfer.getData('text/plain');
    if (appId && appId !== 'trash') {
      moveToTrash(appId);
    }
  });
  
  // Click trash to open
  trashIcon.addEventListener('dblclick', () => openTrashWindow());
}

function moveToTrash(itemId) {
  // Animate icon flying to trash
  const icon = document.querySelector(`[data-app="${itemId}"]`);
  if (icon) {
    animateToTrash(icon, () => {
      icon.remove();
      trashContents.push(itemId);
      updateTrashIcon();
    });
  }
}

function openTrashWindow() {
  createWindow({
    title: 'Trash',
    width: 400,
    height: 300,
    icon: '🗑️',
    content: renderTrashContents(),
  });
}
```

**Authentic Behavior:**
- Drag desktop icons to trash → animate deletion
- Trash icon changes (empty → full)
- Double-click trash → opens Trash window
- Empty Trash command in Special menu (not implemented)

---

### Cleanup Implementation

```javascript
// desktop.js — Cleanup (excerpt)
function cleanup() {
  console.log('[MacOS8] Cleaning up...');
  
  // 1. Stop clock (in menubar)
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
  
  // 2. Close all windows
  windows.forEach((win, id) => closeWindow(id));
  windows.clear();
  
  // 3. Remove event listeners
  document.removeEventListener('click', handleGlobalClick);
  document.removeEventListener('keydown', handleKeydown);
  document.removeEventListener('dragstart', handleDragStart);
  document.removeEventListener('dragend', handleDragEnd);
  document.removeEventListener('dragover', handleDragOver);
  document.removeEventListener('dragleave', handleDragLeave);
  document.removeEventListener('drop', handleDrop);
  
  // 4. Clear app timers
  appTimers.forEach(t => clearInterval(t));
  appTimers = [];
  
  // 5. Cancel animation frames
  animationFrames.forEach(id => cancelAnimationFrame(id));
  animationFrames = [];
  
  // 6. Dispose audio (system sounds)
  systemSounds.forEach(s => { s.pause(); s.src = ''; });
  systemSounds = [];
  if (audioCtx) audioCtx.close();
  
  // 7. Clear menu state
  document.querySelectorAll('.macos8-menu').forEach(m => m.classList.add('hidden'));
  
  // 8. Clear DOM references
  elements = {};
  
  // 9. Clear global namespace
  window.MacOS8 = null;
  
  console.log('[MacOS8] Cleanup complete');
}

engine.onSkinUnload('macos8', cleanup);
```

---

## Comparison: Win95 vs Mac OS 8

| Aspect | Windows 95 | Mac OS 8 |
|--------|------------|----------|
| **Shell Paradigm** | Start button + Taskbar | Menu bar + Apple menu |
| **Window Chrome** | 3D bevel, titlebar left-aligned | Platinum gradient, centered title, traffic lights |
| **Minimize** | Taskbar button | WindowShade (roll up) |
| **Maximize** | Full screen minus taskbar | Smart zoom to content |
| **Close** | × button right | Red ● button left |
| **Resize** | All edges + corner | Grow box bottom-right only |
| **Desktop Icons** | Left-aligned, 80px labels | Left-aligned, 96px labels |
| **Trash/Recycle** | Recycle Bin icon | Trash icon (drag-to-delete) |
| **System Menu** | Start menu (programs + shutdown) | Apple menu (apps + shutdown) |
| **Status Area** | System tray (right taskbar) | Control Strip (right menubar) |
| **Fonts** | MS Sans Serif | Charcoal/Chicago |
| **Selection** | Navy `#000080` | Blue `#003399` |
| **Background** | Teal `#008080` | Platinum dither `#aaa8a8` |

---

## Patterns to Emulate

### 1. Design Token System
Both skins define ALL colours in `:root` — makes theming trivial and ensures consistency.

### 2. Window Manager as State Machine
```javascript
// Each window tracks its own state
const winState = {
  id, element, x, y, width, height,
  maximized: false, minimized: false, shaded: false,
  prevBounds: null,  // for restore
};
```

### 3. Engine Integration Points
```javascript
// Filesystem
engine.fs.list(path) → render file icons

// Process
engine.process.spawn('notepad.exe', [file]) → launch real app

// Notifications
engine.notify({ title, body }) → system notification
```

### 4. Cleanup Registration
```javascript
// ALWAYS register on init
engine.onSkinUnload('your-skin-id', cleanup);

// cleanup() disposes EVERYTHING
```

### 5. Scoped CSS Classes
```css
/* Win95 */
.win95-window, .win95-titlebar, .win95-icon, .win95-taskbar

/* Mac OS 8 */
.macos8-window, .macos8-titlebar, .macos8-icon, .macos8-menubar
```

### 6. Authentic Interaction Details
- Win95: Titlebar double-click = maximize, 3D bevels on everything
- Mac: Titlebar double-click = WindowShade, traffic-light buttons, grow box

---

## Building Your Own Skin: Checklist

Based on these examples, your skin needs:

- [ ] **Manifest** with unique `id`, authentic `capabilities`, `themeColor`
- [ ] **HTML** with your OS's shell structure (menu bar / taskbar / dock / Workbench)
- [ ] **CSS** with complete design token system in `:root`
- [ ] **Window Manager** with your OS's chrome and behaviors
- [ ] **Shell** (Start menu / Apple menu / Dock / Workbench dock / Deskbar)
- [ ] **Desktop Icons** with selection, drag, context menu
- [ ] **At least 3 apps** demonstrating engine APIs
- [ ] **Cleanup** disposing all resources
- [ ] **Asset list** documenting required fonts/cursors/sounds
- [ ] **Preview screenshot** (800×600)

---

*These implementations are the ground truth. When in doubt, read the actual source in `src/skins/windows95/` and `src/skins/macos8/`.*