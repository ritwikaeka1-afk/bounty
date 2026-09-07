-- CampusBounty schema. Run in the Supabase SQL editor or via `supabase db push`.
create type public.verification_status as enum ('pending', 'verified', 'rejected');
create type public.bounty_status as enum ('open', 'accepted', 'submitted', 'completed', 'cancelled', 'disputed', 'expired');
create type public.ledger_transaction_type as enum ('grant', 'bounty_hold', 'bounty_release', 'bounty_refund');

create table public.universities (id uuid primary key default gen_random_uuid(), name text not null, email_domain text unique not null, is_active boolean not null default true);
create table public.profiles (
  id uuid primary key references auth.users on delete restrict,
  university_id uuid references public.universities,
  display_name text not null check (char_length(display_name) between 2 and 60),
  avatar_url text,
  verification_status public.verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint verified_profiles_need_university
    check (verification_status <> 'verified' or university_id is not null)
);
create type public.credit_account_type as enum ('student', 'escrow');
create table public.credit_accounts (id uuid primary key default gen_random_uuid(), profile_id uuid unique references public.profiles on delete restrict, university_id uuid not null references public.universities, account_type public.credit_account_type not null default 'student', available_balance integer not null default 0 check (available_balance >= 0),  updated_at timestamptz not null default now(), constraint account_owner check ((account_type = 'student' and profile_id is not null) or (account_type = 'escrow' and profile_id is null)));
create unique index one_escrow_account_per_university on public.credit_accounts (university_id) where account_type = 'escrow';
create table public.bounties (id uuid primary key default gen_random_uuid(), creator_id uuid not null references public.profiles, university_id uuid not null references public.universities, title text not null check (char_length(title) between 5 and 120), description text not null check (char_length(description) between 20 and 3000), category text not null, reward_credits integer not null check (reward_credits > 0), status public.bounty_status not null default 'open', accepted_by uuid references public.profiles, due_at timestamptz, created_at timestamptz not null default now(), completed_at timestamptz, constraint different_creator_and_acceptor check (creator_id is distinct from accepted_by));
create table public.bounty_events (id uuid primary key default gen_random_uuid(), bounty_id uuid not null references public.bounties on delete cascade, actor_id uuid references public.profiles, event_type text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table public.ledger_transactions (id uuid primary key default gen_random_uuid(), type public.ledger_transaction_type not null, bounty_id uuid references public.bounties, created_by uuid references public.profiles, idempotency_key uuid not null unique, created_at timestamptz not null default now());
create table public.ledger_entries (id uuid primary key default gen_random_uuid(), transaction_id uuid not null references public.ledger_transactions on delete restrict, account_id uuid not null references public.credit_accounts on delete restrict, amount integer not null check (amount <> 0), created_at timestamptz not null default now());

-- An admin must still explicitly set verification_status = 'verified'.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare university uuid; display text;
begin
  select id into university from public.universities
  where email_domain = lower(split_part(new.email, '@', 2)) and is_active = true;
  if university is null then return new; end if;
  display := left(
  coalesce(
    nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(btrim(split_part(new.email, '@', 1)), ''),
    'Student'
  ),
  60
);

if char_length(display) < 2 then
  display := 'Student';
end if;
  insert into public.profiles (id, university_id, display_name) values (new.id, university, display);
  insert into public.credit_accounts (profile_id, university_id) values (new.id, university);
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security; alter table public.credit_accounts enable row level security; alter table public.bounties enable row level security; alter table public.bounty_events enable row level security; alter table public.ledger_transactions enable row level security; alter table public.ledger_entries enable row level security;
create policy "view own profile" on public.profiles for select using (id = auth.uid());
create policy "view own account" on public.credit_accounts for select using (profile_id = auth.uid());

create policy "verified campus can browse open bounties"
on public.bounties
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.verification_status = 'verified'
      and p.university_id = bounties.university_id
  )
  and (
    status = 'open'
    or creator_id = auth.uid()
    or accepted_by = auth.uid()
  )
);
create policy "view relevant bounty events" on public.bounty_events for select using (exists (select 1 from public.bounties b where b.id = bounty_id and (b.creator_id = auth.uid() or b.accepted_by = auth.uid())));
create policy "view own ledger transactions" on public.ledger_transactions for select using (created_by = auth.uid() or exists (select 1 from public.bounties b where b.id = bounty_id and b.accepted_by = auth.uid()));
create policy "view own ledger entries" on public.ledger_entries for select using (account_id in (select id from public.credit_accounts where profile_id = auth.uid()));

-- All state-changing work happens through these RPCs. No client gets INSERT/UPDATE
-- policies on bounties, account balances, or either ledger table.
create or replace function public.require_verified_student()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from profiles where id = auth.uid() and verification_status = 'verified';
  if not found then raise exception 'Verified student account required'; end if;
  return p;
end; $$;

create or replace function public.create_bounty(p_title text, p_description text, p_category text, p_reward_credits integer, p_due_at timestamptz default null)

