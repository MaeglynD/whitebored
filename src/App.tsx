import { useCallback, useEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Layers3,
  Plus,
  Pencil,
  Check,
  RotateCcw,
  CircleHelp,
  Loader2,
  Search,
  Settings2,
  Keyboard,
  Upload,
  Download,
  Star,
  Copy,
  Trash2,
  X,
  ArrowUpRight,
  HardDrive,
  FilePlus2,
  Image,
  Maximize2,
  WifiOff,
  Folder,
  ArrowDownWideNarrow,
} from 'lucide-react'
import { Select } from './Select'
import { BoardThumbnail } from './BoardThumbnail'
import { exportLibrary, parseBoardFiles } from './backups'
import { Shortcuts } from './Shortcuts'
import { readKeymap, bindingLabel, type Command } from './keymap'
import { focusCanvas } from './controls'
import { keepCanvasFocus, type CanvasControlsProps } from './CanvasControls'
import { EditorCanvas, type CanvasHandle } from './EditorCanvas'
import {
  createBoard,
  importBoards,
  download,
  deleteBoard,
  duplicateBoard,
  listBoards,
  patchBoard,
  readBoard,
  subscribeLibrary,
  type Board,
} from './storage'
import type { SaveStatus } from './saving'

type Modal = 'settings' | 'shortcuts' | 'export' | 'rename' | 'install' | 'reload' | 'delete' | null
interface Preferences {
  theme: 'light' | 'dark'
  wheel: 'pan' | 'zoom'
  grid: boolean
  snapping: boolean
  penOnly: boolean
  zoomSpeed: number
  zoomEase: number
}
const defaults: Preferences = {
  theme: 'light',
  wheel: 'pan',
  grid: false,
  snapping: false,
  penOnly: false,
  zoomSpeed: 5,
  zoomEase: 60,
}
function readPreferences(): Preferences {
  try {
    const prefs = { ...defaults, ...JSON.parse(localStorage.getItem('folio-preferences') || '{}') }
    prefs.zoomSpeed = Number.isFinite(prefs.zoomSpeed)
      ? Math.max(1.2, Math.min(12, prefs.zoomSpeed))
      : 5
    prefs.zoomEase = Number.isFinite(prefs.zoomEase)
      ? Math.max(0, Math.min(200, prefs.zoomEase))
      : 60
    return prefs
  } catch {
    return defaults
  }
}
const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.'
const when = (time: number) => {
  const days = Math.floor((Date.now() - time) / 86400000)
  return days === 0
    ? 'Today'
    : days === 1
      ? 'Yesterday'
      : new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function App() {
  const [boards, setBoards] = useState<Board[]>([])
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof readBoard>> | null>(null)
  const [modal, setModal] = useState<Modal>(null)
  const [sidebar, setSidebar] = useState(() => {
    try {
      return localStorage.getItem('folio-sidebar') === 'open'
    } catch {
      return false
    }
  })
  const [filter, setFilter] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<Board | null>(null)
  const [sort, setSort] = useState(() => {
    try {
      return localStorage.getItem('folio-board-sort') || 'edited-desc'
    } catch {
      return 'edited-desc'
    }
  })
  const [query, setQuery] = useState('')
  const [prefs, setPrefs] = useState<Preferences>(readPreferences)
  const [keys, setKeys] = useState(readKeymap)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('Saving your place…')
  const [booted, setBooted] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [installEvent, setInstallEvent] = useState<any>(null)
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null)
  const [rename, setRename] = useState('')
  const [collection, setCollection] = useState('')
  const canvas = useRef<CanvasHandle>(null)
  const input = useRef<HTMLInputElement>(null)
  const returnToCanvas = () => {
    const editor = canvas.current?.editor
    if (editor) focusCanvas(editor)
  }
  const busyRef = useRef(false)
  const latest = useRef({ current, modal, sidebar })
  latest.current = { current, modal, sidebar }
  const refresh = useCallback(async () => setBoards(await listBoards()), [])
  const onStatus = useCallback((next: SaveStatus, issue?: Error) => {
    setStatus(next)
    if (issue) setError(issue.message)
  }, [])
  useEffect(() => {
    document.title = current ? `${current.board.title} · Folio` : 'Folio · Whiteboard'
    if (!current) return
    try {
      localStorage.setItem('folio-active', current.board.id)
    } catch {
      // The document is durable even if optional session preferences cannot be saved.
    }
  }, [current?.board.id, current?.board.title])
  useEffect(() => {
    try {
      localStorage.setItem('folio-keymap-v3', JSON.stringify(keys))
    } catch {
      /* optional */
    }
  }, [keys])
  useEffect(() => {
    try {
      localStorage.setItem('folio-sidebar', sidebar ? 'open' : 'closed')
    } catch {
      /* optional */
    }
  }, [sidebar])
  useEffect(() => {
    try {
      localStorage.setItem('folio-board-sort', sort)
    } catch {
      /* optional */
    }
  }, [sort])
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])
  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', prefs.theme === 'dark' ? '#191b22' : '#f8f9fc')
    try {
      localStorage.setItem('folio-preferences', JSON.stringify(prefs))
    } catch {
      /* Boards use IndexedDB. Preferences are optional. */
    }
  }, [prefs])
  useEffect(() => {
    let live = true
    async function start() {
      try {
        let all = await listBoards()
        if (!all.length) {
          await createBoard('Untitled board')
          all = await listBoards()
        }
        if (!live) return
        setBoards(all)
        let last: string | null = null
        try {
          last = localStorage.getItem('folio-active')
        } catch {
          /* optional */
        }
        const selected = all.find((b) => b.id === last) || all[0]
        if (selected) {
          const loaded = await readBoard(selected.id)
          if (live) setCurrent(loaded)
        } else setSidebar(true)
        if (live) setBooted(true)
      } catch (e) {
        if (live) setError(errorMessage(e))
      }
    }
    void start()
    return () => {
      live = false
    }
  }, [])
  useEffect(
    () =>
      subscribeLibrary((id, local) => {
        if (!id || latest.current.sidebar) void refresh().catch((e) => setError(errorMessage(e)))
        if (!local && id && id === latest.current.current?.board.id) {
          setStatus('error')
          setError(
            'This board changed in another window. Export any unsaved work, then reopen the saved version.',
          )
          canvas.current?.editor?.updateInstanceState({ isReadonly: true })
        }
      }),
    [refresh],
  )
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (canvas.current?.dirty() || busyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const hidden = () => {
      if (document.hidden) void canvas.current?.flush().catch((e) => setError(errorMessage(e)))
    }
    const online = () => setOffline(!navigator.onLine)
    const install = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e)
    }
    window.addEventListener('beforeunload', before)
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('online', online)
    window.addEventListener('offline', online)
    window.addEventListener('beforeinstallprompt', install)
    if (
      import.meta.env.PROD &&
      location.protocol !== 'file:' &&
      !navigator.userAgent.includes('Electron')
    ) {
      void import('virtual:pwa-register')
        .then(({ registerSW }) => {
          const updateSW = registerSW({
            onNeedRefresh() {
              setUpdate(() => async () => {
                await canvas.current?.flush()
                await updateSW(true)
              })
            },
          })
        })
        .catch(() => {})
    }
    return () => {
      window.removeEventListener('beforeunload', before)
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('online', online)
      window.removeEventListener('offline', online)
      window.removeEventListener('beforeinstallprompt', install)
    }
  }, [])
  useEffect(() => {
    if (modal) canvas.current?.editor?.blur()
    else if (canvas.current?.editor) focusCanvas(canvas.current.editor)
  }, [modal])
  const transition = async (fn: () => Promise<void>, label = 'Saving your place…') => {
    if (busyRef.current) return
    busyRef.current = true
    setBusyLabel(label)
    setBusy(true)
    const editor = canvas.current?.editor
    const wasReadonly = editor?.getIsReadonly() ?? false
    editor?.complete()
    editor?.blur()
    editor?.updateInstanceState({ isReadonly: true })
    try {
      await canvas.current?.flush()
      await canvas.current?.thumbnail().catch(() => {})
      await fn()
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      if (editor && canvas.current?.editor === editor) {
        editor.updateInstanceState({ isReadonly: wasReadonly })
        if (!latest.current.modal) focusCanvas(editor)
      }
      busyRef.current = false
      setBusy(false)
    }
  }
  const open = (id: string) =>
    void transition(async () => {
      const data = await readBoard(id)
      setCurrent(data)
      setModal(null)
      setStatus('saved')
      try {
        localStorage.setItem('folio-active', id)
      } catch {
        /* optional */
      }
    })
  const fresh = (template?: string) =>
    void transition(async () => {
      const title =
        template === 'ideas'
          ? 'A new possibility'
          : template === 'week'
            ? 'This week'
            : 'Untitled board'
      const board = await createBoard(
        title,
        filter.startsWith('folder:') ? filter.slice(7) : '',
        undefined,
        false,
        template,
      )
      setCurrent({ board, snapshot: undefined })
      setModal(null)
      setStatus('saved')
      try {
        localStorage.setItem('folio-active', board.id)
      } catch {
        /* optional */
      }
      await navigator.storage?.persist?.().catch(() => false)
    })
  const library = () => {
    setSidebar((open) => !open)
    if (!sidebar)
      void (async () => {
        await canvas.current?.flush()
        await canvas.current?.thumbnail().catch(() => {})
        await refresh()
      })().catch((e) => setError(errorMessage(e)))
  }
  const metadata = async (id: string, patch: Parameters<typeof patchBoard>[1]) => {
    try {
      const board = await patchBoard(id, patch)
      if (current?.board.id === id) setCurrent((c) => c && { ...c, board })
      await refresh()
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const requestDelete = (board: Board) => {
    setDeleteTarget(board)
    setModal('delete')
  }
  const remove = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    void transition(async () => {
      await deleteBoard(target.id)
      if (current?.board.id === target.id) {
        const remaining = await listBoards()
        setCurrent(remaining[0] ? await readBoard(remaining[0].id) : null)
        setSidebar(true)
        setStatus('saved')
      }
      setModal(null)
      setDeleteTarget(null)
      setToast('Board deleted')
      await refresh()
    })
  }
  const duplicate = (board: Board) =>
    void transition(async () => {
      const copy = await duplicateBoard(board.id)
      setCurrent(await readBoard(copy.id))
      setModal(null)
      setToast('Board duplicated')
    })
  const exportBoard = async (format: 'canvas' | 'png' | 'svg') => {
    try {
      await canvas.current?.export(format)
      setModal(null)
      setToast('Export ready')
    } catch (e) {
      setError(errorMessage(e))
      setModal(null)
    }
  }
  const importFiles = async (files: File[]) => {
    await transition(async () => {
      const entries = await parseBoardFiles(files)
      const imported = await importBoards(entries)
      if (imported[0]) setCurrent(await readBoard(imported[0].id))
      setModal(null)
      setFilter('all')
      setQuery('')
      if (imported.length > 1) setSidebar(true)
      setToast(
        imported.length === 1
          ? 'Board imported as a new copy'
          : `${imported.length} boards imported as new copies`,
      )
    }, 'Importing boards…')
    if (input.current) input.current.value = ''
  }
  const exportAll = () =>
    void transition(async () => {
      download(
        await exportLibrary(),
        `Folio library ${new Date().toISOString().slice(0, 10)}.canvas`,
      )
      setToast('Library exported')
    }, 'Preparing library backup…')
  const visible = boards
    .filter((b) =>
      filter === 'favorites'
        ? b.favorite
        : filter === 'collections'
          ? !!b.collection
          : filter === 'unfiled'
            ? !b.collection
            : filter.startsWith('folder:')
              ? b.collection === filter.slice(7)
              : true,
    )
    .filter((b) => b.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const field = sort.startsWith('created') ? 'createdAt' : 'updatedAt'
      const direction = sort.endsWith('asc') ? 1 : -1
      return (
        direction * (a[field] - b[field]) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id)
      )
    })
  const folders = [...new Set(boards.filter((b) => b.collection).map((b) => b.collection))].sort()
  const renameBoard = () => {
    if (!current) return
    setRename(current.board.title)
    setCollection(current.board.collection)
    setModal('rename')
  }
  const onAction: CanvasControlsProps['onAction'] = (command) => {
    switch (command) {
      case 'boards':
        library()
        break
      case 'newBoard':
        fresh()
        break
      case 'settings':
        setModal('settings')
        break
      case 'shortcuts':
        setModal('shortcuts')
        break
      case 'export':
        setModal('export')
        break
      case 'duplicateBoard':
        if (current) duplicate(current.board)
        break
      case 'delete':
        if (current) requestDelete(current.board)
        break
      case 'theme':
        setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))
        break
      case 'snapping':
        setPrefs((p) => ({ ...p, snapping: !p.snapping }))
        break
      case 'grid':
        setPrefs((p) => ({ ...p, grid: !p.grid }))
        break
      case 'save':
        void canvas.current
          ?.flush()
          .then(() => setToast('Saved on this device'))
          .catch((e) => setError(errorMessage(e)))
        break
    }
  }
  const label = (text: string, command: Command) =>
    text + (keys[command][0] ? ' · ' + bindingLabel(keys[command][0]) : '')
  if (!booted)
    return (
      <div className="launch">
        <Layers3 size={28} />
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="primary" onClick={() => location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <Loader2 className="spin" size={20} />
        )}
      </div>
    )
  return (
    <main className={'workspace' + (sidebar ? ' sidebar-open' : '')}>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept=".canvas,.folio,.tldr,.json"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length) void importFiles(files)
        }}
      />
      {sidebar && (
        <aside className="board-sidebar" aria-label="Board library" data-app-ui>
          <div className="sidebar-heading">
            <h2>Boards</h2>
            <button
              aria-label="Close board library"
              title="Close board library"
              onClick={() => setSidebar(false)}
            >
              <X size={17} />
            </button>
          </div>

          <div className="library-toolbar">
            <label className="library-search">
              <Search size={16} />
              <input
                aria-label="Search boards"
                placeholder="Find a board…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <kbd>{bindingLabel(keys.boards[0])}</kbd>
            </label>
            <button
              className="primary"
              aria-label="New board in library"
              onClick={() => fresh()}
              disabled={busy}
            >
              <Plus size={16} />
              New board
            </button>
          </div>
          <div className="library-filters">
            <Select
              label="Show boards"
              value={filter}
              onChange={setFilter}
              onClose={current ? returnToCanvas : undefined}
              options={[
                { value: 'all', label: 'All boards', icon: <Layers3 size={15} /> },
                { value: 'favorites', label: 'Favourites', icon: <Star size={15} /> },
                { value: 'collections', label: 'Collections', icon: <Folder size={15} /> },
                { value: 'unfiled', label: 'Unfiled', group: 'Collections' },
                ...folders.map((f) => ({
                  value: 'folder:' + f,
                  label: f,
                  group: 'Collections',
                  icon: <Folder size={14} />,
                })),
              ]}
            />
            <Select
              label="Sort boards"
              value={sort}
              onChange={setSort}
              onClose={current ? returnToCanvas : undefined}
              compact
              icon={<ArrowDownWideNarrow size={16} />}
              options={[
                { value: 'edited-desc', label: 'Last edited', group: 'Sort by' },
                { value: 'edited-asc', label: 'Least recently edited', group: 'Sort by' },
                { value: 'created-desc', label: 'Newest created', group: 'Sort by' },
                { value: 'created-asc', label: 'Oldest created', group: 'Sort by' },
              ]}
            />
          </div>
          <div className="boards-scroll">
            {visible.length ? (
              <div className="boards-grid">
                {visible.map((b) => (
                  <article
                    className={'board-card' + (b.id === current?.board.id ? ' current' : '')}
                    key={b.id}
                  >
                    <button
                      className="board-preview"
                      aria-label={'Open ' + b.title}
                      onClick={() => open(b.id)}
                    >
                      <BoardThumbnail board={b} theme={prefs.theme} />
                      {b.id === current?.board.id && <span className="current-badge">Open</span>}
                    </button>
                    <div className="card-info">
                      <button className="card-title" onClick={() => open(b.id)}>
                        {b.title}
                      </button>
                      <div className="card-meta">
                        <span>
                          {sort.startsWith('created') ? 'Created ' : 'Edited '}
                          {when(sort.startsWith('created') ? b.createdAt : b.updatedAt)}
                          {b.collection ? ' · ' + b.collection : ''}
                        </span>
                        <div className="card-actions">
                          <button
                            aria-label={'Favorite ' + b.title}
                            title="Favourite"
                            className={b.favorite ? 'is-favorite' : ''}
                            onClick={() => void metadata(b.id, { favorite: !b.favorite })}
                          >
                            <Star size={13} fill={b.favorite ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            aria-label={'Duplicate ' + b.title}
                            title="Duplicate"
                            onClick={() => duplicate(b)}
                          >
                            <Copy size={13} />
                          </button>

                          <button
                            aria-label={'Delete ' + b.title}
                            title="Delete board"
                            onClick={() => requestDelete(b)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-library">
                <Layers3 size={26} />
                <h3>
                  {query
                    ? 'No matching boards'
                    : filter === 'favorites'
                      ? 'No favourites'
                      : 'No boards'}
                </h3>
                <p>
                  {query
                    ? 'Try another name.'
                    : filter === 'favorites'
                      ? 'Star a board to find it here.'
                      : filter === 'collections'
                        ? 'Add a collection in a board’s details.'
                        : 'Create a board to begin.'}
                </p>
              </div>
            )}
          </div>
          <footer className="library-footer">
            <button onClick={() => input.current?.click()}>
              <Upload size={15} />
              Import boards
            </button>
            <button onClick={exportAll} disabled={!boards.length || busy}>
              <Download size={15} />
              Export all boards
            </button>
          </footer>
        </aside>
      )}
      {current ? (
        <section
          className={'canvas-area' + (current.board.legacy ? ' legacy' : '')}
          aria-label="Whiteboard"
        >
          <EditorCanvas
            key={current.board.id}
            ref={canvas}
            board={current.board}
            snapshot={current.snapshot}
            onStatus={onStatus}
            zoomSpeed={prefs.zoomSpeed}
            zoomEase={prefs.zoomEase}
            wheel={prefs.wheel}
            grid={prefs.grid}
            snapping={prefs.snapping}
            dark={prefs.theme === 'dark'}
            penOnly={prefs.penOnly}
            keys={keys}
            blocked={!!modal || busy}
            onAction={onAction}
          />
        </section>
      ) : (
        <div className="no-board">
          <Layers3 size={30} />
          <p>No board open.</p>
          <button className="primary" onClick={() => fresh()}>
            <Plus size={16} />
            New board
          </button>
          <button className="text-button" onClick={() => library()}>
            Browse boards
          </button>
        </div>
      )}
      <div className="board-controls glass" onPointerDown={keepCanvasFocus}>
        <button
          className="boards-trigger"
          aria-label="Boards"
          aria-expanded={sidebar}
          title={label('Switch boards', 'boards')}
          onClick={() => library()}
        >
          <Layers3 size={19} strokeWidth={1.7} />
        </button>
        <i className="control-divider" />
        <button
          className="board-title"
          title="Rename board"
          onClick={renameBoard}
          disabled={!current}
        >
          <span>{current?.board.title || 'Folio'}</span>
          <Pencil size={11} />
        </button>
        {current && (
          <button
            className={'board-favorite' + (current.board.favorite ? ' is-favorite' : '')}
            aria-label="Favourite board"
            aria-pressed={current.board.favorite}
            title={current.board.favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => void metadata(current.board.id, { favorite: !current.board.favorite })}
          >
            <Star size={15} fill={current.board.favorite ? 'currentColor' : 'none'} />
          </button>
        )}
        <span
          className={status === 'error' ? 'save-indicator error' : 'sr-only'}
          role="status"
          aria-label={
            status === 'saved'
              ? 'Saved on device'
              : status === 'error'
                ? 'Save needs attention'
                : 'Saving…'
          }
        >
          {status === 'saved' ? (
            'Saved on device'
          ) : status === 'error' ? (
            <CircleHelp size={13} />
          ) : (
            'Saving…'
          )}
        </span>
        <i className="control-divider" />
        <button
          aria-label="New board"
          title={label('New board', 'newBoard')}
          disabled={busy}
          onClick={() => fresh()}
        >
          <Plus size={17} />
        </button>
      </div>
      {offline && (
        <div className="offline-badge">
          <WifiOff size={12} /> Offline
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          {current && (
            <div>
              <button
                onClick={() =>
                  void canvas.current
                    ?.flush()
                    .then(() => setError(''))
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                Retry save
              </button>
              <button onClick={() => void exportBoard('canvas')}>Export backup</button>
              <button onClick={() => setModal('reload')}>Reopen saved</button>
            </div>
          )}
          <button aria-label="Dismiss message" onClick={() => setError('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {update && (
        <div className="update-banner">
          An update is ready.
          <button onClick={() => void update().catch((e) => setError(errorMessage(e)))}>
            Save & update
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={14} />
          {toast}
        </div>
      )}
      {busy && (
        <>
          <div className="transition-shield" />
          <div className="busy-indicator" role="status">
            <Loader2 className="spin" size={15} />
            {busyLabel}
          </div>
        </>
      )}
      <Dialog.Root
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) {
            setModal(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className={'dialog-content ' + (modal === 'shortcuts' ? 'shortcuts-dialog' : '')}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              requestAnimationFrame(() => {
                if (canvas.current?.editor) focusCanvas(canvas.current.editor)
              })
            }}
          >
            <div className="dialog-heading">
              <div>
                <Dialog.Title>
                  {modal === 'settings'
                    ? 'Preferences'
                    : modal === 'shortcuts'
                      ? 'Keyboard shortcuts'
                      : modal === 'export'
                        ? 'Export board'
                        : modal === 'rename'
                          ? 'Board details'
                          : modal === 'delete'
                            ? 'Delete board?'
                            : modal === 'reload'
                              ? 'Reopen saved version?'
                              : 'Install Folio'}
                </Dialog.Title>
                <Dialog.Description className="dialog-description">
                  {modal === 'settings'
                    ? 'Appearance and navigation.'
                    : modal === 'shortcuts'
                      ? 'Click a binding to change it.'
                      : modal === 'export'
                        ? 'Keep an editable backup, or save an image.'
                        : modal === 'rename'
                          ? 'Name and organise your board.'
                          : modal === 'delete'
                            ? `“${deleteTarget?.title}” and its contents will be permanently deleted from this device. This cannot be undone.`
                            : modal === 'reload'
                              ? 'Unsaved changes in this window will be discarded. Export a backup first to keep them.'
                              : 'A dedicated window. Available offline.'}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon close-dialog" aria-label="Close dialog">
                <X size={18} />
              </Dialog.Close>
            </div>
            {modal === 'settings' && (
              <div className="settings-list">
                <label>
                  <span>
                    Appearance<small>Light or dark canvas</small>
                  </span>
                  <Select
                    label="Appearance"
                    value={prefs.theme}
                    onChange={(value) =>
                      setPrefs({ ...prefs, theme: value as Preferences['theme'] })
                    }
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                  />
                </label>
                <label>
                  <span>
                    Mouse wheel<small>Pinch and Ctrl/⌘ + wheel always zoom</small>
                  </span>
                  <Select
                    label="Mouse wheel"
                    value={prefs.wheel}
                    onChange={(value) =>
                      setPrefs({ ...prefs, wheel: value as Preferences['wheel'] })
                    }
                    options={[
                      { value: 'pan', label: 'Pan' },
                      { value: 'zoom', label: 'Zoom' },
                    ]}
                  />
                </label>
                <label>
                  <span>
                    Dot grid<small>Show reference points on the canvas</small>
                  </span>
                  <input
                    aria-label="Dot grid"
                    type="checkbox"
                    role="switch"
                    checked={prefs.grid}
                    onChange={(e) => setPrefs({ ...prefs, grid: e.target.checked })}
                  />
                </label>
                <label>
                  <span>
                    Snapping<small>Align to objects and, when shown, the grid</small>
                  </span>
                  <input
                    aria-label="Snapping"
                    type="checkbox"
                    role="switch"
                    checked={prefs.snapping}
                    onChange={(e) => setPrefs({ ...prefs, snapping: e.target.checked })}
                  />
                </label>
                <label>
                  <span>
                    Pen mode<small>Draw with a stylus; navigate with touch</small>
                  </span>
                  <input
                    aria-label="Pen mode"
                    type="checkbox"
                    role="switch"
                    checked={prefs.penOnly}
                    onChange={(e) => setPrefs({ ...prefs, penOnly: e.target.checked })}
                  />
                </label>
                <div className="camera-settings">
                  <label htmlFor="zoom-speed">
                    Zoom speed <output>{prefs.zoomSpeed.toFixed(1)}× / second</output>
                  </label>
                  <input
                    id="zoom-speed"
                    aria-label="Zoom speed"
                    type="range"
                    min="1.2"
                    max="12"
                    step="0.1"
                    value={prefs.zoomSpeed}
                    onChange={(e) => setPrefs({ ...prefs, zoomSpeed: Number(e.target.value) })}
                  />
                  <label htmlFor="zoom-ease">
                    Zoom easing <output>{prefs.zoomEase} ms</output>
                  </label>
                  <input
                    id="zoom-ease"
                    aria-label="Zoom easing"
                    type="range"
                    min="0"
                    max="200"
                    step="10"
                    value={prefs.zoomEase}
                    onChange={(e) => setPrefs({ ...prefs, zoomEase: Number(e.target.value) })}
                  />
                  <button
                    className="text-button"
                    onClick={() => setPrefs({ ...prefs, zoomSpeed: 5, zoomEase: 60, wheel: 'pan' })}
                  >
                    <RotateCcw size={13} /> Reset navigation
                  </button>
                </div>
                <button className="settings-link" onClick={() => setModal('shortcuts')}>
                  <Keyboard size={18} />
                  <span>Customise keyboard shortcuts</span>
                  <ArrowUpRight size={15} />
                </button>
                <div className="storage-note">
                  <HardDrive size={19} />
                  <div>
                    <strong>Local to this device</strong>
                    <p>
                      Export editable backups to keep a separate copy or move boards between
                      browsers and the desktop app.
                    </p>
                    <button
                      className="text-button"
                      onClick={() =>
                        void navigator.storage
                          ?.persist?.()
                          .then((ok) =>
                            setToast(
                              ok
                                ? 'Persistent storage enabled'
                                : 'Your browser manages storage. Keep an exported backup.',
                            ),
                          )
                          .catch((e) => setError(errorMessage(e)))
                      }
                    >
                      Request persistent storage
                    </button>
                  </div>
                </div>
                <button className="secondary full" onClick={() => setModal('install')}>
                  <Download size={16} />
                  Install Folio
                </button>
              </div>
            )}
            {modal === 'shortcuts' && <Shortcuts value={keys} onChange={setKeys} />}
            {modal === 'export' && (
              <div className="export-options">
                {[
                  {
                    format: 'canvas' as const,
                    label: 'Editable board',
                    detail: 'Shapes, images and your view. Everything included.',
                    Icon: FilePlus2,
                  },
                  {
                    format: 'png' as const,
                    label: 'PNG image',
                    detail: 'A high-resolution image to share.',
                    Icon: Image,
                  },
                  {
                    format: 'svg' as const,
                    label: 'SVG vector',
                    detail: 'Scales to any size.',
                    Icon: Maximize2,
                  },
                ].map(({ format, label, detail, Icon }) => (
                  <button key={format} onClick={() => void exportBoard(format)}>
                    <span className="export-icon">
                      <Icon size={21} />
                    </span>
                    <span>
                      <strong>{label}</strong>
                      <small>{detail}</small>
                    </span>
                    <span className="file-tag">.{format}</span>
                  </button>
                ))}
                <p>
                  Image exports use your selection, or the entire drawing when nothing is selected.
                </p>
              </div>
            )}
            {modal === 'rename' && current && (
              <form
                className="rename-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (rename.trim())
                    void metadata(current.board.id, {
                      title: rename.trim().slice(0, 200),
                      collection: collection.trim().slice(0, 100),
                    }).then(() => setModal(null))
                }}
              >
                <label>
                  Board name
                  <input
                    autoFocus
                    maxLength={200}
                    value={rename}
                    onChange={(e) => setRename(e.target.value)}
                  />
                </label>
                <label>
                  Collection <span className="muted">optional</span>
                  <input
                    maxLength={100}
                    value={collection}
                    placeholder="e.g. Research"
                    onChange={(e) => setCollection(e.target.value)}
                  />
                </label>
                <div className="form-actions">
                  <Dialog.Close className="secondary" type="button">
                    Cancel
                  </Dialog.Close>
                  <button className="primary" type="submit" disabled={!rename.trim()}>
                    Save changes
                  </button>
                </div>
              </form>
            )}
            {modal === 'delete' && (
              <div className="form-actions delete-actions">
                <Dialog.Close className="secondary" autoFocus disabled={busy}>
                  Cancel
                </Dialog.Close>
                <button className="destructive" disabled={busy} onClick={remove}>
                  <Trash2 size={15} />
                  {busy ? 'Deleting…' : 'Delete board'}
                </button>
              </div>
            )}
            {modal === 'reload' && (
              <div className="form-actions">
                <button className="secondary" onClick={() => void exportBoard('canvas')}>
                  Export backup
                </button>
                <button className="primary" onClick={() => location.reload()}>
                  Reopen saved version
                </button>
              </div>
            )}
            {modal === 'install' && (
              <div className="install-content">
                <Layers3 size={32} />
                <p>
                  {navigator.userAgent.includes('Electron')
                    ? 'You’re using the desktop app. Your boards are saved in Folio’s app storage.'
                    : 'Use “Install app” in Chrome or Edge. In Safari on Mac, choose File → Add to Dock. On mobile, use your browser’s Add to Home Screen option.'}
                </p>
                {installEvent && (
                  <button
                    className="primary full"
                    onClick={() =>
                      void installEvent.prompt().then(() => {
                        setInstallEvent(null)
                        setModal(null)
                      })
                    }
                  >
                    <Download size={16} />
                    Install Folio
                  </button>
                )}
                <p className="muted">
                  Offline access is available after the first complete production load. Browser and
                  desktop libraries are separate; use an editable export to move boards.
                </p>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
