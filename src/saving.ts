import { getSnapshot, type Editor, type TLRecord, type TLEditorSnapshot } from 'tldraw'
import { commitRecords, type Board } from './storage'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'
export class BoardSaving {
  private pending = new Map<string, TLRecord | null>()
  private timer?: ReturnType<typeof setTimeout>
  private queue: Promise<void> = Promise.resolve()
  private unlisten: () => void
  private disposed = false
  private failed = false
  private writing = false
  constructor(
    private editor: Editor,
    private board: Board,
    private status: (status: SaveStatus, error?: Error) => void,
  ) {
    this.unlisten = editor.store.listen(
      ({ changes }) => {
        for (const record of Object.values(changes.added)) this.pending.set(record.id, record)
        for (const [, record] of Object.values(changes.updated)) this.pending.set(record.id, record)
        for (const record of Object.values(changes.removed)) this.pending.set(record.id, null)
        this.status('pending')
        if (!this.timer && !this.failed)
          this.timer = setTimeout(() => {
            this.timer = undefined
            void this.flush().catch(() => {})
          }, 350)
      },
      { scope: 'document' },
    )
    if (!board.schema) {
      for (const record of Object.values(getSnapshot(editor.store).document.store))
        this.pending.set(record.id, record)
      void this.flush().catch(() => {})
    }
  }
  get metadata() {
    return this.board
  }
  get dirty() {
    return this.pending.size > 0 || this.failed || this.writing
  }
  flush(session?: TLEditorSnapshot['session']): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const work = async () => {
      if (this.disposed || (!this.pending.size && !session && !this.failed)) return
      const batch = this.pending
      this.pending = new Map()
      this.writing = true
      this.status('saving')
      try {
        this.board = await commitRecords(
          this.board.id,
          this.board.revision,
          batch,
          this.editor.store.schema.serialize(),
          session,
        )
        this.failed = false
        this.status(this.pending.size ? 'pending' : 'saved')
      } catch (e) {
        // Newer edits win when reinserting a failed batch.
        this.pending = new Map([...batch, ...this.pending])
        this.failed = true
        this.status('error', e as Error)
        throw e
      } finally {
        this.writing = false
      }
    }
    this.queue = this.queue.catch(() => {}).then(work)
    return this.queue
  }
  dispose() {
    this.disposed = true
    this.unlisten()
    if (this.timer) clearTimeout(this.timer)
  }
}
