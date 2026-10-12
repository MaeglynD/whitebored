import { test, expect } from '@playwright/test'
import { choose, menu } from './helpers'

test('drawing, standard shortcuts, rename, board switching, reload and portable export', async ({
  page,
}) => {
  const errors: string[] = []
  const serverConnections: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('websocket', (socket) => {
    // Vite's development hot-reload socket is unrelated to board storage.
    if (new URL(socket.url()).pathname !== '/') serverConnections.push(socket.url())
  })
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) serverConnections.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share board', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Untitled board', exact: true }).last(),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await page.mouse.move(550, 300)
  await page.mouse.down()
  await page.mouse.move(670, 420, { steps: 15 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+z')
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.getByRole('button', { name: 'Untitled board', exact: true }).last().click()
  await page.getByLabel('Board name').fill('Test sketch')
  await page.getByLabel('Collection').fill('Personal')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await page.getByRole('button', { name: 'Open Test sketch', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /Editable board/ }).click()
  const file = await downloaded
  expect(file.suggestedFilename()).toBe('Test sketch.canvas')
  const path = await file.path()
  expect(path).toBeTruthy()
  await page.locator('input[type=file]').setInputFiles(path!)
  await expect(page.getByText('Board imported as a new copy')).toBeVisible()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  expect(errors).toEqual([])
  expect(serverConnections).toEqual([])
})

test('favourites, duplicate, confirmed deletion and cancellation preserve the right boards', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Favourite board', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Favourite board', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await choose(page, 'Show boards', 'Favourites')
  await expect(page.locator('.board-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Duplicate Untitled board' }).click()
  await page.locator('.board-title').click()
  await page.getByLabel('Board name').fill('Disposable test copy')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await choose(page, 'Show boards', 'All boards')
  await menu(page, 'Delete board')
  const dialog = page.getByRole('dialog', { name: 'Delete board?' })
  await expect(dialog).toContainText('Disposable test copy')
  await expect(dialog).toContainText('cannot be undone')
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
  await page.screenshot({ path: '.qa/delete-dialog-v4.png', animations: 'disabled' })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('.board-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Delete Disposable test copy', exact: true }).click()
  await dialog.getByRole('button', { name: 'Delete board', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.board-card')).toHaveCount(1)
  await expect(page.locator('.board-title')).toContainText('Untitled board')
  await page.reload()
  await expect(page.locator('.board-card')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Show boards' }).click()
  await expect(page.getByRole('option', { name: 'Trash', exact: true })).toHaveCount(0)
})

test('small-screen navigation fits and remains operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Boards', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close board library' }).click()
  await page.getByRole('button', { name: 'Ink controls', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Ink settings' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const dock = (await page.locator('.drawing-dock').boundingBox())!
  const board = (await page.locator('.board-controls').boundingBox())!
  const zoom = (await page.locator('.view-controls').boundingBox())!
  expect(dock.x).toBeGreaterThanOrEqual(0)
  expect(dock.x + dock.width).toBeLessThanOrEqual(390)
  expect(board.x + board.width).toBeLessThan(zoom.x)
  await page.screenshot({ path: '.qa/mobile-v4.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.mouse.move(100, 200)
  await page.mouse.down()
  await page.mouse.move(220, 260, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.setViewportSize({ width: 320, height: 740 })
  const narrowBoard = (await page.locator('.board-controls').boundingBox())!
  const narrowView = (await page.locator('.view-controls').boundingBox())!
  expect(narrowBoard.x + narrowBoard.width).toBeLessThan(narrowView.x)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('sidebar stays open across board switches and reload while drawing remains available', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Untitled board', exact: true }).click()
  await page.getByLabel('Board name').fill('Alpha')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await page.getByRole('button', { name: 'Untitled board', exact: true }).click()
  await page.getByLabel('Board name').fill('Beta')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  const sidebar = page.getByRole('complementary', { name: 'Board library' })
  await expect(sidebar).toBeVisible()
  await page.getByRole('button', { name: 'Open Alpha', exact: true }).click()
  await expect(sidebar).toBeVisible()
  await page.keyboard.press('2')
  await page.mouse.move(650, 350)
  await page.mouse.down()
  await page.mouse.move(800, 430, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.getByRole('button', { name: 'Open Beta', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Open Alpha', exact: true }).locator('img'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open Alpha', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.reload()
  await expect(sidebar).toBeVisible()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.screenshot({ path: '.qa/sidebar-v4.png', animations: 'disabled' })
})
