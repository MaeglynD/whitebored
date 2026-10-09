import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { backup, choose, menu, ready, saved, stroke } from './helpers'

const file = (name: string, data: unknown) => ({
  name,
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(data)),
})
const textShape = (data: any) =>
  data.document.records.find((r: any) => r.typeName === 'shape' && r.type === 'text')
async function text(page: Page, value: string) {
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.click(503, 347)
  // tldraw schedules initial rich-text focus after 100 ms.
  await page.waitForTimeout(150)
  await page.keyboard.type(value)
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible()
}
async function allBoards(page: Page) {
  if (!(await page.locator('.board-sidebar').isVisible()))
    await page.getByRole('button', { name: 'Boards', exact: true }).click()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all boards', exact: true }).click()
  const output = await downloaded
  return JSON.parse(await readFile((await output.path())!, 'utf8'))
}

test('text wraps through side handles while editing, numeric width, undo and reload', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await ready(page)
  await text(page, 'A little room to think and write.')
  const before = (await page.locator('.tl-shape').boundingBox())!
  const handle = page.getByRole('button', { name: 'Resize text width from right' })
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 130, box.y + box.height / 2, { steps: 15 })
  await page.mouse.up()
  const resized = (await page.locator('.tl-shape').boundingBox())!
  expect(resized.width).toBeLessThan(before.width - 100)
  expect(resized.height).toBeGreaterThan(before.height)
  expect(Math.abs(resized.x - before.x)).toBeLessThan(1)
  await expect(page.getByRole('button', { name: 'Wrap text', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => (await page.locator('.tl-shape').boundingBox())!.width)
    .toBeCloseTo(before.width, 0)
  await page.keyboard.press('Control+Shift+z')
  await page.getByRole('spinbutton', { name: 'Text width' }).fill('180')
  await page.getByRole('spinbutton', { name: 'Text width' }).press('Enter')
  await expect(page.getByRole('spinbutton', { name: 'Text width' })).toHaveValue('180')
  await page.getByRole('button', { name: 'Edit text', exact: true }).click()
  await expect(page.locator('[contenteditable=true]')).toBeFocused()
  await page.waitForTimeout(150)
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' More notes.')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const { data } = await backup(page)
  const shape = textShape(data)
  expect(shape.props).toMatchObject({ w: 180, autoSize: false, scale: 1, size: 'm' })
  expect(JSON.stringify(shape.props.richText)).toContain(
    'A little room to think and write. More notes.',
  )
  await expect(page.locator('.toast')).toBeHidden()
  await page.screenshot({ path: '.qa/text-wrap-light-v5.png', animations: 'disabled' })
  await menu(page, 'Dark mode')
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await expect(page.locator('.board-thumbnail img')).toBeVisible()
  await page.screenshot({ path: '.qa/text-wrap-dark-v5.png', animations: 'disabled' })
  await page.reload()
  await ready(page)
  expect(textShape((await backup(page)).data).props.w).toBe(180)
  expect(errors).toEqual([])
})

test('text tool can drag out a fixed width box and left handles preserve the right edge', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.move(500, 340)
  await page.mouse.down()
  await page.waitForTimeout(160) // The editor distinguishes a deliberate text-box drag from a click.
  await page.mouse.move(760, 340, { steps: 20 })
  await page.mouse.up()
  await page.keyboard.type('A text box with a chosen wrapping width.')
  await expect(page.getByRole('button', { name: 'Wrap text', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const before = (await page.locator('.tl-shape').boundingBox())!
  const handle = (await page
    .getByRole('button', { name: 'Resize text width from left' })
    .boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 55, handle.y + handle.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  const after = (await page.locator('.tl-shape').boundingBox())!
  expect(Math.abs(after.x + after.width - before.x - before.width)).toBeLessThan(1)
  expect(after.width).toBeLessThan(before.width - 40)
  await page.getByRole('button', { name: 'Wrap text', exact: true }).click()
  expect(textShape((await backup(page)).data).props.autoSize).toBe(true)
})

test('grid and snapping are independent, theme persists, sidebar text stays unselectable', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await menu(page, 'Toggle grid')
  await expect(page.locator('.tl-grid')).toBeVisible()
  await text(page, 'Free placement')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  let shape = textShape((await backup(page)).data)
  expect(shape.x).toBe(503)
  await menu(page, 'Snapping')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.click(703, 457)
  await page.keyboard.type('Snapped placement')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const shapes = (await backup(page)).data.document.records.filter((r: any) => r.type === 'text')
  shape = shapes.find((r: any) => r.x !== 503)
  expect(shape.x % 10).toBe(0)
  await menu(page, 'Dark mode')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await ready(page)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Snapping', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  expect(
    await page.locator('.board-sidebar').evaluate((el) => getComputedStyle(el).userSelect),
  ).toBe('none')
  expect(
    await page
      .getByRole('textbox', { name: 'Search boards' })
      .evaluate((el) => getComputedStyle(el).userSelect),
  ).toBe('text')
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await stroke(page, 750, 650)
  await expect(page.locator('.save-dot')).toHaveCount(0)
  await saved(page)
})

test('imports multiple files and libraries atomically, exports every board with metadata and media', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await stroke(page)
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add image or video', exact: true }).click()
  await (await chooser).setFiles('public/icon-192.png')
  await expect(page.locator('.tl-image')).toBeVisible()
  await saved(page)
  const { data } = await backup(page)
  const alpha = {
    ...data,
    title: 'Alpha',
    collection: 'Research',
    favorite: true,
    createdAt: 1000,
    updatedAt: 2000,
  }
  const beta = {
    ...data,
    title: 'Beta',
    collection: 'Research',
    favorite: false,
    createdAt: 3000,
    updatedAt: 4000,
  }
  const bundled = { format: 'folio-library', version: 1, boards: [alpha, beta] }
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([
      file('library.canvas', bundled),
      file('Single.canvas', { ...data, title: 'Single' }),
    ])
  await expect(page.getByText('3 boards imported as new copies')).toBeVisible()
  await expect(page.locator('.board-card')).toHaveCount(4)
  const exported = await allBoards(page)
  expect(exported.format).toBe('folio-library')
  expect(exported.boards).toHaveLength(4)
  expect(exported.boards.find((b: any) => b.title === 'Alpha')).toMatchObject({
    collection: 'Research',
    favorite: true,
    createdAt: 1000,
    updatedAt: 2000,
  })
  for (const board of exported.boards)
    expect(board.document.records.find((r: any) => r.typeName === 'asset').props.src).toMatch(
      /^data:image\/png/,
    )
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles([file('valid.canvas', alpha), file('broken.canvas', { nonsense: true })])
  await expect(page.getByRole('alert')).toContainText('No boards were imported')
  await expect(page.locator('.board-card')).toHaveCount(4)
  await page.locator('input[type=file]').first().setInputFiles(file('roundtrip.canvas', exported))
  await expect(page.getByText('4 boards imported as new copies')).toBeVisible()
  await expect(page.locator('.board-card')).toHaveCount(8)
  await page.reload()
  await expect(page.locator('.board-card')).toHaveCount(8)
  await expect(page.locator('.tl-image')).toBeVisible()
  expect(
    await page
      .locator('.tl-image')
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true)
})

