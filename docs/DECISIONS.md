# Product and engineering decisions

Research checked on 9 October 2026. This document separates current upstream terms from engineering recommendations.

## Keep the canvas engine; rebuild the product around it

The existing Folio app is a useful reference, not a disposable prototype. It already has autosave, revision checks, recovery, reversible deletion, thumbnails, portable exports, bundled assets, and deliberate camera handling. Those are valuable behaviors. Its keymap, forced dark drawing style, hidden tools, tightly coupled local HTTP API, and Windows launcher reflect one person's workflow.

The new app keeps tldraw and resets the surrounding product: familiar inputs, discoverable drawing tools, a restrained workspace, searchable board navigation, portable persistence, and a real desktop shell. The original project's files and data remain untouched.

Building rectangles, paths, and selection handles is straightforward compared with matching an established canvas engine. The hard work includes hit testing at arbitrary zoom, shape-specific geometry, text measurement and composition, bindings, pressure-aware strokes, transforms, history grouping, clipboard formats, touch cancellation, migrations, export, accessibility, and browser quirks. “Virtually indistinguishable” behavior is not a sensible small prerequisite for this app. Treat an original engine as a separate, substantial product effort with long-running compatibility testing.

If discretionary licensing is unacceptable, Excalidraw is a credible alternative under its [MIT license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE), subject to preserving notices and checking bundled dependencies. It would be an engine migration with different behavior and document conversion work, not an identical substitute. Do not copy licensed tldraw implementation code into a purportedly independent engine.

## tldraw licensing

