import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useSync } from '@tldraw/sync'
import { ArrowLeft, Check, Copy, Download, Loader2, Users, WifiOff, X } from 'lucide-react'
import {
  useEditor,
  useValue,
  getUserPreferences,
  setUserPreferences,
  loadSnapshot,
  getSnapshot,
} from 'tldraw'
import { EditorCanvas, type CanvasHandle } from './EditorCanvas'
import { ShareDialog } from './ShareDialog'
import { SharedSocket } from './SharedSocket'
import { Shortcuts } from './Shortcuts'
import { Select } from './Select'
import { normalTheme, legacyTheme, storeShapeUtils } from './canvasConfig'
import { readKeymap } from './keymap'
import { readPreferences } from './preferences'
import { keepCanvasFocus, type CanvasControlsProps } from './CanvasControls'
import { focusCanvas } from './controls'
import {
  rememberLink,
  roomRequest,
  saveSharedCopy,
  sharedAssets,
  sharedLinks,
  sharingOrigin,
  forgetLink,
  recoverSharedCopy,
  type SharedLink,
} from './sharing'
import type { Board } from './storage'
import { navigateWorkspace } from './shareLinks'

export function SharedWorkspace({ link }: { link: SharedLink }) {
  const [loaded, setLoaded] = useState<SharedLink | null>(null)
  const [error, setError] = useState('')
  const [recover, setRecover] = useState<SharedLink | null>(null)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    document.documentElement.dataset.theme = readPreferences().theme
    let live = true
    void roomRequest(link)
      .then((r) => r.json())
      .then((metadata) => {
        if (!live) return
        const known = sharedLinks().find((x) => x.id === link.id)
        const current = { ...known, ...link, ...metadata }
        try {
          rememberLink(current)
        } catch {
          /* Joining still works when optional browser storage is unavailable. */
        }
        setLoaded(current)
      })
      .catch((e) => {
        if (live) {
          setError(e.message)
          if (e.status === 410) {
            const known = sharedLinks().find((x) => x.id === link.id)
            if (known?.ownerKey) setRecover(known)
          }
        }
      })
    return () => {
      live = false
    }
  }, [link.id, link.editKey])
  if (loaded) return <SharedCanvas link={loaded} />
  return (
    <main className="launch">
      <Users size={28} />
      {error ? (
        <>
          <h2>Couldn’t open shared board</h2>
          <p>{error}</p>
          {recover && (
            <button
              className="primary"
              disabled={recovering}
              onClick={() => {
                setRecovering(true)
                void recoverSharedCopy(recover)
                  .then(() => navigateWorkspace('/', true))
                  .catch((e) => setError(e.message))
                  .finally(() => setRecovering(false))
              }}
            >
              {recovering ? 'Saving board…' : 'Keep a copy & continue'}
            </button>
          )}
          {!recover && (
            <button className="secondary" onClick={() => location.reload()}>
              Try again
            </button>
          )}
          <a href="/" className="text-button">
            Back to local boards
          </a>
        </>
      ) : (
        <>
          <Loader2 className="spin" />
          <p>Connecting to shared board…</p>
        </>
      )}
    </main>
  )
}

type Peer = { id: string; name: string; color: string }
const cursorColors = [
  '#d95757',
  '#c77c28',
  '#33956e',
  '#228eaa',
  '#6574ce',
  '#a55db5',
  '#c35683',
  '#6c7d8b',
]
function PresenceMonitor({ onChange }: { onChange: (peers: Peer[]) => void }) {
  const editor = useEditor()
  // Ignore position-only changes; the roster should not rerender on every cursor packet.
  const roster = useValue(
    'people',
    () =>
      JSON.stringify(
        editor.store.query
          .records('instance_presence')
          .get()
          .map((p) => ({ id: p.id, name: p.userName.trim() || 'Guest', color: p.color })),
      ),
    [editor],
  )
  useEffect(() => onChange(JSON.parse(roster)), [roster, onChange])
  return null
}

