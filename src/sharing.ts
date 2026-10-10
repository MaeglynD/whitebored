import { getSnapshot, serializeTldrawJson, type Editor, type TLAssetStore } from 'tldraw'
import { backupMetadata, parseBoardFiles } from './backups'
import { importBoards, type Board } from './storage'
import { parseSharePath, sharePath } from './shareLinks'

export interface SharedLink {
  id: string
  editKey: string
  ownerKey?: string
  title: string
  sourceId?: string
  legacy?: boolean
  expiresAt?: number
}
const storageKey = 'whitebored-shared-links-v1'
export const parseSharedLink = parseSharePath
export function sharedLinks(): SharedLink[] {
  try {
    const result = JSON.parse(localStorage.getItem(storageKey) || '[]')
    return Array.isArray(result)
      ? result.filter(
          (x) =>
            x &&
            typeof x.id === 'string' &&
            typeof x.editKey === 'string' &&
            parseSharedLink(sharePath(x)),
        )
      : []
  } catch {
    return []
  }
}
export function rememberLink(link: SharedLink) {
  const links = sharedLinks()
  const previous = links.find((x) => x.id === link.id)
  // Owner capability lives only in this browser. It never enters a shared URL or board backup.
  localStorage.setItem(
    storageKey,
    JSON.stringify([{ ...previous, ...link }, ...links.filter((x) => x.id !== link.id)]),
  )
  window.dispatchEvent(new Event('whitebored-shared-links'))
}
export function forgetLink(id: string) {
  localStorage.setItem(storageKey, JSON.stringify(sharedLinks().filter((x) => x.id !== id)))
  window.dispatchEvent(new Event('whitebored-shared-links'))
}
export const sharingOrigin = () =>
  location.protocol === 'folio:' ? 'https://whitebored.app' : location.origin
