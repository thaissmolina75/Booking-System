import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { pickBusiness } from '@/auth/access'
import { useAuth } from '@/auth/AuthProvider'
import { useAccess, type MembershipWithBusiness } from '@/auth/useAccess'
import { lastBusiness } from '@/lib/storage'

type BusinessState = {
  current: MembershipWithBusiness
  all: MembershipWithBusiness[]
  select: (businessId: string) => void
}

const BusinessContext = createContext<BusinessState | null>(null)

/** The business being worked on. Remembers the last one chosen on this device. */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const access = useAccess()
  const userId = session!.user.id
  const memberships = access.data?.memberships ?? []
  const [selectedId, setSelectedId] = useState<string | null>(() => lastBusiness.get(userId))

  const select = useCallback(
    (businessId: string) => {
      lastBusiness.set(userId, businessId)
      setSelectedId(businessId)
    },
    [userId],
  )

  const current = pickBusiness(memberships, selectedId) as MembershipWithBusiness | null
  const value = useMemo(
    () => (current ? { current, all: memberships, select } : null),
    [current, memberships, select],
  )

  if (!value) return null
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness(): BusinessState {
  const value = useContext(BusinessContext)
  if (!value) throw new Error('useBusiness must be used inside BusinessProvider')
  return value
}
