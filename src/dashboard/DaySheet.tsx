import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Toggle } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Sheet } from '@/components/app/Sheet'
import { Button } from '@/components/ui/button'
import { formatDayLong, type DateString } from '@/lib/dates'
import { errorText } from '@/lib/errors'
import { peopleLabel, SOURCE_LABELS } from '@/lib/format'
import { seatLabel, seatTone, toneClasses } from '@/lib/seats'
import { cn } from '@/lib/utils'
import {
  useDayBookings,
  useDayOverrides,
  useDecideBooking,
  useResetDayAvailability,
  useSetDayAvailability,
  type DayAvailability,
} from './api'
import { PhoneLink, StatusBadge } from './BookingBits'
import { useBusiness } from './BusinessProvider'

export function DaySheet({
  date,
  tours,
  isPast,
  onClose,
  onAddBooking,
}: {
  date: DateString | null
  /** That day's rows from the month already on screen (updates live). */
  tours: DayAvailability[]
  isPast: boolean
  onClose: () => void
  onAddBooking: (date: DateString, tourId?: string) => void
}) {
  const { current, isOwner, canAct } = useBusiness()
  const bookings = useDayBookings(current.businessId, date)
  const overrides = useDayOverrides(current.businessId, isOwner ? date : null)
  const decide = useDecideBooking(current.businessId)
  const canEdit = isOwner && !isPast

  return (
    <Sheet
      open={date !== null}
      onClose={onClose}
      title={date ? formatDayLong(date) : ''}
      description={isPast ? 'Past day. Shown for reference only.' : !isOwner ? 'Only the owner can change seats.' : undefined}
      footer={
        date && canAct && !isPast ? (
          <Button size="touch" className="w-full" onClick={() => onAddBooking(date)}>
            <Plus aria-hidden />
            Add booking for this day
          </Button>
        ) : undefined
      }
    >
      {date ? (
        <div className="flex flex-col gap-6">
          <section aria-label="Seats" className="flex flex-col gap-3">
            {tours.length === 0 ? (
              <p className="text-muted-foreground">No active tours.</p>
            ) : (
              tours.map((tour) => {
                const override = overrides.data?.find((o) => o.tour_id === tour.tour_id) ?? null
                return (
                  <div key={tour.tour_id} className="rounded-xl border p-3.5" data-testid="day-tour" data-tour={tour.tour_name}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-heading text-base font-semibold">{tour.tour_name}</h3>
                      <span className={cn('rounded-full px-2.5 py-1 text-sm font-semibold tabular', toneClasses[seatTone(tour)].chip)}>
                        {seatLabel(tour)}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      {(
                        [
                          ['Capacity', tour.capacity],
                          ['Taken', tour.taken],
                          ['Seats left', tour.seats_left],
                        ] as const
                      ).map(([label, value]) => (
                        <div key={label} className="rounded-lg bg-muted px-2 py-2">
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="font-heading text-xl font-semibold tabular">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    {tour.seats_left < 0 ? (
                      <p className="mt-2 text-sm font-medium text-bad">
                        Overbooked by {-tour.seats_left}. Capacity was lowered after these bookings came in.
                      </p>
                    ) : null}
                    {override?.note ? <p className="mt-2 text-sm text-muted-foreground">Note: {override.note}</p> : null}
                    {canEdit && !overrides.isPending ? (
                      <EditDay
                        key={`${override?.id ?? 'none'}-${override?.seats}-${override?.is_blocked}-${override?.note}`}
                        date={date}
                        tourId={tour.tour_id}
                        seats={override?.seats ?? null}
                        isBlocked={override?.is_blocked ?? false}
                        note={override?.note ?? ''}
                        hasOverride={override !== null}
                      />
                    ) : null}
                  </div>
                )
              })
            )}
          </section>

          <section aria-labelledby="day-bookings">
            <h3 id="day-bookings" className="mb-2 text-base font-semibold">
              Bookings this day
            </h3>
            {bookings.isPending ? (
              <div className="h-20 animate-pulse rounded-xl bg-muted" aria-hidden />
            ) : bookings.isError ? (
              <Notice tone="error">{errorText(bookings.error)}</Notice>
            ) : bookings.data.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground">
                No bookings on this day.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {bookings.data.map((b) => {
                  const busy = decide.isPending && decide.variables?.bookingId === b.id
                  return (
                    <li key={b.id} className="rounded-xl border px-3.5 py-3" data-code={b.code}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p>
                            <span className="font-heading font-semibold tabular">{b.code}</span>{' '}
                            <span className="font-medium">{b.customer_name}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {b.tours?.name}, {peopleLabel(b.adults, b.children)}, {SOURCE_LABELS[b.source]}
                          </p>
                        </div>
                        <StatusBadge status={b.status} />
                      </div>
                      <PhoneLink phone={b.customer_phone} />
                      {b.status === 'pending' && canAct ? (
                        <div className="mt-1 flex gap-2">
                          <Button
                            variant="outline"
                            className="h-11 flex-1 border-bad/40 bg-card text-[0.95rem] text-bad hover:bg-bad-soft hover:text-bad"
                            disabled={busy}
                            onClick={() =>
                              decide.mutate(
                                { bookingId: b.id, decision: 'declined' },
                                { onSuccess: () => toast.success(`${b.code} declined`), onError: (e) => toast.error(errorText(e)) },
                              )
                            }
                          >
                            <X aria-hidden />
                            Decline
                          </Button>
                          <Button
                            className="h-11 flex-1 bg-ok text-[0.95rem] text-white hover:bg-ok/90"
                            disabled={busy}
                            onClick={() =>
                              decide.mutate(
                                { bookingId: b.id, decision: 'approved' },
                                { onSuccess: () => toast.success(`${b.code} approved`), onError: (e) => toast.error(errorText(e)) },
                              )
                            }
                          >
                            <Check aria-hidden />
                            Approve
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </Sheet>
  )
}

function EditDay({
  date,
  tourId,
  seats,
  isBlocked,
  note,
  hasOverride,
}: {
  date: DateString
  tourId: string
  seats: number | null
  isBlocked: boolean
  note: string
  hasOverride: boolean
}) {
  const { current } = useBusiness()
  const [open, setOpen] = useState(false)
  const [seatsText, setSeatsText] = useState(seats === null ? '' : String(seats))
  const [blocked, setBlocked] = useState(isBlocked)
  const [noteText, setNoteText] = useState(note)
  const save = useSetDayAvailability(current.businessId)
  const reset = useResetDayAvailability(current.businessId)
  const error = save.error ?? reset.error
  const seatsValue = seatsText.trim() === '' ? null : Number(seatsText)
  const seatsValid = seatsValue === null || (Number.isInteger(seatsValue) && seatsValue >= 0)

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 bg-card px-4 text-[0.95rem]" onClick={() => setOpen(true)}>
          Edit seats or block
        </Button>
        {hasOverride ? (
          <Button
            variant="ghost"
            className="h-11 px-3 text-[0.95rem]"
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(
                { tourId, date },
                { onSuccess: () => toast.success('Back to the default seats'), onError: (e) => toast.error(errorText(e)) },
              )
            }
          >
            {reset.isPending ? 'Resetting…' : 'Reset to default'}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3 border-t pt-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(
          { tourId, date, seats: seatsValue, isBlocked: blocked, note: noteText },
          {
            onSuccess: () => {
              toast.success(blocked ? 'Day blocked' : 'Seats saved')
              setOpen(false)
            },
          },
        )
      }}
    >
      <Field
        label="Seats for this day"
        type="number"
        inputMode="numeric"
        min={0}
        placeholder="Tour default"
        hint="Leave empty to use the tour's default."
        value={seatsText}
        onChange={(e) => setSeatsText(e.target.value)}
        disabled={blocked}
      />
      <Toggle label="Block this day" checked={blocked} onChange={setBlocked} />
      <Field label="Note" placeholder="Why, for your team" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      {error ? <Notice tone="error">{errorText(error)}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" size="touch" className="flex-1" disabled={save.isPending || !seatsValid}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" size="touch" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
