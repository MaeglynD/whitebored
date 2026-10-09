import { expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
export async function stroke(page: Page, x = 500, y = 350) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 150, y + 80, { steps: 12 })
  await page.mouse.up()
}
export async function menu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page
    .getByRole('group', { name: 'Board actions' })
    .getByRole('button', { name: item, exact: true })
    .click()
}
export async function backup(page: Page) {
  await menu(page, 'Export')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: /Editable board/ }).click()
  const file = await downloaded
  return { file, data: JSON.parse(await readFile((await file.path())!, 'utf8')) }
}
export async function saved(page: Page) {
  await expect(page.getByRole('status', { name: 'Saved on device' })).toBeVisible()
}
export async function ready(page: Page) {
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toBeVisible()
  await saved(page)
}
export async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
