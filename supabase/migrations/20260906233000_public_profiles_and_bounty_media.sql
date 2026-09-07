alter table public.profiles
  add column if not exists major text check (char_length(major) <= 100),
  add column if not exists graduation_year integer check (graduation_year between 2024 and 2040),
  add column if not exists interests text[] not null default '{}';

alter table public.bounties
  add column if not exists needed_date date,
  add column if not exists needed_time time,
  add column if not exists short_summary text check (char_length(short_summary) <= 280);

create table public.bounty_images (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties on delete cascade,
  image_url text not null,
  created_at timestamptz not null default now(),
  unique (bounty_id, image_url)
);

alter table public.bounty_images enable row level security;
create policy "campus can view bounty images"
on public.bounty_images for select to authenticated
using (exists (select 1 from public.bounties b where b.id = bounty_id));
create policy "posters can add bounty images"
on public.bounty_images for insert to authenticated
with check (exists (select 1 from public.bounties b where b.id = bounty_id and b.creator_id = auth.uid()));

insert into storage.buckets (id, name, public)
values ('bounty-images', 'bounty-images', true)
on conflict (id) do update set public = true;
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = true;

create policy "public avatar and bounty image reads"
on storage.objects for select
using (bucket_id in ('profile-avatars', 'bounty-images'));
create policy "students upload own media"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('profile-avatars', 'bounty-images')
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
create policy "students update own media"
on storage.objects for update to authenticated
using ((storage.foldername(name))[1] = (select auth.uid()::text))
with check ((storage.foldername(name))[1] = (select auth.uid()::text));

create or replace function public.update_my_profile_details(
  p_display_name text,
  p_bio text,
  p_skills text[],
  p_experience public.experience_level,
  p_major text,
  p_graduation_year integer,
  p_interests text[],
  p_avatar_url text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign-in required'; end if;
  if char_length(btrim(p_display_name)) not between 2 and 60 then raise exception 'Display name must be 2 to 60 characters'; end if;
  if char_length(coalesce(p_bio, '')) > 500 then raise exception 'Bio must be 500 characters or fewer'; end if;
  if coalesce(array_length(p_skills, 1), 0) > 12 or coalesce(array_length(p_interests, 1), 0) > 12 then raise exception 'Choose at most 12 skills and interests'; end if;
  update public.profiles set
    display_name = btrim(p_display_name), bio = nullif(btrim(p_bio), ''),
    skills = coalesce(p_skills, '{}'), experience = p_experience,
    major = nullif(btrim(p_major), ''), graduation_year = p_graduation_year,
    interests = coalesce(p_interests, '{}'), avatar_url = nullif(btrim(p_avatar_url), '')
  where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end; $$;

revoke execute on function public.update_my_profile_details(text, text, text[], public.experience_level, text, integer, text[], text) from public, anon;
grant execute on function public.update_my_profile_details(text, text, text[], public.experience_level, text, integer, text[], text) to authenticated;
