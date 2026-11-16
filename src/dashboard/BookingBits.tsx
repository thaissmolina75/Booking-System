import { MapPin, MessageCircle, Phone, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDay } from '@/lib/dates'
import { peopleLabel, SOURCE_LABELS, STATUS_LABELS, whatsappLink } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Booking, BookingStatus } from './api'

const statusStyle: Record<BookingStatus, string> = {
  pending: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  declined: 'bg-bad-soft text-bad',
  cancelled: 'bg-muted text-muted-foreground',
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', statusStyle[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Tap to open a WhatsApp chat with the customer. */
export function PhoneLink({ phone }: { phone: string | null }) {
  if (!phone) return <span className="text-muted-foreground">No phone</span>
  const href = whatsappLink(phone)
  if (!href) return <span>{phone}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline"
      aria-label={`Message ${phone} on WhatsApp`}
    >
      <MessageCircle className="size-[1.15rem]" aria-hidden />
      {phone}
    </a>
  )
}

/**
 * A booking drawn as a ticket: the code sits on a stub, separated from the
 * details by a perforated edge.
 */
export function BookingTicket({ booking, actions }: { booking: Booking; actions?: ReactNode }) {
  return (
    <article className="overflow-hidden rounded-2xl border bg-card" data-testid="booking-ticket" data-code={booking.code}>
      <div className="flex">
        <div className="flex w-[5.75rem] shrink-0 flex-col items-center justify-center gap-1.5 bg-accent px-1.5 py-4 text-accent-foreground">
          <span className="font-heading text-[0.9rem] leading-none font-semibold whitespace-nowrap tabular">{booking.code}</span>
          <span className="text-center text-xs leading-tight">{SOURCE_LABELS[booking.source]}</span>
        </div>
        <div className="ticket-perforation" aria-hidden />
        <div className="min-w-0 flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-heading text-[1.05rem] leading-snug font-semibold text-balance">
                {booking.tours?.name ?? 'Tour'}
              </p>
              <p className="font-medium">{formatDay(booking.date)}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <dl className="mt-2.5 flex flex-col gap-1 text-[0.95rem]">
            <div className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">People</dt>
              <dd>{peopleLabel(booking.adults, booking.children)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Pickup</dt>
              <dd className="truncate">{booking.pickup_location ?? 'No pickup set'}</dd>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <dt className="sr-only">Customer</dt>
              <dd className="flex min-w-0 flex-wrap items-center gap-x-3">
                <span className="truncate font-medium">{booking.customer_name}</span>
                <PhoneLink phone={booking.customer_phone} />
              </dd>
            </div>
          </dl>
          {booking.notes ? (
            <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm">{booking.notes}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex gap-2 border-t border-dashed p-3">{actions}</div> : null}
    </article>
  )
}

export function TicketSkeleton() {
  return (
    <div className="flex h-36 animate-pulse overflow-hidden rounded-2xl border bg-card" aria-hidden>
      <div className="w-[5.75rem] bg-muted" />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  )
}
