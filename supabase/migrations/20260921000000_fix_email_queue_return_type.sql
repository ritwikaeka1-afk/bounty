-- Repairs the return type used by the live email notification queue.
-- This is additive: it can be applied after the original notification migration.
begin;

create or replace function public.claim_email_deliveries()
returns table(notification_id uuid,profile_id uuid,bounty_id uuid,kind text,email text)
language plpgsql security definer set search_path=public as $$
begin
  -- Collapse unsent chat bursts into their latest notice; no private body is mailed.
  update email_deliveries d set skipped_at=now(),last_error='Superseded by a newer message'
  from notifications n
  where n.id=d.notification_id and n.kind in ('message','application_message')
    and d.attempts=0 and d.skipped_at is null and d.accepted_at is null
    and exists(select 1 from notifications newer join email_deliveries nd on nd.notification_id=newer.id
      where newer.profile_id=n.profile_id and newer.bounty_id=n.bounty_id and newer.kind=n.kind
        and (newer.created_at,newer.id)>(n.created_at,n.id) and nd.skipped_at is null);
  return query with candidates as (
    select d.notification_id from email_deliveries d join notifications n on n.id=d.notification_id
    left join notification_preferences p on p.profile_id=n.profile_id
    where d.accepted_at is null and d.skipped_at is null and d.attempts<4
      and d.next_attempt_at<=now() and d.created_at>now()-interval '20 hours'
      and email_delivery_allowed(n.id)
      and (n.kind not in ('message','application_message') or not exists (
        select 1 from email_deliveries recent join notifications rn on rn.id=recent.notification_id
        where rn.profile_id=n.profile_id and rn.bounty_id=n.bounty_id
          and rn.kind in ('message','application_message') and recent.accepted_at>now()-interval '15 minutes'
      ))
      and (coalesce(p.quiet_start,22)=coalesce(p.quiet_end,8)
        or (coalesce(p.quiet_start,22)<coalesce(p.quiet_end,8)
          and extract(hour from now() at time zone (case when p.timezone in (select name from pg_timezone_names) then p.timezone else 'America/Los_Angeles' end)) not between p.quiet_start and p.quiet_end-1)
        or (coalesce(p.quiet_start,22)>coalesce(p.quiet_end,8)
          and extract(hour from now() at time zone (case when p.timezone in (select name from pg_timezone_names) then p.timezone else 'America/Los_Angeles' end))>=coalesce(p.quiet_end,8)
          and extract(hour from now() at time zone (case when p.timezone in (select name from pg_timezone_names) then p.timezone else 'America/Los_Angeles' end))<coalesce(p.quiet_start,22)))
    order by d.created_at limit 10 for update of d skip locked
  ), claimed as (
    update email_deliveries d set attempts=d.attempts+1,next_attempt_at=now()+interval '10 minutes'
    from candidates c where d.notification_id=c.notification_id returning d.notification_id
  ) select n.id,n.profile_id,n.bounty_id,n.kind,u.email::text from claimed c
    join notifications n on n.id=c.notification_id join auth.users u on u.id=n.profile_id;
end $$;

revoke all on function public.claim_email_deliveries() from public, anon, authenticated;
grant execute on function public.claim_email_deliveries() to service_role;

commit;

