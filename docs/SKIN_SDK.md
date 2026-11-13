# Desktop Time Machine — Skin SDK Specification

**Version:** 1.0  
**Engine Compatibility:** 1.0+  
**Status:** Living Document

---

## Overview

The Skin SDK defines the contract between **Desktop Time Machine** (the host application) and **skins** (historical desktop environment recreations). This document is the authoritative reference for skin developers.

> **Philosophy:** ONE SHARED ENGINE. MANY COMPLETELY DIFFERENT OPERATING SYSTEM EXPERIENCES.
> 
> A skin is NOT a theme. Each skin recreates a complete operating system desktop — its own window manager, its own shell, its own interactions, its own soul.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DESKTOP TIME MACHINE                         │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     MAIN PROCESS                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │  │   Skin      │  │  Security   │  │   System           │  │
│  │  │  Manager    │  │  Permissions│  │   Integration      │  │
│  │  └─────────────┘  └─────────────┘  └────────────────────┘  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                    Context Bridge (preload)                       │
│                              │                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    RENDERER PROCESS                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                  SHARED ENGINE                       │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │  │
│  │  │  │  Window  │ │ Filesystem│ │ Process  │ │ System │  │  │
│  │  │  │  Manager │ │    API   │ │   API    │ │  Info  │  │  │
│  │  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                              │                              │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │              SKIN VIEWPORT (iframe)                 │  │  │
│  │  │  ┌─────────────────────────────────────────────┐   │  │  │
│  │  │  │           SKIN CODE (isolated)              │   │  │  │
│  │  │  │  • desktop.html  • desktop.css  • desktop.js│   │  │  │
│  │  │  │  • apps/         • assets/                   │   │  │  │
│  │  │  └─────────────────────────────────────────────┘   │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **Skins run in iframes** — Complete isolation from host and other skins
2. **Shared engine provides services** — Window management, filesystem, process execution, system info
3. **No direct Electron/Node access** — All privileged operations go through the engine API
4. **Lifecycle is mandatory** — Every skin MUST implement `cleanup()` for resource disposal
5. **Manifest-driven** — Discovery, validation, and metadata all come from `manifest.json`

---

## Skin Structure

```
src/skins/your-skin-id/
├── manifest.json              # REQUIRED — Skin metadata & capabilities
├── desktop.html               # REQUIRED — Entry point (loaded in iframe)
├── desktop.css                # REQUIRED — Complete styling
├── desktop.js                 # REQUIRED — Application logic (ES module)
├── assets/                    # Images, fonts, sounds, cursors, wallpapers
│   ├── icons/
│   ├── cursors/
│   ├── sounds/
│   ├── wallpapers/
│   └── preview.png            # 800×600 screenshot for Era Switcher
└── apps/                      # Individual applications (optional)
    └── app-name/
        ├── manifest.json      # App metadata
        ├── index.html         # App entry point
        ├── app.css            # App styles
        └── app.js             # App logic
```

---

## Manifest Specification

### Required Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Unique kebab-case identifier | `"windows95"` |
| `name` | string | Display name | `"Windows 95"` |
| `era` | string | Historical year/period | `"1995"` |
| `period` | string | Alias for era (Era Switcher) | `"1995"` |
| `version` | string | Semantic version | `"1.0.0"` |
| `description` | string | One-paragraph description | `"The landmark 32-bit OS..."` |
| `author` | string | Creator name | `"Desktop Time Machine"` |
| `entry` | string | Entry HTML file (relative) | `"desktop.html"` |
| `engineCompatibility` | string | Engine version range | `"1.0"` |
| `status` | string | `"ready" \| "roadmap" \| "experimental"` | `"ready"` |
| `icon` | string | Emoji/single char for Era Switcher | `"🪟"` |
| `themeColor` | string | Hex color for accent theming | `"#008080"` |
| `previewImage` | string/null | Relative path to screenshot | `"assets/preview.png"` |
| `capabilities` | string[] | Capability identifiers | `["window-management", "filesystem"]` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `meta` | object | Historical metadata (see below) |
| `dependencies` | object | Engine version constraints |

### Meta Object (Optional but Recommended)

```json
"meta": {
  "developer": "Microsoft",
  "releaseDate": "1995-08-24",
  "successor": "Windows 98",
  "kernelFamily": "Win9x",
  "historicalNote": "First Windows with Start button and taskbar. Sold 7M copies in 5 weeks."
}
```

### Complete Example

