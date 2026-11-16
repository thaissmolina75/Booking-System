-- Phase 2: what the invite page shows before the invite is accepted.
-- Callable while signed out: the caller must already hold the unguessable
-- token, and gets back only what the invite email itself would tell them.
create function public.get_invite_preview(p_token text)
returns table (
  business_name text,
  role          public.membership_role,
  email         text,
  state         text  -- valid | expired | used
)
language sql stable security definer set search_path = ''
as $$
  select b.name,
         i.role,
         i.email,
         case when i.accepted_at is not null then 'used'
              when i.expires_at <= now() then 'expired'
              else 'valid' end
    from public.invites i
    join public.businesses b on b.id = i.business_id
   where p_token is not null and length(p_token) >= 32 and i.token = p_token;
$$;

revoke all on function public.get_invite_preview(text) from public;
grant usage on schema public to anon;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
