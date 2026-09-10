-- Additive upgrade. Run before deploying the new application.
begin;
create table public.profile_names (
  profile_id uuid primary key references public.profiles,
  first_name text not null default '' check (char_length(first_name) <= 80),
  last_name text not null default '' check (char_length(last_name) <= 80)
);
alter table public.profile_names enable row level security;
create policy "own private name" on public.profile_names for select to authenticated using (profile_id = auth.uid());
-- Legacy display names are preserved verbatim, never automatically split.
create function public.save_my_names(p_first text, p_last text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists(select 1 from profiles where id=auth.uid()) then raise exception 'Profile required'; end if;
  if p_first is null or char_length(btrim(p_first)) not between 1 and 80 or char_length(coalesce(p_last,'')) > 80 then raise exception 'Enter your first name (up to 80 characters)'; end if;
  insert into profile_names values(auth.uid(), btrim(p_first), btrim(coalesce(p_last,'')))
  on conflict(profile_id) do update set first_name=excluded.first_name,last_name=excluded.last_name;
end $$;
-- Capture optional signup names without exposing them through public profiles.
create function public.capture_signup_names() returns trigger language plpgsql security definer set search_path=public as $$
declare metadata jsonb;
begin
  select raw_user_meta_data into metadata from auth.users where id=new.id;
  insert into profile_names values(new.id,left(coalesce(metadata->>'first_name',''),80),left(coalesce(metadata->>'last_name',''),80));
  return new;
end $$;
create trigger profile_signup_names after insert on public.profiles for each row execute function public.capture_signup_names();

alter table public.bounties
  add column completion_criteria text not null default '' check(char_length(completion_criteria)<=1000),
  add column estimated_minutes integer check(estimated_minutes between 5 and 1440),
  add column location_type text not null default 'remote' check(location_type in ('remote','campus')),
  add column revision integer not null default 1,
  add column updated_at timestamptz not null default now(),
  add column reminders_snoozed_until timestamptz,
  add column reminders_dismissed boolean not null default false;
update public.bounties set location_type='campus' where location_name is not null or location_address is not null;
alter table public.bounty_proposals add column bounty_revision integer not null default 1;
-- Table-level SELECT previously exposed meeting addresses to every verified student.
revoke select on public.bounties from anon, authenticated;
grant select(id,creator_id,university_id,title,description,category,reward_credits,status,accepted_by,due_at,created_at,completed_at,template_id,location_name,completion_criteria,estimated_minutes,location_type,revision,updated_at,reminders_snoozed_until,reminders_dismissed) on public.bounties to authenticated;
create function public.get_meeting_details(p_bounty uuid) returns text language sql security definer set search_path=public as $$
 select location_address from bounties where id=p_bounty and auth.uid() in (creator_id,accepted_by);
$$;

create table public.notification_preferences (
 profile_id uuid primary key references public.profiles,
 reminders_enabled boolean not null default true,
 push_enabled boolean not null default false,
 timezone text not null default 'America/Los_Angeles',
 quiet_start integer not null default 22 check(quiet_start between 0 and 23),
 quiet_end integer not null default 8 check(quiet_end between 0 and 23)
);
alter table public.notification_preferences enable row level security;
create policy "own preferences" on public.notification_preferences for all to authenticated using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create table public.notifications (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles,
 bounty_id uuid references public.bounties, kind text not null, message text not null,
 dedupe_key text not null unique, created_at timestamptz not null default now(), read_at timestamptz
);
alter table public.notifications enable row level security;
create policy "own notifications" on public.notifications for select to authenticated using(profile_id=auth.uid());
create policy "read own notifications" on public.notifications for update to authenticated using(profile_id=auth.uid()) with check(profile_id=auth.uid());
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;
create index notifications_inbox on public.notifications(profile_id,created_at desc);
create table public.saved_bounties (
 profile_id uuid not null references public.profiles, bounty_id uuid not null references public.bounties,
 primary key(profile_id,bounty_id)
);
alter table public.saved_bounties enable row level security;
create policy "own saved bounties" on public.saved_bounties for all to authenticated using(profile_id=auth.uid())
with check(profile_id=auth.uid() and exists(select 1 from bounties where id=bounty_id));
create table public.bounty_messages (
 id uuid primary key default gen_random_uuid(), bounty_id uuid not null references public.bounties,
 sender_id uuid not null references public.profiles, body text not null check(char_length(btrim(body)) between 1 and 2000), created_at timestamptz not null default now()
);
alter table public.bounty_messages enable row level security;
create policy "participant messages" on public.bounty_messages for select to authenticated using(exists(select 1 from bounties b where b.id=bounty_id and auth.uid() in (b.creator_id,b.accepted_by)));
create policy "send participant messages" on public.bounty_messages for insert to authenticated with check(sender_id=auth.uid() and exists(select 1 from bounties b where b.id=bounty_id and auth.uid() in (b.creator_id,b.accepted_by) and b.status in ('accepted','submitted','disputed')));
create table public.bounty_reviews (
 bounty_id uuid not null references public.bounties, reviewer_id uuid not null references public.profiles,
 rating integer not null check(rating between 1 and 5), body text not null check(char_length(body) between 1 and 1000),
 created_at timestamptz not null default now(), primary key(bounty_id,reviewer_id)
);
alter table public.bounty_reviews enable row level security;
create policy "campus task reviews" on public.bounty_reviews for select to authenticated using(exists(select 1 from profiles p join bounties b on b.university_id=p.university_id where p.id=auth.uid() and p.verification_status='verified' and b.id=bounty_id));
create policy "completed participant review" on public.bounty_reviews for insert to authenticated with check(reviewer_id=auth.uid() and exists(select 1 from bounties b where b.id=bounty_id and b.status='completed' and auth.uid() in (b.creator_id,b.accepted_by)));
create table public.profile_blocks (blocker_id uuid references public.profiles, blocked_id uuid references public.profiles, primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id));
alter table public.profile_blocks enable row level security;
create policy "own blocks" on public.profile_blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create table public.support_requests (
 id uuid primary key default gen_random_uuid(), profile_id uuid not null references public.profiles,
 bounty_id uuid references public.bounties, subject text not null check(char_length(subject) between 3 and 120),
 message text not null check(char_length(message) between 10 and 3000), created_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
create policy "own support requests" on public.support_requests for select to authenticated using(profile_id=auth.uid());
create function public.send_support_request(p_subject text,p_message text,p_bounty uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to contact support'; end if;
 if (select count(*) from support_requests where profile_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Please wait before sending another request'; end if;
 insert into support_requests(profile_id,bounty_id,subject,message) values(auth.uid(),p_bounty,btrim(p_subject),btrim(p_message)) returning id into result;
 return result;
end $$;

create function public.create_bounty_v2(p_template uuid,p_title text,p_description text,p_reward integer,p_criteria text,p_minutes integer,p_location_type text,p_location text,p_private_location text,p_due timestamptz,p_request uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare p profiles; t bounty_templates; result uuid; existing bounty_events;
begin
 p:=require_verified_student();
 perform pg_advisory_xact_lock(hashtextextended(p.id::text||p_request::text,0));
 select * into existing from bounty_events where actor_id=p.id and event_type='created' and metadata->>'request'=p_request::text;
 if found then return existing.bounty_id; end if;
 select * into t from bounty_templates where id=p_template and university_id=p.university_id and is_active;
 if not found then raise exception 'Choose an approved task template'; end if;
 if p_request is null or p_reward is null or p_reward not between 1 and 100000 then raise exception 'Reward must be 1 to 100000 whole credits'; end if;
 if p_reward>coalesce((select available_balance from credit_accounts where profile_id=p.id),0) then raise exception 'Not enough available credits for this reward'; end if;
 if p_due is not null and p_due<=now() then raise exception 'Choose a future deadline'; end if;
 if t.requires_location and p_location_type<>'campus' then raise exception 'This template requires an on-campus location'; end if;
 if p_location_type='campus' and coalesce(btrim(p_location),'')='' then raise exception 'Add a broad campus location'; end if;
 if coalesce(btrim(p_criteria),'')='' then raise exception 'Describe what completion looks like'; end if;
 insert into bounties(creator_id,university_id,template_id,title,description,category,reward_credits,completion_criteria,estimated_minutes,location_type,location_name,location_address,due_at)
 values(p.id,p.university_id,t.id,btrim(p_title),btrim(p_description),t.category,p_reward,btrim(p_criteria),p_minutes,p_location_type,nullif(btrim(p_location),''),nullif(btrim(p_private_location),''),p_due) returning id into result;
 insert into bounty_events(bounty_id,actor_id,event_type,metadata) values(result,p.id,'created',jsonb_build_object('request',p_request));
 return result;
end $$;
-- Close the older fixed-reward creation path to bypasses.
revoke execute on function public.create_templated_bounty(uuid,text,text,text,timestamptz) from authenticated;

create function public.edit_bounty(p_bounty uuid,p_revision integer,p_title text,p_description text,p_reward integer,p_criteria text,p_minutes integer,p_due timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare p profiles; b bounties;
begin
 p:=require_verified_student(); select * into b from bounties where id=p_bounty for update;
 if not found or b.creator_id<>p.id or b.status<>'open' then raise exception 'Only your open, unassigned bounties can be edited'; end if;
 if b.revision<>p_revision then raise exception 'This bounty changed. Refresh before editing'; end if;
 if p_reward is null or p_reward not between 1 and 100000 then raise exception 'Reward must be 1 to 100000 whole credits'; end if;
 if p_reward>coalesce((select available_balance from credit_accounts where profile_id=p.id),0) then raise exception 'Not enough available credits'; end if;
 if p_due is not null and p_due<=now() then raise exception 'Choose a future deadline'; end if;
 if coalesce(btrim(p_criteria),'')='' then raise exception 'Describe completion criteria'; end if;
 update bounties set title=btrim(p_title),description=btrim(p_description),reward_credits=p_reward,completion_criteria=btrim(p_criteria),estimated_minutes=p_minutes,due_at=p_due,revision=revision+1,updated_at=now() where id=b.id;
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key)
 select bidder_id,b.id,'edited','The task changed. Review its details and renew your offer.', 'edit:'||b.id||':'||(b.revision+1)||':'||bidder_id from bounty_proposals where bounty_id=b.id and status='pending' on conflict do nothing;
 insert into bounty_events(bounty_id,actor_id,event_type,metadata) values(b.id,p.id,'edited',jsonb_build_object('old_reward',b.reward_credits,'new_reward',p_reward,'revision',b.revision+1));
end $$;
create or replace function public.submit_proposal(p_bounty_id uuid,p_message text) returns uuid language plpgsql security definer set search_path=public as $$
declare p profiles; b bounties; result uuid;
begin
 p:=require_verified_student(); select * into b from bounties where id=p_bounty_id for update;
 if not found or b.status<>'open' or b.creator_id=p.id or b.university_id<>p.university_id or b.due_at<=now() then raise exception 'This bounty is unavailable'; end if;
 if exists(select 1 from profile_blocks where (blocker_id=p.id and blocked_id=b.creator_id) or (blocker_id=b.creator_id and blocked_id=p.id)) then raise exception 'This offer is unavailable'; end if;
 insert into bounty_proposals(bounty_id,bidder_id,message,bounty_revision) values(b.id,p.id,p_message,b.revision)
 on conflict(bounty_id,bidder_id) do update set message=excluded.message,bounty_revision=excluded.bounty_revision,status='pending' returning id into result;
 insert into bounty_events(bounty_id,actor_id,event_type,metadata) values(b.id,p.id,'proposal_submitted',jsonb_build_object('proposal',result));
 return result;
end $$;
create or replace function public.accept_proposal(p_proposal_id uuid,p_idempotency_key uuid) returns void language plpgsql security definer set search_path=public as $$
declare p profiles; b bounties; offer bounty_proposals; sender uuid; escrow uuid; txn uuid;
begin
 p:=require_verified_student();
 -- All transitions lock the bounty before offers/accounts to avoid cross-offer deadlocks.
 select * into b from bounties where id=(select bounty_id from bounty_proposals where id=p_proposal_id) for update;
 if not found or b.creator_id<>p.id then raise exception 'Only the poster can accept offers'; end if;
 select * into offer from bounty_proposals where id=p_proposal_id for update;
 if exists(select 1 from ledger_transactions where idempotency_key=p_idempotency_key and created_by=p.id and bounty_id=b.id and type='bounty_hold') and b.accepted_by=offer.bidder_id then return; end if;
 if exists(select 1 from ledger_transactions where idempotency_key=p_idempotency_key) then raise exception 'Request key already used'; end if;
 if b.status<>'open' or b.due_at<=now() or offer.status<>'pending' then raise exception 'Offer is unavailable'; end if;
 if offer.bounty_revision<>b.revision then raise exception 'Ask the helper to renew their offer after your edit'; end if;
 if not exists(select 1 from profiles where id=offer.bidder_id and verification_status='verified' and university_id=p.university_id) then raise exception 'Helper is no longer eligible'; end if;
 if exists(select 1 from profile_blocks where (blocker_id=p.id and blocked_id=offer.bidder_id) or (blocker_id=offer.bidder_id and blocked_id=p.id)) then raise exception 'Offer is unavailable'; end if;
 select id into sender from credit_accounts where profile_id=p.id for update;
 if sender is null or (select available_balance from credit_accounts where id=sender)<b.reward_credits then raise exception 'Not enough available credits'; end if;
 insert into credit_accounts(university_id,account_type) values(b.university_id,'escrow') on conflict do nothing;
 select id into escrow from credit_accounts where university_id=b.university_id and account_type='escrow' for update;
 update credit_accounts set available_balance=available_balance-b.reward_credits,updated_at=now() where id=sender;
 update credit_accounts set available_balance=available_balance+b.reward_credits,updated_at=now() where id=escrow;
 insert into ledger_transactions(type,bounty_id,created_by,idempotency_key) values('bounty_hold',b.id,p.id,p_idempotency_key) returning id into txn;
 insert into ledger_entries(transaction_id,account_id,amount) values(txn,sender,-b.reward_credits),(txn,escrow,b.reward_credits);
 update bounty_proposals set status=case when id=offer.id then 'accepted'::proposal_status else 'declined'::proposal_status end where bounty_id=b.id and status='pending';
 update bounties set status='accepted',accepted_by=offer.bidder_id,updated_at=now() where id=b.id;
 insert into bounty_events(bounty_id,actor_id,event_type) values(b.id,p.id,'proposal_accepted');
end $$;
create function public.manage_bounty(p_bounty uuid,p_action text) returns void language plpgsql security definer set search_path=public as $$
declare b bounties; p profiles;
begin
 p:=require_verified_student(); select * into b from bounties where id=p_bounty for update;
 if not found or p.id not in (b.creator_id,coalesce(b.accepted_by,b.creator_id)) then raise exception 'Task participant required'; end if;
 if p_action='cancel' and b.creator_id=p.id and b.status='open' then
   update bounties set status='cancelled',updated_at=now() where id=b.id;
   update bounty_proposals set status='declined' where bounty_id=b.id and status='pending';
 elsif p_action='request_changes' and b.creator_id=p.id and b.status='submitted' then update bounties set status='accepted',updated_at=now() where id=b.id;
 elsif p_action='dispute' and b.status in ('accepted','submitted') then update bounties set status='disputed',updated_at=now() where id=b.id;
 elsif p_action='snooze' and b.creator_id=p.id and b.status='open' then update bounties set reminders_snoozed_until=now()+interval '3 days' where id=b.id;
 elsif p_action='dismiss' and b.creator_id=p.id and b.status='open' then update bounties set reminders_dismissed=true where id=b.id;
 else raise exception 'This action is unavailable for the current task status'; end if;
 insert into bounty_events(bounty_id,actor_id,event_type) values(b.id,p.id,p_action);
end $$;

create function public.notify_bounty_event() returns trigger language plpgsql security definer set search_path=public as $$
declare b bounties; recipient uuid; copy text;
begin
 select * into b from bounties where id=new.bounty_id;
 recipient:=case when new.actor_id=b.creator_id then b.accepted_by else b.creator_id end;
 copy:=case new.event_type when 'proposal_submitted' then 'A student offered to help. Review their offer.' when 'proposal_accepted' then 'Your offer was accepted. Confirm the details with the poster.' when 'submitted' then 'Your helper submitted the task for review.' when 'completed' then 'Task completed. The agreed credits have been transferred.' when 'request_changes' then 'The poster requested changes. Check the task conversation.' when 'dispute' then 'This task is disputed. Credits remain reserved while it is reviewed.' else null end;
 if recipient is not null and copy is not null then
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(recipient,b.id,new.event_type,copy,'event:'||new.id) on conflict do nothing; end if;
 return new;
end $$;
create trigger bounty_event_notification after insert on public.bounty_events for each row execute function public.notify_bounty_event();
create function public.notify_message() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
 select case when creator_id=new.sender_id then accepted_by else creator_id end into recipient from bounties where id=new.bounty_id;
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(recipient,new.bounty_id,'message','You have a new task message.','message:'||new.id);
 return new;
end $$;
create trigger task_message_notification after insert on public.bounty_messages for each row execute function public.notify_message();

create table public.reminder_settings(id boolean primary key default true check(id), first_hours integer not null default 24 check(first_hours>0), second_hours integer not null default 72 check(second_hours>first_hours), last_hours integer not null default 168 check(last_hours>second_hours));
insert into public.reminder_settings(id) values(true);
alter table public.reminder_settings enable row level security;
create function public.generate_bounty_reminders() returns integer language plpgsql security definer set search_path=public as $$
declare b bounties; stage integer; added integer:=0; settings reminder_settings; prefs notification_preferences; local_hour integer; copy text;
begin
 perform pg_advisory_xact_lock(9082026);
 select * into settings from reminder_settings where id;
 update bounties set status='expired',updated_at=now() where status='open' and due_at<=now();
 for b in select * from bounties where status='open' and not reminders_dismissed and (reminders_snoozed_until is null or reminders_snoozed_until<=now()) and updated_at<=now()-make_interval(hours=>settings.first_hours) loop
   select * into prefs from notification_preferences where profile_id=b.creator_id;
   if not found then prefs.reminders_enabled:=true;prefs.timezone:='America/Los_Angeles';prefs.quiet_start:=22;prefs.quiet_end:=8;end if;
   if true then
     if not prefs.reminders_enabled then continue; end if;
     if not exists(select 1 from pg_timezone_names where name=prefs.timezone) then continue; end if;
     local_hour:=extract(hour from now() at time zone prefs.timezone);
     if (prefs.quiet_start<prefs.quiet_end and local_hour>=prefs.quiet_start and local_hour<prefs.quiet_end) or (prefs.quiet_start>prefs.quiet_end and (local_hour>=prefs.quiet_start or local_hour<prefs.quiet_end)) then continue; end if;
   end if;
   if exists(select 1 from notifications where profile_id=b.creator_id and kind='reminder' and created_at>now()-interval '24 hours') then continue; end if;
   stage:=case when b.updated_at<=now()-make_interval(hours=>settings.last_hours) then 3 when b.updated_at<=now()-make_interval(hours=>settings.second_hours) then 2 else 1 end;
   copy:=case when exists(select 1 from bounty_proposals where bounty_id=b.id and status='pending' and bounty_revision=b.revision) then 'You have offers waiting. Review them when you have a moment.' when stage=3 then 'Still need a hand? Update this bounty, snooze reminders, or close it.' when stage=2 then 'No assignment yet. Review your task details, timing, or credit reward.' else 'Still looking for help? Check that your task and timing are clear.' end;
   insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(b.creator_id,b.id,'reminder',copy,'reminder:'||b.id||':'||b.revision||':'||stage) on conflict do nothing;
   if found then added:=added+1; end if;
 end loop;
 return added;
end $$;
-- Push is opt-in. Endpoint constraints also apply to direct database writes.
create table public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles,
 endpoint text not null unique check(endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/'),
 p256dh text not null check(char_length(p256dh)<=300),auth text not null check(char_length(auth)<=100),created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated using(profile_id=auth.uid()) with check(profile_id=auth.uid());
create table public.push_deliveries (
 notification_id uuid references public.notifications on delete cascade, subscription_id uuid references public.push_subscriptions on delete cascade,
 attempts integer not null default 0,next_attempt_at timestamptz not null default now(), delivered_at timestamptz, last_error text,
 primary key(notification_id,subscription_id)
);
alter table public.push_deliveries enable row level security;
create function public.claim_push_deliveries() returns table(notification_id uuid,subscription_id uuid,endpoint text,p256dh text,auth text,bounty_id uuid,kind text) language plpgsql security definer set search_path=public as $$
begin
 insert into push_deliveries(notification_id,subscription_id)
 select n.id,s.id from notifications n join notification_preferences p on p.profile_id=n.profile_id and p.push_enabled join push_subscriptions s on s.profile_id=n.profile_id
 where n.created_at>now()-interval '1 day' and s.created_at<=n.created_at and n.read_at is null on conflict do nothing;
 return query
 with candidates as (
 select d.notification_id,d.subscription_id from push_deliveries d join notifications n on n.id=d.notification_id join push_subscriptions s on s.id=d.subscription_id join notification_preferences p on p.profile_id=n.profile_id
 where d.delivered_at is null and d.attempts<4 and d.next_attempt_at<=now() and n.created_at>now()-interval '1 day' and n.read_at is null and p.push_enabled
 and p.timezone in (select name from pg_timezone_names)
 and (p.quiet_start=p.quiet_end or (p.quiet_start<p.quiet_end and extract(hour from now() at time zone p.timezone) not between p.quiet_start and p.quiet_end-1) or (p.quiet_start>p.quiet_end and extract(hour from now() at time zone p.timezone)>=p.quiet_end and extract(hour from now() at time zone p.timezone)<p.quiet_start))
 and (n.kind<>'reminder' or (p.reminders_enabled and exists(select 1 from bounties b where b.id=n.bounty_id and b.status='open' and not b.reminders_dismissed and (b.due_at is null or b.due_at>now()) and (b.reminders_snoozed_until is null or b.reminders_snoozed_until<=now()))))
 order by n.created_at limit 20 for update of d skip locked
 ), claimed as (update push_deliveries d set attempts=d.attempts+1,next_attempt_at=now()+interval '10 minutes' from candidates c where d.notification_id=c.notification_id and d.subscription_id=c.subscription_id returning d.notification_id,d.subscription_id)
 select n.id,s.id,s.endpoint,s.p256dh,s.auth,n.bounty_id,n.kind from claimed c join notifications n on n.id=c.notification_id join push_subscriptions s on s.id=c.subscription_id;
end $$;

-- Explicit permissions for every new RPC; no anonymous mutations or worker access.
revoke all on function public.capture_signup_names(),public.notify_bounty_event(),public.notify_message() from public,anon,authenticated;
revoke all on function public.generate_bounty_reminders(),public.claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.generate_bounty_reminders(),public.claim_push_deliveries() to service_role;
revoke all on function public.save_my_names(text,text),public.get_meeting_details(uuid),public.create_bounty_v2(uuid,text,text,integer,text,integer,text,text,text,timestamptz,uuid),public.edit_bounty(uuid,integer,text,text,integer,text,integer,timestamptz),public.manage_bounty(uuid,text),public.send_support_request(text,text,uuid) from public,anon;
grant execute on function public.save_my_names(text,text),public.get_meeting_details(uuid),public.create_bounty_v2(uuid,text,text,integer,text,integer,text,text,text,timestamptz,uuid),public.edit_bounty(uuid,integer,text,text,integer,text,integer,timestamptz),public.manage_bounty(uuid,text),public.send_support_request(text,text,uuid) to authenticated;
commit;
