-- Tests 4 and 7: a user of business A gets nothing from business B on every
-- table and every function; a signed-in non-member sees nothing at all.
begin;
select plan(55);
select tests.fixture();

-- Data in B that A must never reach (created as B's owner / as superuser).
select tests.login('t_owner_b@test.local');
select tests.book(tests.biz('t-biz-b'), tests.tour('T-B1'), tests.today() + 5, 2, 0, 'B guest');
select public.set_day_availability(tests.tour('T-B1'), tests.today() + 6, 5, false, 'b override');
insert into public.invites (business_id, email, role) values (tests.biz('t-biz-b'), 'someone@test.local', 'staff');
select tests.logout();

-- ---------------------------------------------------------------------------
-- 4. owner of A looking at B
-- ---------------------------------------------------------------------------
select tests.login('t_owner_a@test.local');

select is((select count(*)::int from public.businesses where id = tests.biz('t-biz-b')), 0, 'A: businesses of B hidden');
select is((select count(*)::int from public.businesses), 1, 'A: sees exactly one business');
select is((select count(*)::int from public.memberships where business_id = tests.biz('t-biz-b')), 0, 'A: memberships of B hidden');
select is((select count(*)::int from public.memberships), 2, 'A: sees only its own two memberships');
select is((select count(*)::int from public.invites where business_id = tests.biz('t-biz-b')), 0, 'A: invites of B hidden');
select is((select count(*)::int from public.tours where business_id = tests.biz('t-biz-b')), 0, 'A: tours of B hidden');
select is((select count(*)::int from public.tours), 2, 'A: sees only its own tours');
select is((select count(*)::int from public.availability_overrides where business_id = tests.biz('t-biz-b')), 0, 'A: overrides of B hidden');
select is((select count(*)::int from public.bookings where business_id = tests.biz('t-biz-b')), 0, 'A: bookings of B hidden');
select is((select count(*)::int from public.bookings), 0, 'A: sees no bookings at all (it has none)');
select is((select count(*)::int from public.audit_log where business_id = tests.biz('t-biz-b')), 0, 'A: audit log of B hidden');
select is((select count(*)::int from public.booking_counters), 0, 'A: booking counters hidden');
select is((select count(*)::int from public.profiles where user_id = tests.uid('t_owner_b@test.local')), 0, 'A: profile of B''s owner hidden');
select is((select count(*)::int from public.profiles), 2, 'A: sees only profiles of its own team');
select is((select count(*)::int from public.platform_admins), 0, 'A: platform admins hidden');

-- functions
select is((select count(*)::int from public.get_month_availability(tests.biz('t-biz-b'), tests.today())), 0,
  'A: get_month_availability(B) returns zero rows');
select throws_ok($$ select tests.book(tests.biz('t-biz-b'), tests.tour('T-B1'), tests.today() + 5, 1, 0, 'x') $$,
  '42501', 'not_authorized', 'A: create_booking in B rejected');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-B1'), tests.today() + 5, 1, 0, 'x') $$,
  'P0001', 'tour_not_found', 'A: create_booking in A with a tour of B rejected');
select throws_ok($$ select public.decide_booking(tests.booking('B guest'), 'approved') $$,
  'P0001', 'booking_not_found', 'A: decide_booking on B''s booking rejected');
select throws_ok($$ select public.cancel_booking(tests.booking('B guest')) $$,
  'P0001', 'booking_not_found', 'A: cancel_booking on B''s booking rejected');
select throws_ok($$ select public.set_day_availability(tests.tour('T-B1'), tests.today() + 6, 1, false, null) $$,
  'P0001', 'tour_not_found', 'A: set_day_availability on B''s tour rejected');
select throws_ok($$ select public.reset_day_availability(tests.tour('T-B1'), tests.today() + 6) $$,
  'P0001', 'tour_not_found', 'A: reset_day_availability on B''s tour rejected');
select throws_ok($$ select * from public.get_commission_report(tests.today()) $$,
  '42501', 'not_authorized', 'A: get_commission_report rejected');
select throws_ok($$ select public.accept_invite(tests.invite_token('someone@test.local')) $$,
  'P0001', 'invite_email_mismatch', 'A: cannot accept an invite to B meant for someone else');
select is(public.is_member(tests.biz('t-biz-b')), false, 'A: is_member(B) is false');
select is(public.has_role(tests.biz('t-biz-b'), 'owner'), false, 'A: has_role(B, owner) is false');

-- writes
select throws_ok($$ insert into public.tours (business_id, name) values (tests.biz('t-biz-b'), 'Hijack') $$,
  '42501', null, 'A: cannot insert a tour into B');
