import { expect, it } from 'vitest'
import { parseSharePath, sharePath } from '../src/shareLinks'
import { key, roomId } from '../worker/security'

it('round-trips compact 128-bit links, retaining old UUID/capability links', () => {
  const id = key(16)
  expect(id).toHaveLength(22)
  expect(roomId.test(id)).toBe(true)
  expect(parseSharePath(sharePath({ id, editKey: id }))).toMatchObject({ id, editKey: id })
  expect(parseSharePath(`#/s/${id}`)?.id).toBe(id)
  const old = { id: crypto.randomUUID(), editKey: key() }
  expect(parseSharePath(`#${sharePath(old)}`)).toMatchObject(old)
  expect(parseSharePath(sharePath(old))).toMatchObject(old)
  for (const invalid of [
    '/s/hello',
    '/s/../../x',
    `/s/${id}/other`,
    `/s/${'a'.repeat(23)}`,
    '/s/<script>',
  ])
    expect(parseSharePath(invalid)).toBeNull()
})
