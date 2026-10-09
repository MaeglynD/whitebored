import type { Editor } from 'tldraw'

export interface Camera {
  x: number
  y: number
  z: number
}
export function moveCamera(
  camera: Camera,
  anchor: { x: number; y: number },
  nextZoom: number,
  dx = 0,
  dy = 0,
): Camera {
  const z = Math.min(30, Math.max(0.1, nextZoom))
  return {
    x: camera.x + anchor.x / z - anchor.x / camera.z + dx / z,
    y: camera.y + anchor.y / z - anchor.y / camera.z + dy / z,
    z,
  }
}

/** One camera writer for held keys, dragging, wheel and pen-mode touch gestures. */
export class CameraController {
  private raf = 0
  private last = 0
  private velocity = 0
  private held = new Set<string>()
  private panX = 0
  private panY = 0
  private wheelZoom = 1
  private anchor = { x: 0, y: 0 }
  private hasAnchor = false
  speed = 5
  easeMs = 60
  constructor(private editor: Editor) {}
  point(x: number, y: number) {
    const b = this.editor.getViewportScreenBounds()
    if (x >= b.x && y >= b.y && x <= b.maxX && y <= b.maxY) {
      this.anchor = { x: x - b.x, y: y - b.y }
      this.hasAnchor = true
    }
  }
  private getAnchor() {
    const b = this.editor.getViewportScreenBounds()
    return this.hasAnchor ? this.anchor : { x: b.w / 2, y: b.h / 2 }
  }
  hold(id: string, direction: 1 | -1) {
    this.held.add(`${direction}:${id}`)
    this.start()
  }
  release(id: string) {
    for (const value of this.held) if (value.endsWith(':' + id)) this.held.delete(value)
  }
  pan(dx: number, dy: number) {
    this.panX += dx
    this.panY += dy
    this.start()
  }
  zoom(factor: number) {
    this.wheelZoom *= factor
    this.start()
  }
  /** Commit the last pointer delta before blur, board changes, or an explicit save. */
  flush() {
    const c = this.editor.getCamera()
    if (this.panX || this.panY || this.wheelZoom !== 1)
      this.editor.setCamera(
        moveCamera(c, this.getAnchor(), c.z * this.wheelZoom, this.panX, this.panY),
        { immediate: true },
      )
    this.panX = 0
    this.panY = 0
    this.wheelZoom = 1
  }
  reset() {
    this.stop()
    const c = this.editor.getCamera()
    this.editor.setCamera(moveCamera(c, this.getAnchor(), 1), { animation: { duration: 180 } })
  }
  fit() {
    this.stop()
    const bounds = this.editor.getCurrentPageBounds()
    if (bounds)
      this.editor.zoomToBounds(bounds, { targetZoom: 1, inset: 100, animation: { duration: 220 } })
    else this.reset()
  }
  private start() {
    if (!this.raf) {
      this.last = performance.now()
      this.editor.stopCameraAnimation()
      this.raf = requestAnimationFrame(this.tick)
    }
  }
  private tick = (now: number) => {
    this.raf = 0
    const dt = Math.max(0.001, Math.min(0.05, (now - this.last) / 1000))
    this.last = now
    const values = [...this.held]
    const target =
      Number(values.some((k) => k.startsWith('1:'))) -
      Number(values.some((k) => k.startsWith('-1:')))
    this.velocity +=
      (target - this.velocity) * (this.easeMs ? 1 - Math.exp((-dt * 1000) / this.easeMs) : 1)
    if (!target && Math.abs(this.velocity) < 0.002) this.velocity = 0
    const c = this.editor.getCamera()
    const z = c.z * Math.exp(Math.log(this.speed) * this.velocity * dt) * this.wheelZoom
    if (z !== c.z || this.panX || this.panY)
      this.editor.setCamera(moveCamera(c, this.getAnchor(), z, this.panX, this.panY), {
        immediate: true,
      })
    this.panX = 0
    this.panY = 0
    this.wheelZoom = 1
    if (this.held.size || this.velocity) this.raf = requestAnimationFrame(this.tick)
  }
  stop() {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.held.clear()
    this.velocity = 0
    this.panX = 0
    this.panY = 0
    this.wheelZoom = 1
  }
}
