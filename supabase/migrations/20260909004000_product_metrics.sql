begin;
create table public.product_events (
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles,
 event text not null check(event in ('browse','detail','post_step_1','post_step_2','post_step_3','empty_search','inbox')),
 created_at timestamptz not null default now()
);
alter table public.product_events enable row level security;
create index product_events_funnel on public.product_events(event,created_at);
-- No search terms, messages, names, precise locations, or persistent device IDs.
create function public.record_product_event(p_event text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then return; end if;
 if (select count(*) from product_events where profile_id=auth.uid() and created_at>now()-interval '1 minute')>=20 then return; end if;
 insert into product_events(profile_id,event) values(auth.uid(),p_event);
end $$;
revoke all on function public.record_product_event(text) from public,anon;
grant execute on function public.record_product_event(text) to authenticated;
commit;
