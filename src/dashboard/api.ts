import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Database } from '@/lib/database.types'
import { firstOfMonth, type DateString, type MonthString } from '@/lib/dates'
import { searchPattern } from '@/lib/format'
import { supabase } from '@/lib/supabase'

type Tables = Database['public']['Tables']
export type Booking = Tables['bookings']['Row'] & { tours: { name: string } | null }
export type Tour = Tables['tours']['Row']
export type Business = Tables['businesses']['Row']
export type Invite = Tables['invites']['Row']
export type BookingStatus = Database['public']['Enums']['booking_status']
export type BookingSource = Database['public']['Enums']['booking_source']
export type DayAvailability = Database['public']['Functions']['get_month_availability']['Returns'][number]
export type TeamMember = Database['public']['Functions']['get_team_members']['Returns'][number]

const BOOKING_COLUMNS = '*, tours ( name )'

/** Every query of a business lives under this key, so one call refreshes them all. */
const key = (businessId: string, ...rest: unknown[]) => ['biz', businessId, ...rest]

export function refreshBusiness(queryClient: QueryClient, businessId: string, what?: string) {
  return queryClient.invalidateQueries({ queryKey: what ? key(businessId, what) : key(businessId) })
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
export type BookingFilters = {
  from: DateString | ''
  to: DateString | ''
  tourId: string
  status: BookingStatus | ''
  source: BookingSource | ''
  search: string
}

export const EMPTY_FILTERS: BookingFilters = { from: '', to: '', tourId: '', status: '', source: '', search: '' }
export const LIST_LIMIT = 200

function filteredBookings(businessId: string, filters: BookingFilters) {
  let query = supabase.from('bookings').select(BOOKING_COLUMNS).eq('business_id', businessId)
  if (filters.from) query = query.gte('date', filters.from)
  if (filters.to) query = query.lte('date', filters.to)
  if (filters.tourId) query = query.eq('tour_id', filters.tourId)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.source) query = query.eq('source', filters.source)
  const pattern = searchPattern(filters.search)
  if (pattern) {
    query = query.or(`code.ilike.${pattern},customer_name.ilike.${pattern},customer_phone.ilike.${pattern}`)
  }
  return query.order('date', { ascending: false }).order('created_at', { ascending: false })
}

export function useBookings(businessId: string, filters: BookingFilters) {
  return useQuery({
    queryKey: key(businessId, 'bookings', 'list', filters),
    queryFn: async () => {
      const { data, error } = await filteredBookings(businessId, filters).limit(LIST_LIMIT + 1)
      if (error) throw error
      return data as Booking[]
    },
    placeholderData: (previous) => previous,
  })
}

/** Everything matching the filters, for export. Reads in pages so nothing is cut off. */
export async function fetchAllBookings(businessId: string, filters: BookingFilters): Promise<Booking[]> {
  const page = 1000
  const all: Booking[] = []
  for (let from = 0; ; from += page) {
    const { data, error } = await filteredBookings(businessId, filters)
      .order('id')
      .range(from, from + page - 1)
    if (error) throw error
    all.push(...(data as Booking[]))
    if (data.length < page) return all
  }
}

export function usePendingBookings(businessId: string) {
  return useQuery({
    queryKey: key(businessId, 'bookings', 'pending'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(BOOKING_COLUMNS)
        .eq('business_id', businessId)
        .eq('status', 'pending')
        .order('date')
        .order('created_at')
      if (error) throw error
      return data as Booking[]
    },
  })
}

export function useDayBookings(businessId: string, date: DateString | null) {
  return useQuery({
    queryKey: key(businessId, 'bookings', 'day', date),
    enabled: date !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(BOOKING_COLUMNS)
        .eq('business_id', businessId)
        .eq('date', date!)
        .order('created_at')
      if (error) throw error
      return data as Booking[]
    },
  })
}

export function useDecideBooking(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { bookingId: string; decision: 'approved' | 'declined' }) => {
      const { data, error } = await supabase.rpc('decide_booking', {
        p_booking_id: input.bookingId,
        p_decision: input.decision,
      })
      if (error) throw error
      return data
    },
    // Seats are never guessed: refetch whatever the database now says.
    onSettled: () => refreshBusiness(queryClient, businessId),
  })
}

export function useCancelBooking(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (bookingId: string) => {
      const { data, error } = await supabase.rpc('cancel_booking', { p_booking_id: bookingId })
      if (error) throw error
      return data
    },
    onSettled: () => refreshBusiness(queryClient, businessId),
  })
}

export type NewBooking = {
  tourId: string
  date: DateString
  adults: number
  children: number
  customerName: string
  customerPhone: string
  pickupLocation: string
  notes: string
}

export function useCreateBooking(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewBooking) => {
      const { data, error } = await supabase.rpc('create_booking', {
        p_business_id: businessId,
        p_tour_id: input.tourId,
        p_date: input.date,
        p_adults: input.adults,
        p_children: input.children,
        p_customer_name: input.customerName,
        p_customer_phone: input.customerPhone,
        p_pickup_location: input.pickupLocation,
        p_source: 'manual',
        p_notes: input.notes,
      })
      if (error) throw error
      return data
    },
    onSettled: () => refreshBusiness(queryClient, businessId),
  })
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

/** One database call per month shown. */
export function useMonthAvailability(businessId: string, month: MonthString | null) {
  return useQuery({
    queryKey: key(businessId, 'availability', month),
    enabled: month !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_month_availability', {
        p_business_id: businessId,
        p_month: firstOfMonth(month!),
      })
      if (error) throw error
      return data
    },
    placeholderData: (previous, previousQuery) =>
      // Keep showing the same month while it refreshes, never another month's seats.
      previousQuery?.queryKey[3] === month ? previous : undefined,
  })
}