```json
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

---

## Capability Identifiers

Use these standard identifiers so the Era Switcher displays consistent tags:

| Capability | Description | Example OS |
|------------|-------------|------------|
| `window-management` | Overlapping, draggable, resizable windows | All |
| `filesystem` | File manager / desktop filesystem access | All |
| `application-launcher` | Start menu, dock, or equivalent | All |
| `desktop-icons` | Clickable icons on desktop background | Win95, Mac OS 8, Amiga |
| `start-menu` | Windows-style Start button/menu | Windows 95+ |
| `apple-menu` | Mac-style Apple menu | Mac OS 8+ |
| `taskbar` | Persistent bottom/top bar with running apps | Windows 95+ |
| `control-strip` | Mac OS Control Strip | Mac OS 8/9 |
| `dock` | NeXT/macOS-style dock | NeXTSTEP, macOS |
| `quick-launch` | Windows 98+ Quick Launch toolbar | Windows 98+ |
| `active-desktop` | Windows 98 Active Desktop | Windows 98 |
| `screensaver` | Screensaver support | Windows 95+ |
| `sound-chimes` | System sounds | Mac OS 8+, Windows |
| `wallpaper` | Desktop wallpaper support | Windows 95+, Mac OS 8+ |
| `themes` | Theme/visual style switching | Windows XP+, GNOME/KDE |
| `cli` | Command-line interface | Amiga, BeOS, Linux |
| `amiga-dock` | Amiga-style icon dock | Amiga Workbench |
| `custom-screens` | Amiga custom screen modes | Amiga |
| `tabbed-windows` | BeOS-style tabbed window frames | BeOS |
| `workspaces` | Virtual desktops/workspaces | BeOS, Linux, macOS |
| `luna-theme` | Windows XP Luna visual style | Windows XP |
| `two-column-start` | Windows XP two-column Start menu | Windows XP |
| `visual-styles` | Windows XP visual styles (.msstyles) | Windows XP |

---

## Shared Engine API

Access via `window.DTM.engine` (available after `DOMContentLoaded` in the skin iframe).

### Filesystem API (`engine.fs`)

All paths are **virtual** — mapped to a sandboxed directory on the host. Skins cannot escape the sandbox.

```typescript
interface FilesystemAPI {
  // List directory contents
  list(path: string): Promise<FileEntry[]>;
  
  // Read file content (text)
  read(path: string): Promise<string>;
  
  // Read file as ArrayBuffer (binary)
  readBinary(path: string): Promise<ArrayBuffer>;
  
  // Write text file
  write(path: string, content: string): Promise<void>;
  
  // Write binary file
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  
  // Create directory (recursive)
  mkdir(path: string): Promise<void>;
  
  // Remove file or empty directory
  remove(path: string): Promise<void>;
  
  // Remove directory recursively
  removeRecursive(path: string): Promise<void>;
  
  // Check existence
  exists(path: string): Promise<boolean>;
  
  // Get file/directory stats
  stat(path: string): Promise<FileStat>;
  
  // Copy file
  copy(src: string, dest: string): Promise<void>;
  
  // Move/rename
  move(src: string, dest: string): Promise<void>;
}

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number; // Unix timestamp
  mimeType?: string;
}

interface FileStat {
  isDirectory: boolean;
  size: number;
  modified: number;
  created: number;
  mimeType?: string;
}
```

### Process Execution API (`engine.process`)

**Only allowlisted executables can be spawned.** The allowlist is configured in the main process security policy.

```typescript
interface ProcessAPI {
  // Spawn an allowlisted executable
  spawn(executable: string, args?: string[]): Promise<ProcessResult>;
  
  // Check if executable is allowlisted
  isAllowed(executable: string): Promise<boolean>;
  
  // Get allowlist
  getAllowlist(): Promise<string[]>;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
```

**Allowlisted by default:** `notepad.exe`, `calc.exe`, `mspaint.exe`, `cmd.exe` (restricted), `explorer.exe` (restricted)

### Window Management API (`engine.windows`)

For engine-level window operations (not skin-internal windows).

```typescript
interface WindowManagerAPI {
  // Create a new engine-managed window
  create(options: WindowOptions): Promise<string>; // returns windowId
  
  // Close window
  close(windowId: string): Promise<void>;
  
  // Focus window
  focus(windowId: string): Promise<void>;
  
  // Get window state
  getState(windowId: string): Promise<WindowState>;
  
  // List all windows
  list(): Promise<WindowState[]>;
  
