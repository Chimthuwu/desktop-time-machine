# Phase 4 — Platform Reliability, Security & Architecture

**Date:** 2026-11-21  
**Repository:** https://github.com/Chimthuwu/desktop-time-machine

## AUDIT

### Confirmed security risks (from current HEAD, not previous reports)

1. **Critical — renderer-controlled shell execution.** `dtm:terminal-run` passed a renderer string directly to PowerShell via `spawn(..., '-Command', script)`. Any script running in the skin iframe could execute arbitrary commands as the current Windows user.
2. **Critical — no IPC sender authorization.** Roughly 65 `ipcMain.handle` channels accepted calls from any WebContents without checking origin, including filesystem write/delete, `openPath`, `shell-taskbar` and system controls.
3. **Critical — blanket permission grants.** `setPermissionRequestHandler` approved media, display capture, geolocation, notifications and clipboard reads for every origin; `setPermissionCheckHandler(() => true)` answered every check positively; `setDisplayMediaRequestHandler` silently selected the first screen source with `useSystemPicker: false`.
4. **High — path policy was a blacklist.** UNC paths, 8.3 short names, trailing dot/space components, reserved device names in parent folders and junctions into protected trees could evade validation. `isProtectedPath` used lexical normalization only.
5. **High — top-frame navigation check** only tested `startsWith('file://')`, so `file://attacker-host/share/page.html` could load remote content into the privileged window.
6. **Medium — webview hardening was applied only to the startup window**, not windows recreated on macOS `activate`.
7. **Medium — browser engine URL validation** accepted `file:` and `about:` URLs from renderer input.
8. **Medium — preload `on(channel, cb)`** allowed subscription to any main-process event channel.
9. **Reliability — restart listeners** (`activeDrags`, rubber band, document pointerdown) were not removed on `unmountDesktop`, so remounting into the same document retained stale closures. Startup failure left a blank viewport with no recovery UI. `engine.currentSkin` was permanently stale.

### Skin/documentation findings

- 8 registered skins; manifests were mostly valid, but `macosx` had an empty `icon`, no `themeColor`, and `windows98` advertised a blue theme over a teal desktop.
- Fallback registry and manifests disagreed on authors, names, periods, capabilities and icons; manifests are authoritative in Electron mode, fallbacks are used in browser mode.
- Docs described APIs that do not exist (`DTM.engine`, `process`, `windows`, `notify`, `clipboard`, `onSkinUnload`), a wrong `previewImage` base, an outdated status enum, stale absolute paths and links that did not resolve.

## IMPLEMENTED

### Security

- `electron/security/permission-policy.js` — pure, testable least-privilege policy. No permission is granted automatically; only the harmless `fullscreen` check is allowed. Display capture uses the OS picker with no automatic source selection.
- `electron/main/main.js` — uses the policy for request/check/display-media handlers on both sessions; removed silent screen selection.
- `electron/main/window-manager.js` — hardens webviews for **every** window; navigation restricted to local files under the application root.
- `electron/main/ipc-handlers.js` — all 65 handlers wrapped with sender verification (`isTrustedRendererUrl`) restricted to the app's own `file://` origin. Manifest validation now checks field types, empty icons, capability item types, `.html` entry filenames, and reports missing entry files.
- `electron/preload/index.js` — event subscription allowlisted to `dtm:fs-changed` and `dtm:fs-icons-changed`.
- `electron/main/desktop-integration.js` — terminal backend replaced with a shell-free allowlist (`help`, `ver`, `date`, `time`, `echo`, `pwd`, `whoami`, `dir`, `type`) and metacharacter rejection; Windows 95 terminal help updated.
- `electron/security/permissions.js` — path normalization strips trailing dots/spaces, rejects UNC, device namespaces, 8.3 short names and reserved names anywhere; canonicalizes through the nearest existing ancestor so junctions cannot evade checks; `isProtectedPath` uses both lexical and canonical forms.
- `electron/main/system-integration.js` — `openPath` also rejects protected system/profile roots.
- `electron/main/chromium.js`, `waterfox.js` — external browser URLs validated with `isSafeExternalUrl` (http/https only); `safeUrl` exported for tests.

### Reliability and skin consistency

