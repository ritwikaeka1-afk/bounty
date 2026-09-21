begin;
alter table public.notification_preferences
  add column email_status_enabled boolean not null default true,
  add column email_messages_enabled boolean not null default true;

create table public.email_deliveries (
  notification_id uuid primary key references public.notifications on delete cascade,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts integer not null default 0,
  accepted_at timestamptz,
  provider_id text,
  skipped_at timestamptz,
  last_error text
);
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public,anon,authenticated;
grant select,update on public.email_deliveries to service_role;

create function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  -- Do not backfill old notices or add reminder emails to status subscriptions.
  if new.kind <> 'reminder' then
    insert into email_deliveries(notification_id,next_attempt_at)
      values(new.id,now()+case when new.kind in ('message','application_message') then interval '2 minutes' else interval '0 seconds' end)
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger queue_email after insert on public.notifications
  for each row execute function public.queue_notification_email();

create function public.email_delivery_allowed(p_notification uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from notifications n join profiles pr on pr.id=n.profile_id
    join auth.users u on u.id=pr.id
    left join notification_preferences p on p.profile_id=n.profile_id
    where n.id=p_notification and u.email_confirmed_at is not null
      and u.email is not null and pr.verification_status='verified'
      and n.read_at is null
      and case when n.kind in ('message','application_message')
        then coalesce(p.email_messages_enabled,true) else coalesce(p.email_status_enabled,true) end
      and not exists (
        select 1 from profile_blocks bl where n.profile_id in (bl.blocker_id,bl.blocked_id)
        and (case when bl.blocker_id=n.profile_id then bl.blocked_id else bl.blocker_id end) in (
          select m.sender_id from bounty_messages m where n.kind='message' and m.id::text=split_part(n.dedupe_key,':',2)
          union all
          select m.sender_id from application_messages m where n.kind='application_message' and m.id::text=split_part(n.dedupe_key,':',2)
        )
      )
  );
$$;

create function public.claim_email_deliveries()
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

-- Complete lifecycle notices missing from the original event notifier.
create function public.notify_closed_bounty() returns trigger
language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
  if new.status is distinct from old.status and new.status in ('cancelled','expired') then
    for recipient in select new.creator_id union select new.accepted_by where new.accepted_by is not null union select bidder_id from bounty_proposals where bounty_id=new.id and status='pending' loop
      insert into notifications(profile_id,bounty_id,kind,message,dedupe_key)
        values(recipient,new.id,new.status::text,'A bounty has closed. Open Bounty to review its status.',
          'closed:'||new.id||':'||new.status||':'||recipient) on conflict do nothing;
    end loop;
  end if;
  return new;
end $$;
create trigger closed_bounty_notice after update of status on public.bounties
  for each row execute function public.notify_closed_bounty();

create function public.notify_proposal_status() returns trigger
language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
  if new.status is distinct from old.status and new.status in ('declined','withdrawn') then
    select case when new.status='declined' then new.bidder_id else b.creator_id end
      into recipient from bounties b where b.id=new.bounty_id;
    insert into notifications(profile_id,bounty_id,kind,message,dedupe_key)
      values(recipient,new.bounty_id,new.status::text,'An application has been updated. Open Bounty to review it.',
        'proposal-status:'||new.id||':'||new.status||':'||txid_current()) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger proposal_status_notice after update of status on public.bounty_proposals
  for each row execute function public.notify_proposal_status();

revoke all on function public.queue_notification_email(),public.notify_closed_bounty(),public.notify_proposal_status(),
 public.email_delivery_allowed(uuid),public.claim_email_deliveries() from public,anon,authenticated;
grant execute on function public.email_delivery_allowed(uuid),public.claim_email_deliveries() to service_role;
commit;

