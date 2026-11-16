# Booking System

Multi-tenant booking management for tour businesses in Dubai. Three kinds of
users sign in: the platform admin, business owners and their staff. Tourists
never sign in; a WhatsApp/Instagram chatbot (built later) will call the same
database functions.

**Status:** Phase 1 of 5 is done (database, security and seat logic).

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
npm test                   # unit tests
npm run test:all
```

The database tests only ever run against the local stack.

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

## Secrets

Only the anon/publishable key goes in the frontend. The service role key
bypasses row level security and must stay on a server. Real `.env` files are
gitignored; `.env.example` is the template.