  // Subscribe to window events
  on(event: 'created' | 'closed' | 'focused' | 'moved' | 'resized', handler: Function): void;
}

interface WindowOptions {
  title: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  content: string; // HTML content
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  closable?: boolean;
  skinId?: string; // For skin-specific windows
}

interface WindowState {
  id: string;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
  isFocused: boolean;
  isMaximized: boolean;
  isMinimized: boolean;
  skinId?: string;
}
```

### System Info API (`engine.system`)

```typescript
interface SystemAPI {
  // Get host system information
  getInfo(): Promise<SystemInfo>;
}

interface SystemInfo {
  platform: 'win32' | 'darwin' | 'linux';
  arch: string;
  hostname: string;
  username: string;
  homeDir: string;
  tempDir: string;
  cpus: number;
  totalMemory: number;
  freeMemory: number;
  electronVersion: string;
  nodeVersion: string;
  dtmVersion: string;
}
```

### Notification API (`engine.notify`)

```typescript
interface NotificationAPI {
  notify(options: NotificationOptions): Promise<void>;
}

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string; // emoji or path
  silent?: boolean;
  urgency?: 'low' | 'normal' | 'critical';
}
```

### Clipboard API (`engine.clipboard`)

```typescript
interface ClipboardAPI {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
  readImage(): Promise<string>; // data URL
  writeImage(dataUrl: string): Promise<void>;
}
```

### Skin Lifecycle Events

```typescript
// Engine emits these events
engine.on('dtm:skin-changed', (skin: SkinManifest) => { /* ... */ });
engine.on('dtm:open-switcher', () => { /* ... */ });
engine.on('dtm:skin-unload', (skinId: string) => { /* ... */ });

// Skin registers cleanup
engine.onSkinUnload(skinId: string, cleanupFn: () => void): void;
```

---

## Skin Lifecycle

### 1. Discovery
`SkinManager` scans `src/skins/` for `manifest.json` files via IPC.

### 2. Validation
Manifest validated against schema (required fields, types, capability identifiers).

### 3. Loading
`SkinManager.switchSkin(id)` → viewport iframe `src` set to skin's `entry`.

### 4. Initialization (Skin Code)
```javascript
// In your desktop.js
document.addEventListener('DOMContentLoaded', () => {
  // 1. Cache DOM elements
  // 2. Set up event listeners
  // 3. Start timers/intervals (store IDs!)
  // 4. Register cleanup: engine.onSkinUnload('your-id', cleanup)
  // 5. Restore session state
});
```

### 5. Running
- Handle user interactions
- Create windows via `engine.windows.create()` or internal window system
- Use `engine.fs` for filesystem operations
- Respond to engine events

### 6. Switching Away (Cleanup)
```javascript
function cleanup() {
  // REQUIRED — Must dispose of ALL resources:
  
  // ✓ Clear ALL intervals/timeouts
  if (clockInterval) clearInterval(clockInterval);
  
  // ✓ Cancel ALL animation frames
  if (animFrameId) cancelAnimationFrame(animFrameId);
  
  // ✓ Remove ALL event listeners (use AbortController or named handlers)
  document.removeEventListener('click', handleClick);
  
  // ✓ Close ALL audio contexts
  if (audioCtx) audioCtx.close();
  
  // ✓ Stop ALL media streams
  stream?.getTracks().forEach(t => t.stop());
  
  // ✓ Disconnect ALL observers
  observer?.disconnect();
  
  // ✓ Remove dynamically created DOM elements
  dynamicElements.forEach(el => el.remove());
  
  // ✓ Close internal windows
  windows.forEach(win => win.close());
  
  // ✓ Clear global references
  window.YourSkin = null;
}
```

### 7. Disposal
Viewport navigates to new skin → old skin's JS context discarded.

---

## Security Model

### Sandbox Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                      MAIN PROCESS                           │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │  Allowlist  │  │  Path       │  │  IPC               │  │
│  │  Enforcement│  │  Validation │  │  Validation        │  │
│  └─────────────┘  └─────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  CONTEXT BRIDGE   │
                    │   (preload.js)    │
                    │  ┌─────────────┐  │
                    │  │ context     │  │
                    │  │ Bridge      │  │
                    │  │ Exposed APIs│  │
                    │  └─────────────┘  │
                    └─────────┬─────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SKIN IFRAME (sandboxed)                │   │
│  │  • No nodeIntegration                               │   │
│  │  • No contextIsolation bypass                       │   │
│  │  • No direct require/electron/fs/process            │   │
│  │  • All privileged ops via window.DTM.engine         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Skin Code Restrictions

**NEVER do these in skin code:**
- ❌ `require('electron')` or `require('fs')` or any Node built-in
- ❌ `process.*` or `global.*` or `Buffer`
- ❌ `window.require` or `window.process`
- ❌ `fetch('file://...')` or `file:` URLs
- ❌ `new WebSocket('ws://localhost:...')` to local ports
- ❌ `eval()` / `Function()` on untrusted input
- ❌ Access `parent` or `top` window properties
- ❌ Modify `window.DTM.engine` or preload exports

**ALWAYS do these:**
- ✅ Use `window.DTM.engine.fs` for filesystem
- ✅ Use `window.DTM.engine.process.spawn()` for executables
- ✅ Use `window.DTM.engine.windows` for engine windows
- ✅ Register cleanup via `engine.onSkinUnload()`
- ✅ Keep all code in ES modules (`type="module"`)
- ✅ Scope CSS with skin-specific prefixes or CSS modules

### Content Security Policy

The skin iframe loads with:
```
Content-Security-Policy: 
  default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:;
  script-src 'self' 'unsafe-inline' 'unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'self';
