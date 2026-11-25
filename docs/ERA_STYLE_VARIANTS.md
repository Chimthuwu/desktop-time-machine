# Design note: era styles vs. colour variants

Status: analysis only — no code changed. Written 2026-11-26 from a review of the
current skin stylesheets, prompted by an agent Inbox idea inspired by the
Cross-Platform-Retro-OS-Styles project (MIT): treat the era look and its colour
variants as two layers instead of duplicating a full stylesheet per colour
scheme.

## Current model

- Every skin owns one hand-authored `desktop.html` with an inline `<style>`
  block (mac OS X is the exception: `desktop.css` next to `desktop.html`).
  Rough stylesheet sizes: macos8 ~186 style lines, win95 ~151, XP ~93,
  TempleOS ~122, BeOS/amiga ~60, msn ~27. The Win95 and macos8 skins are large
  because most of the file is app logic and markup, not repeated CSS.
- `src/skins/shared/` holds only genuinely shared art/rules: cursor packs
  (`cursors-win.css`, `cursors-mac.css`) and the screensaver driver. There is
  no shared era base stylesheet and no CSS custom properties crossing skins.
- Per-skin *preferences* today are limited to wallpaper and icon layout
  (explicitly allowed by the project's out-of-scope policy); colour themes do
  not exist yet, so nothing currently pays the "duplicate stylesheet per
  variant" cost the idea targets.

## Base-style-plus-variant model (what the idea proposes)

One base stylesheet per era carries layout, chrome geometry and structure;
small variant patches (custom-property overrides or a short colour layer) are
applied at load time to produce colour schemes. One stylesheet serves N
colourways.

## Assessment

What would have to change here: nine hand-tuned stylesheets written against
concrete selectors and hardcoded colours would need their colours lifted into
custom properties, and per-variant tokens defined in manifests. That is an
M-size refactor per era with real regression risk — the skins are verified by
Electron suites that assert structure and behaviour, not colours, so a colour
lift would land mostly unverified.

What argues for keeping the current model:

1. Skins differ structurally, not just in palette: Win98 has a full app suite
   with its own chrome, mac OS X mounts JS-driven menus/dock, MSN has a
   contact-list layout. A shared "Windows-era base" would not deduplicate any
   of that; it would only share colour tokens.
2. There is no colour-variant demand yet. The duplication cost is zero while
   the number of variants per era is one.
3. Skin isolation is a stated invariant (each skin's CSS must not leak into
   another); a shared base layer adds a coupling channel that the viewport
   isolation deliberately avoids.

## Recommendation

Keep the current one-stylesheet-per-skin model. Do not restructure skins now.
If a second colourway of a single era is ever actually requested, take the
cheap middle path for that one era only: hoist its accent colours into CSS
custom properties at the top of its `<style>` block and define the variant as
a token override in the skin manifest. That gets the variant benefit with one
file touched and no cross-skin coupling.
