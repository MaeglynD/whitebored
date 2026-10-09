import { test, expect } from '@playwright/test'
import { backup, choose, ready, saved, stroke } from './helpers'

test('Space pans after using controls and returns to drawing on release', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await stroke(page)
  const shape = page.locator('.tl-shape').first()
  await expect(shape).toBeVisible()
  for (const control of ['Pen', 'Zoom in', 'Ink controls']) {
    await page.getByRole('button', { name: control, exact: true }).click()
    if (control === 'Zoom in')
      await expect(page.getByRole('button', { name: 'Zoom options' })).toContainText('125%')
    await expect(page.locator('.tl-container')).toBeFocused()
    const start = (await shape.boundingBox())!
    await page.keyboard.down('Space')
    await page.mouse.move(1100, 400)
    await page.mouse.down()
    await page.mouse.move(1180, 450, { steps: 12 })
    await page.mouse.up()
    await page.keyboard.up('Space')
    await expect(page.locator('.tl-shape')).toHaveCount(1)
    await expect.poll(async () => Math.round((await shape.boundingBox())!.x - start.x)).toBe(80)
    await expect.poll(async () => Math.round((await shape.boundingBox())!.y - start.y)).toBe(50)
  }
  await stroke(page, 700, 600)
  await expect(page.locator('.tl-shape')).toHaveCount(2)
})

test('zoom shortcuts, middle-drag, wheel pan and Ctrl-wheel work without changing ink', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await stroke(page)
  const zoom = page.getByRole('button', { name: 'Zoom options' })
  for (const key of ['e', '=', 'Control+=', 'Shift+=']) {
    const parts = key.split('+')
    for (const part of parts) await page.keyboard.down(part)
    await expect.poll(async () => parseInt(await zoom.innerText())).toBeGreaterThan(125)
    for (const part of parts.reverse()) await page.keyboard.up(part)
    await page.keyboard.press('r')
    await expect(zoom).toContainText('100%')
  }
  await page.keyboard.down('q')
  await expect.poll(async () => parseInt(await zoom.innerText())).toBeLessThan(80)
  await page.keyboard.up('q')
  await page.keyboard.press('r')
  await expect(zoom).toContainText('100%')
  const shape = page.locator('.tl-shape').first()
  let before = (await shape.boundingBox())!
  await page.mouse.move(900, 600)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(1000, 650, { steps: 12 })
  await page.mouse.up({ button: 'middle' })
  await expect.poll(async () => Math.round((await shape.boundingBox())!.x - before.x)).toBe(100)
  before = (await shape.boundingBox())!
  await page.mouse.wheel(0, 150)
  await expect.poll(async () => Math.round((await shape.boundingBox())!.y - before.y)).toBe(-150)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -150)
  await page.keyboard.up('Control')
  await expect(zoom).not.toContainText('100%')
  await expect(page.locator('.tl-shape')).toHaveCount(1)
})

test('colour, width and opacity shortcuts change real strokes and selected ink', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await page.keyboard.press('.')
  await page.keyboard.press(']')
  await page.keyboard.press('Shift+[')
  await expect(page.getByRole('button', { name: 'Stroke width', exact: true })).toContainText('2')
  await expect(page.locator('.dock-opacity output')).toContainText('90')
  await stroke(page)
  const first = (await backup(page)).data.document.records.find((r: any) => r.type === 'draw')
  expect(first.props.color).toBe('red')
  expect(first.opacity).toBe(0.9)
  expect(first.meta.folioWidth).toBe(2)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('.')
  await page.keyboard.press(']')
  await page.keyboard.press('Shift+]')
  const edited = (await backup(page)).data.document.records.find((r: any) => r.type === 'draw')
  expect(edited.props.color).toBe('orange')
  expect(edited.opacity).toBe(1)
  expect(edited.meta.folioWidth).toBe(3)
  await page.keyboard.press('Escape')
  await page.reload()
  await ready(page)
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await stroke(page, 800, 500)
  const records = (await backup(page)).data.document.records.filter((r: any) => r.type === 'draw')
  expect(records).toHaveLength(2)
  expect(
    records.every(
      (r: any) => r.props.color === 'orange' && r.meta.folioWidth === 3 && r.opacity === 1,
    ),
  ).toBe(true)
})

