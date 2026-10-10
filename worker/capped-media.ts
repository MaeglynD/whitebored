import { DurableObject } from 'cloudflare:workers'
import type { Env } from './index'
import {
  boundedBody,
  discardBody,
  HttpError,
  json,
  MAX_ASSET_BYTES,
  mediaTypes,
  roomId,
  uuid,
} from './security'

// This is capacity management, not a billing kill switch. The provider's Workers Free
// quotas are the billing boundary. No object-storage API or paid service is used here.
export const SHARED_MEDIA_CAPACITY = 512 * 1024 * 1024
const CHUNK = 512 * 1024 // comfortably below SQLite's 2 MB row limit
export class CappedMedia extends DurableObject<Env> {
  private uploadsInFlight = 0
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS files (key TEXT PRIMARY KEY, bytes INTEGER NOT NULL, type TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks (key TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(key, part));
      CREATE TABLE IF NOT EXISTS capacity (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL, files INTEGER NOT NULL);
      INSERT OR IGNORE INTO capacity VALUES (1, 0, 0);
      CREATE TABLE IF NOT EXISTS revoked (room TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS uploads (day INTEGER NOT NULL, identity TEXT NOT NULL, bytes INTEGER NOT NULL, files INTEGER NOT NULL, PRIMARY KEY(day, identity));
    `)
  }
  status() {
    const used = this.ctx.storage.sql
      .exec<{ bytes: number; files: number }>('SELECT bytes, files FROM capacity WHERE id = 1')
      .one()
    return { ...used, maxBytes: SHARED_MEDIA_CAPACITY, maxFiles: 5000, storage: 'sqlite' }
  }
  async fetch(request: Request): Promise<Response> {
    let uploading = false
    try {
      const parts = new URL(request.url).pathname.split('/').filter(Boolean)
      const sql = this.ctx.storage.sql
      if (
        parts[0] === 'room' &&
        roomId.test(parts[1] || '') &&
        parts.length === 2 &&
        request.method === 'DELETE'
      ) {
        this.ctx.storage.transactionSync(() => {
          sql.exec('INSERT OR IGNORE INTO revoked VALUES (?)', parts[1])
          const lo = `${parts[1]}/`,
            hi = `${parts[1]}/~`
          const used = sql
            .exec<{ bytes: number; files: number }>(
              'SELECT COALESCE(SUM(bytes), 0) AS bytes, count(*) AS files FROM files WHERE key >= ? AND key < ?',
              lo,
              hi,
            )
            .one()
          sql.exec('DELETE FROM chunks WHERE key >= ? AND key < ?', lo, hi)
          sql.exec('DELETE FROM files WHERE key >= ? AND key < ?', lo, hi)
          sql.exec(
            'UPDATE capacity SET bytes = bytes - ?, files = files - ? WHERE id = 1',
            used.bytes,
            used.files,
          )
        })
        return json({ ok: true })
      }
      if (parts.length !== 2 || !roomId.test(parts[0]) || !uuid.test(parts[1]))
        throw new HttpError(404, 'Media not found.')
      if (this.env.SHARING_ENABLED !== 'true') throw new HttpError(503, 'Shared media is paused.')
      const revoked = () =>
        [...sql.exec('SELECT room FROM revoked WHERE room = ?', parts[0])].length > 0
      if (revoked()) throw new HttpError(404, 'Media not found.')
      const key = parts.join('/')
      if (request.method === 'PUT') {
        if (this.uploadsInFlight >= 2)
          throw new HttpError(429, 'Shared media is busy. Wait a moment and try uploading again.')
        this.uploadsInFlight++
        uploading = true
        const type = request.headers.get('Content-Type') || ''
        if (!mediaTypes.has(type)) throw new HttpError(415, 'Unsupported media type.')
        const bytes = await boundedBody(request, MAX_ASSET_BYTES)
        if (!bytes.length) throw new HttpError(400, 'This media file is empty.')
        this.ctx.storage.transactionSync(() => {
          if (revoked()) throw new HttpError(404, 'Media not found.')
          if ([...sql.exec('SELECT key FROM files WHERE key = ?', key)].length)
            throw new HttpError(409, 'This media file already exists.')
          const used = this.status()
          const configured = Number(this.env.SQL_MEDIA_MAX_BYTES ?? SHARED_MEDIA_CAPACITY)
          if (
            !Number.isSafeInteger(configured) ||
            configured < 0 ||
            configured > SHARED_MEDIA_CAPACITY
          )
            throw new HttpError(503, 'Invalid storage capacity.')
          if (used.bytes + bytes.length > configured || used.files >= 5000)
            throw new HttpError(
              413,
              'Shared media storage is full. Local boards still work; try again after a shared session ends.',
            )
          const identity = request.headers.get('X-Upload-Identity')
          // Set by SharedRoom from Cloudflare's IP header, never accepted from a browser.
          // Migration RPCs have no identity and do not consume a person's upload allowance.
          if (identity) {
            const day = Math.floor(Date.now() / 86400000)
            sql.exec('DELETE FROM uploads WHERE day < ?', day)
            const today = [
              ...sql.exec<{ bytes: number; files: number }>(
                'SELECT bytes, files FROM uploads WHERE day = ? AND identity = ?',
                day,
                identity,
              ),
            ][0]
            if (
              (today?.bytes || 0) + bytes.length > 100 * 1024 * 1024 ||
              (today?.files || 0) >= 100
            )
              throw new HttpError(
                429,
                'This network has reached its daily shared-media allowance (100 MB or 100 files). Try again tomorrow, or continue locally.',
              )
            sql.exec(
              'INSERT INTO uploads VALUES (?, ?, ?, 1) ON CONFLICT(day, identity) DO UPDATE SET bytes = bytes + excluded.bytes, files = files + 1',
              day,
              identity,
              bytes.length,
            )
          }
          sql.exec('INSERT INTO files VALUES (?, ?, ?)', key, bytes.length, type)
          for (let offset = 0, part = 0; offset < bytes.length; offset += CHUNK, part++)
            sql.exec(
              'INSERT INTO chunks VALUES (?, ?, ?)',
              key,
              part,
              bytes.slice(offset, offset + CHUNK),
            )
          sql.exec(
            'UPDATE capacity SET bytes = bytes + ?, files = files + 1 WHERE id = 1',
            bytes.length,
          )
        })
        return json({ ok: true }, 201)
      }
      if (request.method === 'GET') {
        const file = [
          ...sql.exec<{ type: string; bytes: number }>(
            'SELECT type, bytes FROM files WHERE key = ?',
            key,
          ),
        ][0]
        if (!file) throw new HttpError(404, 'Media not found.')
        const pieces = [
          ...sql.exec<{ data: ArrayBuffer }>(
            'SELECT data FROM chunks WHERE key = ? ORDER BY part',
            key,
          ),
        ].map((r) => r.data)
        const blob = new Blob(pieces, { type: file.type })
        if (blob.size !== file.bytes)
          throw new HttpError(503, 'This media file could not be read. Please retry.')
        return new Response(blob, {
          headers: {
            'Content-Type': file.type,
            'Content-Length': String(blob.size),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
          },
        })
      }
      throw new HttpError(405, 'Method not allowed.')
    } catch (error) {
      await discardBody(request)
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      return json(
        {
          error:
            'Shared storage is temporarily unavailable. Its free limit may have been reached; keep a local copy and try again later.',
        },
        503,
      )
    } finally {
      if (uploading) this.uploadsInFlight--
    }
  }
}
