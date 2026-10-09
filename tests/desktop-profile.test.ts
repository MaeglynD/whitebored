import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, test } from 'vitest'
const { resolveProfile } = createRequire(import.meta.url)('../desktop/profile.cjs')
const root = path.resolve('/profiles')
const existing = (...names: string[]) => {
  const paths = new Set(names.map((name) => path.join(root, name)))
  return (candidate: string) => paths.has(candidate)
}

test('new installations use the Whitebored profile', () => {
  expect(resolveProfile(root, existing())).toBe(path.join(root, 'Whitebored'))
})
test('upgrades retain boards even if an empty new profile directory already exists', () => {
  expect(resolveProfile(root, existing('Whitebored', 'Folio/IndexedDB'))).toBe(
    path.join(root, 'Folio'),
  )
  expect(resolveProfile(root, existing('folio-canvas/IndexedDB'))).toBe(
    path.join(root, 'folio-canvas'),
  )
})
test('an established Whitebored library takes precedence over older profiles', () => {
  expect(resolveProfile(root, existing('Whitebored/IndexedDB', 'Folio/IndexedDB'))).toBe(
    path.join(root, 'Whitebored'),
  )
})