test('editing selected opacity preserves the next pen colour across reloads', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.keyboard.press('.')
  await stroke(page)
  await page.keyboard.press('.')
  await stroke(page, 800, 350)
  await page.keyboard.press('v')
  await page.mouse.click(575, 390)
  await page.keyboard.press('Shift+[')
  await page.keyboard.press('Escape')
  await page.keyboard.press('p')
  await stroke(page, 500, 550)
  await saved(page)
  await page.reload()
  await ready(page)
  await stroke(page, 800, 550)
  const shapes = (await backup(page)).data.document.records
    .filter((r: any) => r.type === 'draw')
    .sort((a: any, b: any) => a.y - b.y || a.x - b.x)
  expect(shapes).toHaveLength(4)
  expect(shapes.map((s: any) => [s.props.color, s.opacity])).toEqual([
    ['red', 0.9],
    ['orange', 1],
    ['orange', 0.9],
    ['orange', 0.9],
  ])
  for (let i = 0; i < 6; i++) await page.keyboard.press('[')
  await expect(page.getByRole('button', { name: 'Stroke width', exact: true })).toContainText(
    '0.25',
  )
  await page.keyboard.press(']')
  await expect(page.getByRole('button', { name: 'Stroke width', exact: true })).toContainText('0.5')
})

test('bindings are editable, reject conflicts, persist, and replace old actions', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click()
  await page.getByRole('button', { name: 'Change pen shortcut 1', exact: true }).click()
  await page.keyboard.press('e')
  await expect(page.getByRole('alert')).toContainText('Already assigned to zoom in')
  await page.keyboard.press('j')
  await expect(page.getByRole('button', { name: 'Change pen shortcut 1', exact: true })).toHaveText(
    'J',
  )
  await page
    .getByRole('button', { name: 'Change pan · hold and drag shortcut 1', exact: true })
    .click()
  await page.keyboard.press('u')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.keyboard.press('h')
  await page.keyboard.press('2')
  await expect(page.getByRole('button', { name: 'Hand', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('j')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await stroke(page)
  const shape = page.locator('.tl-shape').first()
  const before = (await shape.boundingBox())!
  await page.keyboard.down('u')
  await page.mouse.move(900, 600)
  await page.mouse.down()
  await page.mouse.move(980, 650, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up('u')
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await expect.poll(async () => Math.round((await shape.boundingBox())!.x - before.x)).toBe(80)
  await saved(page)
  await page.reload()
  await ready(page)
  await page.keyboard.press('h')
  await page.keyboard.press('j')
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
    'title',
    'Pen · J',
  )
})

test('typing in canvas text and dialogs never triggers drawing shortcuts', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.keyboard.press('t')
  await page.mouse.click(500, 300)
  await page.keyboard.type('p e b t h , . [ ] a note with spaces')
  await page.keyboard.press('Escape')
  const data = (await backup(page)).data
  const text = data.document.records.find((r: any) => r.type === 'text')
  expect(JSON.stringify(text.props.richText)).toContain('p e b t h , . [ ] a note with spaces')
  expect(data.document.records.filter((r: any) => r.typeName === 'shape')).toHaveLength(1)
  await page.getByRole('button', { name: 'Untitled board', exact: true }).click()
  await page.getByLabel('Board name').fill('P E H T and spaces')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'P E H T and spaces', exact: true })).toBeVisible()
  await page.keyboard.press('p')
  await stroke(page, 800, 500)
  await expect(page.locator('.tl-shape')).toHaveCount(2)
})

test('selection, duplicate, undo, redo, erase, and focus mode remain usable', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await stroke(page)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+d')
  await expect(page.locator('.tl-shape')).toHaveCount(2)
  await page.keyboard.press('Delete')
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(page.locator('.tl-shape')).toHaveCount(2)
  await page.keyboard.press('Control+y')
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.keyboard.press('Control+.')
  await expect(page.getByRole('button', { name: 'Show controls' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Boards', exact: true })).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Boards', exact: true })).toBeVisible()
  await page.keyboard.press('3')
  await page.mouse.move(570, 385)
  await page.mouse.down()
  await page.mouse.move(580, 405, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
})

