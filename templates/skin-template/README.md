# Desktop Time Machine — Skin Template

A complete, minimal starting point for creating a new historical desktop environment skin.

## Quick Start

```bash
# 1. Copy this template
cp -r templates/skin-template src/skins/your-skin-id

# 2. Edit manifest.json with your skin's metadata
# 3. Replace desktop.html, desktop.css, desktop.js with your OS's implementation
# 4. Add assets to assets/
# 5. Add applications to apps/
# 6. Test: npm run dev (select your skin in Era Switcher)
```

## Template Structure

```
skin-template/
├── manifest.json          # Skin metadata (REQUIRED)
├── desktop.html           # Entry point (REQUIRED)
├── desktop.css            # Complete styling (REQUIRED)
├── desktop.js             # Application logic (REQUIRED)
├── assets/                # Images, fonts, sounds
│   ├── icons/
│   ├── cursors/
│   ├── sounds/
│   └── wallpapers/
├── apps/                  # Individual applications
│   └── example-app/
│       ├── index.html
│       ├── app.css
│       └── app.js
└── README.md              # This file
```

## Manifest Fields (Required)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (kebab-case, e.g., `windows95`, `amiga-workbench`) |
| `name` | string | Display name |
| `era` | string | Historical year/period (e.g., `"1995"`, `"1985–1993"`) |
| `period` | string | Alias for era (used by Era Switcher) |
| `version` | string | Semantic version |
| `description` | string | One-paragraph description |
| `author` | string | Creator name |
| `entry` | string | Entry HTML file (relative to skin folder) |
| `engineCompatibility` | string | Engine version range |
| `status` | string | `"ready"`, `"roadmap"`, `"experimental"` |
| `icon` | string | Emoji or single character for Era Switcher |
| `themeColor` | string | Hex color for accent theming |
| `previewImage` | string/null | Path to screenshot (optional) |
| `capabilities` | string[] | Array of capability identifiers |
| `meta` | object | Historical metadata (developer, releaseDate, successor, kernelFamily, historicalNote) |

## Capabilities (Standard)

Use these standard capability identifiers so the Era Switcher can show consistent tags:

- `window-management` — Overlapping, draggable, resizable windows
- `filesystem` — File manager / desktop filesystem access
- `application-launcher` — Start menu, dock, or equivalent
- `desktop-icons` — Clickable icons on desktop background
- `start-menu` — Windows-style Start button/menu
- `apple-menu` — Mac-style Apple menu
- `taskbar` — Persistent bottom/top bar with running apps
- `control-strip` — Mac OS Control Strip
- `dock` — NeXT/macOS-style dock
- `quick-launch` — Windows 98+ Quick Launch toolbar
- `active-desktop` — Windows 98 Active Desktop
- `screensaver` — Screensaver support
- `sound-chimes` — System sounds
- `wallpaper` — Desktop wallpaper support
- `themes` — Theme/visual style switching
- `cli` — Command-line interface
- `amiga-dock` — Amiga-style icon dock
- `custom-screens` — Amiga custom screen modes
- `tabbed-windows` — BeOS-style tabbed window frames
- `workspaces` — Virtual desktops/workspaces
- `luna-theme` — Windows XP Luna visual style
- `two-column-start` — Windows XP two-column Start menu
- `visual-styles` — Windows XP visual styles (.msstyles)

## Shared Engine API

Access via `window.DTM.engine` (available after `DOMContentLoaded`):

```javascript
const engine = window.DTM.engine;

// Filesystem
await engine.fs.list(path);
await engine.fs.read(path);
await engine.fs.write(path, content);
await engine.fs.mkdir(path);
await engine.fs.remove(path);
await engine.fs.exists(path);
await engine.fs.stat(path);

// Process execution (allowlisted only)
await engine.process.spawn('notepad.exe', ['file.txt']);

// Window management (engine-level)
engine.windows.create({ title, width, height, content });
engine.windows.close(windowId);
engine.windows.focus(windowId);

// System info
await engine.system.getInfo();

// Notifications
engine.notify({ title, body, icon });

// Clipboard
await engine.clipboard.readText();
await engine.clipboard.writeText(text);

// Skin lifecycle
engine.onSkinUnload(skinId, cleanupFn);
engine.emit('dtm:skin-changed', skin);
engine.on('dtm:open-switcher', handler);
```

**Do NOT** access `require('electron')`, `require('fs')`, `process`, or any Node.js/Electron APIs directly. All privileged operations go through the engine.

## Skin Lifecycle

