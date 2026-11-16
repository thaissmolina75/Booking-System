-- Test 5: staff cannot edit tours, availability or settings; owners cannot
-- change status, trial or commission. Plus what each role CAN do.
begin;
select plan(44);
select tests.fixture();
update public.businesses set trial_ends_at = '2030-01-01T00:00:00Z' where slug = 't-biz-a';

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
select tests.login('t_staff_a@test.local');

select is((select count(*)::int from public.tours), 2, 'staff: reads tours of its business');
select is((select count(*)::int from public.memberships), 2, 'staff: reads the team');
select is((select count(*)::int from public.businesses), 1, 'staff: reads the business');

select throws_ok($$ insert into public.tours (business_id, name) values (tests.biz('t-biz-a'), 'Staff tour') $$,
  '42501', null, 'staff: cannot create a tour');
update public.tours set name = 'Renamed by staff', price_adult = 1, is_active = false where business_id = tests.biz('t-biz-a');
delete from public.tours where business_id = tests.biz('t-biz-a');
select is((select count(*)::int from public.tours where name in ('T-A1', 'T-A2') and is_active and price_adult >= 100), 2,
  'staff: update and delete of tours change nothing');

select throws_ok($$ select public.set_day_availability(tests.tour('T-A1'), tests.today() + 3, 5, false, null) $$,
  '42501', 'not_authorized', 'staff: set_day_availability rejected');
select throws_ok($$ select public.reset_day_availability(tests.tour('T-A1'), tests.today() + 3) $$,
  '42501', 'not_authorized', 'staff: reset_day_availability rejected');
select throws_ok($$ insert into public.availability_overrides (business_id, tour_id, date, seats) values (tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 3, 1) $$,
  '42501', null, 'staff: cannot insert an override directly');

update public.businesses set name = 'Staff Biz', whatsapp_phone = '+1', timezone = 'UTC' where id = tests.biz('t-biz-a');
select is((select name || '/' || timezone from public.businesses where id = tests.biz('t-biz-a')), 'Test Biz A/Asia/Dubai',
  'staff: cannot change business settings');

select throws_ok($$ insert into public.invites (business_id, email, role) values (tests.biz('t-biz-a'), 'friend@test.local', 'owner') $$,
  '42501', null, 'staff: cannot invite');
select is((select count(*)::int from public.invites), 0, 'staff: cannot read invites');
delete from public.memberships where business_id = tests.biz('t-biz-a') and role = 'owner';
select is((select count(*)::int from public.memberships where business_id = tests.biz('t-biz-a')), 2,
  'staff: cannot remove members');
update public.memberships set role = 'owner' where user_id = tests.uid('t_staff_a@test.local');
select is(public.has_role(tests.biz('t-biz-a'), 'owner'), false, 'staff: cannot promote itself to owner');

-- what staff can do
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 3, 2, 0, 'Staff manual') $$,
  'staff: can add a manual booking');
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 3, 2, 0, 'Staff manual 2') $$,
  'staff: can add a second manual booking');
select throws_ok($$ select public.create_booking(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 3, 1, 0, 'Fake bot', null, null, 'bot_whatsapp', null) $$,
  '42501', 'invalid_source', 'staff: cannot create a booking marked as a bot booking');
select throws_ok($$ insert into public.bookings (business_id, tour_id, code, date, adults, customer_name, source) values (tests.biz('t-biz-a'), tests.tour('T-A1'), 'X-1', tests.today() + 3, 99, 'Direct', 'manual') $$,
  '42501', null, 'staff: cannot insert into bookings directly');
update public.bookings set status = 'approved', adults = 50 where business_id = tests.biz('t-biz-a');
select is(tests.booking_status('Staff manual'), 'pending', 'staff: cannot update bookings directly');
select lives_ok($$ select public.decide_booking(tests.booking('Staff manual'), 'approved') $$, 'staff: can approve');
select lives_ok($$ select public.decide_booking(tests.booking('Staff manual 2'), 'declined') $$, 'staff: can decline');
select throws_ok($$ select public.cancel_booking(tests.booking('Staff manual')) $$,
  '42501', 'not_authorized', 'staff: cannot cancel (owner only)');

