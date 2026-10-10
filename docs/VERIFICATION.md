# Verification

## Local-only release — 10 October 2026

Multiplayer has been removed from the UI, router, dependencies, server implementation, and deployment configuration.

- All 18 unit tests, 31 local-board browser tests, the production offline test, TypeScript/build checks, and the license-configuration check pass.
- A fresh browser on `https://whitebored.app` verifies drawing, autosave/reload, whole-library export/import, dark mode and offline reload. There is no Share button, shared-board list, collaboration API request, or WebSocket connection.
- The former shared-link path returns the static 404 page and its home link opens the existing local library. The capacity endpoint returns 404, board-creation POST returns 405, and a WebSocket upgrade is refused.
- At 12:20 UTC, Cloudflare's API confirmed zero Durable Object namespaces, R2 buckets, D1 databases, and KV namespaces in the account. The `whitebored` deployment has no runtime bindings and no scheduled jobs. The deletion migration permanently retired `SharedRoom`, `ShareLimits`, and `CappedMedia`, including all stored data.

An initial live check reported a transient failed fetch while changing network state; the diagnostic repeat completed with no JavaScript errors. The SDK's external trial watermark request cannot load offline; local drawing and saving still work. No SDK licensing behavior was changed.

## Earlier application verification

Checked on Windows on 9 October 2026. Version 0.5 adds direct text-wrap resizing, independent grid/snapping, menu theme switching, and multi-file/library backups. The Whitebored rename updates the public identity while retaining existing storage and backup identifiers.

## Automated checks

- TypeScript production check and Vite build pass.
- Eighteen unit tests cover record-preserving commits, atomic stale-write rejection, camera-only saves without false conflicts, concurrent metadata changes, duplication, permanent deletion with stale-preview protection, shared-image retention until the final referencing board is deleted, replay after a quota failure, portable modifier matching, shifted punctuation/British digit keys, binding conflicts and reserved combinations. Camera tests cover cursor anchoring, screen-space pan, speed at 30/60/120 fps, easing after release, and cancellation. Desktop profile tests verify fresh installations, reuse of legacy profiles, and precedence of an existing Whitebored library.
- Thirty-one Chromium end-to-end tests cover the library and persistence scenarios below, plus real gesture and control sequences: Space-drag immediately after clicking Pen/Zoom/Ink and selecting a library sort order, pan release, middle-drag, wheel pan, Ctrl-wheel, E/Q and plus/minus held zoom, custom pan/tool bindings after reload, text/shortcut isolation, colour/width/opacity in exported stroke records, selected-ink edits without leaking unrelated styles into pen preferences, duplicate/delete undo boundaries, erasing, focus mode, dark mode, keyboard-operated sliders and dropdowns, zoom presets, camera/preferences after reload, numbered tool order, inline colour/width/opacity, persistent zoom tuning and cursor anchoring during a held zoom.
- Library coverage includes naming, stable collection filters, created/edited sorting and persistence, switching while the sidebar stays open, sidebar persistence across reloads, drawing with the sidebar open, editable backups, title favourites, duplication, deletion confirmation and cancellation, recovery of old Trash entries during database migration, image backups, legacy dark-board imports, concurrent windows, and importing/panning/exporting 2,000 freehand shapes without record loss. Preview tests rebuild old raster caches without opening their boards, check light/dark background pixels, verify text rendering and card bounds, and switch themes twice. Colour cycling follows exactly the visible desktop and mobile swatches.
- New transaction tests verify an import failure rolls back every board in its batch, new copies have independent IDs, metadata is preserved, and unopened boards appear in library snapshots. New browser tests cover text width handles while editing, left/right anchoring, undo/redo, numeric width, font/caret focus, Escape cancellation, rotated/scaled text, reload persistence, 390/320-pixel text layouts, independent grid/snapping, theme-menu persistence, and nonselectable sidebar chrome. Backup tests exercise mixed multi-file/library import, atomic malformed-file rejection, single-board libraries, empty boards, metadata, embedded images, and complete library export/import/reload.
- A production-build test waits for service-worker installation, goes offline, reloads, creates a new drawing, waits for its save, and reloads again.
- The deployed `https://whitebored.app` passed a fresh-profile check for the tldraw license, drawing, save/reload persistence, whole-library export/import, dark mode and offline reload. HTTPS, asset cache headers and service-worker revalidation were verified.
- A packaged Windows Electron smoke test verifies sandbox/context isolation, drawing, Space-drag after clicking Pen, autosave, exact text width, dark-mode switching, and persistence across a complete application restart using an isolated test profile.
- Desktop, dark, and 390-pixel-wide layouts were rendered and visually inspected. A 320-pixel layout check verifies controls do not overlap or overflow. Mobile checks exercise menu Undo/Redo, and Escape closing the ink panel without changing the tool. Screenshots are kept in the ignored `.qa/` folder.

Commands: `pnpm test`, `pnpm test:e2e`, `pnpm test:offline`, `pnpm test:desktop`. The desktop test expects the local unpacked preview at `release/preview/win-unpacked/Whitebored.exe`; its script also accepts another executable path. It briefly shows its own test window without activating it.

## Limits

- macOS and Linux packaging workflows are supplied, but those builds have not been executed or tested on this Windows host.
- Safari, Firefox, screen-reader workflows, non-US keyboard layouts, and physical pen/palm/pressure hardware have not been fully validated.
- The large-board test is a local Chromium smoke test, not a guarantee of frame rate, arbitrary drawing complexity, or low-end-device performance.
- The current unsigned native preview is for local evaluation. Public deployment requires an appropriate tldraw license; native releases also need signing/notarization and a defined update process.
- Browser storage is not an external backup. Very recent edits can be lost if the process terminates before the save transaction completes. Save errors remain visible and block board transitions until resolved.
- Multiplayer, cloud backup, account-based recovery, and a native automatic updater are not available.

No real boards from the original `whiteboard` repository were edited or used in the tests.
