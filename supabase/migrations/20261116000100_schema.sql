-- Phase 1 / part 1: tables, constraints, indexes.
-- Tour and booking dates are calendar dates (type date) in the business
-- timezone. They are never derived from, or converted through, UTC timestamps.

create type public.business_status as enum ('trial', 'active', 'suspended');
create type public.commission_type as enum ('percent', 'fixed_per_booking');
create type public.membership_role as enum ('owner', 'staff');
create type public.booking_source  as enum ('bot_whatsapp', 'bot_instagram', 'manual');
create type public.booking_status  as enum ('pending', 'approved', 'declined', 'cancelled');

-- Platform super admins. Rows are managed with SQL only; the app has no write path.
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per auth user, created by trigger. No roles here.
create table public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (btrim(name) <> ''),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status           public.business_status not null default 'trial',
  trial_ends_at    timestamptz,
  timezone         text not null default 'Asia/Dubai',
  currency         text not null default 'AED',
  commission_type  public.commission_type not null default 'percent',
  commission_value numeric(10, 2) not null default 0 check (commission_value >= 0),
  whatsapp_phone   text,
  instagram_handle text,
  -- Prefix of booking codes (DS-0142). Derived from the name when not given.
  booking_prefix   text not null unique check (booking_prefix ~ '^[A-Z][A-Z0-9]{1,5}$'),
  created_at       timestamptz not null default now()
);

-- Roles live ONLY here.
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.membership_role not null,
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  email       text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  role        public.membership_role not null,
  -- 64 hex chars from two v4 UUIDs (244 random bits from the server CSPRNG).
  token       text not null unique
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index invites_business_id_idx on public.invites (business_id);
-- Only one open invite per email per business.
create unique index invites_one_pending_per_email
  on public.invites (business_id, email) where accepted_at is null;

create table public.tours (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete cascade,
  name                  text not null check (btrim(name) <> ''),
  description           text,
  price_adult           numeric(10, 2) not null default 0 check (price_adult >= 0),
  price_child           numeric(10, 2) not null default 0 check (price_child >= 0),
  duration_text         text,
  pickup_zones          text[] not null default '{}',
  default_seats_per_day integer not null default 0 check (default_seats_per_day >= 0),
  is_active             boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now(),
  -- Target for composite foreign keys, so child rows can never point at a
  -- tour of another business.
  unique (id, business_id)
);
create index tours_business_id_idx on public.tours (business_id, sort_order);

create table public.availability_overrides (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  tour_id     uuid not null,
  date        date not null,
  seats       integer check (seats is null or seats >= 0),
  is_blocked  boolean not null default false,
  note        text,
  created_at  timestamptz not null default now(),
  unique (tour_id, date),
  foreign key (tour_id, business_id) references public.tours (id, business_id) on delete cascade
);
create index availability_overrides_business_date_idx
  on public.availability_overrides (business_id, date);

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  tour_id         uuid not null,
  code            text not null unique,
  date            date not null,
  adults          integer not null check (adults >= 1),
  children        integer not null default 0 check (children >= 0),
  pickup_location text,
  customer_name   text not null check (btrim(customer_name) <> ''),
  customer_phone  text,
  source          public.booking_source not null,
  status          public.booking_status not null default 'pending',
  notes           text,
  -- Price snapshot taken when the booking is created, so later price changes
  -- do not rewrite history or commission.
  total_amount    numeric(12, 2) not null default 0,
  created_at      timestamptz not null default now(),
  decided_at      timestamptz,
  decided_by      uuid references auth.users (id) on delete set null,
  foreign key (tour_id, business_id) references public.tours (id, business_id)
);
create index bookings_business_date_idx on public.bookings (business_id, date);
create index bookings_business_status_idx on public.bookings (business_id, status);
create index bookings_seats_idx on public.bookings (tour_id, date)
  where status in ('pending', 'approved');

-- Last booking number handed out per business. Touched only by create_booking.
create table public.booking_counters (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  last_number integer not null default 0
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid references public.businesses (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_business_idx on public.audit_log (business_id, created_at desc);

alter table public.platform_admins        enable row level security;
alter table public.profiles               enable row level security;
alter table public.businesses             enable row level security;
alter table public.memberships            enable row level security;
alter table public.invites                enable row level security;
alter table public.tours                  enable row level security;
alter table public.availability_overrides enable row level security;
alter table public.bookings               enable row level security;
alter table public.booking_counters       enable row level security;
alter table public.audit_log              enable row level security;

-- Realtime: the dashboard refetches the visible month when these change.
-- RLS still applies to what each subscriber receives.
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.availability_overrides;
