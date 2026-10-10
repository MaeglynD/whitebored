# Whitebored guide

A canvas-first drawing workspace. Compact floating controls, a collapsible board sidebar, editable shortcuts, and local autosave. Built with React + tldraw for the browser, offline installation, and desktop.

## Run

Use Node.js 24 and pnpm 11 (the package manager version is pinned in `package.json`).

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. The development server binds only to the local machine. The original project at `../whiteboard` and its database are not modified or connected to this app.

```sh
pnpm build          # TypeScript check + production web/PWA build
pnpm preview        # Preview the built app locally
pnpm test           # Storage transactions and failed-save recovery
pnpm test:e2e       # Drawing, library, assets, conflict and large-board tests
pnpm test:offline   # Production service-worker/offline check on port 5188
pnpm test:sharing   # Build + two-browser collaboration tests against local Cloudflare emulation
```

For browser tests, first run `pnpm exec playwright install chromium`. Stop any unrelated service on the configured test ports before testing. Never use real personal boards as test fixtures.

## Desktop

```sh
pnpm exec install-electron
pnpm build
pnpm desktop
pnpm desktop:pack
```

The desktop shell uses packaged files and its own IndexedDB library under Electron's OS-specific user-data directory. It needs no local web server, VBS launcher, external Node.js installation, or network connection for ordinary drawing. The same renderer and storage code serve both platforms. Browser and desktop libraries are separate; move boards with editable exports.

`pnpm desktop:dist` creates installers for the current OS, after checking for a configured tldraw key. The manual GitHub Actions desktop workflow builds Windows, macOS, and Linux artifacts; it does not publish them. Certificates, notarization, and signing credentials must be configured before a public native release. Keep Electron updated.

## Your boards

- Click the stacked-board icon or press Ctrl/Cmd K to toggle the board sidebar. It stays open across board switches and reloads. A single menu filters All boards, Favourites, Collections, and individual collections. The adjacent sort button offers newest/oldest creation and most/least recent editing; your choice persists.
- The plus beside the title immediately creates a blank board. The five primary tools are Select, Pen, Eraser, Text, and Hand.
- Click the title to rename a board or assign a collection. Create a collection by entering a new name.
- The star beside the title toggles a favourite. Rename by clicking the title. These actions are no longer repeated in the board menu.
- Delete in the board menu or on a library card asks for confirmation, then permanently removes the board and its records. Images shared with another board are retained. On upgrading from the old Trash workflow, previously trashed boards return to the library; none are automatically purged.
- Thumbnails are cached in both light and dark modes. Older previews rebuild as their cards come into view, without opening those boards or changing the canvas theme.
- Autosave writes changed records in atomic IndexedDB transactions. Images are stored as binary blobs. Saving stays visually quiet; errors still show an explicit warning with recovery actions.
- Failed saves keep pending edits in memory and show retry/export actions. A close warning protects pending work where the browser supports it. A crash before a transaction commits can still lose the latest edits: export backups for important work.
- Another window modifying the active board triggers a warning and makes this window read-only. Export unsaved edits, then reopen the saved version. Revision checks prevent stale writes.
- **Export all boards** in the sidebar saves the entire library in a single `.canvas` file, including collections, favourites, timestamps and embedded media. Imports accept a single board, a library backup, or several files selected together (up to 512 MB total). Every board is validated before the whole batch is added atomically as new copies; existing boards are never overwritten.
- A single-board `.canvas` backup embeds images/video and preserves the editable document, metadata and view. PNG and SVG exports use the selection, or the current page when nothing is selected.
- Import `.canvas`, `.tldr`, and the old app's `.folio` exports. Import always creates separate copies. The `.folio` importer preserves the original dark palette and custom stroke widths. It does not modify or directly import the old SQLite database.
- Imported media remains editable; original files with unresolved local-only image references must be exported again from their source app.
- Existing multi-page imports remain accessible through **Board menu → Imported pages**. New boards have one canvas, with no page selector or page-creation controls.

