import { test, expect, type Page } from '@playwright/test'
import { choose, ready, saved, stroke } from './helpers'

async function nameBoard(page: Page, name: string, collection = '') {
  await page.locator('.board-title').click()
  await page.getByLabel('Board name').fill(name)
  await page.getByLabel('Collection').fill(collection)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('.tl-container')).toBeFocused()
}
async function appearance(page: Page, mode: string) {
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await choose(page, 'Appearance', mode)
  await page.getByRole('button', { name: 'Close dialog' }).click()
}

test('created and edited sorting persist, collections stay available, scrollbar reaches the edge', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await nameBoard(page, 'Alpha')
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await nameBoard(page, 'Beta')
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await choose(page, 'Show boards', 'Collections')
  await expect(page.getByText('Add a collection in a board’s details.')).toBeVisible()
  await choose(page, 'Show boards', 'All boards')
  await page.getByRole('button', { name: 'Open Alpha', exact: true }).click()
  await expect(page.locator('.board-title')).toHaveText('Alpha')
  await expect(page.locator('.transition-shield')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await stroke(page, 650, 350)
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await saved(page)
  await expect(page.locator('.card-title')).toHaveText(['Alpha', 'Beta'])
  await choose(page, 'Sort boards', 'Newest created')
  await expect(page.locator('.card-title')).toHaveText(['Beta', 'Alpha'])
  await choose(page, 'Sort boards', 'Oldest created')
  await expect(page.locator('.card-title')).toHaveText(['Alpha', 'Beta'])
  await expect(page.locator('.tl-container')).toBeFocused()
  const shape = page.locator('.tl-shape').first()
  const before = (await shape.boundingBox())!
  await page.keyboard.down('Space')
  await page.mouse.move(1000, 550)
  await page.mouse.down()
  await page.mouse.move(1080, 590, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect.poll(async () => Math.round((await shape.boundingBox())!.x - before.x)).toBe(80)
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.card-title')).toHaveText(['Alpha', 'Beta'])
  await nameBoard(page, 'Alpha', 'Research')
  await choose(page, 'Show boards', 'Research')
  await expect(page.locator('.card-title')).toHaveText(['Alpha'])
  const sidebar = (await page.locator('.board-sidebar').boundingBox())!
  const scroll = (await page.locator('.boards-scroll').boundingBox())!
  expect(Math.abs(scroll.x + scroll.width - (sidebar.x + sidebar.width - 1))).toBeLessThan(1)
  await page.getByRole('combobox', { name: 'Show boards' }).click()
  await page.screenshot({ path: '.qa/library-menu-v4.png', animations: 'disabled' })
})

test('every preview follows the theme, including older cached boards never opened in this session', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await ready(page)
  await nameBoard(page, 'Ideas')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.click(490, 260)
  await page.keyboard.type('Room to think')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await stroke(page, 490, 350)
  await expect(page.locator('.tl-shape')).toHaveCount(2)
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await nameBoard(page, 'Sketches')
  await page.keyboard.press('d')
  await stroke(page, 580, 360)
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await saved(page)
  // Simulate pre-upgrade raster caches in this isolated test database.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('folio-workspace-v1')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('boards', 'readwrite')
    const request = transaction.objectStore('boards').openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      const board = cursor.value
      delete board.previews
      board.thumbnail = 'data:image/png;base64,old-theme-preview'
      cursor.update(board)
      cursor.continue()
    }
    await new Promise<void>((resolve) => (transaction.oncomplete = () => resolve()))
    database.close()
  })
  await page.reload()
  await ready(page)
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  const images = page.locator('.board-thumbnail img')
  await expect(images).toHaveCount(2, { timeout: 15000 })
  const fits = await images.evaluateAll((elements) =>
    elements.every((element) => {
      const image = element.getBoundingClientRect()
      const card = element.closest('.board-preview')!.getBoundingClientRect()
      return (
        image.left >= card.left &&
        image.right <= card.right &&
        image.top >= card.top &&
        image.bottom <= card.bottom
      )
    }),
  )
  expect(fits).toBe(true)
  const backgrounds = () =>
    images.evaluateAll(async (elements) =>
      Promise.all(
        elements.map(async (element) => {
          const image = element as HTMLImageElement
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(image, 0, 0)
          return [...ctx.getImageData(0, 0, 1, 1).data]
        }),
      ),
    )
  await expect.poll(backgrounds).toEqual([
    [248, 249, 252, 255],
    [248, 249, 252, 255],
  ])
  await page.screenshot({ path: '.qa/library-light-v4.png', animations: 'disabled' })
  await appearance(page, 'Dark')
  await expect.poll(backgrounds).toEqual([
    [23, 25, 31, 255],
    [23, 25, 31, 255],
  ])
  await page.screenshot({ path: '.qa/library-dark-v4.png', animations: 'disabled' })
  await appearance(page, 'Light')
  await expect.poll(backgrounds).toEqual([
    [248, 249, 252, 255],
    [248, 249, 252, 255],
  ])
  expect(errors).toEqual([])
})

