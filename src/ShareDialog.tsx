import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, Check, Copy, Link2, Loader2, ShieldCheck, Users, X } from 'lucide-react'
import type { CanvasHandle } from './EditorCanvas'
import type { Board } from './storage'
import {
  createSharedCopy,
  forgetLink,
  roomRequest,
  sharedLinks,
  shareUrl,
  type SharedLink,
} from './sharing'

export function ShareDialog({
  board,
  canvas,
  link: existing,
  onClose,
  onRevoked,
  onOpen,
}: {
  board: Board
  canvas: () => CanvasHandle | null
  link?: SharedLink
  onClose: () => void
  onRevoked?: () => void
  onOpen?: (link: SharedLink) => void
}) {
  const [link, setLink] = useState(
    () => existing || sharedLinks().find((x) => x.sourceId === board.id),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const work = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Sharing failed. Please retry.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content share-dialog"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault()
          }}
        >
          <div className="dialog-heading">
            <div>
              <Dialog.Title>
                {confirm ? 'Stop sharing?' : revoked ? 'Sharing stopped' : 'Share board'}
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {confirm
                  ? 'This link will stop working for everyone, including you. Save a copy first to keep the latest shared changes.'
                  : revoked
                    ? 'The link has been revoked. Local copies are unchanged.'
                    : link
                      ? 'Anyone with this link can view and edit this board.'
                      : 'Create a shared copy to draw together. Your original board stays on this device.'}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon close-dialog" aria-label="Close sharing" disabled={busy}>
              <X size={18} />
            </Dialog.Close>
          </div>
          {!revoked && !confirm && (
            <>
              <div className="share-summary">
                <span className="share-emblem">
                  <Users size={22} strokeWidth={1.5} />
                </span>
                <div>
                  <strong>{board.title}</strong>
                  <span>
                    {link ? 'Live editing · no account needed' : 'Shared canvas · live cursors'}
                  </span>
                </div>
              </div>
              {link ? (
                <>
                  <div className="share-link">
                    <input
                      aria-label="Shared board link"
                      readOnly
                      value={shareUrl(link)}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      className="primary"
                      onClick={() =>
                        void work(async () => {
                          await navigator.clipboard.writeText(shareUrl(link))
                          setCopied(true)
                        })
                      }
                    >
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                  {!existing && (
                    <a
                      className="secondary full share-open"
                      href={shareUrl(link)}
                      onClick={(e) => {
                        if (onOpen) {
                          e.preventDefault()
                          onOpen(link)
                        }
                      }}
                    >
                      <ArrowUpRight size={15} />
                      Open shared board
                    </a>
                  )}
                  <p className="share-note">
                    Keep this link private to your group. Edits are saved online; changes to your
                    original local board stay separate.
                  </p>
                  {link.ownerKey && (
                    <>
                      <div className="share-owner">
                        <ShieldCheck size={16} />
                        <span>You control this link on this browser.</span>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() => setConfirm(true)}
                        >
                          Stop sharing
                        </button>
                      </div>
                      <p className="share-note">
                        Clearing this browser’s site data removes your owner access. It does not
                        delete the shared board.
                      </p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="share-note">
                    The copy and its images are uploaded to Whitebored. Up to 20 people can connect.
                    Media: 10 MB per file, 100 MB per board.
                  </p>
                  <button
                    className="primary full"
                    disabled={busy}
                    onClick={() =>
                      void work(async () => {
                        const handle = canvas(),
                          editor = handle?.editor
                        if (!handle || !editor) return
                        const readonly = editor.getIsReadonly()
                        editor.complete()
                        editor.updateInstanceState({ isReadonly: true })
                        try {
                          await handle.flush()
                          setLink(await createSharedCopy(editor, board))
                        } finally {
                          editor.updateInstanceState({ isReadonly: readonly })
                        }
                      })
                    }
                  >
                    {busy ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />}
                    {busy ? 'Preparing shared copy…' : 'Create shared copy'}
                  </button>
                </>
              )}
            </>
          )}
          {confirm && link && (
            <div className="form-actions">
              <button className="secondary" disabled={busy} onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="destructive"
                disabled={busy}
                onClick={() =>
                  void work(async () => {
                    await roomRequest(link, '', { method: 'DELETE' }, true)
                    forgetLink(link.id)
                    setRevoked(true)
                    setConfirm(false)
                    onRevoked?.()
                  })
                }
              >
                {busy ? 'Stopping…' : 'Stop sharing'}
              </button>
            </div>
          )}
          {error && (
            <p className="binding-error" role="alert">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
