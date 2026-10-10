// Test-only entry point. This file is never deployed by wrangler.jsonc.
import { MediaBudget } from '../../worker/media'
export { MediaBudget }
export class TestMediaBudget extends MediaBudget {
  expireAudit() {
    this.ctx.storage.sql.exec('UPDATE media_budget_state SET audited_at = 1 WHERE id = 1')
  }
  ageOperations() {
    this.ctx.storage.sql.exec('UPDATE media_budget_days SET day = day - 33')
  }
}
export default {
  async fetch(request: Request, env: any) {
    const object = env.MEDIA_BUDGET.getByName('media-budget-v1')
    switch (new URL(request.url).pathname) {
      case '/test/audit':
        try {
          await object.audit()
          return new Response('OK')
        } catch {
          return new Response('PAUSED', { status: 503 })
        }
      case '/test/stale':
        await object.expireAudit()
        return new Response('OK')
      case '/test/age':
        await object.ageOperations()
        return new Response('OK')
      default:
        return object.fetch(request)
    }
  },
}
