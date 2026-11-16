import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { BUSINESS_A, logIn, sql } from './helpers'

/** Platform admin panel on a 390px phone, against the local stack. */
const NEW_BUSINESS = 'E2E Balloon Rides'
let thisMonth = ''
let nextMonth = ''

test.describe.configure({ mode: 'serial' })

async function cleanUp() {
  await sql(`delete from public.businesses where name = $1`, [NEW_BUSINESS])
  await sql(`delete from public.bookings where code like 'ADM-%'`)
  await sql(
    `update public.businesses set status = 'active', trial_ends_at = null, commission_type = 'percent', commission_value = 10 where id = $1`,
    [BUSINESS_A],
  )
}

test.beforeAll(async () => {
  await cleanUp()
  const [m] = await sql<{ this_month: string; next_month: string; day: string }>(
    `select to_char(public.local_date(now(), 'Asia/Dubai'), 'YYYY-MM') as this_month,
            to_char((date_trunc('month', public.local_date(now(), 'Asia/Dubai')::timestamp) + interval '1 month'), 'YYYY-MM') as next_month,
            to_char((date_trunc('month', public.local_date(now(), 'Asia/Dubai')::timestamp) + interval '1 month')::date + 9, 'YYYY-MM-DD') as day`,
  )
  thisMonth = m.this_month
  nextMonth = m.next_month
  // Known numbers for next month in business A (10% commission):
  // approved WhatsApp bot 400 + approved Instagram bot 600 -> owed 100.
  // The approved manual booking and the pending bot booking must not count.
  const tour = '20000000-0000-4000-8000-0000000000a1'
  await sql(
    `insert into public.bookings (business_id, tour_id, code, date, adults, customer_name, source, status, total_amount) values
       ($1, $2, 'ADM-0001', $3, 2, 'Admin WA',      'bot_whatsapp',  'approved', 400),
       ($1, $2, 'ADM-0002', $3, 3, 'Admin IG',      'bot_instagram', 'approved', 600),
       ($1, $2, 'ADM-0003', $3, 4, 'Admin Manual',  'manual',        'approved', 800),
       ($1, $2, 'ADM-0004', $3, 1, 'Admin Pending', 'bot_whatsapp',  'pending',  200)`,
    [BUSINESS_A, tour, m.day],
  )
})
test.afterAll(cleanUp)

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await logIn(page, 'admin@example.com')
  await expect(page).toHaveURL(/\/admin$/)
})

const row = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('business-table').locator(`[data-business="${name}"]`)

test('lists every business with status, trial end and this month’s numbers', async ({ page }) => {
  const a = row(page, 'Desert Safari Dubai')
  await expect(a).toContainText('Active')
  await expect(a).toContainText('Commission 10%')
  const b = row(page, 'Marina Cruises')
  await expect(b).toContainText('Trial')
  await expect(b).toContainText('AED 15 per booking')
  await expect(b).not.toContainText('No end date')
})

test('month selector changes the commission report; manual and pending never count', async ({ page }) => {
  await page.getByLabel('Month').fill(nextMonth)
  const a = row(page, 'Desert Safari Dubai')
  await expect(a.getByTestId('approved-whatsapp')).toHaveText('1')
  await expect(a.getByTestId('approved-instagram')).toHaveText('1')
  await expect(a.getByTestId('approved-manual')).toHaveText('1')
  await expect(a.getByTestId('commission-owed')).toHaveText('AED 100')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Commission CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(`commission-${nextMonth}.csv`)
  const csv = await readFile(await file.path(), 'utf8')
  expect(csv).toContain('Business,Status,Trial ends,Month,Approved WhatsApp bot,Approved Instagram bot,Approved manual,Approved total,Bot revenue,Commission terms,Commission owed,Currency')
  expect(csv).toContain(`Desert Safari Dubai,Active,,${nextMonth},1,1,1,3,1000,10%,100,AED`)

  await page.getByRole('button', { name: 'This month' }).click()
  await expect(page.getByLabel('Month')).toHaveValue(thisMonth)
})

test('creates a business, then gets an owner invite link to copy', async ({ page }) => {
  await page.getByRole('button', { name: 'Create business' }).click()
  const form = page.getByRole('dialog', { name: 'Create business' })
  await form.getByLabel('Business name').fill(NEW_BUSINESS)
  await expect(form.getByLabel('Short name for links')).toHaveValue('e2e-balloon-rides')
  await form.getByRole('button', { name: 'Create business' }).click()
  await expect(page.getByText(`${NEW_BUSINESS} created`)).toBeVisible()

  // Goes straight on to inviting the owner.
  const invite = page.getByRole('dialog', { name: `Invite owner of ${NEW_BUSINESS}` })
  await invite.getByLabel("Owner's email").fill('Balloon.Owner@example.com')
  await invite.getByRole('button', { name: 'Create invite link' }).click()
  const [{ token, role }] = await expect
    .poll(() => sql<{ token: string; role: string }>(`select token, role::text from public.invites where email = 'balloon.owner@example.com'`))
    .toHaveLength(1)
    .then(() => sql<{ token: string; role: string }>(`select token, role::text from public.invites where email = 'balloon.owner@example.com'`))
  expect(role).toBe('owner')
  await expect(invite.getByTestId('owner-invite-link')).toHaveValue(`http://127.0.0.1:5173/invite/${token}`)
  await invite.getByRole('button', { name: 'Close' }).click()

  await expect(row(page, NEW_BUSINESS)).toContainText('Trial')
  expect(
    await sql(`select status::text, booking_prefix, timezone, currency, (trial_ends_at > now() + interval '13 days') as trial_ok from public.businesses where name = $1`, [NEW_BUSINESS]),
  ).toEqual([{ status: 'trial', booking_prefix: 'EBR', timezone: 'Asia/Dubai', currency: 'AED', trial_ok: true }])
})

