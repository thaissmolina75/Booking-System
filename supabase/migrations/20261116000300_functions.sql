-- Phase 1 / part 3: seat logic and RPC functions.
--
-- Error convention: functions raise with a short machine-readable MESSAGE
-- (e.g. not_enough_seats) and a human-readable DETAIL. The app maps the
-- message to UI text. '42501' is used for permission errors.
--
-- Every SECURITY DEFINER function below sets search_path = '' and checks the
-- caller before touching data.

-- Internal: one audit row. Not callable through the API.
create function public.write_audit(
  p_business_id uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb
) returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (business_id, user_id, action, entity, entity_id, details)
  values (p_business_id, (select auth.uid()), p_action, p_entity, p_entity_id,
          coalesce(p_details, '{}'::jsonb));
$$;

-- Internal: serialises everything that changes seats for one tour on one day.
-- Held until the surrounding transaction ends.
create function public.lock_tour_day(p_tour_id uuid, p_date date)
returns void
language sql set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_tour_id::text || ':' || p_date::text, 42));
$$;

-- ---------------------------------------------------------------------------
-- create_booking: the ONLY way a booking is created.
--   * members and platform admins: source must be 'manual'
--   * service role (the future chatbot backend): any source
-- ---------------------------------------------------------------------------
create function public.create_booking(
  p_business_id     uuid,
  p_tour_id         uuid,
  p_date            date,
  p_adults          integer,
  p_children        integer,
  p_customer_name   text,
  p_customer_phone  text,
  p_pickup_location text,
  p_source          public.booking_source,
  p_notes           text default null
) returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_is_service boolean := coalesce((select auth.role()), '') = 'service_role';
  v_business   public.businesses;
  v_tour       public.tours;
  v_override   public.availability_overrides;
  v_today      date;
  v_people     integer;
  v_capacity   integer;
  v_taken      integer;
  v_number     integer;
  v_booking    public.bookings;
