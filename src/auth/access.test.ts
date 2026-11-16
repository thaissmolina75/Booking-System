import { describe, expect, it } from 'vitest'
import {
  canOpenSection,
  inviteTokenFromPath,
  pickBusiness,
  resolveLanding,
  resolvePostAuthPath,
  safeNextPath,
  type Membership,
} from './access'

const a: Membership = { businessId: 'a', businessName: 'Desert Safari', role: 'owner' }
const b: Membership = { businessId: 'b', businessName: 'Marina Cruises', role: 'staff' }
const token = 'a'.repeat(64)

describe('resolveLanding', () => {
  it('sends a platform admin to /admin', () => {
    expect(resolveLanding({ isPlatformAdmin: true, memberships: [] })).toBe('/admin')
  })
  it('sends a platform admin to /admin even with memberships', () => {
    expect(resolveLanding({ isPlatformAdmin: true, memberships: [a] })).toBe('/admin')
  })
  it('sends a member to /dashboard', () => {
    expect(resolveLanding({ isPlatformAdmin: false, memberships: [b] })).toBe('/dashboard')
  })
  it('sends everyone else to the no-access page', () => {
    expect(resolveLanding({ isPlatformAdmin: false, memberships: [] })).toBe('/no-access')
  })
})

describe('pickBusiness', () => {
  it('returns null without memberships', () => {
    expect(pickBusiness([], 'a')).toBeNull()
  })
  it('remembers the last selected business', () => {
    expect(pickBusiness([a, b], 'b')).toBe(b)
  })
  it('falls back to the first when nothing was selected', () => {
    expect(pickBusiness([a, b], null)).toBe(a)
  })
  it('falls back to the first when the remembered one is gone', () => {
    expect(pickBusiness([a, b], 'removed')).toBe(a)
  })
})

describe('safeNextPath', () => {
  it('accepts paths on this site', () => {
    expect(safeNextPath('/dashboard/calendar?month=2026-11')).toBe('/dashboard/calendar?month=2026-11')
  })
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'dashboard', '', null, undefined])(
    'rejects %s',
    (value) => {
      expect(safeNextPath(value)).toBeNull()
    },
  )
})

describe('inviteTokenFromPath', () => {
  it('reads the token from an invite path', () => {
    expect(inviteTokenFromPath(`/invite/${token}`)).toBe(token)
  })
  it('ignores other paths and malformed tokens', () => {
    expect(inviteTokenFromPath('/dashboard')).toBeNull()
    expect(inviteTokenFromPath('/invite/short')).toBeNull()
    expect(inviteTokenFromPath(`/invite/${token}/extra`)).toBeNull()
  })
})

describe('resolvePostAuthPath', () => {
  const member = { isPlatformAdmin: false, memberships: [a] }
  const nobody = { isPlatformAdmin: false, memberships: [] }

  it('honours an explicit destination', () => {
    expect(resolvePostAuthPath({ next: '/dashboard/tours', access: member })).toBe('/dashboard/tours')
  })
  it('returns to the invite after sign-in, even for a user with no access yet', () => {
    expect(resolvePostAuthPath({ next: `/invite/${token}`, access: nobody })).toBe(`/invite/${token}`)
  })
  it('uses a pending invite when the destination was lost in a redirect', () => {
    expect(resolvePostAuthPath({ next: null, pendingInviteToken: token, access: nobody })).toBe(
      `/invite/${token}`,
    )
  })
  it('ignores unsafe destinations and falls back to the landing page', () => {
    expect(resolvePostAuthPath({ next: 'https://evil.example', access: member })).toBe('/dashboard')
    expect(resolvePostAuthPath({ next: '/login', access: nobody })).toBe('/no-access')
  })
  it('lands by access when there is nothing else', () => {
    expect(resolvePostAuthPath({ access: { isPlatformAdmin: true, memberships: [] } })).toBe('/admin')
  })
})

describe('canOpenSection', () => {
  it('lets owners open everything', () => {
    for (const s of ['bookings', 'calendar', 'tours', 'team', 'settings'] as const) {
      expect(canOpenSection('owner', s)).toBe(true)
    }
  })
  it('hides owner-only sections from staff', () => {
    expect(canOpenSection('staff', 'bookings')).toBe(true)
    expect(canOpenSection('staff', 'calendar')).toBe(true)
    expect(canOpenSection('staff', 'tours')).toBe(false)
    expect(canOpenSection('staff', 'team')).toBe(false)
    expect(canOpenSection('staff', 'settings')).toBe(false)
  })
})
