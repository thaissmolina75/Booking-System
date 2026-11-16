-- Test 6: accept_invite fails on wrong email, expired token and reused token.
begin;
select plan(17);
select tests.fixture();
-- Stored with capitals on purpose: matching must be case-insensitive.
select tests.create_user('T_Invited@Test.Local');
select tests.create_user('t_wrong@test.local');
select tests.create_user('t_late@test.local');
select tests.create_user('t_unconfirmed@test.local', false);

select tests.login('t_owner_a@test.local');
insert into public.invites (business_id, email, role) values
  (tests.biz('t-biz-a'), 't_invited@test.local', 'staff'),
  (tests.biz('t-biz-a'), 't_late@test.local', 'staff'),
  (tests.biz('t-biz-a'), 't_unconfirmed@test.local', 'staff');
select is((select length(token) from public.invites where email = 't_invited@test.local'), 64, 'token is 64 random hex characters');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
             from public.invites where email = 't_invited@test.local'), 'invite expires in 7 days');
select is((select count(distinct token)::int from public.invites), 3, 'every invite has its own token');
select tests.logout();
update public.invites set expires_at = now() - interval '1 minute' where email = 't_late@test.local';

-- wrong email
select tests.login('t_wrong@test.local');
select throws_ok($$ select public.accept_invite(tests.invite_token('t_invited@test.local')) $$,
  'P0001', 'invite_email_mismatch', 'wrong email: rejected');
select is((select count(*)::int from public.memberships), 0, 'wrong email: no membership created');
select throws_ok($$ select public.accept_invite('not-a-real-token') $$,
  'P0001', 'invite_not_found', 'unknown token: rejected');

-- expired
select tests.login('t_late@test.local');
select throws_ok($$ select public.accept_invite(tests.invite_token('t_late@test.local')) $$,
  'P0001', 'invite_expired', 'expired token: rejected');
select is((select count(*)::int from public.memberships), 0, 'expired token: no membership created');

-- unconfirmed email address
select tests.login('t_unconfirmed@test.local');
select throws_ok($$ select public.accept_invite(tests.invite_token('t_unconfirmed@test.local')) $$,
  'P0001', 'email_not_confirmed', 'unconfirmed email: rejected');

-- happy path, email differs only by case
select tests.login('T_Invited@Test.Local');
select is((select count(*)::int from public.tours), 0, 'before accepting: sees nothing');
select lives_ok($$ select public.accept_invite(tests.invite_token('t_invited@test.local')) $$,
  'matching email (case-insensitive): accepted');
select is((select role::text from public.memberships where user_id = tests.uid('T_Invited@Test.Local')), 'staff',
  'membership created with the invited role');
select is((select count(*)::int from public.tours), 2, 'after accepting: sees the business');

-- reused
select throws_ok($$ select public.accept_invite(tests.invite_token('t_invited@test.local')) $$,
  'P0001', 'invite_already_used', 'reused token: rejected for the same user');
select tests.login('t_wrong@test.local');
select throws_ok($$ select public.accept_invite(tests.invite_token('t_invited@test.local')) $$,
  'P0001', 'invite_already_used', 'reused token: rejected for another user');

select tests.logout();
select is((select count(*)::int from public.memberships where business_id = tests.biz('t-biz-a')), 3,
  'exactly one membership was added');
select is((select count(*)::int from public.audit_log where action = 'invite.accepted' and business_id = tests.biz('t-biz-a')), 1,
  'acceptance written to audit_log');

select * from finish();
rollback;
