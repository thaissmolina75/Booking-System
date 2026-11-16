import { expect, type Page } from '@playwright/test'
import pg from 'pg'
import { localStack } from '../tests/db/local-stack'

export const PASSWORD = 'password123'
export const BUSINESS_A = '10000000-0000-4000-8000-00000000000a'
export const OWNER_A_ID = '00000000-0000-4000-8000-00000000000a'
const MAILPIT = 'http://127.0.0.1:54324'

/** Runs SQL as the database owner on the LOCAL stack, for test setup only. */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: localStack().dbUrl })
  await client.connect()
  try {
    return (await client.query<T>(text, params)).rows
  } finally {
    await client.end()
  }
}

export async function createInvite(email: string, role: 'owner' | 'staff' = 'staff'): Promise<string> {
  const rows = await sql<{ token: string }>(
    `insert into public.invites (business_id, email, role, created_by)
     values ($1, $2, $3, $4) returning token`,
    [BUSINESS_A, email, role, OWNER_A_ID],
  )
  return rows[0].token
}

export async function deleteUser(email: string) {
  await sql(`delete from auth.users where email = $1`, [email])
  await sql(`delete from public.invites where email = $1`, [email])
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page).toHaveURL(/\/login/)
}

/** The newest link in the newest email sent to this address (local Mailpit inbox). */
export async function emailLink(to: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    if (messages.length > 0) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as {
        HTML: string
      }
      const href = /href="([^"]+\/auth\/v1\/verify[^"]+)"/.exec(message.HTML)
      if (href) {
        await fetch(`${MAILPIT}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ IDs: [messages[0].ID] }),
        })
        return href[1].replace(/&amp;/g, '&')
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`No email with a link arrived for ${to}`)
}
