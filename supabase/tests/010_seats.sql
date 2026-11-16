-- Tests 1 and 2: seats_left with default, override and blocked; declined and
-- cancelled bookings free seats.
begin;
select plan(24);
select tests.fixture();
select tests.login('t_owner_a@test.local');

-- 1. default capacity
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(30,0,30,f,0,0)',
  'default: capacity comes from tours.default_seats_per_day');

select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10, 4, 2, 'First') $$,
  'booking for 6 people is accepted');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(30,6,24,f,1,0)',
  'taken counts adults + children of pending bookings');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A2'), tests.today() + 10), '(30,0,30,f,0,0)',
  'other tour on the same day is unaffected');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 11), '(30,0,30,f,0,0)',
  'same tour on the next day is unaffected');

-- 1. override
select lives_ok($$ select public.set_day_availability(tests.tour('T-A1'), tests.today() + 10, 10, false, 'small day') $$,
  'owner sets an override of 10 seats');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(10,6,4,f,1,0)',
  'override: capacity comes from override.seats');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10, 5, 0, 'Too many') $$,
  'P0001', 'not_enough_seats', '5 people do not fit in 4 seats');
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10, 3, 1, 'Second') $$,
  'exactly the last 4 seats can be booked');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(10,10,0,f,2,0)',
  'day is now full');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10, 1, 0, 'One more') $$,
  'P0001', 'not_enough_seats', 'a full day rejects even one person');

-- overbooked is shown, never hidden
select public.set_day_availability(tests.tour('T-A1'), tests.today() + 10, 5, false, null);
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(5,10,-5,f,2,0)',
  'lowering capacity below taken shows negative seats_left (overbooked)');

-- 1. blocked
select public.set_day_availability(tests.tour('T-A1'), tests.today() + 10, null, true, 'closed');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(0,10,-10,t,2,0)',
  'blocked: capacity is 0 and existing bookings still show');
select public.set_day_availability(tests.tour('T-A1'), tests.today() + 12, 20, true, 'closed');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 12), '(0,0,0,t,0,0)',
  'blocked wins over a seats value');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 12, 1, 0, 'Blocked') $$,
  'P0001', 'date_blocked', 'blocked day rejects bookings');

-- reset goes back to the default
select public.reset_day_availability(tests.tour('T-A1'), tests.today() + 10);
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(30,10,20,f,2,0)',
  'reset removes the override');

-- 2. declined and cancelled free seats; approved keeps them
select public.decide_booking(tests.booking('First'), 'declined');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(30,4,26,f,1,0)',
  'declined booking frees its 6 seats');
select public.decide_booking(tests.booking('Second'), 'approved');
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(30,4,26,f,0,1)',
  'approved booking keeps its seats and moves to approved_count');
select public.cancel_booking(tests.booking('Second'));
select is(tests.avail(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 10), '(30,0,30,f,0,0)',
  'cancelled booking frees its seats');

-- other rejections
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() - 1, 1, 0, 'Past') $$,
  'P0001', 'date_in_past', 'past dates are rejected');
select lives_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today(), 1, 0, 'Today') $$,
  'today is allowed');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A1'), tests.today() + 1, 0, 2, 'No adult') $$,
  'P0001', 'invalid_input', 'a booking needs at least one adult');
update public.tours set is_active = false where id = tests.tour('T-A2');
select throws_ok($$ select tests.book(tests.biz('t-biz-a'), tests.tour('T-A2'), tests.today() + 1, 1, 0, 'Inactive') $$,
  'P0001', 'tour_inactive', 'inactive tours are rejected');
select is(
  (select count(*)::int from public.get_month_availability(tests.biz('t-biz-a'), tests.today() + 10) where tour_id = tests.tour('T-A2')),
  0, 'inactive tours are not listed in month availability');

select tests.logout();
select * from finish();
rollback;
