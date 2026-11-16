/**
 * Where a signed-in user belongs. Signing in grants nothing by itself:
 * access comes from being a platform admin or having a membership.
 * Pure functions, so the rules are unit-tested without a browser.
 */
export type MembershipRole = 'owner' | 'staff'

export type Membership = {
  businessId: string
  businessName: string
  role: MembershipRole
}

export type Access = {
  isPlatformAdmin: boolean
  memberships: Membership[]
}

export type Landing = '/admin' | '/dashboard' | '/no-access'

export function resolveLanding(access: Access): Landing {
  if (access.isPlatformAdmin) return '/admin'
  if (access.memberships.length > 0) return '/dashboard'
  return '/no-access'
}

/** The business to open: the last one used if still a member, else the first. */
export function pickBusiness(
  memberships: Membership[],
  lastSelectedId: string | null | undefined,
): Membership | null {
  if (memberships.length === 0) return null
  return memberships.find((m) => m.businessId === lastSelectedId) ?? memberships[0]
}

/**
 * Only same-site paths may be used as a post-sign-in destination, so a link
 * like /login?next=https://evil.example cannot send people elsewhere.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null
  if (/[\u0000-\u001f]/.test(next)) return null
  return next
}

const INVITE_PATH = /^\/invite\/([A-Za-z0-9]{32,128})$/

export function inviteTokenFromPath(path: string | null | undefined): string | null {
  const match = path ? INVITE_PATH.exec(path.split('?')[0]) : null
  return match ? match[1] : null
}

/**
 * After sign-in: an explicit destination wins, then a pending invite, then
 * the landing page for this user's access.
 */
export function resolvePostAuthPath(input: {
  next?: string | null
  pendingInviteToken?: string | null
  access: Access
}): string {
  const next = safeNextPath(input.next)
  if (next && next !== '/' && !next.startsWith('/login') && !next.startsWith('/signup')) return next
  if (input.pendingInviteToken) return `/invite/${input.pendingInviteToken}`
  return resolveLanding(input.access)
}

/** Owner-only areas of the dashboard. The database enforces the same rule. */
export const OWNER_ONLY_SECTIONS = ['tours', 'team', 'settings'] as const
export type DashboardSection = 'bookings' | 'calendar' | (typeof OWNER_ONLY_SECTIONS)[number]

export function canOpenSection(role: MembershipRole, section: DashboardSection): boolean {
  if (role === 'owner') return true
  return !(OWNER_ONLY_SECTIONS as readonly string[]).includes(section)
}
