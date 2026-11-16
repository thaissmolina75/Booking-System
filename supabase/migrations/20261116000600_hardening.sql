-- Phase 5: tightening found in the security pass.

-- 1. Invites: the app may only choose who is invited and with which role.
--    Token, expiry, accepted_at and created_by always come from the column
--    defaults, so an owner cannot mint a guessable or never-expiring invite.
revoke insert on public.invites from authenticated;
grant insert (business_id, email, role) on public.invites to authenticated;

-- 2. Currency joins the fields only a platform admin may change: commission
--    and prices are reported in it. Everything else is as in Phase 1.
create or replace function public.businesses_guard_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform now() at time zone new.timezone;

  if current_user not in ('authenticated', 'anon') then
    return new; -- service role / direct database access
  end if;
  if (select public.is_platform_admin()) then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.commission_type is distinct from old.commission_type
     or new.commission_value is distinct from old.commission_value
     or new.currency is distinct from old.currency then
    raise exception 'protected_field'
      using errcode = '42501',
            detail = 'Status, trial end, commission and currency can only be changed by the platform admin.';
  end if;
  if new.id is distinct from old.id
     or new.slug is distinct from old.slug
     or new.booking_prefix is distinct from old.booking_prefix
     or new.created_at is distinct from old.created_at then
    raise exception 'protected_field'
      using errcode = '42501',
            detail = 'This field can only be changed by the platform admin.';
  end if;
  return new;
end;
$$;

revoke all on function public.businesses_guard_update() from public, anon, authenticated;
