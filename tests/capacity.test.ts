import { expect, it } from 'vitest'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { mkdir, writeFile } from 'node:fs/promises'
it('measures SQLite writes for 300 single-shape commits in the installed sync engine', async () => {
  const script = (
    await build({
      entryPoints: ['tests/fixtures/capacity-worker.ts'],
      bundle: true,
      format: 'esm',
      write: false,
      external: ['cloudflare:workers'],
    })
  ).outputFiles[0].text
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-10-09',
      durableObjects: { PROBE: { className: 'CapacityProbe', useSQLite: true } },
    }),
  )
  try {
    const result: any = await (await mf.dispatchFetch('https://probe/')).json()
    expect(result.commits).toBe(300)
    expect(result.writesPerCommit).toBeGreaterThanOrEqual(2)
    await mkdir('.qa', { recursive: true })
    await writeFile('.qa/sqlite-write-measurement.json', JSON.stringify(result, null, 2))
  } finally {
    await mf.dispose()
  }
}, 20000)
