import { describe, expect, it } from 'vitest'
import { isAutomationPaused, peopleLabel, searchPattern, whatsappLink } from './format'

describe('whatsappLink', () => {
  it('builds a wa.me link from an international number', () => {
    expect(whatsappLink('+971 50 123 4567')).toBe('https://wa.me/971501234567')
    expect(whatsappLink('00971-50-123-4567')).toBe('https://wa.me/971501234567')
  })
  it('returns nothing for missing or unusable numbers', () => {
    expect(whatsappLink(null)).toBeNull()
    expect(whatsappLink('')).toBeNull()
    expect(whatsappLink('12345')).toBeNull()
  })
})

describe('peopleLabel', () => {
  it('counts adults and children in words', () => {
    expect(peopleLabel(1, 0)).toBe('1 adult')
    expect(peopleLabel(2, 1)).toBe('2 adults, 1 child')
    expect(peopleLabel(4, 3)).toBe('4 adults, 3 children')
  })
})

describe('searchPattern', () => {
  it('wraps the text for a contains search', () => {
    expect(searchPattern('  DS-0142 ')).toBe('%DS-0142%')
    expect(searchPattern('+971 50')).toBe('%+971 50%')
  })
  it('removes characters that would break out of the filter', () => {
    expect(searchPattern('a,b)or(status.eq.approved')).toBe('%a b or status.eq.approved%')
    expect(searchPattern('100%')).toBe('%100%')
    expect(searchPattern(' ,() ')).toBeNull()
  })
})

describe('isAutomationPaused', () => {
  const now = new Date('2026-11-16T12:00:00Z')
  it('is paused when suspended', () => {
    expect(isAutomationPaused('suspended', null, now)).toBe(true)
  })
  it('is paused on a trial that has ended', () => {
    expect(isAutomationPaused('trial', '2026-11-15T00:00:00Z', now)).toBe(true)
  })
  it('runs on an active business or a live or open-ended trial', () => {
    expect(isAutomationPaused('active', '2020-01-01T00:00:00Z', now)).toBe(false)
    expect(isAutomationPaused('trial', '2026-12-01T00:00:00Z', now)).toBe(false)
    expect(isAutomationPaused('trial', null, now)).toBe(false)
  })
})
