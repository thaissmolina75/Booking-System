-- Phase 1 / part 2: security helpers, triggers, grants and RLS policies.

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so policies can call them without recursing into
-- the RLS of the tables they read. They only ever answer about the caller.
-- ---------------------------------------------------------------------------
create function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = (select auth.uid())
  );
$$;

create function public.is_member(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = (select auth.uid())
  );
$$;

create function public.has_role(p_business_id uuid, p_role public.membership_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.role = p_role
  );
$$;

-- Calendar date of an instant in a timezone. The only place a timestamp
-- becomes a date, used to answer "what is today for this business".
create function public.local_date(p_at timestamptz, p_timezone text)
returns date
language sql stable set search_path = ''
as $$
  select (p_at at time zone p_timezone)::date;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Profile row for every new auth user (email sign-up and Google).
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Booking code prefix from the business name: "Desert Safari" -> DS.
create function public.businesses_before_insert()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_base   text;
  v_prefix text;
  v_n      integer := 1;
begin
  -- Raises on an unknown timezone name.
  perform now() at time zone new.timezone;

  if new.booking_prefix is null then
    select upper(string_agg(left(w[1], 1), '' order by ord))
      into v_base
      from regexp_matches(new.name, '[A-Za-z][A-Za-z0-9]*', 'g') with ordinality as m (w, ord)
     where ord <= 3;
    if v_base is null or length(v_base) < 2 then
      v_base := upper(left(regexp_replace(new.name, '[^A-Za-z]', '', 'g') || 'XX', 2));
    end if;
    v_prefix := v_base;
    while exists (select 1 from public.businesses b where b.booking_prefix = v_prefix) loop
      v_n := v_n + 1;
      v_prefix := v_base || v_n::text;
    end loop;
    new.booking_prefix := v_prefix;
  end if;
  return new;
end;
$$;

create trigger businesses_before_insert
  before insert on public.businesses
  for each row execute function public.businesses_before_insert();

-- RLS cannot restrict columns, so this trigger does: owners may edit their
-- business, but status, trial, commission and identity fields are for
-- platform admins only. Runs as the calling role (not SECURITY DEFINER) so
-- current_user tells API callers apart from trusted server-side roles.
create function public.businesses_guard_update()
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
     or new.commission_value is distinct from old.commission_value then
    raise exception 'protected_field'
      using errcode = '42501',
            detail = 'Status, trial end and commission can only be changed by the platform admin.';
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

create trigger businesses_guard_update
  before update on public.businesses
  for each row execute function public.businesses_guard_update();

-- Every change to status, trial or commission is written to the audit log,
-- whichever path made it.
create function public.businesses_audit_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_changes jsonb := '{}'::jsonb;
begin
  if new.status is distinct from old.status then
    v_changes := v_changes || jsonb_build_object('status', jsonb_build_array(old.status, new.status));
  end if;
  if new.trial_ends_at is distinct from old.trial_ends_at then
    v_changes := v_changes || jsonb_build_object('trial_ends_at', jsonb_build_array(old.trial_ends_at, new.trial_ends_at));
  end if;
  if new.commission_type is distinct from old.commission_type then
    v_changes := v_changes || jsonb_build_object('commission_type', jsonb_build_array(old.commission_type, new.commission_type));
  end if;
  if new.commission_value is distinct from old.commission_value then
    v_changes := v_changes || jsonb_build_object('commission_value', jsonb_build_array(old.commission_value, new.commission_value));
  end if;
  if v_changes <> '{}'::jsonb then
    insert into public.audit_log (business_id, user_id, action, entity, entity_id, details)
    values (new.id, (select auth.uid()), 'business.billing_updated', 'business', new.id, v_changes);
  end if;
  return new;
end;
$$;

create trigger businesses_audit_update
  after update on public.businesses
  for each row execute function public.businesses_audit_update();

create function public.businesses_audit_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.audit_log (business_id, user_id, action, entity, entity_id, details)
  values (new.id, (select auth.uid()), 'business.created', 'business', new.id,
          jsonb_build_object('name', new.name, 'slug', new.slug));
  return new;
end;
$$;

create trigger businesses_audit_insert
  after insert on public.businesses
  for each row execute function public.businesses_audit_insert();

-- A business must always keep at least one owner.
create function public.memberships_keep_last_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.business_id <> old.business_id)
     -- When the whole business is being deleted the parent row is already gone.
     and exists (select 1 from public.businesses b where b.id = old.business_id)
     and not exists (
       select 1 from public.memberships m
       where m.business_id = old.business_id and m.role = 'owner' and m.id <> old.id
     ) then
    raise exception 'last_owner'
      using errcode = 'P0001', detail = 'A business must keep at least one owner.';
  end if;
  if tg_op = 'DELETE' then
    insert into public.audit_log (business_id, user_id, action, entity, entity_id, details)
    select old.business_id, (select auth.uid()), 'membership.removed', 'membership', old.id,
           jsonb_build_object('removed_user_id', old.user_id, 'role', old.role)
    where exists (select 1 from public.businesses b where b.id = old.business_id);
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_keep_last_owner
  before delete or update on public.memberships
  for each row execute function public.memberships_keep_last_owner();

