import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { getIndices } from 'tldraw'
import { stroke } from './helpers'

test('legacy Folio imports keep white ink, custom width and a dark canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await page.mouse.move(500, 350)
  await page.mouse.down()
  await page.mouse.move(650, 450, { steps: 15 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const output = page.waitForEvent('download')
  await page.getByRole('button', { name: /Editable board/ }).click()
  const backup = JSON.parse(await readFile((await (await output).path())!, 'utf8'))
  const records = backup.document.records.filter((r: any) =>
    ['document', 'page', 'shape', 'asset', 'binding'].includes(r.typeName),
  )
  const ink = records.find((r: any) => r.type === 'draw')
  ink.props.color = 'white'
  ink.meta.folioWidth = 0.5
  const legacy = {
    format: 'folio',
    version: 1,
    title: 'Legacy sketch',
    snapshot: {
      document: {
        schema: backup.document.schema,
        store: Object.fromEntries(records.map((r: any) => [r.id, r])),
      },
      session: backup.session,
    },
  }
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'legacy.folio',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(legacy)),
    })
  await expect(page.getByText('Board imported as a new copy')).toBeVisible()
  await expect(page.locator('.canvas-area')).toHaveClass(/legacy/)
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.canvas-area')).toHaveClass(/legacy/)
  await expect(page.locator('.tl-shape')).toHaveCount(1)
})

test('image assets travel with a backup and survive importing and reloading', async ({ page }) => {
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add image or video', exact: true }).click()
  await (await chooser).setFiles('public/icon-192.png')
  await expect(page.locator('.tl-image')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Saved on device' })).toBeVisible()
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Editable board/ }).click()
  const file = await download
  const path = (await file.path())!
  const backup = JSON.parse(await readFile(path, 'utf8'))
  expect(backup.document.records.find((r: any) => r.typeName === 'asset').props.src).toMatch(
    /^data:image\/png/,
  )
  await page.locator('input[type=file]').first().setInputFiles(path)
  await expect(page.getByText('Board imported as a new copy')).toBeVisible()
  await page.reload()
  await expect(page.locator('.tl-image')).toBeVisible()
  expect(
    await page
      .locator('.tl-image')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true)
})

test('another window cannot silently overwrite the active document', async ({ page, context }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pen', exact: true }).waitFor()
  const other = await context.newPage()
  await other.goto('/')
  await other.getByRole('button', { name: 'Pen', exact: true }).waitFor()
  await other.keyboard.press('Control+s')
  await expect(other.getByRole('status', { name: 'Saved on device' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await other.getByRole('button', { name: 'Pen', exact: true }).click()
  await other.mouse.move(500, 700)
  await other.mouse.down()
  await other.mouse.move(700, 730, { steps: 10 })
  await other.mouse.up()
  await expect(page.getByRole('alert')).toContainText('another window')
  await expect(other.getByRole('status', { name: 'Saved on device' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
})

test('a large board opens, pans and round-trips without dropping shapes', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await stroke(page)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Editable board/ }).click()
  const file = await download
  const backup = JSON.parse(await readFile((await file.path())!, 'utf8'))
  const rect = backup.document.records.find((r: any) => r.typeName === 'shape' && r.type === 'draw')
  backup.title = '2,000 shape benchmark'
  backup.document.records = backup.document.records.filter(
    (r: any) => !['shape', 'binding'].includes(r.typeName),
  )
  const indices = getIndices(2000)
  for (let i = 0; i < 2000; i++)
    backup.document.records.push({
      ...rect,
      id: 'shape:bench' + i,
      x: (i % 50) * 260,
      y: Math.floor(i / 50) * 165,
      index: indices[i],
    })
  const start = performance.now()
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'benchmark.canvas',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    })
  await expect(page.getByText('Board imported as a new copy')).toBeVisible()
  const openedInMs = performance.now() - start
  await page.getByRole('button', { name: 'Hand', exact: true }).click()
  await page.mouse.move(550, 500)
  await page.mouse.down()
  await page.mouse.move(700, 600, { steps: 30 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const output = page.waitForEvent('download')
  await page.getByRole('button', { name: /Editable board/ }).click()
  const saved = JSON.parse(await readFile((await (await output).path())!, 'utf8'))
  expect(saved.document.records.filter((r: any) => r.typeName === 'shape')).toHaveLength(2000)
  await testInfo.attach('large-board-measurement', {
    body: JSON.stringify({
      shapes: 2000,
      importToUsableMs: Math.round(openedInMs),
      note: 'Local Chromium smoke measurement, not a cross-device performance guarantee.',
    }),
    contentType: 'application/json',
  })
})
