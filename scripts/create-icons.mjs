import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP_PATH || 'sharp')
const svg = await readFile(new URL('../public/favicon.svg', import.meta.url))
for (const size of [192, 512])
  await writeFile(
    new URL(`../public/icon-${size}.png`, import.meta.url),
    await sharp(svg).resize(size, size).png().toBuffer(),
  )
