import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  Tldraw,
  createTLStore,
  loadSnapshot,
  getSnapshot,
  serializeTldrawJson,
  DefaultFontStyle,
  toRichText,
  type Editor,
  type TLUiOverrides,
  type TLComponents,
  type TLEditorSnapshot,
} from 'tldraw'
import { CanvasBackground, GridVisibility } from './CanvasBackground'
import { backupMetadata } from './backups'
import { BoardSaving, type SaveStatus } from './saving'
import { createAssetStore, download, type Board } from './storage'
import { CanvasControls, type CanvasControlsProps } from './CanvasControls'
import { applyInk, readInk } from './ink'
import { focusCanvas } from './controls'
import { assetUrls, normalTheme, legacyTheme, shapeUtils, storeShapeUtils } from './canvasConfig'
import { renderPreviews } from './previews'
import type { Keymap } from './keymap'

const overrides: TLUiOverrides = {
  tools(_editor, tools) {
    for (const tool of Object.values(tools)) tool.kbd = undefined
    return tools
  },
  actions(_editor, actions) {
    for (const action of Object.values(actions)) action.kbd = undefined
    return actions
  },
}
const components: TLComponents = {
  Background: CanvasBackground,
  Grid: null,
  Toolbar: null,
  NavigationPanel: null,
  StylePanel: null,
  MenuPanel: null,
  PageMenu: null,
  MainMenu: null,
  QuickActions: null,
  ActionsMenu: null,
  HelperButtons: null,
  DebugMenu: null,
  DebugPanel: null,
  SharePanel: null,
  HelpMenu: null,
}
export interface CanvasHandle {
  editor: Editor | null
  flush: () => Promise<void>
  export: (format: 'canvas' | 'png' | 'svg') => Promise<void>
  thumbnail: () => Promise<void>
  dirty: () => boolean
}
export interface CanvasProps {
  board: Board
  snapshot?: Partial<TLEditorSnapshot>
  onStatus: (status: SaveStatus, error?: Error) => void
  zoomSpeed: number
  zoomEase: number
  wheel: 'pan' | 'zoom'
  snapping: boolean
  grid: boolean
  dark: boolean
  penOnly: boolean
  keys: Keymap
  blocked: boolean
  onAction: CanvasControlsProps['onAction']
}
export const EditorCanvas = forwardRef<CanvasHandle, CanvasProps>(
  function EditorCanvas(props, ref) {
    const { board, snapshot, onStatus } = props
    const assetStore = useMemo(() => createAssetStore(), [])
    const store = useMemo(() => {
      const store = createTLStore({ assets: assetStore.assets, shapeUtils: storeShapeUtils })
      if (snapshot) loadSnapshot(store, snapshot)
      return store
    }, [])
    const editorRef = useRef<Editor | null>(null)
    const saver = useRef<BoardSaving | null>(null)
    const [ready, setReady] = useState(false)
    const [ink, setInk] = useState(readInk)
    const latestInk = useRef(ink)
    latestInk.current = ink
    useEffect(() => {
      try {
        localStorage.setItem('folio-ink-v2', JSON.stringify(ink))
      } catch {
        /* optional */
      }
    }, [ink])
    useEffect(
      () => () => {
        saver.current?.dispose()
        assetStore.dispose()
      },
      [assetStore],
    )
    useEffect(() => {
      const editor = editorRef.current
      if (!editor) return
      editor.setCameraOptions({ wheelBehavior: props.wheel })
      editor.updateInstanceState({
        isGridMode: props.grid && props.snapping,
        isPenMode: props.penOnly,
      })
      editor.user.updateUserPreferences({
        colorScheme: props.dark || board.legacy ? 'dark' : 'light',
        isSnapMode: props.snapping,
      })
    }, [props.wheel, props.grid, props.snapping, props.dark, props.penOnly, ready, board.legacy])
    const flush = async () => {
      const editor = editorRef.current
      if (editor) {
        editor.complete()
        await saver.current?.flush(getSnapshot(editor.store).session)
      }
    }
    useImperativeHandle(
      ref,
      () => ({
        editor: editorRef.current,
        flush,
        dirty: () => saver.current?.dirty ?? false,
        async export(format) {
          const editor = editorRef.current
          if (!editor) return
          if (format === 'canvas') {
            const document = JSON.parse(await serializeTldrawJson(editor))
            if (
              document.records.some(
                (r: any) =>
                  r.typeName === 'asset' &&
                  ['image', 'video'].includes(r.type) &&
                  r.props.src &&
                  !r.props.src.startsWith('data:'),
              )
            )
              throw new Error(
                'An image or video could not be included in the backup. Wait for uploads to finish, check your connection for linked media, then retry.',
              )
            download(
              new Blob(
                [
                  JSON.stringify({
                    ...backupMetadata(board),
                    updatedAt: saver.current?.dirty
                      ? Date.now()
                      : (saver.current?.metadata.updatedAt ?? board.updatedAt),
                    document,
                    session: getSnapshot(editor.store).session,
                  }),
                ],
                { type: 'application/json' },
              ),
              board.title + '.canvas',
            )
            return
          }
          const selected = editor.getSelectedShapeIds()
          const ids = selected.length ? selected : [...editor.getCurrentPageShapeIds()]
          if (!ids.length) throw new Error('Add something to the board before exporting an image.')
          if (format === 'png') {
            const image = await editor.toImage(ids, {
              format: 'png',
              background: true,
              padding: 32,
              scale: 2,
            })
            download(image.blob, board.title + '.png')
          } else {
            const image = await editor.getSvgString(ids, { background: true, padding: 32 })
            if (image)
              download(new Blob([image.svg], { type: 'image/svg+xml' }), board.title + '.svg')
          }
        },
        async thumbnail() {
          const editor = editorRef.current
          if (!editor) return
          await flush()
          const saved = saver.current?.metadata
          if (saved) await renderPreviews(editor, saved)
        },
      }),
      [board, ready],
    )
    return (
      <GridVisibility.Provider value={props.grid}>
        <Tldraw
          store={store}
          shapeUtils={shapeUtils}
          assetUrls={assetUrls}
          themes={{ default: board.legacy ? legacyTheme : normalTheme }}
          licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
          components={components}
          overrides={overrides}
          options={{ maxShapesPerPage: 100000, cameraSlideFriction: 1, spacebarPanning: false }}
          onMount={(editor) => {
            editorRef.current = editor
            editor.user.updateUserPreferences({
              colorScheme: props.dark || board.legacy ? 'dark' : 'light',
              isSnapMode: props.snapping,
            })
            editor.setStyleForNextShapes(DefaultFontStyle, 'sans')
            applyInk(editor, latestInk.current)
            editor.updateInstanceState({
              isGridMode: props.grid && props.snapping,
              isPenMode: props.penOnly,
            })
            editor.setCameraOptions({ wheelBehavior: props.wheel })
            if (!board.schema && board.template) seedBoard(editor, board.template)
            saver.current = new BoardSaving(editor, board, onStatus)
            const removeWidth = editor.sideEffects.registerBeforeCreateHandler('shape', (shape) =>
              shape.type === 'draw' && typeof shape.meta.folioWidth !== 'number'
                ? { ...shape, meta: { ...shape.meta, folioWidth: latestInk.current.width } }
                : shape,
            )
            editor.setCurrentTool('draw')
            focusCanvas(editor)
            setReady(true)
            return () => {
              removeWidth()
              saver.current?.dispose()
              editorRef.current = null
            }
          }}
        >
          <CanvasControls
            zoomSpeed={props.zoomSpeed}
            zoomEase={props.zoomEase}
            dark={props.dark}
            grid={props.grid}
            snapping={props.snapping}
            wheel={props.wheel}
            penOnly={props.penOnly}
            keys={props.keys}
            blocked={props.blocked}
            ink={ink}
            changeInk={setInk}
            onAction={props.onAction}
          />
        </Tldraw>
      </GridVisibility.Provider>
    )
  },
)