-- ---------------------------------------------------------------------------
-- owner
-- ---------------------------------------------------------------------------
select tests.login('t_owner_a@test.local');

select throws_ok($$ update public.businesses set status = 'suspended' where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot change status');
select throws_ok($$ update public.businesses set trial_ends_at = now() + interval '10 years' where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot change trial_ends_at');
select throws_ok($$ update public.businesses set trial_ends_at = null where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot clear trial_ends_at');
select throws_ok($$ update public.businesses set commission_type = 'fixed_per_booking' where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot change commission_type');
select throws_ok($$ update public.businesses set commission_value = 0 where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot change commission_value');
select throws_ok($$ update public.businesses set name = 'Sneaky', commission_value = 1 where id = tests.biz('t-biz-a') $$,
  '42501', 'protected_field', 'owner: cannot smuggle commission into a settings update');
select throws_ok($$ update public.businesses set timezone = 'Mars/Olympus' where id = tests.biz('t-biz-a') $$,
  null, null, 'owner: invalid timezone rejected');

select lives_ok($$ update public.businesses set name = 'Biz A renamed', timezone = 'Asia/Dubai', whatsapp_phone = '+971500000001', instagram_handle = 'biza' where id = tests.biz('t-biz-a') $$,
  'owner: can change name, timezone, WhatsApp and Instagram');
select is((select name from public.businesses where id = tests.biz('t-biz-a')), 'Biz A renamed', 'owner: settings saved');

select lives_ok($$ insert into public.tours (business_id, name, default_seats_per_day) values (tests.biz('t-biz-a'), 'Owner tour', 12) $$,
  'owner: can create a tour');
select lives_ok($$ update public.tours set price_adult = 123 where id = tests.tour('T-A1') $$, 'owner: can edit a tour');
select is((select price_adult::int from public.tours where id = tests.tour('T-A1')), 123, 'owner: tour edit saved');
select lives_ok($$ select public.set_day_availability(tests.tour('T-A1'), tests.today() + 3, 5, false, null) $$,
  'owner: can set availability');
select throws_ok($$ select public.set_day_availability(tests.tour('T-A1'), tests.today() - 1, 5, false, null) $$,
  'P0001', 'date_in_past', 'owner: cannot change a past day');
select throws_ok($$ select public.reset_day_availability(tests.tour('T-A1'), tests.today() - 1) $$,
  'P0001', 'date_in_past', 'owner: cannot reset a past day');
select lives_ok($$ select public.cancel_booking(tests.booking('Staff manual')) $$, 'owner: can cancel a booking');
select lives_ok($$ insert into public.invites (business_id, email, role) values (tests.biz('t-biz-a'), 'new@test.local', 'staff') $$,
  'owner: can invite');

select throws_ok($$ insert into public.memberships (business_id, user_id, role) values (tests.biz('t-biz-a'), tests.uid('t_outsider@test.local'), 'staff') $$,
  '42501', null, 'owner: cannot add members directly (invite only)');
select throws_ok($$ insert into public.platform_admins (user_id) values (tests.uid('t_owner_a@test.local')) $$,
  '42501', null, 'owner: cannot make itself platform admin');
select throws_ok($$ delete from public.memberships where business_id = tests.biz('t-biz-a') and role = 'owner' $$,
  'P0001', 'last_owner', 'owner: the last owner cannot be removed');
select lives_ok($$ delete from public.memberships where business_id = tests.biz('t-biz-a') and role = 'staff' $$,
  'owner: can remove staff');

-- ---------------------------------------------------------------------------
-- platform admin
-- ---------------------------------------------------------------------------
select tests.login('t_admin@test.local');
select lives_ok($$ update public.businesses set status = 'suspended', commission_value = 12.5 where id = tests.biz('t-biz-a') $$,
  'admin: can change status and commission');
select is((select count(*)::int from public.audit_log where business_id = tests.biz('t-biz-a') and action = 'business.billing_updated'
            and details ? 'status' and details ? 'commission_value'), 1,
  'admin: the change is written to audit_log');

select tests.logout();
select * from finish();
rollback;
