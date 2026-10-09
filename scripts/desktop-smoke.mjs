import { _electron as electron, expect } from '@playwright/test'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
await mkdir('.qa', { recursive: true })
const data = await mkdtemp(resolve('.qa/desktop-profile-'))
const executablePath = resolve(process.argv[2] || 'release/preview/win-unpacked/Whitebored.exe')
const launch = () =>
  electron.launch({
    executablePath,
    env: { ...process.env, WHITEBORED_TEST_DATA: data },
    timeout: 30000,
  })
let app = await launch()
try {
  // A native window must be visible for Chromium to deliver drawing frames.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  let page = await app.firstWindow()
  await page.getByRole('button', { name: 'Pen', exact: true }).waitFor()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const security = await app.evaluate(({ BrowserWindow }) => {
    const prefs = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
    return {
      sandbox: prefs.sandbox,
      contextIsolation: prefs.contextIsolation,
      nodeIntegration: prefs.nodeIntegration,
    }
  })
  if (!security.sandbox || !security.contextIsolation || security.nodeIntegration)
    throw new Error('Unexpected renderer security settings')
  await page.getByRole('button', { name: 'New board', exact: true }).click()
  await expect(page.locator('.tl-shape')).toHaveCount(0)
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  await page.mouse.move(500, 350)
  await page.mouse.down()
  await page.mouse.move(700, 500, { steps: 20 })
  await page.mouse.up()
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await page.getByRole('button', { name: 'Pen', exact: true }).click()
  const beforePan = await page.locator('.tl-shape').first().boundingBox()
  await page.keyboard.down('Space')
  await page.mouse.move(900, 400)
  await page.mouse.down()
  await page.mouse.move(1000, 450, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up('Space')
  await expect(page.locator('.tl-shape')).toHaveCount(1)
  await expect
    .poll(async () =>
      Math.round((await page.locator('.tl-shape').first().boundingBox()).x - beforePan.x),
    )
    .toBe(100)
  await page.keyboard.down('e')
  await expect
    .poll(async () =>
      parseInt(await page.getByRole('button', { name: 'Zoom options' }).innerText()),
    )
    .toBeGreaterThan(125)
  await page.keyboard.up('e')
  await page.keyboard.press('r')
  await expect(page.getByRole('button', { name: 'Zoom options' })).toContainText('100%')
  await page.getByRole('button', { name: 'Text', exact: true }).click()
  await page.mouse.click(420, 250)
  // Let tldraw's scheduled initial rich-text focus complete before typing.
  await page.waitForTimeout(150)
  await expect(page.locator('[contenteditable=true]')).toBeFocused()
  await page.keyboard.type('Desktop text wrapping stays editable.')
  await page.getByRole('spinbutton', { name: 'Text width' }).fill('180')
  await page.getByRole('spinbutton', { name: 'Text width' }).press('Enter')
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Wrap text', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Board menu', exact: true }).click()
  await page.getByRole('button', { name: 'Dark mode', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Control+s')
  await page.getByRole('status', { name: 'Saved on device' }).waitFor()
  await app.close()
  app = await launch()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive())
  page = await app.firstWindow()
  await page.getByRole('button', { name: 'Pen', exact: true }).waitFor()
  await expect(page.locator('.tl-shape')).toHaveCount(2)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Select', exact: true }).click()
  await page.mouse.click(470, 270)
  await expect(page.getByRole('spinbutton', { name: 'Text width' })).toHaveValue('180')
  await page.screenshot({ path: '.qa/desktop.png' })
  if (errors.length) throw new Error(errors.join('\n'))
  await writeFile(
    '.qa/desktop-result.json',
    JSON.stringify(
      {
        platform: process.platform,
        passed: true,
        checks: [
          'packaged launch',
          'secure origin',
          'sandbox and context isolation',
          'drawing',
          'Space-drag after clicking Pen',
          'continuous E zoom and R reset',
          'text wrapping and exact width',
          'theme toggle and persistence',
          'autosave',
          'restart persistence',
        ],
        security,
      },
      null,
      2,
    ),
  )
  console.log(
    'Desktop smoke passed: packaged launch, sandbox, drawing, autosave, restart persistence.',
  )
} finally {
  await app.close()
}