begin
  if not (v_is_service
          or (v_uid is not null and (public.is_member(p_business_id) or public.is_platform_admin()))) then
    raise exception 'not_authorized'
      using errcode = '42501', detail = 'You do not have access to this business.';
  end if;
  if not v_is_service and p_source <> 'manual' then
    raise exception 'invalid_source'
      using errcode = '42501', detail = 'Bookings added from the dashboard must use the manual source.';
  end if;

  if p_date is null then
    raise exception 'invalid_input' using detail = 'A date is required.';
  end if;
  if p_adults is null or p_adults < 1 then
    raise exception 'invalid_input' using detail = 'At least one adult is required.';
  end if;
  p_children := coalesce(p_children, 0);
  if p_children < 0 then
    raise exception 'invalid_input' using detail = 'Children cannot be negative.';
  end if;
  if p_customer_name is null or btrim(p_customer_name) = '' then
    raise exception 'invalid_input' using detail = 'Customer name is required.';
  end if;
  v_people := p_adults + p_children;

  select * into v_business from public.businesses b where b.id = p_business_id;
  if not found then
    raise exception 'business_not_found' using detail = 'Business not found.';
  end if;

  select * into v_tour from public.tours t
   where t.id = p_tour_id and t.business_id = p_business_id;
  if not found then
    raise exception 'tour_not_found' using detail = 'This tour does not exist in this business.';
  end if;
  if not v_tour.is_active then
    raise exception 'tour_inactive' using detail = 'This tour is not active.';
  end if;

  -- Bot bookings stop while the business is suspended or its trial has ended.
  -- Manual bookings from the dashboard keep working.
  if p_source <> 'manual'
     and (v_business.status = 'suspended'
          or (v_business.status = 'trial' and v_business.trial_ends_at is not null
              and v_business.trial_ends_at < now())) then
    raise exception 'automation_paused'
      using detail = 'Automation is paused for this business.';
  end if;

  v_today := public.local_date(now(), v_business.timezone);
  if p_date < v_today then
    raise exception 'date_in_past' using detail = 'You cannot book a date in the past.';
  end if;

  -- From here on, only one transaction at a time works on this tour and day.
  perform public.lock_tour_day(p_tour_id, p_date);

  select * into v_override from public.availability_overrides o
   where o.tour_id = p_tour_id and o.date = p_date;
  if found and v_override.is_blocked then
    raise exception 'date_blocked' using detail = 'This day is blocked for this tour.';
  end if;
  v_capacity := coalesce(v_override.seats, v_tour.default_seats_per_day);

  select coalesce(sum(b.adults + b.children), 0) into v_taken
    from public.bookings b
   where b.tour_id = p_tour_id and b.date = p_date
     and b.status in ('pending', 'approved');

  if v_capacity - v_taken < v_people then
    raise exception 'not_enough_seats'
      using detail = format('Only %s seat(s) left on this day, %s requested.',
                            greatest(v_capacity - v_taken, 0), v_people),
            hint = (v_capacity - v_taken)::text;
  end if;

  insert into public.booking_counters as c (business_id, last_number)
  values (p_business_id, 1)
  on conflict (business_id) do update set last_number = c.last_number + 1
  returning c.last_number into v_number;

  insert into public.bookings (
    business_id, tour_id, code, date, adults, children, pickup_location,
    customer_name, customer_phone, source, status, notes, total_amount
  ) values (
    p_business_id, p_tour_id,
    v_business.booking_prefix || '-' || lpad(v_number::text, 4, '0'),
    p_date, p_adults, p_children, nullif(btrim(p_pickup_location), ''),
    btrim(p_customer_name), nullif(btrim(p_customer_phone), ''), p_source, 'pending',
    nullif(btrim(p_notes), ''),
    p_adults * v_tour.price_adult + p_children * v_tour.price_child
  )
  returning * into v_booking;

  perform public.write_audit(p_business_id, 'booking.created', 'booking', v_booking.id,
    jsonb_build_object('code', v_booking.code, 'date', v_booking.date, 'people', v_people,
                       'source', v_booking.source));
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- decide_booking: any member (owner or staff) approves or declines a pending
-- booking.
-- ---------------------------------------------------------------------------
create function public.decide_booking(p_booking_id uuid, p_decision public.booking_status)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_booking public.bookings;
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = '42501', detail = 'Sign in first.';
  end if;
  if p_decision is null or p_decision not in ('approved', 'declined') then
    raise exception 'invalid_decision' using detail = 'Decision must be approved or declined.';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;
  -- Same error whether the booking is missing or belongs to another business,
  -- so the function cannot be used to probe for ids.
  if not found
     or not (public.is_member(v_booking.business_id) or public.is_platform_admin()) then
    raise exception 'booking_not_found' using detail = 'Booking not found.';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'booking_not_pending'
      using detail = format('This booking is already %s.', v_booking.status);
  end if;

  update public.bookings
     set status = p_decision, decided_at = now(), decided_by = v_uid
   where id = p_booking_id
  returning * into v_booking;

  perform public.write_audit(v_booking.business_id, 'booking.' || p_decision::text, 'booking',
    v_booking.id, jsonb_build_object('code', v_booking.code));
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking: owner only. Frees the seats.
-- ---------------------------------------------------------------------------
create function public.cancel_booking(p_booking_id uuid)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_booking public.bookings;
  v_from    public.booking_status;
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = '42501', detail = 'Sign in first.';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id for update;
  if not found
     or not (public.is_member(v_booking.business_id) or public.is_platform_admin()) then
    raise exception 'booking_not_found' using detail = 'Booking not found.';
  end if;
  if not (public.has_role(v_booking.business_id, 'owner') or public.is_platform_admin()) then
    raise exception 'not_authorized'
      using errcode = '42501', detail = 'Only the business owner can cancel a booking.';
  end if;
  if v_booking.status not in ('pending', 'approved') then
    raise exception 'booking_not_active'
      using detail = format('This booking is already %s.', v_booking.status);
  end if;

  v_from := v_booking.status;
  update public.bookings
     set status = 'cancelled', decided_at = now(), decided_by = v_uid
   where id = p_booking_id
  returning * into v_booking;

  perform public.write_audit(v_booking.business_id, 'booking.cancelled', 'booking', v_booking.id,
    jsonb_build_object('code', v_booking.code, 'from_status', v_from));
  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_month_availability: one row per active tour per day of the month that
