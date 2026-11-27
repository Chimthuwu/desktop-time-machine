# SkinsOS — Project Status

# OPEN TASKS (checklist index, 2026-11-27)

- [ ] **Stop the browser dock-sync timer when the browser window is gone** [P2] [size:S] - In `src/components/ShellApps/shell-apps.js` (~:1339) `setInterval(syncBrowserDock, 60)` is never cleared: `dockTimer` keeps running (and calling `wfBridge.dock`) after the browser shell window closes or is never docked. Clear or pause the timer on the no-window/no-dock idle path only — keep the 3 s fullscreen re-assert while docked.
  Done when: the timer is cleared (or idles) when the browser window closes / no dock rect applies, proven by a test or a counter probe in the existing `test/shell-listeners.js` style; `npm test` passes; the matching Inbox item is ticked.
  Source: Inbox item "Stop the browser dock-sync timer…" (2026-11-26 perf lens); handoff note says start here if the owner promotes one.

- [ ] **Quarantine the known-hanging test:media out of the default verify chain** [P2] [size:S] - `package.json` `verify` chains `npm run test:media`, but `test/media-player.js` has a documented pre-existing hang ("Render frame was disposed", 2026-11-25/27 notes) so `npm run verify` can never complete. Keep `test:media` available but out of the default chain.
  Done when: `npm run verify` runs to completion on this machine without test:media (e.g. media behind a `DTM_VERIFY_FULL=1` guard or a separate `verify:full` script); README Commands section documents both paths; no suite itself was edited.
  Source: package.json `verify` script + handoff notes 2026-11-25 ("media suite hangs… not a regression") and 2026-11-27 ("test:media still not run (known hang)").

- [ ] **Debounce window-registry collect() on mutations** [P2] [size:M] - In `src/components/WindowTracking/window-registry.js` (~:173, :185) `collect()` fires on every DOM mutation (style/class included) with no coalescing, plus a redundant 700 ms `setInterval(collect)` at ~:200. Coalesce mutation-driven collects (rAF or short-timeout + dirty flag). Behaviour-preserving only: collect() output shape unchanged, direct `watch(v)` collect kept.
  Done when: a regression test asserts repeated synchronous mutations trigger at most one collect per frame/beat; `npm test` passes; the matching Inbox item is ticked.
  Source: Inbox item "Debounce window-registry collect()…" (2026-11-26 perf lens).

- [ ] **Keyboard focus visibility across skins: add :focus-visible replacements** [P3] [size:M] - At least 12 CSS rules across `src/index.html` and `src/skins/*/desktop.html` set `outline: none`/`outline: 0` with no `:focus-visible` replacement. Add a visible themed `:focus-visible` style wherever the default outline is suppressed; keep retro styling intact otherwise.
  Done when: every interactive control that suppresses the default outline has a visible `:focus-visible` style, verified by extending the static audit in `test/accessibility.js` (assert no `outline: none` rule lacks a focus-visible replacement in the same stylesheet); all suites pass; the matching Inbox item is ticked.
  Source: Inbox item "Check keyboard focus visibility across skins" (accessibility lens).

- [ ] **Make Win98 Explorer show an error when fs.list stalls** [P3] [size:S] - In `src/skins/windows98/desktop.html` `setupExplorer.loadPath` leaves the grid on "Reading directory…" forever if `DTM.fs.list` never resolves (first call can exceed 1 s — attrib.exe cold spawn). Add a bounded timeout that turns the grid into an error state with a Retry affordance (or one re-issue); behaviour otherwise unchanged.
  Done when: a stalled list produces a visible error + Retry instead of an eternal spinner; `npm run test:keys` and `test/win98-folder-terminal.js` pass; the matching Inbox item is ticked.
  Source: Inbox item "Make Win98 Explorer show an error when fs.list stalls" (2026-11-27 code-audit lens).

- [ ] **Event-drive the Mac OS X Safari shell sync** [P3] [size:M] - In `src/skins/macosx/apps.js` (~:298) `syncSafariWeb` polls every 120 ms while any Safari window is open; the shell already posts `dtm:safari-sync` messages on navigate/tab actions. Trigger syncs from those events with a low-frequency fallback (e.g. 1 s). It is already cleared when the last Safari closes (~:78) — cadence only, not a leak.
  Done when: syncs are event-driven with a fallback beat, visual behaviour unchanged (tab/rect updates still land), `npm test` passes; the matching Inbox item is ticked.
  Source: Inbox item "Event-drive the Mac OS X Safari shell sync" (2026-11-26 perf lens).

