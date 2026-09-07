create or replace function public.accept_proposal(p_proposal_id uuid, p_idempotency_key uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  proposal public.bounty_proposals;
  b public.bounties;
  creator_account uuid;
  escrow_account uuid;
  txn uuid;
begin
  p := public.require_verified_student();

  select * into proposal from public.bounty_proposals where id = p_proposal_id for update;
  if not found then raise exception 'Proposal is unavailable'; end if;
  select * into b from public.bounties where id = proposal.bounty_id for update;
  if not found or b.creator_id <> p.id then raise exception 'Only the bounty poster can accept this proposal'; end if;
  if exists (
    select 1 from public.ledger_transactions lt
    where lt.idempotency_key = p_idempotency_key
      and lt.created_by = p.id
      and lt.bounty_id = b.id
      and lt.type = 'bounty_hold'
  ) then
    return;
  end if;
  if exists (select 1 from public.ledger_transactions where idempotency_key = p_idempotency_key) then
    raise exception 'Idempotency key was already used for a different request';
  end if;
  if b.status <> 'open' then raise exception 'Bounty is no longer available'; end if;
  if proposal.status <> 'pending' then raise exception 'Proposal is unavailable'; end if;

  select id into creator_account from public.credit_accounts where profile_id = b.creator_id for update;
  if (select available_balance from public.credit_accounts where id = creator_account) < b.reward_credits then
    raise exception 'Insufficient credits to fund this bounty';
  end if;
  insert into public.credit_accounts (university_id, account_type)
  values (b.university_id, 'escrow') on conflict do nothing;
  select id into escrow_account from public.credit_accounts
  where university_id = b.university_id and account_type = 'escrow' for update;

  update public.credit_accounts set available_balance = available_balance - b.reward_credits, updated_at = now() where id = creator_account;
  update public.credit_accounts set available_balance = available_balance + b.reward_credits, updated_at = now() where id = escrow_account;
  insert into public.ledger_transactions (type, bounty_id, created_by, idempotency_key)
  values ('bounty_hold', b.id, p.id, p_idempotency_key) returning id into txn;
  insert into public.ledger_entries (transaction_id, account_id, amount)
  values (txn, creator_account, -b.reward_credits), (txn, escrow_account, b.reward_credits);

  update public.bounty_proposals set status = 'accepted' where id = proposal.id;
  update public.bounty_proposals set status = 'declined' where bounty_id = b.id and id <> proposal.id and status = 'pending';
  update public.bounties set status = 'accepted', accepted_by = proposal.bidder_id where id = b.id;
  insert into public.bounty_events (bounty_id, actor_id, event_type, metadata)
  values (b.id, p.id, 'proposal_accepted', jsonb_build_object('proposal_id', proposal.id));
end; $$;

revoke execute on function public.accept_proposal(uuid, uuid) from public, anon;
grant execute on function public.accept_proposal(uuid, uuid) to authenticated;
