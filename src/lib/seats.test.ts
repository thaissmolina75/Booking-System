import { describe, expect, it } from 'vitest'
import { seatLabel, seatTone, worstTone } from './seats'

const day = (capacity: number, seats_left: number, is_blocked = false) => ({ capacity, seats_left, is_blocked })

describe('seatTone', () => {
  it('is green above 25% left', () => {
    expect(seatTone(day(30, 30))).toBe('ok')
    expect(seatTone(day(30, 8))).toBe('ok') // 26.7%
    expect(seatTone(day(4, 2))).toBe('ok')
  })
  it('is orange at 25% or less', () => {
    expect(seatTone(day(40, 10))).toBe('warn') // exactly 25%
    expect(seatTone(day(30, 7))).toBe('warn')
    expect(seatTone(day(30, 1))).toBe('warn')
  })
  it('is red when full, blocked or overbooked', () => {
    expect(seatTone(day(30, 0))).toBe('bad')
    expect(seatTone(day(5, -5))).toBe('bad')
    expect(seatTone(day(0, 0, true))).toBe('bad')
    expect(seatTone(day(0, -10, true))).toBe('bad')
    expect(seatTone(day(0, 0))).toBe('bad') // a tour with no seats
  })
})

describe('seatLabel', () => {
  it('shows seats left over capacity', () => {
    expect(seatLabel(day(30, 12))).toBe('12 / 30')
  })
  it('names trouble in words, never just by colour', () => {
    expect(seatLabel(day(30, 0))).toBe('Full')
    expect(seatLabel(day(5, -5))).toBe('Over by 5')
    expect(seatLabel(day(0, 0, true))).toBe('Blocked')
    expect(seatLabel(day(0, -10, true))).toBe('Blocked, 10 booked')
  })
})

describe('worstTone', () => {
  it('reports the most urgent tour of the day', () => {
    expect(worstTone([])).toBeNull()
    expect(worstTone(['ok', 'ok'])).toBe('ok')
    expect(worstTone(['ok', 'warn'])).toBe('warn')
    expect(worstTone(['warn', 'bad', 'ok'])).toBe('bad')
  })
})
