import { Navigate } from 'react-router-dom'
import { resolveLanding } from '@/auth/access'
import { useAuth } from '@/auth/AuthProvider'
import { useAccess } from '@/auth/useAccess'
import { AuthShell } from '@/components/app/AuthShell'
import { FullPageSpinner } from '@/components/app/FullPageSpinner'
import { Button } from '@/components/ui/button'

export function NoAccessPage() {
  const { session, signOut } = useAuth()
  const access = useAccess()

  if (access.isPending) return <FullPageSpinner />
  // Someone who has since been invited should not be stuck here.
  if (access.data && resolveLanding(access.data) !== '/no-access') {
    return <Navigate to={resolveLanding(access.data)} replace />
  }

  return (
    <AuthShell
      title="No access yet"
      intro="Your account isn't linked to a business yet. Ask the business owner or your provider to invite you."
    >
      <p className="rounded-xl border bg-card p-4 text-[0.95rem]">
        Signed in as <strong className="break-all">{session?.user.email}</strong>. The invite must be sent
        to this exact address.
      </p>
      <Button variant="outline" size="touch" className="bg-card" onClick={() => void access.refetch()}>
        Check again
      </Button>
      <Button variant="ghost" size="touch" onClick={() => void signOut()}>
        Sign out
      </Button>
    </AuthShell>
  )
}
