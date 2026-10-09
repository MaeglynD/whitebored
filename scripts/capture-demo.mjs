import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
const origin = process.env.WHITEBORED_DEMO_ORIGIN || 'http://127.0.0.1:5173'
await mkdir('.qa/demo-video', { recursive: true })
await mkdir('docs/media', { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  recordVideo: { dir: '.qa/demo-video', size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
const videoStart = Date.now()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
// A fresh Playwright context has no access to the user's browser profile or boards.
await page.route(`${origin}/__whitebored_docs_seed__`, (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head></head><body></body></html>',
  }),
)
await page.goto(`${origin}/__whitebored_docs_seed__`)
await page.evaluate(async () => {
  const { seedDemo } = await import('/scripts/demo-scene.ts')
  await seedDemo()
})
await page.goto(origin)
await page.getByRole('button', { name: 'Pen', exact: true }).waitFor()
await page.locator('.board-thumbnail img').first().waitFor()
await page.waitForTimeout(2000)
await page.mouse.move(1410, 110)
await page.screenshot({ path: 'docs/media/whitebored-light.png' })
const clipStart = (Date.now() - videoStart) / 1000
await page.waitForTimeout(1600)
await page.getByRole('button', { name: 'Open Small projects', exact: true }).click()
await page.waitForTimeout(2200)
await page.getByRole('button', { name: 'Open Reading corner', exact: true }).click()
await page.waitForTimeout(1300)
await page.getByRole('button', { name: 'Close board library', exact: true }).click()
await page.waitForTimeout(1200)
await page.getByRole('button', { name: 'Pen', exact: true }).click()
await page.keyboard.press('d')
await page.mouse.move(670, 200)
await page.mouse.down()
for (let i = 0; i <= 40; i++) {
  await page.mouse.move(666 + i * 4.2, 203 - Math.sin((i / 40) * Math.PI) * 9)
  await page.waitForTimeout(15)
}
await page.mouse.up()
await page.waitForTimeout(600)
await page.keyboard.press('Control+z')
await page.getByRole('button', { name: 'Board menu', exact: true }).click()
await page.waitForTimeout(1000)
await page.getByRole('button', { name: 'Dark mode', exact: true }).click()
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'Boards', exact: true }).click()
await page.waitForTimeout(1800)
await page.mouse.move(1410, 110)
await page.screenshot({ path: 'docs/media/whitebored-dark.png' })
await page.waitForTimeout(2200)
const clipLength = (Date.now() - videoStart) / 1000 - clipStart
const video = page.video()
await context.close()
const input = await video.path()
await browser.close()
if (errors.length) throw new Error(errors.join('\n'))
await writeFile('.qa/demo-video/timing.json', JSON.stringify({ input, clipStart, clipLength }))
function ffmpeg(args) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(clipStart),
      '-t',
      String(clipLength),
      '-i',
      input,
      ...args,
    ],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) throw new Error('FFmpeg failed; install ffmpeg to encode the recording.')
}
ffmpeg([
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-an',
  'docs/media/whitebored-demo.mp4',
])
ffmpeg([
  '-vf',
  'fps=8,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=80[p];[s1][p]paletteuse=dither=bayer',
  '-loop',
  '0',
  'docs/media/whitebored-demo.gif',
])
console.log('Captured light/dark screenshots and a real app recording in docs/media.')
