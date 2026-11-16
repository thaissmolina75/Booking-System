import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader, SelectField } from '@/components/app/controls'
import { Notice } from '@/components/app/Notice'
import { Button } from '@/components/ui/button'
import {
  addMonths,
  formatDay,
  formatMonth,
  monthDays,
  monthGrid,
  monthOf,
  todayIn,
  WEEKDAYS,
  type DateString,
} from '@/lib/dates'
import { errorText } from '@/lib/errors'
import { seatLabel, seatTone, toneClasses } from '@/lib/seats'
import { cn } from '@/lib/utils'
import { AddBookingSheet } from './AddBookingSheet'
import { useMonthAvailability, type DayAvailability } from './api'
import { useBusiness } from './BusinessProvider'
import { DaySheet } from './DaySheet'

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/

export function CalendarPage() {
  const { current } = useBusiness()
  const today = todayIn(current.timezone)
  const [params, setParams] = useSearchParams()
  const monthParam = params.get('month')
  const month = monthParam && MONTH_PARAM.test(monthParam) ? monthParam : monthOf(today)
  const [tourFilter, setTourFilter] = useState('')
  const [openDay, setOpenDay] = useState<DateString | null>(null)
  const [adding, setAdding] = useState<{ date: DateString; tourId?: string } | null>(null)

  // One database call for the month on screen. Live updates refetch this same query.
  const availability = useMonthAvailability(current.businessId, month)

  const tours = useMemo(() => {
    const seen = new Map<string, string>()
    for (const row of availability.data ?? []) if (!seen.has(row.tour_id)) seen.set(row.tour_id, row.tour_name)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [availability.data])

  const byDay = useMemo(() => {
    const map = new Map<DateString, DayAvailability[]>()
    for (const row of availability.data ?? []) {
      if (tourFilter && row.tour_id !== tourFilter) continue
      const list = map.get(row.date)
      if (list) list.push(row)
      else map.set(row.date, [row])
    }
    return map
  }, [availability.data, tourFilter])

  const goTo = (next: string) => setParams(next === monthOf(today) ? {} : { month: next }, { replace: true })

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Calendar" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-touch" className="bg-card" aria-label="Previous month" onClick={() => goTo(addMonths(month, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-[10.5rem] text-center text-xl font-semibold" aria-live="polite" data-testid="month-title">
            {formatMonth(month)}
          </h2>
          <Button variant="outline" size="icon-touch" className="bg-card" aria-label="Next month" onClick={() => goTo(addMonths(month, 1))}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <Button variant="outline" size="touch" className="bg-card" onClick={() => goTo(monthOf(today))} disabled={month === monthOf(today)}>
          Today
        </Button>
        <SelectField label="Tour" hideLabel className="min-w-40 flex-1 md:max-w-xs md:flex-none" value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
          <option value="">All tours</option>
          {tours.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </SelectField>
      </div>

      <Legend />

      {availability.isError ? (
        <Notice tone="error" title="Could not load the calendar">
          {errorText(availability.error)}
        </Notice>
      ) : availability.isPending ? (
        <CalendarSkeleton />
      ) : tours.length === 0 ? (
        <Notice tone="info" title="No active tours">
          Add a tour and its seats per day to see availability here.
        </Notice>
      ) : (
        <>
          {/* Narrow screens: one row per day. */}
          <ol className="flex flex-col gap-2 md:hidden" data-testid="calendar-list">
            {monthDays(month).map((date) => (
              <li key={date}>
                <DayButton date={date} rows={byDay.get(date) ?? []} today={today} onOpen={setOpenDay} layout="row" />
              </li>
            ))}
          </ol>

          {/* Wide screens: month grid. */}
          <div className="hidden md:block" data-testid="calendar-grid">
            <div className="grid grid-cols-7 gap-1.5 pb-1.5 text-center text-sm font-medium text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid(month).map((date, i) =>
                date ? (
                  <DayButton key={date} date={date} rows={byDay.get(date) ?? []} today={today} onOpen={setOpenDay} layout="cell" />
                ) : (
                  <div key={`pad-${i}`} />
                ),
              )}
            </div>
          </div>
        </>
      )}

      <DaySheet
        date={openDay}
        tours={openDay ? (byDay.get(openDay) ?? []) : []}
        isPast={openDay !== null && openDay < today}
        onClose={() => setOpenDay(null)}
        onAddBooking={(date, tourId) => {
          setOpenDay(null)
          setAdding({ date, tourId: tourId ?? (tourFilter || undefined) })
        }}
      />
      <AddBookingSheet
        key={adding ? `${adding.date}-${adding.tourId}` : 'closed'}
        open={adding !== null}
        onClose={() => setAdding(null)}
        initialDate={adding?.date}
        initialTourId={adding?.tourId}
      />
    </div>
  )
}

function DayButton({
  date,
  rows,
  today,
  onOpen,
  layout,
}: {
  date: DateString
  rows: DayAvailability[]
  today: DateString
  onOpen: (date: DateString) => void
  layout: 'row' | 'cell'
}) {
  const isPast = date < today
  const isToday = date === today
  const pending = rows.reduce((sum, r) => sum + r.pending_count, 0)
  const dayNumber = Number(date.slice(8))
  const summary = rows.map((r) => `${r.tour_name}: ${seatLabel(r)}`).join('. ')

  return (
    <button
      type="button"
      onClick={() => onOpen(date)}
      data-date={date}
      data-past={isPast || undefined}
      aria-label={`${formatDay(date)}${isPast ? ', past' : ''}. ${summary}${pending ? `. ${pending} pending` : ''}`}
      className={cn(
        'w-full rounded-xl border bg-card text-left transition-colors hover:border-ring',
        layout === 'row' ? 'flex min-h-16 items-center gap-3 px-3.5 py-2.5' : 'flex min-h-36 flex-col gap-1.5 p-2',
        isToday && 'border-primary ring-2 ring-primary/25',
        isPast && 'bg-muted/60 text-muted-foreground',
      )}
    >
      <span className={cn('flex shrink-0 items-center gap-2', layout === 'row' ? 'w-[4.75rem] flex-col items-start gap-0' : 'justify-between')}>
        {layout === 'row' ? (
          <>
            <span className="text-sm text-muted-foreground">{formatDay(date).split(' ')[0]}</span>
            <span className="font-heading text-xl leading-none font-semibold tabular">{dayNumber}</span>
          </>
        ) : (
          <span className={cn('font-heading text-base font-semibold tabular', isToday && 'text-primary')}>{dayNumber}</span>
        )}
        {pending > 0 ? (
          <span
            className={cn('rounded-full bg-warn px-2 py-0.5 text-xs font-semibold text-white tabular', layout === 'row' && 'mt-1')}
            data-testid="pending-badge"
          >
            {pending} pending
          </span>
        ) : null}
      </span>
      <span className={cn('flex min-w-0 flex-1 flex-col gap-1', isPast && 'opacity-60')}>
        {rows.map((r) => {
          const tone = toneClasses[seatTone(r)]
          return (
            <span
              key={r.tour_id}
              className={cn('flex gap-x-2 gap-y-0.5 text-sm', layout === 'row' ? 'items-center justify-between' : 'flex-col items-start')}
              data-testid="tour-seats"
              data-tour={r.tour_name}
            >
              <span className="flex max-w-full min-w-0 items-center gap-1.5">
                <span className={cn('size-2 shrink-0 rounded-full', tone.dot)} aria-hidden />
                <span className="truncate">{r.tour_name}</span>
              </span>
              <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 font-semibold tabular', tone.chip)}>{seatLabel(r)}</span>
            </span>
          )
        })}
      </span>
    </button>
  )
}

function Legend() {
  const items = [
    ['ok', 'More than 25% left'],
    ['warn', '25% or less left'],
    ['bad', 'Full, blocked or overbooked'],
  ] as const
  return (
    <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Colour key">
      <li>Seats left / capacity</li>
      {items.map(([tone, label]) => (
        <li key={tone} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', toneClasses[tone].dot)} aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  )
}

function CalendarSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex flex-col gap-2 md:hidden">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
      <div className="hidden grid-cols-7 gap-1.5 md:grid">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    </div>
  )
}
