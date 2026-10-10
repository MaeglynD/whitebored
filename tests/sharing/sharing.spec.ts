import { test, expect, type Page } from '@playwright/test'
import { stroke, menu } from '../e2e/helpers'
import { readFile } from 'node:fs/promises'

const canvasShapes = (page: Page) => page.locator('.canvas-area .tl-shape')
test.beforeEach(async ({ page }) => {
  // Isolate local-emulator creation quotas between test runs. Cloudflare supplies the real header in production.
  await page.setExtraHTTPHeaders({ 'CF-Connecting-IP': crypto.randomUUID() })
})
async function share(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await stroke(page)
  await page.getByRole('button', { name: 'Share board', exact: true }).click()
  await page.getByRole('button', { name: 'Create shared copy', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Shared board link' })).toBeVisible()
  return page.getByRole('textbox', { name: 'Shared board link' }).inputValue()
}
async function openShared(page: Page, url: string) {
  await page.goto(url)
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await expect(canvasShapes(page)).toHaveCount(1)
}
test('two independent people edit, see cursors, undo their own stroke, and reload durable content', async ({
  page,
  browser,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const url = await share(page)
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{22}$/)
  await page.getByRole('button', { name: 'Close sharing' }).click()
  await expect(page.locator('.shared-label')).toHaveText('Shared')
  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await openShared(other, url)
  await stroke(other, 600, 420)
  await expect(canvasShapes(page)).toHaveCount(2)
  await stroke(page, 800, 520)
  await expect(canvasShapes(other)).toHaveCount(3)
  await expect(page.locator('.shared-people')).toContainText('2')
  await page.keyboard.press('Control+z')
  await expect(canvasShapes(other)).toHaveCount(2)
  await expect(
    page.getByRole('status', { name: 'Shared changes saved', exact: true }),
  ).toBeAttached()
  await other.reload()
  await expect(canvasShapes(other)).toHaveCount(2)
  await page.screenshot({ path: '.qa/sharing-desktop.png' })
  expect(errors).toEqual([])
  await otherContext.close()
  await page.getByRole('button', { name: 'Back to local boards', exact: true }).click()
  await expect(canvasShapes(page)).toHaveCount(1)
})
test('wrong keys cannot read, edit, initialize, fetch media or revoke; owner revocation disconnects everyone', async ({
  page,
  browser,
  request,
}) => {
  const url = await share(page)
  const id = new URL(url).pathname.split('/').at(-1)!,
    editKey = id
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('whitebored-shared-links-v1')!)[0],
  )
  const wrong = { Authorization: `Bearer ${'a'.repeat(43)}` }
  expect((await request.get(`/api/rooms/${id}`, { headers: wrong })).status()).toBe(404)
  expect(
    (
      await request.put(`/api/rooms/${id}/initialize`, {
        headers: { Authorization: `Bearer ${editKey}` },
        data: {},
      })
    ).status(),
  ).toBe(404)
  expect(
    (
      await request.delete(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${editKey}` } })
    ).status(),
  ).toBe(404)
  expect(
    (
      await request.post('/api/rooms', {
        headers: { Origin: 'https://evil.example' },
        data: { title: 'Not allowed' },
      })
    ).status(),
  ).toBe(403)
  const context = await browser.newContext()
  const other = await context.newPage()
  await openShared(other, url)
  await other.getByRole('button', { name: 'Share board', exact: true }).click()
  await expect(other.getByRole('button', { name: 'Stop sharing' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop sharing' }).click()
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.shared-label')).toHaveCount(0)
  await expect(canvasShapes(page)).toHaveCount(1)
  await expect(other.getByRole('heading', { name: 'This shared session has ended' })).toBeVisible()
  await other.getByRole('button', { name: 'Keep a copy & continue' }).click()
  await expect(other).toHaveURL(/\/$/)
  await expect(canvasShapes(other)).toHaveCount(1)
  expect(
    (
      await request.get(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${editKey}` } })
    ).status(),
  ).toBe(404)
  expect(
    (
      await request.get(`/api/rooms/${id}`, {
        headers: { Authorization: `Bearer ${saved.ownerKey}` },
      })
    ).status(),
  ).toBe(404)
  await context.close()
})
test('image upload is shared, authenticated, portable on export, and denied after revocation', async ({
  page,
  browser,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  const upload = page.waitForEvent('filechooser')
  await menu(page, 'Add image or video')
  await (await upload).setFiles('public/icon-192.png')
  await expect(canvasShapes(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Share board', exact: true }).click()
  await page.getByRole('button', { name: 'Create shared copy', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Shared board link' })
  await expect(input).toBeVisible()
  const url = await input.inputValue()
  const context = await browser.newContext()
  const other = await context.newPage()
  const mediaRequests: string[] = []
  other.on('request', (request) => {
    if (request.url().includes('/api/rooms/') && request.url().includes('/assets/'))
      mediaRequests.push(request.url())
  })
  await openShared(other, url)
  await expect(other.locator('.tl-image')).toBeVisible()
  await expect
    .poll(() =>
      other
        .locator('.tl-image')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true)
  const mediaUrl = await other.locator('.tl-image').getAttribute('src')
  expect(mediaUrl).toMatch(/^blob:/)
  const newUpload = other.waitForEvent('filechooser')
  await menu(other, 'Add image or video')
  await (await newUpload).setFiles('public/icon-512.png')
  await expect(canvasShapes(other)).toHaveCount(2)
  await expect(
    other.getByRole('status', { name: 'Shared changes saved', exact: true }),
  ).toBeAttached()
  await menu(other, 'Export')
  const output = other.waitForEvent('download')
  await other.getByRole('button', { name: 'Editable board (.canvas)' }).click()
  const document = JSON.parse(await readFile((await (await output).path())!, 'utf8'))
  expect(document.document.records.find((r: any) => r.typeName === 'asset').props.src).toMatch(
    /^data:image\/png/,
  )
  expect(JSON.stringify(document)).not.toContain(editKeyFrom(url))
  await menu(other, 'Save local copy')
  await expect(other.getByText('Saved a separate copy to your local boards.')).toBeVisible()
  const id = editKeyFrom(url),
    editKey = id
  expect(mediaRequests.length).toBeGreaterThan(0)
  expect((await request.get(mediaRequests[0])).status()).toBe(404)
  expect(
    (
      await request.get(mediaRequests[0], { headers: { Authorization: `Bearer ${editKey}` } })
    ).status(),
  ).toBe(200)
  expect(
    (
      await request.put(`/api/rooms/${id}/assets/${crypto.randomUUID()}`, {
        headers: { Authorization: `Bearer ${editKey}`, 'Content-Type': 'text/html' },
        data: '<script>bad()</script>',
      })
    ).status(),
  ).toBe(415)
  await page.getByRole('button', { name: 'Stop sharing' }).click()
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(canvasShapes(page)).toHaveCount(2)
  await other.getByRole('button', { name: 'Keep a copy & continue' }).click()
  await expect(other).toHaveURL(/\/$/)
  await expect(canvasShapes(other)).toHaveCount(2)
  expect(
    (
      await request.get(mediaRequests[0], { headers: { Authorization: `Bearer ${editKey}` } })
    ).status(),
  ).toBe(404)
  await context.close()
})
test('offline edits reconnect without overwriting another person’s work', async ({
  page,
  browser,
}) => {
  const url = await share(page)
  await page.getByRole('button', { name: 'Close sharing' }).click()
  const context = await browser.newContext()
  await context.addInitScript(() => {
    const NativeWebSocket = window.WebSocket
    ;(window as any).__sockets = []
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        ;(window as any).__sockets.push(this)
      }
    }
  })
  const other = await context.newPage()
  await openShared(other, url)
  await context.setOffline(true)
  await other.evaluate(() => (window as any).__sockets.forEach((ws: WebSocket) => ws.close()))
  await expect(other.getByText('Reconnecting. Keep this tab open to sync changes.')).toBeVisible()
  await stroke(other, 750, 400)
  await stroke(page, 450, 550)
  await expect(canvasShapes(page)).toHaveCount(2)
  await expect(
    other.getByRole('status', { name: 'Shared changes pending', exact: true }),
  ).toBeAttached()
  await context.setOffline(false)
  await expect(canvasShapes(page)).toHaveCount(3, { timeout: 30000 })
  await expect(canvasShapes(other)).toHaveCount(3)
  await expect(
    other.getByRole('status', { name: 'Shared changes saved', exact: true }),
  ).toBeAttached()
  await context.close()
})

test('a shared link works on a narrow dark screen and persists text edits', async ({
  page,
  browser,
}) => {
  const url = await share(page)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const other = await context.newPage()
  await other.addInitScript(() =>
    localStorage.setItem('folio-preferences', JSON.stringify({ theme: 'dark' })),
  )
  await openShared(other, url)
  await other.getByRole('button', { name: 'Text', exact: true }).click()
  await other.mouse.click(150, 220)
  await other.waitForTimeout(150)
  await other.keyboard.type('Together on the same board')
  await other.keyboard.press('Escape')
  await expect(
    other.getByRole('status', { name: 'Shared changes saved', exact: true }),
  ).toBeAttached()
  await other.screenshot({ path: '.qa/sharing-mobile-dark.png' })
  await other.getByRole('button', { name: 'Share board', exact: true }).click()
  await expect(other.getByRole('textbox', { name: 'Shared board link' })).toBeVisible()
  await other.waitForTimeout(250)
  await other.screenshot({ path: '.qa/sharing-dialog-dark.png' })
  await other.getByRole('button', { name: 'Close sharing' }).click()
  await other.reload()
  await expect(other.locator('.tl-text-shape')).toContainText('Together on the same board')
  await context.close()
})

const editKeyFrom = (url: string) => new URL(url).pathname.split('/').at(-1)!

test('a failed local save leaves the frozen session recoverable and Stop sharing can retry', async ({
  page,
  request,
}) => {
  const url = await share(page)
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{22}$/)
  await expect(page.locator('.shared-label')).toHaveText('Shared')
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: any[]) {
      if (args[1] === 'readwrite') {
        IDBDatabase.prototype.transaction = original
        throw new DOMException('Test disk full', 'QuotaExceededError')
      }
      return original.apply(this, args as any)
    }
  })
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Test disk full')
  const id = editKeyFrom(url)
  expect(
    (
      await request.get(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${id}` } })
    ).status(),
  ).toBe(410)
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(canvasShapes(page)).toHaveCount(1)
  expect(
    (
      await request.get(`/api/rooms/${id}`, { headers: { Authorization: `Bearer ${id}` } })
    ).status(),
  ).toBe(404)
})

test('an owner can recover the final board and media after closing during stop-sharing', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  const upload = page.waitForEvent('filechooser')
  await menu(page, 'Add image or video')
  await (await upload).setFiles('public/icon-192.png')
  await expect(canvasShapes(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Share board', exact: true }).click()
  await page.getByRole('button', { name: 'Create shared copy', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Shared board link' })).toBeVisible()
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem('whitebored-shared-links-v1')!)[0],
  )
  // Simulate closing after the authoritative freeze but before the local transaction.
  await expect(page).toHaveURL(/\/s\/[A-Za-z0-9_-]{22}$/)
  await expect(page.locator('.shared-label')).toHaveText('Shared')
  expect(
    (
      await request.post(`/api/rooms/${saved.id}/freeze`, {
        headers: { Authorization: `Bearer ${saved.ownerKey}` },
      })
    ).status(),
  ).toBe(200)
  await page.reload()
  await page.getByRole('button', { name: 'Keep a copy & continue' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(canvasShapes(page)).toHaveCount(1)
  await expect
    .poll(() =>
      page
        .locator('.tl-image')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true)
  expect(
    (
      await request.get(`/api/rooms/${saved.id}`, {
        headers: { Authorization: `Bearer ${saved.editKey}` },
      })
    ).status(),
  ).toBe(404)
})

test('names, colors, join/leave notifications and a live roster follow the connected sessions', async ({
  page,
  browser,
}) => {
  const url = await share(page)
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Ada')
  await page.getByRole('button', { name: 'Cursor color 3', exact: true }).click()
  await page.getByRole('button', { name: 'Close sharing' }).click()
  const context = await browser.newContext()
  const other = await context.newPage()
  await openShared(other, url)
  await other.getByRole('button', { name: 'Share board', exact: true }).click()
  await expect(other.locator('.presence-roster')).toContainText('Ada')
  await other.getByRole('textbox', { name: 'Your name', exact: true }).fill('Grace')
  await other.getByRole('button', { name: 'Cursor color 5', exact: true }).click()
  await other.getByRole('button', { name: 'Close sharing' }).click()
  await other.mouse.move(700, 450, { steps: 15 })
  await expect(page.locator('.collaborator-name')).toContainText('Grace')
  await expect(page.locator('.collaborator-name')).toHaveCSS(
    'background-color',
    'rgb(101, 116, 206)',
  )
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const cursor = document.querySelector<HTMLElement>('.whitebored-cursor')!
    const positions = new Set<string>()
    ;(window as any).__cursorFrames = positions
    const observer = new MutationObserver(() => positions.add(cursor.style.transform))
    observer.observe(cursor, { attributes: true, attributeFilter: ['style'] })
    setTimeout(() => observer.disconnect(), 1500)
  })
  // One incoming pointer jump should render several intermediate animation frames.
  await other.mouse.move(900, 500)
  await expect
    .poll(() => page.evaluate(() => (window as any).__cursorFrames.size))
    .toBeGreaterThan(3)
  await page.getByRole('button', { name: 'Share board', exact: true }).click()
  await expect(page.locator('.presence-roster li')).toHaveCount(2)
  await expect(page.locator('.presence-roster')).toContainText('Grace')
  await page.waitForTimeout(250)
  await page.screenshot({ path: '.qa/sharing-roster.png' })
  await context.close()
  await expect(page.locator('.presence-roster li')).toHaveCount(1)
  await expect(page.getByText('Grace disconnected.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close sharing' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Share board', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Your name', exact: true })).toHaveValue('Ada')
})
