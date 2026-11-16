/** Turns database and auth errors into a sentence a person can act on. */
const MESSAGES: Record<string, string> = {
  not_authorized: "You don't have permission to do that.",
  not_enough_seats: 'Not enough seats left on this day.',
  date_blocked: 'This day is blocked for this tour.',
  date_in_past: 'That date is in the past.',
  tour_inactive: 'This tour is not active.',
  tour_not_found: 'Tour not found.',
  booking_not_found: 'Booking not found.',
  booking_not_pending: 'This booking has already been decided.',
  booking_not_active: 'This booking is already declined or cancelled.',
  protected_field: 'Only your provider can change that.',
  last_owner: 'A business must keep at least one owner.',
  invite_not_found: 'This invite link is not valid.',
  invite_already_used: 'This invite has already been used.',
  invite_expired: 'This invite has expired. Ask for a new one.',
  invite_email_mismatch: 'This invite was sent to a different email address.',
  email_not_confirmed: 'Confirm your email address first, then open the invite link again.',
  automation_paused: 'Automation is paused for this business.',
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Confirm your email first. Check your inbox for the link.',
  user_already_exists: 'An account with this email already exists. Log in instead.',
  weak_password: 'Choose a longer password (at least 8 characters).',
  same_password: 'Choose a password you have not used before.',
  over_email_send_rate_limit: 'Too many emails sent. Wait a minute and try again.',
  provider_disabled: 'Google sign-in is not set up yet.',
  validation_failed: 'Google sign-in is not set up yet.',
}

type ErrorLike = { message?: string; details?: string | null; code?: string } | null | undefined

export function errorCode(error: ErrorLike): string | null {
  return error?.message && error.message in MESSAGES ? error.message : null
}

export function errorText(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const e = error as ErrorLike
  if (!e) return fallback
  if (e.message && e.message in MESSAGES) {
    // The database sends a specific sentence in details (e.g. seats left).
    return e.details && e.details.length < 200 ? e.details : MESSAGES[e.message]
  }
  if (e.code && e.code in AUTH_MESSAGES) return AUTH_MESSAGES[e.code]
  if (e.message === 'Failed to fetch') return 'No connection. Check your internet and try again.'
  return e.message && e.message.length < 200 ? e.message : fallback
}
