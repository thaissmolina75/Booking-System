import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { safeNextPath } from '@/auth/access'
import { useAuth } from '@/auth/AuthProvider'
import { PostAuthRedirect } from '@/auth/guards'
import { AuthShell } from '@/components/app/AuthShell'
import { FullPageSpinner } from '@/components/app/FullPageSpinner'
import { Notice } from '@/components/app/Notice'

/**
 * Landing page for Google sign-in and email confirmation links. Supabase puts
 * the session (or an error) in the URL; the destination travels in ?next=.
 */
export function AuthCallbackPage() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))

  // Read once: supabase-js clears the hash after it has stored the session.
  const linkError = useMemo(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return hash.get('error_description') ?? params.get('error_description')
  }, [params])

  if (session) return <PostAuthRedirect next={next} />
  if (session === undefined && !linkError) return <FullPageSpinner label="Signing you in" />

  return (
    <AuthShell title="We could not sign you in">
      <Notice tone="error">
        {linkError
          ? linkError.replace(/\+/g, ' ')
          : 'This link has expired or was already used. Log in, or request a new link.'}
      </Notice>
      <Link
        className="py-2 font-semibold text-primary underline-offset-4 hover:underline"
        to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
      >
        Go to log in
      </Link>
    </AuthShell>
  )
}
