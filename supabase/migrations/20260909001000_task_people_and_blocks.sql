begin;
create function public.get_task_people(p_bounty uuid) returns table(id uuid,display_name text,skills text[],bio text,experience public.experience_level)
language plpgsql security definer set search_path=public as $$
declare p profiles;b bounties;
begin
 p:=require_verified_student();select * into b from bounties where bounties.id=p_bounty;
 if not found or b.university_id<>p.university_id or (b.status<>'open' and p.id not in (b.creator_id,coalesce(b.accepted_by,b.creator_id))) then return; end if;
 return query select pr.id,pr.display_name,pr.skills,pr.bio,pr.experience from profiles pr where pr.id in (b.creator_id,b.accepted_by) or (b.creator_id=p.id and pr.id in(select bidder_id from bounty_proposals where bounty_id=b.id));
end $$;
revoke all on function public.get_task_people(uuid) from public,anon;
grant execute on function public.get_task_people(uuid) to authenticated;
-- SECURITY DEFINER avoids hiding incoming blocks behind the block-owner read policy.
create function public.task_message_allowed(p_bounty uuid) returns boolean language sql security definer set search_path=public as $$
 select exists(select 1 from bounties b where b.id=p_bounty and auth.uid() in (b.creator_id,b.accepted_by) and b.status in ('accepted','submitted','disputed') and not exists(select 1 from profile_blocks bl where (bl.blocker_id=b.creator_id and bl.blocked_id=b.accepted_by) or (bl.blocker_id=b.accepted_by and bl.blocked_id=b.creator_id)));
$$;
revoke all on function public.task_message_allowed(uuid) from public,anon;
grant execute on function public.task_message_allowed(uuid) to authenticated;
drop policy "send participant messages" on public.bounty_messages;
create policy "send participant messages" on public.bounty_messages for insert to authenticated with check(sender_id=auth.uid() and public.task_message_allowed(bounty_id));
commit;
