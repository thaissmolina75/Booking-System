import { Check, Download, Inbox, Plus, Search, X } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState, PageHeader, SelectField } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDay, todayIn } from '@/lib/dates'
import { errorText } from '@/lib/errors'
import { peopleLabel, SOURCE_LABELS, STATUS_LABELS } from '@/lib/format'
import { AddBookingSheet } from './AddBookingSheet'
import {
  EMPTY_FILTERS,
  fetchAllBookings,
  LIST_LIMIT,
  useBookings,
  useCancelBooking,
  useDecideBooking,
  usePendingBookings,
  useTours,
  type Booking,
  type BookingFilters,
} from './api'
import { BookingTicket, PhoneLink, StatusBadge, TicketSkeleton } from './BookingBits'
import { useBusiness } from './BusinessProvider'

export function BookingsPage() {
  const { current, canAct } = useBusiness()
  const [adding, setAdding] = useState(false)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Bookings">
        {canAct ? (
          <Button size="touch" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add booking
          </Button>
        ) : null}
      </PageHeader>
      <PendingSection />
      <AllBookings />
      <AddBookingSheet key={current.businessId} open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function PendingSection() {
  const { current, canAct } = useBusiness()
  const pending = usePendingBookings(current.businessId)
  const decide = useDecideBooking(current.businessId)

  function act(booking: Booking, decision: 'approved' | 'declined') {
    decide.mutate(
      { bookingId: booking.id, decision },
      {
        onSuccess: () => toast.success(`${booking.code} ${decision}`),
        onError: (error) => toast.error(`${booking.code}: ${errorText(error)}`),
      },
    )
  }

  return (
    <section aria-labelledby="pending-heading" className="mb-9">
      <h2 id="pending-heading" className="mb-3 flex items-center gap-2 text-lg font-semibold">
        Waiting for your answer
        {pending.data && pending.data.length > 0 ? (
          <span className="rounded-full bg-warn px-2.5 py-0.5 text-sm font-semibold text-white tabular" data-testid="pending-count">
            {pending.data.length}
          </span>
        ) : null}
      </h2>
      {pending.isPending ? (
        <div className="flex flex-col gap-3">
          <TicketSkeleton />
          <TicketSkeleton />
        </div>
      ) : pending.isError ? (
        <Notice tone="error" title="Could not load pending bookings">
          {errorText(pending.error)}
        </Notice>
      ) : pending.data.length === 0 ? (
        <EmptyState icon={<Inbox />} title="Nothing waiting">
          New bookings from WhatsApp and Instagram show up here to approve or decline.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.data.map((booking) => {
            const busy = decide.isPending && decide.variables?.bookingId === booking.id
            return (
              <li key={booking.id}>
                <BookingTicket
                  booking={booking}
                  actions={
                    canAct ? (
                      <>
                        <Button
                          size="touch"
                          variant="outline"
                          className="flex-1 border-bad/40 bg-card text-bad hover:bg-bad-soft hover:text-bad"
                          disabled={busy}
                          onClick={() => act(booking, 'declined')}
                        >
                          <X aria-hidden />
                          Decline
                        </Button>
                        <Button
                          size="touch"
                          className="flex-[1.4] bg-ok text-white hover:bg-ok/90"
                          disabled={busy}
                          onClick={() => act(booking, 'approved')}
                        >
                          <Check aria-hidden />
                          Approve
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function AllBookings() {
  const { current, isOwner } = useBusiness()
  const [filters, setFilters] = useState<BookingFilters>(EMPTY_FILTERS)
  const deferred = useDeferredValue(filters)
  const bookings = useBookings(current.businessId, deferred)
  const tours = useTours(current.businessId)
  const cancel = useCancelBooking(current.businessId)
  const [exporting, setExporting] = useState<'bookings' | 'contacts' | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const set = <K extends keyof BookingFilters>(k: K, v: BookingFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)
  const rows = bookings.data?.slice(0, LIST_LIMIT) ?? []
  const truncated = (bookings.data?.length ?? 0) > LIST_LIMIT

  async function exportCsv(kind: 'bookings' | 'contacts') {
    setExporting(kind)
    try {
      const all = await fetchAllBookings(current.businessId, filters)
      const stamp = todayIn(current.timezone)
      if (kind === 'bookings') {
        downloadCsv(
          `bookings-${stamp}.csv`,
          toCsv(
            ['Code', 'Tour', 'Date', 'Adults', 'Children', 'Pickup', 'Customer', 'Phone', 'Source', 'Status', 'Total', 'Currency', 'Notes', 'Created at'],
            all.map((b) => [
              b.code, b.tours?.name, b.date, b.adults, b.children, b.pickup_location, b.customer_name,
              b.customer_phone, SOURCE_LABELS[b.source], STATUS_LABELS[b.status], Number(b.total_amount),
              current.currency, b.notes, b.created_at,
            ]),
          ),
        )
      } else {
        const contacts = new Map<string, { name: string; phone: string | null; count: number; last: string }>()
        for (const b of all) {
          const id = `${(b.customer_phone ?? '').replace(/\D/g, '')}|${b.customer_phone ? '' : b.customer_name.toLowerCase()}`
          const c = contacts.get(id)
          if (c) {
            c.count += 1
            if (b.date > c.last) c.last = b.date
          } else contacts.set(id, { name: b.customer_name, phone: b.customer_phone, count: 1, last: b.date })
        }
        downloadCsv(
          `contacts-${stamp}.csv`,
          toCsv(['Name', 'Phone', 'Bookings', 'Latest booking date'], [...contacts.values()].map((c) => [c.name, c.phone, c.count, c.last])),
        )
      }
      toast.success(`Exported ${all.length} booking${all.length === 1 ? '' : 's'}`)
    } catch (error) {
      toast.error(`Export failed: ${errorText(error)}`)
    } finally {
      setExporting(null)
    }
  }

  return (
    <section aria-labelledby="all-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="all-heading" className="text-lg font-semibold">
          All bookings
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 bg-card px-3.5 text-[0.95rem]" disabled={exporting !== null} onClick={() => void exportCsv('bookings')}>
            <Download aria-hidden />
            {exporting === 'bookings' ? 'Exporting…' : 'Bookings CSV'}
          </Button>
          <Button variant="outline" className="h-11 bg-card px-3.5 text-[0.95rem]" disabled={exporting !== null} onClick={() => void exportCsv('contacts')}>
            <Download aria-hidden />
            {exporting === 'contacts' ? 'Exporting…' : 'Contacts CSV'}
          </Button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border bg-card p-3.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            aria-label="Search by code, name or phone"
            placeholder="Search code, name or phone"
            className="h-12 w-full rounded-xl border border-input bg-card pr-3 pl-11 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Field label="From" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set('from', e.target.value)} />
          <Field label="To" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set('to', e.target.value)} />
          <SelectField label="Tour" value={filters.tourId} onChange={(e) => set('tourId', e.target.value)}>
            <option value="">All tours</option>
            {tours.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Status" value={filters.status} onChange={(e) => set('status', e.target.value as BookingFilters['status'])}>
            <option value="">Any status</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Source"
            className="col-span-2 md:col-span-1"
            value={filters.source}
            onChange={(e) => set('source', e.target.value as BookingFilters['source'])}
          >
            <option value="">Any source</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        {filtered ? (
          <button type="button" className="mt-2 min-h-11 font-semibold text-primary underline-offset-4 hover:underline" onClick={() => setFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        ) : null}
      </div>

      {bookings.isPending ? (
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border bg-card" />
          ))}
        </div>
      ) : bookings.isError ? (
        <Notice tone="error" title="Could not load bookings">
          {errorText(bookings.error)}
        </Notice>
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={<Search />} title="No bookings match" action={<Button variant="outline" size="touch" className="bg-card" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button>}>
            Try a different date range, status or search.
          </EmptyState>
        ) : (
          <EmptyState icon={<Inbox />} title="No bookings yet">
            Add a phone or walk-in booking with “Add booking”.
          </EmptyState>
        )
      ) : (
        <>
          <ul className="flex flex-col gap-2" data-testid="booking-list">
            {rows.map((b) => (
              <li key={b.id} className="rounded-xl border bg-card px-4 py-3" data-code={b.code}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-heading font-semibold tabular">{b.code}</span>
                      <span className="truncate font-medium">{b.customer_name}</span>
                    </p>
                    <p className="text-[0.95rem] text-muted-foreground">
                      {formatDay(b.date)}, {b.tours?.name}
                    </p>
                    <p className="text-[0.95rem] text-muted-foreground">
                      {peopleLabel(b.adults, b.children)}, {SOURCE_LABELS[b.source]}
                      {b.pickup_location ? `, ${b.pickup_location}` : ''}
                    </p>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
                  <PhoneLink phone={b.customer_phone} />
                  {isOwner && (b.status === 'pending' || b.status === 'approved') ? (
                    confirming === b.id ? (
                      <span className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          className="h-11 px-3.5 text-[0.95rem]"
                          disabled={cancel.isPending}
                          onClick={() =>
                            cancel.mutate(b.id, {
                              onSuccess: () => toast.success(`${b.code} cancelled`),
                              onError: (error) => toast.error(`${b.code}: ${errorText(error)}`),
                              onSettled: () => setConfirming(null),
                            })
                          }
                        >
                          Yes, cancel {b.code}
                        </Button>
                        <Button variant="ghost" className="h-11 px-3 text-[0.95rem]" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <button type="button" className="min-h-11 font-medium text-muted-foreground underline-offset-4 hover:text-bad hover:underline" onClick={() => setConfirming(b.id)}>
                        Cancel booking
                      </button>
                    )
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {truncated ? (
            <p className="mt-3 text-center text-muted-foreground">
              Showing the latest {LIST_LIMIT}. Narrow the filters to see older ones, or export for the full list.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
