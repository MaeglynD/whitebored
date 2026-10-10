import { DurableObject } from 'cloudflare:workers'
import { SharedRoom } from './room'
import { MediaBudget } from './media'
import { HttpError, digest, json, key, readJson, uuid } from './security'
export { SharedRoom, MediaBudget }

export interface Env {
  ASSETS: Fetcher
  ROOMS: DurableObjectNamespace<SharedRoom>
  SHARE_LIMITS: DurableObjectNamespace<ShareLimits>
  MEDIA: R2Bucket
  MEDIA_BUDGET: DurableObjectNamespace<MediaBudget>
  SHARING_ENABLED: string
  MEDIA_MAX_BYTES?: string
  MEDIA_MAX_WRITES?: string
  MEDIA_MAX_READS?: string
}

// A small, persistent quota prevents anonymous creation from allocating unbounded rooms.
export class ShareLimits extends DurableObject<Env> {
  async fetch(request: Request) {
    const identity = await request.text()
    return this.ctx.blockConcurrencyWhile(async () => {
      const day = Math.floor(Date.now() / 86400000)
      const counts = await this.ctx.storage.get<{
        day: number
        total: number
        ips: Record<string, number>
      }>('quota')
      const quota = counts?.day === day ? counts : { day, total: 0, ips: {} }
      if (quota.total >= 500 || (quota.ips[identity] || 0) >= 20)
        return json(
          { error: 'Shared-board creation limit reached. Please try again tomorrow.' },
          429,
        )
      quota.total++
      quota.ips[identity] = (quota.ips[identity] || 0) + 1
      await this.ctx.storage.put('quota', quota)
      return json({ ok: true })
    })
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env) {
    if (env.SHARING_ENABLED === 'true') await env.MEDIA_BUDGET.getByName('media-budget-v1').audit()
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
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const input = await readJson(request, 2048)
      if (typeof input.title !== 'string' || input.title.length > 200)
        throw new HttpError(400, 'A board title is required (up to 200 characters).')
      const ip = await digest(request.headers.get('CF-Connecting-IP') || 'local')
      const quota = await env.SHARE_LIMITS.getByName('creation').fetch('https://limits/', {
        method: 'POST',
        body: ip,
      })
      if (!quota.ok) return quota
      const id = crypto.randomUUID(),
        editKey = key(),
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
      return json({ id, editKey, ownerKey }, 201)
    }
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/.*)?$/)
    if (!match || !uuid.test(match[1]) || (match[2] || '').startsWith('/internal'))
      throw new HttpError(404, 'Shared board not found.')
    // Only the public router can create a room. Request bodies/headers cannot select an owner.
    url.pathname = match[2] || '/'
    return await env.ROOMS.getByName(match[1]).fetch(new Request(url, request))
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    return json({ error: 'Sharing is temporarily unavailable. Your local boards are safe.' }, 503)
  }
}
