-- Security pass, kept as tests so it cannot regress: every table has RLS and
-- policies, every SECURITY DEFINER function pins its search_path, nothing is
-- open to signed-out visitors, and only the intended functions are callable.
begin;
select plan(17);
select tests.fixture();

select is(
  (select count(*)::int from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
  10, 'the public schema has exactly the 10 expected tables');
select is(
  (select coalesce(string_agg(c.relname, ', '), 'none') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  'none', 'every table has row level security enabled');
select is(
  (select coalesce(string_agg(c.relname, ', '), 'none') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)),
  'none', 'every table has at least one policy');
select is(
  (select coalesce(string_agg(p.tablename || '.' || p.policyname, ', '), 'none') from pg_policies p
    where p.schemaname = 'public' and (p.roles && array['anon', 'public']::name[])),
  'none', 'no policy applies to signed-out visitors');
select is(
  (select coalesce(string_agg(c.relname, ', '), 'none') from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
  'none', 'signed-out visitors have no privilege on any table');

-- functions
select is(
  (select coalesce(string_agg(p.proname, ', '), 'none') from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg in ('search_path=', 'search_path=""'))),
  'none', 'every SECURITY DEFINER function sets an empty search_path');
select is(
  (select coalesce(string_agg(p.proname, ', '), 'none') from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  'none', 'every function, definer or not, sets its search_path');
select is(
  (select coalesce(string_agg(p.proname, ', '), 'none') from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)),
  'none', 'no function is executable by PUBLIC');
select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute')),
  'get_invite_preview', 'signed-out visitors can call only the invite preview');
select is(
  (select string_agg(p.proname, ', ' order by p.proname) from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('authenticated', p.oid, 'execute')),
  'accept_invite, cancel_booking, create_booking, decide_booking, get_commission_report, get_invite_preview, get_month_availability, get_team_members, has_role, is_member, is_platform_admin, local_date, reset_day_availability, set_day_availability',
  'signed-in users can call exactly the public API; internal helpers and trigger functions are not callable');

-- privileges that must not exist
select is(has_table_privilege('authenticated', 'public.bookings', 'insert'), false, 'nobody can insert bookings directly');
select is(has_table_privilege('authenticated', 'public.audit_log', 'insert')
       or has_table_privilege('authenticated', 'public.audit_log', 'update')
       or has_table_privilege('authenticated', 'public.audit_log', 'delete'), false, 'the audit log cannot be written or edited from the app');
select is(has_table_privilege('authenticated', 'public.platform_admins', 'insert')
       or has_table_privilege('authenticated', 'public.platform_admins', 'update')
       or has_table_privilege('authenticated', 'public.platform_admins', 'delete'), false, 'platform admins cannot be changed from the app');

-- hardening from this phase
select tests.login('t_owner_a@test.local');
select throws_ok($$ insert into public.invites (business_id, email, role, token) values (tests.biz('t-biz-a'), 'weak@test.local', 'staff', 'guessme') $$,
  '42501', null, 'owner: cannot choose an invite token');
select throws_ok($$ insert into public.invites (business_id, email, role, expires_at) values (tests.biz('t-biz-a'), 'forever@test.local', 'staff', now() + interval '10 years') $$,
  '42501', null, 'owner: cannot choose an invite expiry');
select throws_ok($$ update public.businesses set currency = 'USD' where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot change the currency');
select tests.login('t_admin@test.local');
select lives_ok($$ update public.businesses set currency = 'USD' where id = tests.biz('t-biz-a') $$, 'admin: can change the currency');

select tests.logout();
select * from finish();
rollback;