test('edits status, trial end and commission; every change lands in the audit log', async ({ page }) => {
  const before = await sql<{ n: number }>(`select count(*)::int as n from public.audit_log where business_id = $1 and action = 'business.billing_updated'`, [BUSINESS_A])

  await row(page, 'Desert Safari Dubai').getByRole('button', { name: 'Edit' }).click()
  const form = page.getByRole('dialog', { name: 'Edit Desert Safari Dubai' })
  await form.getByLabel('Status').selectOption('suspended')
  await form.getByLabel('Trial end date').fill('2031-03-15')
  await form.getByLabel('Commission type').selectOption('fixed_per_booking')
  await form.getByLabel('Commission per booking (AED)').fill('25')
  await form.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Desert Safari Dubai updated')).toBeVisible()

  const a = row(page, 'Desert Safari Dubai')
  await expect(a).toContainText('Suspended')
  await expect(a).toContainText('15 Mar 2031')
  await expect(a).toContainText('AED 25 per booking')

  // Stored as the end of 15 March in Dubai, not shifted to another day.
  expect(
    await sql(`select status::text, commission_type::text, commission_value::int as value, (trial_ends_at at time zone 'Asia/Dubai')::text as trial_end from public.businesses where id = $1`, [BUSINESS_A]),
  ).toEqual([{ status: 'suspended', commission_type: 'fixed_per_booking', value: 25, trial_end: '2031-03-15 23:59:59' }])

  const audit = await sql<{ details: Record<string, unknown[]>; by_admin: boolean }>(
    `select details, (user_id = '00000000-0000-4000-8000-000000000001') as by_admin from public.audit_log
      where business_id = $1 and action = 'business.billing_updated' order by id desc limit 1`,
    [BUSINESS_A],
  )
  expect(audit[0].by_admin).toBe(true)
  expect(audit[0].details.status).toEqual(['active', 'suspended'])
  expect(audit[0].details.commission_type).toEqual(['percent', 'fixed_per_booking'])
  expect(Object.keys(audit[0].details).sort()).toEqual(['commission_type', 'commission_value', 'status', 'trial_ends_at'])
  const after = await sql<{ n: number }>(`select count(*)::int as n from public.audit_log where business_id = $1 and action = 'business.billing_updated'`, [BUSINESS_A])
  expect(after[0].n).toBe(before[0].n + 1)

  // The change shows in the sheet's history.
  await a.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByTestId('audit-list')).toContainText('Status: active to suspended')
})

test('opens a business in read-only "view as" mode with a visible banner', async ({ page }) => {
  await row(page, 'Desert Safari Dubai').getByRole('link', { name: 'View as' }).click()
  await expect(page).toHaveURL(new RegExp(`/admin/view/${BUSINESS_A}/bookings$`))
  await expect(page.getByTestId('view-as-banner')).toContainText('Viewing Desert Safari Dubai as platform admin. Read-only.')
  // Suspended in the previous test: the owner's banner shows here too.
  await expect(page.getByTestId('paused-banner')).toBeVisible()

  // Bookings: visible, but no way to act.
  await expect(page.locator('[data-testid="booking-ticket"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Decline' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add booking' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Bookings CSV' })).toBeVisible()

  // Calendar: the day opens, with nothing to edit.
  await page.getByRole('link', { name: 'Calendar' }).last().click()
  await expect(page).toHaveURL(new RegExp(`/admin/view/${BUSINESS_A}/calendar`))
  await page.getByTestId('calendar-list').locator('[data-date]:not([data-past])').first().click()
  await expect(page.locator('[data-testid="day-tour"]').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit seats or block' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add booking for this day' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Close' }).click()

  // Owner pages are visible, without their controls.
  await page.getByRole('link', { name: 'Tours' }).last().click()
  await expect(page.getByTestId('tour-list')).toContainText('Evening Desert Safari')
  await expect(page.getByRole('button', { name: 'Add tour' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit' })).toBeHidden()

  await page.getByRole('link', { name: 'Team' }).last().click()
  await expect(page.getByTestId('member-list')).toContainText('owner.a@example.com')
  await expect(page.getByRole('button', { name: 'Create invite' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Settings' }).last().click()
  await expect(page.getByLabel('Business name')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Save settings' })).toHaveCount(0)

  await page.getByTestId('view-as-banner').getByRole('link', { name: 'Back to admin' }).click()
  await expect(page).toHaveURL(/\/admin$/)
})

test('owners and staff cannot open the admin panel or "view as"', async ({ page }) => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await logIn(page, 'owner.b@example.com')
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  // Even a direct link to another business's "view as" leads back home.
  await page.goto(`/admin/view/${BUSINESS_A}/bookings`)
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  await expect(page.getByRole('banner').getByText('Marina Cruises')).toBeVisible()
})