export function useDayOverrides(businessId: string, date: DateString | null) {
  return useQuery({
    queryKey: key(businessId, 'availability', 'overrides', date),
    enabled: date !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('availability_overrides')
        .select('*')
        .eq('business_id', businessId)
        .eq('date', date!)
      if (error) throw error
      return data
    },
  })
}

export function useSetDayAvailability(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { tourId: string; date: DateString; seats: number | null; isBlocked: boolean; note: string }) => {
      const { error } = await supabase.rpc('set_day_availability', {
        p_tour_id: input.tourId,
        p_date: input.date,
        // The generated types mark this as required; null means "use the tour default".
        p_seats: input.seats as number,
        p_is_blocked: input.isBlocked,
        p_note: input.note,
      })
      if (error) throw error
    },
    onSettled: () => refreshBusiness(queryClient, businessId, 'availability'),
  })
}

export function useResetDayAvailability(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { tourId: string; date: DateString }) => {
      const { error } = await supabase.rpc('reset_day_availability', { p_tour_id: input.tourId, p_date: input.date })
      if (error) throw error
    },
    onSettled: () => refreshBusiness(queryClient, businessId, 'availability'),
  })
}

/**
 * Live updates: when a booking or a day's availability changes for this
 * business (for example a chatbot booking), refetch what is on screen.
 */
export function useBusinessRealtime(businessId: string) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refresh = () => void refreshBusiness(queryClient, businessId)
    const channel = supabase
      .channel(`business-${businessId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `business_id=eq.${businessId}` }, refresh)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'availability_overrides', filter: `business_id=eq.${businessId}` },
        refresh,
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [businessId, queryClient])
}

// ---------------------------------------------------------------------------
// Tours
// ---------------------------------------------------------------------------
export function useTours(businessId: string) {
  return useQuery({
    queryKey: key(businessId, 'tours'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tours')
        .select('*')
        .eq('business_id', businessId)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data
    },
  })
}

export type TourInput = Pick<
  Tour,
  'name' | 'description' | 'price_adult' | 'price_child' | 'duration_text' | 'pickup_zones' | 'default_seats_per_day' | 'is_active'
>

export function useSaveTour(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string | null; values: Partial<TourInput>; sortOrder?: number }) => {
      const result = input.id
        ? await supabase.from('tours').update(input.values).eq('id', input.id).select('id')
        : await supabase
            .from('tours')
            .insert({ ...(input.values as TourInput), business_id: businessId, sort_order: input.sortOrder ?? 0 })
            .select('id')
      if (result.error) throw result.error
      // RLS hides rows instead of raising, so "nothing changed" means "not allowed".
      if (result.data.length === 0) throw new Error('not_authorized')
    },
    onSettled: () => refreshBusiness(queryClient, businessId),
  })
}

export function useReorderTours(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, index) => supabase.from('tours').update({ sort_order: index + 1 }).eq('id', id).select('id')),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
      if (results.some((r) => r.data?.length === 0)) throw new Error('not_authorized')
    },
    // Safe to show at once: order affects no one's seats and is rolled back on error.
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: key(businessId, 'tours') })
      const previous = queryClient.getQueryData<Tour[]>(key(businessId, 'tours'))
      if (previous) {
        const byId = new Map(previous.map((t) => [t.id, t]))
        queryClient.setQueryData(
          key(businessId, 'tours'),
          orderedIds.map((id, index) => ({ ...byId.get(id)!, sort_order: index + 1 })),
        )
      }
      return { previous }
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(key(businessId, 'tours'), context.previous)
    },
    onSettled: () => refreshBusiness(queryClient, businessId),
  })
}

// ---------------------------------------------------------------------------
// Business settings, team, invites
// ---------------------------------------------------------------------------
export function useBusinessDetails(businessId: string) {
  return useQuery({
    queryKey: key(businessId, 'details'),
    queryFn: async () => {
      const { data, error } = await supabase.from('businesses').select('*').eq('id', businessId).single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateBusiness(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Pick<Business, 'name' | 'timezone' | 'whatsapp_phone' | 'instagram_handle'>) => {
      const { data, error } = await supabase.from('businesses').update(values).eq('id', businessId).select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('not_authorized')
    },
    onSettled: async () => {
      await refreshBusiness(queryClient, businessId)
      await queryClient.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useTeam(businessId: string) {
  return useQuery({
    queryKey: key(businessId, 'team'),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_members', { p_business_id: businessId })
      if (error) throw error
      return data
    },
  })
}

export function useRemoveMember(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const { data, error } = await supabase.from('memberships').delete().eq('id', membershipId).select('id')
      if (error) throw error
      if (data.length === 0) throw new Error('not_authorized')
    },
    onSettled: () => refreshBusiness(queryClient, businessId, 'team'),
  })
}

export function useInvites(businessId: string) {
  return useQuery({
    queryKey: key(businessId, 'invites'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('business_id', businessId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateInvite(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { email: string; role: 'owner' | 'staff' }) => {
      const email = input.email.trim().toLowerCase()
      // A new invite replaces an open one for the same person.
      const cleared = await supabase.from('invites').delete().eq('business_id', businessId).eq('email', email).is('accepted_at', null)
      if (cleared.error) throw cleared.error
      const { data, error } = await supabase
        .from('invites')
        .insert({ business_id: businessId, email, role: input.role })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSettled: () => refreshBusiness(queryClient, businessId, 'invites'),
  })
}

export function useRevokeInvite(businessId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('invites').delete().eq('id', inviteId)
      if (error) throw error
    },
    onSettled: () => refreshBusiness(queryClient, businessId, 'invites'),
  })
}

export function inviteLink(token: string): string {
  return new URL(`/invite/${token}`, window.location.origin).toString()
}
