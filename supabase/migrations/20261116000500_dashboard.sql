-- Phase 3: what the owner/staff dashboard needs beyond Phase 1.

-- Team list with email addresses, for the Team page. Emails live in
-- auth.users, so this is the only way the app reads them. Owners and platform
-- admins only; anyone else gets no rows.
create function public.get_team_members(p_business_id uuid)
returns table (
  membership_id uuid,
  user_id       uuid,
  role          public.membership_role,
  full_name     text,
  email         text,
  joined_at     timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, m.role, p.full_name, u.email::text, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
   where m.business_id = p_business_id
     and (select auth.uid()) is not null
     and (public.has_role(p_business_id, 'owner') or public.is_platform_admin())
   order by (m.role = 'owner') desc, m.created_at;
$$;

revoke all on function public.get_team_members(uuid) from public, anon;
grant execute on function public.get_team_members(uuid) to authenticated;

-- Realtime cannot apply row level security to DELETE events (the row is gone),
-- so deletes would be announced, with their ids, to every subscriber of the
-- table. Publish inserts and updates only; both are checked against RLS.
alter publication supabase_realtime set (publish = 'insert, update');

-- reset_day_availability deletes the override, which is no longer announced.
-- It now touches the row first: that update IS announced (to members only),
-- and by the time they refetch, the transaction has committed and the row is
-- gone. Everything else is unchanged from Phase 1.
create or replace function public.reset_day_availability(p_tour_id uuid, p_date date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_tour     public.tours;
  v_timezone text;
  v_id       uuid;
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = '42501', detail = 'Sign in first.';
  end if;

  select * into v_tour from public.tours t where t.id = p_tour_id;
  if not found
     or not (public.is_member(v_tour.business_id) or public.is_platform_admin()) then
    raise exception 'tour_not_found' using detail = 'Tour not found.';
  end if;
  if not (public.has_role(v_tour.business_id, 'owner') or public.is_platform_admin()) then
    raise exception 'not_authorized'
      using errcode = '42501', detail = 'Only the business owner can change availability.';
  end if;

  select b.timezone into v_timezone from public.businesses b where b.id = v_tour.business_id;
  if p_date is null or p_date < public.local_date(now(), v_timezone) then
    raise exception 'date_in_past' using detail = 'Past days cannot be changed.';
  end if;

  perform public.lock_tour_day(p_tour_id, p_date);

  update public.availability_overrides o set note = o.note
   where o.tour_id = p_tour_id and o.date = p_date;

  delete from public.availability_overrides o
   where o.tour_id = p_tour_id and o.date = p_date
  returning o.id into v_id;

  if v_id is not null then
    perform public.write_audit(v_tour.business_id, 'availability.reset', 'availability_override', v_id,
      jsonb_build_object('tour_id', p_tour_id, 'date', p_date));
  end if;
end;
$$;
