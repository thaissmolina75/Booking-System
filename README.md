# Booking System

Multi-tenant booking management for tour businesses in Dubai. Three kinds of
users sign in: the platform admin, business owners and their staff. Tourists
never sign in; a WhatsApp/Instagram chatbot (built later) will call the same
database functions.

**Status:** all five phases are done. Verified on local Supabase only; not yet deployed to a hosted project.

## Stack

Vite, React, TypeScript, Tailwind, React Router, TanStack Query, Supabase
(Postgres, Auth, Realtime). Tests: pgTAP for the database, Vitest for unit and
concurrency tests, Playwright for end-to-end (from Phase 2).

## Run it locally

Requires Node 22+ and Docker.

```bash
npm install
npm run db:start      # local Supabase (first run downloads images)
npm run db:reset      # apply migrations and load the seed data
cp .env.example .env.local   # then paste the keys from: npx supabase status
npm run dev
```

Seed sign-ins (local only, password `password123`):

| Email | Access |
| --- | --- |
| `admin@example.com` | Platform admin |
| `owner.a@example.com` | Owner of Desert Safari Dubai |
| `staff.a@example.com` | Staff of Desert Safari Dubai |
| `owner.b@example.com` | Owner of Marina Cruises |
| `nobody@example.com` | Signed up, no business |

## Tests

```bash
npm run test:db            # pgTAP: seats, isolation, permissions, invites, dates, commission
npm run test:concurrency   # parallel create_booking calls against the local stack
npm test                   # unit tests (routing and access rules)
npm run test:e2e           # Playwright at 390px: routing, invite flow, password reset
npm run check:bundle        # builds, then fails if any secret key is in the client bundle
npm run test:all
```

