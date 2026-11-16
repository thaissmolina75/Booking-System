/** Seat colour rules for the calendar. The numbers come from the database. */
export type SeatInfo = { capacity: number; seats_left: number; is_blocked: boolean }
export type SeatTone = 'ok' | 'warn' | 'bad'

/**
 * Green: more than 25% of seats left.
 * Orange: 25% or less left.
 * Red: full, blocked or overbooked.
 */
export function seatTone({ capacity, seats_left, is_blocked }: SeatInfo): SeatTone {
  if (is_blocked || seats_left <= 0 || capacity <= 0) return 'bad'
  return seats_left / capacity > 0.25 ? 'ok' : 'warn'
}

/** Worst tone of several tours on one day: what the day as a whole needs. */
export function worstTone(tones: SeatTone[]): SeatTone | null {
  if (tones.length === 0) return null
  if (tones.includes('bad')) return 'bad'
  return tones.includes('warn') ? 'warn' : 'ok'
}

/** "12 / 30", and for trouble a word that does not depend on colour. */
export function seatLabel({ capacity, seats_left, is_blocked }: SeatInfo): string {
  if (is_blocked) return seats_left < 0 ? `Blocked, ${-seats_left} booked` : 'Blocked'
  if (seats_left < 0) return `Over by ${-seats_left}`
  if (seats_left === 0) return 'Full'
  return `${seats_left} / ${capacity}`
}

export const toneClasses: Record<SeatTone, { chip: string; dot: string; text: string }> = {
  ok: { chip: 'bg-ok-soft text-ok', dot: 'bg-ok', text: 'text-ok' },
  warn: { chip: 'bg-warn-soft text-warn', dot: 'bg-warn', text: 'text-warn' },
  bad: { chip: 'bg-bad-soft text-bad', dot: 'bg-bad', text: 'text-bad' },
}