function SharedCanvas({ link }: { link: SharedLink }) {
  const assets = useMemo(() => sharedAssets(link), [link.id, link.editKey])
  const socket = useRef<SharedSocket | null>(null)
  const canvas = useRef<CanvasHandle>(null)
  const stopping = useRef(false)
  const frozenSnapshot = useRef<ReturnType<typeof getSnapshot>['document'] | null>(null)
  const [prefs, setPrefs] = useState(readPreferences)
  const [keys, setKeys] = useState(readKeymap)
  const [modal, setModal] = useState<
    'share' | 'settings' | 'shortcuts' | 'export' | 'leave' | null
  >(() => {
    if (sessionStorage.getItem('whitebored-open-share') === link.id) {
      sessionStorage.removeItem('whitebored-open-share')
      return 'share'
    }
    return null
  })
  const [issue, setIssue] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [name, setName] = useState(() => getUserPreferences().name || '')
  const [color, setColor] = useState(() => getUserPreferences().color || cursorColors[0])
  const [peers, setPeers] = useState<Peer[]>([])
  const previousPeers = useRef<Peer[] | null>(null)
  const exiting = useRef(false)
  const onPeople = useCallback((next: Peer[]) => {
    const previous = previousPeers.current
    if (previous) {
      const arrived = next.filter((p) => !previous.some((q) => p.id === q.id))
      const left = previous.filter((p) => !next.some((q) => p.id === q.id))
      if (arrived.length) setMessage(`${arrived.map((p) => p.name).join(', ')} joined.`)
      else if (left.length) setMessage(`${left.map((p) => p.name).join(', ')} disconnected.`)
    }
    previousPeers.current = next
    setPeers(next)
  }, [])
  const fitted = useRef(false)
  const board = useMemo<Board>(
    () => ({
      id: link.id,
      title: link.title,
      legacy: link.legacy,
      collection: '',
      favorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 0,
    }),
    [link.id],
  )
  const connect = useCallback(
    ({ sessionId, storeId }: { sessionId: string; storeId: string }) => {
      const url = new URL(`/api/rooms/${link.id}/connect`, sharingOrigin())
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      url.searchParams.set('key', link.editKey)
      url.searchParams.set('sessionId', sessionId)
      url.searchParams.set('storeId', storeId)
      const transport = new SharedSocket(url.href, () => roomRequest(link))
      socket.current = transport
      return transport
    },
    [link.id, link.editKey],
  )
  const remote = useSync({
    connect,
    assets: assets.assets,
    shapeUtils: storeShapeUtils,
    themes: { default: link.legacy ? legacyTheme : normalTheme },
    onCustomMessageReceived: (data) => {
      if (data?.type === 'limit' && typeof data.message === 'string') setIssue(data.message)
    },
  })
  const lastRemote = useRef<Extract<typeof remote, { status: 'synced-remote' }> | null>(null)
  if (remote.status === 'synced-remote') lastRemote.current = remote
  const displayRemote =
    remote.status === 'error' && lastRemote.current
      ? { ...lastRemote.current, connectionStatus: 'offline' as const }
      : remote
  const online = remote.status === 'synced-remote' && remote.connectionStatus === 'online'
  const failed = remote.status === 'error'
  const ended = failed && ['FORBIDDEN', 'SESSION_ENDED'].includes(socket.current?.reason || '')
  useEffect(() => {
    if (failed && !stopping.current && !frozenSnapshot.current) setModal(null)
  }, [failed])
  useEffect(() => {
    const editor = canvas.current?.editor
    if (editor) {
      editor.updateInstanceState({ isReadonly: failed })
      if (ready) {
        const initialName =
          editor.user.getName().trim() || `Guest ${getUserPreferences().id.slice(-4)}`
        editor.user.updateUserPreferences({ name: initialName })
        setName(initialName)
        setColor(editor.user.getColor())
        if (!fitted.current) {
          editor.zoomToFit({ animation: { duration: 0 } })
          if (editor.getZoomLevel() > 1) editor.resetZoom(undefined, { animation: { duration: 0 } })
          fitted.current = true
        }
      }
    }
  }, [failed, ready])
  useEffect(() => {
    const editor = canvas.current?.editor
    if (!ready || !editor || failed) return
    const preload = () => {
      void assets.preload(editor).catch(() => {})
    }
    preload()
    return editor.store.listen(
      ({ changes }) => {
        if (
          [
            ...Object.values(changes.added),
            ...Object.values(changes.updated).map((pair) => pair[1]),
          ].some((r) => r.typeName === 'asset')
        )
          preload()
      },
      { scope: 'document' },
    )
  }, [ready, failed, assets])
  useEffect(() => () => assets.dispose(), [assets])
  useEffect(() => {
    document.title = `${link.title} · Shared · Whitebored`
    document.documentElement.dataset.theme = prefs.theme
    try {
      localStorage.setItem('folio-preferences', JSON.stringify(prefs))
      localStorage.setItem('folio-keymap-v3', JSON.stringify(keys))
    } catch {
      /* optional */
    }
  }, [prefs, keys, link.title])
  useEffect(() => {
    if (remote.status !== 'synced-remote' || !socket.current) return
    const transport = socket.current
    const stop = remote.store.listen(() => transport.markDirty(), {
      source: 'user',
      scope: 'document',
    })
    const unsubscribe = transport.subscribe(() => setDirty(transport.dirty))
    return () => {
      stop()
      unsubscribe()
    }
  }, [remote.status === 'synced-remote' ? remote.store : null])
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (socket.current?.dirty || busy) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', before)
    const guard = (event: Event) => {
      if (!exiting.current && (socket.current?.dirty || busy)) {
        event.preventDefault()
        setModal('leave')
      }
    }
    window.addEventListener('whitebored-before-navigate', guard)
    return () => {
      window.removeEventListener('beforeunload', before)
      window.removeEventListener('whitebored-before-navigate', guard)
    }
  }, [busy])
  useEffect(() => {
    if (message) {
      const id = setTimeout(() => setMessage(''), 4000)
      return () => clearTimeout(id)
    }
  }, [message])
  const work = async (fn: () => Promise<void>) => {
    setBusy(true)
    setIssue('')
    try {
      await fn()
    } catch (e) {
      setIssue(e instanceof Error ? e.message : 'Could not complete this action.')
    } finally {
      setBusy(false)
    }
  }
  const localCopy = async () => {
    const editor = canvas.current?.editor
    if (!editor) return
    editor.complete()
    const copy = await saveSharedCopy(editor, board)
    localStorage.setItem('folio-active', copy.id)
    setMessage('Saved a separate copy to your local boards.')
  }
  const returnLocal = () => {
    exiting.current = true
    socket.current?.close()
    navigateWorkspace('/', true)
  }
  const keepAndContinue = async () => {
    await localCopy()
    if (link.ownerKey && frozenSnapshot.current)
      await roomRequest(link, '', { method: 'DELETE' }, true)
    forgetLink(link.id)
    returnLocal()
  }
  const stopSharing = async () => {
    const editor = canvas.current?.editor
    if (!editor) throw new Error('Wait for the board to load before stopping sharing.')
    stopping.current = true
    setBusy(true)
    try {
      editor.complete()
      if (!frozenSnapshot.current) {
        // Wait for our last stroke before freezing. Retain the result for retry after a failed local save.
        await socket.current?.flush()
        const response = await roomRequest(link, '/freeze', { method: 'POST' }, true)
        frozenSnapshot.current = await response.json()
      }
      loadSnapshot(editor.store, { document: frozenSnapshot.current! })
      await assets.preload(editor)
      await localCopy()
      await roomRequest(link, '', { method: 'DELETE' }, true)
      forgetLink(link.id)
      returnLocal()
    } finally {
      stopping.current = false
      setBusy(false)
    }
  }
  const leave = () => {
    canvas.current?.editor?.complete()
    if (failed || !socket.current?.dirty) {
      returnLocal()
      return
    }
    setModal('leave')
  }
  const onAction: CanvasControlsProps['onAction'] = (command) => {
    if (command === 'boards' || command === 'newBoard') leave()
    else if (command === 'theme')
      setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))
    else if (command === 'grid' || command === 'snapping')
      setPrefs((p) => ({ ...p, [command]: !p[command] }))
    else if (command === 'settings' || command === 'shortcuts' || command === 'export')
      setModal(command)
    else if (command === 'duplicateBoard') void work(localCopy)
    else if (command === 'save')
      void work(async () => {
        canvas.current?.editor?.complete()
        await socket.current?.flush()
        setMessage('Shared changes saved.')
      })
  }
  const dismiss = () => {
    setModal(null)
    const editor = canvas.current?.editor
    if (editor) focusCanvas(editor)
  }
  return (
    <main className="workspace shared-workspace">
      <section
        className={'canvas-area' + (board.legacy ? ' legacy' : '')}
        aria-label="Shared whiteboard"
      >
        {(!failed || lastRemote.current) && (
          <EditorCanvas
            ref={canvas}
            remote={displayRemote}
            board={board}
            onStatus={() => {}}
            {...prefs}
            dark={prefs.theme === 'dark'}
            keys={keys}
            blocked={!!modal || busy || failed}
            onAction={onAction}
            onReady={() => {
              setReady(true)
              const editor = canvas.current?.editor
              if (editor) {
                editor.zoomToFit({ animation: { duration: 0 } })
                if (editor.getZoomLevel() > 1)
                  editor.resetZoom(undefined, { animation: { duration: 0 } })
                setName(editor.user.getName())
              }
            }}
          >
            <PresenceMonitor onChange={onPeople} />
          </EditorCanvas>
        )}
        {failed && (
          <div className={lastRemote.current ? 'shared-ended glass' : 'launch'}>
            <h2>{ended ? 'This shared session has ended' : 'Connection ended'}</h2>
            <p>
              {ended
                ? 'The owner stopped sharing, or the link expired. You can keep the board on this device and continue drawing.'
                : socket.current?.reason === 'RATE_LIMITED'
                  ? 'A shared-board limit was reached. You can keep a local copy and continue here.'
                  : 'The connection could not continue. Keep a local copy, or reopen the link to try again.'}
            </p>
            {lastRemote.current && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => void work(keepAndContinue)}
              >
                Keep a copy & continue
              </button>
            )}
            <button className="text-button" onClick={leave}>
              Back to local boards
            </button>
          </div>
        )}
      </section>
      <div className="board-controls glass shared-heading" onPointerDown={keepCanvasFocus}>
        <button aria-label="Back to local boards" title="Back to local boards" onClick={leave}>
          <ArrowLeft size={17} />
        </button>
        <i className="control-divider" />
        <span className="shared-title">{link.title}</span>
        <span className="shared-label">Shared</span>
        <i className="control-divider" />
        <button
          className="shared-people"
          aria-label="Share board"
          title={`${peers.length + 1} connected · Share board`}
          disabled={failed}
          onClick={() => setModal('share')}
        >
          <span className="presence-avatar" style={{ background: color }}>
            {name.slice(0, 1).toUpperCase() || 'Y'}
          </span>
          {peers.slice(0, 2).map((p) => (
            <span key={p.id} className="presence-avatar" style={{ background: p.color }}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          <span>{online ? peers.length + 1 : '…'}</span>
        </button>
      </div>
      {!failed && !online && ready && (
        <div className="shared-connection" role="status">
          <WifiOff size={14} />
          <span>Reconnecting. Keep this tab open to sync changes.</span>
          <button onClick={() => void work(localCopy)}>Save local copy</button>
        </div>
      )}
      <span
        className="sr-only"
        role="status"
        aria-label={online && !dirty ? 'Shared changes saved' : 'Shared changes pending'}
      >
        {online && !dirty ? 'Shared changes saved' : 'Shared changes pending'}
      </span>
      {issue && (
        <div className="error-banner" role="alert">
          <span>{issue}</span>
          <button aria-label="Dismiss message" onClick={() => setIssue('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={14} />
          {message}
        </div>
      )}
      {busy && (
        <div className="busy-indicator">
          <Loader2 size={16} className="spin" />
          Working…
        </div>
      )}
      {modal === 'share' && (
        <ShareDialog
          board={board}
          canvas={() => canvas.current}
          link={link}
          onClose={dismiss}
          onStop={stopSharing}
          people={
            <div className="share-people-panel">
              <label className="identity-label" htmlFor="shared-name">
                Your name
              </label>
              <input
                id="shared-name"
                className="shared-name"
                aria-label="Your name"
                value={name}
                maxLength={40}
                onChange={(e) => {
                  setName(e.target.value)
                  setUserPreferences({ ...getUserPreferences(), name: e.target.value })
                  canvas.current?.editor?.user.updateUserPreferences({ name: e.target.value })
                }}
              />
              <div className="cursor-colors" role="group" aria-label="Cursor color">
                {cursorColors.map((value, i) => (
                  <button
                    key={value}
                    aria-label={`Cursor color ${i + 1}`}
                    aria-pressed={color === value}
                    style={{ background: value }}
                    onClick={() => {
                      setColor(value)
                      setUserPreferences({ ...getUserPreferences(), color: value })
                      canvas.current?.editor?.user.updateUserPreferences({ color: value })
                    }}
                  >
                    {color === value && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="roster-heading">
                {online ? peers.length + 1 : 0} connected <span>20 maximum</span>
              </div>
              <ul className="presence-roster">
                <li>
                  <span className="presence-avatar" style={{ background: color }}>
                    {name.slice(0, 1) || 'Y'}
                  </span>
                  <span>
                    {name || 'Guest'} <small>(you)</small>
                  </span>
                  <small>{online ? 'Connected' : 'Reconnecting'}</small>
                </li>
                {peers.map((p) => (
                  <li key={p.id}>
                    <span className="presence-avatar" style={{ background: p.color }}>
                      {p.name.slice(0, 1)}
                    </span>
                    <span>{p.name}</span>
                    <small>Connected</small>
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      )}
      <Dialog.Root
        open={!!modal && modal !== 'share'}
        onOpenChange={(open) => {
          if (!open && !busy) dismiss()
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className={'dialog-content ' + (modal === 'shortcuts' ? 'shortcuts-dialog' : '')}
          >
            <div className="dialog-heading">
              <div>
                <Dialog.Title>
                  {modal === 'settings'
                    ? 'Preferences'
                    : modal === 'shortcuts'
                      ? 'Keyboard shortcuts'
                      : modal === 'leave'
                        ? 'Back to local boards'
                        : 'Export board'}
                </Dialog.Title>
                <Dialog.Description className="dialog-description">
                  {modal === 'leave'
                    ? 'The shared board stays online. You can return using its link or the Shared boards list.'
                    : modal === 'export'
                      ? 'Keep an editable backup or save an image.'
                      : 'Your preferences apply only to this device.'}
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon close-dialog" aria-label="Close dialog" disabled={busy}>
                <X size={18} />
              </Dialog.Close>
            </div>
            {modal === 'shortcuts' && <Shortcuts value={keys} onChange={setKeys} />}
            {modal === 'settings' && (
              <div className="settings-list">
                <label>
                  <span>
                    Your name<small>Shown beside your cursor</small>
                  </span>
                  <input
                    className="shared-name"
                    aria-label="Your name"
                    maxLength={40}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setUserPreferences({ ...getUserPreferences(), name: e.target.value })
                      canvas.current?.editor?.user.updateUserPreferences({ name: e.target.value })
                    }}
                  />
                </label>
                <label>
                  <span>Appearance</span>
                  <Select
                    label="Appearance"
                    value={prefs.theme}
                    onChange={(theme) => setPrefs({ ...prefs, theme: theme as 'light' | 'dark' })}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                    ]}
                  />
                </label>
                <label>
                  <span>Mouse wheel</span>
                  <Select
                    label="Mouse wheel"
                    value={prefs.wheel}
                    onChange={(wheel) => setPrefs({ ...prefs, wheel: wheel as 'pan' | 'zoom' })}
                    options={[
                      { value: 'pan', label: 'Pan' },
                      { value: 'zoom', label: 'Zoom' },
                    ]}
                  />
                </label>
                {(['grid', 'snapping', 'penOnly'] as const).map((key, i) => (
                  <label key={key}>
                    <span>{['Dot grid', 'Snapping', 'Pen mode'][i]}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={prefs[key]}
                      onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
                    />
                  </label>
                ))}
                <div className="camera-settings">
                  <label>
                    Zoom speed <output>{prefs.zoomSpeed.toFixed(1)}× / second</output>
                  </label>
                  <input
                    aria-label="Zoom speed"
                    type="range"
                    min="1.2"
                    max="12"
                    step="0.1"
                    value={prefs.zoomSpeed}
                    onChange={(e) => setPrefs({ ...prefs, zoomSpeed: +e.target.value })}
                  />
                  <label>
                    Zoom easing <output>{prefs.zoomEase} ms</output>
                  </label>
                  <input
                    aria-label="Zoom easing"
                    type="range"
                    min="0"
                    max="200"
                    step="10"
                    value={prefs.zoomEase}
                    onChange={(e) => setPrefs({ ...prefs, zoomEase: +e.target.value })}
                  />
                </div>
              </div>
            )}
            {modal === 'export' && (
              <div className="share-export">
                {(['canvas', 'png', 'svg'] as const).map((format, i) => (
                  <button
                    key={format}
                    className="secondary full"
                    disabled={busy}
                    onClick={() =>
                      void work(async () => {
                        await canvas.current?.export(format)
                        dismiss()
                      })
                    }
                  >
                    <Download size={16} />
                    {['Editable board (.canvas)', 'PNG image', 'SVG image'][i]}
                  </button>
                ))}
                <button
                  className="secondary full"
                  disabled={busy}
                  onClick={() =>
                    void work(async () => {
                      await localCopy()
                      dismiss()
                    })
                  }
                >
                  <Copy size={16} />
                  Save local copy
                </button>
              </div>
            )}
            {modal === 'leave' && (
              <>
                <p className="share-note">
                  {dirty
                    ? 'Some changes have not reached the server. Save a local copy before leaving, or keep this tab open to reconnect.'
                    : failed
                      ? 'Save a local copy to keep the board visible in this tab.'
                      : 'Your shared edits are saved online.'}
                </p>
                <div className="share-export">
                  <button
                    className="secondary full"
                    disabled={busy || !ready}
                    onClick={() => void work(localCopy)}
                  >
                    <Copy size={15} />
                    Save local copy
                  </button>
                  <button
                    className="primary full"
                    disabled={busy}
                    onClick={() =>
                      void work(async () => {
                        if (!failed) await socket.current?.flush()
                        returnLocal()
                      })
                    }
                  >
                    Back to local boards
                  </button>
                  {dirty && (
                    <button
                      className="text-button danger"
                      onClick={() => {
                        returnLocal()
                      }}
                    >
                      Leave without syncing
                    </button>
                  )}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}
