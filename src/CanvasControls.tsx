import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { DefaultColorStyle, DefaultSizeStyle, useEditor, useTools, useValue } from 'tldraw'
import {
  MousePointer2,
  Hand,
  Pencil,
  Eraser,
  Type,
  Undo2,
  Redo2,
  Minus,
  Plus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Maximize2,
  MoreHorizontal,
  Download,
  ImagePlus,
  Settings2,
  Keyboard,
  Grid2X2,
  Moon,
  Sun,
  Magnet,
  EyeOff,
  Expand,
  Layers3,
  Copy,
  Trash2,
} from 'lucide-react'
import { focusCanvas, installControls } from './controls'
import { CameraController } from './camera'
import { bindingLabel, type Command, type Keymap } from './keymap'
import { TextControls } from './TextControls'
import { Select } from './Select'
import { applyInk, palette, widths, type Ink } from './ink'

export interface CanvasControlsProps {
  shared?: boolean
  dark: boolean
  grid: boolean
  snapping: boolean
  zoomSpeed: number
  zoomEase: number
  wheel: 'pan' | 'zoom'
  penOnly: boolean
  keys: Keymap
  blocked: boolean
  ink: Ink
  changeInk: (ink: Ink) => void
  onAction: (
    command: Command | 'export' | 'duplicateBoard' | 'delete' | 'grid' | 'theme' | 'snapping',
  ) => void
}
const toolList = [
  { id: 'select', label: 'Select', Icon: MousePointer2 },
  { id: 'draw', label: 'Pen', Icon: Pencil },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'hand', label: 'Hand', Icon: Hand },
] as const
// Avoid native pointer focus racing the editor's focus call after clicking a control.
// Keyboard Tab focus is untouched, including Space/Enter button activation.
export const keepCanvasFocus = (event: ReactPointerEvent<HTMLElement>) => {
  if (event.target instanceof Element && event.target.closest('button:not([role=combobox])'))
    event.preventDefault()
}