Browser storage is local to the browser profile **and origin**. Changing host, port, browser, or device creates a separate library. Clearing site data can erase it. Whitebored requests persistent storage after creating a board, but a browser can refuse the request. This is not cloud backup or cross-device sync.

## Sharing

Click the people icon beside the title, then **Create shared copy**. This uploads the board/media and immediately opens the shared copy. The original stays local and independent. Copy the short `https://whitebored.app/s/…` link to invite people; everyone with it can edit without an account. Older shared links remain supported.

The Share button shows connected participants. Open it to choose your name/color, copy the link, or see the full roster. Names appear beside smoothly animated cursors. Join/leave notices and a reconnecting banner show connection changes; a silent network loss can take about two minutes to disappear. Extra tabs count as separate connections. Preferences/cameras stay personal and undo affects your own edits.

Previously opened rooms appear under **Shared boards** in the sidebar. Shared links last **seven days**, including time with nobody connected; the expiry appears in Share. Documents and media use SQLite Durable Objects. Local boards use IndexedDB and are never uploaded automatically.

The creator can choose **Share → Stop sharing**. After confirmation, Whitebored freezes the final online document, saves it with its media as a local board, revokes the link and returns the creator to that local board at the normal URL. If local saving fails, the frozen board remains recoverable by the owner until expiry; reopening its link offers **Keep a copy & continue**. Guests see a clear ended-session screen with the same action for their current copy, or **Back to local boards**.

The owner's separate key stays in the creator's browser. Clearing site data loses owner access; edit links cannot revoke sessions. Neither key is included in board exports. Revocation cannot erase copies participants already saved. Keep links private: the short path is a random 128-bit bearer capability, not a public board identifier.

Use **Board menu → Save local copy** or **Export** while sharing. **Export all boards** includes local boards only. Media is embedded in editable exports. The app preloads media for recovery, but a file that never reached a guest cannot be retrieved after revocation; save important copies before ending the session.

Shared editing requires a connection. If disconnected, keep the tab open while it reconnects; pending edits remain in memory and merge on reconnection. They are not a durable offline cache. Save a local copy before closing if reconnection is impossible. Closing/navigating warns about unsynced work.

Limits include 20 connections per board; 20,000 records / 8 MiB per document; 10 MiB per file; 100 files / 100 MiB per board; and 512 MiB of media across the deployment. PNG, JPEG, WebP, GIF, AVIF, MP4, WebM and MOV are supported. Bookmark cards and SVG uploads are not supported. Removing a shape retains its media for undo until the session ends. Network/day and server-wide creation/upload quotas also apply. See [all limits](COST-CONTROLS.md) and [realistic capacity](MULTIPLAYER-CAPACITY.md).

For collaboration development, run `pnpm build`, then `pnpm dev:sync`, and open `http://127.0.0.1:8790` in two browser profiles. SQLite runs locally with no Cloudflare account. Alternatively run `pnpm dev` alongside `pnpm dev:sync`; Vite proxies `/api` and WebSockets to port 8790. Production requires the [deployment bindings](DEPLOYMENT.md).

## Controls

| Action                                   | Shortcut                                       |
| ---------------------------------------- | ---------------------------------------------- |
| Select / pen / eraser / text / hand      | 1 / 2 / 3 / 4 / 5                              |
| Tool aliases                             | V / P or B / — / T / H                         |
| Continuous zoom in / out                 | Hold E / Q; + / − also work                    |
| Reset zoom / fit drawing / fit selection | R / Z / Shift 2                                |
| Temporary pan                            | Space + drag or middle-button drag             |
| Wheel                                    | Pan; Ctrl/Cmd + wheel zooms; touch pinch zooms |
| Previous / next visible toolbar colour   | A / D (also , / .)                             |
| Thinner / thicker stroke                 | S / W (also [ / ])                             |
| Lower / higher opacity                   | F / G (also Shift [ / Shift ])                 |
| Open ink controls                        | 6 or I                                         |
| Undo / redo                              | Ctrl/Cmd Z / Ctrl/Cmd Shift Z                  |
| Delete / duplicate                       | Delete or Backspace / Ctrl/Cmd D               |
| Board sidebar                            | Ctrl/Cmd K                                     |
| New board                                | Ctrl/Cmd Alt N                                 |
| Save                                     | Ctrl/Cmd S                                     |
| Preferences                              | Ctrl/Cmd ,                                     |
| Edit shortcuts                           | / or ?                                         |
| Hide / show controls                     | Ctrl/Cmd .                                     |
| Fullscreen                               | Alt Enter                                      |

