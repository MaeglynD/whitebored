import { DurableObject } from 'cloudflare:workers'
import type { Env } from './index'
import { mediaDay, mediaLimits } from './media-policy'
import {
  boundedBody,
  discardBody,
  HttpError,
  json,
  MAX_ASSET_BYTES,
  mediaTypes,
  uuid,
} from './security'

const paused =
  'Shared media is paused to stay within the free allowance. Your local boards are unaffected.'

/** The ONLY code allowed to access R2. One persistent object serializes budget reservations
 * across every room, before an R2 request is made. No public route reaches this object. */
export class MediaBudget extends DurableObject<Env> {
  private limits
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.limits = mediaLimits(env)
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS media_budget_state (
        id INTEGER PRIMARY KEY CHECK(id = 1), halted TEXT NOT NULL, audited_at INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO media_budget_state VALUES (1, '', 0);
      CREATE TABLE IF NOT EXISTS media_budget_objects (
        key TEXT PRIMARY KEY, bytes INTEGER NOT NULL, ready INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS media_budget_days (
        day INTEGER PRIMARY KEY, writes INTEGER NOT NULL DEFAULT 0, reads INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS media_budget_revoked (room TEXT PRIMARY KEY);
    `)
  }

  private state() {
    return this.ctx.storage.sql
      .exec<{ halted: string; audited_at: number }>(
        'SELECT halted, audited_at FROM media_budget_state WHERE id = 1',
      )
      .one()
  }
  private checkEnabled() {
    if (this.env.SHARING_ENABLED !== 'true' || this.state().halted) throw new HttpError(503, paused)
  }
  private revoked(room: string) {
    return (
      [...this.ctx.storage.sql.exec('SELECT room FROM media_budget_revoked WHERE room = ?', room)]
        .length > 0
    )
  }
  private object(key: string) {
    return [
      ...this.ctx.storage.sql.exec<{ key: string; bytes: number; ready: number }>(
        'SELECT key, bytes, ready FROM media_budget_objects WHERE key = ?',
        key,
      ),
    ][0]
  }
  private totals() {
    return this.ctx.storage.sql
      .exec<{ bytes: number; objects: number }>(
        'SELECT COALESCE(SUM(bytes), 0) AS bytes, COUNT(*) AS objects FROM media_budget_objects',
      )
      .one()
  }
  private reserve(kind: 'reads' | 'writes') {
    const day = mediaDay()
    const first = day - this.limits.windowDays + 1
    const used = this.ctx.storage.sql
      .exec<{ total: number }>(
        `SELECT COALESCE(SUM(${kind}), 0) AS total FROM media_budget_days WHERE day >= ?`,
        first,
      )
      .one().total
    if (used >= this.limits[kind]) throw new HttpError(429, paused)
    this.ctx.storage.sql.exec(
      `INSERT INTO media_budget_days (day, ${kind}) VALUES (?, 1)
       ON CONFLICT(day) DO UPDATE SET ${kind} = ${kind} + 1`,
      day,
    )
    // Reservations are never refunded: failed requests may still have been counted by R2.
  }
  private async ready() {
    this.checkEnabled()
    if (this.state().audited_at === 0) await this.audit()
    this.checkEnabled()
    if (Date.now() - this.state().audited_at > this.limits.auditMaxAge)
      throw new HttpError(503, paused)
  }

  /** Periodic backstop, not the primary limiter. Unknown data or accounting mismatches latch
   * the switch off across restarts/deployments. Audit failures eventually fail closed. */
  async audit() {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.checkEnabled()
      let cursor: string | undefined
      let bytes = 0,
        objects = 0
      do {
        this.reserve('writes') // ListObjects is a Class A operation, including this audit.
        await this.ctx.storage.sync()
        const page = await this.env.MEDIA.list({ cursor, limit: 1000 })
        for (const item of page.objects) {
          bytes += item.size
          objects++
          const known = this.object(item.key)
          if (
            !known ||
            known.bytes !== item.size ||
            bytes > this.limits.bytes ||
            objects > this.limits.objects
          ) {
            this.ctx.storage.sql.exec(
              "UPDATE media_budget_state SET halted = 'storage-audit' WHERE id = 1",
            )
            await this.ctx.storage.sync()
            throw new HttpError(503, paused)
          }
        }
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor)
      this.ctx.storage.sql.exec(
        'UPDATE media_budget_state SET audited_at = ? WHERE id = 1',
        Date.now(),
      )
      this.ctx.storage.sql.exec(
        'DELETE FROM media_budget_days WHERE day < ?',
        mediaDay() - this.limits.windowDays + 1,
      )
    })
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      const parts = url.pathname.split('/').filter(Boolean)
      if (
        parts[0] === 'room' &&
        uuid.test(parts[1] || '') &&
        parts.length === 2 &&
        request.method === 'DELETE'
      ) {
        // Revocation/deletion remains available when a budget or the kill switch stops media.
        const room = parts[1]
        this.ctx.storage.sql.exec('INSERT OR IGNORE INTO media_budget_revoked VALUES (?)', room)
        const objects = [
          ...this.ctx.storage.sql.exec<{ key: string }>(
            'SELECT key FROM media_budget_objects WHERE key >= ? AND key < ?',
            `${room}/`,
            `${room}/~`,
          ),
        ]
        for (let i = 0; i < objects.length; i += 100) {
          const batch = objects.slice(i, i + 100).map((o) => o.key)
          await this.env.MEDIA.delete(batch) // DeleteObject is free; no list needed.
          this.ctx.storage.transactionSync(() => {
            for (const key of batch)
              this.ctx.storage.sql.exec(
                'DELETE FROM media_budget_objects WHERE key = ? AND ready = 1',
                key,
              )
          })
        }
        // Pending reservations are retained. An in-flight upload checks the tombstone on completion.
        return json({ ok: true })
      }
      if (parts.length !== 2 || !parts.every((part) => uuid.test(part)))
        throw new HttpError(404, 'Media not found.')
      const [room] = parts
      const key = parts.join('/')
      await this.ready()
      if (this.revoked(room)) throw new HttpError(404, 'Media not found.')
      if (request.method === 'PUT') {
        const type = request.headers.get('Content-Type') || ''
        if (!mediaTypes.has(type)) throw new HttpError(415, 'Unsupported media type.')
        const bytes = await boundedBody(request, MAX_ASSET_BYTES)
        if (!bytes.length) throw new HttpError(400, 'This media file is empty.')
        this.checkEnabled()
        if (this.revoked(room)) throw new HttpError(404, 'Media not found.')
        this.ctx.storage.transactionSync(() => {
          if (this.object(key)) throw new HttpError(409, 'This media file already exists.')
          const total = this.totals()
          if (
            total.bytes + bytes.length > this.limits.bytes ||
            total.objects >= this.limits.objects
          )
            throw new HttpError(413, paused)
          this.reserve('writes')
          this.ctx.storage.sql.exec(
            'INSERT INTO media_budget_objects (key, bytes) VALUES (?, ?)',
            key,
            bytes.length,
          )
        })
        // Flush the reservation before network I/O. A failed/ambiguous put
        // retains its byte reservation; freeing it blindly could undercount stored data.
        await this.ctx.storage.sync()
        await this.env.MEDIA.put(key, bytes, {
          httpMetadata: { contentType: type },
          storageClass: 'Standard',
        })
        if (this.revoked(room)) {
          await this.env.MEDIA.delete(key)
          this.ctx.storage.sql.exec('DELETE FROM media_budget_objects WHERE key = ?', key)
          throw new HttpError(410, 'Sharing was stopped.')
        }
        this.ctx.storage.sql.exec('UPDATE media_budget_objects SET ready = 1 WHERE key = ?', key)
        return json({ ok: true }, 201)
      }
      if (request.method === 'GET') {
        if (!this.object(key)?.ready) throw new HttpError(404, 'Media not found.')
        this.reserve('reads')
        await this.ctx.storage.sync()
        const object = await this.env.MEDIA.get(key)
        if (!object || this.revoked(room)) throw new HttpError(404, 'Media not found.')
        return new Response(object.body, {
          headers: {
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
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
      return json({ error: paused }, 503)
    }
  }
}
