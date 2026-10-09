import { describe, it, expect } from 'vitest'
import {
  createBoard,
  readBoard,
  commitRecords,
  patchBoard,
  duplicateBoard,
  deleteBoard,
  savePreviews,
  createAssetStore,
  ConflictError,
  importBoards,
  listBoards,
  readLibrary,
} from '../src/storage'
import type { TLRecord, SerializedSchema, TLEditorSnapshot } from 'tldraw'
import { openDB } from 'idb'
const schema = { schemaVersion: 2, sequences: {} } as SerializedSchema
const record = (id: string, x: number) => ({ id, typeName: 'shape', x }) as unknown as TLRecord

describe('durable board transactions', () => {
  it('rolls back every board in an import batch if any record cannot be written', async () => {
    const snapshot = {
      document: { schema, store: { 'shape:a': record('shape:a', 1) } },
    } as TLEditorSnapshot
    const entry = {
      title: 'Import batch',
      collection: 'Notes',
      favorite: true,
      legacy: false,
      snapshot,
    }
    const before = await listBoards()
    await expect(
      importBoards([
        entry,
        {
          ...entry,
          snapshot: {
            ...snapshot,
            document: {
              schema,
              store: { a: record('shape:duplicate', 2), b: record('shape:duplicate', 3) },
            },
          },
        },
      ]),
    ).rejects.toBeDefined()
    expect(await listBoards()).toEqual(before)
  })
  it('imports independent copies with metadata and captures unopened boards for library export', async () => {
    const snapshot = {
      document: { schema, store: { 'shape:a': record('shape:a', 1) } },
    } as TLEditorSnapshot
    const entry = {
      title: 'Imported notes',
      collection: 'Research',
      favorite: true,
      legacy: false,
      createdAt: 1000,
      updatedAt: 2000,
      snapshot,
    }
    const copies = await importBoards([entry, entry])
    expect(copies[0].id).not.toBe(copies[1].id)
    expect(copies[0]).toMatchObject({
      collection: 'Research',
      favorite: true,
      createdAt: 1000,
      updatedAt: 2000,
    })
    const empty = await createBoard('Unopened')
    const library = await readLibrary()
    expect(library.entries.find((e) => e.board.id === empty.id)?.snapshot).toBeUndefined()
    expect(
      library.entries.find((e) => e.board.id === copies[1].id)?.snapshot?.document.store['shape:a'],
    ).toMatchObject({ x: 1 })
  })
  it('persists changed records without removing untouched records', async () => {
    const board = await createBoard('Atomic writes')
    const first = await commitRecords(
      board.id,
      0,
      new Map([
        ['shape:a', record('shape:a', 1)],
        ['shape:b', record('shape:b', 2)],
      ]),
      schema,
    )
    await commitRecords(
      board.id,
      first.revision,
      new Map([['shape:a', record('shape:a', 7)]]),
      schema,
    )
    const reopened = await readBoard(board.id)
    expect(reopened.snapshot?.document.store['shape:a']).toMatchObject({ x: 7 })
    expect(reopened.snapshot?.document.store['shape:b']).toMatchObject({ x: 2 })
  })
  it('rejects a stale writer atomically, leaving saved records intact', async () => {
    const board = await createBoard('Two windows')
    await commitRecords(board.id, 0, new Map([['shape:a', record('shape:a', 3)]]), schema)
    await expect(
      commitRecords(board.id, 0, new Map([['shape:a', record('shape:a', 99)]]), schema),
    ).rejects.toBeInstanceOf(ConflictError)
    expect((await readBoard(board.id)).snapshot?.document.store['shape:a']).toMatchObject({ x: 3 })
  })
  it('does not invalidate another writer when only saving the session', async () => {
    const board = await createBoard('Camera only')
    const saved = await commitRecords(board.id, 0, new Map(), schema)
    expect(saved.revision).toBe(0)
    expect(saved.updatedAt).toBe(board.updatedAt)
    const edited = await commitRecords(
      board.id,
      0,
      new Map([['shape:a', record('shape:a', 3)]]),
      schema,
    )
    expect(edited.revision).toBe(1)
    await expect(commitRecords(board.id, 0, new Map(), schema)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })
  it('does not overwrite a simultaneous rename with a canvas save', async () => {
    const board = await createBoard('Before')
    await patchBoard(board.id, { title: 'After', favorite: true })
    await commitRecords(board.id, 0, new Map([['shape:a', record('shape:a', 1)]]), schema)
    expect((await readBoard(board.id)).board).toMatchObject({ title: 'After', favorite: true })
  })
  it('duplicates independently and permanently deletes records without resurrecting stale writes', async () => {
    const board = await createBoard('Original')
    await commitRecords(board.id, 0, new Map([['shape:a', record('shape:a', 10)]]), schema)
    const copy = await duplicateBoard(board.id)
    await commitRecords(copy.id, 0, new Map([['shape:a', null]]), schema)
    expect((await readBoard(board.id)).snapshot?.document.store['shape:a']).toBeDefined()
    expect((await readBoard(copy.id)).snapshot?.document.store['shape:a']).toBeUndefined()
    await deleteBoard(board.id)
    await expect(commitRecords(board.id, 1, new Map(), schema)).rejects.toBeInstanceOf(
      ConflictError,
    )
    await savePreviews(board.id, { revision: 1, pageId: 'page:test', light: 'stale image' })
    await expect(readBoard(board.id)).rejects.toThrow('could not be found')
    const database = await openDB('folio-workspace-v1')
    expect(await database.getAllFromIndex('records', 'board', board.id)).toHaveLength(0)
    expect((await readBoard(copy.id)).board.title).toBe('Original · copy')
    database.close()
  })
  it('keeps shared media until the last referencing board is deleted', async () => {
    const board = await createBoard('Shared image')
    const asset = {
      id: 'asset:shared',
      typeName: 'asset',
      type: 'image',
      props: { src: 'asset:folio:asset:shared' },
    } as TLRecord
    const assets = createAssetStore()
    await assets.assets.upload(
      asset as any,
      new File(['image'], 'image.png', { type: 'image/png' }),
      board.id,
    )
    await commitRecords(board.id, 0, new Map([[asset.id, asset]]), schema)
    const copy = await duplicateBoard(board.id)
    await deleteBoard(board.id)
    const database = await openDB('folio-workspace-v1')
    expect(await database.get('assets', asset.id)).toBeDefined()
    await deleteBoard(copy.id)
    expect(await database.get('assets', asset.id)).toBeUndefined()
    database.close()
    assets.dispose()
  })
})
