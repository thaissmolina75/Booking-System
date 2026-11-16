-- LOCAL DEVELOPMENT SEED ONLY. Runs on `supabase db reset` against the local
-- stack. Never run this against a hosted project: it creates users with a
-- known password.
--
-- Sign-ins (password for all: password123)
--   admin@example.com     platform admin   (replace with your own email locally)
--   owner.a@example.com   owner of Desert Safari Dubai
--   staff.a@example.com   staff of Desert Safari Dubai
--   owner.b@example.com   owner of Marina Cruises
--   nobody@example.com    signed up, no business

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
with new_users (id, email, full_name) as (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'admin@example.com',   'Platform Admin'),
    ('00000000-0000-4000-8000-00000000000a'::uuid, 'owner.a@example.com', 'Omar Al Farsi'),
    ('00000000-0000-4000-8000-00000000000b'::uuid, 'staff.a@example.com', 'Sara Khan'),
    ('00000000-0000-4000-8000-00000000000c'::uuid, 'owner.b@example.com', 'Lina Haddad'),
    ('00000000-0000-4000-8000-00000000000d'::uuid, 'nobody@example.com',  'No Access Yet')
),
inserted as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new
  )
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
         extensions.crypt('password123', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', full_name), now(), now(), '', '', '', ''
    from new_users
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       now(), now(), now()
  from inserted;

insert into public.platform_admins (user_id)
values ('00000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Businesses, members, tours
-- ---------------------------------------------------------------------------
insert into public.businesses
  (id, name, slug, status, trial_ends_at, commission_type, commission_value, whatsapp_phone, instagram_handle)
values
  ('10000000-0000-4000-8000-00000000000a', 'Desert Safari Dubai', 'desert-safari-dubai', 'active', null,
   'percent', 10, '+971501234567', 'desertsafaridubai'),
  ('10000000-0000-4000-8000-00000000000b', 'Marina Cruises', 'marina-cruises', 'trial', now() + interval '14 days',
   'fixed_per_booking', 15, '+971507654321', 'marinacruises');

insert into public.memberships (business_id, user_id, role) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'owner'),
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b', 'staff'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000c', 'owner');

insert into public.tours
  (id, business_id, name, description, price_adult, price_child, duration_text, pickup_zones, default_seats_per_day, sort_order)
values
  ('20000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-00000000000a', 'Evening Desert Safari',
   'Dune bashing, camel ride, BBQ dinner and live shows.', 250, 150, '6 hours',
   array['Downtown', 'Marina', 'Deira', 'Palm Jumeirah'], 30, 1),
  ('20000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-00000000000a', 'Morning Dune Buggy',
   'Self-drive buggy with a guide and refreshments.', 450, 300, '3 hours',
   array['Downtown', 'Marina'], 30, 2),
  ('20000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-00000000000b', 'Sunset Dhow Cruise',
   'Two-hour cruise around Dubai Marina with dinner.', 180, 90, '2 hours',
   array['Marina', 'JBR'], 30, 1),
  ('20000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-00000000000b', 'Private Yacht Hour',
   'One hour on a shared luxury yacht.', 320, 200, '1 hour',
   array['Marina'], 30, 2);

-- ---------------------------------------------------------------------------
-- Availability and bookings, relative to "today" in Dubai so the data always
-- sits around the current date.
-- ---------------------------------------------------------------------------
do $seed$
declare
  d    date := public.local_date(now(), 'Asia/Dubai');
  biz_a uuid := '10000000-0000-4000-8000-00000000000a';
  biz_b uuid := '10000000-0000-4000-8000-00000000000b';
  a1   uuid := '20000000-0000-4000-8000-0000000000a1';
  a2   uuid := '20000000-0000-4000-8000-0000000000a2';
  b1   uuid := '20000000-0000-4000-8000-0000000000b1';
  b2   uuid := '20000000-0000-4000-8000-0000000000b2';
  owner_a uuid := '00000000-0000-4000-8000-00000000000a';
  owner_b uuid := '00000000-0000-4000-8000-00000000000c';
