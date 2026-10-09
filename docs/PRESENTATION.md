# Presentation notes

The README follows the product-first structure of [Excalidraw](https://github.com/excalidraw/excalidraw/blob/master/README.md) and [Immich](https://github.com/immich-app/immich/blob/main/README.md): a compact identity, a working-product preview, useful links, and clear setup instructions. [shadcn/ui](https://github.com/shadcn-ui/ui/blob/main/README.md) is a useful reference for keeping the introduction short and linking out to detailed documentation. The copy, icon, example boards, and recording here are original.

The folded-page mark uses Folio's indigo accent and a simple silhouette that remains legible at tab-icon sizes. `public/favicon.svg` is the source; `pnpm assets:icons` regenerates the PNG and ICO variants. The maskable icon keeps its foreground within the safe area.

The README's hero follows the reader's light/dark preference. Its demo is an actual app recording, with a small GIF for GitHub playback and a higher-quality MP4. Both use synthetic boards created by `scripts/demo-scene.ts`, in a fresh Playwright browser context. They do not access a personal board library. Re-record with `pnpm docs:capture` while the dev server is running; Chromium and FFmpeg are required.

The longer usage notes live in [the guide](GUIDE.md); hosting and licensing setup live in [deployment](DEPLOYMENT.md). The README avoids duplicate setup instructions, fabricated performance claims, and badges for licenses the project has not adopted.
