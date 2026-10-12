import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'

export function BoardLibrary({
  open,
  mobile,
  covered,
  onClose,
  onReturnFocus,
  children,
}: {
  open: boolean
  mobile: boolean
  covered: boolean
  onClose: () => void
  onReturnFocus: () => void
  children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const header = (
    <div className="sidebar-heading">
      {mobile ? (
        <Dialog.Title ref={heading} tabIndex={-1}>
          Boards
        </Dialog.Title>
      ) : (
        <h2>Boards</h2>
      )}
      <button aria-label="Close board library" title="Close board library" onClick={onClose}>
        <X size={19} />
      </button>
    </div>
  )
  if (!mobile)
    return open ? (
      <aside className="board-sidebar" aria-label="Board library" data-app-ui>
        {header}
        {children}
      </aside>
    ) : null

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="library-backdrop" />
        <Dialog.Content
          className="board-sidebar mobile-library"
          aria-describedby={undefined}
          data-app-ui
          onInteractOutside={(event) => {
            // A confirmation above the sheet must not dismiss the board picker.
            // Touch outside-click events can arrive after that confirmation closes.
            const target = event.detail.originalEvent.target
            if (
              covered ||
              (target instanceof Element &&
                (!target.isConnected || target.closest('.dialog-content, .dialog-overlay')))
            )
              event.preventDefault()
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            // Opening the picker should not also open the phone's keyboard.
            heading.current?.focus({ preventScroll: true })
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            onReturnFocus()
          }}
        >
          {header}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
