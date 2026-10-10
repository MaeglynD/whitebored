import type { TLPersistentClientSocket } from '@tldraw/sync-core'
import { atom } from '@tldraw/state'

/** Transport only: tldraw owns merging, undo and reconnect reconciliation. Track acknowledgements
 * so navigation cannot discard a last edit that has not reached the server yet. */
export class SharedSocket implements TLPersistentClientSocket<any, any> {
  private state = atom<'online' | 'offline' | 'error'>('shared connection', 'offline')
  get connectionStatus() {
    return this.state.get()
  }
  private ws?: WebSocket
  private timer?: ReturnType<typeof setTimeout>
  private stopped = false
  private attempts = 0
  private generation = 0
  private revision = 0
  private confirmed = 0
  private pending = new Map<number, number>()
  private messages = new Set<(message: any) => void>()
  private statuses = new Set<(status: any) => void>()
  private listeners = new Set<() => void>()
  constructor(
    private uri: string,
    private checkAccess?: () => Promise<unknown>,
  ) {
    void this.connect()
    window.addEventListener('online', this.wake)
  }
  private wake = () => {
    if (this.connectionStatus === 'offline') this.restart()
  }
  get dirty() {
    return this.revision > this.confirmed || this.pending.size > 0
  }
  markDirty() {
    this.revision++
    this.emit()
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  private emit() {
    this.listeners.forEach((fn) => fn())
  }
  onReceiveMessage = (fn: (message: any) => void) => {
    this.messages.add(fn)
    return () => {
      this.messages.delete(fn)
    }
  }
  onStatusChange = (fn: (status: any) => void) => {
    this.statuses.add(fn)
    return () => {
      this.statuses.delete(fn)
    }
  }
  private status(status: 'online' | 'offline' | 'error', reason?: string) {
    this.state.set(status)
    this.statuses.forEach((fn) => fn({ status, reason }))
    this.emit()
  }
  private async connect() {
    if (this.stopped) return
    const generation = ++this.generation
    try {
      await this.checkAccess?.()
    } catch (error) {
      if (this.stopped || generation !== this.generation) return
      if ((error as { status?: number }).status === 404) {
        this.status('error', 'FORBIDDEN')
        return
      }
      this.status('offline')
      this.timer = setTimeout(
        () => void this.connect(),
        Math.min(10000, 400 * 2 ** this.attempts++),
      )
      return
    }
    if (this.stopped || generation !== this.generation) return
    const ws = new WebSocket(this.uri)
    this.ws = ws
    ws.onopen = () => {
      if (ws !== this.ws) return
      this.attempts = 0
      this.status('online')
    }
    ws.onmessage = (event) => {
      if (ws !== this.ws) return
      let message: any
      try {
        message = JSON.parse(event.data)
      } catch {
        this.restart()
        return
      }
      for (const item of message.type === 'data' ? message.data : [message]) {
        if (item.type === 'push_result' && this.pending.has(item.clientClock)) {
          this.confirmed = Math.max(this.confirmed, this.pending.get(item.clientClock)!)
          this.pending.delete(item.clientClock)
        }
      }
      this.messages.forEach((fn) => fn(message))
      this.emit()
    }
    ws.onclose = (event) => {
      if (ws !== this.ws || this.stopped) return
      this.pending.clear() // dirty revision remains until the reconciled reconnect push is acknowledged
      if (event.code === 4099) {
        this.status('error', event.reason || 'FORBIDDEN')
        return
      }
      this.status('offline')
      this.timer = setTimeout(
        () => void this.connect(),
        Math.min(10000, 400 * 2 ** this.attempts++) + Math.random() * 250,
      )
    }
    ws.onerror = () => {
      if (ws === this.ws) ws.close()
    }
  }
  sendMessage(message: any) {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    // Reconnects may discover an edit was already committed before its ack was lost.
    // tldraw flushes document changes before presence, so the next presence ack also
    // confirms a reconciled no-op without leaving a permanent unsaved warning.
    if (message.type === 'push' && (message.diff || this.dirty))
      this.pending.set(message.clientClock, this.revision)
    this.ws.send(JSON.stringify(message))
    this.emit()
  }
  restart() {
    if (this.stopped || this.connectionStatus === 'error') return
    clearTimeout(this.timer)
    const old = this.ws
    this.ws = undefined
    old?.close()
    this.pending.clear()
    this.status('offline')
    void this.connect()
  }
  close() {
    this.stopped = true
    clearTimeout(this.timer)
    window.removeEventListener('online', this.wake)
    this.ws?.close()
  }
  async flush() {
    // Store listeners/network sends are batched at animation-frame boundaries.
    await new Promise((resolve) => setTimeout(resolve, 150))
    const end = Date.now() + 5000
    while (this.dirty && this.connectionStatus === 'online' && Date.now() < end)
      await new Promise((resolve) => setTimeout(resolve, 50))
    if (this.dirty)
      throw new Error(
        'Changes have not reached the server yet. Keep this tab open to reconnect, or save a local copy.',
      )
  }
}
