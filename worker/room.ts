import { DurableObject } from 'cloudflare:workers'
import {
  DurableObjectSqliteSyncWrapper,
  SQLiteSyncStorage,
  TLSocketRoom,
  type SessionStateSnapshot,
} from '@tldraw/sync-core'
import { createTLSchema, type TLRecord } from '@tldraw/tlschema'
import type { Env } from './index'
import {
  boundedBody,
  digest,
  discardBody,
  HttpError,
  json,
  MAX_ASSET_BYTES,
  MAX_DOCUMENT_BYTES,
  MAX_ROOM_BYTES,
  mediaTypes,
  readJson,
  tokenPattern,
  uuid,
  ROOM_LIFETIME,
  MAX_ROOM_ASSETS,
} from './security'

interface Metadata {
  id: string
  title: string
  legacy: boolean
  editHash: string
  ownerHash: string
  active: boolean
  revoked: boolean
  bytes: number
  expiresAt?: number
  frozen?: boolean
}
interface Attachment {
  sessionId: string
  snapshot: SessionStateSnapshot | null
  messages: number
  window: number
  lastSeen: number
}
const schema = createTLSchema()

export class SharedRoom extends DurableObject<Env> {
  private room?: TLSocketRoom<TLRecord>
  private meta?: Metadata
  private sockets = new Map<string, WebSocket>()
  private sizes = new Map<string, number>()
  private documentBytes = 0
  private pendingBytes = 0
  private pendingCount = 0
  private rejectedWrite = false
  private uploadsInFlight = 0

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.meta = await ctx.storage.get<Metadata>('metadata')
      // Existing rooms keep their contents and receive a full lifetime from this upgrade.
      if (this.meta && !this.meta.revoked && !this.meta.expiresAt) {
        this.meta.expiresAt = Date.now() + ROOM_LIFETIME
        await this.saveMeta()
        await ctx.storage.setAlarm(this.meta.expiresAt)
      }
    })
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'),
    )
  }

  private getRoom() {
    if (this.room) return this.room
    const sql = new DurableObjectSqliteSyncWrapper(this.ctx.storage)
    const storage = new SQLiteSyncStorage<TLRecord>({ sql })
    this.room = new TLSocketRoom<TLRecord>({
      schema,
      storage,
      clientTimeout: Infinity,
      authorizeRecord: {
        asset: ({ next, prev }) =>
          (!next || this.validAsset(next)) && this.withinBudget(next, prev) ? next || prev : null,
        shape: ({ next, prev }) => (this.withinBudget(next, prev) ? next || prev : null),
        binding: ({ next, prev }) => (this.withinBudget(next, prev) ? next || prev : null),
        page: ({ next, prev }) => (this.withinBudget(next, prev) ? next || prev : null),
        document: ({ next, prev }) => (this.withinBudget(next, prev) ? next || prev : null),
        user: ({ next, prev }) => (this.withinBudget(next, prev) ? next || prev : null),
      },
      onCommittedChanges: ({ diff }) => {
        for (const record of Object.values(diff.puts))
          this.trackRecord(Array.isArray(record) ? record[1] : record)
        for (const id of diff.deletes) {
          this.documentBytes -= this.sizes.get(id) || 0
          this.sizes.delete(id)
        }
      },
      onSessionSnapshot: (id, snapshot) => {
        const ws = this.sockets.get(id)
        if (ws) {
          const data = ws.deserializeAttachment() as Attachment
          ws.serializeAttachment({ ...data, snapshot })
        }
      },
    })
    for (const { state } of storage.getSnapshot().documents) this.trackRecord(state as TLRecord)
    for (const ws of this.ctx.getWebSockets()) {
      const data = ws.deserializeAttachment() as Attachment
      this.sockets.set(data.sessionId, ws)
      if (data.snapshot)
        this.room.handleSocketResume({
          sessionId: data.sessionId,
          socket: ws,
          snapshot: data.snapshot,
        })
      else this.room.handleSocketConnect({ sessionId: data.sessionId, socket: ws })
    }
    return this.room
  }

  private trackRecord(record: TLRecord) {
    const size = new TextEncoder().encode(JSON.stringify(record)).byteLength
    this.documentBytes += size - (this.sizes.get(record.id) || 0)
    this.sizes.set(record.id, size)
  }
  private withinBudget(next: TLRecord | null, prev: TLRecord | null) {
    const size = next ? new TextEncoder().encode(JSON.stringify(next)).byteLength : 0
    const delta = size - (prev ? this.sizes.get(prev.id) || 0 : 0)
    const count = next && !prev ? 1 : !next && prev ? -1 : 0
    if (
      size > 512_000 ||
      this.documentBytes + this.pendingBytes + delta > MAX_DOCUMENT_BYTES ||
      this.sizes.size + this.pendingCount + count > 20000
    ) {
      this.rejectedWrite = true
      return false
    }
    this.pendingBytes += delta
    this.pendingCount += count
    return true
  }

  private validAsset(record: TLRecord) {
    if (record.typeName !== 'asset') return true
    if (record.type === 'bookmark') return false
    const prefix = `asset:shared:${this.meta!.id}:`
    return (
      typeof record.props.src === 'string' &&
      record.props.src.startsWith(prefix) &&
      uuid.test(record.props.src.slice(prefix.length))
    )
  }

  private async authorized(request: Request, owner = false) {
    const url = new URL(request.url)
    const token =
      request.headers.get('Authorization')?.replace(/^Bearer /, '') ||
      (url.pathname === '/connect' ? url.searchParams.get('key') : '') ||
      ''
    if (!this.meta || this.meta.revoked || !tokenPattern.test(token))
      throw new HttpError(404, 'This shared link is invalid or has been revoked.')
    const hash = await digest(token)
    // Revocation may happen while hashing the capability.
    if (
      this.meta.revoked ||
      Date.now() >= (this.meta.expiresAt || Infinity) ||
      hash !== (owner ? this.meta.ownerHash : this.meta.editHash)
    )
      throw new HttpError(404, 'This shared link is invalid or has been revoked.')
  }
  private async saveMeta() {
    await this.ctx.storage.put('metadata', this.meta!)
  }

  async fetch(request: Request): Promise<Response> {
    let uploading = false
    try {
      const url = new URL(request.url)
      if (url.pathname === '/internal/create' && request.method === 'POST') {
        if (this.meta) throw new HttpError(409, 'Board already exists.')
        const input = await request.json<Metadata>()
        this.meta = {
          ...input,
          active: false,
          revoked: false,
          bytes: 0,
          expiresAt: Date.now() + ROOM_LIFETIME,
        }
        await this.saveMeta()
        await this.ctx.storage.setAlarm(Date.now() + 3600000)
        return json({ ok: true })
      }
      const owner =
        request.method === 'DELETE' || url.pathname === '/initialize' || url.pathname === '/freeze'
      await this.authorized(request, owner)
      const meta = this.meta!
      if (url.pathname === '/freeze' && request.method === 'POST') {
        if (!meta.active) throw new HttpError(409, 'This board is not ready.')
        meta.frozen = true
        await this.saveMeta()
        const snapshot = this.getRoom().getCurrentSnapshot()
        for (const ws of this.ctx.getWebSockets()) ws.close(4099, 'FORBIDDEN')
        return json({
          store: Object.fromEntries(snapshot.documents.map(({ state }) => [state.id, state])),
          schema: snapshot.schema,
        })
      }
      if (request.method === 'DELETE' && url.pathname === '/') {
        // Persist revocation before any awaited cleanup, and close every existing collaborator.
        meta.revoked = true
        await this.saveMeta()
        for (const ws of this.ctx.getWebSockets()) ws.close(4099, 'FORBIDDEN')
        this.room?.close()
        this.room = undefined
        await this.ctx.storage.setAlarm(Date.now() + 1000)
        return json({ ok: true })
      }
      if (url.pathname === '/initialize' && request.method === 'PUT') {
        if (meta.active) throw new HttpError(409, 'This board has already been shared.')
        const snapshot = await readJson(request)
        if (meta.active || meta.revoked)
          throw new HttpError(409, 'This board is no longer awaiting a shared copy.')
        const records: TLRecord[] = Object.values(snapshot?.store || {})
        if (!records.length || records.length > 20_000 || records.some((r) => !this.validAsset(r)))
          throw new HttpError(400, 'This board contains unsupported or unuploaded media.')
        try {
          for (const record of records) {
            if (
              !['document', 'page', 'shape', 'asset', 'binding', 'user'].includes(record.typeName)
            )
              throw new Error('Not a document record')
            schema.types[record.typeName].validate(record)
            if (new TextEncoder().encode(JSON.stringify(record)).byteLength > 512_000)
              throw new Error('Record too large')
          }
          this.getRoom().loadSnapshot(snapshot)
          this.sizes.clear()
          this.documentBytes = 0
          for (const record of records) this.trackRecord(record)
        } catch {
          throw new HttpError(
            400,
            'This board could not be loaded. Please update Whitebored and try again.',
          )
        }
        meta.active = true
        await this.saveMeta()
        await this.ctx.storage.setAlarm(meta.expiresAt!)
        return json({ ok: true })
      }
      if (url.pathname === '/' && request.method === 'GET') {
        if (!meta.active) throw new HttpError(409, 'This shared board is still being prepared.')
        if (meta.frozen) throw new HttpError(410, 'The owner has ended this shared session.')
        if (this.ctx.getWebSockets().length >= 20)
          throw new HttpError(
            429,
            'This board already has 20 connected people. Try again when someone leaves.',
          )
        return json({ title: meta.title, legacy: meta.legacy, expiresAt: meta.expiresAt })
      }
      const asset = url.pathname.match(/^\/assets\/([^/]+)$/)
      if (asset && uuid.test(asset[1])) {
        const objectKey = `${meta.id}/${asset[1]}`
        if (request.method === 'PUT') {
          if (meta.frozen) throw new HttpError(410, 'The owner has ended this shared session.')
          if (this.uploadsInFlight >= 2)
            throw new HttpError(
              429,
              'Two files are already uploading. Wait a moment and try again.',
            )
          this.uploadsInFlight++
          uploading = true
          const type = request.headers.get('Content-Type')?.split(';')[0] || ''
          if (!mediaTypes.has(type))
            throw new HttpError(
              415,
              'Use a PNG, JPEG, WebP, GIF, AVIF, MP4, WebM or MOV file on a shared board.',
            )
          const bytes = await boundedBody(request, MAX_ASSET_BYTES)
          // Room quota is additional to the deployment-wide media budget.
          const sql = this.ctx.storage.sql
          sql.exec('CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, bytes INTEGER NOT NULL)')
          if ([...sql.exec('SELECT id FROM media WHERE id = ?', asset[1])].length)
            throw new HttpError(409, 'This media file already exists.')
          if (sql.exec<{ n: number }>('SELECT count(*) AS n FROM media').one().n >= MAX_ROOM_ASSETS)
            throw new HttpError(413, 'This shared board has reached its 100-file media limit.')
          if (meta.revoked || meta.frozen || meta.bytes + bytes.length > MAX_ROOM_BYTES)
            throw new HttpError(413, 'This shared board has reached its 100 MB media limit.')
          sql.exec('INSERT INTO media (id, bytes) VALUES (?, ?)', asset[1], bytes.length)
          meta.bytes += bytes.length
          await this.saveMeta()
          try {
            const response = await this.env.CAPPED_MEDIA.getByName('media-sql-v1').fetch(
              `https://media/${objectKey}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': type,
                  'X-Upload-Identity': await digest(
                    request.headers.get('CF-Connecting-IP') || 'local',
                  ),
                },
                body: bytes,
              },
            )
            if (!response.ok) {
              const detail = await response.json<{ error: string }>()
              throw new HttpError(response.status, detail.error)
            }
            if (meta.revoked) {
              await this.env.CAPPED_MEDIA.getByName('media-sql-v1').fetch(
                `https://media/room/${meta.id}`,
                { method: 'DELETE' },
              )
              throw new HttpError(410, 'Sharing was stopped.')
            }
          } catch (error) {
            sql.exec('DELETE FROM media WHERE id = ?', asset[1])
            meta.bytes -= bytes.length
            await this.saveMeta()
            throw error
          }
          return json({ src: `asset:shared:${meta.id}:${asset[1]}` }, 201)
        }
        if (request.method === 'GET') {
          const response = await this.env.CAPPED_MEDIA.getByName('media-sql-v1').fetch(
            `https://media/${objectKey}`,
          )
          if (meta.revoked) throw new HttpError(404, 'Media not found.')
          return response
        }
      }
      if (url.pathname === '/connect' && request.headers.get('Upgrade') === 'websocket') {
        if (meta.frozen) throw new HttpError(410, 'The owner has ended this shared session.')
        if (!meta.active) throw new HttpError(409, 'This shared board is not ready.')
        const sessionId = url.searchParams.get('sessionId') || ''
        if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sessionId)) throw new HttpError(400, 'Invalid session.')
        if (this.ctx.getWebSockets().length >= 20)
          throw new HttpError(429, 'This board already has 20 connected people.')
        const room = this.getRoom()
        // Do not allow one client to replace another client's live session.
        if (this.sockets.has(sessionId)) throw new HttpError(409, 'Session already connected.')
        const pair = new WebSocketPair()
        const client = pair[0],
          server = pair[1]
        server.serializeAttachment({
          sessionId,
          snapshot: null,
          messages: 0,
          window: Date.now(),
          lastSeen: Date.now(),
        } satisfies Attachment)
        this.ctx.acceptWebSocket(server)
        this.sockets.set(sessionId, server)
        room.handleSocketConnect({ sessionId, socket: server })
        await this.ctx.storage.setAlarm(Math.min(meta.expiresAt!, Date.now() + 30000))
        return new Response(null, { status: 101, webSocket: client })
      }
      throw new HttpError(404, 'Not found.')
    } catch (error) {
      await discardBody(request)
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      return json({ error: 'The shared board is temporarily unavailable. Please retry.' }, 503)
    } finally {
      if (uploading) this.uploadsInFlight--
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (this.env.SHARING_ENABLED !== 'true') {
      ws.close(4099, 'RATE_LIMITED')
      return
    }
    if (
      this.meta?.revoked ||
      this.meta?.frozen ||
      Date.now() >= (this.meta?.expiresAt || Infinity)
    ) {
      ws.close(4099, 'FORBIDDEN')
      return
    }
    const data = ws.deserializeAttachment() as Attachment
    data.lastSeen = Date.now()
    if (Date.now() - data.window > 1000) {
      data.window = Date.now()
      data.messages = 0
    }
    data.messages++
    if (
      data.messages > 120 ||
      (typeof message === 'string'
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength) >
        1024 * 1024
    ) {
      ws.close(4099, 'RATE_LIMITED')
      return
    }
    ws.serializeAttachment(data)
    const room = this.getRoom()
    this.pendingBytes = 0
    this.pendingCount = 0
    this.rejectedWrite = false
    room.handleSocketMessage(data.sessionId, message)
    if (this.rejectedWrite)
      room.sendCustomMessage(data.sessionId, {
        type: 'limit',
        message:
          'This edit exceeds the shared board’s capacity (8 MB, 20,000 records, or 500 KB per item). Save a local copy to continue without shared limits.',
      })
  }
  webSocketClose(ws: WebSocket) {
    ws.close(1000, 'Disconnected')
    if (this.meta?.revoked || this.meta?.frozen) return
    const { sessionId } = ws.deserializeAttachment() as Attachment
    this.getRoom().handleSocketClose(sessionId)
    this.getRoom().closeSession(sessionId)
    this.sockets.delete(sessionId)
  }
  webSocketError(ws: WebSocket) {
    this.webSocketClose(ws)
  }
  async cleanupExpired() {
    if (!this.meta) return true
    const deadline = this.meta.active
      ? this.meta.expiresAt!
      : this.meta.expiresAt! - ROOM_LIFETIME + 3600000
    if (!this.meta.revoked && Date.now() < deadline) return false
    await this.alarm()
    return true
  }
  async alarm() {
    if (!this.meta) return
    if (this.meta.active && !this.meta.revoked && Date.now() < (this.meta.expiresAt || Infinity)) {
      // Hibernating auto-pongs count as activity without waking the room for every heartbeat.
      for (const ws of this.ctx.getWebSockets()) {
        const data = ws.deserializeAttachment() as Attachment
        const seen = Math.max(
          data.lastSeen || data.window,
          this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0,
        )
        if (Date.now() - seen > 90000) {
          this.getRoom().handleSocketClose(data.sessionId)
          this.getRoom().closeSession(data.sessionId)
          this.sockets.delete(data.sessionId)
          ws.close(1001, 'Connection timed out')
        }
      }
      await this.ctx.storage.setAlarm(
        this.ctx.getWebSockets().length
          ? Math.min(this.meta.expiresAt!, Date.now() + 30000)
          : this.meta.expiresAt!,
      )
      return
    }
    this.meta.revoked = true
    await this.saveMeta()
    for (const ws of this.ctx.getWebSockets()) ws.close(4099, 'FORBIDDEN')
    // Tombstone the capability permanently; remove document/media data, including abandoned drafts.
    const cleanup = await this.env.CAPPED_MEDIA.getByName('media-sql-v1').fetch(
      `https://media/room/${this.meta.id}`,
      { method: 'DELETE' },
    )
    if (!cleanup.ok) throw new Error('Media cleanup will retry')
    this.room?.close()
    this.room = undefined
    const meta = this.meta
    await this.ctx.storage.deleteAll()
    await this.ctx.storage.put('metadata', meta)
    // Release admission only after cleanup succeeds. The hourly reaper retains a retry handle.
    await this.env.SHARE_LIMITS.getByName('creation').fetch('https://limits/', {
      method: 'DELETE',
      body: meta.id,
    })
  }
}