export function CanvasControls(props: CanvasControlsProps) {
  const editor = useEditor()
  const camera = useMemo(() => new CameraController(editor), [editor])
  camera.speed = props.zoomSpeed
  camera.easeMs = props.zoomEase
  const tools = useTools()
  const [popover, setPopover] = useState<'ink' | 'zoom' | 'menu' | 'pages' | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const latestUi = useRef({ popover, focusMode })
  latestUi.current = { popover, focusMode }
  const controls = useRef<HTMLDivElement>(null)
  const active = useValue('active tool', () => editor.getCurrentToolId(), [editor])
  const compact = useValue('compact palette', () => editor.getViewportScreenBounds().w <= 460, [
    editor,
  ])
  const visiblePalette = palette.filter((c) =>
    (compact
      ? ['black', 'red', 'blue']
      : ['black', 'red', 'orange', 'green', 'blue', 'violet']
    ).includes(c.key),
  )
  const zoom = useValue('zoom', () => Math.round(editor.getZoomLevel() * 100), [editor])
  const canUndo = useValue('can undo', () => editor.getCanUndo(), [editor])
  const canRedo = useValue('can redo', () => editor.getCanRedo(), [editor])
  const readonly = useValue('readonly', () => editor.getIsReadonly(), [editor])
  const pages = useValue('pages', () => editor.getPages(), [editor])
  const currentPage = useValue('page', () => editor.getCurrentPageId(), [editor])
  const readShared = () => {
    const color = editor.getSharedStyles().get(DefaultColorStyle)
    const opacity = editor.getSharedOpacity()
    const size = editor.getSharedStyles().get(DefaultSizeStyle)
    const selected = editor.getSelectedShapes()
    const drawWidths = selected.filter((s) => s.type === 'draw').map((s) => s.meta.folioWidth)
    return {
      color: color?.type === 'shared' ? color.value : null,
      opacity: opacity.type === 'shared' ? Math.round(opacity.value * 100) : null,
      width:
        drawWidths.length && drawWidths.every((w) => typeof w === 'number' && w === drawWidths[0])
          ? (drawWidths[0] as number)
          : null,
      text: active === 'text' || (selected.length > 0 && selected.every((s) => s.type === 'text')),
      textSize: size?.type === 'shared' ? size.value : null,
      empty: editor.getCurrentPageShapeIds().size === 0,
    }
  }
  // Drawing changes points every frame. Repaint only when displayed values change.
  const sharedSignature = useValue('ink display', () => JSON.stringify(readShared()), [
    editor,
    active,
  ])
  const shared = useMemo(
    () => JSON.parse(sharedSignature) as ReturnType<typeof readShared>,
    [sharedSignature],
  )
  const currentInk = {
    ...props.ink,
    color: shared.color || props.ink.color,
    opacity: shared.opacity ?? props.ink.opacity,
    width: shared.width ?? props.ink.width,
    textSize: shared.textSize || props.ink.textSize,
  }
  const displayColor = palette.find((c) => c.key === currentInk.color) || palette[0]
  const lastProps = useRef(props)
  const lastRun = useRef<(command: Command) => void>(() => {})
  lastProps.current = props
  const setInk = <K extends keyof Ink>(field: K, value: Ink[K]) => {
    if (readonly) return
    // Selection values describe existing ink; only the edited field becomes a preference.
    const next = { ...props.ink, [field]: value }
    editor.markHistoryStoppingPoint('change ink')
    applyInk(editor, next, field)
    props.changeInk(next)
  }
  const cycle = (direction: number) => {
    const index = visiblePalette.findIndex((c) => c.key === currentInk.color)
    const next =
      index < 0
        ? direction > 0
          ? 0
          : visiblePalette.length - 1
        : (index + direction + visiblePalette.length) % visiblePalette.length
    setInk('color', visiblePalette[next].key)
  }
  const run = (command: Command) => {
    const view = [
      'pan',
      'zoomIn',
      'zoomOut',
      'zoomFit',
      'zoomReset',
      'zoomSelection',
      'focus',
      'fullscreen',
      'boards',
      'settings',
      'shortcuts',
      'save',
      'newBoard',
      'hand',
      'select',
    ]
    if (readonly && !view.includes(command)) return
    if (toolList.some((t) => t.id === command)) {
      editor.complete()
      editor.setCurrentTool(command)
      setPopover(null)
    } else
      switch (command) {
        case 'zoomIn':
          camera.zoom(1.25)
          break
        case 'zoomOut':
          camera.zoom(0.8)
          break
        case 'zoomFit':
          camera.fit()
          break
        case 'zoomSelection':
          camera.stop()
          editor.zoomToSelection({ animation: { duration: 180 } })
          break
        case 'zoomReset':
          camera.reset()
          break
        case 'colorPrev':
          cycle(-1)
          break
        case 'colorNext':
          cycle(1)
          break
        case 'opacityDown':
          setInk('opacity', Math.max(10, currentInk.opacity - 10))
          break
        case 'opacityUp':
          setInk('opacity', Math.min(100, currentInk.opacity + 10))
          break
        case 'widthDown':
          setInk('width', [...widths].reverse().find((w) => w < currentInk.width) ?? widths[0])
          break
        case 'widthUp':
          setInk('width', widths.find((w) => w > currentInk.width) ?? widths[widths.length - 1])
          break
        case 'undo':
          editor.undo()
          break
        case 'redo':
          editor.redo()
          break
        case 'delete':
          editor.markHistoryStoppingPoint('delete')
          editor.deleteShapes(editor.getSelectedShapeIds())
          break
        case 'duplicate':
          editor.markHistoryStoppingPoint('duplicate')
          editor.duplicateShapes(editor.getSelectedShapeIds(), { x: 16, y: 16 })
          break
        case 'selectAll':
          editor.markHistoryStoppingPoint('select all')
          editor.setCurrentTool('select')
          editor.selectAll()
          break
        case 'palette':
          setPopover((p) => (p === 'ink' ? null : 'ink'))
          break
        case 'focus':
          setFocusMode((v) => !v)
          setPopover(null)
          break
        case 'fullscreen':
          if (document.fullscreenElement) void document.exitFullscreen()
          else void document.documentElement.requestFullscreen().catch(() => {})
          break
        case 'pan':
          return
        default:
          setPopover(null)
          props.onAction(command)
          return
      }
    focusCanvas(editor)
  }
  lastRun.current = run
  useEffect(
    () =>
      installControls(
        editor,
        camera,
        () => lastProps.current,
        (command) => lastRun.current(command),
      ),
    [editor],
  )
  useEffect(() => {
    document.documentElement.classList.toggle('canvas-focus-mode', focusMode)
    return () => document.documentElement.classList.remove('canvas-focus-mode')
  }, [focusMode])
  useEffect(() => {
    if (props.blocked) {
      setPopover(null)
      camera.flush()
      camera.stop()
    }
  }, [props.blocked])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!controls.current?.contains(event.target as Node)) setPopover(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !lastProps.current.blocked &&
        (latestUi.current.popover || latestUi.current.focusMode)
      ) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPopover(null)
        setFocusMode(false)
        focusCanvas(editor)
      }
    }
    window.addEventListener('pointerdown', outside)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', escape, true)
    }
  }, [])
  const hint = (label: string, command: Command) =>
    `${label}${props.keys[command][0] ? ' · ' + bindingLabel(props.keys[command][0]) : ''}`
  const action = (command: Parameters<CanvasControlsProps['onAction']>[0]) => {
    setPopover(null)
    props.onAction(command)
  }
  const toggle = (value: NonNullable<typeof popover>) => {
    setPopover((p) => (p === value ? null : value))
    focusCanvas(editor)
  }
  return (
    <div
      ref={controls}
      className={'canvas-controls' + (focusMode ? ' is-hidden' : '')}
      onPointerDown={keepCanvasFocus}
    >
      {focusMode && (
        <button
          className="restore-controls glass"
          aria-label="Show controls"
          title={hint('Show controls', 'focus')}
          onClick={() => run('focus')}
        >
          <Layers3 size={18} />
        </button>
      )}
      {!focusMode && !props.blocked && <TextControls />}
      <div className="view-controls glass">
        <button
          className="zoom-step"
          aria-label="Zoom out"
          title={hint('Zoom out', 'zoomOut')}
          onClick={() => run('zoomOut')}
        >
          <Minus size={14} />
        </button>
        <button
          className="zoom-readout"
          aria-label="Zoom options"
          title="Zoom options"
          aria-expanded={popover === 'zoom'}
          onClick={() => toggle('zoom')}
        >
          {zoom}%<ChevronDown size={11} />
        </button>
        <button
          className="zoom-step"
          aria-label="Zoom in"
          title={hint('Zoom in', 'zoomIn')}
          onClick={() => run('zoomIn')}
        >
          <Plus size={14} />
        </button>
        <i className="control-divider" />
        <button
          aria-label="Board menu"
          title="Board menu"
          aria-expanded={popover === 'menu'}
          onClick={() => toggle('menu')}
        >
          <MoreHorizontal size={19} />
        </button>
        {popover === 'zoom' && (
          <div className="control-popover zoom-menu" role="group" aria-label="Zoom">
            <button
              onClick={() => {
                run('zoomFit')
                setPopover(null)
              }}
            >
              <Maximize2 size={15} />
              <span>Fit drawing</span>
              <kbd>{bindingLabel(props.keys.zoomFit[0])}</kbd>
            </button>
            <button
              onClick={() => {
                run('zoomSelection')
                setPopover(null)
              }}
              disabled={!editor.getSelectedShapeIds().length}
            >
              <MousePointer2 size={15} />
              <span>Fit selection</span>
              <kbd>{bindingLabel(props.keys.zoomSelection[0])}</kbd>
            </button>
            <button
              onClick={() => {
                run('zoomReset')
                setPopover(null)
              }}
            >
              <span className="menu-glyph">1:1</span>
              <span>Actual size</span>
              <kbd>{bindingLabel(props.keys.zoomReset[0])}</kbd>
            </button>
            <div className="zoom-presets">
              {[25, 50, 100, 200, 400].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    camera.stop()
                    const { x, y, z } = editor.getCamera()
                    const bounds = editor.getViewportScreenBounds()
                    const nextZoom = n / 100
                    editor.setCamera({
                      x: x + (bounds.w / 2) * (1 / nextZoom - 1 / z),
                      y: y + (bounds.h / 2) * (1 / nextZoom - 1 / z),
                      z: nextZoom,
                    })
                    setPopover(null)
                    focusCanvas(editor)
                  }}
                >
                  {n}%
                </button>
              ))}
            </div>
          </div>
        )}
        {popover === 'menu' && (
          <div className="control-popover board-menu" role="group" aria-label="Board actions">
            <button
              disabled={!canUndo || readonly}
              onClick={() => {
                run('undo')
                setPopover(null)
              }}
            >
              <Undo2 size={15} />
              <span>Undo</span>
            </button>
            <button
              disabled={!canRedo || readonly}
              onClick={() => {
                run('redo')
                setPopover(null)
              }}
            >
              <Redo2 size={15} />
              <span>Redo</span>
            </button>

            <button onClick={() => action('export')}>
              <Download size={15} />
              <span>Export</span>
            </button>
            <button
              onClick={() => {
                setPopover(null)
                tools.asset?.onSelect('toolbar')
                focusCanvas(editor)
              }}
              disabled={readonly}
            >
              <ImagePlus size={15} />
              <span>Add image or video</span>
            </button>
            <div className="menu-rule" />

            <button onClick={() => action('duplicateBoard')}>
              <Copy size={15} />
              <span>{props.shared ? 'Save local copy' : 'Duplicate board'}</span>
            </button>
            {pages.length > 1 && (
              <button onClick={() => setPopover('pages')}>
                <Layers3 size={15} />
                <span>Imported pages</span>
                <span className="menu-count">{pages.length}</span>
              </button>
            )}
            <div className="menu-rule" />
            <button onClick={() => action('grid')} aria-pressed={props.grid}>
              <Grid2X2 size={15} />
              <span>Toggle grid</span>
              {props.grid && <Check size={14} />}
            </button>
            <button onClick={() => action('snapping')} aria-pressed={props.snapping}>
              <Magnet size={15} />
              <span>Snapping</span>
              {props.snapping && <Check size={14} />}
            </button>
            <button onClick={() => action('theme')} aria-pressed={props.dark}>
              {props.dark ? <Moon size={15} /> : <Sun size={15} />}
              <span>Dark mode</span>
              {props.dark && <Check size={14} />}
            </button>
            <button onClick={() => run('focus')}>
              <EyeOff size={15} />
              <span>Hide controls</span>
              <kbd>{bindingLabel(props.keys.focus[0])}</kbd>
            </button>
            <button
              onClick={() => {
                run('fullscreen')
                setPopover(null)
              }}
            >
              <Expand size={15} />
              <span>Fullscreen</span>
            </button>

            {!props.shared && (
              <>
                <div className="menu-rule" />
                <button className="danger" onClick={() => action('delete')}>
                  <Trash2 size={15} />
                  <span>Delete board</span>
                </button>
              </>
            )}
          </div>
        )}
        {popover === 'pages' && (
          <div className="control-popover board-menu" role="group" aria-label="Imported pages">
            {pages.map((page) => (
              <button
                key={page.id}
                onClick={() => {
                  editor.setCurrentPage(page.id)
                  setPopover(null)
                  focusCanvas(editor)
                }}
              >
                <Layers3 size={15} />
                <span>{page.name}</span>
                {page.id === currentPage && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        className="drawing-dock glass"
        style={
          {
            '--ink-light': displayColor.light,
            '--ink-dark': displayColor.dark,
          } as React.CSSProperties
        }
        role="toolbar"
        aria-label="Drawing tools"
      >
        <div className="dock-tools">
          {toolList.map(({ id, label, Icon }) => (
            <button
              key={id}
              className="tool-button"
              aria-label={label}
              aria-pressed={active === id}
              title={hint(label, id)}
              disabled={readonly && !['hand', 'select'].includes(id)}
              onClick={() => run(id)}
            >
              <Icon size={19} strokeWidth={1.7} />
            </button>
          ))}
        </div>
        <i className="control-divider dock-separator" />
        <div className="dock-swatches">
          <button
            className="ink-trigger"
            aria-label="Ink controls"
            title={hint('Colour, width & opacity', 'palette')}
            aria-expanded={popover === 'ink'}
            onClick={() => toggle('ink')}
            disabled={readonly}
          >
            <span
              className="ink-dot"
              style={
                {
                  '--ink-light': displayColor.light,
                  '--ink-dark': displayColor.dark,
                } as React.CSSProperties
              }
            />
            <ChevronDown size={11} />
          </button>
          {visiblePalette.map((color) => (
            <button
              key={color.key}
              className="dock-colour"
              aria-label={color.name + ' colour'}
              aria-pressed={currentInk.color === color.key}
              title={color.name}
              disabled={readonly}
              style={
                { '--ink-light': color.light, '--ink-dark': color.dark } as React.CSSProperties
              }
              onClick={() => {
                setInk('color', color.key)
                focusCanvas(editor)
              }}
            >
              <span />
              {currentInk.color === color.key && <Check size={11} />}
            </button>
          ))}
        </div>
        <i className="control-divider dock-separator" />
        <div className="dock-width">
          {shared.text ? (
            <Select
              label="Text size"
              value={currentInk.textSize}
              onChange={(value) => setInk('textSize', value as Ink['textSize'])}
              onClose={() => focusCanvas(editor)}
              options={[
                { value: 's', label: 'Small' },
                { value: 'm', label: 'Medium' },
                { value: 'l', label: 'Large' },
                { value: 'xl', label: 'Extra large' },
              ]}
            />
          ) : (
            <>
              <button
                aria-label="Thinner stroke"
                title={hint('Thinner stroke', 'widthDown')}
                onClick={() => run('widthDown')}
                disabled={readonly || currentInk.width <= widths[0]}
              >
                <Minus size={14} />
              </button>
              <button
                className="width-trigger"
                aria-label="Stroke width"
                title="Stroke width"
                onClick={() => toggle('ink')}
                disabled={readonly}
              >
                <span
                  className="stroke-sample"
                  style={{ height: Math.max(1, currentInk.width), background: 'var(--ink-light)' }}
                />
                <span>{currentInk.width}</span>
              </button>
              <button
                aria-label="Thicker stroke"
                title={hint('Thicker stroke', 'widthUp')}
                onClick={() => run('widthUp')}
                disabled={readonly || currentInk.width >= widths[widths.length - 1]}
              >
                <Plus size={14} />
              </button>
            </>
          )}
        </div>
        <i className="control-divider dock-separator" />
        <label className="dock-opacity">
          <span>Opacity</span>
          <input
            aria-label="Ink opacity"
            type="range"
            min="10"
            max="100"
            step="10"
            value={currentInk.opacity}
            disabled={readonly}
            onChange={(e) => setInk('opacity', Number(e.target.value))}
            onPointerUp={() => focusCanvas(editor)}
          />
          <output>{currentInk.opacity}%</output>
        </label>
        {popover === 'ink' && (
          <div className="control-popover ink-panel" role="group" aria-label="Ink settings">
            <div className="ink-panel-heading">
              <strong>Colour</strong>
              <span>{displayColor.name}</span>
              <button
                aria-label="Previous colour"
                title={hint('Previous colour', 'colorPrev')}
                onClick={() => {
                  cycle(-1)
                  focusCanvas(editor)
                }}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                aria-label="Next colour"
                title={hint('Next colour', 'colorNext')}
                onClick={() => {
                  cycle(1)
                  focusCanvas(editor)
                }}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="colour-grid">
              {palette.map((color) => (
                <button
                  key={color.key}
                  className="colour-choice"
                  aria-label={color.name + ' colour'}
                  aria-pressed={currentInk.color === color.key}
                  title={color.name}
                  style={
                    { '--ink-light': color.light, '--ink-dark': color.dark } as React.CSSProperties
                  }
                  onClick={() => {
                    setInk('color', color.key)
                    focusCanvas(editor)
                  }}
                >
                  <span />
                  {currentInk.color === color.key && <Check size={12} />}
                </button>
              ))}
            </div>
            {shared.text ? (
              <div className="ink-field">
                <label>Text size</label>
                <div className="text-sizes">
                  {(['s', 'm', 'l', 'xl'] as const).map((size) => (
                    <button
                      key={size}
                      aria-label={'Text size ' + size.toUpperCase()}
                      aria-pressed={currentInk.textSize === size}
                      onClick={() => {
                        setInk('textSize', size)
                        focusCanvas(editor)
                      }}
                    >
                      {size.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ink-field">
                <label htmlFor="stroke-width">Stroke width</label>
                <output>{currentInk.width} px</output>
                <input
                  id="stroke-width"
                  aria-label="Stroke width slider"
                  type="range"
                  min="0"
                  max={widths.length - 1}
                  step="1"
                  value={Math.max(0, widths.indexOf(currentInk.width))}
                  onChange={(e) => setInk('width', widths[Number(e.target.value)])}
                  onPointerUp={() => focusCanvas(editor)}
                />
              </div>
            )}
            <div className="ink-field">
              <label htmlFor="ink-opacity">Opacity</label>
              <output>{currentInk.opacity}%</output>
              <input
                id="ink-opacity"
                aria-label="Opacity slider"
                type="range"
                min="10"
                max="100"
                step="10"
                value={currentInk.opacity}
                onChange={(e) => setInk('opacity', Number(e.target.value))}
                onPointerUp={() => focusCanvas(editor)}
              />
            </div>
            <div className="ink-preview">
              <span
                style={{
                  background: displayColor.light,
                  height: currentInk.width,
                  opacity: currentInk.opacity / 100,
                }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="workspace-actions">
        <button
          className="glass"
          aria-label="Keyboard shortcuts"
          title={hint('Keyboard shortcuts', 'shortcuts')}
          onClick={() => action('shortcuts')}
        >
          <Keyboard size={16} />
          <span>Shortcuts</span>
        </button>
        <button
          className="glass"
          aria-label="Preferences"
          title="Preferences"
          onClick={() => action('settings')}
        >
          <Settings2 size={16} />
        </button>
      </div>
    </div>
  )
}