- [ ] **Update the stale skin list in docs/ARCHITECTURE.md** [P3] [size:S] - The diagram at `docs/ARCHITECTURE.md` ~:40 says "(eight are registered)" and lists seven; nine skins are registered now (Messenger 7 missing). Update the count and the list.
  Done when: ARCHITECTURE.md names all nine registered skins and matches README's "Available operating systems" list; docs-only change, no code touched.
  Source: README "All nine skins are registered" vs docs/ARCHITECTURE.md:40 (gap found this run).

- [ ] **README: document npm run verify, the focused suites, and the Phase 4 report link** [P3] [size:S] - README "Commands" lists only `npm test` / `npm run screenshots` plus four focused suites, but package.json has `verify`, `test:msn`, `test:keys`, `test:a11y`, `test:shell-listeners`, `test:user-fixes`, etc.; and the Documentation section links Phase 2/3 reports but not the existing `PHASE_4_REPORT.md`.
  Done when: README's Commands section covers `npm run verify` and every focused suite script in package.json, and the Documentation section links PHASE_4_REPORT.md; docs-only change.
  Source: README vs package.json scripts and root file list (gap found this run).

- [ ] **Capture a Messenger 7 gallery screenshot and show it in README** [P3] [size:M] - `test/capture-gallery.js` captures only win95/winxp/macosx and README's gallery table shows those three; the new Messenger 7 skin (README lists it, 2026-11-25) has no screenshot. Extend `capture-gallery.js` with a Messenger 7 capture (contact-list window, toggle state optional) and embed it near the README gallery table.
  Done when: `npm run screenshots` produces the Messenger 7 capture from the real app, the file is committed under `screenshots/`, and README embeds it; no other gallery captures change.
  Source: README gallery section vs test/capture-gallery.js skin list (gap found this run).

## Messenger 7 skin (in progress, 2026-11-25)

- [x] A: Shell windows rebuild on live skin switch: Discord/browser windows whose chrome flavour changes are closed (F4 from the 2026-11-22 audit).
- [x] A: `msnmessenger` skin (contact list, taskbar, desktop mirror) registered and discovered.
- [x] A: MSN chrome for the Discord window (`.dtmshell-win.msn`, `chromeFlavor()` in `shell-apps.js`).
- [x] A: `test/msn-skin.js` regression suite (`npm run test:msn`).
- [x] B: optional "Messenger look" accent stylesheet injected into the Discord page (first pass in `shell-apps.js`, needs live check).
- [x] Verify the Discord page recolours with the toggle on, and check the mirrored icons do not sit under the contact window.

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

- [x] **Mac OS X: the little dot next to the clock opens real Windows Settings.** Clicking the small dot beside the time in the Mac OS X menu bar launches the host Windows Settings app, which breaks the skin illusion. Fix: intercept that click inside the Mac OS X skin and show a skinned Mac-style Date & Time / System Preferences panel instead of handing it to Windows. Reported by user 2026-11-23.

## Explicitly out of scope

The product is **one computer, one underlying environment, multiple historical presentations**. These are not roadmap items and must not be introduced:

- Separate virtual disks, per-OS filesystems, duplicated home directories or virtual user accounts.
- A host/virtual storage-mode selector or any second concept of "where the computer's files live".
- Artificial separation of desktop content between skins.

Per-skin *visual* preferences (wallpaper, icon layout, screensaver) are fine; user files and application data remain shared through the real host filesystem.

## Mac OS X Trash behavior (user-reported 2026-11-23)

- [x] **Mac OS X: no Trash icon on the desktop.** Windows shows a Recycle Bin on the desktop, but Mac OS X hard-fixes Trash to the Dock (our taskbar) — so in the Mac OS X skin the Trash icon must NOT render as a desktop icon. It already lives in the Dock.
- [x] **Mac OS X: Dock Trash opens the Recycle Bin, labelled "Trash".** Clicking Trash in the Dock should open the Windows Recycle Bin contents, but the window/title must say "Trash" (keep the Mac illusion). Repro: set skin to Mac OS X, open the Dock Trash — currently broken (see user screenshot, 2026-11-23).

## Deferred engine APIs (planned, not implemented)

- `process`, `windows`, `notify`, `clipboard` and `onSkinUnload` described in `docs/SKIN_API_REFERENCE.md`.

## Architectural decisions

