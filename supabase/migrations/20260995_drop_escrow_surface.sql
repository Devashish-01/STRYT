-- 20260995_drop_escrow_surface
--
-- Removes the escrow/custody model from the database. STRYT does not hold anyone's money and has no
-- payment-custody licence, but the schema said otherwise: public.payments carried escrow_status plus
-- razorpay_order_id / razorpay_payment_id / razorpay_signature, and two RPCs flipped that status to
-- RELEASED or REFUNDED as if funds were being moved.
--
-- docs/product/STRYT-FEATURES.md has always said the opposite — "Stryt never touches the money itself,
-- it just tracks who claimed to have paid and lets the other side confirm it" — and that is what the
-- product actually does (UPI deep links in DealUpiSheet / PaymentMethodPanel, then a manual confirm).
-- Claiming custody you do not have is a regulatory and consumer-protection problem, not a cosmetic one,
-- so the claim is being removed rather than reworded.
--
-- Verified on production before writing this (2026-09-20):
--   * public.payments holds 0 rows, and 0 rows with escrow_status <> 'PENDING' — no escrow has ever been
--     recorded, so nothing is being destroyed;
--   * no foreign key, view, materialized view or trigger references the table;
--   * exactly two functions touch it — agreement_complete and admin_resolve_agreement_dispute — and both
--     only to flip escrow_status. custom_payment_create matched a search for "payments" but returns the
--     separate public.custom_payments type and never reads this table;
--   * no Razorpay integration exists anywhere in the app or the edge functions, so these columns describe
--     a payment processor that was never wired up.
--
-- Both functions below are rebuilt from their LIVE definitions (pg_get_functiondef, 2026-09-20), with only
-- the escrow UPDATE removed — HANDOFF rule 4. Nothing else in either body changes.
--
-- Rollback: supabase/rollbacks/20260995_drop_escrow_surface.rollback.sql

begin;

-- 1. agreement_complete — live definition minus the escrow release ------------------------------------
create or replace function public.agreement_complete(p_id text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid text := auth.uid()::text; v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_uid is distinct from v_agreement.requester_user_id then raise exception 'NOT_REQUESTER'; end if;
  if v_agreement.status <> 'REVIEW' then raise exception 'INVALID_TRANSITION'; end if;
  update public.agreements set status = 'COMPLETED'
  where id = p_id and status = 'REVIEW';
  if not found then raise exception 'INVALID_TRANSITION'; end if;
end $function$;

-- 2. admin_resolve_agreement_dispute — live definition minus the escrow release/refund ----------------
create or replace function public.admin_resolve_agreement_dispute(p_id text, p_resolution text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid text := auth.uid()::text;
  v_agreement public.agreements%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not exists (
    select 1 from public.users u
    where u.id = v_uid and u.roles && array['admin', 'super_admin']::text[]
  ) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_resolution not in ('COMPLETED', 'CANCELLED') then raise exception 'INVALID_RESOLUTION'; end if;

  select * into v_agreement from public.agreements where id = p_id for update;
  if not found then raise exception 'AGREEMENT_NOT_FOUND'; end if;
  if v_agreement.status <> 'DISPUTED' then raise exception 'INVALID_TRANSITION'; end if;

  update public.agreements
  set status = p_resolution::public.agreement_status
  where id = p_id and status = 'DISPUTED';
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  begin
    insert into public.notifications (user_id, type, title, body, deep_link)
    select party_id, 'AGREEMENT', 'Dispute resolved',
      case when p_resolution = 'COMPLETED'
        then 'The disputed agreement was resolved as completed.'
        else 'The disputed agreement was cancelled.' end,
      '/agreement/' || p_id
    from (values (v_agreement.requester_user_id), (v_agreement.responder_user_id)) v(party_id)
    where party_id is not null;
  exception when others then null;
  end;
end
$function$;

-- 3. The table itself ---------------------------------------------------------------------------------
-- Dropped rather than stripped of its escrow columns: with no rows, no Razorpay integration and no
-- referent anywhere, an empty table named "payments" in a non-custodial product is exactly the kind of
-- thing a future reader rebuilds a wrong assumption on.
drop table if exists public.payments;

notify pgrst, 'reload schema';

commit;

-- Verify (expect: payments gone, neither function mentioning escrow):
--   select to_regclass('public.payments');                     -- null
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prokind = 'f' and p.prolang <> 13
--       and pg_get_functiondef(p.oid) ilike '%escrow%';        -- 0
