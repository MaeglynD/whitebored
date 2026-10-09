import { readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
const seen = new Set()
const notices = [
  'Folio — third-party notices\n\nThe tldraw SDK has its own license. Its inclusion does not grant a production license. See https://tldraw.dev/community/license.\n\nThis file includes notices from the production dependency graph. Some dependencies may be removed by tree shaking.\n',
]
async function findPackage(name, from) {
  for (let directory = from; ; directory = dirname(directory)) {
    const candidate = join(directory, 'node_modules', name, 'package.json')
    try {
      return await realpath(candidate)
    } catch {}
    if (directory === dirname(directory))
      throw new Error(`Cannot locate production dependency: ${name}`)
  }
}
async function visit(file) {
  const pkg = JSON.parse(await readFile(file, 'utf8'))
  const key = `${pkg.name}@${pkg.version}`
  if (seen.has(key)) return
  seen.add(key)
  const root = dirname(file)
  notices.push(
    `\n${'='.repeat(72)}\n${key}\nDeclared license: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n`,
  )
  for (const name of (await readdir(root)).sort())
    if (/^(licen[sc]e|copying|notice)(\.|$)/i.test(name)) {
      try {
        notices.push(`${name}\n${await readFile(join(root, name), 'utf8')}\n`)
      } catch {}
    }
  for (const name of Object.keys(pkg.dependencies || {}).sort())
    await visit(await findPackage(name, root))
}
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'))
for (const name of Object.keys(rootPackage.dependencies).sort())
  await visit(await findPackage(name, resolve('.')))
await writeFile('public/third-party-notices.txt', notices.join('\n'))
console.log(`Collected production notices for ${seen.size} packages.`)
