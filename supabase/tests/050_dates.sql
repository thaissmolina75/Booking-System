-- Test 8: dates near midnight Asia/Dubai land on the correct day, and a
-- calendar date is never shifted by the session timezone.
begin;
select plan(27);
select tests.fixture();

-- The one place a timestamp becomes a date. Dubai is UTC+4 all year.
select is(public.local_date('2026-03-10 19:59:59+00', 'Asia/Dubai'), '2026-03-10'::date, '23:59:59 Dubai is still the 10th');
select is(public.local_date('2026-03-10 20:00:00+00', 'Asia/Dubai'), '2026-03-11'::date, '00:00:00 Dubai is already the 11th');
select is(public.local_date('2026-03-10 23:30:00+04', 'Asia/Dubai'), '2026-03-10'::date, '23:30 Dubai time stays on the 10th');
select is(public.local_date('2026-03-11 00:30:00+04', 'Asia/Dubai'), '2026-03-11'::date, '00:30 Dubai time is the 11th (still the 10th in UTC)');
select is(public.local_date('2026-12-31 20:30:00+00', 'Asia/Dubai'), '2027-01-01'::date, 'new year arrives 4 hours before UTC');
select is(public.local_date('2026-03-10 20:00:00+00', 'America/New_York'), '2026-03-10'::date, 'same instant is the 10th in New York');

-- The session timezone must not matter. Etc/GMT+12 (UTC-12) and
-- Pacific/Kiritimati (UTC+14) are 26 hours apart, so at any moment at least
-- one of them is on a different calendar day than Dubai.
select isnt(public.local_date(now(), 'Etc/GMT+12'), public.local_date(now(), 'Pacific/Kiritimati'),
  'the two test timezones are on different days right now');

select tests.login('t_owner_a@test.local');

set local timezone = 'Etc/GMT+12';
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today(), 1, 0, 'West today') $$,
  'session UTC-12: booking for today in Dubai is accepted');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() - 1, 1, 0, 'West yesterday') $$,
  'P0001', 'date_in_past', 'session UTC-12: yesterday in Dubai is rejected');
select is((select date from public.bookings where customer_name = 'West today'), tests.today(), 'session UTC-12: stored date is the requested date');

set local timezone = 'Pacific/Kiritimati';
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today(), 1, 0, 'East today') $$,
  'session UTC+14: booking for today in Dubai is accepted');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() - 1, 1, 0, 'East yesterday') $$,
  'P0001', 'date_in_past', 'session UTC+14: yesterday in Dubai is rejected');
select is((select date from public.bookings where customer_name = 'East today'), tests.today(), 'session UTC+14: stored date is the requested date');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today()), '(30,2,28,f,2,0)',
  'both bookings are counted on the same day');

-- A fixed calendar date reads back identically in every session timezone.
select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), '2031-01-01', 2, 1, 'New year');
set local timezone = 'Etc/GMT+12';
select is((select date::text from public.bookings where customer_name = 'New year'), '2031-01-01', 'UTC-12 reads 2031-01-01');
select is((select taken from public.get_month_availability(tests.biz('t-biz-a'), '2031-01-15') where tour_id = tests.tour('T-A1') and date = '2031-01-01'), 3,
  'UTC-12: booking on 1 January is in January, on the 1st');
select is((select coalesce(sum(taken), 0)::int from public.get_month_availability(tests.biz('t-biz-a'), '2030-12-01')), 0,
  'UTC-12: nothing leaks into December');
set local timezone = 'Pacific/Kiritimati';
select is((select date::text from public.bookings where customer_name = 'New year'), '2031-01-01', 'UTC+14 reads 2031-01-01');
select is((select taken from public.get_month_availability(tests.biz('t-biz-a'), '2031-01-31') where tour_id = tests.tour('T-A1') and date = '2031-01-01'), 3,
  'UTC+14: booking on 1 January is in January, on the 1st');

-- Month grid: exact days, whatever day of the month is passed.
select is((select count(*)::int || ' ' || min(date) || ' ' || max(date) from public.get_month_availability(tests.biz('t-biz-a'), '2031-01-31') where tour_id = tests.tour('T-A1')),
  '31 2031-01-01 2031-01-31', 'January has 31 days');
select is((select count(*)::int || ' ' || min(date) || ' ' || max(date) from public.get_month_availability(tests.biz('t-biz-a'), '2032-02-10') where tour_id = tests.tour('T-A1')),
  '29 2032-02-01 2032-02-29', 'leap February has 29 days');
select is((select count(*)::int || ' ' || min(date) || ' ' || max(date) from public.get_month_availability(tests.biz('t-biz-a'), '2031-02-28') where tour_id = tests.tour('T-A1')),
  '28 2031-02-01 2031-02-28', 'normal February has 28 days');
select is((select count(*)::int from public.get_month_availability(tests.biz('t-biz-a'), '2031-04-01')), 60,
  'one row per active tour per day (2 tours x 30 days)');
reset timezone;
select tests.logout();

-- "Today" follows the business timezone, not the server's.
update public.businesses set timezone = 'Pacific/Kiritimati' where slug = 't-biz-a';
update public.businesses set timezone = 'Etc/GMT+12' where slug = 't-biz-b';
select tests.login('t_owner_a@test.local');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), public.local_date(now(), 'Etc/GMT+12'), 1, 0, 'Too late') $$,
  'P0001', 'date_in_past', 'business at UTC+14: a date that is still today further west is already past');
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), public.local_date(now(), 'Pacific/Kiritimati'), 1, 0, 'East biz today') $$,
  'business at UTC+14: its own today is accepted');
select tests.login('t_owner_b@test.local');
select lives_ok($$ select tests.book(tests.biz('t-biz-b'), tests.tour('T-B1'), public.local_date(now(), 'Etc/GMT+12'), 1, 0, 'West biz today') $$,
  'business at UTC-12: its own today is accepted although it is past elsewhere');
select throws_ok($$ select public.set_day_availability(tests.tour('T-B1'), public.local_date(now(), 'Etc/GMT+12') - 1, 1, false, null) $$,
  'P0001', 'date_in_past', 'availability edits use the business today as well');

select tests.logout();
select * from finish();
rollback;
