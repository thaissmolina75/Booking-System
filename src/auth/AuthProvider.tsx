import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'

type AuthState = {
  /** undefined while the stored session is being read. */
  session: Session | null | undefined
  /**
   * Signs out and goes to a clean log-in page, so the next person on this
   * device does not land on the page the last one was on. Pass stay: true to
   * remain on the current page (used when switching account on an invite).
   */
  signOut: (options?: { stay?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const queryClient = useQueryClient()

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      // Never show one user's cached data to the next person on this device.
      if (event === 'SIGNED_OUT') queryClient.clear()
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [queryClient])

  const value = useMemo<AuthState>(
    () => ({
      session,
      signOut: async (options) => {
        await supabase.auth.signOut()
        if (!options?.stay) window.location.replace('/login')
      },
    }),
    [session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