These are defaults. Click **Shortcuts** at the bottom left to record replacement keys, add alternatives, remove bindings, or reset all. Conflicts are explained before a binding is changed. Version 0.3 starts with the requested defaults under a new preference key; the previous map remains stored as `folio-keymap-v2`. Custom bindings persist on the device, and tooltips reflect them. Clipboard/browser-reserved combinations, Escape, and Tab cannot be reassigned.

Space is a held gesture: press it, drag, then release to return to the current tool. The camera controller is ported from the original whiteboard: pointer-anchored exponential zoom, animation-frame-batched panning, and eased key release. **Preferences** exposes zoom speed (1.2–12×/second, default 5) and easing (0–200 ms, default 60). Mouse pan stops on release. The default wheel behavior is pan; Preferences can change it to zoom. Typing, composition, dialogs, sliders, and keyboard-focused controls retain their own keyboard input. Pointer-operated controls keep canvas focus, and Escape closes their popover before affecting the drawing tool.

**Text:** click to type, or drag with the Text tool to create a fixed-width box. Drag either side handle to change line wrapping, including while editing; corner handles scale the text. The contextual text bar offers an exact width, automatic/fixed wrapping, font and alignment, and explicit Edit/Done actions. Width changes keep the font size and support undo.

**Board menu:** switch light/dark mode, show the dot grid, or enable Snapping. Grid visibility and snapping are independent. Snapping is off by default; when enabled it aligns to objects and to the grid if shown.

The dock has six quick colour swatches, width −/+ controls (0.25–6 px), and an opacity slider (10–100%). The ink button opens the full palette. Text size replaces width when editing text. Changes apply to selected ink and the next stroke. Image insertion and export are in the top-right menu. Native tldraw selection, pressure-aware strokes, text editing, clipboard, and context actions are retained.

## Offline browser installation

The production build includes a manifest and service worker. After the first complete online load, bundled app code, icons, translations, and fonts are cached. Chrome/Edge expose browser installation; Safari and mobile browsers provide their platform's add-to-home-screen/dock flow. A downloaded desktop app is a separate option.

Updates are offered with **Save & update**, so a waiting service worker does not abruptly reload an active drawing. External embeds and remote linked media may still need the network.

## Public release

For your own deployment, add the public key issued by tldraw to `.env.local` as `VITE_TLDRAW_LICENSE_KEY`, or to the build environment. Run `pnpm release:check`, then build. That check only verifies a key is configured; test actual domain coverage and expiry on the intended production origin. Preserve tldraw's watermark and licensing logic.

For web hosting, serve `dist/` over HTTPS on a stable origin with SPA fallback to `index.html`. Serve HTML and `sw.js` with revalidation; hashed assets can be cached immutably. Local-only boards need no app server or account system; sharing requires the collaboration backend described above. Ensure your hosting provider sends correct MIME types and compresses assets.

Before native release, sign Windows binaries and sign/notarize macOS binaries, test on each target OS, verify pen hardware, and choose an update-distribution process. The Windows preview produced locally is unsigned. There is no native auto-updater yet.

See [deployment](DEPLOYMENT.md), [the research and architecture decisions](DECISIONS.md), and [verification notes](VERIFICATION.md).