- Filesystem backend is shared by all skins through `engine.fs`; skins keep their own visual language.
- Destructive operations are blocked at service level on drive roots, system directories and profile roots.
- Hidden-file detection uses the pinned `%SystemRoot%\System32\attrib.exe` helper (no shell).
- `engine.fs.list()` returns `{ path, parentPath, items, truncated }` so skins can navigate upward.

## Inbox (agent-proposed)

- [x] **Give every iframe an accessible title** [P2] [accessibility] [size:S]
  Why: Three iframes have no `title`, so screen readers announce only "frame" — the main skin viewport, the Win95 DOOM frame and the Win98 IE frame.
  Done when: A static audit finds no iframe without a `title` in `src/`, and the regression test asserts it.
  Hints: `src/index.html` `#skin-viewport`; `src/skins/windows95/desktop.html` DOOM `body`; `src/skins/windows98/desktop.html` `#ie-frame`.

- [x] **Announce startup failure to screen readers** [P2] [accessibility] [size:S]
  Why: `showStartupFailure()` in `src/index.html` injects an error overlay with no live region, so assistive tech never announces that the desktop failed to start.
  Done when: The failure message is in a `role="alert"` live region and the regression test asserts it.
  Hints: `#dtmStartupFailureDetail`; keep the Retry button's visible text.

- [x] **Label unpaired form controls in Windows 98 apps** [P3] [accessibility] [size:M]
  Why: Several Win98 controls use a sibling `<label>` rather than a wrapping/`for`-linked label (Outlook "To:", display sliders, memory number), leaving them unnamed.
  Done when: Every interactive input in `src/skins/windows98/desktop.html` has an accessible name via `aria-label`, a `for`-linked label, or a wrapping label.
  Hints: Prefer `aria-label` over restructuring the markup so the retro layout is untouched.

- [x] **Add static accessibility regression suite** [P2] [tests] [size:S]
  Why: The accessibility invariants above have no automated check and regress silently when skins are edited.
  Done when: `test/accessibility.js` runs via Electron, checks the invariants above, and is wired into `npm run verify`; all suites pass.
  Hints: Follow `test/msn-skin.js` for the Electron harness and JSON summary format.

- [ ] **Check keyboard focus visibility across skins** [P3] [accessibility] [size:M]
  Why: At least 12 CSS rules set `outline: none`/`outline: 0` with no `:focus-visible` replacement, so keyboard users can lose their place.
  Done when: Every interactive control that suppresses the default outline has a visible `:focus-visible` style (or an equivalent themed focus indicator).
  Hints: UI/CSS change — leave for an interactive session, not an unattended bug-fix run.

