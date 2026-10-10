<div align="center">
  <h1>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/media/wordmark-dark.svg">
      <img src="docs/media/wordmark-light.svg" alt="Whitebored" width="380">
    </picture>
  </h1>
  <p>A whiteboard app for pragmatists.</p>
  <p>
    <a href="https://github.com/MaeglynD/whitebored/actions/workflows/ci.yml"><img src="https://github.com/MaeglynD/whitebored/actions/workflows/ci.yml/badge.svg" alt="Build and tests"></a>
    <a href="https://tldraw.dev"><img src="https://img.shields.io/badge/built_with-tldraw-5969ce?style=flat&labelColor=292e39" alt="Built with tldraw"></a>
  </p>
  <p>
    <strong><a href="https://whitebored.app">Open Whitebored ↗</a></strong> ·
    <a href="#run-locally">Run locally</a> ·
    <a href="docs/GUIDE.md">Guide</a> ·
    <a href="https://github.com/MaeglynD/whitebored/issues">Feedback</a>
  </p>
  <br>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/media/whitebored-dark.png">
    <img src="docs/media/whitebored-light.png" alt="Whitebored with a room sketch, board library, and drawing controls." width="1200">
  </picture>
</div>

<br>

- Draw, erase, and write text with adjustable wrapping.
- Organise boards with collections, favourites, search, and sorting.
- Customise keybindings, zoom speed, ink width, colour, and opacity.
- Use light or dark mode, an optional grid, and optional snapping.
- Export images, individual boards, or a complete library backup.
- Work on local boards offline after the first online load.

## Run locally

Requires **Node.js 24** and **pnpm 11.25.0**.

```sh
git clone https://github.com/MaeglynD/whitebored.git
cd whitebored
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5173**. [Development, desktop builds, and usage](docs/GUIDE.md) · [Deployment](docs/DEPLOYMENT.md)

<details>
<summary><strong>Keybindings</strong></summary>

| Action                              | Default                               |
| :---------------------------------- | :------------------------------------ |
| Select · Pen · Eraser · Text · Hand | `1` · `2` · `3` · `4` · `5`           |
| Pan                                 | Hold `Space` and drag, or middle-drag |
| Zoom in / out                       | Hold `E` / `Q`, or `Ctrl/Cmd` + wheel |
| Fit drawing / reset zoom            | `Z` / `R`                             |
| Previous / next toolbar colour      | `A` / `D`                             |
| Thinner / thicker stroke            | `S` / `W`                             |
| Lower / higher opacity              | `F` / `G`                             |
| Board library                       | `Ctrl/Cmd K`                          |
| Edit shortcuts                      | `/`                                   |

Change these in **Shortcuts**. [Full controls →](docs/GUIDE.md#controls)

</details>

## Storage

Boards and media save on your device, in this browser profile and site address. No account or server storage is used. Use **Export all boards** to back up your library or move it to another device. [Storage guide →](docs/GUIDE.md#your-boards)

---

Powered by [tldraw](https://tldraw.dev). Its SDK requires a [trial, hobby, or commercial license](https://tldraw.dev/community/license) for public deployments.
