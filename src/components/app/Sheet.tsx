import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bottom sheet on phones, side sheet on desktop. Built on the native <dialog>,
 * which gives focus trapping, Escape to close and a backdrop for free.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === ref.current) onClose()
      }}
      aria-label={title}
      className={cn(
        'sheet m-0 max-h-none max-w-none bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/45',
        'fixed inset-x-0 top-auto bottom-0 max-h-[92dvh] w-full rounded-t-2xl',
        'md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:max-h-dvh md:w-[28rem] md:rounded-none md:border-l',
      )}
    >
      {open ? (
        <div className="flex max-h-[92dvh] flex-col md:h-dvh md:max-h-dvh">
          <header className="flex items-start gap-3 border-b px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl leading-tight font-semibold">{title}</h2>
              {description ? <div className="mt-0.5 text-[0.95rem] text-muted-foreground">{description}</div> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <X className="size-5" aria-hidden />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  )
}
