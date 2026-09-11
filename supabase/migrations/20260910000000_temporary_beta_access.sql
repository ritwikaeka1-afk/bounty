begin;

-- Only an operator can open or close beta admission. Client metadata is never
-- trusted as evidence of either email confirmation or student verification.
create table public.beta_access_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
-- This release explicitly opens the requested beta when the migration is applied.
insert into public.beta_access_settings(singleton, enabled) values (true, true);
alter table public.beta_access_settings enable row level security;
revoke all on public.beta_access_settings from public, anon, authenticated;

alter table public.profiles add column beta_access_granted boolean not null default false;

create function public.get_beta_access_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select enabled from beta_access_settings where singleton;
$$;
revoke all on function public.get_beta_access_mode() from public;
grant execute on function public.get_beta_access_mode() to anon, authenticated;

create function public.enroll_beta_tester() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  beta_enabled boolean;
  person auth.users;
  existing profiles;
  community uuid;
  display text;
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  -- Lock order matches the operator switch, so enrollment cannot race closure.
  select enabled into beta_enabled from beta_access_settings where singleton for share;
  if not beta_enabled then return false; end if;
  select * into person from auth.users where id = auth.uid() for update;
  if not found or person.email_confirmed_at is null or nullif(person.email, '') is null then
    raise exception 'Confirm your email before joining the beta';
  end if;
  select * into existing from profiles where id = person.id for update;
  if found then
    if existing.verification_status = 'rejected' then return false; end if;
    if existing.verification_status = 'verified' then return existing.beta_access_granted; end if;
  end if;
  select id into community from universities where email_domain = 'ucla.edu' and is_active;
  if community is null then raise exception 'The beta community is unavailable'; end if;
  -- Never move an existing account or its ledger between communities.
  if existing.id is not null and existing.university_id is distinct from community then return false; end if;
  display := left(coalesce(nullif(btrim(person.raw_user_meta_data->>'display_name'), ''), 'Beta tester'), 60);
  if char_length(display) < 2 then display := 'Beta tester'; end if;
  insert into profiles(id, university_id, display_name, verification_status, beta_access_granted)
    values(person.id, community, display, 'verified', true)
    on conflict(id) do update set verification_status = 'verified', beta_access_granted = true;
  insert into credit_accounts(profile_id, university_id) values(person.id, community)
    on conflict(profile_id) do nothing;
  return true;
end;
$$;
revoke all on function public.enroll_beta_tester() from public, anon;
grant execute on function public.enroll_beta_tester() to authenticated;

create function public.set_beta_access(p_enabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_enabled is null then raise exception 'Choose true or false'; end if;
  update beta_access_settings set enabled = p_enabled where singleton;
  if not p_enabled then
    update profiles set verification_status = 'pending'
      where beta_access_granted and verification_status = 'verified';
  end if;
end;
$$;
revoke all on function public.set_beta_access(boolean) from public, anon, authenticated;
grant execute on function public.set_beta_access(boolean) to service_role;

commit;
