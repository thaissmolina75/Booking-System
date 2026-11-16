import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const controlClass =
  'h-12 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60'

/** Native select: the phone's own picker is the best picker on a phone. */
export function SelectField({
  label,
  hideLabel,
  className,
  children,
  ...props
}: { label: string; hideLabel?: boolean } & ComponentProps<'select'>) {
  const id = useId()
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-[0.95rem] font-medium', hideLabel && 'sr-only')}>
        {label}
      </label>
      <select id={id} className={controlClass} {...props}>
        {children}
      </select>
    </div>
  )
}

export function TextAreaField({ label, ...props }: { label: string } & ComponentProps<'textarea'>) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.95rem] font-medium">
        {label}
      </label>
      <textarea id={id} rows={3} className={cn(controlClass, 'h-auto py-3')} {...props} />
    </div>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={cn('flex min-h-12 cursor-pointer items-center justify-between gap-4', disabled && 'opacity-60')}>
      <span className="text-[0.95rem] font-medium">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-6 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed bg-card/60 px-6 py-10 text-center">
      {icon ? <div className="text-muted-foreground [&_svg]:size-8">{icon}</div> : null}
      <p className="font-heading text-lg font-semibold">{title}</p>
      {children ? <p className="max-w-sm text-muted-foreground">{children}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-[1.65rem] leading-tight font-semibold">{title}</h1>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
