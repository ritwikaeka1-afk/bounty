-- Per-university branding used for themed campus pages.
alter table public.universities
  add column if not exists slug text,
  add column if not exists primary_color text,
  add column if not exists accent_color text,
  add column if not exists logo_url text;

create unique index if not exists universities_slug_unique
  on public.universities (slug);

-- UCLA is the initial supported university. The upsert makes this safe to run
-- whether the university row already exists or not.
insert into public.universities (
  name,
  email_domain,
  is_active,
  slug,
  primary_color,
  accent_color
)
values (
  'University of California, Los Angeles',
  'ucla.edu',
  true,
  'ucla',
  '#2774AE',
  '#FFD100'
)
on conflict (email_domain) do update
set
  name = excluded.name,
  is_active = true,
  slug = excluded.slug,
  primary_color = excluded.primary_color,
  accent_color = excluded.accent_color;
