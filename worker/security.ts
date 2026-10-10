export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
export const MAX_ASSET_BYTES = 10 * 1024 * 1024
export const MAX_ROOM_BYTES = 100 * 1024 * 1024
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const tokenPattern = /^[A-Za-z0-9_-]{43}$/
export const mediaTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
])

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function discardBody(request: Request) {
  // A rejected upload may still be streaming through the Worker-to-DO connection.
  if (request.body && !request.body.locked) await request.body.cancel().catch(() => {})
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  })
}
export async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}
export function key() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}
export async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get('Content-Length')) > limit)
    throw new HttpError(413, 'This file is too large to share.')
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > limit) {
      await reader.cancel()
      throw new HttpError(413, 'This file is too large to share.')
    }
    chunks.push(value)
  }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
export async function readJson(request: Request, limit = MAX_DOCUMENT_BYTES): Promise<any> {
  try {
    return JSON.parse(new TextDecoder().decode(await boundedBody(request, limit)))
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new HttpError(400, 'Invalid board data.')
  }
}