test('colour cycling stays on the visible swatches at desktop and phone widths', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    const swatches = page.locator('.dock-colour')
    await expect(swatches).toHaveCount(width === 390 ? 3 : 6)
    const names = await swatches.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label')),
    )
    await swatches.first().click()
    for (let i = 1; i <= names.length; i++) {
      await page.keyboard.press('d')
      await expect(page.locator('.dock-colour[aria-pressed="true"]')).toHaveAttribute(
        'aria-label',
        names[i % names.length]!,
      )
    }
    await page.keyboard.press('a')
    await expect(page.locator('.dock-colour[aria-pressed="true"]')).toHaveAttribute(
      'aria-label',
      names.at(-1)!,
    )
    await page.getByRole('button', { name: 'Ink controls', exact: true }).click()
    await page.getByRole('button', { name: 'Slate colour', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.keyboard.press('d')
    await expect(swatches.first()).toHaveAttribute('aria-pressed', 'true')
  }
})

test('text-size dropdown handles keyboard input without triggering canvas shortcuts', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await page.keyboard.press('4')
  const size = page.getByRole('combobox', { name: 'Text size', exact: true })
  await size.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'Medium', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('option', { name: 'Extra large', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(size).toContainText('Extra large')
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.tl-container')).toBeFocused()
  await size.click()
  await page.screenshot({ path: '.qa/text-menu-v4.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  const menu = page.getByRole('group', { name: 'Board actions' })
  await expect(menu.getByText('Rename board')).toHaveCount(0)
  await expect(menu.getByText('Toggle favourite')).toHaveCount(0)
  await expect(menu.getByText('Preferences')).toHaveCount(0)
})

test('upgrading the old Trash recovers entries without dropping their records', async ({
  page,
}) => {
  await page.route('**/seed-v1', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body>Test fixture</body></html>' }),
  )
  await page.goto('/seed-v1')
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('folio-workspace-v1', 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore('boards', { keyPath: 'id' })
        request.result
          .createObjectStore('records', { keyPath: ['boardId', 'id'] })
          .createIndex('board', 'boardId')
        request.result.createObjectStore('assets')
      }
      request.onsuccess = () => resolve(request.result)
    })
    const tx = database.transaction(['boards', 'records'], 'readwrite')
    tx.objectStore('boards').put({
      id: 'recovered',
      title: 'Previously trashed',
      collection: '',
      createdAt: 1,
      updatedAt: 1,
      revision: 0,
      favorite: false,
      deleted: true,
    })
    tx.objectStore('records').put({
      boardId: 'recovered',
      id: 'fixture:record',
      record: { test: 'preserve me' },
    })
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()))
    database.close()
  })
  await page.goto('/')
  await ready(page)
  await expect(page.locator('.board-title')).toHaveText('Previously trashed')
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await expect(page.locator('.board-card')).toHaveCount(1)
  const retained = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('folio-workspace-v1')
      request.onsuccess = () => resolve(request.result)
    })
    const request = database
      .transaction('records')
      .objectStore('records')
      .get(['recovered', 'fixture:record'])
    const value = await new Promise<any>(
      (resolve) => (request.onsuccess = () => resolve(request.result)),
    )
    database.close()
    return value
  })
  expect(retained.record.test).toBe('preserve me')
})
