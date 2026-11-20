# Desktop Time Machine — Skin Manifest Specification

**Version:** 1.0  
**Format:** JSON  
**Validation:** `window.DTM.sdk.validateManifest(manifest, folderName)` or IPC `dtm:validate-manifest`

---

## Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://desktop-time-machine.org/schemas/skin-manifest-1.0.json",
  "title": "Desktop Time Machine Skin Manifest",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "name",
    "era",
    "period",
    "version",
    "description",
    "author",
    "entry",
    "engineCompatibility",
    "status",
    "icon",
    "themeColor",
    "previewImage",
    "capabilities"
  ],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^[a-z0-9-]+$",
      "minLength": 1,
      "maxLength": 64,
      "description": "Unique kebab-case identifier. Used for registry keys, storage, and IPC."
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "description": "Human-readable display name for the Era Switcher and UI."
    },
    "era": {
      "type": "string",
      "minLength": 1,
      "maxLength": 32,
      "description": "Historical year or period (e.g., '1995', '1985–1993', '2001')."
    },
    "period": {
      "type": "string",
      "minLength": 1,
      "maxLength": 32,
      "description": "Alias for era, used by Era Switcher badge. Usually same as era."
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+(-[a-z0-9.-]+)?$",
      "description": "Semantic version (MAJOR.MINOR.PATCH[-PRERELEASE])."
    },
    "description": {
      "type": "string",
      "minLength": 10,
      "maxLength": 500,
      "description": "One-paragraph description of the OS and what makes it unique."
    },
    "author": {
      "type": "string",
      "minLength": 1,
      "maxLength": 64,
      "description": "Creator name or organization."
    },
    "entry": {
      "type": "string",
      "pattern": "^[./a-zA-Z0-9_-]+\\.html$",
      "description": "Entry point HTML file, relative to skin directory. Must be 'desktop.html' or similar."
    },
    "engineCompatibility": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+(\\.\\d+)?$",
      "description": "Engine version this skin targets (e.g., '1.0'). Format is checked; compatibility is not yet enforced."
    },
    "status": {
      "type": "string",
      "enum": ["ready", "roadmap", "beta", "deprecated"],
      "description": "Ready = fully functional. Other values are displayed but not loadable in the Era Switcher."
    },
    "icon": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4,
      "description": "Single emoji or 1-2 character symbol for Era Switcher card."
    },
    "themeColor": {
      "type": "string",
      "pattern": "^#[0-9a-fA-F]{6}$",
      "description": "Hex color for accent theming in Era Switcher and UI."
    },
    "previewImage": {
      "type": ["string", "null"],
      "description": "Relative path to screenshot (800×600 recommended). Null if not yet available."
    },
    "capabilities": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "pattern": "^[a-z-]+$"
      },
      "description": "Array of capability identifiers. See SKIN_SDK.md for standard list."
    },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "developer": {
          "type": "string",
          "maxLength": 64,
          "description": "Original OS vendor/developer."
        },
        "releaseDate": {
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
          "description": "Original release date (YYYY-MM-DD)."
        },
        "successor": {
          "type": "string",
          "maxLength": 64,
          "description": "Next version/OS in the lineage."
        },
        "kernelFamily": {
          "type": "string",
          "maxLength": 64,
          "description": "Kernel family (e.g., 'Win9x', 'Classic Mac OS', 'NT', 'Linux')."
        },
        "historicalNote": {
          "type": "string",
          "maxLength": 1000,
          "description": "Interesting historical context for the Era Switcher."
        }
      }
    },
    "dependencies": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "engine": {
          "type": "string",
          "pattern": "^\\d+\\.\\d+(\\.\\d+)?$",
          "description": "Minimum engine version required."
        }
      }
    }
  }
}
```

---

## Field Details

### `id` (Required)
- **Format:** `^[a-z0-9-]+$` (kebab-case, lowercase, alphanumeric + hyphen)
- **Examples:** `windows95`, `macos8`, `amiga-workbench`, `windows-xp-luna`
- **Used for:** Registry key, localStorage key, IPC routing, directory name
- **Must match:** The directory name under `src/skins/`

### `name` (Required)
- **Format:** Free text, max 64 chars
- **Examples:** `"Windows 95"`, `"Mac OS 8"`, `"Amiga Workbench 3.1"`
- **Used for:** Era Switcher card title, window titles, notifications

### `era` / `period` (Required)
- **Format:** Free text, max 32 chars
- **Examples:** `"1995"`, `"1997"`, `"1985–1993"`, `"2001"`
- **Used for:** Era Switcher period badge, sorting
- **Note:** `period` is an alias used by legacy code; both should be present

### `version` (Required)
- **Format:** Semantic versioning `MAJOR.MINOR.PATCH[-PRERELEASE]`
- **Examples:** `"1.0.0"`, `"0.1.0"`, `"2.3.1-beta.2"`
- **Used for:** Update checks, compatibility, Era Switcher display

### `description` (Required)
- **Format:** 10–500 characters
- **Guidelines:** One paragraph. Mention key UI paradigms, historical significance, unique features.
- **Example:** `"The classic Macintosh Platinum appearance with authentic grey dither background, top menu bar, Apple menu, and Control Strip."`

### `author` (Required)
- **Format:** Free text, max 64 chars
- **Examples:** `"Desktop Time Machine"`, `"Community"`, `"Jane Developer"`

### `entry` (Required)
- **Format:** Relative path to HTML file, must end in `.html`
- **Standard:** `"desktop.html"` (at skin root)
- **Must exist:** File must exist at `src/skins/<id>/<entry>`

### `engineCompatibility` (Required)
- **Format:** Major.Minor (e.g., `"1.0"`)
- **Behavior:** Skin Manager logs warning if `engine.version` major/minor doesn't match

### `status` (Required)
| Value | Meaning | Era Switcher Behavior |
|-------|---------|----------------------|
| `ready` | Fully functional, tested | Clickable "Transport to [era]" button |
| `roadmap` | Planned, not implemented | Disabled "In Development" button |
| `experimental` | Partial, may have bugs | Clickable with warning badge |

### `icon` (Required)
- **Format:** Single emoji (preferred) or 1–2 Unicode chars
- **Examples:** `"🪟"`, `"💻"`, `"💾"`, `"⚡"`, `"🖼️"`
- **Used for:** Era Switcher card icon, taskbar/dock representation

### `themeColor` (Required)
- **Format:** 6-digit hex `#RRGGBB`
- **Examples:** `#008080` (teal), `#888888` (platinum), `#000080` (navy), `#ffcc00` (amber)
- **Used for:** Era Switcher card accent, active skin highlight, window chrome tint

