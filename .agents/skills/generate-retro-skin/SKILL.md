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
