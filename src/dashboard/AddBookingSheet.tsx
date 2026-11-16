import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { SelectField, TextAreaField } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Sheet } from '@/components/app/Sheet'
import { Button } from '@/components/ui/button'
import { formatDay, isDateString, monthOf, todayIn, type DateString } from '@/lib/dates'
import { errorCode, errorText } from '@/lib/errors'
import { seatLabel, seatTone, toneClasses } from '@/lib/seats'
import { cn } from '@/lib/utils'
import { useCreateBooking, useMonthAvailability, useTours } from './api'
import { useBusiness } from './BusinessProvider'

export function AddBookingSheet({
  open,
  onClose,
  initialDate,
  initialTourId,
}: {
  open: boolean
  onClose: () => void
  initialDate?: DateString
  initialTourId?: string
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add booking" description="For phone and walk-in bookings.">
      {open ? <AddBookingForm onDone={onClose} initialDate={initialDate} initialTourId={initialTourId} /> : null}
    </Sheet>
  )
}

function AddBookingForm({
  onDone,
  initialDate,
  initialTourId,
}: {
  onDone: () => void
  initialDate?: DateString
  initialTourId?: string
}) {
  const { current } = useBusiness()
  const today = todayIn(current.timezone)
  const tours = useTours(current.businessId)
  const activeTours = useMemo(() => (tours.data ?? []).filter((t) => t.is_active), [tours.data])

  const [tourId, setTourId] = useState(initialTourId ?? '')
  const [date, setDate] = useState<string>(initialDate && initialDate >= today ? initialDate : today)
  const [adults, setAdults] = useState('2')
  const [children, setChildren] = useState('0')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pickup, setPickup] = useState('')
  const [notes, setNotes] = useState('')

  const selectedTourId = tourId || activeTours[0]?.id || ''
  const tour = activeTours.find((t) => t.id === selectedTourId)
  const validDate = isDateString(date)
  const availability = useMonthAvailability(current.businessId, validDate ? monthOf(date) : null)
  const day = availability.data?.find((d) => d.tour_id === selectedTourId && d.date === date)
  const people = (Number(adults) || 0) + (Number(children) || 0)
  const create = useCreateBooking(current.businessId)

  const inPast = validDate && date < today
  const tooMany = day ? !day.is_blocked && people > day.seats_left : false

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!tour || !validDate) return
    try {
      const booking = await create.mutateAsync({
        tourId: tour.id,
        date,
        adults: Number(adults),
        children: Number(children) || 0,
        customerName: name,
        customerPhone: phone,
        pickupLocation: pickup,
        notes,
      })
      toast.success(`Booking ${booking.code} added`)
      onDone()
    } catch {
      // Shown below from create.error; the seats line refreshes by itself.
    }
  }

  if (tours.isPending) return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-hidden />
  if (activeTours.length === 0) {
    return <Notice tone="info" title="No active tours">Add or activate a tour before taking bookings.</Notice>
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <SelectField label="Tour" value={selectedTourId} onChange={(e) => setTourId(e.target.value)}>
        {activeTours.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </SelectField>
      <Field label="Date" type="date" min={today} required value={date} onChange={(e) => setDate(e.target.value)} />

      {/* Seats for the chosen tour and day, straight from the database. */}
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl px-4 py-3',
          day ? toneClasses[seatTone(day)].chip : 'bg-muted text-muted-foreground',
        )}
        role="status"
        aria-live="polite"
        data-testid="seats-left"
      >
        <span className="font-medium">{validDate ? formatDay(date) : 'Pick a date'}</span>
        <span className="font-heading text-lg font-semibold tabular">
          {inPast
            ? 'Past date'
            : day
              ? day.is_blocked || day.seats_left <= 0
                ? seatLabel(day)
                : `${day.seats_left} of ${day.capacity} seats left`
              : availability.isError
                ? 'Seats unavailable'
                : 'Checking seats…'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Adults" type="number" inputMode="numeric" min={1} required value={adults} onChange={(e) => setAdults(e.target.value)} />
        <Field label="Children" type="number" inputMode="numeric" min={0} value={children} onChange={(e) => setChildren(e.target.value)} />
      </div>
      {tooMany && !create.isError ? (
        <Notice tone="warning" title="Not enough seats">
          {people} people will not fit: {Math.max(day!.seats_left, 0)} seat{day!.seats_left === 1 ? '' : 's'} left on this day.
        </Notice>
      ) : null}

      <Field label="Customer name" autoComplete="off" required value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label="Phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="+971 50 123 4567"
        hint="With country code, so WhatsApp links work."
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Field
        label="Pickup location"
        list="pickup-zones"
        autoComplete="off"
        value={pickup}
        onChange={(e) => setPickup(e.target.value)}
      />
      <datalist id="pickup-zones">{tour?.pickup_zones.map((z) => <option key={z} value={z} />)}</datalist>
      <TextAreaField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      {create.isError ? (
        <Notice
          tone="error"
          title={errorCode(create.error) === 'not_enough_seats' ? 'Not enough seats' : 'Booking not added'}
        >
          {errorText(create.error)}
        </Notice>
      ) : null}

      <Button
        type="submit"
        size="touch"
        disabled={create.isPending || !tour || !validDate || inPast || !name.trim() || !(Number(adults) >= 1)}
      >
        {create.isPending ? 'Adding…' : 'Add booking'}
      </Button>
    </form>
  )
}
