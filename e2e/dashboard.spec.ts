import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { localStack } from '../tests/db/local-stack'
import { BUSINESS_A, logIn, PASSWORD, sql } from './helpers'

/**
 * Owner and staff on a 390px wide phone, against the local stack.
 * The tests use their own tour so the seat numbers are exact.
 */
const TOUR = 'E2E Sunrise Tour'
const SEATS = 10
let tourId = ''
let bookDay = '' // a day one week ahead (Dubai)
let blockDay = ''

test.describe.configure({ mode: 'serial' })

async function cleanUp() {
  await sql(`delete from public.audit_log where business_id = $1 and (details->>'tour_id' in (select id::text from public.tours where name like 'E2E %') or entity_id in (select id from public.bookings where tour_id in (select id from public.tours where name like 'E2E %')))`, [BUSINESS_A])
  await sql(`delete from public.bookings where tour_id in (select id from public.tours where name like 'E2E %')`)
  await sql(`delete from public.tours where name like 'E2E %'`)
  await sql(`delete from public.invites where email = 'e2e.invite@example.com'`)
  await sql(`update public.businesses set whatsapp_phone = '+971501234567', status = 'active' where id = $1`, [BUSINESS_A])
}

test.beforeAll(async () => {
  await cleanUp()
  const [{ day, block }] = await sql<{ day: string; block: string }>(
    `select (public.local_date(now(), 'Asia/Dubai') + 7)::text as day, (public.local_date(now(), 'Asia/Dubai') + 8)::text as block`,
  )
  bookDay = day
  blockDay = block
  const [tour] = await sql<{ id: string }>(
    `insert into public.tours (business_id, name, price_adult, price_child, default_seats_per_day, sort_order, pickup_zones)
     values ($1, $2, 100, 50, $3, 50, array['Marina','Downtown']) returning id`,
    [BUSINESS_A, TOUR, SEATS],
  )
  tourId = tour.id
  // A chatbot booking waiting for an answer: 2 adults + 1 child.
  await sql(
    `insert into public.bookings (business_id, tour_id, code, date, adults, children, pickup_location, customer_name, customer_phone, source, status, total_amount)
     values ($1, $2, 'E2E-0001', $3, 2, 1, 'Marina', 'Bot Customer', '+971 50 111 2233', 'bot_whatsapp', 'pending', 250)`,
    [BUSINESS_A, tourId, bookDay],
  )
})
test.afterAll(cleanUp)

/** Opens the calendar on the month that contains the date. */
async function openCalendarAt(page: Page, date: string) {
  await page.goto(`/dashboard/calendar?month=${date.slice(0, 7)}`)
  await expect(page.getByTestId('calendar-list')).toBeVisible()
}
const dayRow = (page: Page, date: string) => page.getByTestId('calendar-list').locator(`[data-date="${date}"]`)
const seatsChip = (page: Page, date: string) =>
  dayRow(page, date).locator(`[data-testid="tour-seats"][data-tour="${TOUR}"]`)

