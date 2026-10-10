import { expect, it } from 'vitest'
import { boundedBody, digest, key, readJson, tokenPattern, uuid } from '../worker/security'

it('creates independent 256-bit capabilities and hashes them before storage', async () => {
  const owner = key(),
    edit = key()
  expect(tokenPattern.test(owner)).toBe(true)
  expect(owner).not.toBe(edit)
  expect(await digest(owner)).not.toBe(await digest(edit))
  expect(uuid.test(crypto.randomUUID())).toBe(true)
  expect(uuid.test('../other-room')).toBe(false)
})
it('rejects oversized streamed bodies even when Content-Length lies', async () => {
  const request = new Request('https://example.test', {
    method: 'POST',
    body: 'x'.repeat(50),
    headers: { 'Content-Length': '1' },
  })
  await expect(boundedBody(request, 20)).rejects.toMatchObject({ status: 413 })
})
it('rejects invalid JSON without reflecting request contents in its error', async () => {
  await expect(
    readJson(new Request('https://example.test', { method: 'POST', body: 'private content' })),
  ).rejects.toMatchObject({ status: 400, message: 'Invalid board data.' })
})
