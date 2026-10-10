import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SharedSocket } from '../src/SharedSocket'

class Socket {
  static OPEN = 1
  static instances: Socket[] = []
  readyState = 0
  onopen?: () => void
  onclose?: (event: { code: number; reason: string }) => void
  onmessage?: (event: { data: string }) => void
  sent: string[] = []
  constructor() {
    Socket.instances.push(this)
  }
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  send(data: string) {
    this.sent.push(data)
  }
  close(code = 1000, reason = '') {
    this.readyState = 3
    this.onclose?.({ code, reason })
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  Socket.instances = []
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('WebSocket', Socket)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('shared transport navigation protection', () => {
  it('keeps later edits dirty when an earlier edit is acknowledged', async () => {
    const client = new SharedSocket('ws://example.test')
    await Promise.resolve()
    const ws = Socket.instances[0]
    ws.open()
    client.markDirty()
    client.sendMessage({ type: 'push', clientClock: 0, diff: { shape: [] } })
    client.markDirty()
    client.sendMessage({ type: 'push', clientClock: 1, diff: { shape: [] } })
    ws.receive({ type: 'push_result', clientClock: 0, action: 'commit' })
    expect(client.dirty).toBe(true)
    ws.receive({ type: 'data', data: [{ type: 'push_result', clientClock: 1, action: 'commit' }] })
    expect(client.dirty).toBe(false)
    client.close()
  })
  it('keeps disconnected changes dirty until the reconnect push is acknowledged', async () => {
    const client = new SharedSocket('ws://example.test')
    await Promise.resolve()
    Socket.instances[0].open()
    client.markDirty()
    client.sendMessage({ type: 'push', clientClock: 0, diff: {} })
    client.restart()
    expect(client.dirty).toBe(true)
    await Promise.resolve()
    const ws = Socket.instances[1]
    ws.open()
    client.sendMessage({ type: 'push', clientClock: 1, diff: {} })
    ws.receive({ type: 'push_result', clientClock: 1, action: 'commit' })
    expect(client.dirty).toBe(false)
    client.close()
  })
  it('does not retry after owner revocation and preserves pending edits for recovery', async () => {
    const client = new SharedSocket('ws://example.test')
    await Promise.resolve()
    const ws = Socket.instances[0]
    ws.open()
    client.markDirty()
    ws.close(4099, 'FORBIDDEN')
    expect(client.connectionStatus).toBe('error')
    expect(client.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(30000)
    expect(Socket.instances).toHaveLength(1)
    client.close()
  })
  it('recognizes a revoked link while reconnecting, before opening a new socket', async () => {
    const client = new SharedSocket('ws://example.test', async () => {
      throw Object.assign(new Error('Revoked'), { status: 404 })
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(client.connectionStatus).toBe('error')
    expect(Socket.instances).toHaveLength(0)
    client.close()
  })
})
