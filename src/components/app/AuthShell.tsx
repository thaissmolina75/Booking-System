import type { ReactNode } from 'react'
import { Ticket } from 'lucide-react'

/** Frame for every signed-out page: brand mark, one column, one job. */
export function AuthShell({
  title,
  intro,
  children,
  footer,
}: {
  title: string
  intro?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col px-5 pt-10 pb-8 sm:justify-center sm:pt-8">
      <div className="mb-8 flex items-center gap-2.5 text-primary">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Ticket className="size-5" aria-hidden />
        </span>
        <span className="font-heading text-lg font-semibold text-foreground">Booking System</span>
      </div>
      <h1 className="text-[1.75rem] leading-tight font-semibold text-balance">{title}</h1>
      {intro ? <p className="mt-2 text-muted-foreground">{intro}</p> : null}
      <div className="mt-7 flex flex-col gap-4">{children}</div>
      {footer ? <div className="mt-8 text-[0.95rem] text-muted-foreground">{footer}</div> : null}
    </div>
  )
}
