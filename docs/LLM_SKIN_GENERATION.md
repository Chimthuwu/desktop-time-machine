# Desktop Time Machine — LLM Skin Generation Guide

**Version:** 1.0  
**Target:** External LLMs (Claude, GPT, Gemini, etc.)  
**Purpose:** Enable AI-assisted creation of historical desktop environment skins

---

## Overview

This document contains a **copy-paste master prompt** that you can give to another AI model to generate a complete, functional skin for Desktop Time Machine.

The generated skin will:
- Integrate properly with the shared engine
- Follow security boundaries (no direct Electron/Node access)
- Implement required lifecycle cleanup
- Use documented APIs only
- Be structurally valid for the Era Switcher

---

## Prerequisites for the Generating LLM

Before using the master prompt, ensure the target LLM has access to:

1. **This entire documentation set** (or at minimum):
   - `SKIN_SDK.md` — Architecture, lifecycle, APIs
   - `SKIN_API_REFERENCE.md` — Complete TypeScript definitions
   - `SKIN_MANIFEST_SPEC.md` — Manifest schema and rules
   - `SKIN_EXAMPLES.md` — Annotated Windows 95 & Mac OS 8 implementations

2. **The skin template** at `templates/skin-template/`:
   - `manifest.json` — Fill in your skin's metadata
   - `desktop.html` — Entry point structure
   - `desktop.css` — Design token system + base styles
   - `desktop.js` — Lifecycle, event handling, engine integration
   - `apps/example-app/` — Reference app implementation

---

## Master Prompt

> **COPY EVERYTHING BELOW THIS LINE AND PASTE INTO THE TARGET LLM**
> 
> ═══════════════════════════════════════════════════════════════════════

### ROLE

You are an expert desktop environment historian and frontend engineer. Your task: **generate a complete, functional skin for Desktop Time Machine** — a platform that recreates historical operating systems inside an Electron application.

### CONTEXT

**Desktop Time Machine** is NOT a theming engine. Each skin is a complete operating system recreation with its own:
- Window manager (dragging, resizing, minimizing, maximizing, z-order)
- Shell (Start menu, Apple menu, dock, Control Strip, Workbench dock, etc.)
- Desktop icons and interactions
- File manager
- System applications (calculator, notepad, paint, etc.)
- Authentic visual language (fonts, colors, cursors, sounds, animations)

**Architecture:**
- Skins run in **sandboxed iframes** — NO Node.js/Electron access
- **Shared engine** provides: filesystem, process execution (allowlisted), window management, system info, notifications, clipboard
- Access via `window.DTM.engine` (see API reference)
- **Lifecycle is mandatory** — every skin MUST implement `cleanup()` disposing ALL resources

### YOUR TASK

Given a target historical OS (e.g., "Windows XP Luna", "Amiga Workbench 3.1", "BeOS R5", "NeXTSTEP 3.3", "GEOS", "OS/2 Warp", "RISC OS", "Atari TOS", "Xerox Star", "Plan 9"), produce:

1. **`manifest.json`** — Complete metadata per `SKIN_MANIFEST_SPEC.md`
2. **`desktop.html`** — Semantic entry point with your OS's desktop structure
3. **`desktop.css`** — Complete styling using CSS custom properties for design tokens
4. **`desktop.js`** — Initialization, event handling, window management, engine integration, **cleanup()**
5. **At least 2–3 example applications** (calculator, notepad, file manager, etc.)
6. **Asset placeholders** — Document what fonts/cursors/sounds/wallpapers are needed

### CRITICAL RULES — VIOLATION = BROKEN SKIN

#### ❌ NEVER DO THESE
- Access `require('electron')`, `require('fs')`, `require('path')`, `process`, `Buffer`, `global`
- Use `window.require`, `window.process`, `nodeIntegration` tricks
- `fetch('file://...')` or any `file:` URLs
- `eval()` / `Function()` on untrusted input
- Access `parent`, `top`, or `window.parent` properties
- Modify `window.DTM.engine` or preload exports
- Assume capabilities not in `SKIN_API_REFERENCE.md`
- Invent new engine APIs — use only documented ones
- Skip `cleanup()` or leave resources undisposed
- Copy Windows 95 code and just recolour it — **each OS must feel authentic**

#### ✅ ALWAYS DO THESE
- Use `window.DTM.engine.fs` for ALL filesystem operations
- Use `window.DTM.engine.process.spawn()` for executables (allowlisted only)
- Use `window.DTM.engine.windows` for engine-level windows
- Register cleanup: `engine.onSkinUnload('your-skin-id', cleanup)`
- Define ALL colours as CSS custom properties in `:root`
- Load authentic fonts via `@font-face` from `assets/fonts/`
- Scope CSS with skin-specific prefix (`.yourskin-window`, `.yourskin-icon`)
- Implement authentic window chrome for YOUR OS (not Windows 95 chrome)
- Implement authentic shell paradigm (Start menu, Apple menu, Dock, Workbench, etc.)
- Handle skin switching: save/restore session state if applicable
- Test: 5+ skin switch cycles with no memory leaks

