import { afterEach, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { mediaLimits } from '../worker/media-policy'

let script: string
const instances: Miniflare[] = []
beforeAll(async () => {
  const result = await build({
    entryPoints: ['tests/fixtures/media-worker.ts'],
    bundle: true,
    format: 'esm',
    write: false,
    external: ['cloudflare:workers'],
  })
  script = result.outputFiles[0].text
})
afterEach(async () => {
  await Promise.all(instances.splice(0).map((mf) => mf.dispose()))
})

function options(bindings: Record<string, string> = {}) {
  return convertV4MiniflareOptions({
    modules: true,
    script,
    compatibilityDate: '2026-10-09',
    bindings: { SHARING_ENABLED: 'true', ...bindings },
    durableObjects: { MEDIA_BUDGET: { className: 'TestMediaBudget', useSQLite: true } },
    r2Buckets: ['MEDIA'],
  })
}
function emulator(bindings: Record<string, string> = {}) {
  const mf = new Miniflare(options(bindings))
  instances.push(mf)
  return mf
}
const mediaKey = (room = crypto.randomUUID()) => `/${room}/${crypto.randomUUID()}`
const put = (mf: Miniflare, key: string, size = 10) =>
  mf.dispatchFetch(`https://media${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array(size),
  })
const get = (mf: Miniflare, key: string) => mf.dispatchFetch(`https://media${key}`)

it('reserves bytes across rooms atomically, refuses overflow, and releases confirmed deletions', async () => {
  const mf = emulator({ MEDIA_MAX_BYTES: '100' })
  await get(mf, '/test/audit')
  const a = mediaKey(),
    b = mediaKey()
  const responses = await Promise.all([put(mf, a, 70), put(mf, b, 70)])
  expect(responses.map((r) => r.status).sort()).toEqual([201, 413])
  const bucket = await mf.getR2Bucket('MEDIA')
  expect((await bucket.list()).objects).toHaveLength(1)
  const saved = responses[0].ok ? a : b
  expect((await put(mf, saved, 5)).status).toBe(409)
  expect(
    (await mf.dispatchFetch(`https://media/room/${saved.split('/')[1]}`, { method: 'DELETE' }))
      .status,
  ).toBe(200)
  expect((await bucket.list()).objects).toHaveLength(0)
  expect((await put(mf, mediaKey(), 100)).status).toBe(201)
}, 20000)

it('counts all media reads and audit lists; exhausted requests never reach R2', async () => {
  const mf = emulator({ MEDIA_MAX_WRITES: '3', MEDIA_MAX_READS: '2' })
  const key = mediaKey()
  expect((await put(mf, key)).status).toBe(201) // initial audit + upload = 2 Class A operations
  expect((await get(mf, key)).status).toBe(200)
  expect((await get(mf, key)).status).toBe(200)
  expect((await get(mf, key)).status).toBe(429)
  expect((await get(mf, '/test/audit')).status).toBe(200) // third Class A operation
  expect((await put(mf, mediaKey())).status).toBe(429)
  expect((await (await mf.getR2Bucket('MEDIA')).list()).objects).toHaveLength(1)
  await get(mf, '/test/age')
  expect((await get(mf, key)).status).toBe(200) // only expires after the rolling 32-day window
}, 20000)

it('a failed/stale watchdog closes media access and a successful audit recovers it', async () => {
  const mf = emulator()
  const key = mediaKey()
  expect((await put(mf, key)).status).toBe(201)
  await get(mf, '/test/stale')
  expect((await get(mf, key)).status).toBe(503)
  expect((await put(mf, mediaKey())).status).toBe(503)
  expect((await get(mf, '/test/audit')).status).toBe(200)
  expect((await get(mf, key)).status).toBe(200)
}, 20000)

it('untracked bucket data latches the kill switch even after it is removed', async () => {
  const mf = emulator()
  const key = mediaKey()
  expect((await put(mf, key)).status).toBe(201)
  const bucket = await mf.getR2Bucket('MEDIA')
  await bucket.put('unexpected', 'untracked')
  expect((await get(mf, '/test/audit')).status).toBe(503)
  await bucket.delete('unexpected')
  // Recreate the Worker with fresh bindings, as happens during deployment.
  await mf.setOptions(options({ SHARING_ENABLED: 'false' }))
  await mf.setOptions(options())
  expect((await get(mf, '/test/audit')).status).toBe(503)
  expect((await get(mf, key)).status).toBe(503)
  expect((await put(mf, mediaKey())).status).toBe(503)
  // The switch doesn't prevent the owner from deleting the online copy.
  expect(
    (await mf.dispatchFetch(`https://media/room/${key.split('/')[1]}`, { method: 'DELETE' }))
      .status,
  ).toBe(200)
  expect((await (await mf.getR2Bucket('MEDIA')).list()).objects).toHaveLength(0)
}, 20000)

it('disabled sharing and invalid limit overrides fail closed', async () => {
  const mf = emulator({ SHARING_ENABLED: 'false' })
  expect((await put(mf, mediaKey())).status).toBe(503)
  expect((await (await mf.getR2Bucket('MEDIA')).list()).objects).toHaveLength(0)
  for (const value of ['-1', 'NaN', '2000000001', 'Infinity'])
    expect(() => mediaLimits({ MEDIA_MAX_BYTES: value })).toThrow()
}, 20000)