returns uuid language plpgsql security definer set search_path = public as $$
declare p public.profiles; bounty_id uuid;
begin
  p := require_verified_student();
  if char_length(p_title) not between 5 and 120 or char_length(p_description) not between 20 and 3000 or p_reward_credits <= 0 then raise exception 'Invalid bounty details'; end if;
  insert into bounties (creator_id, university_id, title, description, category, reward_credits, due_at)
  values (p.id, p.university_id, p_title, p_description, p_category, p_reward_credits, p_due_at) returning id into bounty_id;
  insert into bounty_events (bounty_id, actor_id, event_type) values (bounty_id, p.id, 'created');
  return bounty_id;
end; $$;

create or replace function public.accept_bounty(p_bounty_id uuid, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles; b public.bounties; creator_account uuid; escrow_account uuid; txn uuid;
begin
  p := require_verified_student();
 if exists (
  select 1
  from public.ledger_transactions lt
  where lt.idempotency_key = p_idempotency_key
    and lt.created_by = p.id
    and lt.bounty_id = p_bounty_id
    and lt.type = 'bounty_hold'
) then
  return;
end if;

if exists (
  select 1
  from public.ledger_transactions
  where idempotency_key = p_idempotency_key
) then
  raise exception 'Idempotency key was already used for a different request';
end if;
  select * into b from bounties where id = p_bounty_id for update;
  if not found or b.status <> 'open' or b.creator_id = p.id or b.university_id <> p.university_id then raise exception 'Bounty cannot be accepted'; end if;
  select id into creator_account from credit_accounts where profile_id = b.creator_id for update;
  if (select available_balance from credit_accounts where id = creator_account) < b.reward_credits then raise exception 'Creator has insufficient credits'; end if;
  insert into credit_accounts (university_id, account_type) values (b.university_id, 'escrow') on conflict do nothing;
  select id into escrow_account from credit_accounts where university_id = b.university_id and account_type = 'escrow' for update;
  update credit_accounts set available_balance = available_balance - b.reward_credits, updated_at = now() where id = creator_account;
  update credit_accounts set available_balance = available_balance + b.reward_credits, updated_at = now() where id = escrow_account;
  insert into ledger_transactions (type, bounty_id, created_by, idempotency_key) values ('bounty_hold', b.id, p.id, p_idempotency_key) returning id into txn;
  insert into ledger_entries (transaction_id, account_id, amount) values (txn, creator_account, -b.reward_credits), (txn, escrow_account, b.reward_credits);
  update bounties set status = 'accepted', accepted_by = p.id where id = b.id;
  insert into bounty_events (bounty_id, actor_id, event_type) values (b.id, p.id, 'accepted');
end; $$;

create or replace function public.submit_bounty(p_bounty_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles; b public.bounties;
begin
  p := require_verified_student(); select * into b from bounties where id = p_bounty_id for update;
  if not found or b.status <> 'accepted' or b.accepted_by <> p.id then raise exception 'Bounty cannot be submitted'; end if;
  update bounties set status = 'submitted' where id = b.id;
  insert into bounty_events (bounty_id, actor_id, event_type) values (b.id, p.id, 'submitted');
end; $$;

create or replace function public.complete_bounty(p_bounty_id uuid, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles; b public.bounties; winner_account uuid; escrow_account uuid; txn uuid;
begin
  p := require_verified_student();

if exists (
  select 1
  from public.ledger_transactions lt
  where lt.idempotency_key = p_idempotency_key
    and lt.created_by = p.id
    and lt.bounty_id = p_bounty_id
    and lt.type = 'bounty_release'
) then
  return;
end if;

if exists (
  select 1
  from public.ledger_transactions
  where idempotency_key = p_idempotency_key
) then
  raise exception 'Idempotency key was already used for a different request';
end if;
  
  select * into b from bounties where id = p_bounty_id for update;
  if not found or b.status <> 'submitted' or b.creator_id <> p.id then raise exception 'Bounty cannot be completed'; end if;
  select id into winner_account from credit_accounts where profile_id = b.accepted_by for update;
  select id into escrow_account from credit_accounts where university_id = b.university_id and account_type = 'escrow' for update;
  update credit_accounts set available_balance = available_balance - b.reward_credits, updated_at = now() where id = escrow_account;
  update credit_accounts set available_balance = available_balance + b.reward_credits, updated_at = now() where id = winner_account;
  insert into ledger_transactions (type, bounty_id, created_by, idempotency_key) values ('bounty_release', b.id, p.id, p_idempotency_key) returning id into txn;
  insert into ledger_entries (transaction_id, account_id, amount) values (txn, escrow_account, -b.reward_credits), (txn, winner_account, b.reward_credits);
  update bounties set status = 'completed', completed_at = now() where id = b.id;
  insert into bounty_events (bounty_id, actor_id, event_type) values (b.id, p.id, 'completed');
end; $$;

revoke all on function public.require_verified_student() from public;


revoke execute on function public.create_bounty(text, text, text, integer, timestamptz) from public, anon;
revoke execute on function public.accept_bounty(uuid, uuid) from public, anon;
revoke execute on function public.submit_bounty(uuid) from public, anon;
revoke execute on function public.complete_bounty(uuid, uuid) from public, anon;

grant execute on function public.create_bounty(text, text, text, integer, timestamptz) to authenticated;
grant execute on function public.accept_bounty(uuid, uuid) to authenticated;
grant execute on function public.submit_bounty(uuid) to authenticated;
grant execute on function public.complete_bounty(uuid, uuid) to authenticated;
