import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/lib/database.types'
import { firstOfMonth, type MonthString } from '@/lib/dates'
import { supabase } from '@/lib/supabase'

export type CommissionRow = Database['public']['Functions']['get_commission_report']['Returns'][number]
export type BusinessStatus = Database['public']['Enums']['business_status']
export type CommissionType = Database['public']['Enums']['commission_type']
export type AuditEntry = Database['public']['Tables']['audit_log']['Row']

/** One call gives the whole table: every business with its month's numbers. */
export function useCommissionReport(month: MonthString) {
  return useQuery({
    queryKey: ['admin', 'report', month],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_commission_report', { p_month: firstOfMonth(month) })
      if (error) throw error
      return data
    },
    placeholderData: (previous) => previous,
  })
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function useCreateBusiness() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; slug: string; timezone: string; currency: string; trialDays: number }) => {
      const trialEnds = new Date(Date.now() + input.trialDays * 86_400_000).toISOString()
      const { data, error } = await supabase
        .from('businesses')
        .insert({
          name: input.name.trim(),
          slug: input.slug,
          timezone: input.timezone,
          currency: input.currency.trim().toUpperCase(),
          status: 'trial',
          trial_ends_at: trialEnds,
          // Filled in by the database from the name (see businesses_before_insert).
          booking_prefix: undefined as unknown as string,
        })
        .select('id, name')
        .single()
      if (error) throw error
      return data
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useInviteOwner() {
  return useMutation({
    mutationFn: async (input: { businessId: string; email: string }) => {
      const email = input.email.trim().toLowerCase()
      const cleared = await supabase.from('invites').delete().eq('business_id', input.businessId).eq('email', email).is('accepted_at', null)
      if (cleared.error) throw cleared.error
      const { data, error } = await supabase
        .from('invites')
        .insert({ business_id: input.businessId, email, role: 'owner' })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
  })
}

export type BillingInput = {
  status: BusinessStatus
  /** Calendar date the trial ends (in the business timezone), or '' for none. */
  trialEndDate: string
  timezone: string
  commissionType: CommissionType
  commissionValue: number
}

export function useUpdateBilling(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BillingInput) => {
      const { data, error } = await supabase
        .from('businesses')
        .update({
          status: input.status,
          // End of that day in the business's own timezone; Postgres resolves the zone name.
          trial_ends_at: input.trialEndDate ? `${input.trialEndDate} 23:59:59 ${input.timezone}` : null,
          commission_type: input.commissionType,
          commission_value: input.commissionValue,
        })
        .eq('id', businessId)
        .select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('not_authorized')
    },
    // The database writes the audit entry itself, whatever made the change.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useBillingHistory(businessId: string | null) {
  return useQuery({
    queryKey: ['admin', 'audit', businessId],
    enabled: businessId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('business_id', businessId!)
        .in('action', ['business.billing_updated', 'business.created'])
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data
    },
  })
}

export function useBusinessForView(businessId: string) {
  return useQuery({
    queryKey: ['admin', 'business', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('id, name, status, trial_ends_at, timezone, currency')
        .eq('id', businessId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}