export const shareUrl = (link: SharedLink) => `${sharingOrigin()}${sharePath(link)}`
export class SharingError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function roomRequest(
  link: SharedLink,
  path = '',
  init: RequestInit = {},
  owner = false,
) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${owner ? link.ownerKey : link.editKey}`)
  const result = await fetch(`${sharingOrigin()}/api/rooms/${link.id}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
  if (!result.ok) {
    const body = await result.json().catch(() => null)
    throw new SharingError(
      result.status,
      body?.error || 'Could not reach this shared board. Check your connection and retry.',
    )
  }
  return result
}
export function sharedAssets(link: SharedLink) {
  const urls = new Map<string, Promise<string>>()
  let disposed = false
  const assets: TLAssetStore = {
    async upload(_asset, file) {
      if (file.size > 10 * 1024 * 1024) throw new Error('Shared media must be 10 MB or smaller.')
      const response = await roomRequest(link, `/assets/${crypto.randomUUID()}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      return response.json()
    },
    async resolve(asset) {
      const src = asset.props.src
      if (!src) return null
      const prefix = `asset:shared:${link.id}:`
      if (!src.startsWith(prefix)) return null
      if (!urls.has(src)) {
        const pending = roomRequest(link, `/assets/${src.slice(prefix.length)}`)
          .then((r) => r.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob)
            if (disposed) URL.revokeObjectURL(url)
            return url
          })
          .catch((error) => {
            urls.delete(src)
            throw error
          })
        urls.set(src, pending)
      }
      return urls.get(src)!
    },
  }
  return {
    assets,
    // Keep every asset available for a local copy, including off-screen media.
    // Resolution is deduplicated for the life of this room, so this does not reread loaded images.
    preload(editor: Editor) {
      return Promise.all(
        editor.getAssets().map((asset) =>
          assets.resolve!(asset, {
            screenScale: 1,
            steppedScreenScale: 1,
            dpr: 1,
            networkEffectiveType: '4g',
            shouldResolveToOriginal: true,
          }),
        ),
      )
    },
    dispose() {
      disposed = true
      for (const url of urls.values()) void url.then(URL.revokeObjectURL).catch(() => {})
      urls.clear()
    },
  }
}
export async function portableBoard(editor: Editor, board: Board) {
  const document = JSON.parse(await serializeTldrawJson(editor))
  if (
    document.records.some(
      (r: any) =>
        r.typeName === 'asset' &&
        ['image', 'video'].includes(r.type) &&
        r.props.src &&
        !r.props.src.startsWith('data:'),
    )
  )
    throw new Error('Wait for media to finish loading before saving a copy.')
  return { ...backupMetadata(board), document, session: getSnapshot(editor.store).session }
}
export async function saveSharedCopy(editor: Editor, board: Board) {
  const file = new File(
    [JSON.stringify(await portableBoard(editor, board))],
    `${board.title}.canvas`,
    { type: 'application/json' },
  )
  return (await importBoards(await parseBoardFiles([file])))[0]
}
/** Recover an owner's final frozen snapshot even after a reload interrupted Stop sharing. */
export async function recoverSharedCopy(link: SharedLink) {
  const snapshot = await (await roomRequest(link, '/freeze', { method: 'POST' }, true)).json()
  const records: any[] = Object.values(snapshot.store)
  for (const record of records) {
    if (record.typeName !== 'asset' || !record.props.src) continue
    const prefix = `asset:shared:${link.id}:`
    if (!record.props.src.startsWith(prefix))
      throw new Error('An image in this board cannot be recovered.')
    const blob = await (
      await roomRequest(link, `/assets/${record.props.src.slice(prefix.length)}`)
    ).blob()
    record.props.src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('Could not save this board’s media.'))
      reader.readAsDataURL(blob)
    })
  }
  const file = new File(
    [
      JSON.stringify({
        format: 'folio-canvas',
        version: 1,
        title: link.title,
        legacy: link.legacy,
        document: { tldrawFileFormatVersion: 1, schema: snapshot.schema, records },
      }),
    ],
    `${link.title}.canvas`,
    { type: 'application/json' },
  )
  const saved = (await importBoards(await parseBoardFiles([file])))[0]
  localStorage.setItem('folio-active', saved.id)
  await roomRequest(link, '', { method: 'DELETE' }, true)
  forgetLink(link.id)
  return saved
}
export async function createSharedCopy(editor: Editor, board: Board): Promise<SharedLink> {
  editor.complete()
  // Capture all records and embedded media before allocating a server room.
  const portable = await portableBoard(editor, board)
  const snapshot = structuredClone(getSnapshot(editor.store).document)
  const records = new Map<string, any>(portable.document.records.map((r: any) => [r.id, r]))
  for (const record of Object.values(snapshot.store)) {
    if (record.typeName === 'asset' && record.type === 'bookmark')
      throw new Error(
        'Remove bookmark cards before sharing this board. Images and videos are supported.',
      )
  }
  const response = await fetch(`${sharingOrigin()}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: board.title, legacy: board.legacy }),
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Sharing is not available on this deployment yet.')
  }
  const link: SharedLink = {
    ...(await response.json()),
    title: board.title,
    sourceId: board.id,
    legacy: board.legacy,
  }
  const media = sharedAssets(link)
  try {
    // Save owner recovery first: a storage failure must never silently lose revocation access.
    rememberLink(link)
    for (const record of Object.values(snapshot.store)) {
      if (record.typeName !== 'asset' || record.type === 'bookmark') continue
      const embedded = records.get(record.id)?.props.src
      if (!embedded?.startsWith('data:'))
        throw new Error('An image could not be included in the shared copy.')
      const blob = await (await fetch(embedded)).blob()
      const result = await media.assets.upload(
        record,
        new File([blob], record.props.name || 'media', { type: blob.type }),
        new AbortController().signal,
      )
      record.props.src = result.src
    }
    await roomRequest(
      link,
      '/initialize',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      },
      true,
    )
    return link
  } catch (error) {
    await roomRequest(link, '', { method: 'DELETE' }, true).catch(() => {})
    forgetLink(link.id)
    throw error
  } finally {
    media.dispose()
  }
}
