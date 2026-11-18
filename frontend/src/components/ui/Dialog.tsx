import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

/** Modal built on the native <dialog> element: focus trapping and Escape come for free. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      className={clsx(
        'm-auto w-[calc(100%-2rem)] rounded-3xl border border-line bg-surface p-0 text-fg shadow-pop',
        size === 'md' ? 'max-w-lg' : 'max-w-3xl',
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id={titleId} className="font-display text-xl font-medium">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-md p-1 text-fg-subtle hover:bg-surface-muted hover:text-fg"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: ReactNode
  confirmLabel: string
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  loading,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            className="h-10 rounded-full border border-line-strong px-5 text-sm font-semibold hover:bg-surface-muted"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-10 rounded-full bg-danger px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-fg-muted">{description}</div>
    </Dialog>
  )
}