test('preferences, sliders, zoom presets and dialog focus survive everyday use', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await choose(page, 'Appearance', 'Dark')
  await choose(page, 'Mouse wheel', 'Zoom')
  await page.getByRole('switch', { name: 'Dot grid' }).check()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Ink controls', exact: true }).click()
  await page
    .getByRole('group', { name: 'Ink settings' })
    .getByRole('button', { name: 'Blue colour', exact: true })
    .click()
  await page.getByRole('slider', { name: 'Opacity slider' }).focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('slider', { name: 'Opacity slider' })).toHaveValue('30')
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await stroke(page)
  await page.getByRole('button', { name: 'Zoom options' }).click()
  await page.getByRole('button', { name: '200%', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Zoom options' })).toContainText('200%')
  await page.mouse.move(800, 450)
  await page.mouse.wheel(0, 100)
  await expect(page.getByRole('button', { name: 'Zoom options' })).not.toContainText('200%')
  await page.keyboard.press('Control+s')
  await saved(page)
  await page.reload()
  await ready(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const shapes = (await backup(page)).data.document.records.filter((r: any) => r.type === 'draw')
  expect(shapes).toHaveLength(1)
  expect(shapes[0].props.color).toBe('blue')
  expect(shapes[0].opacity).toBe(0.3)
  await page.screenshot({ path: '.qa/dark-v4.png', animations: 'disabled' })
})

test('number keys follow dock order and visible ink controls edit the next stroke', async ({
  page,
}) => {
  await page.goto('/')
  await ready(page)
  for (const [index, tool] of ['Select', 'Pen', 'Eraser', 'Text', 'Hand'].entries()) {
    await page.keyboard.press(String(index + 1))
    await expect(page.getByRole('button', { name: tool, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  }
  await expect(page.locator('.tool-key')).toHaveCount(0)
  await expect(
    page.locator('.view-controls').getByRole('button', { name: 'Undo', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('6')
  await expect(page.getByRole('group', { name: 'Ink settings' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Coral colour', exact: true }).click()
  await page.getByRole('button', { name: 'Thicker stroke', exact: true }).click()
  await page.getByRole('slider', { name: 'Ink opacity', exact: true }).focus()
  await page.keyboard.press('Home')
  for (let n = 0; n < 3; n++) await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await stroke(page)
  const shape = (await backup(page)).data.document.records.find((r: any) => r.type === 'draw')
  expect(shape.props.color).toBe('red')
  expect(shape.meta.folioWidth).toBe(2)
  expect(shape.opacity).toBe(0.4)
})

test('zoom tuning persists and held zoom stays anchored under the pointer', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByRole('slider', { name: 'Zoom speed', exact: true }).focus()
  await page.keyboard.press('Home')
  for (let n = 0; n < 8; n++) await page.keyboard.press('ArrowRight')
  await page.getByRole('slider', { name: 'Zoom easing', exact: true }).focus()
  await page.keyboard.press('Home')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page.reload()
  await ready(page)
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Zoom speed', exact: true })).toHaveValue('2')
  await expect(page.getByRole('slider', { name: 'Zoom easing', exact: true })).toHaveValue('0')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await stroke(page)
  const shape = page.locator('.tl-shape').first()
  const before = (await shape.boundingBox())!
  await page.mouse.move(700, 400)
  await page.keyboard.down('e')
  // Measure a continuous hold without synthesising keyboard autorepeat.
  await page.waitForTimeout(350)
  await page.keyboard.up('e')
  const z = parseInt(await page.getByRole('button', { name: 'Zoom options' }).innerText())
  expect(z).toBeGreaterThan(118)
  expect(z).toBeLessThan(145)
  const after = (await shape.boundingBox())!
  const ratio = after.width / before.width
  expect(after.x).toBeCloseTo(700 + (before.x - 700) * ratio, 0)
  expect(after.y).toBeCloseTo(400 + (before.y - 400) * ratio, 0)
  await expect(page.locator('.tl-shape')).toHaveCount(1)
})
