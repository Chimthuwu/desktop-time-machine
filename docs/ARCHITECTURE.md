# Desktop Time Machine — Architecture Specification

## 1. Overview & Vision

**Desktop Time Machine** is an Electron-based desktop platform for Windows 10 and Windows 11 that transforms the computer into a collection of historically inspired retro operating system desktop environments.

Unlike virtual machines or emulators, Desktop Time Machine operates under the architectural principle:
> **ONE SHARED ENGINE, MANY RETRO ENVIRONMENTS.**

All environments share the same underlying host hardware, filesystem, and applications while delivering authentic, historically accurate desktop layouts, window decorations, controls, sounds, and interactions.

```
+---------------------------------------------------------------------------------+
|                                WINDOWS 10 / 11 HOST                             |
+---------------------------------------------------------------------------------+
                                      |
                       +-------------------------------+
                       | Electron Main Process         |
                       | - Window & Display Manager    |
                       | - Security & Permissions      |
                       | - System Integration (IPC)    |
                       +-------------------------------+
                                      |
                       +-------------------------------+
                       | Controlled Preload Bridge     |
                       | (contextIsolation: true)      |
                       +-------------------------------+
                                      |
                       +-------------------------------+
                       | DTM Core Engine (Renderer)    |
                       | - Event Bus & State           |
                       | - Skin Manager & Registry     |
                       | - Time Machine Era Switcher   |
                       +-------------------------------+
                                      |
           +--------------------------+--------------------------+
           |                                                     |
+-----------------------------+               +-----------------------------+
 | One active skin in iframe   |               | Electron main process       |
 | (eight are registered):     |               | - Validated IPC handlers    |
 | Windows 95 / 98 / XP        |               | - Real filesystem/Windows   |
 | Mac OS 8 / Mac OS X         |               | - Browser engine + webviews |
 | Amiga / BeOS / TempleOS     |               | - Least-privilege permissions|
+-----------------------------+               +-----------------------------+
```

---

## 2. Process Model & Security Boundaries

Desktop Time Machine enforces strict security practices to ensure that untrusted or generated skin components never compromise host stability or execute arbitrary privileged system commands.

### 2.1 Security Configuration
- **`contextIsolation: true`**: The renderer execution environment is isolated from Electron internal Node modules.
- **`nodeIntegration: false`**: Direct Node.js access (`require`, `process`, `Buffer`) is disabled in the renderer.
- **Preload Isolation**: Exposes only an approved, validated dictionary of asynchronous IPC handlers (`window.dtmPreload`).
- **Whitelisted Program Execution**: External program launching is strictly constrained to safe Windows utilities (`notepad.exe`, `calc.exe`, `mspaint.exe`, `explorer.exe`).
- **Path Verification**: Directory traversal and filesystem reads validate target paths to prevent illegal access.
- **External Web Safe Shell**: Outbound web requests and browser navigation are verified (`http:`, `https:`) and directed safely to `shell.openExternal`.

---

## 3. Core Engine Architecture

The engine lives in `src/core/` and provides the shared services:

### 3.1 Desktop Engine (`src/core/desktop-engine/engine.js`)
- Exposes `window.DTM` (and `window.parent.DTM`) to the environment.
- Manages host system info, uptime, memory, and architecture.
- Coordinates IPC requests with automatic fallback to mock browser data when tested in standalone development mode.
- Publishes engine events (`dtm:skin-changed`, `dtm:open-switcher`, `dtm:fullscreen-changed`).

### 3.2 Skin Manager (`src/core/skin-manager/skin-manager.js`)
- Discovers installed skins located in `src/skins/`.
- Parses and validates each skin's `manifest.json`.
- Maintains the registry of installed and roadmap environments.
- Manages skin switching and viewport updates.
- Persists user era preferences in `localStorage`.

### 3.3 Era Switcher & Museum (`src/components/SkinSwitcher/`)
- Visual gallery overlay styled with chronometer and retro aesthetics.
- Presents name, era/period, description, capabilities, and availability status.
- Triggered by hotkey (`F8` or `Ctrl+Shift+T`), desktop icon, Start menu, or shutdown dialog.

---

## 4. Skin Contract & Viewport Isolation

To guarantee that CSS rules and scripts from one operating system era do not leak into another:
- Each skin runs within an isolated viewport container.
- Each skin communicates with the host engine through `window.parent.DTM` or message events.
- Skins provide their own window styling, menus, taskbars, docks, and apps without polluting global styles.
