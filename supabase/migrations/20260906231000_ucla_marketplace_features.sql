-- UCLA-first marketplace features. Tasks must be selected from approved templates.
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced');
create type public.proposal_status as enum ('pending', 'accepted', 'declined', 'withdrawn');

alter table public.profiles
  add column if not exists bio text check (char_length(bio) <= 500),
  add column if not exists skills text[] not null default '{}',
  add column if not exists experience public.experience_level not null default 'beginner';

create table public.bounty_templates (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities on delete cascade,
  category text not null,
  subcategory text not null,
  title text not null,
  guidance text not null,
  default_reward_credits integer not null check (default_reward_credits > 0),
  required_skills text[] not null default '{}',
  requires_location boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (university_id, title)
);

alter table public.bounties
  add column if not exists template_id uuid references public.bounty_templates on delete restrict,
  add column if not exists location_name text check (char_length(location_name) <= 120),
  add column if not exists location_address text check (char_length(location_address) <= 300);

create table public.bounty_proposals (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties on delete cascade,
  bidder_id uuid not null references public.profiles on delete restrict,
  message text not null check (char_length(message) between 10 and 1000),
  status public.proposal_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (bounty_id, bidder_id)
);

alter table public.bounty_templates enable row level security;
alter table public.bounty_proposals enable row level security;

create policy "verified students can view campus templates"
on public.bounty_templates for select to authenticated
using (
  is_active
  and university_id = (select university_id from public.profiles where id = auth.uid() and verification_status = 'verified')
);

create policy "proposal participants can view proposals"
on public.bounty_proposals for select to authenticated
using (
  bidder_id = auth.uid()
  or exists (select 1 from public.bounties b where b.id = bounty_id and b.creator_id = auth.uid())
);

-- The original free-form creator RPC remains in the schema for migration compatibility,
-- but authenticated users cannot call it. Approved templates are now mandatory.
revoke execute on function public.create_bounty(text, text, text, integer, timestamptz) from authenticated;
revoke execute on function public.accept_bounty(uuid, uuid) from authenticated;

create or replace function public.create_templated_bounty(
  p_template_id uuid,
  p_description text,
  p_location_name text default null,
  p_location_address text default null,
  p_due_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.profiles; t public.bounty_templates; bounty_id uuid;
begin
  p := public.require_verified_student();
  select * into t from public.bounty_templates
  where id = p_template_id and university_id = p.university_id and is_active = true;
  if not found then raise exception 'Approved UCLA task template required'; end if;
  if char_length(p_description) not between 20 and 3000 then raise exception 'Task details must be 20 to 3000 characters'; end if;
  if t.requires_location and coalesce(nullif(btrim(p_location_name), ''), nullif(btrim(p_location_address), '')) is null then
    raise exception 'A location is required for this task';
  end if;
  insert into public.bounties (creator_id, university_id, title, description, category, reward_credits, due_at, template_id, location_name, location_address)
  values (p.id, p.university_id, t.title, p_description, t.category, t.default_reward_credits, p_due_at, t.id, p_location_name, p_location_address)
  returning id into bounty_id;
  insert into public.bounty_events (bounty_id, actor_id, event_type, metadata)
  values (bounty_id, p.id, 'created', jsonb_build_object('template_id', t.id));
  return bounty_id;
end; $$;

create or replace function public.submit_proposal(p_bounty_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.profiles; b public.bounties; proposal_id uuid;
begin
  p := public.require_verified_student();
  select * into b from public.bounties where id = p_bounty_id;
  if not found or b.status <> 'open' or b.creator_id = p.id or b.university_id <> p.university_id then
    raise exception 'This bounty is not available to bid on';
  end if;
  insert into public.bounty_proposals (bounty_id, bidder_id, message)
  values (b.id, p.id, p_message)
  returning id into proposal_id;
  insert into public.bounty_events (bounty_id, actor_id, event_type) values (b.id, p.id, 'proposal_submitted');
  return proposal_id;
end; $$;

create or replace function public.get_university_stats(p_slug text)
returns table(total_credits bigint, completed_bounties bigint)
language sql security definer set search_path = public as $$
  select
    coalesce((select sum(c.available_balance) from public.credit_accounts c where c.university_id = u.id), 0)::bigint,
    (select count(*) from public.bounties b where b.university_id = u.id and b.status = 'completed')::bigint
  from public.universities u
  where u.slug = p_slug and u.is_active = true;
$$;

revoke execute on function public.create_templated_bounty(uuid, text, text, text, timestamptz), public.submit_proposal(uuid, text) from public, anon;
grant execute on function public.create_templated_bounty(uuid, text, text, text, timestamptz), public.submit_proposal(uuid, text) to authenticated;
revoke execute on function public.get_university_stats(text) from public;
grant execute on function public.get_university_stats(text) to anon, authenticated;

insert into public.bounty_templates (university_id, category, subcategory, title, guidance, default_reward_credits, required_skills, requires_location)
select u.id, seed.category, seed.subcategory, seed.title, seed.guidance, seed.reward, seed.skills, seed.requires_location
from public.universities u
cross join (
  values
    ('Academic', 'Tutoring', 'Calculus study session', 'Guide a fellow student through assigned Calculus material and practice problems.', 60, array['Calculus', 'Tutoring'], false),
    ('Academic', 'Writing', 'Resume or cover-letter review', 'Provide feedback on a career document and explain suggested improvements.', 25, array['Writing', 'Career'], false),
    ('Career', 'Interview prep', 'Practice interview session', 'Run a structured practice interview and share actionable feedback.', 45, array['Interviewing', 'Career'], false),
    ('Creative', 'Photography', 'Student event photography', 'Photograph an approved UCLA student-organization event.', 45, array['Photography'], true),
    ('Errands', 'Campus help', 'On-campus item pickup', 'Pick up a permitted item at an agreed UCLA campus location.', 30, array['Campus navigation'], true),
    ('Tech', 'Tech support', 'Basic device setup help', 'Help with permitted software settings or device setup; do not handle private credentials.', 35, array['Technology support'], true)
) as seed(category, subcategory, title, guidance, reward, skills, requires_location)
where u.slug = 'ucla'
on conflict (university_id, title) do update
set guidance = excluded.guidance,
    default_reward_credits = excluded.default_reward_credits,
    required_skills = excluded.required_skills,
    requires_location = excluded.requires_location,
    is_active = true;
