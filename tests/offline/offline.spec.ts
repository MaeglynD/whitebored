import { test, expect } from '@playwright/test'
test('installed web bundle works offline after caching, including fonts and a new drawing', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await page.screenshot({ path: '.qa/editor-v3.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await expect(page.locator('.board-card')).toHaveCount(1)
  await page.screenshot({ path: '.qa/library-v3.png', animations: 'disabled' })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await page.mouse.move(500, 350)
  await page.mouse.down()
  await page.mouse.move(800, 420, { steps: 20 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await expect(page.getByRole('status', { name: 'Saved on device' })).toBeVisible()
  await page.reload()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
})
