begin;
-- Public identities are initials. Full names remain in owner-only tables/metadata.
create function public.profile_initials(p_name text) returns text language sql immutable set search_path=public as $$
 select coalesce(nullif(upper(left(parts[1],1)||case when cardinality(parts)>1 then left(parts[cardinality(parts)],1) else '' end),''),'S')
 from (select regexp_split_to_array(btrim(coalesce(p_name,'')), '\s+') parts) s;
$$;
drop function public.get_task_people(uuid);
create function public.get_task_people(p_bounty uuid) returns table(id uuid,display_name text,skills text[],bio text,experience public.experience_level,rating numeric,review_count bigint,completed_count bigint)
language plpgsql security definer set search_path=public as $$
declare p profiles;b bounties;
begin
 p:=require_verified_student();select * into b from bounties where bounties.id=p_bounty;
 if not found or b.university_id<>p.university_id or (b.status<>'open' and p.id not in (b.creator_id,coalesce(b.accepted_by,b.creator_id))) then return; end if;
 return query select pr.id,profile_initials(pr.display_name),pr.skills,pr.bio,pr.experience,
   (select round(avg(r.rating),1) from bounty_reviews r join bounties rb on rb.id=r.bounty_id where rb.status='completed' and case when r.reviewer_id=rb.creator_id then rb.accepted_by else rb.creator_id end=pr.id),
   (select count(*) from bounty_reviews r join bounties rb on rb.id=r.bounty_id where rb.status='completed' and case when r.reviewer_id=rb.creator_id then rb.accepted_by else rb.creator_id end=pr.id),
   (select count(*) from bounties cb where cb.status='completed' and pr.id in(cb.creator_id,cb.accepted_by))
 from profiles pr where pr.id in (b.creator_id,b.accepted_by) or (b.creator_id=p.id and pr.id in(select bidder_id from bounty_proposals where bounty_id=b.id));
end $$;
create function public.get_marketplace_reputation() returns table(id uuid,initials text,rating numeric,review_count bigint)
language sql security definer set search_path=public as $$
 select pr.id,profile_initials(pr.display_name),
 (select round(avg(r.rating),1) from bounty_reviews r join bounties b on b.id=r.bounty_id where b.status='completed' and case when r.reviewer_id=b.creator_id then b.accepted_by else b.creator_id end=pr.id),
 (select count(*) from bounty_reviews r join bounties b on b.id=r.bounty_id where b.status='completed' and case when r.reviewer_id=b.creator_id then b.accepted_by else b.creator_id end=pr.id)
 from profiles pr where pr.verification_status='verified' and pr.university_id=(select university_id from profiles where profiles.id=auth.uid() and verification_status='verified');
$$;
revoke all on function public.get_task_people(uuid),public.get_marketplace_reputation() from public,anon;
grant execute on function public.get_task_people(uuid),public.get_marketplace_reputation() to authenticated;
-- Each application has its own private conversation. Other applicants cannot read it.
create table public.application_messages(
 id uuid primary key default gen_random_uuid(),proposal_id uuid not null references public.bounty_proposals,
 sender_id uuid not null references public.profiles,body text not null check(char_length(btrim(body)) between 1 and 2000),created_at timestamptz not null default now()
);
alter table public.application_messages enable row level security;
create function public.application_chat_allowed(p_proposal uuid,p_write boolean) returns boolean language sql security definer set search_path=public as $$
 select exists(select 1 from bounty_proposals o join bounties b on b.id=o.bounty_id
 where o.id=p_proposal and auth.uid() in (o.bidder_id,b.creator_id)
 and (not p_write or (o.status in ('pending','accepted') and b.status in ('open','accepted','submitted') and not exists(select 1 from profile_blocks bl where (bl.blocker_id=o.bidder_id and bl.blocked_id=b.creator_id) or (bl.blocker_id=b.creator_id and bl.blocked_id=o.bidder_id)))));
$$;
revoke all on function public.application_chat_allowed(uuid,boolean) from public,anon;
grant execute on function public.application_chat_allowed(uuid,boolean) to authenticated;
create policy "read application conversation" on public.application_messages for select to authenticated using(public.application_chat_allowed(proposal_id,false));
create policy "send application conversation" on public.application_messages for insert to authenticated with check(sender_id=auth.uid() and public.application_chat_allowed(proposal_id,true));
create function public.notify_application_message() returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid; task uuid;
begin
 select b.id,case when new.sender_id=b.creator_id then o.bidder_id else b.creator_id end into task,recipient from bounty_proposals o join bounties b on b.id=o.bounty_id where o.id=new.proposal_id;
 insert into notifications(profile_id,bounty_id,kind,message,dedupe_key) values(recipient,task,'application_message','You have a new message about an application.','application-message:'||new.id);
 return new;
end $$;
revoke all on function public.notify_application_message() from public,anon,authenticated;
create trigger application_message_notification after insert on public.application_messages for each row execute function public.notify_application_message();
create function public.withdraw_proposal(p_proposal uuid) returns void language plpgsql security definer set search_path=public as $$
declare task uuid;
begin
 select bounty_id into task from bounty_proposals where id=p_proposal;
 perform id from bounties where id=task for update;
 update bounty_proposals set status='withdrawn' where id=p_proposal and bidder_id=auth.uid() and status='pending';
 if not found then raise exception 'Only your pending application can be withdrawn'; end if;
end $$;
revoke all on function public.withdraw_proposal(uuid) from public,anon;
grant execute on function public.withdraw_proposal(uuid) to authenticated;
commit;
