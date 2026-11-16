import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { Notice } from './Notice'

/** Where Supabase sends the browser back to after Google or an email link. */
export function callbackUrl(next: string | null): string {
  const url = new URL('/auth/callback', window.location.origin)
  if (next) url.searchParams.set('next', next)
  return url.toString()
}

export function GoogleButton({ next }: { next: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl(next) },
    })
    if (error) {
      setError(errorText(error))
      setBusy(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="touch" className="w-full bg-card" onClick={start} disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-5">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
        </svg>
        Continue with Google
      </Button>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
