import {
  Editor,
  createTLStore,
  loadSnapshot,
  defaultBindingUtils,
  defaultAddFontsFromNode,
  tipTapDefaultExtensions,
} from 'tldraw'
import { assetUrls, normalTheme, legacyTheme, storeShapeUtils } from './canvasConfig'
import { createAssetStore, readBoard, savePreviews, type Board } from './storage'

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

export function hasCurrentPreviews(board: Board) {
  return (
    board.previews?.revision === board.revision &&
    (!board.session?.currentPageId || board.previews.pageId === board.session.currentPageId)
  )
}

export async function renderPreviews(editor: Editor, board: Board) {
  const pageId = editor.getCurrentPageId()
  if (hasCurrentPreviews(board) && board.previews?.pageId === pageId) return
  const ids = [...editor.getCurrentPageShapeIds()]
  const previews: NonNullable<Board['previews']> = { revision: board.revision, pageId }
  if (ids.length) {
    const bounds = editor.getCurrentPageBounds()
    const scale = Math.min(1, 480 / (Math.max(bounds?.w ?? 480, bounds?.h ?? 480) + 40))
    // Explicit export modes do not change the user's editor or affect photographs.
    for (const theme of ['light', 'dark'] as const) {
      const image = await editor.toImage(ids, {
        format: 'png',
        scale,
        pixelRatio: 1,
        background: true,
        padding: 20,
        darkMode: theme === 'dark',
      })
      previews[theme] = await toDataUrl(image.blob)
    }
  }
  await savePreviews(board.id, previews)
}

// At most one background renderer, requested only by cards near the visible scroll area.
let queue: Promise<unknown> = Promise.resolve()
const pending = new Map<string, Promise<void>>()
export function queuePreview(board: Board) {
  const key = `${board.id}:${board.revision}:${board.session?.currentPageId ?? ''}`
  const existing = pending.get(key)
  if (existing) return existing
  const work = queue
    .catch(() => {})
    .then(async () => {
      const { board: latest, snapshot } = await readBoard(board.id)
      if (hasCurrentPreviews(latest)) return
      if (!snapshot) {
        await savePreviews(latest.id, { revision: latest.revision, pageId: '' })
        return
      }
      const assets = createAssetStore()
      const container = document.createElement('div')
      container.className = 'preview-renderer'
      container.setAttribute('aria-hidden', 'true')
      container.inert = true
      document.body.append(container)
      let editor: Editor | undefined
      try {
        const store = createTLStore({ shapeUtils: storeShapeUtils, assets: assets.assets })
        loadSnapshot(store, snapshot)
        editor = new Editor({
          store,
          shapeUtils: storeShapeUtils,
          bindingUtils: defaultBindingUtils,
          tools: [],
          getContainer: () => container,
          autoFocus: false,
          licenseKey: import.meta.env.VITE_TLDRAW_LICENSE_KEY,
          fontAssetUrls: assetUrls.fonts,
          themes: { default: latest.legacy ? legacyTheme : normalTheme },
          options: {
            maxShapesPerPage: 100000,
            text: {
              tipTapConfig: { extensions: tipTapDefaultExtensions },
              addFontsFromNode: defaultAddFontsFromNode,
            },
          },
        })
        await renderPreviews(editor, latest)
      } finally {
        editor?.dispose()
        assets.dispose()
        container.remove()
      }
    })
    .finally(() => pending.delete(key))
  pending.set(key, work)
  queue = work
  return work
}
