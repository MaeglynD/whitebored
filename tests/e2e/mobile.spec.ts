import { test, expect } from '@playwright/test'
import { ready, choose } from './helpers'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test('phone toolbar stays on one line and settings move into the board menu', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  for (const width of [320, 360, 390, 430, 760]) {
    await page.setViewportSize({ width, height: 844 })
    const dock = page.getByRole('toolbar', { name: 'Drawing tools' })
    const box = (await dock.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(60)
    expect(box.x).toBeGreaterThanOrEqual(8)
    expect(box.x + box.width).toBeLessThanOrEqual(width - 8)
    expect(box.y + box.height).toBeGreaterThanOrEqual(824)
    const buttons = await dock.locator('button:visible').evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect()
        return { x: rect.x, right: rect.right, center: rect.y + rect.height / 2 }
      }),
    )
    expect(
      Math.max(...buttons.map((b) => b.center)) - Math.min(...buttons.map((b) => b.center)),
    ).toBeLessThan(2)
    expect(Math.max(...buttons.map((b) => b.right))).toBeLessThanOrEqual(box.x + box.width)
    await expect(page.locator('.workspace-actions')).toBeHidden()
    const board = (await page.locator('.board-controls').boundingBox())!
    const view = (await page.locator('.view-controls').boundingBox())!
    expect(board.x + board.width).toBeLessThan(view.x)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ink controls', exact: true }).tap()
  const ink = page.getByRole('group', { name: 'Ink settings' })
  await expect(ink.getByRole('slider', { name: 'Stroke width slider' })).toBeVisible()
  await expect(ink.getByRole('slider', { name: 'Opacity slider' })).toBeVisible()
  await ink.getByRole('button', { name: 'Coral colour', exact: true }).tap()
  await expect(ink.getByRole('button', { name: 'Coral colour', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Ink controls', exact: true }).tap()
  await page.screenshot({ path: '.qa/mobile-canvas-after.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Board menu', exact: true }).tap()
  await page.getByRole('button', { name: 'Preferences', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Preferences', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close dialog' }).tap()
  await page.getByRole('button', { name: 'Board menu', exact: true }).tap()
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).tap()
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true })).toBeVisible()
})

test('mobile board sheet supports searching, filtering and switching without covering the next board', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await ready(page)
  await page.locator('.board-title').tap()
  await page.getByLabel('Board name').fill('First sketch')
  await page.getByRole('button', { name: 'Save changes' }).tap()
  await page.getByRole('button', { name: 'Favourite board', exact: true }).tap()
  await page.getByRole('button', { name: 'Boards', exact: true }).tap()
  const sheet = page.getByRole('dialog', { name: 'Boards', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Boards' })).toBeFocused()
  await expect(sheet.getByRole('textbox', { name: 'Search boards' })).not.toBeFocused()
  await sheet.getByRole('button', { name: 'New board in library' }).tap()
  await expect(sheet).toBeHidden()
  await expect(page.locator('.board-title')).toHaveText('Untitled board')
  await page.getByRole('button', { name: 'Boards', exact: true }).tap()
  await expect(sheet.locator('.board-card')).toHaveCount(2)
  await sheet.getByRole('textbox', { name: 'Search boards' }).fill('First')
  await expect(sheet.locator('.board-card')).toHaveCount(1)
  await sheet.getByRole('textbox', { name: 'Search boards' }).fill('')
  await choose(page, 'Show boards', 'Favourites')
  await expect(sheet.locator('.board-card')).toHaveCount(1)
  await choose(page, 'Show boards', 'All boards')
  await choose(page, 'Sort boards', 'Newest created')
  await expect(sheet.locator('.card-title').first()).toHaveText('Untitled board')
  await sheet.getByRole('button', { name: 'Open First sketch', exact: true }).tap()
  await expect(sheet).toBeHidden()
  await expect(page.locator('.board-title')).toHaveText('First sketch')
  await page.getByRole('button', { name: 'Boards', exact: true }).tap()
  await page.screenshot({ path: '.qa/mobile-library-after.png', animations: 'disabled' })
  // The modal traps keyboard focus and suppresses drawing shortcuts behind it.
  await page.keyboard.press('Tab')
  expect(await sheet.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'Boards', exact: true }).tap()
  await page.touchscreen.tap(190, 30)
  await expect(sheet).toBeHidden()
  await page.getByRole('button', { name: 'Boards', exact: true }).tap()
  await sheet.getByRole('button', { name: 'Delete Untitled board', exact: true }).tap()
  const confirmation = page.getByRole('dialog', { name: 'Delete board?', exact: true })
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).tap()
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('heading', { name: 'Boards' })).toBeFocused()
  await sheet.getByRole('button', { name: 'Delete Untitled board', exact: true }).tap()
  await confirmation.getByRole('button', { name: 'Delete board', exact: true }).tap()
  await expect(sheet.locator('.board-card')).toHaveCount(1)
  await page.reload()
  await ready(page)
  await expect(sheet).toBeHidden()
  expect(errors).toEqual([])
})

test('short landscape screens keep the menus and library scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  await ready(page)
  await expect(page.locator('.workspace-actions')).toBeHidden()
  await page.getByRole('button', { name: 'Board menu', exact: true }).tap()
  const menu = page.getByRole('group', { name: 'Board actions' })
  const box = (await menu.boundingBox())!
  expect(box.y + box.height).toBeLessThan(390)
  await menu.getByRole('button', { name: 'Preferences', exact: true }).tap()
  await page.getByRole('button', { name: 'Close dialog' }).tap()
  await page.getByRole('button', { name: 'Boards', exact: true }).tap()
  const sheet = page.getByRole('dialog', { name: 'Boards', exact: true })
  // Measure the resting sheet rather than a frame of its slide-in animation.
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox()
      return box ? box.y + box.height : Infinity
    })
    .toBeLessThanOrEqual(390)
  const sheetBox = (await sheet.boundingBox())!
  expect(sheetBox.y).toBeGreaterThanOrEqual(0)
  expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(390)
  await expect(sheet.getByRole('button', { name: 'Export all boards' })).toBeInViewport()
  await sheet.getByRole('button', { name: 'Open Untitled board', exact: true }).tap()
  await expect(sheet).toBeHidden()
})