```
1. DISCOVERY
   ├── SkinManager scans src/skins/ for manifest.json
   └── IPC returns available skins to renderer

2. VALIDATION
   ├── Manifest schema validation (required fields, types)
   └── Entry point existence check

3. LOADING
   ├── SkinManager.switchSkin(id) called
   ├── Viewport iframe src set to skin entry
   └── Skin's DOMContentLoaded fires

4. INITIALIZATION (your code)
   ├── Cache DOM elements
   ├── Set up event listeners
   ├── Start timers/intervals
   ├── Register cleanup with engine.onSkinUnload()
   └── Restore session state

5. RUNNING
   ├── Handle user interactions
   ├── Create windows via engine.windows.create()
   ├── Use engine.fs for filesystem
   └── Respond to engine events

6. SWITCHING AWAY (cleanup)
   ├── engine.emit('dtm:skin-changed', newSkin)
   ├── Your cleanup() called via onSkinUnload
   │   ├── Clear ALL intervals/timeouts
   │   ├── Close ALL windows
   │   ├── Remove ALL event listeners
   │   ├── Dispose audio contexts
   │   ├── Cancel animation frames
   │   └── Clear DOM references
   └── Viewport navigates to new skin

7. DISPOSAL
   └── Skin JS context discarded (iframe navigates)
```

## Required Cleanup

Your `cleanup()` function **MUST** dispose of:

- [ ] All `setInterval` / `setTimeout` (store IDs, clear on cleanup)
- [ ] All `requestAnimationFrame` (store IDs, `cancelAnimationFrame`)
- [ ] All `addEventListener` (use `AbortController` or named handlers)
- [ ] All `AudioContext` (`close()`)
- [ ] All `MediaStream` (`getTracks().forEach(t => t.stop())`)
- [ ] All `IntersectionObserver` / `MutationObserver` / `ResizeObserver` (`disconnect()`)
- [ ] All dynamically created DOM elements (remove from parent)
- [ ] All window references (close via engine or remove from DOM)
- [ ] All global namespace pollution (delete `window.YourSkin` if added)

## Styling Guidelines

1. **Define ALL colours as CSS custom properties** in `:root` — makes theming easy
2. **Use authentic fonts** — load via `@font-face` from `assets/fonts/`
3. **Don't copy Windows 95** — each skin must feel like its own OS
4. **Scope your styles** — prefix classes with your skin ID (`.yourskin-window`) or use CSS modules
5. **Respect the viewport** — skin runs in an iframe, `100vw`/`100vh` = viewport size

## Adding Applications

Create apps in `apps/your-app-name/`:

```
apps/
└── notepad/
    ├── index.html      # App entry (loaded in engine window)
    ├── app.css         # App-specific styles
    ├── app.js          # App logic (ES module)
    └── manifest.json   # Optional: app metadata
```

Register in your skin's `desktop.js`:

```javascript
function launchApp(appName) {
  switch (appName) {
    case 'notepad':
      createWindow({
        title: 'Notepad',
        width: 600,
        height: 400,
        icon: '📝',
        content: await loadAppContent('notepad'),
      });
      break;
  }
}
```

## Testing Your Skin

```bash
# Development (with hot reload)
npm run dev

# Run test suite
npm test

# Manual verification checklist:
# [ ] Era Switcher shows skin with correct name, era, icon, version
# [ ] Skin loads without console errors
# [ ] Desktop background renders
# [ ] Icons appear and respond to click/double-click
# [ ] Context menu works on desktop right-click
# [ ] Start menu / launcher opens and launches apps
# [ ] Windows can be created, dragged, resized, minimized, maximized, closed
# [ ] Taskbar / dock shows running apps
# [ ] Clock updates
# [ ] Switching to another skin and back works (no stale state)
# [ ] cleanup() runs on switch (no memory leaks, no orphaned timers)
# [ ] No direct Electron/Node API access in skin code
```

## Submitting a Skin

1. Place skin in `src/skins/your-skin-id/`
2. Ensure `manifest.json` is valid
3. Add preview screenshot as `assets/preview.png` (800×600 recommended)
4. Optionally set `manifest.json` `previewImage` to a path relative to `src/` (for example `../screenshots/gallery-my-skin.png`)
5. Run full test suite: `npm test`
6. Open PR with screenshots of your skin running

## Resources

- [Skin SDK Specification](../../docs/SKIN_SDK.md)
- [API Reference](../../docs/SKIN_API_REFERENCE.md)
- [Manifest Spec](../../docs/SKIN_MANIFEST_SPEC.md)
- [LLM Generation Guide](../../docs/LLM_SKIN_GENERATION.md)
- [Examples](../../docs/SKIN_EXAMPLES.md)