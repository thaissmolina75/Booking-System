import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { localStack } from '../tests/db/local-stack'
import { BUSINESS_A, logIn, PASSWORD, signOut, sql } from './helpers'

/**
 * Phase 5 quality check, one continuous journey on a 390px wide phone with the
 * seed data: the owner approves a pending booking, checks the calendar, blocks
 * a day and adds a manual booking; then staff signs in and is held to its role
 * by the app and by the database.
 */
const TOUR = 'Evening Desert Safari'
const TOUR_ID = '20000000-0000-4000-8000-0000000000a1'
const GUEST = 'Journey Guest'
let day = '' // tomorrow in Dubai: where the seed's pending DSD-0001 sits
let blockDay = ''

async function restore() {
  await sql(`delete from public.audit_log where entity_id in (select id from public.bookings where customer_name = $1)`, [GUEST])
  await sql(`delete from public.bookings where customer_name = $1`, [GUEST])
  await sql(`update public.bookings set status = 'pending', decided_at = null, decided_by = null where code = 'DSD-0001'`)
  if (blockDay) await sql(`delete from public.availability_overrides where tour_id = $1 and date = $2`, [TOUR_ID, blockDay])
}

async function seats(date: string) {
  const [row] = await sql<{ capacity: number; taken: number; seats_left: number; pending: number }>(
    `select coalesce(o.seats, t.default_seats_per_day) as capacity,
            coalesce((select sum(adults + children) from public.bookings b where b.tour_id = t.id and b.date = $2 and b.status in ('pending','approved')), 0)::int as taken,
            (select count(*) from public.bookings b where b.business_id = t.business_id and b.date = $2 and b.status = 'pending')::int as pending
       from public.tours t left join public.availability_overrides o on o.tour_id = t.id and o.date = $2
      where t.id = $1`,
    [TOUR_ID, date],
  )
  return { ...row, seats_left: row.capacity - row.taken }
}

const dayRow = (page: Page, date: string) => page.getByTestId('calendar-list').locator(`[data-date="${date}"]`)
const chip = (page: Page, date: string) => dayRow(page, date).locator(`[data-testid="tour-seats"][data-tour="${TOUR}"]`)
async function openCalendar(page: Page, date: string) {
  await page.getByRole('link', { name: 'Calendar' }).last().click()
  // Wait for the month to load before deciding whether the day is in it.
  await expect(page.getByTestId('calendar-list').locator('[data-date]').first()).toBeVisible()
  if (!(await dayRow(page, date).count())) await page.getByRole('button', { name: 'Next month' }).click()
  await expect(dayRow(page, date)).toBeVisible()
}

test.beforeAll(async () => {
  const [d] = await sql<{ day: string; block: string }>(
    `select (public.local_date(now(), 'Asia/Dubai') + 1)::text as day, (public.local_date(now(), 'Asia/Dubai') + 9)::text as block`,
  )
  day = d.day
  blockDay = d.block
  await restore()
})
test.afterAll(restore)

