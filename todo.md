# SkinsOS — Project Status

## Messenger 7 skin (in progress, 2026-11-25)

- [x] A: Shell windows rebuild on live skin switch: Discord/browser windows whose chrome flavour changes are closed (F4 from the 2026-11-22 audit).
- [x] A: `msnmessenger` skin (contact list, taskbar, desktop mirror) registered and discovered.
- [x] A: MSN chrome for the Discord window (`.dtmshell-win.msn`, `chromeFlavor()` in `shell-apps.js`).
- [x] A: `test/msn-skin.js` regression suite (`npm run test:msn`).
- [ ] B: optional "Messenger look" accent stylesheet injected into the Discord page (first pass in `shell-apps.js`, needs live check).
- [ ] Verify the Discord page recolours with the toggle on, and check the mirrored icons do not sit under the contact window.

## Completed foundations

- [x] Shared filesystem service in the Electron main process with validated IPC: list/stat/read/write/mkdir/rename/copy/move/remove/drives/special folders.
- [x] `engine.fs` namespace plus an in-memory mock for browser development.
- [x] `permissions.js`: device namespace, UNC, short-name, reserved-name, junction and sensitive-path checks; protected-path levels; pinned executable allowlist.
- [x] Real desktop mirror across all registered skins with per-skin icon positions and live filesystem update handling.
- [x] Mac OS X Aqua skin (`desktop.js`, `apps.js`, `finder.js`, `desktop.css`), registered and tested.
- [x] All eight skins registered: Windows 95, Windows 98, Windows XP, Mac OS 8, Mac OS X, Amiga Workbench, BeOS, TempleOS.
- [x] Verification suites: `npm test`, `security-regressions.js`, `phase4-security.js`, `phase4-skins.js`, `mirror-smoke.js`, `capture-gallery.js`.
- [x] Documentation corrected: current OS list, relative links, accurate API and security descriptions.

## Phase 4 focus (reliability and security)

- [x] Least-privilege permission policy; no automatic camera/mic/location/clipboard/display-capture grants; OS picker for screen sharing.
- [x] IPC sender authorization limited to the application's own `file://` origin.
- [x] Terminal commands restricted to an allowlisted, shell-free implementation.
- [x] Browser engine URL validation restricted to http(s).
- [x] Mirror listener cleanup on unmount; startup failure recovery UI.
- [x] Manifest validation improvements and fallback-registry consistency checks.
- [x] Mac OS X Dock brings running apps up inside the container: skin windows now park open shell windows, and real Windows windows with a retro counterpart (Discord, Notepad, Calculator, Paint) open it instead of raising the host window.
- [x] Mac OS X desktop files can be sent to the Trash by dragging them onto the Dock/desktop Trash or by selecting them and pressing Delete.

## Urgent UX bugs — fix ASAP

- [x] **Mac OS X: Discord opens in a Microsoft Windows window.** Clicking Discord in the Mac OS X Dock/ShellApps opens the shell-backed Discord webview using Windows-style chrome and window controls, which breaks the Aqua illusion. The shell window presentation must follow the active skin (Mac OS X should get Aqua chrome). Reproduce: switch to Mac OS X, click Discord in the Dock. See `src/components/ShellApps/shell-apps.js` (`makeButtons`, `browserChrome`, `openWindow`) and the `dtm:skin-changed` handling of `activeSkinId`. **FIXED:** Added `emitInitialSkinChanged()` to SkinManager and call it after `mountActiveSkin()` so shell components receive the correct active skin on cold start.

- [ ] **Mac OS X: the little dot next to the clock opens real Windows Settings.** Clicking the small dot beside the time in the Mac OS X menu bar launches the host Windows Settings app, which breaks the skin illusion. Fix: intercept that click inside the Mac OS X skin and show a skinned Mac-style Date & Time / System Preferences panel instead of handing it to Windows. Reported by user 2026-11-23.

## Explicitly out of scope

The product is **one computer, one underlying environment, multiple historical presentations**. These are not roadmap items and must not be introduced:

- Separate virtual disks, per-OS filesystems, duplicated home directories or virtual user accounts.
- A host/virtual storage-mode selector or any second concept of "where the computer's files live".
- Artificial separation of desktop content between skins.

Per-skin *visual* preferences (wallpaper, icon layout, screensaver) are fine; user files and application data remain shared through the real host filesystem.

## Mac OS X Trash behavior (user-reported 2026-11-23)

- [ ] **Mac OS X: no Trash icon on the desktop.** Windows shows a Recycle Bin on the desktop, but Mac OS X hard-fixes Trash to the Dock (our taskbar) — so in the Mac OS X skin the Trash icon must NOT render as a desktop icon. It already lives in the Dock.
- [ ] **Mac OS X: Dock Trash opens the Recycle Bin, labelled "Trash".** Clicking Trash in the Dock should open the Windows Recycle Bin contents, but the window/title must say "Trash" (keep the Mac illusion). Repro: set skin to Mac OS X, open the Dock Trash — currently broken (see user screenshot, 2026-11-23).

## Deferred engine APIs (planned, not implemented)

- `process`, `windows`, `notify`, `clipboard` and `onSkinUnload` described in `docs/SKIN_API_REFERENCE.md`.

## Architectural decisions

- Filesystem backend is shared by all skins through `engine.fs`; skins keep their own visual language.
- Destructive operations are blocked at service level on drive roots, system directories and profile roots.
- Hidden-file detection uses the pinned `%SystemRoot%\System32\attrib.exe` helper (no shell).
- `engine.fs.list()` returns `{ path, parentPath, items, truncated }` so skins can navigate upward.
