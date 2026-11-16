import { LoaderCircle } from 'lucide-react'

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <LoaderCircle className="size-7 animate-spin text-primary" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}
