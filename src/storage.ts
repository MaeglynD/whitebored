import { openDB, type DBSchema } from 'idb'
import type { TLRecord, TLEditorSnapshot, SerializedSchema, TLAssetStore } from 'tldraw'

export interface Board {
  id: string
  title: string
  collection: string
  createdAt: number
  updatedAt: number
  revision: number
  favorite: boolean
  /** Compatibility only: old Trash entries are recovered on upgrade. */
  deleted?: boolean
  thumbnail?: string
  previews?: { revision: number; pageId: string; light?: string; dark?: string }
  schema?: SerializedSchema
  session?: TLEditorSnapshot['session']
  legacy?: boolean
  template?: string
}
interface WhiteboredDB extends DBSchema {
  boards: { key: string; value: Board }
  records: {
    key: [string, string]
    value: { boardId: string; id: string; record: TLRecord }
    indexes: { board: string }
  }
  assets: { key: string; value: Blob }
}
let connection: ReturnType<typeof openDB<WhiteboredDB>> | undefined
const db = () =>
  // Persisted identifiers predate the rename; changing them would hide existing boards.
  (connection ??= openDB<WhiteboredDB>('folio-workspace-v1', 2, {
    upgrade(database, oldVersion, _newVersion, transaction) {
      if (oldVersion < 1) {
        database.createObjectStore('boards', { keyPath: 'id' })
        database
          .createObjectStore('records', { keyPath: ['boardId', 'id'] })
          .createIndex('board', 'boardId')
        database.createObjectStore('assets')
      }
      // Retiring Trash must not silently destroy boards from an earlier release.
      if (oldVersion === 1)
        void (async () => {
          let cursor = await transaction.objectStore('boards').openCursor()
          while (cursor) {
            if (cursor.value.deleted) await cursor.update({ ...cursor.value, deleted: false })
            cursor = await cursor.continue()
          }
        })()
    },
    blocking() {
      void connection?.then((database) => database.close())
      connection = undefined
    },
    terminated() {
      connection = undefined
    },
  }).catch((error) => {
    connection = undefined
    throw error
  }))
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('folio-library') : null
export function announce(id?: string) {
  channel?.postMessage({ id })
  window.dispatchEvent(new CustomEvent('folio-library', { detail: id }))
}
export function subscribeLibrary(fn: (id?: string, local?: boolean) => void) {
  const local = (event: Event) => fn((event as CustomEvent<string | undefined>).detail, true)
  const remote = (e: MessageEvent) => fn(e.data.id)
  window.addEventListener('folio-library', local)
  channel?.addEventListener('message', remote)
  return () => {
    window.removeEventListener('folio-library', local)
    channel?.removeEventListener('message', remote)
  }
}
export async function listBoards() {
  return (await (await db()).getAll('boards')).sort((a, b) => b.updatedAt - a.updatedAt)
}
export async function createBoard(
  title = 'Untitled board',
  collection = '',
  snapshot?: TLEditorSnapshot,
  legacy = false,
  template?: string,
) {
  const board: Board = {
    id: crypto.randomUUID(),
    title,
    collection,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 0,
    favorite: false,
    legacy,
    template,
    schema: snapshot?.document.schema,
    session: snapshot?.session,
  }
  const database = await db()
  const tx = database.transaction(['boards', 'records'], 'readwrite')
  await tx.objectStore('boards').put(board)
  for (const record of Object.values(snapshot?.document.store ?? {}))
    await tx.objectStore('records').put({ boardId: board.id, id: record.id, record })
  await tx.done
  announce()
  return board
}
export async function readBoard(id: string) {
  const database = await db()
  const tx = database.transaction(['boards', 'records'], 'readonly')
  const board = await tx.objectStore('boards').get(id)
  if (!board) throw new Error('This board could not be found.')
  const records = await tx.objectStore('records').index('board').getAll(id)
  await tx.done
  const snapshot = board.schema
    ? {
        document: {
          schema: board.schema,
          store: Object.fromEntries(records.map((r) => [r.id, r.record])),
        },
        session: board.session,
      }
    : undefined
  return { board, snapshot }
}
export interface ImportedBoard {
  title: string
  collection: string
  favorite: boolean
  createdAt?: number
  updatedAt?: number
  snapshot: TLEditorSnapshot
  legacy: boolean
}
export async function importBoards(entries: ImportedBoard[]) {
  const database = await db()
  const tx = database.transaction(['boards', 'records'], 'readwrite')
  const done = tx.done
  done.catch(() => {})
  const boards: Board[] = []
  try {
    for (const entry of entries) {
      const { snapshot, ...metadata } = entry
      const board: Board = {
        ...metadata,
        id: crypto.randomUUID(),
        revision: 0,
        createdAt: entry.createdAt ?? Date.now(),
        updatedAt: entry.updatedAt ?? Date.now(),
        schema: snapshot.document.schema,
        session: snapshot.session,
      }
      await tx.objectStore('boards').add(board)
      for (const record of Object.values(snapshot.document.store))
        await tx.objectStore('records').add({ boardId: board.id, id: record.id, record })
      boards.push(board)
    }
    await done
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* already aborted */
    }
    throw error
  }
  announce()
  return boards
}
export async function readLibrary() {
  const database = await db()
  const tx = database.transaction(['boards', 'records', 'assets'], 'readonly')
  const [boards, rows, keys, blobs] = await Promise.all([
    tx.objectStore('boards').getAll(),
    tx.objectStore('records').getAll(),
    tx.objectStore('assets').getAllKeys(),
    tx.objectStore('assets').getAll(),
  ])
  await tx.done
  const documents = new Map<string, Record<string, TLRecord>>()
  for (const row of rows) {
    let document = documents.get(row.boardId)
    if (!document) documents.set(row.boardId, (document = {}))
    document[row.id] = row.record
  }
  return {
    assets: new Map(keys.map((key, i) => [key, blobs[i]])),
    entries: boards.map((board) => ({
      board,
      snapshot: board.schema
        ? {
            document: { schema: board.schema, store: documents.get(board.id) ?? {} },
            session: board.session,
          }
        : undefined,
    })),
  }
}
export class ConflictError extends Error {
  constructor() {
    super(
      'This board changed in another window. Export your unsaved work, then reopen the saved board.',
    )
    this.name = 'ConflictError'
  }
}
export async function commitRecords(
  id: string,
  revision: number,
  changes: Map<string, TLRecord | null>,
  schema: SerializedSchema,
  session?: TLEditorSnapshot['session'],
) {
  const database = await db()
  const tx = database.transaction(['boards', 'records'], 'readwrite')
  // Observe the abort promise before any operation can reject.
  const done = tx.done
  done.catch(() => {})
  const board = await tx.objectStore('boards').get(id)
  if (!board || board.deleted || board.revision !== revision) {
    tx.abort()
    throw new ConflictError()
  }
  for (const [key, record] of changes) {
    if (record) await tx.objectStore('records').put({ boardId: id, id: key, record })
    else await tx.objectStore('records').delete([id, key])
  }
  const next = {
    ...board,
    schema,
    session: session ?? board.session,
    revision: changes.size ? revision + 1 : revision,
    updatedAt: changes.size ? Date.now() : board.updatedAt,
  }
  await tx.objectStore('boards').put(next)
  await done
  announce(changes.size ? id : undefined)
  return next
}
export async function patchBoard(
  id: string,
  patch: Partial<Pick<Board, 'title' | 'collection' | 'favorite'>>,
) {
  const database = await db()
  const tx = database.transaction('boards', 'readwrite')
  const current = await tx.store.get(id)
  if (!current) throw new Error('Board not found')
  const board = { ...current, ...patch }
  await tx.store.put(board)
  await tx.done
  announce()
  return board
}
export async function duplicateBoard(id: string) {
  const { board, snapshot } = await readBoard(id)
  const copy = await createBoard(
    board.title + ' · copy',
    board.collection,
    snapshot as TLEditorSnapshot | undefined,
    board.legacy,
  )
  if (board.previews?.revision === board.revision)
    await savePreviews(copy.id, { ...board.previews, revision: 0 })
  return copy
}
export async function savePreviews(id: string, previews: NonNullable<Board['previews']>) {
  const database = await db()
  const tx = database.transaction('boards', 'readwrite')
  const board = await tx.store.get(id)
  // Background rendering must never resurrect a deleted board or cache a stale revision.
  if (board && board.revision === previews.revision) {
    await tx.store.put({ ...board, thumbnail: undefined, previews })
  }
  await tx.done
  if (board && board.revision === previews.revision) announce()
}
export async function deleteBoard(id: string) {
  const database = await db()
  const tx = database.transaction(['boards', 'records', 'assets'], 'readwrite')
  const records = tx.objectStore('records')
  const owned = await records.index('board').getAll(id)
  const assetKey = (record: TLRecord) =>
    record.typeName === 'asset' && record.props.src?.startsWith('asset:folio:')
      ? record.props.src.slice('asset:folio:'.length)
      : null
  const candidates = new Set(
    owned.map((row) => assetKey(row.record)).filter((key): key is string => !!key),
  )
  for (const row of owned) await records.delete([id, row.id])
  if (candidates.size) {
    // Duplicated boards share media. Only remove blobs owned exclusively by this board.
    let cursor = await records.openCursor()
    while (cursor) {
      const key = assetKey(cursor.value.record)
      if (key) candidates.delete(key)
      cursor = await cursor.continue()
    }
    for (const key of candidates) await tx.objectStore('assets').delete(key)
  }
  await tx.objectStore('boards').delete(id)
  await tx.done
  announce(id)
}
export function createAssetStore(): { assets: TLAssetStore; dispose: () => void } {
  const urls = new Map<string, string>()
  return {
    assets: {
      async upload(asset, file) {
        const database = await db()
        await database.put('assets', file, asset.id)
        return { src: 'asset:folio:' + asset.id }
      },
      async resolve(asset) {
        const src = asset.props.src
        if (!src?.startsWith('asset:folio:')) return src
        const id = src.slice('asset:folio:'.length)
        if (urls.has(id)) return urls.get(id)!
        const file = await (await db()).get('assets', id)
        if (!file) return null
        const url = URL.createObjectURL(file)
        urls.set(id, url)
        return url
      },
    },
    dispose() {
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    },
  }
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace(/[<>:"/\\|?*]/g, '-')
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}
