import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useSync } from '@tldraw/sync'
import { ArrowLeft, Check, Copy, Download, Loader2, Users, WifiOff, X } from 'lucide-react'
import { useEditor, useValue } from 'tldraw'
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
  type SharedLink,
} from './sharing'
import type { Board } from './storage'

export function SharedWorkspace({ link }: { link: SharedLink }) {
  const [loaded, setLoaded] = useState<SharedLink | null>(null)
  const [error, setError] = useState('')
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
        if (live) setError(e.message)
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
          <button className="secondary" onClick={() => location.reload()}>
            Try again
          </button>
          <a href="#" className="text-button">
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

function People() {
  const editor = useEditor()
  const peers = useValue('collaborators', () => editor.getCollaborators(), [editor])
  return (
    <span
      className="shared-people"
      title={['You', ...peers.map((p) => p.userName || 'Guest')].join(', ')}
    >
      <Users size={14} />
      {peers.length + 1}
      <span className="sr-only"> people connected</span>
    </span>
  )
}

function SharedCanvas({ link }: { link: SharedLink }) {
  const assets = useMemo(() => sharedAssets(link), [link.id, link.editKey])
  const socket = useRef<SharedSocket | null>(null)
  const canvas = useRef<CanvasHandle>(null)
  const [prefs, setPrefs] = useState(readPreferences)
  const [keys, setKeys] = useState(readKeymap)
  const [modal, setModal] = useState<
    'share' | 'settings' | 'shortcuts' | 'export' | 'leave' | null
  >(null)
  const [issue, setIssue] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [name, setName] = useState('')
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
  })
  const lastRemote = useRef<Extract<typeof remote, { status: 'synced-remote' }> | null>(null)
  if (remote.status === 'synced-remote') lastRemote.current = remote
  const displayRemote =
    remote.status === 'error' && lastRemote.current
      ? { ...lastRemote.current, connectionStatus: 'offline' as const }
      : remote
  const online = remote.status === 'synced-remote' && remote.connectionStatus === 'online'
  const failed = remote.status === 'error' || revoked
  useEffect(() => {
    const editor = canvas.current?.editor
    if (editor) {
      editor.updateInstanceState({ isReadonly: failed })
      if (ready) {
        setName(editor.user.getName())
        if (!fitted.current) {
          editor.zoomToFit({ animation: { duration: 0 } })
          fitted.current = true
        }
      }
    }
  }, [failed, ready])
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
      if (socket.current?.dirty) {
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
  const leave = () => {
    canvas.current?.editor?.complete()
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
                setName(editor.user.getName())
              }
            }}
          >
            <div className="shared-presence">
              <People />
            </div>
          </EditorCanvas>
        )}
        {failed && (
          <div className={lastRemote.current ? 'shared-ended glass' : 'launch'}>
            <h2>{revoked ? 'Sharing stopped' : 'Connection ended'}</h2>
            <p>
              {revoked
                ? 'This link no longer gives access to the board.'
                : 'The link may have been revoked, the room may be full, or the app may need an update.'}
            </p>
            {lastRemote.current && (
              <button className="secondary" disabled={busy} onClick={() => void work(localCopy)}>
                Save local copy
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
        <button aria-label="Share board" title="Share board" onClick={() => setModal('share')}>
          <Users size={17} />
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
          onRevoked={() => setRevoked(true)}
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
                        await socket.current?.flush()
                        location.hash = ''
                      })
                    }
                  >
                    Back to local boards
                  </button>
                  {dirty && (
                    <button
                      className="text-button danger"
                      onClick={() => {
                        location.assign(location.pathname)
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