test.describe('owner', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'owner.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  })

  test('approves a pending booking from its ticket', async ({ page }) => {
    const ticket = page.locator('[data-testid="booking-ticket"][data-code="E2E-0001"]')
    await expect(ticket).toBeVisible()
    await expect(ticket).toContainText(TOUR)
    await expect(ticket).toContainText('2 adults, 1 child')
    await expect(ticket).toContainText('WhatsApp bot')
    await expect(ticket.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/971501112233')

    await ticket.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText('E2E-0001 approved')).toBeVisible()
    await expect(ticket).toHaveCount(0)

    await page.getByLabel('Search by code, name or phone').fill('E2E-0001')
    const row = page.getByTestId('booking-list').locator('[data-code="E2E-0001"]')
    await expect(row).toContainText('Approved')
    expect(await sql(`select status::text, decided_by is not null as decided from public.bookings where code = 'E2E-0001'`)).toEqual([
      { status: 'approved', decided: true },
    ])
  })

  test('calendar shows seats left, and the day sheet the details', async ({ page }) => {
    await openCalendarAt(page, bookDay)
    await expect(seatsChip(page, bookDay)).toContainText(`7 / ${SEATS}`)

    await dayRow(page, bookDay).click()
    const tour = page.locator(`[data-testid="day-tour"][data-tour="${TOUR}"]`)
    await expect(tour).toContainText('Capacity10')
    await expect(tour).toContainText('Taken3')
    await expect(tour).toContainText('Seats left7')
    await expect(page.getByRole('dialog').locator('[data-code="E2E-0001"]')).toContainText('Approved')
  })

  test('adds a manual booking and sees seats go down; too many people are refused', async ({ page }) => {
    await openCalendarAt(page, bookDay)
    await dayRow(page, bookDay).click()
    await page.getByRole('button', { name: 'Add booking for this day' }).click()

    const form = page.getByRole('dialog', { name: 'Add booking' })
    await form.getByLabel('Tour').selectOption({ label: TOUR })
    await expect(form.getByTestId('seats-left')).toContainText(`7 of ${SEATS} seats left`)

    // More people than seats: the database refuses, and the message says why.
    await form.getByLabel('Adults').fill('9')
    await form.getByLabel('Customer name').fill('Too Many')
    await form.getByRole('button', { name: 'Add booking' }).click()
    await expect(form.getByRole('alert')).toContainText('Not enough seats')
    await expect(form.getByRole('alert')).toContainText('Only 7 seat(s) left')
    expect(await sql(`select 1 from public.bookings where customer_name = 'Too Many'`)).toHaveLength(0)

    await form.getByLabel('Adults').fill('2')
    await form.getByLabel('Customer name').fill('Walk In Guest')
    await form.getByLabel('Phone').fill('+971 50 999 8877')
    await form.getByLabel('Pickup location').fill('Marina')
    await form.getByRole('button', { name: 'Add booking' }).click()
    await expect(page.getByText(/Booking DSD-\d{4} added/)).toBeVisible()

    await expect(seatsChip(page, bookDay)).toContainText(`5 / ${SEATS}`)
    await expect(dayRow(page, bookDay).getByTestId('pending-badge')).toContainText('1 pending')
    expect(await sql(`select source::text, status::text, adults from public.bookings where customer_name = 'Walk In Guest'`)).toEqual([
      { source: 'manual', status: 'pending', adults: 2 },
    ])
  })

  test('a chatbot booking appears on the calendar without reloading', async ({ page }) => {
    await openCalendarAt(page, bookDay)
    await expect(seatsChip(page, bookDay)).toContainText(`5 / ${SEATS}`)
    await page.waitForTimeout(1500) // let the live connection settle
    await sql(
      `insert into public.bookings (business_id, tour_id, code, date, adults, customer_name, source, status)
       values ($1, $2, 'E2E-0002', $3, 4, 'Live Bot Guest', 'bot_instagram', 'pending')`,
      [BUSINESS_A, tourId, bookDay],
    )
    await expect(seatsChip(page, bookDay)).toContainText(`1 / ${SEATS}`, { timeout: 15_000 })
  })

  test('blocks a day with a note, then resets it', async ({ page }) => {
    await openCalendarAt(page, blockDay)
    await expect(seatsChip(page, blockDay)).toContainText(`${SEATS} / ${SEATS}`)
    await dayRow(page, blockDay).click()

    const tour = page.locator(`[data-testid="day-tour"][data-tour="${TOUR}"]`)
    await tour.getByRole('button', { name: 'Edit seats or block' }).click()
    await tour.getByText('Block this day').click()
    await expect(tour.getByRole('switch', { name: 'Block this day' })).toBeChecked()
    await tour.getByLabel('Note').fill('Vehicle service')
    await tour.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Day blocked')).toBeVisible()
    await expect(tour).toContainText('Blocked')
    await expect(tour).toContainText('Vehicle service')
    expect(await sql(`select is_blocked, note from public.availability_overrides where tour_id = $1 and date = $2`, [tourId, blockDay])).toEqual([
      { is_blocked: true, note: 'Vehicle service' },
    ])

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(seatsChip(page, blockDay)).toContainText('Blocked')

    // Lower the seats instead, then go back to the default.
    await dayRow(page, blockDay).click()
    await tour.getByRole('button', { name: 'Edit seats or block' }).click()
    await tour.getByText('Block this day').click()
    await expect(tour.getByRole('switch', { name: 'Block this day' })).not.toBeChecked()
    await tour.getByLabel('Seats for this day').fill('4')
    await tour.getByRole('button', { name: 'Save' }).click()
    await expect(tour).toContainText('Capacity4')
    await tour.getByRole('button', { name: 'Reset to default' }).click()
    await expect(tour).toContainText(`Capacity${SEATS}`)
    expect(await sql(`select 1 from public.availability_overrides where tour_id = $1 and date = $2`, [tourId, blockDay])).toHaveLength(0)
  })

  test('past days are greyed and cannot be edited', async ({ page }) => {
    const [{ past }] = await sql<{ past: string }>(`select (public.local_date(now(), 'Asia/Dubai') - 1)::text as past`)
    await openCalendarAt(page, past)
    await expect(dayRow(page, past)).toHaveAttribute('data-past', 'true')
    await dayRow(page, past).click()
    await expect(page.getByText('Past day. Shown for reference only.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit seats or block' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add booking for this day' })).toHaveCount(0)
  })

  test('exports bookings as CSV', async ({ page }) => {
    await page.getByLabel('Search by code, name or phone').fill('E2E-')
    await expect(page.getByTestId('booking-list').locator('[data-code="E2E-0001"]')).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Bookings CSV' }).click()
    const file = await (await download).path()
    const csv = await readFile(file, 'utf8')
    expect(csv).toContain('Code,Tour,Date,Adults,Children,Pickup,Customer,Phone,Source,Status')
    expect(csv).toContain(`E2E-0001,${TOUR},${bookDay},2,1,Marina,Bot Customer,'+971 50 111 2233,WhatsApp bot,Approved`)
    expect(csv).not.toContain('MC-0001') // nothing from the other business
  })

  test('manages tours: add with pickup zones, deactivate', async ({ page }) => {
    await page.goto('/dashboard/tours')
    await page.getByRole('button', { name: 'Add tour' }).click()
    const form = page.getByRole('dialog', { name: 'Add tour' })
    await form.getByLabel('Name').fill('E2E Camel Trek')
    await form.getByLabel('Adult price (AED)').fill('180')
    await form.getByLabel('Seats per day').fill('12')
    await form.getByLabel('Pickup zones', { exact: true }).fill('Deira')
    await form.getByRole('button', { name: 'Add', exact: true }).click()
    await form.getByLabel('Pickup zones', { exact: true }).fill('JBR')
    await form.getByLabel('Pickup zones', { exact: true }).press('Enter')
    await form.getByRole('button', { name: 'Add tour' }).click()

    const card = page.getByTestId('tour-list').locator('[data-tour="E2E Camel Trek"]')
    await expect(card).toContainText('AED')
    await expect(card).toContainText('180')
    await expect(card).toContainText('Deira')
    await expect(card).toContainText('JBR')

    await card.getByRole('button', { name: 'Deactivate' }).click()
    await expect(card).toContainText('Inactive')
    expect(await sql(`select is_active, pickup_zones, default_seats_per_day from public.tours where name = 'E2E Camel Trek'`)).toEqual([
      { is_active: false, pickup_zones: ['Deira', 'JBR'], default_seats_per_day: 12 },
    ])
  })

  test('invites a team member and gets a link; the only owner cannot be removed', async ({ page }) => {
    await page.goto('/dashboard/team')
    await page.getByLabel('Email').fill('E2E.Invite@example.com')
    await page.getByRole('button', { name: 'Create invite' }).click()
    await expect(page.getByText('Invite ready for e2e.invite@example.com')).toBeVisible()
    const [{ token }] = await sql<{ token: string }>(`select token from public.invites where email = 'e2e.invite@example.com'`)
    await expect(page.getByTestId('invite-link').first()).toHaveValue(`http://127.0.0.1:5173/invite/${token}`)

    const members = page.getByTestId('member-list')
    await expect(members.locator('[data-email="owner.a@example.com"]')).toContainText('Only owner, cannot be removed')
    await expect(members.locator('[data-email="staff.a@example.com"]').getByRole('button', { name: 'Remove' })).toBeVisible()

    await page.getByTestId('invite-list').locator('[data-email="e2e.invite@example.com"]').getByRole('button', { name: 'Revoke' }).click()
    await expect(page.getByText('Invite for e2e.invite@example.com revoked')).toBeVisible()
    expect(await sql(`select 1 from public.invites where email = 'e2e.invite@example.com'`)).toHaveLength(0)
  })

  test('saves settings; plan details are read-only', async ({ page }) => {
    await page.goto('/dashboard/settings')
    await page.getByLabel('WhatsApp number').fill('+971 50 000 1111')
    await page.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()
    expect(await sql(`select whatsapp_phone from public.businesses where id = $1`, [BUSINESS_A])).toEqual([{ whatsapp_phone: '+971 50 000 1111' }])

    const plan = page.getByTestId('plan')
    await expect(plan).toContainText('Active')
    await expect(plan).toContainText('10% of each approved chatbot booking')
    await expect(plan.locator('input, select, button')).toHaveCount(0)
  })

  test('shows the paused banner when suspended, and everything still works', async ({ page }) => {
    await sql(`update public.businesses set status = 'suspended' where id = $1`, [BUSINESS_A])
    await page.reload()
    await expect(page.getByTestId('paused-banner')).toHaveText('Automation paused. Contact your provider.')
    await expect(page.getByRole('button', { name: 'Add booking' })).toBeEnabled()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Contacts CSV' }).click()
    expect((await download).suggestedFilename()).toMatch(/^contacts-\d{4}-\d{2}-\d{2}\.csv$/)
    await sql(`update public.businesses set status = 'active' where id = $1`, [BUSINESS_A])
  })
})

test.describe('staff', () => {
  test('sees bookings and calendar only, and can decide bookings', async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'staff.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    for (const tab of ['Tours', 'Team', 'Settings']) await expect(page.getByRole('link', { name: tab })).toHaveCount(0)

    // Staff can approve.
    const ticket = page.locator('[data-testid="booking-ticket"][data-code="E2E-0002"]')
    await ticket.getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText('E2E-0002 approved')).toBeVisible()
    // ...but there is no cancel action for staff.
    await page.getByLabel('Search by code, name or phone').fill('E2E-0002')
    await expect(page.getByTestId('booking-list').locator('[data-code="E2E-0002"]')).toContainText('Approved')
    await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0)

    // Calendar is read-only for staff.
    await openCalendarAt(page, bookDay)
    await dayRow(page, bookDay).click()
    await expect(page.getByText('Only the owner can change seats.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit seats or block' })).toHaveCount(0)
  })

  test('owner actions are rejected by the database, not just hidden', async () => {
    const stack = localStack()
    const staff = createClient(stack.apiUrl, stack.anonKey, { auth: { persistSession: false } })
    expect((await staff.auth.signInWithPassword({ email: 'staff.a@example.com', password: PASSWORD })).error).toBeNull()

    const setDay = await staff.rpc('set_day_availability', { p_tour_id: tourId, p_date: blockDay, p_seats: 1, p_is_blocked: true, p_note: 'x' })
    expect(setDay.error?.message).toBe('not_authorized')
    const reset = await staff.rpc('reset_day_availability', { p_tour_id: tourId, p_date: blockDay })
    expect(reset.error?.message).toBe('not_authorized')
    const [{ id: bookingId }] = await sql<{ id: string }>(`select id from public.bookings where code = 'E2E-0001'`)
    const cancel = await staff.rpc('cancel_booking', { p_booking_id: bookingId })
    expect(cancel.error?.message).toBe('not_authorized')

    const tourEdit = await staff.from('tours').update({ price_adult: 1 }).eq('id', tourId).select('id')
    expect(tourEdit.data).toEqual([])
    const tourAdd = await staff.from('tours').insert({ business_id: BUSINESS_A, name: 'E2E Staff Tour' })
    expect(tourAdd.error?.code).toBe('42501')
    const settings = await staff.from('businesses').update({ name: 'Staff Was Here' }).eq('id', BUSINESS_A).select('id')
    expect(settings.data).toEqual([])
    const invite = await staff.from('invites').insert({ business_id: BUSINESS_A, email: 'e2e.invite@example.com', role: 'owner' })
    expect(invite.error?.code).toBe('42501')
    const team = await staff.rpc('get_team_members', { p_business_id: BUSINESS_A })
    expect(team.data).toEqual([])
    const direct = await staff.from('bookings').insert({ business_id: BUSINESS_A, tour_id: tourId, code: 'E2E-9999', date: bookDay, adults: 1, customer_name: 'x', source: 'manual' })
    expect(direct.error?.code).toBe('42501')

    expect(
      await sql(`select b.name, t.price_adult::int as price, (select count(*)::int from public.availability_overrides where tour_id = t.id) as overrides,
                        (select status::text from public.bookings where code = 'E2E-0001') as booking
                   from public.businesses b join public.tours t on t.business_id = b.id where t.id = $1`, [tourId]),
    ).toEqual([{ name: 'Desert Safari Dubai', price: 100, overrides: 0, booking: 'approved' }])
  })
})
