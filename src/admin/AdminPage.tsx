import { LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'

export function AdminPage() {
  const { session, signOut } = useAuth()
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Platform admin</h1>
          <p className="mt-1 text-muted-foreground">Signed in as {session?.user.email}</p>
        </div>
        <Button variant="outline" size="touch" className="bg-card" onClick={() => void signOut()}>
          <LogOut aria-hidden />
          Sign out
        </Button>
      </div>
      <p className="mt-6 text-muted-foreground">The businesses table and commission report are built in Phase 4.</p>
    </div>
  )
}
