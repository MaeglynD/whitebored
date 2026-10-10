// No public deployment imports this measurement fixture.
import { DurableObject } from 'cloudflare:workers'
import { DurableObjectSqliteSyncWrapper, SQLiteSyncStorage } from '@tldraw/sync-core'
export class CapacityProbe extends DurableObject {
  async fetch() {
    let writes = 0
    const queries: Record<string, number> = {}
    const sql = {
      exec: (query: string, ...bindings: any[]) => {
        const cursor = this.ctx.storage.sql.exec(query, ...bindings)
        writes += cursor.rowsWritten
        queries[query] = (queries[query] || 0) + cursor.rowsWritten
        return cursor
      },
    }
    const storage = new SQLiteSyncStorage({
      sql: new DurableObjectSqliteSyncWrapper({
        sql,
        transactionSync: (fn: () => any) => this.ctx.storage.transactionSync(fn),
      }),
    })
    const record: any = { id: 'shape:measurement', typeName: 'shape', x: 0 }
    storage.transaction((tx) => tx.set(record.id, record))
    writes = 0
    for (const key of Object.keys(queries)) delete queries[key]
    for (let i = 1; i <= 300; i++)
      storage.transaction((tx) => tx.set(record.id, { ...record, x: i }))
    return Response.json({ commits: 300, writes, writesPerCommit: writes / 300, queries })
  }
}
export default {
  fetch(request: Request, env: any) {
    return env.PROBE.getByName('measurement').fetch(request)
  },
}
