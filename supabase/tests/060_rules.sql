-- Booking codes, decision rules, the chatbot (service role) path, audit log
-- and the commission report.
begin;
select plan(31);
select tests.fixture();

-- codes: per business, sequential, PREFIX-0000
select tests.login('t_owner_a@test.local');
select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.future_month() + 1, 1, 1, 'A one');
select tests.book(tests.biz('t-biz-a'), tests.tour('T-A2'), tests.future_month() + 2, 1, 0, 'A two');
select tests.login('t_owner_b@test.local');
select tests.book(tests.biz('t-biz-b'), tests.tour('T-B1'), tests.future_month() + 1, 1, 0, 'B one');
select tests.logout();
select is((select code from public.bookings where customer_name = 'A one'), 'TBA-0001', 'first code of business A');
select is((select code from public.bookings where customer_name = 'A two'), 'TBA-0002', 'codes count up per business');
select is((select code from public.bookings where customer_name = 'B one'), 'TBB-0001', 'business B has its own sequence');
select is((select total_amount::int from public.bookings where customer_name = 'A one'), 150, 'price snapshot: 1 adult x 100 + 1 child x 50');
select is((select status::text || '/' || source::text from public.bookings where customer_name = 'A one'), 'pending/manual', 'new bookings start pending');
insert into public.businesses (name, slug) values ('Desert Safari', 'ds-test');
select is((select booking_prefix from public.businesses where slug = 'ds-test'), 'DS', 'prefix is derived from the business name');

-- decisions
select tests.login('t_staff_a@test.local');
select throws_ok($$ select public.decide_booking(tests.booking('A one'), 'cancelled') $$,
  'P0001', 'invalid_decision', 'decision must be approved or declined');
select throws_ok($$ select public.decide_booking(tests.booking('A one'), 'pending') $$,
  'P0001', 'invalid_decision', 'cannot "decide" back to pending');
select public.decide_booking(tests.booking('A one'), 'approved');
select tests.logout();
select is((select decided_by from public.bookings where customer_name = 'A one'), tests.uid('t_staff_a@test.local'), 'decided_by is the caller');
select ok((select decided_at is not null from public.bookings where customer_name = 'A one'), 'decided_at is set');
select tests.login('t_owner_a@test.local');
select throws_ok($$ select public.decide_booking(tests.booking('A one'), 'declined') $$,
  'P0001', 'booking_not_pending', 'only pending bookings can be decided');
select public.cancel_booking(tests.booking('A two'));
select throws_ok($$ select public.cancel_booking(tests.booking('A two')) $$,
  'P0001', 'booking_not_active', 'a cancelled booking cannot be cancelled again');
select throws_ok($$ select public.decide_booking(tests.booking('A two'), 'approved') $$,
  'P0001', 'booking_not_pending', 'a cancelled booking cannot be approved');
select tests.logout();
select is((select count(*)::int from public.audit_log where business_id = tests.biz('t-biz-a')
            and action in ('booking.created', 'booking.approved', 'booking.cancelled')), 4,
  'audit log has created x2, approved and cancelled');

-- chatbot path: service role, bot sources
select tests.login_service();
select lives_ok($$ select public.create_booking(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.future_month() + 3, 2, 0, 'WA guest', '+1', 'Marina', 'bot_whatsapp', null) $$,
  'service role: can create a WhatsApp bot booking');
select lives_ok($$ select public.create_booking(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.future_month() + 3, 3, 0, 'IG guest', '+1', 'Marina', 'bot_instagram', null) $$,
  'service role: can create an Instagram bot booking');
select lives_ok($$ select public.create_booking(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.future_month() + 3, 1, 0, 'WA pending', '+1', 'Marina', 'bot_whatsapp', null) $$,
  'service role: third bot booking');
select throws_ok($$ select public.create_booking(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.future_month() + 3, 40, 0, 'Big group', '+1', 'Marina', 'bot_whatsapp', null) $$,
  'P0001', 'not_enough_seats', 'service role: seat limit applies to the bot too');
select lives_ok($$ select public.create_booking(tests.biz('t-biz-b'), tests.tour('T-B1'), tests.future_month() + 3, 2, 0, 'B bot 1', '+1', 'Marina', 'bot_whatsapp', null) $$,
  'service role: bot booking in business B');