-- contains p_month. Returns no rows to callers outside the business.
--   capacity   = override.seats if set, else tour default; 0 when blocked
--   taken      = people in pending + approved bookings
--   seats_left = capacity - taken (negative means overbooked; never hidden)
-- Days are built with integer date arithmetic, never via timestamps.
-- ---------------------------------------------------------------------------
create function public.get_month_availability(p_business_id uuid, p_month date)
returns table (
  tour_id        uuid,
  tour_name      text,
  date           date,
  capacity       integer,
  taken          integer,
  seats_left     integer,
  is_blocked     boolean,
  pending_count  integer,
  approved_count integer
)
language sql stable security definer set search_path = ''
as $$
  with allowed as (
    select (select auth.uid()) is not null
           and (public.is_member(p_business_id) or public.is_platform_admin()) as ok
  ),
  bounds as (
    select make_date(extract(year from p_month)::int, extract(month from p_month)::int, 1) as first_day
  ),
  days as (
    select b.first_day + g.n as day
      from bounds b
      cross join lateral generate_series(
        0, ((b.first_day + interval '1 month')::date - b.first_day) - 1
      ) as g (n)
  ),
  booked as (
    select bk.tour_id, bk.date,
           sum(bk.adults + bk.children)::int                 as taken,
           count(*) filter (where bk.status = 'pending')::int  as pending_count,
           count(*) filter (where bk.status = 'approved')::int as approved_count
      from public.bookings bk, bounds b
     where bk.business_id = p_business_id
       and bk.status in ('pending', 'approved')
       and bk.date >= b.first_day
       and bk.date < (b.first_day + interval '1 month')::date
     group by bk.tour_id, bk.date
  )
  select t.id,
         t.name,
         d.day,
         case when coalesce(o.is_blocked, false) then 0
              else coalesce(o.seats, t.default_seats_per_day) end,
         coalesce(k.taken, 0),
         case when coalesce(o.is_blocked, false) then 0
              else coalesce(o.seats, t.default_seats_per_day) end - coalesce(k.taken, 0),
         coalesce(o.is_blocked, false),
         coalesce(k.pending_count, 0),
         coalesce(k.approved_count, 0)
    from allowed a
    join public.tours t on a.ok and t.business_id = p_business_id and t.is_active
    cross join days d
    left join public.availability_overrides o on o.tour_id = t.id and o.date = d.day
    left join booked k on k.tour_id = t.id and k.date = d.day
   order by t.sort_order, t.name, t.id, d.day;
$$;

-- ---------------------------------------------------------------------------
-- set_day_availability / reset_day_availability: owner only, never in the past.
-- ---------------------------------------------------------------------------
create function public.set_day_availability(
  p_tour_id uuid, p_date date, p_seats integer, p_is_blocked boolean, p_note text default null
) returns public.availability_overrides
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_tour     public.tours;
  v_timezone text;
  v_row      public.availability_overrides;
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
  if p_date is null then
    raise exception 'invalid_input' using detail = 'A date is required.';
  end if;
  if p_seats is not null and p_seats < 0 then
    raise exception 'invalid_input' using detail = 'Seats cannot be negative.';
  end if;

  select b.timezone into v_timezone from public.businesses b where b.id = v_tour.business_id;
  if p_date < public.local_date(now(), v_timezone) then
    raise exception 'date_in_past' using detail = 'Past days cannot be changed.';
  end if;

  -- Same lock as create_booking, so capacity never changes mid-booking.
  perform public.lock_tour_day(p_tour_id, p_date);

  insert into public.availability_overrides as o (business_id, tour_id, date, seats, is_blocked, note)
  values (v_tour.business_id, p_tour_id, p_date, p_seats, coalesce(p_is_blocked, false),
          nullif(btrim(p_note), ''))
  on conflict (tour_id, date) do update
    set seats = excluded.seats, is_blocked = excluded.is_blocked, note = excluded.note
  returning * into v_row;

  perform public.write_audit(v_tour.business_id, 'availability.set', 'availability_override', v_row.id,
    jsonb_build_object('tour_id', p_tour_id, 'date', p_date, 'seats', p_seats,
                       'is_blocked', v_row.is_blocked, 'note', v_row.note));
  return v_row;
end;
$$;

create function public.reset_day_availability(p_tour_id uuid, p_date date)
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

  delete from public.availability_overrides o
   where o.tour_id = p_tour_id and o.date = p_date
  returning o.id into v_id;

  if v_id is not null then
    perform public.write_audit(v_tour.business_id, 'availability.reset', 'availability_override', v_id,
      jsonb_build_object('tour_id', p_tour_id, 'date', p_date));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite: links the signed-in user to the business. The email is read
