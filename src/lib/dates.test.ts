import { afterEach, describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  daysInMonth,
  formatDay,
  formatDayLong,
  formatMonth,
  isDateString,
  monthDays,
  monthGrid,
  monthOf,
  todayIn,
  weekdayIndex,
} from './dates'

const originalTz = process.env.TZ
afterEach(() => {
  process.env.TZ = originalTz
})

describe('todayIn', () => {
  it('uses the business timezone, not the device or UTC', () => {
    // 23:30 on 10 March in Dubai (UTC+4)
    expect(todayIn('Asia/Dubai', new Date('2026-03-10T19:30:00Z'))).toBe('2026-03-10')
    // 00:30 on 11 March in Dubai, still the 10th in UTC
    expect(todayIn('Asia/Dubai', new Date('2026-03-10T20:30:00Z'))).toBe('2026-03-11')
    expect(todayIn('UTC', new Date('2026-03-10T20:30:00Z'))).toBe('2026-03-10')
    expect(todayIn('America/New_York', new Date('2026-03-10T03:00:00Z'))).toBe('2026-03-09')
  })
  it('rolls over the year in Dubai four hours before UTC', () => {
    expect(todayIn('Asia/Dubai', new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01')
  })
})

describe.each(['UTC', 'America/Los_Angeles', 'Asia/Dubai', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'])(
  'calendar maths with the device in %s',
  (tz) => {
    it('never shifts a date', () => {
      process.env.TZ = tz
      expect(addDays('2026-11-16', 0)).toBe('2026-11-16')
      expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
      expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
      // Across a daylight-saving change in zones that have one.
      expect(addDays('2026-03-07', 2)).toBe('2026-03-09')
      expect(weekdayIndex('2026-11-16')).toBe(0) // a Monday
      expect(weekdayIndex('2026-11-22')).toBe(6) // a Sunday
      expect(formatDay('2026-11-16')).toBe('Mon 16 Nov')
      expect(formatDayLong('2026-11-01')).toBe('Sunday, 1 November 2026')
      expect(formatMonth('2026-11')).toBe('November 2026')
      expect(monthDays('2026-11')[0]).toBe('2026-11-01')
      expect(monthDays('2026-11').at(-1)).toBe('2026-11-30')
    })
  },
)

describe('months', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2100-02')).toBe(28)
    expect(daysInMonth('2000-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
  })
  it('moves between months across years', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-05', -17)).toBe('2024-12')
    expect(monthOf('2026-11-16')).toBe('2026-11')
  })
  it('lays out a month in Monday-first weeks', () => {
    const grid = monthGrid('2026-11') // 1 Nov 2026 is a Sunday
    expect(grid.length % 7).toBe(0)
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(grid.filter(Boolean)).toHaveLength(30)
    expect(monthGrid('2027-02')).toHaveLength(28) // starts on a Monday, exactly 4 weeks
  })
})

describe('isDateString', () => {
  it('accepts real dates only', () => {
    expect(isDateString('2026-11-16')).toBe(true)
    expect(isDateString('2028-02-29')).toBe(true)
    expect(isDateString('2026-02-29')).toBe(false)
    expect(isDateString('2026-13-01')).toBe(false)
    expect(isDateString('16/11/2026')).toBe(false)
    expect(isDateString('')).toBe(false)
  })
})