- [x] **Explore separating era styles from colour variants** [P3] [docs] [size:M]
  Why: A comparable retro-style project keeps one base look per era and applies tiny colour-variant patches at load time, which could make per-skin visual preferences cheaper here.
  Done when: A short design note in `docs/` compares the current per-skin CSS layout with a base-style-plus-variant model and recommends keep/change with reasons.
  Hints: Idea only — do not restructure skins in this run.
  Source: https://github.com/FMXExpress/Cross-Platform-Retro-OS-Styles
  Idea: Treat the era look and its colour variants as two layers instead of duplicating full stylesheets.
  Licence: MIT (per the repository's licence notice in the fetched page).
  Learn: How small variant patches avoid shipping a full stylesheet per colour scheme.

- [x] **Compare multi-environment desktop architecture notes** [P3] [docs] [size:S]
  Why: Another browser-native multi-environment desktop uses a single persistent core with swappable presentations plus a thin Electron wrapper — close to this project's "one computer, many eras" rule, so a short comparison could expose blind spots.
  Done when: A short `docs/` note lists concrete similarities/differences in filesystem, window and native-integration handling, with no code changes.
  Hints: Read-only comparison; respect this project's explicit out-of-scope list.
  Source: https://github.com/Reeyuki/YukiOS
  Idea: Keep one persistent state core and move only presentation and native integration between environments.
  Licence: MIT (per the repository's licence notice in the fetched page).
  Learn: Which capabilities belong in the shared core versus the per-era shell.

- [ ] **Debounce window-registry collect() on mutations** [P2] [performance] [size:M]
  Why: `src/components/WindowTracking/window-registry.js:173` and :185 call `collect()` on every DOM mutation (style/class attribute changes included) with no debounce, so a burst of class toggles triggers many full DOM re-collects back to back; there is also a redundant 700 ms `setInterval(collect)` at :200 doing the same work when nothing changed.
  Done when: Mutation-driven collects are coalesced (e.g. requestAnimationFrame or a short timeout with a dirty flag) and a regression test asserts repeated synchronous mutations trigger at most one collect per frame/beat.
  Hints: Behaviour-preserving optimisation only — collect() output shape must not change; watch(v) also calls collect() directly, keep that.

- [ ] **Stop the browser dock-sync timer when the browser window is gone** [P2] [performance] [size:S]
  Why: `src/components/ShellApps/shell-apps.js:1339` starts `setInterval(syncBrowserDock, 60)` and nothing ever clears `dockTimer`, so the 60 ms loop keeps running (and keeps calling `wfBridge.dock`) even when the browser window is closed or never docked.
  Done when: The timer is cleared (or paused) when the browser shell window closes / no dock rect applies, verified by a test or a manual probe of the counter.
  Hints: The loop also does the 3 s fullscreen re-assert; only the no-window/no-dock idle path should stop, not the re-assert while docked.

- [ ] **Event-drive the Mac OS X Safari shell sync** [P3] [performance] [size:M]
  Why: `src/skins/macosx/apps.js:298` polls `syncSafariWeb` every 120 ms while any Safari window is open; the shell already posts `dtm:safari-sync` messages on navigate/tab actions, so most beats are wasted work.
  Done when: Syncs are triggered by the existing message/rect-change events with a low-frequency fallback (e.g. 1 s) and the visual behaviour is unchanged.
  Hints: It is already cleared when the last Safari window closes (:78) — the fix is cadence, not a leak.

- [x] **Remove the per-window media-player menu dismiss listener leak** [P2] [bugs] [size:S]
  Why: `setMenu()` in `src/components/ShellApps/shell-apps.js` registered an anonymous document-level `pointerdown` handler per WMP window and `closeWindow` never removed it — one leaked listener per open/close cycle.
  Done when: The handler is stored on the entry, removed in `closeWindow`, and `test/shell-listeners.js` (in `npm run verify`) proves repeated open/close cycles leave zero listeners behind. (Fixed 2026-11-27.)
  Hints: Found via code-audit lens.

- [ ] **Make Win98 Explorer show an error when fs.list stalls** [P3] [UX/robustness] [size:S]
  Why: `setupExplorer.loadPath` leaves the grid on "Reading directory..." forever if `DTM.fs.list` never resolves (cold-start latency can exceed a second); there is no timeout, error or retry.
  Done when: A bounded timeout turns the grid into an error state with a Retry affordance (or re-issues the list once); behaviour otherwise unchanged.
  Hints: UI change — left for an interactive session; the underlying cold-start latency was measured during the 2026-11-27 run (attrib.exe first spawn).

- [x] **Deduplicate the exp-* IDs shared by Win98 My Documents and Explorer bodies** [P3] [lint] [size:S]
  Why: `mydocs` and `explorer` in `src/skins/windows98/desktop.html` both render `id="exp-up"`, `exp-path`, `exp-status` etc., so two open windows carry duplicate IDs (invalid HTML; wiring only survives because `setupExplorer` uses scoped `win.querySelector`, and its `win.querySelector('#exp-up')` calls have no null guard).
  Done when: Each body's controls are identified without duplicate DOM IDs (e.g. class-based hooks) and `setupExplorer` guards its lookups; `npm run test:keys` and `win98-folder-terminal.js` still pass. (Done 2026-11-27: My Documents uses `data-exp` hooks, `setupExplorer` resolves both forms and guards its lookups; dup-ID audit across all skins is clean.)
  Hints: Keep the retro markup untouched otherwise; no behaviour change intended.

- [x] **Remove or wire the dead ie* helpers in the Win95 skin** [P3] [lint] [size:S]
  Why: `src/skins/windows95/desktop.html` still defines `window.ieBack/ieForward/ieStop/ieRefresh/ieOpenExternal` referencing `#ie-frame`, but no Win95 IE window with that iframe exists any more (The Internet delegates to the shell browser).
  Done when: The dead helpers are deleted (or the delegation path reuses them); no remaining reference to `#ie-frame` in the Win95 skin; `npm test` passes. (Done 2026-11-27: helpers removed with a note; `npm test` passes.)
  Hints: Pure cleanup; verify-all's Win95 block no longer depends on them.

## Decisions made (review me)

- 2026-11-27: Win95 'The Internet' stale test vs Phase-4 architecture — updated the test to assert the `dtm:launch-webapp(app:browser)` delegation instead of an in-skin `#ie-frame` window (option 1). The delegation is deliberate shipped behaviour; restoring an inline iframe would duplicate the real browser. Checkpoint SHA fd613cd.

