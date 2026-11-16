/** Small, failure-tolerant wrappers: storage can be blocked in private mode. */
const PENDING_INVITE = 'booking.pendingInvite'
const lastBusinessKey = (userId: string) => `booking.lastBusiness.${userId}`

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Nothing to do: the app works without it.
  }
}

/** The invite being accepted, kept across sign-up, email confirmation and Google redirects. */
export const pendingInvite = {
  get: () => read(PENDING_INVITE),
  set: (token: string) => write(PENDING_INVITE, token),
  clear: () => write(PENDING_INVITE, null),
}

export const lastBusiness = {
  get: (userId: string) => read(lastBusinessKey(userId)),
  set: (userId: string, businessId: string) => write(lastBusinessKey(userId), businessId),
}
