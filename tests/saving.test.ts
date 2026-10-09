import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Editor, TLRecord } from 'tldraw'
import type { Board } from '../src/storage'
const { commit } = vi.hoisted(() => ({ commit: vi.fn() }))
vi.mock('../src/storage', () => ({ commitRecords: commit }))
vi.mock('tldraw', () => ({ getSnapshot: vi.fn() }))
import { BoardSaving } from '../src/saving'

describe('autosave failure recovery', () => {
  beforeEach(() => {
    commit.mockReset()
  })
  it('keeps failed edits and replays the latest value when saving is retried', async () => {
    let change: (entry: any) => void = () => {}
    const board = { id: 'board', revision: 0, schema: { schemaVersion: 2, sequences: {} } } as Board
    const editor = {
      store: {
        schema: { serialize: () => board.schema },
        listen: (cb: typeof change) => {
          change = cb
          return () => {}
        },
      },
    } as unknown as Editor
    const status = vi.fn()
    const saving = new BoardSaving(editor, board, status)
    const one = { id: 'shape:a', typeName: 'shape', x: 1 } as unknown as TLRecord
    change({ changes: { added: { [one.id]: one }, updated: {}, removed: {} } })
    commit.mockRejectedValueOnce(new DOMException('No space', 'QuotaExceededError'))
    await expect(saving.flush()).rejects.toThrow('No space')
    expect(saving.dirty).toBe(true)
    const two = { ...one, x: 2 }
    change({ changes: { added: {}, updated: { [one.id]: [one, two] }, removed: {} } })
    commit.mockResolvedValueOnce({ ...board, revision: 1 })
    await saving.flush()
    expect(commit.mock.calls[1][2].get('shape:a')).toMatchObject({ x: 2 })
    expect(saving.dirty).toBe(false)
    expect(status).toHaveBeenLastCalledWith('saved')
    saving.dispose()
  })
})
