/** wa.me needs the full international number, digits only. */
export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('00')) digits = digits.slice(2)
  return digits.length >= 8 ? `https://wa.me/${digits}` : null
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount}`
  }
}

export function peopleLabel(adults: number, children: number): string {
  const a = `${adults} ${adults === 1 ? 'adult' : 'adults'}`
  if (children === 0) return a
  return `${a}, ${children} ${children === 1 ? 'child' : 'children'}`
}

export const SOURCE_LABELS = {
  bot_whatsapp: 'WhatsApp bot',
  bot_instagram: 'Instagram bot',
  manual: 'Manual',
} as const

export const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  cancelled: 'Cancelled',
} as const

/** Search text made safe for a PostgREST or=(...) filter. */
export function searchPattern(input: string): string | null {
  const cleaned = input.replace(/[,()*%\\"]/g, ' ').trim().replace(/\s+/g, ' ')
  return cleaned ? `%${cleaned}%` : null
}

/** Business automation is paused when suspended, or on a trial that has ended. */
export function isAutomationPaused(
  status: 'trial' | 'active' | 'suspended',
  trialEndsAt: string | null,
  now: Date = new Date(),
): boolean {
  if (status === 'suspended') return true
  return status === 'trial' && trialEndsAt !== null && new Date(trialEndsAt).getTime() < now.getTime()
}
