import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
const svg = await readFile(new URL('../public/favicon.svg', import.meta.url))
for (const [name, size] of [
  ['apple-touch-icon', 180],
  ['icon-192', 192],
  ['icon-512', 512],
])
  await writeFile(
    new URL(`../public/${name}.png`, import.meta.url),
    await sharp(svg).resize(size, size).png().toBuffer(),
  )

// Keep all foreground artwork inside the maskable icon's central safe area.
const maskable = await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#5969ce' },
})
  .composite([{ input: await sharp(svg).resize(384).png().toBuffer(), gravity: 'centre' }])
  .png()
  .toBuffer()
await writeFile(new URL('../public/icon-maskable.png', import.meta.url), maskable)

// ICO supports embedded PNG images; include actual small sizes for sharp browser tabs.
async function ico(sizes, name) {
  const images = await Promise.all(sizes.map((size) => sharp(svg).resize(size).png().toBuffer()))
  const header = Buffer.alloc(6 + sizes.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  for (let i = 0; i < sizes.length; i++) {
    const entry = 6 + i * 16
    header[entry] = header[entry + 1] = sizes[i] === 256 ? 0 : sizes[i]
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(images[i].length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += images[i].length
  }
  await writeFile(
    new URL(`../public/${name}.ico`, import.meta.url),
    Buffer.concat([header, ...images]),
  )
}
await ico([16, 32, 48], 'favicon')
await ico([16, 32, 48, 64, 128, 256], 'whitebored')
console.log('Generated browser, installable app, and Windows icons from public/favicon.svg.')
