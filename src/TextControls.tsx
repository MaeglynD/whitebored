import { useRef, useState, type PointerEvent } from 'react'
import { AlignLeft, AlignCenter, AlignRight, Check, Pencil, WrapText } from 'lucide-react'
import { startEditingShapeWithRichText, useEditor, useValue, type TLTextShape } from 'tldraw'
import { Select } from './Select'
import { focusCanvas } from './controls'

export function TextControls() {
  const editor = useEditor()
  const drag = useRef<{
    shape: TLTextShape
    width: number
    origin: { x: number; y: number }
    rotation: number
    side: 'left' | 'right'
    mark: string
  } | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const skipBlur = useRef(false)
  const state = useValue(
    'text controls',
    () => {
      const selected = editor.getOnlySelectedShape()
      if (
        editor.getIsReadonly() ||
        selected?.isLocked ||
        (editor.getCurrentToolId() !== 'text' && !editor.isIn('select'))
      )
        return null
      if (!selected || selected.type !== 'text') return { shape: null }
      const shape = selected as TLTextShape
      const bounds = editor.getShapeGeometry(shape).bounds
      const transform = editor.getShapePageTransform(shape)!
      const viewport = editor.getViewportScreenBounds()
      const point = (x: number) => {
        const screen = editor.pageToScreen(transform.applyToPoint({ x, y: bounds.midY }))
        return { x: screen.x - viewport.x, y: screen.y - viewport.y }
      }
      return {
        shape,
        width: bounds.w / shape.props.scale,
        left: point(bounds.minX),
        right: point(bounds.maxX),
        rotation: transform.rotation(),
        editing: editor.getEditingShapeId() === shape.id,
      }
    },
    [editor],
  )
  if (!state) return null
  if (!state.shape)
    return editor.getCurrentToolId() === 'text' ? (
      <div className="text-hint glass">Click to type · Drag to set a text box width</div>
    ) : null
  const { shape, width, left, right, rotation, editing } = state
  const update = (props: Partial<TLTextShape['props']>) => {
    editor.markHistoryStoppingPoint('format text')
    editor.updateShape<TLTextShape>({ id: shape.id, type: 'text', props })
  }
  const commitWidth = () => {
    if (draft !== null) {
      const value = Number(draft)
      if (Number.isFinite(value) && value >= 24)
        update({ w: Math.min(10000, value), autoSize: false })
      setDraft(null)
    }
  }
  const down = (event: PointerEvent<HTMLButtonElement>, side: 'left' | 'right') => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    // Keep the current text selection intact until the explicit width gesture begins.
    editor.complete()
    editor.setCurrentTool('select')
    editor.select(shape.id)
    drag.current = {
      shape,
      width,
      origin: editor.screenToPage({ x: event.clientX, y: event.clientY }),
      rotation,
      side,
      mark: editor.markHistoryStoppingPoint('resize text width'),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current
    if (!start) return
    event.preventDefault()
    const point = editor.screenToPage({ x: event.clientX, y: event.clientY })
    // Use the original page transform: a left-edge resize moves the shape's origin.
    const delta =
      ((point.x - start.origin.x) * Math.cos(start.rotation) +
        (point.y - start.origin.y) * Math.sin(start.rotation)) /
      start.shape.props.scale
    const next = Math.max(
      24,
      Math.min(10000, start.width + (start.side === 'right' ? delta : -delta)),
    )
    const offset = start.side === 'left' ? (start.width - next) * start.shape.props.scale : 0
    editor.updateShape<TLTextShape>({
      id: start.shape.id,
      type: 'text',
      x: start.shape.x + offset * Math.cos(start.shape.rotation),
      y: start.shape.y + offset * Math.sin(start.shape.rotation),
      props: { w: next, autoSize: false },
    })
  }
  const finish = (cancel = false) => {
    if (cancel && drag.current) editor.bailToMark(drag.current.mark)
    drag.current = null
    focusCanvas(editor)
  }
  return (
    <>
      <div
        className="text-controls glass"
        role="group"
        aria-label="Text formatting"
        data-app-ui
        onKeyDownCapture={(event) => editor.markEventAsHandled(event.nativeEvent)}
        onKeyUpCapture={(event) => editor.markEventAsHandled(event.nativeEvent)}
      >
        <Select
          label="Text font"
          value={shape.props.font}
          onClose={() => {
            const input = editor
              .getContainer()
              .querySelector<HTMLElement>('[contenteditable="true"]')
            if (input) input.focus()
            else focusCanvas(editor)
          }}
          onChange={(font) => update({ font: font as TLTextShape['props']['font'] })}
          options={[
            { value: 'sans', label: 'Sans' },
            { value: 'serif', label: 'Serif' },
            { value: 'mono', label: 'Mono' },
            { value: 'draw', label: 'Handwritten' },
          ]}
        />
        <div className="text-alignment">
          {(
            [
              { value: 'start', label: 'Align left', Icon: AlignLeft },
              { value: 'middle', label: 'Align centre', Icon: AlignCenter },
              { value: 'end', label: 'Align right', Icon: AlignRight },
            ] as const
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              aria-label={label}
              title={label}
              aria-pressed={shape.props.textAlign === value}
              onClick={() => update({ textAlign: value })}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>
        <i className="control-divider" />
        <button
          className="text-wrap-toggle"
          aria-label="Wrap text"
          aria-pressed={!shape.props.autoSize}
          title={shape.props.autoSize ? 'Set a fixed wrapping width' : 'Return to automatic width'}
          onClick={() => update({ autoSize: !shape.props.autoSize, w: width })}
        >
          <WrapText size={16} />
          <span>Wrap</span>
        </button>
        <label className="text-width">
          Width
          <input
            aria-label="Text width"
            type="number"
            min="24"
            max="10000"
            step="10"
            value={draft ?? Math.round(width)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              if (!skipBlur.current) commitWidth()
            }}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                commitWidth()
                skipBlur.current = true
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setDraft(null)
                skipBlur.current = true
              }
            }}
            onKeyUp={(event) => {
              event.stopPropagation()
              if (skipBlur.current) {
                event.currentTarget.blur()
                skipBlur.current = false
                const input = editor
                  .getContainer()
                  .querySelector<HTMLElement>('[contenteditable="true"]')
                if (input) input.focus()
                else focusCanvas(editor)
              }
            }}
          />
          <span>px</span>
        </label>
        <i className="control-divider" />
        <button
          className="text-edit"
          onClick={() => {
            editor.complete()
            if (editing) {
              editor.setCurrentTool('select')
              focusCanvas(editor)
            } else startEditingShapeWithRichText(editor, shape.id)
          }}
        >
          {editing ? <Check size={14} /> : <Pencil size={14} />}
          <span>{editing ? 'Done' : 'Edit text'}</span>
        </button>
      </div>
      {(['left', 'right'] as const).map((side) => {
        const position = side === 'left' ? left : right
        return (
          <button
            key={side}
            className="text-width-handle"
            data-app-ui
            aria-label={`Resize text width from ${side}`}
            title="Drag to change wrapping width"
            style={{
              left: position.x,
              top: position.y,
              transform: `translate(-50%, -50%) rotate(${rotation}rad)`,
            }}
            onPointerDown={(event) => down(event, side)}
            onPointerMove={move}
            onPointerUp={() => finish()}
            onPointerCancel={() => finish(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && drag.current) {
                event.preventDefault()
                finish(true)
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault()
                event.stopPropagation()
                update({
                  w: Math.max(
                    24,
                    width + (event.key === 'ArrowRight' ? 1 : -1) * (event.shiftKey ? 1 : 10),
                  ),
                  autoSize: false,
                })
              }
            }}
            onKeyDownCapture={(event) => editor.markEventAsHandled(event.nativeEvent)}
            onKeyUpCapture={(event) => editor.markEventAsHandled(event.nativeEvent)}
          >
            <span />
          </button>
        )
      })}
    </>
  )
}
