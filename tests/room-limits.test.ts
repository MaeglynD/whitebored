import { afterEach, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createTLSchema, DocumentRecordType, PageRecordType } from '@tldraw/tlschema'
let script: string
const instances: Miniflare[] = []
beforeAll(async () => {
  script = (
    await build({
      entryPoints: ['tests/fixtures/rooms-worker.ts'],
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
function emulator() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-10-09',
      bindings: { SHARING_ENABLED: 'true' },
      durableObjects: {
        ROOMS: { className: 'TestRoom', useSQLite: true },
        SHARE_LIMITS: { className: 'ShareLimits', useSQLite: true },
        CAPPED_MEDIA: { className: 'CappedMedia', useSQLite: true },
      },
    }),
  )
  instances.push(mf)
  return mf
}
const create = async (mf: Miniflare, ip = 'test') =>
  mf.dispatchFetch('https://test/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ title: 'Limit test' }),
  })
const snapshot = () => ({
  schema: createTLSchema().serialize(),
  store: {
    'document:document': DocumentRecordType.create({ id: 'document:document' }),
    'page:page': PageRecordType.create({ id: 'page:page', name: 'Page 1', index: 'a1' as any }),
  },
})
const request = (mf: Miniflare, link: any, path = '', init: RequestInit = {}, owner = false) =>
  mf.dispatchFetch(`https://test/api/rooms/${link.id}${path}`, {
    ...(init as any),
    headers: { ...init.headers, Authorization: `Bearer ${owner ? link.ownerKey : link.editKey}` },
  })
async function ready(mf: Miniflare) {
  const link: any = await (await create(mf)).json()
  expect(
    (
      await request(
        mf,
        link,
        '/initialize',
        { method: 'PUT', body: JSON.stringify(snapshot()) },
        true,
      )
    ).status,
  ).toBe(200)
  return link
}

it('enforces the per-board file count independently of network identities', async () => {
  const mf = emulator(),
    link = await ready(mf)
  for (let i = 0; i < 101; i++) {
    const response = await request(mf, link, `/assets/${crypto.randomUUID()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'CF-Connecting-IP': `network-${i}` },
      body: new Uint8Array([1]),
    })
    expect(response.status).toBe(i < 100 ? 201 : 413)
  }
  const usage: any = await (await mf.dispatchFetch('https://test/api/capacity')).json()
  expect(usage.files).toBe(100)
}, 30000)

it('enforces 20 connections on the server and frees a slot on disconnect', async () => {
  const mf = emulator(),
    link = await ready(mf),
    sockets = []
  for (let i = 0; i < 20; i++) {
    const result = await request(mf, link, `/connect?key=${link.editKey}&sessionId=session${i}`, {
      headers: { Upgrade: 'websocket' },
    })
    expect(result.status).toBe(101)
    result.webSocket!.accept()
    sockets.push(result.webSocket!)
  }
  expect(
    (
      await request(mf, link, `/connect?key=${link.editKey}&sessionId=extra`, {
        headers: { Upgrade: 'websocket' },
      })
    ).status,
  ).toBe(429)
  sockets[0].close()
  await new Promise((r) => setTimeout(r, 100))
  const last = await request(mf, link, `/connect?key=${link.editKey}&sessionId=replacement`, {
    headers: { Upgrade: 'websocket' },
  })
  expect(last.status).toBe(101)
  last.webSocket!.accept()
  last.webSocket!.close()
  sockets.slice(1).forEach((ws) => ws.close())
}, 20000)

it('freezes before final export, retains authenticated media for recovery, and expires rooms', async () => {
  const mf = emulator(),
    link = await ready(mf),
    asset = crypto.randomUUID()
  expect(
    (
      await request(mf, link, `/assets/${asset}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      })
    ).status,
  ).toBe(201)
  expect((await request(mf, link, '/freeze', { method: 'POST' })).status).toBe(404)
  expect((await request(mf, link, '/freeze', { method: 'POST' }, true)).status).toBe(200)
  expect((await request(mf, link)).status).toBe(410)
  expect((await request(mf, link, `/assets/${asset}`)).status).toBe(200)
  expect(
    (
      await request(mf, link, `/assets/${crypto.randomUUID()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array(1),
      })
    ).status,
  ).toBe(410)
  expect((await request(mf, link, '/freeze', { method: 'POST' }, true)).status).toBe(200)
  await mf.dispatchFetch(`https://test/test/expire/${link.id}`)
  expect((await request(mf, link)).status).toBe(404)
  expect((await request(mf, link, `/assets/${asset}`)).status).toBe(404)
  expect(await (await mf.dispatchFetch('https://test/api/capacity')).json()).toMatchObject({
    files: 0,
    bytes: 0,
  })
}, 20000)

it('rejects overlarge initial records and caps room creation per network', async () => {
  const mf = emulator(),
    link: any = await (await create(mf)).json()
  const data = snapshot()
  data.store['document:document'].name = 'x'.repeat(512_001)
  expect(
    (await request(mf, link, '/initialize', { method: 'PUT', body: JSON.stringify(data) }, true))
      .status,
  ).toBe(400)
  for (let i = 0; i < 9; i++) expect((await create(mf)).status).toBe(201)
  expect((await create(mf)).status).toBe(429)
  expect((await create(mf, 'different-network')).status).toBe(201)
}, 20000)

it('hourly cleanup recovers an expired room even when its alarm never completed', async () => {
  const mf = emulator(),
    link = await ready(mf)
  expect(
    (
      await request(mf, link, `/assets/${crypto.randomUUID()}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      })
    ).status,
  ).toBe(201)
  await mf.dispatchFetch(`https://test/test/miss-expiry/${link.id}`)
  expect((await request(mf, link)).status).toBe(404)
  expect(await (await mf.dispatchFetch('https://test/api/capacity')).json()).toMatchObject({
    bytes: 3,
  })
  expect((await mf.dispatchFetch('https://test/test/sweep')).status).toBe(200)
  expect(await (await mf.dispatchFetch('https://test/api/capacity')).json()).toMatchObject({
    bytes: 0,
    files: 0,
  })
  expect((await mf.dispatchFetch('https://test/test/sweep')).status).toBe(200)
}, 20000)