-- ---------------------------------------------------------------------------
-- Grants. Signed-out visitors (anon) get nothing. Signed-in users get table
-- privileges, and RLS decides which rows. Bookings have no INSERT grant at
-- all: creation goes through create_booking only.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to authenticated, service_role;

grant select                         on public.platform_admins        to authenticated;
grant select, update                 on public.profiles               to authenticated;
grant select, insert, update, delete on public.businesses             to authenticated;
grant select, insert, update, delete on public.memberships            to authenticated;
grant select, insert, delete         on public.invites                to authenticated;
grant select, insert, update, delete on public.tours                  to authenticated;
grant select, insert, update, delete on public.availability_overrides to authenticated;
grant select, update, delete         on public.bookings               to authenticated;
grant select                         on public.booking_counters       to authenticated;
grant select                         on public.audit_log              to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function public.is_platform_admin()                         to authenticated, service_role;
grant execute on function public.is_member(uuid)                             to authenticated, service_role;
grant execute on function public.has_role(uuid, public.membership_role)      to authenticated, service_role;
grant execute on function public.local_date(timestamptz, text)               to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

-- platform_admins: a user can see whether they are an admin; admins see all.
-- No write policy exists: rows are managed with SQL only.
create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

-- profiles: own row, people you share a business with, or admin.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_platform_admin())
    or exists (
      select 1 from public.memberships m
      where m.user_id = profiles.user_id and public.is_member(m.business_id)
    )
  );
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

-- businesses
create policy businesses_select on public.businesses
  for select to authenticated
  using (public.is_member(id) or (select public.is_platform_admin()));
create policy businesses_admin_insert on public.businesses
  for insert to authenticated
  with check ((select public.is_platform_admin()));
-- Owners can update; businesses_guard_update limits which columns.
create policy businesses_update on public.businesses
  for update to authenticated
  using (public.has_role(id, 'owner') or (select public.is_platform_admin()))
  with check (public.has_role(id, 'owner') or (select public.is_platform_admin()));
create policy businesses_admin_delete on public.businesses
  for delete to authenticated
  using ((select public.is_platform_admin()));

-- memberships: members see their team. Owners can remove members (never the
-- last owner). New memberships come from accept_invite or a platform admin.
create policy memberships_select on public.memberships
  for select to authenticated
  using (public.is_member(business_id) or (select public.is_platform_admin()));
create policy memberships_admin_insert on public.memberships
  for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy memberships_admin_update on public.memberships
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.has_role(business_id, 'owner') or (select public.is_platform_admin()));

-- invites: owners and admins only. Staff cannot read invite tokens.
create policy invites_select on public.invites
  for select to authenticated
  using (public.has_role(business_id, 'owner') or (select public.is_platform_admin()));
create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    (public.has_role(business_id, 'owner') or (select public.is_platform_admin()))
    and created_by = (select auth.uid())
    and accepted_at is null
  );
create policy invites_delete on public.invites
  for delete to authenticated
  using (public.has_role(business_id, 'owner') or (select public.is_platform_admin()));

-- tours
create policy tours_select on public.tours
  for select to authenticated
  using (public.is_member(business_id) or (select public.is_platform_admin()));
create policy tours_insert on public.tours
  for insert to authenticated
  with check (public.has_role(business_id, 'owner') or (select public.is_platform_admin()));
create policy tours_update on public.tours
  for update to authenticated
  using (public.has_role(business_id, 'owner') or (select public.is_platform_admin()))
  with check (public.has_role(business_id, 'owner') or (select public.is_platform_admin()));
create policy tours_delete on public.tours
  for delete to authenticated
  using (public.has_role(business_id, 'owner') or (select public.is_platform_admin()));

-- availability_overrides: everyone in the business reads. Owners write through
-- set_day_availability / reset_day_availability (which reject past dates), so
-- only platform admins have a direct write policy.
create policy availability_select on public.availability_overrides
  for select to authenticated
  using (public.is_member(business_id) or (select public.is_platform_admin()));
create policy availability_admin_insert on public.availability_overrides
  for insert to authenticated
  with check ((select public.is_platform_admin()));
create policy availability_admin_update on public.availability_overrides
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy availability_admin_delete on public.availability_overrides
  for delete to authenticated
  using ((select public.is_platform_admin()));

-- bookings: everyone in the business reads. Nobody inserts directly. Status
-- changes go through decide_booking / cancel_booking.
create policy bookings_select on public.bookings
  for select to authenticated
  using (public.is_member(business_id) or (select public.is_platform_admin()));
create policy bookings_admin_update on public.bookings
  for update to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));
create policy bookings_admin_delete on public.bookings
  for delete to authenticated
  using ((select public.is_platform_admin()));

-- booking_counters: internal. Visible to admins only, written by create_booking.
create policy booking_counters_admin_select on public.booking_counters
  for select to authenticated
  using ((select public.is_platform_admin()));

-- audit_log: read-only for members of the business and admins. Written by
-- functions and triggers only.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    (business_id is not null and public.is_member(business_id))
    or (select public.is_platform_admin())
  );
