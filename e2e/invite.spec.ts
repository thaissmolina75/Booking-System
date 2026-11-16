import { expect, test } from '@playwright/test'
import { BUSINESS_A, createInvite, deleteUser, emailLink, logIn, signOut, sql } from './helpers'

const INVITED = 'new.guide@example.com'
const NEW_PASSWORD = 'a-brand-new-password'

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  await deleteUser(INVITED)
  await sql(`delete from public.invites where email in ('nobody@example.com', 'late@example.com')`)
})
test.afterAll(async () => {
  await deleteUser(INVITED)
  await sql(`delete from public.invites where email in ('nobody@example.com', 'late@example.com')`)
})

test('new person: invite link, sign up, confirm email, lands in the business', async ({ page }) => {
  const token = await createInvite(INVITED, 'staff')

  await page.goto(`/invite/${token}`)
  await expect(page.getByRole('heading', { name: 'Join Desert Safari Dubai' })).toBeVisible()
  await expect(page.getByText(INVITED)).toBeVisible()

  await page.getByRole('link', { name: 'Create an account' }).click()
  await expect(page).toHaveURL(/\/signup\?next=/)
  await expect(page.getByLabel('Email')).toHaveValue(INVITED)
  await page.getByLabel('Your name').fill('New Guide')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  // Not a member yet: signing up alone grants nothing.
  expect(await sql(`select 1 from public.memberships m join auth.users u on u.id = m.user_id where u.email = $1`, [INVITED])).toHaveLength(0)

  // The confirmation link carries the invite through the redirect.
  await page.goto(await emailLink(INVITED))
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  await expect(page.getByRole('banner').getByText('Desert Safari Dubai')).toBeVisible()
  // Invited as staff: owner pages are hidden.
  await expect(page.getByRole('link', { name: 'Team' })).toHaveCount(0)

  const rows = await sql<{ role: string; accepted: boolean }>(
    `select m.role, (i.accepted_at is not null) as accepted
       from public.memberships m
       join auth.users u on u.id = m.user_id
       join public.invites i on i.email = u.email and i.business_id = m.business_id
      where u.email = $1 and m.business_id = $2`,
    [INVITED, BUSINESS_A],
  )
  expect(rows).toEqual([{ role: 'staff', accepted: true }])

  // Opening the same link again just goes to the app.
  await page.goto(`/invite/${token}`)
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  await signOut(page)

  // To anyone else the used link is dead.
  await page.goto(`/invite/${token}`)
  await expect(page.getByRole('heading', { name: 'This invite has already been used' })).toBeVisible()
})

test('forgot password: reset link, new password, back in', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(INVITED)
  await page.getByRole('link', { name: 'Forgot your password?' }).click()
  await expect(page.getByLabel('Email')).toHaveValue(INVITED)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByText('Check your email')).toBeVisible()

  await page.goto(await emailLink(INVITED))
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await page.getByLabel('New password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  await signOut(page)

  await logIn(page, INVITED, 'password123')
  await expect(page.getByRole('alert')).toHaveText(/Wrong email or password/)
  await logIn(page, INVITED, NEW_PASSWORD)
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
})

test('existing account: log in from the invite and get added', async ({ page }) => {
  const token = await createInvite('nobody@example.com', 'staff')
  await page.goto(`/invite/${token}`)
  await page.getByRole('link', { name: 'I already have an account' }).click()
  await expect(page.getByLabel('Email')).toHaveValue('nobody@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard\/bookings$/)
  await expect(page.getByRole('banner').getByText('Desert Safari Dubai')).toBeVisible()

  // Put the seed user back to "no business".
  await sql(
    `delete from public.memberships where business_id = $1
        and user_id = (select id from auth.users where email = 'nobody@example.com')`,
    [BUSINESS_A],
  )
  await sql(`delete from public.invites where email = 'nobody@example.com'`)
})

test('wrong email: clear error, and nothing is granted', async ({ page }) => {
  const token = await createInvite('late@example.com', 'owner')
  await page.goto(`/invite/${token}`)
  await page.getByRole('link', { name: 'I already have an account' }).click()
  // Signs in with a different account than the invited one.
  await page.getByLabel('Email').fill('nobody@example.com')
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()

  await expect(page).toHaveURL(new RegExp(`/invite/${token}$`))
  await expect(page.getByRole('heading', { name: 'This invite is for a different email' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('late@example.com')
  await expect(page.getByRole('alert')).toContainText('nobody@example.com')

  expect(
    await sql(`select 1 from public.memberships m join auth.users u on u.id = m.user_id where u.email = 'nobody@example.com'`),
  ).toHaveLength(0)
  expect(await sql(`select 1 from public.invites where token = $1 and accepted_at is null`, [token])).toHaveLength(1)

  // Switching account keeps the invite.
  await page.getByRole('button', { name: 'Sign out and switch account' }).click()
  await expect(page.getByRole('heading', { name: 'Join Desert Safari Dubai' })).toBeVisible()
})

test('expired and unknown invite links say so', async ({ page }) => {
  await sql(`update public.invites set expires_at = now() - interval '1 minute' where email = 'late@example.com'`)
  const [{ token }] = await sql<{ token: string }>(`select token from public.invites where email = 'late@example.com'`)
  await page.goto(`/invite/${token}`)
  await expect(page.getByRole('heading', { name: 'This invite has expired' })).toBeVisible()

  await page.goto(`/invite/${'0'.repeat(64)}`)
  await expect(page.getByRole('heading', { name: 'This invite link is not valid' })).toBeVisible()
  await page.goto('/invite/nonsense')
  await expect(page.getByRole('heading', { name: 'This invite link is not valid' })).toBeVisible()
})