### DELIVERABLES

Produce a **complete directory structure** as code blocks:

```
src/skins/your-skin-id/
├── manifest.json
├── desktop.html
├── desktop.css
├── desktop.js
├── assets/
│   ├── fonts/          # Document required fonts (don't include binary)
│   ├── cursors/        # Document required cursors
│   ├── sounds/         # Document required sounds
│   ├── wallpapers/     # Document required wallpapers
│   └── preview.png     # Note: "Generate 800×600 screenshot"
└── apps/
    ├── calculator/
    │   ├── manifest.json
    │   ├── index.html
    │   ├── app.css
    │   └── app.js
    ├── notepad/
    │   ├── manifest.json
    │   ├── index.html
    │   ├── app.css
    │   └── app.js
    └── file-manager/
        ├── manifest.json
        ├── index.html
        ├── app.css
        └── app.js
```

### VALIDATION CHECKLIST

Before delivering, verify your generated code:

- [ ] `manifest.json` passes schema validation (all required fields, correct types)
- [ ] `desktop.html` loads without errors, has proper structure
- [ ] `desktop.css` uses only CSS custom properties for colours, no hardcoded hex
- [ ] `desktop.js` has `init()` and `cleanup()` with complete resource disposal
- [ ] `cleanup()` clears: intervals, timeouts, animation frames, event listeners, audio contexts, observers, DOM nodes
- [ ] No `require`, `process`, `fs`, `electron`, `Buffer` anywhere
- [ ] All engine access via `window.DTM.engine.*`
- [ ] Window management implements YOUR OS's chrome (not Win95)
- [ ] Shell paradigm matches YOUR OS (Start menu / Apple menu / Dock / Workbench)
- [ ] Apps demonstrate engine API usage (fs, process, notifications, clipboard)
- [ ] Asset requirements documented in `assets/README.md`

### REFERENCE IMPLEMENTATIONS

