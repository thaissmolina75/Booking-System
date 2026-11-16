import { expect, test } from '@playwright/test'
import { logIn, signOut } from './helpers'

test.describe('where sign-in leads', () => {
  test('signed-out visitors are sent to log in and returned afterwards', async ({ page }) => {
    await page.goto('/dashboard/calendar')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fcalendar/)
    await logIn(page, 'owner.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/calendar$/)
  })

  test('platform admin lands on /admin', async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'admin@example.com')
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: 'Platform admin' })).toBeVisible()
  })

  test('a member lands on the dashboard of their business', async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'owner.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    await expect(page.getByRole('banner').getByText('Desert Safari Dubai')).toBeVisible()
    for (const tab of ['Bookings', 'Calendar', 'Tours', 'Team', 'Settings']) {
      await expect(page.getByRole('link', { name: tab }).last()).toBeVisible()
    }
    // A member cannot open the admin panel.
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  })

  test('a user without a business sees "No access yet" and can sign out', async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'nobody@example.com')
    await expect(page).toHaveURL(/\/no-access$/)
    await expect(page.getByRole('heading', { name: 'No access yet' })).toBeVisible()
    await expect(
      page.getByText(
        "Your account isn't linked to a business yet. Ask the business owner or your provider to invite you.",
      ),
    ).toBeVisible()
    // Typing a protected address does not get them in either.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/no-access$/)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/no-access$/)
    await signOut(page)
  })

  test('staff do not see owner pages and cannot open them by address', async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'staff.a@example.com')
    await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    await expect(page.getByRole('link', { name: 'Calendar' }).last()).toBeVisible()
    for (const tab of ['Tours', 'Team', 'Settings']) {
      await expect(page.getByRole('link', { name: tab })).toHaveCount(0)
    }
    for (const path of ['tours', 'team', 'settings']) {
      await page.goto(`/dashboard/${path}`)
      await expect(page).toHaveURL(/\/dashboard\/bookings$/)
    }
  })

  test('wrong password shows a clear error', async ({ page }) => {
    await page.goto('/login')
    await logIn(page, 'owner.a@example.com', 'not-the-password')
    await expect(page.getByRole('alert')).toHaveText(/Wrong email or password/)
    await expect(page).toHaveURL(/\/login/)
  })
})