select throws_ok($$ insert into public.invites (business_id, email, role) values (tests.biz('t-biz-b'), 'me@test.local', 'owner') $$,
  '42501', null, 'A: cannot create an invite for B');
select throws_ok($$ insert into public.memberships (business_id, user_id, role) values (tests.biz('t-biz-b'), tests.uid('t_owner_a@test.local'), 'owner') $$,
  '42501', null, 'A: cannot add itself to B');
select throws_ok($$ insert into public.availability_overrides (business_id, tour_id, date, seats) values (tests.biz('t-biz-b'), tests.tour('T-B1'), tests.today() + 9, 1) $$,
  '42501', null, 'A: cannot insert an override into B');
update public.tours set name = 'Hacked' where business_id = tests.biz('t-biz-b');
update public.businesses set name = 'Hacked' where id = tests.biz('t-biz-b');
update public.bookings set status = 'approved' where business_id = tests.biz('t-biz-b');
update public.availability_overrides set seats = 999 where business_id = tests.biz('t-biz-b');
delete from public.bookings where business_id = tests.biz('t-biz-b');
delete from public.tours where business_id = tests.biz('t-biz-b');
delete from public.memberships where business_id = tests.biz('t-biz-b');
delete from public.invites where business_id = tests.biz('t-biz-b');
delete from public.availability_overrides where business_id = tests.biz('t-biz-b');
select tests.logout();

select is((select name from public.tours where id = tests.tour('T-B1')), 'T-B1', 'B: tour untouched by A''s update/delete');
select is((select name from public.businesses where slug = 't-biz-b'), 'Test Biz B', 'B: business untouched by A''s update');
select is(tests.booking_status('B guest'), 'pending', 'B: booking untouched by A''s update/delete');
select is((select seats from public.availability_overrides where business_id = tests.biz('t-biz-b')), 5, 'B: override untouched');
select is((select count(*)::int from public.memberships where business_id = tests.biz('t-biz-b')), 1, 'B: memberships untouched');
select is((select count(*)::int from public.invites where business_id = tests.biz('t-biz-b')), 1, 'B: invites untouched');

-- ---------------------------------------------------------------------------
-- 7. signed in, member of nothing
-- ---------------------------------------------------------------------------
select tests.login('t_outsider@test.local');
select is((select count(*)::int from public.businesses), 0, 'non-member: no businesses');
select is((select count(*)::int from public.memberships), 0, 'non-member: no memberships');
select is((select count(*)::int from public.invites), 0, 'non-member: no invites');
select is((select count(*)::int from public.tours), 0, 'non-member: no tours');
select is((select count(*)::int from public.availability_overrides), 0, 'non-member: no overrides');
select is((select count(*)::int from public.bookings), 0, 'non-member: no bookings');
select is((select count(*)::int from public.audit_log), 0, 'non-member: no audit log');
select is((select count(*)::int from public.booking_counters), 0, 'non-member: no counters');
select is((select count(*)::int from public.platform_admins), 0, 'non-member: no platform admins');
select is((select count(*)::int from public.profiles), 1, 'non-member: only their own profile');
select is((select count(*)::int from public.get_month_availability(tests.biz('t-biz-a'), tests.today())), 0,
  'non-member: get_month_availability returns zero rows');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 5, 1, 0, 'x') $$,
  '42501', 'not_authorized', 'non-member: create_booking rejected');
select throws_ok($$ select public.decide_booking(tests.booking('B guest'), 'approved') $$,
  'P0001', 'booking_not_found', 'non-member: decide_booking rejected');
select throws_ok($$ select public.set_day_availability(tests.tour('T-A1'), tests.today() + 6, 1, false, null) $$,
  'P0001', 'tour_not_found', 'non-member: set_day_availability rejected');
select throws_ok($$ select * from public.get_commission_report(tests.today()) $$,
  '42501', 'not_authorized', 'non-member: get_commission_report rejected');
select throws_ok($$ insert into public.businesses (name, slug) values ('Mine', 'mine') $$,
  '42501', null, 'non-member: cannot create a business');
select throws_ok($$ insert into public.platform_admins (user_id) values (tests.uid('t_outsider@test.local')) $$,
  '42501', null, 'non-member: cannot make itself platform admin');

-- signed out
select tests.login_anon();
select throws_ok($$ select count(*) from public.bookings $$, '42501', null, 'signed out: cannot read bookings');
select throws_ok($$ select public.accept_invite('x') $$, '42501', null, 'signed out: cannot call functions');

select tests.logout();
select * from finish();
rollback;