begin
  insert into public.availability_overrides (business_id, tour_id, date, seats, is_blocked, note) values
    (biz_a, a1, d + 5, null, true,  'Camp maintenance'),
    (biz_a, a1, d + 3, 10,   false, 'Small group day'),
    (biz_a, a2, d + 2, 8,    false, 'Two buggies in service'),
    (biz_b, b1, d + 4, null, true,  'Private charter'),
    (biz_b, b2, d + 6, 12,   false, 'Half boat reserved');

  insert into public.bookings
    (business_id, tour_id, code, date, adults, children, pickup_location, customer_name, customer_phone,
     source, status, notes, total_amount, created_at, decided_at, decided_by)
  values
    -- Business A: every status and every source.
    (biz_a, a1, 'DSD-0001', d + 1, 2, 1, 'Marina',        'Anna Müller',    '+4915112345678', 'bot_whatsapp',  'pending',   null,                 650, now() - interval '2 hours', null, null),
    (biz_a, a1, 'DSD-0002', d + 1, 4, 0, 'Downtown',      'James Carter',   '+447700900123',  'bot_instagram', 'pending',   'Vegetarian dinner',  1000, now() - interval '1 hour', null, null),
    (biz_a, a2, 'DSD-0003', d + 2, 2, 0, 'Marina',        'Priya Nair',     '+919812345678',  'manual',        'pending',   'Phone booking',      900, now() - interval '30 minutes', null, null),
    (biz_a, a1, 'DSD-0004', d + 3, 6, 2, 'Deira',         'Ahmed Saleh',    '+966501112233',  'bot_whatsapp',  'approved',  null,                 1800, now() - interval '1 day', now() - interval '20 hours', owner_a),
    (biz_a, a1, 'DSD-0005', d + 2, 3, 0, 'Palm Jumeirah', 'Sofia Rossi',    '+393331234567',  'bot_instagram', 'approved',  null,                 750, now() - interval '2 days', now() - interval '1 day', owner_a),
    (biz_a, a2, 'DSD-0006', d + 2, 4, 1, 'Downtown',      'Walk-in guest',  null,             'manual',        'approved',  'Paid cash',          2100, now() - interval '1 day', now() - interval '1 day', owner_a),
    (biz_a, a1, 'DSD-0007', d + 1, 5, 0, 'Marina',        'Tom Becker',     '+4917098765432', 'bot_whatsapp',  'declined',  'No pickup available', 1250, now() - interval '3 days', now() - interval '2 days', owner_a),
    (biz_a, a2, 'DSD-0008', d + 4, 2, 2, 'Marina',        'Chen Wei',       '+8613800138000', 'bot_instagram', 'cancelled', 'Customer cancelled', 1500, now() - interval '3 days', now() - interval '1 day', owner_a),
    (biz_a, a1, 'DSD-0009', d - 3, 2, 0, 'Downtown',      'Maria Garcia',   '+34600111222',   'bot_whatsapp',  'approved',  null,                 500, now() - interval '6 days', now() - interval '5 days', owner_a),
    (biz_a, a1, 'DSD-0010', d - 1, 3, 1, 'Deira',         'Yuki Tanaka',    '+819012345678',  'manual',        'approved',  null,                 900, now() - interval '4 days', now() - interval '4 days', owner_a),
    -- Business B.
    (biz_b, b1, 'MC-0001',  d + 1, 2, 0, 'Marina',        'Olivia Brown',   '+12025550143',   'bot_whatsapp',  'pending',   null,                 360, now() - interval '3 hours', null, null),
    (biz_b, b1, 'MC-0002',  d + 2, 4, 2, 'JBR',           'Noah Wilson',    '+61412345678',   'bot_instagram', 'approved',  null,                 900, now() - interval '1 day', now() - interval '20 hours', owner_b),
    (biz_b, b2, 'MC-0003',  d + 2, 2, 0, 'Marina',        'Fatima Zahra',   '+212612345678',  'manual',        'approved',  null,                 640, now() - interval '1 day', now() - interval '1 day', owner_b),
    (biz_b, b2, 'MC-0004',  d + 3, 3, 0, 'Marina',        'Lucas Martin',   '+33612345678',   'bot_whatsapp',  'declined',  null,                 960, now() - interval '2 days', now() - interval '1 day', owner_b),
    (biz_b, b1, 'MC-0005',  d + 6, 2, 1, 'JBR',           'Emma Johansson', '+46701234567',   'manual',        'cancelled', null,                 450, now() - interval '2 days', now() - interval '1 day', owner_b);

  insert into public.booking_counters (business_id, last_number) values (biz_a, 10), (biz_b, 5);
end;
$seed$;