function seedBoard(editor: Editor, template: string) {
  const text = (
    id: string,
    x: number,
    y: number,
    value: string,
    size: 's' | 'm' | 'l' | 'xl' = 'm',
    color = 'black',
  ) => ({
    id: `shape:${id}` as any,
    type: 'text' as const,
    x,
    y,
    props: {
      richText: toRichText(value),
      font: 'sans' as const,
      size,
      color: color as any,
      autoSize: true,
    },
  })
  const box = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    value: string,
    color: 'green' | 'blue' | 'orange' | 'yellow',
  ) => ({
    id: `shape:${id}` as any,
    type: 'geo' as const,
    x,
    y,
    props: {
      w,
      h,
      geo: 'rectangle' as const,
      dash: 'solid' as const,
      fill: 'semi' as const,
      color,
      size: 's' as const,
      font: 'sans' as const,
      richText: toRichText(value),
    },
  })
  if (template === 'welcome')
    editor.createShapes([
      text('eyebrow', 90, 60, 'YOUR SPACE, YOUR PACE', 's', 'grey'),
      text('title', 86, 110, 'A little room\nto think.', 'xl'),
      text(
        'subtitle',
        90,
        245,
        'Sketch a thought. Follow a thread.\nMake something that wasn’t here before.',
        's',
        'grey',
      ),
      box('one', 90, 370, 220, 128, 'Start with\na small idea', 'green'),
      box('two', 385, 370, 220, 128, 'See where\nit takes you', 'blue'),
      {
        id: 'shape:arrow' as any,
        type: 'arrow',
        props: {
          start: { x: 320, y: 434 },
          end: { x: 374, y: 434 },
          color: 'grey',
          size: 's',
          dash: 'draw',
        },
      },
      {
        id: 'shape:note' as any,
        type: 'note',
        x: 670,
        y: 115,
        rotation: 0.06,
        props: {
          richText: toRichText(
            'A few little things\n\nP  to draw\nT  to type\nN  for a sticky note\n\nSpace + drag to explore',
          ),
          color: 'yellow',
          size: 's',
          font: 'sans',
        },
      },
      text('footer', 90, 550, 'Everything here is editable. Make yourself at home.', 's', 'grey'),
    ])
  else if (template === 'ideas')
    editor.createShapes([
      text('title', 100, 60, 'What if…', 'xl'),
      text('subtitle', 100, 130, 'Give the idea some room.', 's', 'grey'),
      box('one', 100, 235, 230, 170, 'The spark', 'green'),
      box('two', 405, 235, 230, 170, 'Possibilities', 'blue'),
      box('three', 710, 235, 230, 170, 'Next small step', 'orange'),
    ])
  else
    editor.createShapes([
      text('title', 100, 65, 'This week, with intention.', 'xl'),
      ...['Make room for', 'In motion', 'A little progress'].map((v, i) =>
        box('week' + i, 100 + i * 300, 220, 250, 340, v, (['green', 'blue', 'orange'] as const)[i]),
      ),
    ])
  editor.zoomToFit()
  editor.clearHistory()
}