Study these existing skins for patterns (but DON'T copy their visual language):

**Windows 95** (`src/skins/windows95/`):
- Start button + taskbar + Start menu
- 3D bevel window chrome (raised/inset borders)
- Desktop icons with label selection
- Engine integration for Notepad, Paint, Minesweeper

**Mac OS 8** (`src/skins/macos8/`):
- Top menu bar with Apple menu
- Platinum grey dither background
- Control Strip
- Window shading (double-click titlebar)
- Trash bin with drag-drop

### OUTPUT FORMAT

Provide each file as a **separate code block** with the file path as comment:

```javascript
// src/skins/your-skin-id/manifest.json
{ ... }
```

```html
<!-- src/skins/your-skin-id/desktop.html -->
<!DOCTYPE html>...
```

```css
/* src/skins/your-skin-id/desktop.css */
:root { ... }
```

```javascript
// src/skins/your-skin-id/desktop.js
const YourSkin = (() => { ... })();
```

---

## Integration Instructions (For Human Reviewer)

After the LLM generates the skin:

1. **Copy files** to `src/skins/your-skin-id/`
2. **Add assets** — download authentic fonts, cursors, sounds, wallpapers to `assets/`
3. **Generate preview** — run the skin, take 800×600 screenshot as `assets/preview.png`
4. **Update manifest** — set `previewImage: "assets/preview.png"`
5. **Run tests** — `npm test` (must pass all existing tests)
6. **Manual verification** — 5 skin switch cycles, check Era Switcher card
7. **Code review** — verify no privileged API access, cleanup is complete
8. **Merge** — PR with screenshots

---

## Security Note for Reviewers

**Generated skins are untrusted until reviewed.**

- Do NOT implement runtime execution of generated JavaScript
- Do NOT dynamically load unreviewed skin code
- Integrate generated skins as **reviewed project modules** within existing security architecture
- The iframe sandbox + context bridge + allowlist enforcement protects the host
- Skin code runs with `nodeIntegration: false`, `contextIsolation: true`

---

## Example Invocation

```bash
# Human provides to LLM:
"Generate a Desktop Time Machine skin for 'Amiga Workbench 3.1' using the master prompt in LLM_SKIN_GENERATION.md. The skin should include: authentic Workbench dock, blue/orange palette, ram disk icons, CLI window, and at least Calculator and Notepad apps."
```

---

## Troubleshooting Common LLM Failures

| Failure | Cause | Fix |
|---------|-------|-----|
| Skin uses `require('fs')` | LLM ignored sandbox rule | Re-prompt: "NO Node.js APIs. Use `engine.fs` only." |
| No `cleanup()` function | LLM forgot lifecycle | Re-prompt: "Add complete cleanup() disposing ALL resources." |
| Window chrome looks like Win95 | LLM copied template | Re-prompt: "Implement AUTHENTIC [OS] window chrome. Study reference." |
| Manifest validation fails | Missing fields/types | Re-prompt: "Fix manifest per SKIN_MANIFEST_SPEC.md schema." |
| CSS uses hardcoded colours | LLM didn't use design tokens | Re-prompt: "ALL colours as CSS custom properties in :root." |
| Apps don't use engine APIs | LLM used mock data | Re-prompt: "Apps must call `engine.fs`, `engine.process`, etc." |

---

## Advanced: Multi-Pass Generation

For complex OSes (Windows XP, macOS X Aqua, KDE 3), use multiple passes:

**Pass 1:** Architecture & manifest only
> "Generate ONLY the manifest.json and desktop.html structure for [OS]. Define the shell paradigm, window chrome approach, and capability list."

**Pass 2:** CSS design tokens + base styles
> "Generate desktop.css with complete CSS custom property design tokens for [OS]. Include fonts, colours, spacing, borders, shadows, animations."

**Pass 3:** JavaScript lifecycle + window manager
> "Generate desktop.js with init/cleanup, window management (drag/resize/min/max/close/z-order), shell (Start menu/Dock/Workbench), and engine integration."

**Pass 4:** Applications
> "Generate Calculator, Notepad, and File Manager apps for [OS] using engine APIs."

**Pass 5:** Asset specification
> "List all required fonts, cursors, sounds, wallpapers for [OS] with source URLs."

---

## Legacy Prompt Template (Preserved for Reference)

```markdown
You are an expert retro computing historian and frontend engineer specializing in historical operating systems.

Your task is to build a complete, faithful, and historically authentic desktop environment skin for Desktop Time Machine.

### TARGET ENVIRONMENT:
- Operating System: [Insert Name, e.g., "Classic Mac OS 9" / "Windows XP Luna" / "Amiga Workbench 3.1" / "BeOS R5"]
- Era / Release Period: [Insert Year, e.g., "1999" or "2001"]

### ARCHITECTURAL RULES & CONTRACT:
1. Provide a folder with:
   - `manifest.json`
   - `desktop.html` (self-contained HTML/CSS/JS or accompanied by `desktop.css` and `desktop.js`)
2. The environment will be loaded inside the Desktop Time Machine viewport.
3. Access to host features MUST use the shared engine bridge:
   `const DTM = (window.parent && window.parent.DTM) ? window.parent.DTM : window.DTM;`
   - Real filesystem browsing: `DTM.system.listDirectory(path)`
   - Open file with host app: `DTM.system.openPath(path)`
   - Open URL in host browser: `DTM.system.openExternalUrl(url)`
   - Fullscreen toggle: `DTM.system.toggleFullScreen()`
   - Safe Exit to Windows: `DTM.system.exit()`
   - Trigger Era Switcher: `window.parent.postMessage('dtm:open-switcher', '*')`
4. NEVER call privileged Node.js APIs (`require('fs')`, `process`, etc.).
5. Forward the F8 key or Ctrl+Shift+T to trigger the Era Switcher.

### HISTORICAL AUTHENTICITY REQUIREMENTS:
- Typography & Fonts: Use authentic system font fallbacks.
- Color Palette & Bevels: Exact color codes, border gradients, button pressed states, and title bar styling of that OS.
- Layout:
  - If Windows: Bottom taskbar, Start button/menu, system tray, clock.
  - If Mac OS: Top menubar, Apple menu, window close/zoom boxes, Control Strip or Dock.
  - If BeOS: Yellow tabbed window title bars, Deskbar in top-right.
  - If Amiga: Top screen bar, blue/orange/grey styling, Ram Disk icon.
- Interactive Behaviors:
  - Draggable windows with active/inactive title bar styling.
  - Authentic close, minimize/shade, and zoom/maximize behaviors.
  - Desktop icons with selection states and double-click launching.
  - Context menus on right-click.
  - Shut down dialog with options to restart or exit safely back to host Windows.

### OUTPUT FORMAT:
Provide the complete `manifest.json` and the complete `desktop.html` ready to save directly into `src/skins/<skin-id>/`.
```

---

## Untrusted Code Safety Verification

When integrating skins generated by external LLMs:

1. **No Eval or Arbitrary Script Execution**: Validate that the generated skin does not contain `eval()`, `Function()`, or external unvetted `<script src="https://...">` tags.

2. **Preload Sandboxing**: Because the main application runs with `contextIsolation: true` and `nodeIntegration: false`, generated renderer code is physically prevented from accessing raw OS primitives or child processes.

3. **Whitelist Compliance**: All system interactions are mediated through `system-integration.js` and `permissions.js`.

---

*This guide is maintained in sync with the SDK. If APIs change, this document is updated.*