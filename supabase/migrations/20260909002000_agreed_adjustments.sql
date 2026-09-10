begin;
create table public.bounty_changes (
 id uuid primary key default gen_random_uuid(), bounty_id uuid not null references public.bounties,
 description text not null check(char_length(description) between 20 and 3000),
 criteria text not null check(char_length(criteria) between 1 and 1000),
 reward integer not null check(reward between 1 and 100000), revision integer not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined','superseded')),created_at timestamptz not null default now()
);
alter table public.bounty_changes enable row level security;
create policy "participant changes" on public.bounty_changes for select to authenticated using(exists(select 1 from bounties b where b.id=bounty_id and auth.uid() in (b.creator_id,b.accepted_by)));
create function public.propose_bounty_change(p_bounty uuid,p_description text,p_criteria text,p_reward integer) returns void language plpgsql security definer set search_path=public as $$
declare b bounties;p profiles;change_id uuid;
begin
 p:=require_verified_student();select * into b from bounties where id=p_bounty for update;
 if not found or b.creator_id<>p.id or b.status<>'accepted' then raise exception 'Only the poster can propose changes to assigned work'; end if;
 if p_reward is null or p_reward<b.reward_credits then raise exception 'The agreed reward cannot be reduced'; end if;
 if p_reward-b.reward_credits>coalesce((select available_balance from credit_accounts where profile_id=p.id),0) then raise exception 'Not enough available credits'; end if;
 update bounty_changes set status='superseded' where bounty_id=b.id and status='pending';
 insert into bounty_changes(bounty_id,description,criteria,reward,revision) values(b.id,p_description,p_criteria,p_reward,b.revision) returning id into change_id;
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(b.accepted_by,b.id,'change_proposed','The poster proposed a change. The current agreement remains until you accept.','change:'||change_id);
end $$;
create function public.respond_bounty_change(p_change uuid,p_accept boolean,p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare b bounties;c bounty_changes;p profiles;delta integer;sender uuid;escrow uuid;txn uuid;
begin
 p:=require_verified_student();select * into b from bounties where id=(select bounty_id from bounty_changes where id=p_change) for update;
 if not found or b.accepted_by<>p.id then raise exception 'Only the assigned helper can respond'; end if;
 select * into c from bounty_changes where id=p_change for update;
 if c.status='accepted' and exists(select 1 from bounty_events where bounty_id=b.id and actor_id=p.id and event_type='change_accepted' and metadata->>'request'=p_request::text) then return; end if;
 if b.status<>'accepted' or c.status<>'pending' or c.revision<>b.revision then raise exception 'This proposed change is no longer current'; end if;
 if p_accept is null or p_request is null then raise exception 'A response and request key are required'; end if;
 if not p_accept then update bounty_changes set status='declined' where id=c.id;
 else
  delta:=c.reward-b.reward_credits;
  if delta<0 then raise exception 'Reward cannot be reduced'; end if;
  if delta>0 then
   select id into sender from credit_accounts where profile_id=b.creator_id for update;
   if sender is null or (select available_balance from credit_accounts where id=sender)<delta then raise exception 'The poster needs more credits to fund this change'; end if;
   select id into escrow from credit_accounts where university_id=b.university_id and account_type='escrow' for update;
   if escrow is null then raise exception 'Reservation account missing'; end if;
   insert into ledger_transactions(type,bounty_id,created_by,idempotency_key) values('bounty_hold',b.id,p.id,p_request) returning id into txn;
   update credit_accounts set available_balance=available_balance-delta,updated_at=now() where id=sender;
   update credit_accounts set available_balance=available_balance+delta,updated_at=now() where id=escrow;
   insert into ledger_entries(transaction_id,account_id,amount) values(txn,sender,-delta),(txn,escrow,delta);
  end if;
  update bounties set description=c.description,completion_criteria=c.criteria,reward_credits=c.reward,revision=revision+1,updated_at=now() where id=b.id;
  update bounty_changes set status='accepted' where id=c.id;
  insert into bounty_events(bounty_id,actor_id,event_type,metadata) values(b.id,p.id,'change_accepted',jsonb_build_object('request',p_request,'change',c.id));
 end if;
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(b.creator_id,b.id,'change_response',case when p_accept then 'Your proposed task change was accepted.' else 'Your proposed task change was declined. The original agreement remains.' end,'change-response:'||c.id);
end $$;
create function public.bonus_bounty(p_bounty uuid,p_amount integer,p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare b bounties;p profiles;sender uuid;recipient uuid;txn uuid;
begin
 p:=require_verified_student();select * into b from bounties where id=p_bounty for update;
 if not found or b.creator_id<>p.id or b.status<>'completed' then raise exception 'Bonuses are available for your completed bounties'; end if;
 if exists(select 1 from bounty_events where bounty_id=b.id and actor_id=p.id and event_type='bonus' and metadata->>'request'=p_request::text) then return; end if;
 if p_amount is null or p_amount not between 1 and 100000 or p_request is null then raise exception 'Enter 1 to 100000 whole credits'; end if;
 perform id from credit_accounts where profile_id in (b.creator_id,b.accepted_by) order by id for update;
 select id into sender from credit_accounts where profile_id=b.creator_id;
 select id into recipient from credit_accounts where profile_id=b.accepted_by;
 if sender is null or recipient is null or (select available_balance from credit_accounts where id=sender)<p_amount then raise exception 'Not enough available credits'; end if;
 insert into ledger_transactions(type,bounty_id,created_by,idempotency_key) values('bounty_release',b.id,p.id,p_request) returning id into txn;
 update credit_accounts set available_balance=available_balance-p_amount,updated_at=now() where id=sender;
 update credit_accounts set available_balance=available_balance+p_amount,updated_at=now() where id=recipient;
 insert into ledger_entries(transaction_id,account_id,amount) values(txn,sender,-p_amount),(txn,recipient,p_amount);
 insert into bounty_events(bounty_id,actor_id,event_type,metadata) values(b.id,p.id,'bonus',jsonb_build_object('request',p_request,'amount',p_amount));
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(b.accepted_by,b.id,'bonus','The poster sent an additional credit bonus.','bonus:'||p_request);
end $$;
-- Explicit operator resolution after review. Never automatically resolve disputes.
create function public.resolve_bounty_dispute(p_bounty uuid,p_release boolean,p_reason text,p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare b bounties;recipient uuid;escrow uuid;txn uuid;
begin
 select * into b from bounties where id=p_bounty for update;
 if exists(select 1 from bounty_events where bounty_id=p_bounty and event_type='resolved' and metadata->>'request'=p_request::text) then return; end if;
 if b.id is null or b.status<>'disputed' or p_release is null or coalesce(char_length(btrim(p_reason)),0)<10 then raise exception 'A disputed task and review reason are required'; end if;
 select id into recipient from credit_accounts where profile_id=case when p_release then b.accepted_by else b.creator_id end for update;
 select id into escrow from credit_accounts where university_id=b.university_id and account_type='escrow' for update;
 if recipient is null or escrow is null then raise exception 'Credit account missing'; end if;
 insert into ledger_transactions(type,bounty_id,idempotency_key) values(case when p_release then 'bounty_release'::ledger_transaction_type else 'bounty_refund'::ledger_transaction_type end,b.id,p_request) returning id into txn;
 update credit_accounts set available_balance=available_balance-b.reward_credits where id=escrow;
 update credit_accounts set available_balance=available_balance+b.reward_credits where id=recipient;
 insert into ledger_entries(transaction_id,account_id,amount) values(txn,escrow,-b.reward_credits),(txn,recipient,b.reward_credits);
 update bounties set status=case when p_release then 'completed'::bounty_status else 'cancelled'::bounty_status end,completed_at=case when p_release then now() else null end,updated_at=now() where id=b.id;
 insert into bounty_events(bounty_id,event_type,metadata) values(b.id,'resolved',jsonb_build_object('request',p_request,'reason',p_reason,'released',p_release));
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) select person,b.id,'resolved',case when p_release then 'The dispute was resolved and the reward transferred to the helper.' else 'The dispute was resolved and reserved credits returned to the poster.' end,'resolved:'||p_request||':'||person from unnest(array[b.creator_id,b.accepted_by]) person;
end $$;
revoke all on function public.propose_bounty_change(uuid,text,text,integer),public.respond_bounty_change(uuid,boolean,uuid),public.bonus_bounty(uuid,integer,uuid) from public,anon;
grant execute on function public.propose_bounty_change(uuid,text,text,integer),public.respond_bounty_change(uuid,boolean,uuid),public.bonus_bounty(uuid,integer,uuid) to authenticated;
revoke all on function public.resolve_bounty_dispute(uuid,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.resolve_bounty_dispute(uuid,boolean,text,uuid) to service_role;
commit;
