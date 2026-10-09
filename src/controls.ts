import type { Editor } from 'tldraw'
import { CameraController } from './camera'
import { chordFromEvent, type Command, type Keymap } from './keymap'

export function focusCanvas(editor: Editor) {
  editor.focus()
  editor.getContainer().focus({ preventScroll: true })
}
const repeats = new Set<Command>([
  'colorPrev',
  'colorNext',
  'widthDown',
  'widthUp',
  'opacityDown',
  'opacityUp',
  'undo',
  'redo',
])
export function installControls(
  editor: Editor,
  camera: CameraController,
  getOptions: () => { keys: Keymap; blocked: boolean; wheel: 'pan' | 'zoom'; penOnly: boolean },
  run: (command: Command) => void,
) {
  let panCode: string | null = null
  const held = new Map<string, Command>()
  const pans = new Map<number, { x: number; y: number; touch: boolean }>()
  const touches = new Map<number, { x: number; y: number }>()
  let touchGesture = false
  const normalCursor = () =>
    editor.setCursor({
      type:
        panCode || editor.getCurrentToolId() === 'hand'
          ? 'grab'
          : editor.getCurrentToolId() === 'draw'
            ? 'cross'
            : 'default',
    })
  const consume = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const capture = (event: PointerEvent) => {
    try {
      ;(event.target as Element).setPointerCapture(event.pointerId)
    } catch {
      /* Pointer cancelled by device. */
    }
  }
  const onCanvas = (target: EventTarget | null) =>
    target instanceof Element &&
    !!target.closest('.tl-container') &&
    !target.closest(
      '.canvas-controls, .tlui-menu, .tlui-popover, [role="menu"], button, input, textarea, select, [contenteditable="true"]',
    )
  const reset = () => {
    camera.flush()
    camera.stop()
    panCode = null
    held.clear()
    pans.clear()
    touches.clear()
    touchGesture = false
    normalCursor()
  }
  const keydown = (event: KeyboardEvent) => {
    const { keys, blocked } = getOptions()
    if (blocked) {
      reset()
      return
    }
    const target = event.target instanceof HTMLElement ? event.target : null
    if (
      event.isComposing ||
      target?.closest(
        'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"],[role="listbox"],[role="combobox"]',
      ) ||
      editor.getEditingShapeId() ||
      editor.menus.getOpenMenus().length
    )
      return
    if (target?.closest('button') && [' ', 'Enter'].includes(event.key)) return
    if (event.key === 'Escape') {
      reset()
      return
    }
    const chord = chordFromEvent(event)
    const command = (Object.entries(keys) as [Command, string[]][]).find(
      ([, bindings]) => chord && bindings.includes(chord),
    )?.[0]
    if (!command) {
      // The editable map also owns unassigned SDK Space/comma shortcuts.
      if (event.code === 'Space' || event.key === ',') consume(event)
      return
    }
    consume(event)
    if (event.repeat && held.get(event.code) !== command) return
    held.set(event.code, command)
    if (command === 'pan') {
      if (!panCode) {
        focusCanvas(editor)
        panCode = event.code
        editor.setCursor({ type: 'grab' })
      }
    } else if (command === 'zoomIn' || command === 'zoomOut') {
      focusCanvas(editor)
      camera.hold(event.code, command === 'zoomIn' ? 1 : -1)
    } else if (!event.repeat || repeats.has(command)) run(command)
  }
  const keyup = (event: KeyboardEvent) => {
    const command = held.get(event.code)
    held.delete(event.code)
    camera.release(event.code)
    if (event.code === panCode) {
      consume(event)
      panCode = null
      normalCursor()
    } else if (command === 'zoomIn' || command === 'zoomOut') consume(event)
  }
  const down = (event: PointerEvent) => {
    if (!onCanvas(event.target) || getOptions().blocked || editor.getEditingShapeId()) return
    camera.point(event.clientX, event.clientY)
    if (event.pointerType === 'touch') {
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size >= 2 || getOptions().penOnly || editor.getCurrentToolId() === 'hand') {
        if (!touchGesture && touches.size >= 2) editor.cancel()
        touchGesture = true
        for (const [id, p] of touches) pans.set(id, { ...p, touch: true })
        consume(event)
        capture(event)
        return
      }
    }
    if (
      event.button === 1 ||
      (event.button === 0 && (panCode || editor.getCurrentToolId() === 'hand'))
    ) {
      consume(event)
      focusCanvas(editor)
      pans.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch',
      })
      capture(event)
      editor.setCursor({ type: 'grabbing' })
    }
  }
  const move = (event: PointerEvent) => {
    if (getOptions().blocked) {
      reset()
      return
    }
    if (onCanvas(event.target) || pans.has(event.pointerId))
      camera.point(event.clientX, event.clientY)
    if (touches.has(event.pointerId))
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const previous = pans.get(event.pointerId)
    if (!previous) return
    consume(event)
    const other = [...pans.entries()].find(([id, p]) => id !== event.pointerId && p.touch)?.[1]
    if (previous.touch && other) {
      const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y)
      const newDistance = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      camera.point((event.clientX + other.x) / 2, (event.clientY + other.y) / 2)
      if (oldDistance > 5 && newDistance > 5) camera.zoom(newDistance / oldDistance)
      camera.pan((event.clientX - previous.x) / 2, (event.clientY - previous.y) / 2)
    } else camera.pan(event.clientX - previous.x, event.clientY - previous.y)
    pans.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY })
  }
  const up = (event: PointerEvent) => {
    touches.delete(event.pointerId)
    if (pans.has(event.pointerId)) {
      consume(event)
      pans.delete(event.pointerId)
      camera.flush()
    }
    if (!touches.size) touchGesture = false
    if (!pans.size) normalCursor()
  }
  const wheel = (event: WheelEvent) => {
    if (!onCanvas(event.target) || getOptions().blocked) return
    consume(event)
    camera.point(event.clientX, event.clientY)
    const scale =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? editor.getViewportScreenBounds().h : 1
    if (event.ctrlKey || event.metaKey || getOptions().wheel === 'zoom')
      camera.zoom(Math.exp(-Math.max(-200, Math.min(200, event.deltaY * scale)) * 0.01))
    else
      camera.pan(
        -(event.shiftKey ? event.deltaY : event.deltaX) * scale,
        -(event.shiftKey ? event.deltaX : event.deltaY) * scale,
      )
  }
  const visibility = () => {
    if (document.hidden) reset()
  }
  window.addEventListener('keydown', keydown, true)
  window.addEventListener('keyup', keyup, true)
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointermove', move, { capture: true, passive: false })
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  window.addEventListener('wheel', wheel, { capture: true, passive: false })
  window.addEventListener('blur', reset)
  document.addEventListener('visibilitychange', visibility)
  return () => {
    reset()
    window.removeEventListener('keydown', keydown, true)
    window.removeEventListener('keyup', keyup, true)
    window.removeEventListener('pointerdown', down, true)
    window.removeEventListener('pointermove', move, true)
    window.removeEventListener('pointerup', up, true)
    window.removeEventListener('pointercancel', up, true)
    window.removeEventListener('wheel', wheel, true)
    window.removeEventListener('blur', reset)
    document.removeEventListener('visibilitychange', visibility)
  }
}
