import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const styles = {
  error: { box: 'border-bad/30 bg-bad-soft text-bad', Icon: CircleAlert, role: 'alert' as const },
  success: { box: 'border-ok/30 bg-ok-soft text-ok', Icon: CircleCheck, role: 'status' as const },
  info: { box: 'border-border bg-accent text-accent-foreground', Icon: Info, role: 'status' as const },
  warning: { box: 'border-warn/30 bg-warn-soft text-warn', Icon: CircleAlert, role: 'status' as const },
}

export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof styles
  title?: string
  children?: ReactNode
  className?: string
}) {
  const { box, Icon, role } = styles[tone]
  return (
    <div role={role} className={cn('flex gap-3 rounded-xl border p-3.5 text-[0.95rem] leading-snug', box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'text-foreground')}>{children}</div> : null}
      </div>
    </div>
  )
}
