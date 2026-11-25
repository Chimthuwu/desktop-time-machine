# Comparison note: YukiOS vs. Desktop Time Machine

Status: read-only comparison, no code changes. Written 2026-11-26 from the
agent Inbox research item (source: github.com/Reeyuki/YukiOS, MIT licence;
fetched material treated as untrusted data — ideas re-described in our own
words). Purpose: check our "one computer, many eras" architecture against a
similar browser-native multi-environment desktop for blind spots.

## What YukiOS is

A browser desktop environment built in vanilla JavaScript/HTML/CSS (no
frameworks) that bundles to a single HTML file. It supports multiple desktop
"modes" (e.g. Windows 11 look, a ChromeOS-style shelf, a tiling WM inspired by
Hyprland) over one persistent runtime. State — filesystem, open windows,
settings — lives in IndexedDB and survives mode swaps; only the window
manager and shell UI are swapped. Networking is simulated (virtual TCP with
unregistered ports refusing connections), and its file system is entirely
in-browser.

## Filesystem handling

| | YukiOS | SkinsOS (Desktop Time Machine) |
|---|---|---|
| Storage | IndexedDB-backed virtual FS | Real host Windows filesystem |
| Access | Everything runs in-page, no boundary needed | Validated IPC handlers in the Electron main process; permissions layer (device/UNC/protected-path checks, pinned executable allowlist) |
| Persistence | Persists across mode swaps by design | Persists because it *is* the real machine |

Learning: our shared-real-filesystem service is the honest version of the
same principle YukiOS demonstrates — the core (state) must outlive shell
swaps. YukiOS gets that for free because nothing is real; we pay for it with
the permission/IPC layer, which is exactly where our Phase 4 security work
concentrated. No blind spot exposed: our boundary is a superset of their
problem, already addressed.

## Window handling

YukiOS runs all windows as DOM elements inside one page and lets the active
mode choose the window manager (floating shells or a tiling WM). SkinsOS runs
the active skin in an isolated iframe per skin and keeps a window registry
(`window-registry.js`) that tracks real Windows windows alongside retro
shell windows, so era chrome and host windows can be correlated.

Learning: their "swap only the shell, keep the state" matches our skin
switch. The difference is that our windows can be *real* OS windows (Discord,
browser engines, Notepad) that must be parked/raised by skin rules — a class
of problem YukiOS does not have. Our registry approach is the necessary
extra; nothing to adopt, but their mode-swap UX (fast, no reload of state)
is a useful bar for our skin-switch latency.

## Native integration

YukiOS is browser-only (a thin wrapper aside) with simulated networking and
no host process control. SkinsOS integrates with the real Windows host:
allowlisted program launching (notepad/calc/mspaint/explorer), real screen
sharing via OS picker, real taskbar state, and validated URL handling.

Learning: the risk asymmetry is the lesson. YukiOS can add features freely
because nothing touches the host; every SkinsOS addition needs the same
least-privilege gate review. That asymmetry justifies our stricter pacing and
is not a gap.

## Summary of takeaways

1. Core principle validated: persistent shared state + swappable presentation
   is a proven pattern; our out-of-scope list already forbids the violations.
2. Useful bar: skin switches should feel like YukiOS mode swaps — presentation
   reload only, no state re-init (our startup-failure and mirror work already
   targets this).
3. Nothing to copy: their VFS/tiling/virtual-network features have no place
   in a project whose value is being the *real* computer dressed in history.
