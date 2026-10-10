import { DurableObject } from 'cloudflare:workers'
import { SharedRoom } from './room'
import { CappedMedia } from './capped-media'
import { HttpError, digest, json, key, readJson, roomId, ROOM_LIFETIME } from './security'
export { SharedRoom, CappedMedia }

export interface Env {
  ASSETS: Fetcher
  ROOMS: DurableObjectNamespace<SharedRoom>
  SHARE_LIMITS: DurableObjectNamespace<ShareLimits>
  CAPPED_MEDIA: DurableObjectNamespace<CappedMedia>
  SQL_MEDIA_MAX_BYTES?: string
  SHARING_ENABLED: string
}

// A small, persistent quota prevents anonymous creation from allocating unbounded rooms.
export class ShareLimits extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)',
    )
  }
  async cleanupExpired() {
    // Alarms have a finite retry budget. Revisit admitted rooms after a daily quota resets,
    // so a failed expiry alarm cannot strand media or document storage permanently.
    const sql = this.ctx.storage.sql
    const rooms = [...sql.exec<{ id: string }>('SELECT id FROM rooms LIMIT 100')]
    for (const { id } of rooms) {
      if (await this.env.ROOMS.getByName(id).cleanupExpired())
        sql.exec('DELETE FROM rooms WHERE id = ?', id)
    }
  }
  async fetch(request: Request) {
    const sql = this.ctx.storage.sql
    if (request.method === 'DELETE') {
      const id = await request.text()
      sql.exec('DELETE FROM rooms WHERE id = ?', id)
      return json({ ok: true })
    }
    const { identity, id } = await request.json<{ identity: string; id: string }>()
    return this.ctx.blockConcurrencyWhile(async () => {
      if (sql.exec<{ n: number }>('SELECT count(*) AS n FROM rooms').one().n >= 100)
        return json(
          { error: 'All 100 shared-board spaces are in use. Try again after a session ends.' },
          429,
        )
      const day = Math.floor(Date.now() / 86400000)
      const counts = await this.ctx.storage.get<{
        day: number
        total: number
        ips: Record<string, number>
      }>('quota')
      const quota = counts?.day === day ? counts : { day, total: 0, ips: {} }
      if (quota.total >= 100 || (quota.ips[identity] || 0) >= 10)
        return json(
          { error: 'Shared-board creation limit reached. Please try again tomorrow.' },
          429,
        )
      quota.total++
      quota.ips[identity] = (quota.ips[identity] || 0) + 1
      await this.ctx.storage.put('quota', quota)
      sql.exec('INSERT INTO rooms VALUES (?, ?)', id, Date.now() + ROOM_LIFETIME)
      return json({ ok: true })
    })
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env) {
    await env.SHARE_LIMITS.getByName('creation').cleanupExpired()
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handle(request, env)
    if (request.headers.get('Origin') === 'folio://app' && response.status !== 101) {
      const headers = new Headers(response.headers)
      headers.set('Access-Control-Allow-Origin', 'folio://app')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      headers.append('Vary', 'Origin')
      return new Response(response.body, { status: response.status, headers })
    }
    return response
  },
} satisfies ExportedHandler<Env>

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
  try {
    if (env.SHARING_ENABLED !== 'true')
      throw new HttpError(503, 'Sharing is temporarily paused. Your local boards are unaffected.')
    const origin = request.headers.get('Origin')
    if (origin && origin !== url.origin && origin !== 'folio://app')
      throw new HttpError(403, 'This request must come from Whitebored.')
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 })
    if (url.pathname === '/api/capacity' && request.method === 'GET')
      return json(await env.CAPPED_MEDIA.getByName('media-sql-v1').status())
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const input = await readJson(request, 2048)
      if (typeof input.title !== 'string' || input.title.length > 200)
        throw new HttpError(400, 'A board title is required (up to 200 characters).')
      const ip = await digest(request.headers.get('CF-Connecting-IP') || 'local')
      const id = key(16)
      const quota = await env.SHARE_LIMITS.getByName('creation').fetch('https://limits/', {
        method: 'POST',
        body: JSON.stringify({ identity: ip, id }),
      })
      if (!quota.ok) return quota
      const editKey = id,
        ownerKey = key()
      const room = env.ROOMS.getByName(id)
      const response = await room.fetch('https://room/internal/create', {
        method: 'POST',
        body: JSON.stringify({
          id,
          title: input.title.trim() || 'Untitled board',
          legacy: input.legacy === true,
          editHash: await digest(editKey),
          ownerHash: await digest(ownerKey),
        }),
      })
      if (!response.ok) return response
      return json({ id, editKey, ownerKey, expiresAt: Date.now() + ROOM_LIFETIME }, 201)
    }
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/.*)?$/)
    if (!match || !roomId.test(match[1]) || (match[2] || '').startsWith('/internal'))
      throw new HttpError(404, 'Shared board not found.')
    // Only the public router can create a room. Request bodies/headers cannot select an owner.
    url.pathname = match[2] || '/'
    return await env.ROOMS.getByName(match[1]).fetch(new Request(url, request))
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    return json({ error: 'Sharing is temporarily unavailable. Your local boards are safe.' }, 503)
  }
}
