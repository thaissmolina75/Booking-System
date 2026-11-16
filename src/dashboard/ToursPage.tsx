import { ArrowDown, ArrowUp, Map as MapIcon, Pencil, Plus, X } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { toast } from 'sonner'
import { EmptyState, PageHeader, TextAreaField, Toggle } from '@/components/app/controls'
import { Field } from '@/components/app/Field'
import { Notice } from '@/components/app/Notice'
import { Sheet } from '@/components/app/Sheet'
import { Button } from '@/components/ui/button'
import { errorText } from '@/lib/errors'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useReorderTours, useSaveTour, useTours, type Tour } from './api'
import { useBusiness } from './BusinessProvider'

export function ToursPage() {
  const { current, readOnly } = useBusiness()
  const tours = useTours(current.businessId)
  const reorder = useReorderTours(current.businessId)
  const save = useSaveTour(current.businessId)
  const [editing, setEditing] = useState<Tour | 'new' | null>(null)

  function move(index: number, by: -1 | 1) {
    const ids = tours.data!.map((t) => t.id)
    const target = index + by
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids, { onError: (error) => toast.error(`Order not saved: ${errorText(error)}`) })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Tours">
        {readOnly ? null : (
          <Button size="touch" onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            Add tour
          </Button>
        )}
      </PageHeader>

      {tours.isPending ? (
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl border bg-card" />
          ))}
        </div>
      ) : tours.isError ? (
        <Notice tone="error" title="Could not load tours">
          {errorText(tours.error)}
        </Notice>
      ) : tours.data.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="No tours yet" action={readOnly ? undefined : <Button size="touch" onClick={() => setEditing('new')}>Add your first tour</Button>}>
          A tour needs a name, prices and how many seats you run per day.
        </EmptyState>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="tour-list">
          {tours.data.map((tour, index) => (
            <li key={tour.id} className={cn('rounded-2xl border bg-card p-4', !tour.is_active && 'bg-muted/50')} data-tour={tour.name}>
              <div className="flex items-start gap-3">
                <div className={cn('flex shrink-0 flex-col gap-1', readOnly && 'hidden')}>
                  <button
                    type="button"
                    aria-label={`Move ${tour.name} up`}
                    disabled={index === 0 || reorder.isPending}
                    onClick={() => move(index, -1)}
                    className="flex size-11 items-center justify-center rounded-lg border bg-card disabled:opacity-35"
                  >
                    <ArrowUp className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${tour.name} down`}
                    disabled={index === tours.data.length - 1 || reorder.isPending}
                    onClick={() => move(index, 1)}
                    className="flex size-11 items-center justify-center rounded-lg border bg-card disabled:opacity-35"
                  >
                    <ArrowDown className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-lg leading-snug font-semibold">{tour.name}</h2>
                    {!tour.is_active ? (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>
                    ) : null}
                  </div>
                  {tour.description ? <p className="mt-0.5 text-[0.95rem] text-muted-foreground">{tour.description}</p> : null}
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[0.95rem]">
                    <div>
                      <dt className="inline text-muted-foreground">Adult </dt>
                      <dd className="inline font-semibold tabular">{formatMoney(Number(tour.price_adult), current.currency)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Child </dt>
                      <dd className="inline font-semibold tabular">{formatMoney(Number(tour.price_child), current.currency)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-muted-foreground">Seats per day </dt>
                      <dd className="inline font-semibold tabular">{tour.default_seats_per_day}</dd>
                    </div>
                    {tour.duration_text ? (
                      <div>
                        <dt className="inline text-muted-foreground">Duration </dt>
                        <dd className="inline font-semibold">{tour.duration_text}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {tour.pickup_zones.length > 0 ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Pickup zones">
                      {tour.pickup_zones.map((zone) => (
                        <li key={zone} className="rounded-full bg-accent px-2.5 py-0.5 text-sm text-accent-foreground">
                          {zone}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className={cn('mt-3 flex flex-wrap gap-2', readOnly && 'hidden')}>
                    <Button variant="outline" className="h-11 bg-card px-4 text-[0.95rem]" onClick={() => setEditing(tour)}>
                      <Pencil aria-hidden />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 px-3 text-[0.95rem]"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate(
                          { id: tour.id, values: { is_active: !tour.is_active } },
                          {
                            onSuccess: () => toast.success(tour.is_active ? `${tour.name} deactivated` : `${tour.name} activated`),
                            onError: (error) => toast.error(errorText(error)),
                          },
                        )
                      }
                    >
                      {tour.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add tour' : 'Edit tour'}
        description={`Prices in ${current.currency}.`}
      >
        {editing !== null ? (
          <TourForm
            key={editing === 'new' ? 'new' : editing.id}
            tour={editing === 'new' ? null : editing}
            nextSortOrder={(tours.data?.length ?? 0) + 1}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

function TourForm({ tour, nextSortOrder, onDone }: { tour: Tour | null; nextSortOrder: number; onDone: () => void }) {
  const { current } = useBusiness()
  const save = useSaveTour(current.businessId)
  const [name, setName] = useState(tour?.name ?? '')
  const [description, setDescription] = useState(tour?.description ?? '')
  const [priceAdult, setPriceAdult] = useState(tour ? String(Number(tour.price_adult)) : '')
  const [priceChild, setPriceChild] = useState(tour ? String(Number(tour.price_child)) : '')
  const [duration, setDuration] = useState(tour?.duration_text ?? '')
  const [seats, setSeats] = useState(tour ? String(tour.default_seats_per_day) : '30')
  const [zones, setZones] = useState<string[]>(tour?.pickup_zones ?? [])
  const [zoneDraft, setZoneDraft] = useState('')
  const [active, setActive] = useState(tour?.is_active ?? true)

  const numbersValid =
    [priceAdult, priceChild].every((v) => v.trim() === '' || Number(v) >= 0) && Number.isInteger(Number(seats)) && Number(seats) >= 0

  function addZone() {
    const zone = zoneDraft.trim()
    if (zone && !zones.some((z) => z.toLowerCase() === zone.toLowerCase())) setZones([...zones, zone])
    setZoneDraft('')
  }

  function onZoneKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addZone()
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const pending = zoneDraft.trim()
    const allZones = pending && !zones.some((z) => z.toLowerCase() === pending.toLowerCase()) ? [...zones, pending] : zones
    save.mutate(
      {
        id: tour?.id ?? null,
        sortOrder: nextSortOrder,
        values: {
          name: name.trim(),
          description: description.trim() || null,
          price_adult: Number(priceAdult) || 0,
          price_child: Number(priceChild) || 0,
          duration_text: duration.trim() || null,
          pickup_zones: allZones,
          default_seats_per_day: Number(seats),
          is_active: active,
        },
      },
      {
        onSuccess: () => {
          toast.success(tour ? 'Tour saved' : 'Tour added')
          onDone()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
      <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Adult price (${current.currency})`} type="number" inputMode="decimal" min={0} step="0.01" value={priceAdult} onChange={(e) => setPriceAdult(e.target.value)} />
        <Field label={`Child price (${current.currency})`} type="number" inputMode="decimal" min={0} step="0.01" value={priceChild} onChange={(e) => setPriceChild(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Seats per day" type="number" inputMode="numeric" min={0} required value={seats} onChange={(e) => setSeats(e.target.value)} />
        <Field label="Duration" placeholder="6 hours" value={duration} onChange={(e) => setDuration(e.target.value)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Pickup zones" placeholder="Marina" value={zoneDraft} onChange={(e) => setZoneDraft(e.target.value)} onKeyDown={onZoneKey} />
          </div>
          <Button type="button" variant="outline" size="touch" className="bg-card" onClick={addZone} disabled={!zoneDraft.trim()}>
            Add
          </Button>
        </div>
        {zones.length > 0 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Pickup zones added">
            {zones.map((zone) => (
              <li key={zone} className="flex items-center rounded-full bg-accent pl-3 text-accent-foreground">
                {zone}
                <button
                  type="button"
                  aria-label={`Remove ${zone}`}
                  onClick={() => setZones(zones.filter((z) => z !== zone))}
                  className="flex size-10 items-center justify-center rounded-full hover:bg-primary/10"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Toggle label="Active (can be booked)" checked={active} onChange={setActive} />
      {save.isError ? <Notice tone="error">{errorText(save.error)}</Notice> : null}
      <Button type="submit" size="touch" disabled={save.isPending || !name.trim() || !numbersValid}>
        {save.isPending ? 'Saving…' : tour ? 'Save tour' : 'Add tour'}
      </Button>
    </form>
  )
}
