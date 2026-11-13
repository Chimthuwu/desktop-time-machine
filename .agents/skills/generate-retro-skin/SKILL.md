---
name: generate-retro-skin
description: Guide and generate faithful retro operating system desktop skins for Desktop Time Machine
---

# Generate Retro Desktop Skin Skill

Use this procedure to author a historically accurate desktop environment skin for Desktop Time Machine.

## Procedure

1. **Research Target OS Visual & Interactive Identity**:
   - Palette, beveled border styles, and typography.
   - Titlebar controls (e.g. Win95 `_ □ ×`, Mac OS close/zoom/collapse, BeOS tabbed header).
   - Desktop paradigm (Start button/taskbar, Apple menubar + Control Strip, or Deskbar).

2. **Create Skin Directory & Manifest**:
   - Directory: `src/skins/<skin-id>/`
   - Manifest: `src/skins/<skin-id>/manifest.json` with fields:
     `id`, `name`, `period`, `version`, `description`, `author`, `entry`, `engineCompatibility`, `status`, `icon`, `capabilities`.

3. **Implement Entry Point (`desktop.html`)**:
   - Establish bridge:
     ```javascript
     const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : window.DTM;
     ```
   - Wire standard interactions:
     - Window dragging & z-index focus.
     - Double click window title bar behavior (maximize for Windows, shade/collapse for Mac OS).
     - F8 hotkey forwarding: `window.parent.postMessage('dtm:open-switcher', '*')`.
     - Shut Down dialog with options for safe host exit via `DTM.system.exit()`.
     - Real filesystem integration via `DTM.system.listDirectory(path)` and `DTM.system.openPath(path)`.

4. **Verify Isolation**:
   - Ensure the skin does not assume global variables outside its viewport.
   - Confirm all host interactions use `DTM.system`.

## Electron Gotchas (learned 2026-11-14, cost ~10 debug cycles)

1. **`window.prompt()` throws in Electron renderers.** It is not supported at all — any skin flow using it (New Folder, Rename, Run, Save As, Find) silently dies. Use an in-skin modal (`hostPrompt` in win95/win98/macos8 `desktop.html`) returning a Promise. `confirm()`/`alert()` DO work.
2. **Testing real hover (`:hover` submenus) in Electron:** `webContents.sendInputEvent` mouseMove does NOT reliably update CSS `:hover`. Attach `webContents.debugger` and use CDP `Input.dispatchMouseEvent` (`mouseMoved`/`mousePressed`/`mouseReleased`) — same coordinates Chromium uses.
3. **A single synthetic mousemove gets coalesced** — hover state may not update (flaky between runs). Step the move in ~5 increments with small sleeps, then probe `:hover` via `document.querySelectorAll(':hover')`.
4. **Iframe coordinate math:** element rect (in iframe) + `iframe.getBoundingClientRect()` (in parent) = parent-viewport coords for CDP input. `display:none` elements return zero rects — open the parent menu first.
5. **textContent matching for menu items is a trap:** a parent item's `textContent` includes its nested submenu's text (Accessories "contains" Notepad). Strip `.submenu` descendants from a clone before comparing labels.
6. **Renderer errors in tests:** listen to `webContents 'console-message'` (level ≥ 2) — `executeJavaScript` failures otherwise surface only as "Script failed to execute".