Current default terms permit development; production needs an active trial, commercial, or hobby key. A free, non-commercial project can apply for the discretionary hobby license, which retains “made with tldraw” on the canvas. No revenue does not automatically confer permission. The SDK is source-available, not MIT. Local development exemptions do not authorize unrestricted redistribution. [Official license overview](https://tldraw.dev/community/license)

Apply early, describing the hosted web app, downloadable desktop builds, offline use, intended domains/custom origin, lack of monetization, and anticipated audience. Confirm distribution coverage, renewal/expiry, and whether users may use the app in commercial contexts. The actual issued agreement controls. Applying after implementation is possible but leaves an avoidable launch dependency.

Keys are checked locally and encode hosts and expiry; offline use is supported. Verify the final web hostname and `folio://app` desktop origin with tldraw. [License-key documentation](https://tldraw.dev/sdk-features/license-key)

Folio does not hide the watermark, patch license verification, or substitute a development environment as a public-release strategy. Internal builds can be evaluated now; public deployment awaits an appropriate license. The release script checks key presence, not legal entitlement or cryptographic validity.

Privacy language must stay precise. tldraw's general license page and newer license-key documentation disagree about hobby telemetry. The latter describes license metadata and URL pings. Do not promise “no network requests ever.” Confirm the pinned SDK and issued terms before publishing a privacy notice. Folio adds no analytics endpoint or account backend; user-requested external media and embeds can contact third parties.

## Interaction model

There is no single universal mouse-wheel convention. Miro documents separate mouse and trackpad modes: mouse wheel zooms in its mouse mode, while trackpad navigation pans with two fingers. Figma documents Ctrl/Cmd + wheel and trackpad pinch for zoom. Use a clear default and expose the alternative. [Miro navigation](https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen), [Figma zoom](https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options)

Folio defaults to wheel pan, Ctrl/Cmd + wheel zoom, pinch zoom, Space-drag, middle-drag, and a visible hand tool. Microsoft Whiteboard also explicitly documents held Space-drag. Version 0.3 ports the original whiteboard camera controller: one animation-frame camera writer handles E/Q hold zoom, pointer-anchored wheel zoom, mouse pan and touch pinch/pan. Continuous zoom uses the original exponential speed and velocity easing; Preferences exposes the original 5×/second and 60 ms defaults. Pointer controls retain the focus fixes from version 0.2. Wheel zoom is a preference. Real pen/palm behavior needs testing on actual devices. [Microsoft Whiteboard keyboard shortcuts](https://support.microsoft.com/en-us/whiteboard/whiteboard-keyboard-shortcuts)

Use 1–5 in dock order: Select, Pen, Eraser, Text, Hand; V/P/B/T/H aliases remain. E/Q continuously zoom, R resets and Z fits. The editable map starts with version 0.3 defaults and keeps the previous stored map untouched. Preserve standard undo/redo, delete, clipboard, and duplicate. Shift 1/2 fit the board/selection; Shift 0 resets zoom. Plus/minus, including Ctrl/Cmd variants while working on the canvas, zoom the drawing. A/D and comma/period cycle colours, S/W and brackets change width, and F/G or Shift-brackets change opacity. New-window shortcuts stay with the browser.

All app commands and the held pan key share one editable binding map. The recorder supports alternative bindings, persistence, conflict detection, reset, and reserved navigation/clipboard keys. Tooltips use this map. Built-in SDK action/tool hotkeys are disabled to avoid conflicting parallel bindings; native clipboard, text, selection, gesture, context-menu, and accessibility handling remain active.

The first implementation's Space failure was reproduced after clicking Pen and Zoom: a native button retained DOM focus, so the SDK's canvas keyboard listener did not receive Space. The replacement controls prevent pointer focus from moving to buttons and explicitly focus the canvas; keyboard Tab focus and Space/Enter button activation still work. Escape dismisses an open popover before the SDK changes tools. Tests assert camera movement and unchanged shape count after these exact interactions.

Do not consume Tab as a modifier or interpret letters while someone types or uses an input method editor. This is both familiar and necessary for keyboard accessibility. tldraw already scopes shortcuts to editor focus and text-editing state. [tldraw actions](https://tldraw.dev/sdk-features/actions), [Figma keyboard access](https://help.figma.com/hc/en-us/articles/360040328653-Use-Figma-products-with-a-keyboard)

## Visual direction

The canvas fills the viewport. A compact board pill sits at the top left; zoom and the board menu sit at the top right; five essential drawing tools and ink controls occupy a small bottom dock. Use a cool neutral surface, restrained blue accent, crisp icons, subtle borders, and small floating panels. The board sidebar is collapsible; its open state persists. No header, wordmark, marketing copy, page selector, or decorative-shape palette competes with the drawing. Undo/redo remain in keyboard commands and the board menu. Dark mode is available.

Boards appear in a searchable thumbnail sidebar that remains open while switching or drawing. On narrow screens it overlays the canvas and has an explicit close button. All boards, favourites, collections and individual collection names share one stable dropdown. Created/edited sorting sits beside it and persists locally. Dropdowns use the same keyboard-accessible Radix Select component throughout the app. The title owns rename and favourite actions; they are not repeated in the board menu. Successful autosave has an accessible status without a visible tick; saving errors remain explicit.

The dock exposes quick colour swatches, width −/+ controls and an opacity slider. Colour cycling and the rendered swatches share one responsive palette, so every step has a visible selected swatch. The full palette is one click away, and imported multi-page documents retain a menu entry only when necessary. The SDK's license notice remains intact in its own corner; controls do not depend on its height or position.

New board immediately creates a blank canvas. Rename and organise later. New installations also start blank; existing boards and the old starter document remain intact. No account, onboarding tour, template picker, or collaboration controls sit between a thought and the canvas.

## Storage and performance

Use IndexedDB for documents and binary assets; localStorage only holds small preferences and the last-open board ID. Web Storage is synchronous and small (typically 5 MiB for localStorage), while IndexedDB supports larger structured data and blobs. Browser data can still be evicted or explicitly cleared; requesting persistence and offering editable backups are essential. [MDN Web Storage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API), [MDN quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

The implementation uses three stores: board metadata, canvas records keyed by board ID + record ID, and binary assets. Autosave batches changed records over 350 ms. Writes check the document revision and commit atomically. Metadata changes are merged within the transaction. Failed batches stay in memory and newer edits win when retrying. Ordinary ink saves do not reload the closed board library. Controls subscribe to displayed style values rather than repainting for every point added to a stroke.

Previews are cached per document revision and page in both light and dark modes, using the SDK's explicit export mode so photographs and drawing colours stay correct. Missing or stale previews regenerate near the visible scroll area, after a debounce, through one queued background renderer. It is disposed after export. Background writes check the revision and cannot resurrect a deleted board. A preview failure never blocks a document save.

Board deletion requires a modal naming the target, with Cancel initially focused. Confirmation removes the board, its records, and exclusively owned image blobs in one transaction; duplicated boards retain shared media. Database version 2 restores old Trash entries to the library instead of silently purging them when the Trash UI is removed.

Session/view state is saved on board transitions, explicit save, or page visibility changes. It is separate from the document records and does not affect the edited timestamp when the document is unchanged. Only the current interactive editor is mounted; history is session-local. Revisiting a board starts fresh undo history. Do not advertise unlimited scale or assume a high shape-count cap is a performance guarantee.

Browsers on different origins, and the desktop app, have separate libraries. Export/import is the transfer mechanism in this version. Cloud backup, cross-device sync, real-time collaboration, and user accounts are separate features with ongoing hosting and operational costs. The storage boundary leaves room for a future sync backend.

## Text, snapping, and portable libraries (0.5)

Text keeps tldraw’s native rich-text editor, creation gesture, selection and corner scaling. An app-owned contextual bar adds font, alignment, automatic/fixed wrapping and an exact width. Visible side handles work during text editing as well as selection. Their drag geometry uses the initial page transform so a moving left edge, rotated text, and scaled text keep the opposite edge anchored without changing font size. One drag is one undo step. Keyboard events in these controls are marked as handled before tldraw’s native container listeners see them; Enter/Escape in the width field must never start another canvas action.

The SDK’s `isGridMode` also enables grid snapping, while `isSnapMode` enables object snapping. Folio renders the SDK’s camera-aware grid through its background component, independently of either snap flag. The app’s opt-in Snapping preference enables object snapping and enables grid snapping only while the grid is shown. Both the board menu and Preferences edit the same persisted preference.

A library backup is a versioned `folio-library` envelope containing ordinary `folio-canvas` board entries. Export takes a consistent IndexedDB snapshot of board metadata, records and media, then embeds images/video into each portable document. The importer accepts one board, a library, an array of board backups, or several selected files. All documents pass SDK schema migration/validation before one transaction inserts the entire batch with fresh board IDs. Collections, favourites and creation/edit timestamps survive; existing boards remain untouched. Unresolved local asset URLs are rejected. The 512 MB limit applies to the whole selected batch and to library exports. A missing media blob or failed download prevents creation of an incomplete library backup.

Routine save progress is screen-reader-only; explicit save failures retain the visible recovery banner. The board sidebar disables selection on its chrome while keeping search input selectable. The top-right menu exposes a persisted light/dark toggle next to the grid and snapping controls.

## Web, PWA, desktop

One React + TypeScript + Vite frontend serves all targets. The browser build can be hosted statically. A service worker precaches the app and its required fonts/assets, with an explicit update action. A PWA gives offline installation where supported, but is not a substitute for a downloadable native package on every platform.

Electron is the first desktop choice because it shares a consistent Chromium rendering engine across Windows, macOS, and Linux. It costs more download size and memory than an OS-webview shell. Tauri remains an attractive footprint optimization, but differing platform webviews would need additional pen, clipboard, font, and export validation. [Tauri architecture](https://v2.tauri.app/start/)

The desktop renderer has no Node access, uses context isolation and sandboxing, loads a custom secure local origin, denies unexpected permission requests, prevents embedded webviews, and opens ordinary external links outside the app. A production CSP restricts executable content. Signing, notarization, packaging validation, dependency updates, and a native update mechanism remain part of release operations. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

## Release sequence

1. Obtain hobby-license eligibility and written web/desktop scope while iterating locally.
2. Validate core drawing, editing, switching, save failures, corrupt imports, image backups, and offline startup.
3. Test supported browsers and operating systems, plus real stylus hardware and non-US keyboard layouts.
4. Configure the production key and stable web origin; verify licensing there.
5. Sign/notarize native builds and decide the native update process.
6. Publish a small initial release, with a clear local-storage explanation and tested backup recovery.

The app is deliberately focused on personal boards. Keeping that scope makes a free, maintainable release realistic.
