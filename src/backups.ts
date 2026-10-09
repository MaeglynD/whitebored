import {
  createTLStore,
  getSnapshot,
  loadSnapshot,
  parseTldrawJsonFile,
  type TLEditorSnapshot,
  type TLRecord,
} from 'tldraw'
import { storeShapeUtils } from './canvasConfig'
import { readLibrary, type Board, type ImportedBoard } from './storage'

const MAX_BYTES = 512 * 1024 * 1024
const invalid = () =>
  new Error('This board is invalid or was created with a newer version of tldraw.')
const date = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined

function parseBoard(parsed: any, fallback: string): ImportedBoard {
  if (!parsed || typeof parsed !== 'object') throw invalid()
  const validation = createTLStore({ shapeUtils: storeShapeUtils })
  let snapshot: TLEditorSnapshot
  let legacy = false
  if (parsed.format === 'folio-canvas' || parsed.tldrawFileFormatVersion) {
    if (parsed.format === 'folio-canvas' && parsed.version !== 1) throw invalid()
    const result = parseTldrawJsonFile({
      json: JSON.stringify(parsed.format === 'folio-canvas' ? parsed.document : parsed),
      schema: validation.schema,
    })
    if (!result.ok) throw invalid()
    snapshot = getSnapshot(result.value)
    if (parsed.session) {
      loadSnapshot(validation, { document: snapshot.document, session: parsed.session })
      snapshot = getSnapshot(validation)
    }
    legacy = parsed.legacy === true
  } else {
    const value = parsed.snapshot || (parsed.document?.store ? parsed : null)
    if (!value) throw invalid()
    loadSnapshot(validation, value)
    snapshot = getSnapshot(validation)
    legacy = parsed.format === 'folio'
  }
  for (const record of Object.values(snapshot.document.store))
    if (record.typeName === 'asset' && /^(asset:|blob:)/.test(record.props.src || ''))
      throw new Error(
        'This board contains local image references. Export it from its original app so the images are included.',
      )
  return {
    title: String(parsed.title || fallback).slice(0, 200),
    collection: typeof parsed.collection === 'string' ? parsed.collection.slice(0, 200) : '',
    favorite: parsed.favorite === true,
    createdAt: date(parsed.createdAt),
    updatedAt: date(parsed.updatedAt),
    snapshot,
    legacy,
  }
}

/** Validate the entire batch before any records are written. */
export async function parseBoardFiles(files: File[]): Promise<ImportedBoard[]> {
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES)
    throw new Error('Choose up to 512 MB of board files at a time.')
  const boards: ImportedBoard[] = []
  for (const file of files) {
    try {
      const parsed = JSON.parse(await file.text())
      const library = parsed?.format === 'folio-library'
      if (library && (parsed.version !== 1 || !Array.isArray(parsed.boards))) throw invalid()
      const entries = library ? parsed.boards : Array.isArray(parsed) ? parsed : [parsed]
      if (!entries.length) throw new Error('This file contains no boards.')
      for (const entry of entries) boards.push(parseBoard(entry, file.name.replace(/\.[^.]+$/, '')))
    } catch (error) {
      throw new Error(
        `${file.name}: ${error instanceof Error ? error.message : 'Could not read this file.'} No boards were imported.`,
      )
    }
  }
  return boards
}

export function backupMetadata(board: Board) {
  return {
    format: 'folio-canvas',
    version: 1,
    title: board.title,
    collection: board.collection,
    favorite: board.favorite,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    legacy: board.legacy,
  }
}

const dataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read media for the backup.'))
    reader.readAsDataURL(blob)
  })

export async function exportLibrary(): Promise<Blob> {
  // Capture metadata, documents and media in one consistent database transaction.
  const { entries, assets } = await readLibrary()
  const media = new Map<string, Promise<string>>()
  const embed = (src: string) => {
    let pending = media.get(src)
    if (!pending) {
      pending = (async () => {
        let blob: Blob | undefined
        if (src.startsWith('asset:folio:')) blob = assets.get(src.slice('asset:folio:'.length))
        else {
          const response = await fetch(src, { signal: AbortSignal.timeout(30000) })
          if (!response.ok) throw new Error('Linked media could not be downloaded.')
          blob = await response.blob()
        }
        if (!blob) throw new Error('An image or video is missing. The backup was not created.')
        return dataUrl(blob)
      })()
      media.set(src, pending)
    }
    return pending
  }
  const boards = []
  for (const { board, snapshot } of entries) {
    const document =
      snapshot?.document ?? getSnapshot(createTLStore({ shapeUtils: storeShapeUtils })).document
    const records: TLRecord[] = []
    for (const record of Object.values(document.store)) {
      if (
        record.typeName === 'asset' &&
        ['image', 'video'].includes(record.type) &&
        record.props.src &&
        !record.props.src.startsWith('data:')
      ) {
        records.push({
          ...record,
          props: { ...record.props, src: await embed(record.props.src) },
        } as TLRecord)
      } else records.push(record)
    }
    boards.push({
      ...backupMetadata(board),
      document: { tldrawFileFormatVersion: 1, schema: document.schema, records },
      session: snapshot?.session,
    })
  }
  const blob = new Blob(
    [
      JSON.stringify({
        format: 'folio-library',
        version: 1,
        exportedAt: new Date().toISOString(),
        boards,
      }),
    ],
    { type: 'application/json' },
  )
  if (blob.size > MAX_BYTES)
    throw new Error('This library exceeds 512 MB. Export boards individually instead.')
  return blob
}
