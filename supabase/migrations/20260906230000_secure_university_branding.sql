-- Branding is safe to read before sign-in so the correct campus theme can render.
-- Other marketplace data remains protected by university-scoped RLS policies.
alter table public.universities enable row level security;

create policy "read active university branding"
on public.universities
for select
to anon, authenticated
using (is_active = true);