test('owner and staff journey on a 390px phone', async ({ page }) => {
  expect(page.viewportSize()?.width).toBe(390)
  const before = await seats(day)
  expect(before.pending).toBeGreaterThanOrEqual(1)

  await test.step('owner logs in', async () => {
    await page.goto('/login')
    await logIn(page, 'owner.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    // Nothing is wider than the phone: no sideways scrolling.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  await test.step('calendar shows the seats held by the pending booking', async () => {
    await openCalendar(page, day)
    await expect(chip(page, day)).toContainText(`${before.seats_left} / ${before.capacity}`)
    await expect(dayRow(page, day).getByTestId('pending-badge')).toContainText(`${before.pending} pending`)
  })

  await test.step('owner approves pending booking DSD-0001', async () => {
    await page.getByRole('link', { name: 'Bookings' }).last().click()
    const ticket = page.locator('[data-testid="booking-ticket"][data-code="DSD-0001"]')
    await ticket.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText('DSD-0001 approved')).toBeVisible()
    await expect(ticket).toHaveCount(0)
    expect(await sql(`select status::text from public.bookings where code = 'DSD-0001'`)).toEqual([{ status: 'approved' }])
  })

  await test.step('calendar: its seats stay taken, and one fewer booking is pending', async () => {
    // A pending booking already holds its seats, so approving keeps the number.
    await openCalendar(page, day)
    await expect(chip(page, day)).toContainText(`${before.seats_left} / ${before.capacity}`)
    if (before.pending > 1) {
      await expect(dayRow(page, day).getByTestId('pending-badge')).toContainText(`${before.pending - 1} pending`)
    } else {
      await expect(dayRow(page, day).getByTestId('pending-badge')).toHaveCount(0)
    }
    await dayRow(page, day).click()
    await expect(page.getByRole('dialog').locator('[data-code="DSD-0001"]')).toContainText('Approved')
    await page.getByRole('button', { name: 'Close' }).click()
  })

  await test.step('owner blocks a day', async () => {
    await openCalendar(page, blockDay)
    await dayRow(page, blockDay).click()
    const tour = page.locator(`[data-testid="day-tour"][data-tour="${TOUR}"]`)
    await tour.getByRole('button', { name: 'Edit seats or block' }).click()
    await tour.getByText('Block this day').click()
    await tour.getByLabel('Note').fill('Sandstorm warning')
    await tour.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Day blocked')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(chip(page, blockDay)).toContainText('Blocked')
    expect(await sql(`select is_blocked from public.availability_overrides where tour_id = $1 and date = $2`, [TOUR_ID, blockDay])).toEqual([{ is_blocked: true }])
  })

  await test.step('a blocked day refuses a manual booking', async () => {
    await dayRow(page, blockDay).click()
    await page.getByRole('button', { name: 'Add booking for this day' }).click()
    const form = page.getByRole('dialog', { name: 'Add booking' })
    await form.getByLabel('Tour').selectOption({ label: TOUR })
    await expect(form.getByTestId('seats-left')).toContainText('Blocked')
    await form.getByLabel('Customer name').fill(GUEST)
    await form.getByRole('button', { name: 'Add booking' }).click()
    await expect(form.getByRole('alert')).toContainText('This day is blocked for this tour.')
    await form.getByRole('button', { name: 'Close' }).click()
    expect(await sql(`select 1 from public.bookings where customer_name = $1`, [GUEST])).toHaveLength(0)
  })

  await test.step('owner adds a manual booking and the seats go down', async () => {
    await openCalendar(page, day)
    await dayRow(page, day).click()
    await page.getByRole('button', { name: 'Add booking for this day' }).click()
    const form = page.getByRole('dialog', { name: 'Add booking' })
    await form.getByLabel('Tour').selectOption({ label: TOUR })
    await expect(form.getByTestId('seats-left')).toContainText(`${before.seats_left} of ${before.capacity} seats left`)
    await form.getByLabel('Adults').fill('3')
    await form.getByLabel('Children').fill('1')
    await form.getByLabel('Customer name').fill(GUEST)
    await form.getByLabel('Phone').fill('+971 50 444 5566')
    await form.getByRole('button', { name: 'Add booking' }).click()
    await expect(page.getByText(/Booking DSD-\d{4} added/)).toBeVisible()
    await expect(chip(page, day)).toContainText(`${before.seats_left - 4} / ${before.capacity}`)
    expect(await sql(`select source::text, status::text, adults + children as people, date::text from public.bookings where customer_name = $1`, [GUEST])).toEqual([
      { source: 'manual', status: 'pending', people: 4, date: day },
    ])
  })

  await test.step('staff logs in: owner pages are hidden', async () => {
    await signOut(page)
    await logIn(page, 'staff.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    await expect(page.getByRole('link', { name: 'Bookings' }).last()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Calendar' }).last()).toBeVisible()
    for (const tab of ['Tours', 'Team', 'Settings']) await expect(page.getByRole('link', { name: tab })).toHaveCount(0)
    for (const path of ['tours', 'team', 'settings']) {
      await page.goto(`/dashboard/${path}`)
      await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    }
    await openCalendar(page, blockDay)
    await dayRow(page, blockDay).click()
    await expect(page.getByText('Only the owner can change seats.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit seats or block' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Reset to default' })).toHaveCount(0)
  })

  await test.step('staff: owner actions are rejected by the database itself', async () => {
    // Same sign-in the browser uses, calling the API directly to skip the UI.
    const stack = localStack()
    const staff = createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false } })
    expect((await staff.auth.signInWithPassword({ email: 'staff.a@example.com', password: PASSWORD })).error).toBeNull()

    expect((await staff.rpc('reset_day_availability', { p_tour_id: TOUR_ID, p_date: blockDay })).error?.message).toBe('not_authorized')
    expect((await staff.rpc('set_day_availability', { p_tour_id: TOUR_ID, p_date: blockDay, p_seats: 99, p_is_blocked: false, p_note: '' })).error?.message).toBe('not_authorized')
    const [{ id }] = await sql<{ id: string }>(`select id from public.bookings where code = 'DSD-0001'`)
    expect((await staff.rpc('cancel_booking', { p_booking_id: id })).error?.message).toBe('not_authorized')
    expect((await staff.from('tours').update({ default_seats_per_day: 999 }).eq('id', TOUR_ID).select('id')).data).toEqual([])
    expect((await staff.from('tours').insert({ business_id: BUSINESS_A, name: 'Staff Tour' })).error?.code).toBe('42501')
    expect((await staff.from('businesses').update({ name: 'Renamed' }).eq('id', BUSINESS_A).select('id')).data).toEqual([])
    expect((await staff.from('invites').insert({ business_id: BUSINESS_A, email: 'x@example.com', role: 'owner' })).error?.code).toBe('42501')
    expect((await staff.from('availability_overrides').delete().eq('tour_id', TOUR_ID).select('id')).data).toEqual([])
    expect((await staff.from('memberships').delete().eq('business_id', BUSINESS_A).select('id')).data).toEqual([])
    // And nothing at all from the other business.
    expect((await staff.from('bookings').select('id').eq('business_id', '10000000-0000-4000-8000-00000000000b')).data).toEqual([])

    expect(
      await sql(
        `select b.name, t.default_seats_per_day as seats, (select is_blocked from public.availability_overrides where tour_id = t.id and date = $2) as still_blocked,
                (select status::text from public.bookings where code = 'DSD-0001') as booking,
                (select count(*)::int from public.memberships where business_id = b.id) as members
           from public.businesses b join public.tours t on t.business_id = b.id where t.id = $1`,
        [TOUR_ID, blockDay],
      ),
    ).toEqual([{ name: 'Desert Safari Dubai', seats: 30, still_blocked: true, booking: 'approved', members: 2 }])
  })
})