The database and end-to-end tests only ever run against the local stack. The
end-to-end tests read confirmation and reset emails from the local test inbox
(http://127.0.0.1:54324). If Playwright has no browser yet, run
`npx playwright install chromium`, or point `PW_CHROMIUM_PATH` at an installed
Chromium.

## Signing in

Signing in never grants access by itself. After sign-in:

1. a platform admin goes to `/admin`
2. a user with at least one membership goes to `/dashboard` (with a business
   switcher if they have several; the last one chosen is remembered)
3. everyone else sees "No access yet"

People join a business through an invite link, `/invite/<token>`. The invite
survives sign-up, email confirmation and the Google redirect, and only works
for the invited email address.

### Platform admin panel (`/admin`)

- Businesses table for a chosen month: status, trial end, approved bookings by
  source and commission owed, with a CSV export.
- Create a business, then create an owner invite link to send.
- Edit status, trial end and commission. The database writes every such change
  to `audit_log`, whichever way it was made.
- "View as" opens any business's dashboard read-only at
  `/admin/view/<business id>`, with a banner.

### Make yourself platform admin

Platform admins are added with SQL only. Sign up in the app first, then run
this in the Supabase SQL editor (or `psql`):

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@example.com';
```

### Google sign-in

"Continue with Google" needs a Google OAuth client. Email and password work
without it.

**1. Google Cloud Console** (https://console.cloud.google.com)

1. Create or pick a project.
2. APIs & Services > OAuth consent screen: user type External, fill in the app
   name and your support email, add the scopes `openid`, `email` and `profile`.
   While the app is in Testing, add your own Google accounts as test users.
3. APIs & Services > Credentials > Create credentials > OAuth client ID,
   application type **Web application**.
4. **Authorized JavaScript origins**: the addresses the app is served from.
   - Local: `http://127.0.0.1:5173` and `http://localhost:5173`
   - Production: `https://your-app-domain.com`
5. **Authorized redirect URIs**: Google sends the user back to Supabase, not to
   the app, so these are Supabase addresses.
   - Local: `http://127.0.0.1:54321/auth/v1/callback`
   - Production: `https://<your-project-ref>.supabase.co/auth/v1/callback`
6. Create, then copy the **Client ID** and **Client secret**.

**2. Supabase, production (hosted project)**

1. Dashboard > Authentication > Sign In / Providers > Google: turn it on and
   paste the Client ID and Client secret. Save.
2. Dashboard > Authentication > URL Configuration:
   - Site URL: `https://your-app-domain.com`
   - Redirect URLs: add `https://your-app-domain.com/**`
     (the app returns to `/auth/callback` and `/reset-password`).

**3. Supabase, local**

1. Create `supabase/.env` (gitignored) with:

   ```bash
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-client-id
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-client-secret
   ```

2. In `supabase/config.toml`, under `[auth.external.google]`, set
   `enabled = true`.
3. Restart: `npm run db:stop` then `npm run db:start`.

Use the same host in the browser as in the Google settings: `127.0.0.1` and
`localhost` count as different origins.

## How the database protects the data

All business rules live in Postgres, in `supabase/migrations`.

- **Row level security on every table.** Members read only their own
  business. Owners write tours, invites and settings. Staff can approve or
  decline bookings and add manual ones, nothing else. Platform admins can do
  everything. Signed-out visitors can do nothing.
- **Roles live only in `memberships`.** Platform admins are rows in
  `platform_admins`, which can only be edited with SQL.
- **Protected business fields.** Owners can edit name, timezone, WhatsApp and
  Instagram. A trigger rejects changes to status, trial end, commission, slug
  and booking prefix unless the caller is a platform admin.
- **Bookings are created only by `create_booking`.** Nobody has insert rights
  on the table. The function locks the tour and day, so two people can never
  get the same last seats.
- **Dates are calendar dates.** Tour and booking dates are type `date` in the
  business timezone and are never converted through UTC timestamps. "Today"
  is worked out in the business timezone.

### Seat logic

- capacity = the day's override seats if set, otherwise the tour default; 0 when the day is blocked
- taken = adults + children of pending and approved bookings
- seats left = capacity - taken; negative means overbooked and is shown, never hidden

### Functions

| Function | Who | What |
| --- | --- | --- |
| `create_booking` | members (manual only), service role (any source) | Checks date, tour and seats, then inserts |
| `decide_booking` | owner, staff | Approve or decline a pending booking |
| `cancel_booking` | owner | Cancel a pending or approved booking |
| `get_month_availability` | members | One row per active tour per day |
| `set_day_availability` / `reset_day_availability` | owner | Change or clear a day's seats or block; never in the past |
| `accept_invite` | signed-in user whose confirmed email matches | Creates the membership |
| `get_commission_report` | platform admin | Per business: approved bookings by source and commission owed on bot bookings |

Errors use a short code as the message (`not_enough_seats`, `date_blocked`,
`date_in_past`, `tour_inactive`, `not_authorized`, `invite_expired`, ...) and a
readable sentence as the detail.

### Decisions worth knowing

- Booking codes use a prefix taken from the business name (`Desert Safari` gives `DS-0001`).
- Each booking stores its price at creation (`total_amount`), so percent commission does not change when tour prices change.
- The commission report counts bookings by tour date.
- While a business is suspended, or its trial has ended, bot bookings are rejected (`automation_paused`). Manual bookings keep working.
- Invite tokens are visible to owners and platform admins only, not staff.
- Owners change availability only through the functions (so past days stay read-only); they have no direct write access to that table.

## Going live (not done yet)

1. Create a Supabase project and run `npx supabase link`, then
   `npx supabase db push` to apply `supabase/migrations`. Do not run
   `supabase/seed.sql` there: it creates users with a known password.
2. Set the Site URL and redirect URLs, and turn on Google sign-in (see above).
3. Set up an email sender (custom SMTP) in Supabase: the built-in one is
   rate-limited and meant for testing.
4. Host the built app (`npm run build`, the `dist` folder) with
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set, and a rewrite of every
   path to `index.html`.
5. Sign up, then make yourself platform admin with the SQL above.

## Secrets

Only the anon/publishable key goes in the frontend. The service role key
bypasses row level security and must stay on a server. Real `.env` files are
gitignored; `.env.example` is the template.