-- from auth.users (not from client input) and must be confirmed and match.
-- ---------------------------------------------------------------------------
create function public.accept_invite(p_token text)
returns public.memberships
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_email      text;
  v_confirmed  timestamptz;
  v_invite     public.invites;
  v_membership public.memberships;
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = '42501', detail = 'Sign in to accept this invite.';
  end if;

  select * into v_invite from public.invites i where i.token = p_token for update;
  if not found then
    raise exception 'invite_not_found' using detail = 'This invite link is not valid.';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite_already_used' using detail = 'This invite has already been used.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'invite_expired' using detail = 'This invite has expired. Ask for a new one.';
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed
    from auth.users u where u.id = v_uid;
  if v_email is null or lower(v_email) <> lower(v_invite.email) then
    raise exception 'invite_email_mismatch'
      using detail = 'This invite was sent to a different email address. Sign in with the invited email.';
  end if;
  if v_confirmed is null then
    raise exception 'email_not_confirmed' using detail = 'Confirm your email address first.';
  end if;

  insert into public.memberships (business_id, user_id, role)
  values (v_invite.business_id, v_uid, v_invite.role)
  on conflict (business_id, user_id) do nothing;

  select * into v_membership from public.memberships m
   where m.business_id = v_invite.business_id and m.user_id = v_uid;

  update public.invites set accepted_at = now() where id = v_invite.id;

  perform public.write_audit(v_invite.business_id, 'invite.accepted', 'invite', v_invite.id,
    jsonb_build_object('role', v_membership.role));
  return v_membership;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_commission_report: platform admin only. One row per business for the
-- month containing p_month, counted by tour date. Commission is owed on
-- APPROVED BOT bookings only, never on manual ones.
-- ---------------------------------------------------------------------------
create function public.get_commission_report(p_month date)
returns table (
  business_id        uuid,
  business_name      text,
  status             public.business_status,
  trial_ends_at      timestamptz,
  currency           text,
  commission_type    public.commission_type,
  commission_value   numeric,
  approved_whatsapp  integer,
  approved_instagram integer,
  approved_manual    integer,
  approved_total     integer,
  bot_revenue        numeric,
  commission_owed    numeric
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_first date;
  v_next  date;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'not_authorized'
      using errcode = '42501', detail = 'Platform admin only.';
  end if;
  if p_month is null then
    raise exception 'invalid_input' using detail = 'A month is required.';
  end if;
  v_first := make_date(extract(year from p_month)::int, extract(month from p_month)::int, 1);
  v_next  := (v_first + interval '1 month')::date;

  return query
  select b.id, b.name, b.status, b.trial_ends_at, b.currency, b.commission_type, b.commission_value,
         coalesce(s.whatsapp, 0), coalesce(s.instagram, 0), coalesce(s.manual, 0), coalesce(s.total, 0),
         coalesce(s.bot_revenue, 0)::numeric,
         round(case b.commission_type
                 when 'percent' then coalesce(s.bot_revenue, 0) * b.commission_value / 100
                 else (coalesce(s.whatsapp, 0) + coalesce(s.instagram, 0)) * b.commission_value
               end, 2)
    from public.businesses b
    left join lateral (
      select count(*) filter (where k.source = 'bot_whatsapp')::int  as whatsapp,
             count(*) filter (where k.source = 'bot_instagram')::int as instagram,
             count(*) filter (where k.source = 'manual')::int        as manual,
             count(*)::int                                           as total,
             sum(k.total_amount) filter (where k.source <> 'manual') as bot_revenue
        from public.bookings k
       where k.business_id = b.id and k.status = 'approved'
         and k.date >= v_first and k.date < v_next
    ) s on true
   order by b.name;
end;
$$;

-- Execute rights. Postgres grants EXECUTE to PUBLIC on every new function, so
-- take it away from everything created above, then grant back only the public
-- API. Internal helpers (write_audit, lock_tour_day) stay uncallable.
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_platform_admin()                    to authenticated, service_role;
grant execute on function public.is_member(uuid)                        to authenticated, service_role;
grant execute on function public.has_role(uuid, public.membership_role) to authenticated, service_role;
grant execute on function public.local_date(timestamptz, text)          to authenticated, service_role;
grant execute on function public.create_booking(uuid, uuid, date, integer, integer, text, text, text, public.booking_source, text)
  to authenticated, service_role;
grant execute on function public.decide_booking(uuid, public.booking_status)          to authenticated;
grant execute on function public.cancel_booking(uuid)                                 to authenticated;
grant execute on function public.get_month_availability(uuid, date)                   to authenticated, service_role;
grant execute on function public.set_day_availability(uuid, date, integer, boolean, text) to authenticated;
grant execute on function public.reset_day_availability(uuid, date)                   to authenticated;
grant execute on function public.accept_invite(text)                                  to authenticated;
grant execute on function public.get_commission_report(date)                          to authenticated;