```

---

## Development Workflow

### Creating a New Skin

```bash
# 1. Copy template
cp -r templates/skin-template src/skins/my-awesome-os

# 2. Edit manifest.json
#    - Set unique id, name, era, version, description
#    - Choose capabilities
#    - Set themeColor

# 3. Implement your OS in desktop.html/css/js
#    - Replace ALL template code with authentic implementation
#    - Use CSS custom properties for design tokens
#    - Load authentic fonts via @font-face from assets/fonts/

# 4. Add assets
#    - assets/icons/ — system icons
#    - assets/cursors/ — .cur/.ani files
#    - assets/sounds/ — .wav/.ogg system sounds
#    - assets/wallpapers/ — default wallpapers
#    - assets/preview.png — 800×600 screenshot

# 5. Test
npm run dev
# Open Era Switcher (F8), select your skin

# 6. Run full test suite
npm test
```

### Hot Reload

During development (`npm run dev`), the renderer supports HMR for skin code. The skin's `cleanup()` is called before hot-reload.

### Debugging

```javascript
// In skin code — access engine for debugging
console.log('[MySkin] Engine:', window.DTM.engine);

// Inspect skin manager
console.log('[MySkin] Skins:', window.DTM.skins.getAvailableSkins());

// Force skin switch (for testing)
window.DTM.skins.switchSkin('windows95');
```

---

## Testing Checklist

Before submitting a skin:

- [ ] `manifest.json` validates (all required fields, correct types)
- [ ] Skin loads without console errors
- [ ] Desktop background renders correctly
- [ ] Icons appear and respond to click/double-click
- [ ] Context menu works on desktop right-click
- [ ] Start menu / launcher opens and launches apps
- [ ] Windows can be created, dragged, resized, minimized, maximized, closed
- [ ] Taskbar / dock / panel shows running apps correctly
- [ ] Clock updates (if applicable)
- [ ] Switching to another skin and back works (no stale state)
- [ ] `cleanup()` runs on switch (no memory leaks, no orphaned timers)
- [ ] No direct Electron/Node API access in skin code
- [ ] Preview screenshot exists at `assets/preview.png` (800×600)
- [ ] Era Switcher card displays correctly (name, era, version, icon, preview)

---

## Version Compatibility

| Engine Version | Skin Spec Version | Notes |
|----------------|-------------------|-------|
| 1.0.x | 1.0 | Initial release |

Skins declare `engineCompatibility: "1.0"` — the Skin Manager will warn on mismatch.

---

## Migration Guide

### From Ad-hoc Skin to SDK Skin

If you have an existing skin not using the SDK:

1. Add `manifest.json` with all required fields
2. Wrap initialization in `DOMContentLoaded` + `engine.onSkinUnload()` registration
3. Move all `setInterval`/`setTimeout` IDs to arrays for cleanup
4. Replace any direct `fetch`/`electron` calls with `engine.fs`/`engine.process`
5. Add `previewImage` and `themeColor`
6. Test skin switching cycle 5+ times

---

## Resources

- [API Reference](./SKIN_API_REFERENCE.md) — Complete TypeScript definitions
- [Manifest Spec](./SKIN_MANIFEST_SPEC.md) — JSON Schema + validation rules
- [LLM Generation Guide](./LLM_SKIN_GENERATION.md) — Prompt for AI skin generation
- [Examples](./SKIN_EXAMPLES.md) — Annotated Windows 95 & Mac OS 8 implementations
- [Template](../templates/skin-template/) — Copy this to start

---

*This document is the authoritative SDK specification. If implementation differs from this document, the implementation is wrong — file an issue or fix the code.*