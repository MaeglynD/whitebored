# Verification

## Multiplayer update — 10 October 2026

- 38 unit/emulator tests pass, including 20-session admission, session expiry/freeze authorization, missed-expiry-alarm recovery, per-board file counts, atomic global media capacity, per-network upload quotas, immutable chunked storage, short/legacy URL parsing, and network-state transitions without a WebSocket close handshake.
- Eight collaboration browser tests pass: independent concurrent edits/undo, authorization, images and editable exports, offline reconciliation, mobile dark layout, identities/roster/disconnect notices, rendered cursor interpolation, owner stop-to-local flow, local-save failure/retry, and recovery with media after reloading an interrupted stop. One scenario covers multiple checks.
- All 31 existing local-board browser tests and the production offline test pass. TypeScript, production build and license-configuration checks pass.
- Fresh isolated browsers on the live HTTPS deployment verify drawing and image synchronization, reload, participant counts, unauthorized access denial, owner revocation and both participants continuing locally. The current Electron runtime verifies sharing through the production API and returning to its local `folio://app/` origin. This does not constitute a new signed installer release.
- `tests/capacity.test.ts` measures 1,200 SQLite row writes for 300 single-shape commits in the installed tldraw 5.4.2 adapter. The [capacity forecast](MULTIPLAYER-CAPACITY.md) uses this measured write amplification; it is not a production load test.
- Desktop and narrow dark sharing panels were rendered and inspected. Test profiles contain synthetic boards only.

The local Workers emulator sometimes logs a request-stream cancellation warning when intentionally rejecting an unauthorized upload before reading its body. Expected denial responses and subsequent valid requests pass; the fresh production browser checks report no JavaScript errors. This is recorded rather than described as a warning-free run.

The app's final deployment has no R2 binding or access code. Free-plan enforcement remains a provider/account setting, not something unit tests can establish. The owner confirmed Workers Free; no paid subscription was purchased or enabled.

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
- Shared collaboration is implemented; account-based login/recovery and a native automatic updater are not. Shared rooms are not a durable offline cache.

No real boards from the original `whiteboard` repository were edited or used in the tests.
