import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { FullPageSpinner } from '@/components/app/FullPageSpinner'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { pendingInvite } from '@/lib/storage'
import { resolveLanding, resolvePostAuthPath } from './access'
import { useAuth } from './AuthProvider'
import { useAccess } from './useAccess'

function AccessError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-5">
      <Notice tone="error" title="Could not load your account">
        {errorText(error)}
      </Notice>
      <Button size="touch" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}

/** Signed-in users only. Remembers where the visitor was going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (session === undefined) return <FullPageSpinner />
  if (session === null) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children}</>
}

/** Sends a signed-in user to the right place once their access is known. */
export function PostAuthRedirect({ next }: { next?: string | null }) {
  const access = useAccess()
  if (access.isError) return <AccessError error={access.error} retry={() => void access.refetch()} />
  if (!access.data) return <FullPageSpinner />
  const to = resolvePostAuthPath({ next, pendingInviteToken: pendingInvite.get(), access: access.data })
  return <Navigate to={to} replace />
}

/** Pages for signed-out visitors (log in, sign up). Signed-in users move on. */
export function SignedOutOnly({ next, children }: { next: string | null; children: ReactNode }) {
  const { session } = useAuth()
  if (session === undefined) return <FullPageSpinner />
  if (session) return <PostAuthRedirect next={next} />
  return <>{children}</>
}

export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const access = useAccess()
  if (access.isError) return <AccessError error={access.error} retry={() => void access.refetch()} />
  if (!access.data) return <FullPageSpinner />
  if (!access.data.isPlatformAdmin) return <Navigate to={resolveLanding(access.data)} replace />
  return <>{children}</>
}

export function RequireMember({ children }: { children: ReactNode }) {
  const access = useAccess()
  if (access.isError) return <AccessError error={access.error} retry={() => void access.refetch()} />
  if (!access.data) return <FullPageSpinner />
  if (access.data.memberships.length === 0) return <Navigate to={resolveLanding(access.data)} replace />
  return <>{children}</>
}
