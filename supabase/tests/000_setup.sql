-- Test helpers. Created once before the other files run and dropped again by
-- 999_teardown.sql. Every other file runs inside BEGIN ... ROLLBACK.
create extension if not exists pgtap with schema extensions;

drop schema if exists tests cascade;
create schema tests;
grant usage on schema tests to authenticated, anon, service_role;

create function tests.create_user(p_email text, p_confirmed boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, '',
          case when p_confirmed then now() end, '{}'::jsonb,
          jsonb_build_object('full_name', split_part(p_email, '@', 1)), now(), now());
  return v_id;
end $$;

create function tests.uid(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = p_email;
$$;

create function tests.biz(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.businesses where slug = p_slug;
$$;

create function tests.tour(p_name text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.tours where name = p_name;
$$;

-- Booking id by customer name, readable regardless of who is logged in.
create function tests.booking(p_customer text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.bookings where customer_name = p_customer;
$$;

create function tests.booking_status(p_customer text) returns text
language sql stable security definer set search_path = '' as $$
  select status::text from public.bookings where customer_name = p_customer;
$$;

create function tests.invite_token(p_email text) returns text
language sql stable security definer set search_path = '' as $$
  select token from public.invites where email = p_email order by created_at desc limit 1;
$$;

-- Today in Dubai, the timezone of the fixture businesses.
create function tests.today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Dubai')::date;
$$;

-- First day of the month two months ahead: a whole month safely in the future.
create function tests.future_month() returns date
language sql stable set search_path = '' as $$
  select (make_date(extract(year from tests.today())::int, extract(month from tests.today())::int, 1)
          + interval '2 months')::date;
$$;

create function tests.login(p_email text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', tests.uid(p_email), 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- The future chatbot backend: service role key, no user.
create function tests.login_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('role', 'service_role', true);
end $$;

create function tests.login_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;

create function tests.logout() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'none', true);
end $$;

-- "(capacity,taken,seats_left,is_blocked,pending_count,approved_count)" for one tour and day.
create function tests.avail(p_business uuid, p_tour uuid, p_date date) returns text
language sql stable set search_path = '' as $$
  select row(a.capacity, a.taken, a.seats_left, a.is_blocked, a.pending_count, a.approved_count)::text
    from public.get_month_availability(p_business, p_date) a
   where a.tour_id = p_tour and a.date = p_date;
$$;

-- Shorthand manual booking as the logged-in user.
create function tests.book(p_business uuid, p_tour uuid, p_date date, p_adults int, p_children int, p_name text)
returns void language sql set search_path = '' as $$
  select public.create_booking(p_business, p_tour, p_date, p_adults, p_children, p_name,
                               '+971500000000', 'Marina', 'manual', null);
$$;

-- Two isolated businesses with their people.
--   A (t-biz-a): t_owner_a (owner), t_staff_a (staff), tours "T-A1", "T-A2"
--   B (t-biz-b): t_owner_b (owner), tour "T-B1"
--   t_outsider: signed in, member of nothing.  t_admin: platform admin.
create function tests.fixture() returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid; b uuid;
begin
  perform tests.create_user('t_owner_a@test.local');
  perform tests.create_user('t_staff_a@test.local');
  perform tests.create_user('t_owner_b@test.local');
  perform tests.create_user('t_outsider@test.local');
  perform tests.create_user('t_admin@test.local');
  insert into public.platform_admins (user_id) values (tests.uid('t_admin@test.local'));

  insert into public.businesses (name, slug, status, commission_type, commission_value, booking_prefix)
  values ('Test Biz A', 't-biz-a', 'active', 'percent', 10, 'TBA') returning id into a;
  insert into public.businesses (name, slug, status, commission_type, commission_value, booking_prefix)
  values ('Test Biz B', 't-biz-b', 'active', 'fixed_per_booking', 15, 'TBB') returning id into b;

  insert into public.memberships (business_id, user_id, role) values
    (a, tests.uid('t_owner_a@test.local'), 'owner'),
    (a, tests.uid('t_staff_a@test.local'), 'staff'),
    (b, tests.uid('t_owner_b@test.local'), 'owner');

  insert into public.tours (business_id, name, price_adult, price_child, default_seats_per_day, sort_order) values
    (a, 'T-A1', 100, 50, 30, 1),
    (a, 'T-A2', 200, 100, 30, 2),
    (b, 'T-B1', 100, 50, 30, 1);
end $$;

grant execute on all functions in schema tests to authenticated, anon, service_role;

select extensions.plan(1);
select extensions.pass('test helpers installed');
select * from extensions.finish();
