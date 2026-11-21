# Desktop Time Machine — Skin Development Guide

This guide describes how to author a custom retro desktop environment ("skin") that plugs into the Desktop Time Machine engine.

---

## 1. Directory Structure

Each skin is placed into its own folder under `src/skins/<skin-id>/`:

```text
src/skins/<skin-id>/
├── manifest.json       # Required metadata describing the skin
├── desktop.html        # Entry point DOM structure & scripts
├── desktop.css         # Styling, layout, and visual identity (optional or embedded)
├── desktop.js          # Skin interactions and window logic (optional or embedded)
├── assets/             # Icons, cursors, backgrounds, patterns
└── sounds/             # Retro chimes, clicks, alerts
```

---

## 2. Manifest Specification (`manifest.json`)

Every skin must provide a valid `manifest.json`:

```json
{
  "id": "windows95",
  "name": "Windows 95",
  "period": "1995",
  "version": "1.0.0",
  "description": "The landmark 32-bit operating system that introduced the Start button, taskbar, grey 3D bevels, and modern desktop paradigm.",
  "author": "Your Name or AI Agent",
  "entry": "desktop.html",
  "engineCompatibility": "1.0",
  "status": "ready",
  "icon": "🪟",
  "capabilities": [
    "window-management",
    "filesystem",
    "application-launcher",
    "desktop-icons",
    "start-menu",
    "taskbar",
    "screensaver"
  ]
}
```

### Manifest Fields
| Field | Type | Description |
|---|---|---|
| `id` | string | Unique alphanumeric identifier (e.g. `macos8`, `windowsXP`, `beos`) |
| `name` | string | Display name of the operating system |
| `period` | string | Era or release year (e.g. `1995`, `1997`, `1985–1993`) |
| `version` | string | Semantic version (e.g. `1.0.0`) |
| `description` | string | Concise 1–2 sentence description of visual and interactive traits |
| `author` | string | Creator of the skin |
| `entry` | string | Relative path to entry HTML document (usually `desktop.html`) |
| `engineCompatibility` | string | DTM engine version targeted (e.g. `1.0`) |
| `status` | string | `ready` (playable) or `roadmap` (in development) |
| `icon` | string | Visual glyph or icon representing the OS |
| `capabilities` | string[] | Array of supported features |

---

## 3. Communicating with the DTM Engine API

Skins access engine functionality through `DTM` (available at `window.parent.DTM` or `window.DTM`):

```javascript
const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : window.DTM;
```

### Available Engine Services

#### System Information
```javascript
const info = await DTM.system.getInfo();
// Returns: { platform, release, hostname, username, totalMemoryMB, freeMemoryMB, uptimeSeconds }
```

#### Real Filesystem Browsing
```javascript
// List folder contents with names, sizes, isDirectory flags
const folder = await DTM.system.listDirectory('C:\\');
console.log(folder.items);

// Open a file or folder using the user's default Windows application
await DTM.system.openPath('C:\\Users\\Example\\Documents\\report.docx');
```

#### Application Launching (Approved Whitelist)
```javascript
// Launch real Windows utility (calc.exe, notepad.exe, mspaint.exe, explorer.exe)
await DTM.system.launchProgram('calc.exe');
```

#### External Web Browsing
```javascript
// Opens safe HTTP/HTTPS URL in the user's default browser (Firefox, Chrome, Edge)
await DTM.system.openExternalUrl('https://archive.org');
```

#### Window & Environment Controls
```javascript
// Toggle fullscreen display
DTM.system.toggleFullScreen();

// Exit Desktop Time Machine safely and return to Windows
DTM.system.exit();

// Trigger the Time Machine OS Museum / Era Switcher
if (window.parent) {
  window.parent.postMessage('dtm:open-switcher', '*');
}
```

---

## 4. Interaction & Design Standards

1. **Authenticity Over Novelty**: Replicate typography, colors, borders, and interaction idioms faithfully. For example:
   - **Windows 95/98**: Grey `#c0c0c0` surfaces, 2px beveled borders (`white #404040 #404040 white`), bottom taskbar, Start button.
   - **Classic Mac OS**: Platinum `#dddddd` surfaces, 1px black window borders, pinstripe title bars, top menubar with Apple logo, Control Strip, window shading on double-click.
   - **BeOS**: Yellow tabbed title bars (`#ffdc00`), Deskbar in top-right.
2. **Keyboard Accessibility**:
   - Forward `F8` or `Ctrl+Shift+T` to trigger the Era Switcher:
   ```javascript
   window.addEventListener('keydown', (e) => {
     if (e.key === 'F8' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't')) {
       e.preventDefault();
       if (window.parent) window.parent.postMessage('dtm:open-switcher', '*');
     }
   });
   ```
3. **No Direct Node.js Calls**: Do NOT call `require('fs')` or `require('child_process')`. All filesystem access must use `DTM.fs`; all host interactions use `DTM.system`.
4. **One Computer**: A skin is a presentation layer over shared capabilities. Never create a per-OS filesystem, virtual disk, separate home directory or private copy of user files. Use `DTM.fs`/`DTM.desktop` for the same real host data every other skin sees. `localStorage` is only for this skin's visual preferences (wallpaper, icon layout, screensaver), not for user documents or application data that should be shared.
