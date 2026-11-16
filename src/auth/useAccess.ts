import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Access, Membership } from './access'
import { useAuth } from './AuthProvider'

export type BusinessStatus = 'trial' | 'active' | 'suspended'

export type MembershipWithBusiness = Membership & {
  status: BusinessStatus
  trialEndsAt: string | null
  timezone: string
  currency: string
}

export type AccessData = Access & { memberships: MembershipWithBusiness[] }

async function loadAccess(userId: string): Promise<AccessData> {
  const [admin, memberships] = await Promise.all([
    supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase
      .from('memberships')
      .select('business_id, role, businesses ( name, status, trial_ends_at, timezone, currency )')
      .eq('user_id', userId)
      .order('created_at'),
  ])
  if (admin.error) throw admin.error
  if (memberships.error) throw memberships.error

  return {
    isPlatformAdmin: admin.data !== null,
    memberships: memberships.data
      .filter((m) => m.businesses !== null)
      .map((m) => ({
        businessId: m.business_id,
        businessName: m.businesses!.name,
        role: m.role,
        status: m.businesses!.status,
        trialEndsAt: m.businesses!.trial_ends_at,
        timezone: m.businesses!.timezone,
        currency: m.businesses!.currency,
      })),
  }
}

/** What the signed-in user may open. The database enforces it; this drives the UI. */
export function useAccess() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['access', userId],
    queryFn: () => loadAccess(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  })
}
