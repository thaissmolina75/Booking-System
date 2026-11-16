/**
 * Phase 1, test 3: two concurrent create_booking calls for the last seats.
 * Only one may succeed.
 *
 * pgTAP runs in a single connection, so this needs real parallel connections.
 * Runs against the LOCAL stack with the seed data (owner.a@example.com).
 */
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localStack } from './local-stack'

const stack = localStack()
const OWNER_EMAIL = 'owner.a@example.com'
const BUSINESS_ID = '10000000-0000-4000-8000-00000000000a'
const OWNER_ID = '00000000-0000-4000-8000-00000000000a'

const admin = new pg.Client({ connectionString: stack.dbUrl })
const tourIds: string[] = []
const openClients: pg.Client[] = []
let today = ''

/** A fresh tour with `seats` seats per day, so each test has its own days. */
async function makeTour(seats: number): Promise<string> {
  const { rows } = await admin.query(
    `insert into public.tours (business_id, name, price_adult, default_seats_per_day, sort_order)
     values ($1, $2, 100, $3, 99) returning id`,
    [BUSINESS_ID, `Concurrency test ${crypto.randomUUID()}`, seats],
  )
  tourIds.push(rows[0].id)
  return rows[0].id
}

/** A database connection that behaves like the signed-in owner (RLS applies). */
async function ownerConnection(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: stack.dbUrl })
  await client.connect()
  openClients.push(client)
  await client.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ sub: OWNER_ID, role: 'authenticated', email: OWNER_EMAIL }),
  ])
  await client.query(`set role authenticated`)
  return client
}

const BOOK_SQL = `select code from public.create_booking($1, $2, $3::date, $4, 0, $5, '+971500000000', 'Marina', 'manual', null)`

function book(client: pg.Client, tourId: string, date: string, people: number, name: string) {
  return client.query(BOOK_SQL, [BUSINESS_ID, tourId, date, people, name])
}

async function seatsTaken(tourId: string, date: string): Promise<number> {
  const { rows } = await admin.query(
    `select coalesce(sum(adults + children), 0)::int as taken from public.bookings
      where tour_id = $1 and date = $2::date and status in ('pending', 'approved')`,
    [tourId, date],
  )
  return rows[0].taken
}

beforeAll(async () => {
  await admin.connect()
  const { rows } = await admin.query(
    `select (public.local_date(now(), 'Asia/Dubai') + 20)::text as day`,
  )
  today = rows[0].day
})

afterAll(async () => {
  await Promise.all(openClients.map((c) => c.end().catch(() => undefined)))
  if (tourIds.length > 0) {
    await admin.query(
      `delete from public.audit_log where entity = 'booking'
         and entity_id in (select id from public.bookings where tour_id = any($1::uuid[]))`,
      [tourIds],
    )
    await admin.query(`delete from public.bookings where tour_id = any($1::uuid[])`, [tourIds])
    await admin.query(`delete from public.tours where id = any($1::uuid[])`, [tourIds])
  }
  await admin.end()
})

describe('create_booking under concurrency', () => {
  it('makes the second transaction wait, then rejects it when the last seats are gone', async () => {
    const tourId = await makeTour(2)
    const first = await ownerConnection()
    const second = await ownerConnection()

    // First caller takes the last 2 seats but has not committed yet.
    await first.query('begin')
    await book(first, tourId, today, 2, 'First in line')

    // Second caller asks for the same seats at the same time.
    let secondSettled = false
    const secondAttempt = book(second, tourId, today, 2, 'Second in line').then(
      (result) => ({ ok: true as const, result }),
      (error: Error) => ({ ok: false as const, error }),
    )
    void secondAttempt.then(() => (secondSettled = true))

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(secondSettled, 'second call must wait for the first to finish').toBe(false)

    await first.query('commit')
    const outcome = await secondAttempt

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.error.message).toBe('not_enough_seats')
    expect(await seatsTaken(tourId, today)).toBe(2)
  })

  it('lets the second transaction through when the first one rolls back', async () => {
    const tourId = await makeTour(2)
    const first = await ownerConnection()
    const second = await ownerConnection()

    await first.query('begin')
    await book(first, tourId, today, 2, 'Changes mind')
    const secondAttempt = book(second, tourId, today, 2, 'Gets the seats')
    await new Promise((resolve) => setTimeout(resolve, 300))
    await first.query('rollback')

    await expect(secondAttempt).resolves.toMatchObject({ rowCount: 1 })
    expect(await seatsTaken(tourId, today)).toBe(2)
  })

  it('never oversells when 12 connections race for 3 seats', async () => {
    const tourId = await makeTour(3)
    const clients = await Promise.all(Array.from({ length: 12 }, () => ownerConnection()))

    const results = await Promise.allSettled(
      clients.map((client, i) => book(client, tourId, today, 1, `Racer ${i}`)),
    )
    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

    expect(succeeded).toHaveLength(3)
    expect(failed).toHaveLength(9)
    for (const f of failed) expect((f.reason as Error).message).toBe('not_enough_seats')
    expect(await seatsTaken(tourId, today)).toBe(3)

    // Booking codes handed out under contention are all different.
    const { rows } = await admin.query(
      `select count(distinct code)::int as codes from public.bookings where tour_id = $1`,
      [tourId],
    )
    expect(rows[0].codes).toBe(3)
  })

  it('allows only one of two simultaneous API calls for the last seats', async () => {
    const tourId = await makeTour(4)
    // Real path the dashboard uses: sign in, then call the RPC over HTTP.
    const supabase = createClient(stack.apiUrl, stack.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signIn = await supabase.auth.signInWithPassword({
      email: OWNER_EMAIL,
      password: 'password123',
    })
    expect(signIn.error).toBeNull()

    const call = (name: string) =>
      supabase.rpc('create_booking', {
        p_business_id: BUSINESS_ID,
        p_tour_id: tourId,
        p_date: today,
        p_adults: 2,
        p_children: 1,
        p_customer_name: name,
        p_customer_phone: '+971500000000',
        p_pickup_location: 'Marina',
        p_source: 'manual',
        p_notes: null,
      })

    const [a, b] = await Promise.all([call('API one'), call('API two')])
    const errors = [a.error, b.error].filter((e) => e !== null)

    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toBe('not_enough_seats')
    expect([a.data, b.data].filter((d) => d !== null)).toHaveLength(1)
    expect(await seatsTaken(tourId, today)).toBe(3)
  })
})
