import { CalendarDays, LogOut, Map, Settings, Ticket, Users } from 'lucide-react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { canOpenSection, type DashboardSection } from '@/auth/access'
import { useAuth } from '@/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { useBusiness } from './BusinessProvider'

const SECTIONS: { id: DashboardSection; label: string; icon: typeof Ticket }[] = [
  { id: 'bookings', label: 'Bookings', icon: Ticket },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tours', label: 'Tours', icon: Map },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

function BusinessSwitcher() {
  const { current, all, select } = useBusiness()
  if (all.length < 2) {
    return <p className="truncate font-heading text-lg font-semibold">{current.businessName}</p>
  }
  return (
    <label className="block min-w-0">
      <span className="sr-only">Business</span>
      <select
        className="h-11 w-full max-w-full truncate rounded-lg border bg-card px-3 font-heading text-base font-semibold"
        value={current.businessId}
        onChange={(e) => select(e.target.value)}
      >
        {all.map((m) => (
          <option key={m.businessId} value={m.businessId}>
            {m.businessName}
          </option>
        ))}
      </select>
    </label>
  )
}

export function DashboardLayout() {
  const { current } = useBusiness()
  const { session, signOut } = useAuth()
  const sections = SECTIONS.filter((s) => canOpenSection(current.role, s.id))

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop: sidebar */}
      <aside className="hidden border-r bg-card md:flex md:min-h-dvh md:flex-col md:gap-6 md:p-4">
        <BusinessSwitcher />
        <nav aria-label="Dashboard" className="flex flex-col gap-1">
          {sections.map(({ id, label, icon: Icon }) => (
            <NavLink
              key={id}
              to={`/dashboard/${id}`}
              className={({ isActive }) =>
                cn(
                  'flex h-11 items-center gap-3 rounded-lg px-3 font-medium',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
                )
              }
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 text-sm text-muted-foreground">
          <p className="truncate">{session?.user.email}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-11 items-center gap-3 rounded-lg px-3 font-medium hover:bg-muted"
          >
            <LogOut className="size-5" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        {/* Mobile: top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card px-4 py-2.5 md:hidden">
          <div className="min-w-0 flex-1">
            <BusinessSwitcher />
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <LogOut className="size-5" aria-hidden />
          </button>
        </header>

        <main className="flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-10">
          <Outlet />
        </main>

        {/* Mobile: bottom tab bar */}
        <nav
          aria-label="Dashboard"
          className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <NavLink
              key={id}
              to={`/dashboard/${id}`}
              className={({ isActive }) =>
                cn(
                  'flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cn('rounded-full px-4 py-1', isActive && 'bg-accent')}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

/** Owner-only pages. Staff are sent back; the database rejects them as well. */
export function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { current } = useBusiness()
  if (current.role !== 'owner') return <Navigate to="/dashboard/bookings" replace />
  return <>{children}</>
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">This page is built in the next phase.</p>
    </div>
  )
}
