// Test-only routes for time travel; production uses worker/index.ts directly.
import worker, { SharedRoom, ShareLimits, CappedMedia } from '../../worker/index'
export { ShareLimits, CappedMedia }
export class TestRoom extends SharedRoom {
  async missExpiryAlarm() {
    const meta = (this as any).meta
    meta.expiresAt = Date.now() - 1
    await this.ctx.storage.put('metadata', meta)
  }
  async expire() {
    const meta = (this as any).meta
    if (meta) meta.expiresAt = Date.now() - 1
    await this.alarm()
  }
}
export default {
  async fetch(request: Request, env: any) {
    const path = new URL(request.url).pathname
    if (path === '/test/sweep') {
      await worker.scheduled({} as any, env)
      return new Response('OK')
    }
    if (path.startsWith('/test/miss-expiry/')) {
      await env.ROOMS.getByName(path.split('/').at(-1)).missExpiryAlarm()
      return new Response('OK')
    }
    if (path.startsWith('/test/expire/')) {
      await env.ROOMS.getByName(path.split('/').at(-1)).expire()
      return new Response('OK')
    }
    return worker.fetch(request, env)
  },
}
