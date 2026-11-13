---
description: Development and security rules for Desktop Time Machine skins and engine
globs:
  - "src/skins/**"
  - "electron/**"
  - "src/core/**"
---

# Desktop Time Machine Architecture & Security Rules

1. **Strict Process & Sandbox Boundaries**:
   - `contextIsolation: true` and `nodeIntegration: false` must ALWAYS be maintained.
   - Renderer scripts and skins must NEVER attempt to require or import Node.js built-ins (`fs`, `child_process`, `os`).
   - All host interactions must strictly flow through the controlled bridge: `const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : window.DTM;`.

2. **Skin Contract Compliance**:
   - Every skin must reside in `src/skins/<skin-id>/` and include a valid `manifest.json`.
   - Entry point is designated in `manifest.json` (typically `desktop.html`).
   - The skin must listen for or forward `<kbd>F8</kbd>` and `<kbd>Ctrl+Shift+T</kbd>` via `window.parent.postMessage('dtm:open-switcher', '*')` to invoke the Era Switcher.

3. **Historical Fidelity**:
   - Preserve authentic typography, window styling, borders, and interaction patterns (e.g., 3D grey bevels for Win95, Platinum and pinstripes for Classic Mac, yellow tabbed titles for BeOS).
   - Real Windows integrations (file browsing, application launching, external web navigation) must preserve the retro visual shell.
