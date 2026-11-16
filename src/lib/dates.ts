/**
 * Calendar dates as 'YYYY-MM-DD' strings.
 *
 * Tour and booking dates are calendar days in the business timezone. They are
 * never turned into a local Date object: `new Date('2026-11-16')` is midnight
 * UTC, which is the 15th in the Americas. Everything here is plain calendar
 * arithmetic on year, month and day numbers, so the result is the same on any
 * phone in any timezone.
 */
export type DateString = string // 'YYYY-MM-DD'
export type MonthString = string // 'YYYY-MM'

const pad = (n: number) => String(n).padStart(2, '0')

export function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const { y, m, d } = parts(value)
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(`${y}-${pad(m)}`)
}

function parts(date: DateString) {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

/** Day arithmetic on a proleptic calendar. UTC is used only as a tz-free counter. */
function fromEpochDay(ms: number): DateString {
  const t = new Date(ms)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Today's calendar date in a timezone, e.g. the business's 'Asia/Dubai'. */
export function todayIn(timezone: string, now: Date = new Date()): DateString {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => f.find((p) => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(date: DateString, days: number): DateString {
  const { y, m, d } = parts(date)
  return fromEpochDay(Date.UTC(y, m - 1, d + days))
}

export function monthOf(date: DateString): MonthString {
  return date.slice(0, 7)
}

export function addMonths(month: MonthString, count: number): MonthString {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + count
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`
}

export function daysInMonth(month: MonthString): number {
  const [y, m] = month.split('-').map(Number)
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

export function firstOfMonth(month: MonthString): DateString {
  return `${month}-01`
}

export function monthDays(month: MonthString): DateString[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`)
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(date: DateString): number {
  const { y, m, d } = parts(date)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** Month laid out in weeks starting Monday; null pads the first and last week. */
export function monthGrid(month: MonthString): (DateString | null)[] {
  const days = monthDays(month)
  const cells: (DateString | null)[] = [...Array<null>(weekdayIndex(days[0])).fill(null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options)
  let f = formatters.get(key)
  if (!f) {
    // timeZone UTC pairs with Date.UTC below: the calendar day is never shifted.
    f = new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' })
    formatters.set(key, f)
  }
  return f
}

function asUtcDate(date: DateString): Date {
  const { y, m, d } = parts(date)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Mon 16 Nov" */
export function formatDay(date: DateString): string {
  return formatter({ weekday: 'short', day: 'numeric', month: 'short' }).format(asUtcDate(date))
}

/** "Monday, 16 November 2026" */
export function formatDayLong(date: DateString): string {
  return formatter({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(asUtcDate(date))
}

/** "November 2026" */
export function formatMonth(month: MonthString): string {
  return formatter({ month: 'long', year: 'numeric' }).format(asUtcDate(firstOfMonth(month)))
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
