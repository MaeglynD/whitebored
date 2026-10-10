import { afterEach, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
let script: string
const instances: Miniflare[] = []
beforeAll(async () => {
  script = (
    await build({
      entryPoints: ['tests/fixtures/capped-worker.ts'],
      bundle: true,
      format: 'esm',
      write: false,
      external: ['cloudflare:workers'],
    })
  ).outputFiles[0].text
})
afterEach(async () => {
  await Promise.all(instances.splice(0).map((mf) => mf.dispose()))
})
const emulator = (maxBytes?: string) => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-10-09',
      bindings: { SHARING_ENABLED: 'true', ...(maxBytes ? { SQL_MEDIA_MAX_BYTES: maxBytes } : {}) },
      durableObjects: { CAPPED_MEDIA: { className: 'CappedMedia', useSQLite: true } },
      // Deliberately no R2 binding: tests must work with no metered object storage.
    }),
  )
  instances.push(mf)
  return mf
}
const fileKey = (room = crypto.randomUUID()) => `${room}/${crypto.randomUUID()}`
const put = (mf: Miniflare, key: string, body: Uint8Array, identity?: string) =>
  mf.dispatchFetch(`https://media/${key}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'image/png',
      ...(identity ? { 'X-Upload-Identity': identity } : {}),
    },
    body,
  })
const get = (mf: Miniflare, path: string) => mf.dispatchFetch(`https://media/${path}`)

it('stores chunked media byte-for-byte and persists without an R2 binding', async () => {
  const mf = emulator(),
    key = fileKey('a'.repeat(22))
  const bytes = new Uint8Array(1_100_123).map((_, i) => i % 251)
  expect((await put(mf, key, bytes)).status).toBe(201)
  const read = await get(mf, key)
  expect(new Uint8Array(await read.arrayBuffer())).toEqual(bytes)
  expect(await (await get(mf, 'status')).json()).toMatchObject({
    bytes: bytes.length,
    files: 1,
    storage: 'sqlite',
  })
  expect((await put(mf, key, bytes)).status).toBe(409)
}, 20000)

it('atomically enforces capacity, releases deleted bytes and never revives a stopped room', async () => {
  const mf = emulator('100'),
    a = fileKey(),
    b = fileKey()
  const results = await Promise.all([
    put(mf, a, new Uint8Array(70)),
    put(mf, b, new Uint8Array(70)),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([201, 413])
  const saved = results[0].ok ? a : b
  expect(
    (await mf.dispatchFetch(`https://media/room/${saved.split('/')[0]}`, { method: 'DELETE' })).ok,
  ).toBe(true)
  expect((await get(mf, saved)).status).toBe(404)
  expect((await put(mf, saved, new Uint8Array(5))).status).toBe(404)
  expect((await put(mf, fileKey(), new Uint8Array(100))).status).toBe(201)
}, 20000)

it('limits daily uploads across rooms by network identity, without blocking other networks', async () => {
  const mf = emulator()
  for (let n = 0; n < 100; n++)
    expect((await put(mf, fileKey(), new Uint8Array(1), 'network-one')).status).toBe(201)
  expect((await put(mf, fileKey(), new Uint8Array(1), 'network-one')).status).toBe(429)
  expect((await put(mf, fileKey(), new Uint8Array(1), 'network-two')).status).toBe(201)
}, 20000)

it('rejects empty, oversize, unsupported files and invalid capacity before committing any bytes', async () => {
  const mf = emulator()
  expect((await put(mf, fileKey(), new Uint8Array())).status).toBe(400)
  expect((await put(mf, fileKey(), new Uint8Array(10 * 1024 * 1024 + 1))).status).toBe(413)
  expect(
    (
      await mf.dispatchFetch(`https://media/${fileKey()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: 'bad',
      })
    ).status,
  ).toBe(415)
  expect(await (await get(mf, 'status')).json()).toMatchObject({ bytes: 0, files: 0 })
  expect((await put(emulator('999999999'), fileKey(), new Uint8Array(1))).status).toBe(503)
}, 20000)
