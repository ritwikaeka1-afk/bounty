begin;

-- New database functions must be opt-in. PostgreSQL otherwise grants EXECUTE
-- to PUBLIC, which includes anonymous callers.
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Contact details belong only in the private, accepted-task conversation.
-- This limits accidental doxxing in searchable listings and peer profiles.
create or replace function public.reject_public_contact_details()
returns trigger language plpgsql set search_path = public as $$
declare content text := concat_ws(' ', new.title, new.description, new.completion_criteria, new.location_name, new.short_summary);
begin
  if content ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
     or content ~* '(^|[^0-9])[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{4}([^0-9]|$)'
     or content ~* '(https?://|www\\.)' then
    raise exception 'Public listings cannot contain email addresses, phone numbers, or links. Share exact contact details only after accepting an offer.';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_public_contact_details() from public, anon, authenticated;

drop trigger if exists block_public_contact_details on public.bounties;
create trigger block_public_contact_details
before insert or update of title, description, completion_criteria, location_name, short_summary on public.bounties
for each row execute function public.reject_public_contact_details();

create or replace function public.reject_public_profile_contact_details()
returns trigger language plpgsql set search_path = public as $$
declare content text := concat_ws(' ', new.bio, array_to_string(new.skills, ' '), array_to_string(new.interests, ' '));
begin
  if content ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' 
     or content ~* '(^|[^0-9])[0-9]{3}[ .-]?[0-9]{3}[ .-]?[0-9]{4}([^0-9]|$)'
     or content ~* '(https?://|www\\.)' then
    raise exception 'Public profile fields cannot contain email addresses, phone numbers, or links.';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_public_profile_contact_details() from public, anon, authenticated;

drop trigger if exists block_public_profile_contact_details on public.profiles;
create trigger block_public_profile_contact_details
before insert or update of bio, skills, interests on public.profiles
for each row execute function public.reject_public_profile_contact_details();

-- Restore the small, deliberately public RPC surface after the baseline revoke.
grant execute on function public.get_beta_access_mode(), public.get_university_stats(text) to anon, authenticated;
grant execute on function public.create_bounty_v2(uuid,text,text,integer,text,integer,text,text,text,timestamptz,uuid),
 public.edit_bounty(uuid,integer,text,text,integer,text,integer,timestamptz), public.manage_bounty(uuid,text),
 public.send_support_request(text,text,uuid), public.save_my_names(text,text), public.get_meeting_details(uuid),
 public.submit_proposal(uuid,text), public.accept_proposal(uuid,uuid), public.submit_bounty(uuid),
 public.complete_bounty(uuid,uuid), public.propose_bounty_change(uuid,text,text,integer),
 public.respond_bounty_change(uuid,boolean,uuid), public.bonus_bounty(uuid,integer,uuid),
 public.get_task_people(uuid), public.get_marketplace_reputation(), public.application_chat_allowed(uuid,boolean),
 public.task_message_allowed(uuid), public.withdraw_proposal(uuid), public.update_my_profile(text,text,text[],public.experience_level),
 public.update_my_profile_details(text,text,text[],public.experience_level,text,integer,text[],text),
 public.enroll_beta_tester(), public.record_product_event(text)
to authenticated;
grant execute on function public.generate_bounty_reminders(), public.claim_push_deliveries(),
 public.email_delivery_allowed(uuid), public.claim_email_deliveries(), public.resolve_bounty_dispute(uuid,boolean,text,uuid),
 public.set_beta_access(boolean)
to service_role;

commit;