- `src/core/desktop-mirror/desktop-mirror.js` — mount-scoped listener disposers removed on unmount; unmount catches async `unwatch` rejections.
- `src/core/desktop-engine/engine.js` — removed stale `currentSkin` state.
- `src/index.html` — startup errors now show a recoverable overlay with Retry instead of a blank viewport.
- `src/core/skin-manager/skin-manager.js` — fallback registry aligned with manifests (id/name/era/period/author/icon/themeColor/previewImage/capabilities) so browser mode matches Electron mode.
- `src/skins/macosx/manifest.json` — added `icon` and `themeColor`, formatted consistently, added `meta`.
- `src/skins/windows98/manifest.json` — theme color corrected to the actual teal.
- `src/skins/windows95/desktop.html` — terminal help no longer claims arbitrary PowerShell execution.

### Testing

- `test/phase4-security.js` — 39 assertions covering permission policy, trusted origins, path hardening (including a real junction), browser URL validation, terminal allowlist, IPC sender rejection and preload event allowlist.
- `test/phase4-skins.js` — 13 assertions covering 8-skin discovery, manifest validation, fallback drift, preview resolution, switch isolation, repeated mount/unmount and browser fallback.
- `package.json` — added `test:security`, `test:skins` and `verify` scripts.

### Documentation

- `README.md` rewritten: all 8 skins, accurate capabilities, setup/dev commands, browser-mode limitations, accurate security model, relative documentation links.
- `docs/ARCHITECTURE.md`, `SKIN_API_REFERENCE.md`, `SKIN_SDK.md`, `SKIN_MANIFEST_SPEC.md`, `LLM_SKIN_GENERATION.md`, `SKIN_EXAMPLES.md`, `templates/skin-template/README.md` — stale paths corrected, implementation-status notes added, API bridge and manifest rules corrected.
- `launch-dtm.bat` uses `%~dp0`; `todo.md` rewritten as current status; stale path in `PHASE_3_REPORT.md` fixed.

## VERIFICATION

Commands executed from the repository root:

| Command | Result |
|---|---|
| `npm test` | Passed — `errors: []` (all 8 skins) |
| `npx electron test/security-regressions.js` | 41 passed, 0 failed |
| `npx electron test/phase4-security.js` | 39 passed, 0 failed, 0 skipped |
| `npx electron test/phase4-skins.js` | 13 passed, 0 failed, 0 skipped |
| `npx electron test/mirror-smoke.js` | Real desktop mirror rendered for Windows 95/98/Mac OS 8, `consoleErrors: []` |
| `npm run verify` | All of the above passed |
| `node --check` on all changed `.js` files | No syntax errors |
| `git diff --check` | No whitespace errors |
| Markdown link resolver over changed docs | All relative links resolve |
| `electron .` smoke launch (10s) | Started cleanly; retro-browser provisioning reported ready |
| `npm run screenshots` (previous phase) | 3 gallery images generated |

No lint configuration exists in the repository; `node --check` was used as the available build-level check.

## REMAINING / DEFERRED

- **Installer integrity:** `dtm:browser-ensure` still downloads and silently installs Ungoogled Chromium without signature/hash verification. This is a supply-chain concern; verifying third-party release artifacts requires a pinned manifest or signature policy and is deferred.
- **Filesystem policy remains host-wide:** `isSafePath` is a hardened blacklist, not a virtual root. A malicious local skin that is already installed can still reach most of the user's files. A virtual disk belongs to Phase 5.
- **Discord camera/microphone:** permissions are now denied by default, so real-time media features require a future explicit user-consent flow.
- **Long-hanging Electron/Windows behaviour** (native tray integration, real screen-share picker) could not be exercised in this environment; the policy logic was verified directly, not the OS dialogs.
- **Historical docs** (`SKIN_EXAMPLES.md`, parts of `SKIN_API_REFERENCE.md`) still contain aspirational APIs; prominent status notes now mark them as planned. A full rewrite is deferred.

## NEXT PHASE READINESS

**Ready to begin Phase 5: Virtual Computer Foundation.** The platform now has verified IPC authorization, least-privilege permissions, hardened path handling, deterministic skin lifecycle and consistent manifests. A persistent virtual disk can be introduced as a new engine capability without repairing the platform first; the existing real-host filesystem API should remain the default until the virtual filesystem is explicitly selected.
