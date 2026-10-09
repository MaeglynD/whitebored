import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from 'tldraw'
import { CameraController, moveCamera } from '../src/camera'

afterEach(() => vi.unstubAllGlobals())
function rig(fps: number) {
  let now = 0
  let id = 0
  const frames = new Map<number, FrameRequestCallback>()
  let camera = { x: 0, y: 0, z: 1 }
  vi.stubGlobal('performance', { now: () => now })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  const editor = {
    getCamera: () => camera,
    getViewportScreenBounds: () => ({ x: 276, y: 0, w: 1000, h: 800, maxX: 1276, maxY: 800 }),
    stopCameraAnimation: () => {},
    setCamera: (next: typeof camera) => {
      camera = next
    },
  } as unknown as Editor
  const controller = new CameraController(editor)
  const advance = (ms: number) => {
    for (let n = 0; n < Math.round((ms * fps) / 1000); n++) {
      now += 1000 / fps
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((frame) => frame(now))
    }
  }
  return { controller, advance, camera: () => camera, frames }
}
describe('original smooth camera behaviour', () => {
  it('keeps the page point under the pointer fixed at every zoom and translates pan in screen pixels', () => {
    const c = { x: -200, y: 80, z: 2 }
    const pointer = { x: 400, y: 300 }
    const point = { x: pointer.x / c.z - c.x, y: pointer.y / c.z - c.y }
    for (const z of [0.1, 0.75, 4, 30]) {
      const next = moveCamera(c, pointer, z, 80, -40)
      expect((point.x + next.x) * next.z).toBeCloseTo(pointer.x + 80)
      expect((point.y + next.y) * next.z).toBeCloseTo(pointer.y - 40)
    }
  })
  it('honours zoom speed independent of frame rate and eases to a full stop after release', () => {
    const results = []
    for (const fps of [30, 60, 120]) {
      const r = rig(fps)
      r.controller.speed = 5
      r.controller.easeMs = 60
      r.controller.hold('KeyE', 1)
      r.advance(1000)
      expect(r.camera().z).toBeGreaterThan(4)
      expect(r.camera().z).toBeLessThan(5)
      r.controller.release('KeyE')
      r.advance(1000)
      expect(r.camera().z).toBeCloseTo(5, 1)
      expect(r.frames.size).toBe(0)
      results.push(r.camera().z)
      r.controller.stop()
    }
    expect(Math.max(...results) - Math.min(...results)).toBeLessThan(0.02)
    const r = rig(60)
    r.controller.speed = 2
    r.controller.easeMs = 0
    r.controller.hold('KeyE', 1)
    r.advance(1000)
    expect(r.camera().z).toBeCloseTo(2, 5)
    r.controller.stop()
  })
  it('combines wheel/pan deltas and cancels held movement when stopped', () => {
    const r = rig(60)
    r.controller.point(676, 300)
    r.controller.pan(40, 20)
    r.controller.pan(20, 10)
    r.controller.zoom(2)
    r.controller.flush()
    expect(r.camera()).toEqual({ x: -170, y: -135, z: 2 })
    r.controller.hold('KeyQ', -1)
    r.advance(300)
    r.controller.stop()
    const stopped = { ...r.camera() }
    r.advance(1000)
    expect(r.camera()).toEqual(stopped)
    expect(r.frames.size).toBe(0)
  })
})