### `previewImage` (Optional, nullable)
- **Format:** Path relative to `src/index.html` (the shell document), or `null`. For example `"../screenshots/gallery-my-skin.png"`.
- **Recommended:** a wide PNG screenshot; a missing file degrades to the themed placeholder.
- **Used for:** Era Switcher card preview image
- **If null:** Placeholder icon shown with themeColor background

### `capabilities` (Required)
- **Format:** Array of kebab-case strings, min 1 item, unique
- **Standard list:** See [SKIN_SDK.md](./SKIN_SDK.md#capability-identifiers)
- **Custom allowed:** Yes, but Era Switcher won't have predefined labels
- **Used for:** Era Switcher capability tags, filtering, compatibility

### `meta` (Optional, Recommended)
Historical metadata displayed in Era Switcher "Details" view and About dialogs.

| Field | Format | Example |
|-------|--------|---------|
| `developer` | String | `"Microsoft"`, `"Apple Computer"`, `"Commodore"` |
| `releaseDate` | YYYY-MM-DD | `"1995-08-24"` |
| `successor` | String | `"Windows 98"`, `"Mac OS 9"` |
| `kernelFamily` | String | `"Win9x"`, `"Classic Mac OS"`, `"NT"` |
| `historicalNote` | String (≤1000 chars) | `"First Windows with Start button..."` |

### `dependencies` (Optional)
Future-proofing for engine version constraints.

```json
"dependencies": {
  "engine": "1.0"
}
```

---

## Validation Rules

### What the current validator checks
The main-process validator returns `{ valid, errors }` and checks:

1. Required fields: `id`, `name`, `era`, `version`, `entry`, `engineCompatibility`, `status`.
2. `id` matches the skin directory name.
3. `status` is one of `ready`, `roadmap`, `beta`, `deprecated`.
4. Optional string fields have the correct type and `icon` is not empty.
5. `capabilities` is an array of strings when present.
6. `entry` is a `.html` filename with no path separators.
7. `engineCompatibility` has a numeric major/minor format.
8. The `entry` file exists on disk (reported by discovery, not by `sdk.validateManifest`).

A manifest with errors is still registered so one bad skin cannot break the app; the errors are logged and surfaced by the validation API. Missing preview images degrade to the themed placeholder. There is no `warnings` array and no CLI validation script in this release.

---

## Validation API

### In Renderer (Skin Code)
```javascript
const result = await window.DTM.sdk.validateManifest(manifestObject, folderName);
// result: { valid: boolean, errors: string[] }
```

### In Main Process (IPC)
```javascript
// From main process or preload
const result = await ipcRenderer.invoke('dtm:validate-manifest', manifestObject, folderName);
```

### Automated check
`npx electron test/phase4-skins.js` verifies that every discovered manifest
validates, that its preview asset resolves and that the fallback registry
matches the manifests.

---

## Example Manifests

### Windows 95 (Complete)
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
    "historicalNote": "First Windows version to include the Start button and taskbar. Sold 7 million copies in five weeks. Introduced Plug and Play, long file names, and 32-bit application support."
  }
}
```

### Mac OS 8 (Complete)
```json
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
    "historicalNote": "Mac OS 8 sold 1.2 million copies in its first two weeks and introduced the Platinum visual theme. It was the last major release before Apple's acquisition of NeXT and the transition to Mac OS X."
  }
}
```

### Roadmap Skin (Minimal)
```json
{
  "id": "windows98",
  "name": "Windows 98",
  "era": "1998",
  "period": "1998",
  "version": "0.1.0",
  "description": "Active Desktop era with web integration, gradient title bars, Quick Launch toolbar, and enhanced multimedia.",
  "author": "Community",
  "entry": "desktop.html",
  "engineCompatibility": "1.0",
  "status": "roadmap",
  "icon": "🪟",
  "themeColor": "#0066cc",
  "previewImage": null,
  "capabilities": [
    "active-desktop",
    "quick-launch",
    "multimedia"
  ]
}
```

---

## Migration from Legacy Manifests

If you have an existing skin with an old manifest format:

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `period` | `era` + `period` | Duplicate value to both |
| (missing) | `version` | Add `"1.0.0"` |
| (missing) | `engineCompatibility` | Add `"1.0"` |
| (missing) | `status` | Add `"ready"` |
| (missing) | `icon` | Add appropriate emoji |
| (missing) | `themeColor` | Add dominant OS color |
| (missing) | `previewImage` | Add `null` or screenshot path |
| `features` | `capabilities` | Rename, use standard identifiers |

---

## File Placement

```
src/skins/
├── windows95/
│   ├── manifest.json          ← HERE
│   ├── desktop.html
│   ├── desktop.css
│   ├── desktop.js
│   └── assets/
│       └── preview.png        ← previewImage points here
└── macos8/
    ├── manifest.json          ← HERE
    └── ...
```

The `id` field **must match** the directory name exactly.

---

*This specification is validated by `electron/main/ipc-handlers.js` → `validate-manifest` and `src/core/skin-manager/skin-manager.js` on load.*