import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { pickBusiness } from '@/auth/access'
import { useAuth } from '@/auth/AuthProvider'
import { useAccess, type MembershipWithBusiness } from '@/auth/useAccess'
import { lastBusiness } from '@/lib/storage'

type BusinessState = {
  current: MembershipWithBusiness
  all: MembershipWithBusiness[]
  select: (businessId: string) => void
  /** Platform admin looking at a business in "view as" mode: nothing can be changed. */
  readOnly: boolean
  /** May use owner-only pages and actions. */
  isOwner: boolean
  /** May approve, decline and add bookings. */
  canAct: boolean
}

const BusinessContext = createContext<BusinessState | null>(null)

/** The business being worked on. Remembers the last one chosen on this device. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const access = useAccess()
  const userId = session!.user.id
  const memberships = useMemo(() => access.data?.memberships ?? [], [access.data])
  const [selectedId, setSelectedId] = useState<string | null>(() => lastBusiness.get(userId))

  const select = useCallback(
    (businessId: string) => {
      lastBusiness.set(userId, businessId)
      setSelectedId(businessId)
    },
    [userId],
  )

  const current = pickBusiness(memberships, selectedId) as MembershipWithBusiness | null
  const value = useMemo<BusinessState | null>(
    () =>
      current
        ? { current, all: memberships, select, readOnly: false, isOwner: current.role === 'owner', canAct: true }
        : null,
    [current, memberships, select],
  )

  if (!value) return null
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

/** Read-only view of any business, for the platform admin's "view as" mode. */
export function ViewAsBusinessProvider({
  business,
  children,
}: {
  business: MembershipWithBusiness
  children: ReactNode
}) {
  const value = useMemo<BusinessState>(
    () => ({ current: business, all: [business], select: () => undefined, readOnly: true, isOwner: false, canAct: false }),
    [business],
  )
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness(): BusinessState {
  const value = useContext(BusinessContext)
  if (!value) throw new Error('useBusiness must be used inside BusinessProvider')
  return value
}
