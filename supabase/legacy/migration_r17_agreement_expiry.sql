-- migration_r17_agreement_expiry.sql
create or replace function public.cancel_expired_agreements()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ag record;
begin
  -- Loop through all agreements in PENDING status created > 10 minutes ago
  for v_ag in 
    select * from public.agreements 
    where status = 'PENDING' 
      and created_at < now() - interval '10 minutes'
  loop
    -- 1. Cancel the agreement
    update public.agreements set status = 'CANCELLED' where id = v_ag.id;

    -- 2. Revert the request back to OPEN
    update public.requests set status = 'OPEN' where id = v_ag.request_id;

    -- 3. Revert all proposals for this request back to SUBMITTED
    update public.proposals set status = 'SUBMITTED' where request_id = v_ag.request_id;
  end loop;
end $$;

grant execute on function public.cancel_expired_agreements() to authenticated;