select lives_ok($$ select public.create_booking(tests.biz('t-biz-b'), tests.tour('T-B1'), tests.future_month() + 4, 2, 0, 'B bot 2', '+1', 'Marina', 'bot_instagram', null) $$,
  'service role: second bot booking in business B');
select tests.logout();

update public.businesses set status = 'suspended' where slug = 'ds-test';
insert into public.tours (business_id, name, default_seats_per_day) values (tests.biz('ds-test'), 'T-DS', 10);
select tests.login_service();
select throws_ok($$ select public.create_booking(tests.biz('ds-test'), tests.tour('T-DS'), tests.future_month() + 3, 1, 0, 'Paused', '+1', null, 'bot_whatsapp', null) $$,
  'P0001', 'automation_paused', 'suspended business: bot bookings are paused');
select tests.logout();
update public.businesses set status = 'trial', trial_ends_at = now() - interval '1 day' where slug = 'ds-test';
select tests.login_service();
select throws_ok($$ select public.create_booking(tests.biz('ds-test'), tests.tour('T-DS'), tests.future_month() + 3, 1, 0, 'Paused', '+1', null, 'bot_instagram', null) $$,
  'P0001', 'automation_paused', 'expired trial: bot bookings are paused');
select lives_ok($$ select public.create_booking(tests.biz('ds-test'), tests.tour('T-DS'), tests.future_month() + 3, 1, 0, 'Still manual', '+1', null, 'manual', null) $$,
  'expired trial: manual bookings keep working');
select tests.logout();

-- commission: approve some, leave some
select tests.login('t_owner_a@test.local');
select public.decide_booking(tests.booking('WA guest'), 'approved');   -- 2 adults x 100 = 200
select public.decide_booking(tests.booking('IG guest'), 'approved');   -- 3 adults x 100 = 300
-- 'WA pending' stays pending; 'A one' is an approved MANUAL booking of 150.
select tests.login('t_owner_b@test.local');
select public.decide_booking(tests.booking('B bot 1'), 'approved');
select public.decide_booking(tests.booking('B bot 2'), 'approved');
select public.decide_booking(tests.booking('B one'), 'approved');      -- manual

select tests.login('t_admin@test.local');
select is(
  (select row(approved_whatsapp, approved_instagram, approved_manual, approved_total, bot_revenue::int, commission_owed)::text
     from public.get_commission_report(tests.future_month()) where business_id = tests.biz('t-biz-a')),
  '(1,1,1,3,500,50.00)',
  'percent: 10% of approved bot revenue (500); manual and pending excluded');
select is(
  (select row(approved_whatsapp, approved_instagram, approved_manual, approved_total, commission_owed)::text
     from public.get_commission_report(tests.future_month() + 20) where business_id = tests.biz('t-biz-b')),
  '(1,1,1,3,30.00)',
  'fixed: 15 per approved bot booking (2); manual excluded');
select is(
  (select row(approved_total, commission_owed)::text
     from public.get_commission_report(tests.future_month()) where business_id = tests.biz('ds-test')),
  '(0,0.00)', 'business without approved bookings is listed with zero');
select is(
  (select row(approved_total, commission_owed)::text
     from public.get_commission_report((tests.future_month() + interval '1 month')::date) where business_id = tests.biz('t-biz-a')),
  '(0,0.00)', 'another month does not include these bookings');
select ok((select count(*) >= 3 from public.get_commission_report(tests.future_month())), 'admin sees every business');
select is((select count(*)::int from public.bookings where business_id in (tests.biz('t-biz-a'), tests.biz('t-biz-b'))), 8,
  'admin reads bookings of every business');

select tests.login('t_owner_a@test.local');
select throws_ok($$ select * from public.get_commission_report(tests.future_month()) $$,
  '42501', 'not_authorized', 'owners cannot read the commission report');
select tests.login_service();
select throws_ok($$ select * from public.get_commission_report(tests.future_month()) $$,
  '42501', 'not_authorized', 'the service role path is not a platform admin either');

select tests.logout();
select * from finish();
rollback;