test('one-board libraries and empty boards round-trip', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const exported = await allBoards(page)
  expect(exported.boards).toHaveLength(1)
  await page.locator('input[type=file]').first().setInputFiles(file('one.canvas', exported))
  await expect(page.getByText('Board imported as a new copy')).toBeVisible()
  await expect(page.locator('.board-card')).toHaveCount(2)
  await expect(page.locator('.tl-shape')).toHaveCount(0)
})

test('text controls preserve typing focus and fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.click(100, 250)
  await page.keyboard.type('Small screen')
  await choose(page, 'Text font', 'Serif')
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' notes')
  await page.getByRole('spinbutton', { name: 'Text width' }).fill('160')
  await page.getByRole('spinbutton', { name: 'Text width' }).press('Enter')
  await page.keyboard.type(' here')
  const controls = (await page.getByRole('group', { name: 'Text formatting' }).boundingBox())!
  expect(controls.x).toBeGreaterThanOrEqual(0)
  expect(controls.x + controls.width).toBeLessThanOrEqual(390)
  const dock = (await page.getByRole('toolbar', { name: 'Drawing tools' }).boundingBox())!
  expect(controls.y + controls.height).toBeLessThanOrEqual(dock.y)
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Text width' }).fill('250')
  await page.getByRole('spinbutton', { name: 'Text width' }).press('Escape')
  await expect(page.getByRole('spinbutton', { name: 'Text width' })).toHaveValue('160')
  const shape = textShape((await backup(page)).data)
  expect(shape.props).toMatchObject({ font: 'serif', w: 160, autoSize: false })
  expect(JSON.stringify(shape.props.richText)).toContain('Small screen notes here')
  await page.screenshot({ path: '.qa/text-mobile-v5.png', animations: 'disabled' })
  await page.setViewportSize({ width: 320, height: 720 })
  const narrow = (await page.getByRole('group', { name: 'Text formatting' }).boundingBox())!
  expect(narrow.x).toBeGreaterThanOrEqual(0)
  expect(narrow.x + narrow.width).toBeLessThanOrEqual(320)
  for (const control of await page
    .getByRole('group', { name: 'Text formatting' })
    .locator('button,input')
    .all()) {
    const bounds = await control.boundingBox()
    if (bounds) expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  }
})

test('text formatting restores a caret and selection in the middle of a sentence', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await text(page, 'Alpha Beta')
  await page.keyboard.press('Control+Home')
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight')
  await page.getByRole('spinbutton', { name: 'Text width' }).fill('300')
  await page.getByRole('spinbutton', { name: 'Text width' }).press('Enter')
  await page.keyboard.type('calm ')
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowRight')
  await choose(page, 'Text font', 'Mono')
  await page.keyboard.type('Gamma')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const shape = textShape((await backup(page)).data)
  expect(JSON.stringify(shape.props.richText)).toContain('Alpha calm Gamma')
})

test('wrapping handles respect rotated and scaled text', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await text(page, 'A rotated text box with a fixed width.')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  const { data } = await backup(page)
  const shape = textShape(data)
  Object.assign(shape, { x: 400, y: 250, rotation: 0.4 })
  Object.assign(shape.props, { w: 240, scale: 1.5, autoSize: false })
  await page.locator('input[type=file]').first().setInputFiles(file('rotated.canvas', data))
  await expect(page.getByText('Board imported as a new copy')).toBeVisible()
  await page.keyboard.press('1')
  await page.keyboard.press('Control+a')
  const handle = (await page
    .getByRole('button', { name: 'Resize text width from right' })
    .boundingBox())!
  const x = handle.x + handle.width / 2,
    y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 120 * Math.cos(0.4), y + 120 * Math.sin(0.4), { steps: 20 })
  await page.mouse.up()
  const result = textShape((await backup(page)).data)
  expect(result.props.w).toBeCloseTo(320, 0)
  expect(result.props.scale).toBe(1.5)
  expect(result.rotation).toBe(0.4)
  expect(result.x).toBe(400)
  expect(result.y).toBe(250)
})
