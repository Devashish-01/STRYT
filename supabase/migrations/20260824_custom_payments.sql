-- ============================================================
-- 20260824 — "Pay any amount": a customer can pay a business/provider a
-- self-chosen amount with no prior booking/queue/deal relationship, and it's
-- logged so the receiver can see it in their console (not a stateless
-- UPI-link generator).
--
-- Mirrors appointments' polymorphic target_type/target_id/target_owner_user_id
-- pattern, and the create/confirm/reject RPC shape already proven by
-- appointment_create_walk_in_payment (20260829_walk_in_payment_claim.sql) and
-- appointment_confirm_payment/appointment_reject_payment
-- (20260824_booking_and_rpc_security.sql) — same validation, same
-- for-update locking, same permission checks, applied to a standalone table
-- since a custom payment has no parent appointment/queue row to attach to.
-- ============================================================

create table if not exists public.custom_payments (
  id                    text primary key default ('cp_' || replace(gen_random_uuid()::text, '-', '')),
  target_type           text not null check (target_type in ('BUSINESS','PROVIDER')),
  target_id             text not null,
  target_owner_user_id  text not null references public.users(id),
  target_name           text,
  payer_user_id         text not null references public.users(id),
  payer_name            text,
  payer_avatar          text,
  amount                numeric(10,2) not null check (amount > 0),
  method                text not null check (method in ('UPI','CASH')),
  status                text not null default 'PENDING_CONFIRM'
                          check (status in ('PENDING_CONFIRM','PAID','REJECTED')),
  reference             text,
  note                  text,
  created_at            timestamptz not null default now(),
  confirmed_at          timestamptz
);

create index if not exists custom_payments_target_idx  on public.custom_payments (target_id);
create index if not exists custom_payments_payer_idx   on public.custom_payments (payer_user_id);
create index if not exists custom_payments_owner_idx   on public.custom_payments (target_owner_user_id);
create index if not exists custom_payments_pending_idx on public.custom_payments (target_id) where status = 'PENDING_CONFIRM';

alter table public.custom_payments enable row level security;

-- Read-only policy. Deliberately no insert/update policy at all — every
-- write goes through the SECURITY DEFINER RPCs below, which bypass RLS, so a
-- raw client call can never fabricate or mutate a claim directly.
create policy select_custom_payments on public.custom_payments for select
  using (
    (auth.uid())::text in (payer_user_id, target_owner_user_id)
    or (target_type = 'BUSINESS' and public.has_business_scope(target_id, (auth.uid())::text, 'appointments'))
    or public.is_admin()
  );

create or replace function public.custom_payment_create(
  p_target_type text, p_target_id text, p_amount numeric, p_method text,
  p_note text default null, p_reference text default null
) returns public.custom_payments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_owner text;
  v_target_name text;
  v_payer_name text;
  v_payer_avatar text;
  v_row public.custom_payments%rowtype;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if p_target_type not in ('BUSINESS','PROVIDER') then raise exception 'INVALID_TARGET_TYPE'; end if;
  if p_method not in ('UPI','CASH') then raise exception 'INVALID_METHOD'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  if p_target_type = 'BUSINESS' then
    select b.owner_user_id, b.name into v_owner, v_target_name
    from public.businesses b where b.id = p_target_id and b.status = 'ACTIVE';
  else
    select p.user_id, p.display_name into v_owner, v_target_name
    from public.providers p where p.id = p_target_id and p.status = 'ACTIVE';
  end if;
  if v_owner is null then raise exception 'TARGET_NOT_FOUND'; end if;
  if v_owner = v_uid then raise exception 'OWNER_CANNOT_SELF_PAY'; end if;

  select coalesce(nullif(trim(u.name), ''), 'Customer'), u.avatar
  into v_payer_name, v_payer_avatar
  from public.users u where u.id = v_uid;

  insert into public.custom_payments (
    target_type, target_id, target_owner_user_id, target_name,
    payer_user_id, payer_name, payer_avatar,
    amount, method, status, reference, note
  ) values (
    p_target_type, p_target_id, v_owner, v_target_name,
    v_uid, v_payer_name, v_payer_avatar,
    p_amount, p_method, 'PENDING_CONFIRM',
    nullif(left(trim(coalesce(p_reference, '')), 200), ''),
    nullif(left(trim(coalesce(p_note, '')), 300), '')
  ) returning * into v_row;

  -- Unlike an appointment/queue claim, the owner has no pre-existing record
  -- to already be watching, so a claim could go unnoticed without a push.
  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_owner, 'CUSTOM_PAYMENT_RECEIVED', 'New payment received',
    coalesce(v_payer_name, 'A customer') || ' sent ' || p_amount::text || ' via ' || p_method,
    case when p_target_type = 'BUSINESS' then '/business/' || p_target_id || '/manage/payments'
         else '/provider/' || p_target_id || '/manage/money' end
  );

  return v_row;
end
$$;

revoke execute on function public.custom_payment_create(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.custom_payment_create(text, text, numeric, text, text, text) to authenticated;

create or replace function public.custom_payment_confirm(p_id text)
returns public.custom_payments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_row public.custom_payments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.custom_payments where id = p_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  v_allowed := v_row.target_owner_user_id = v_uid
    or (v_row.target_type = 'BUSINESS' and public.has_business_scope(v_row.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_row.status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.custom_payments set status = 'PAID', confirmed_at = now()
  where id = p_id and status = 'PENDING_CONFIRM'
  returning * into v_row;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_row.payer_user_id, 'CUSTOM_PAYMENT_CONFIRMED', 'Payment confirmed',
    coalesce(v_row.target_name, 'The business') || ' confirmed your payment of ' || v_row.amount::text,
    case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
         else '/provider/' || v_row.target_id end
  );

  return v_row;
end
$$;

revoke execute on function public.custom_payment_confirm(text) from public, anon;
grant execute on function public.custom_payment_confirm(text) to authenticated;

create or replace function public.custom_payment_reject(p_id text)
returns public.custom_payments
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_row public.custom_payments%rowtype;
  v_allowed boolean;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  select * into v_row from public.custom_payments where id = p_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  v_allowed := v_row.target_owner_user_id = v_uid
    or (v_row.target_type = 'BUSINESS' and public.has_business_scope(v_row.target_id, v_uid, 'appointments'));
  if not v_allowed then raise exception 'NOT_TARGET_MANAGER'; end if;
  if v_row.status <> 'PENDING_CONFIRM' then raise exception 'INVALID_TRANSITION'; end if;

  update public.custom_payments set status = 'REJECTED'
  where id = p_id and status = 'PENDING_CONFIRM'
  returning * into v_row;
  if not found then raise exception 'INVALID_TRANSITION'; end if;

  insert into public.notifications (user_id, type, title, body, deep_link)
  values (
    v_row.payer_user_id, 'CUSTOM_PAYMENT_REJECTED', 'Payment claim rejected',
    coalesce(v_row.target_name, 'The business') || ' couldn''t confirm your payment of ' || v_row.amount::text || ' — check the amount and try again',
    case when v_row.target_type = 'BUSINESS' then '/business/' || v_row.target_id
         else '/provider/' || v_row.target_id end
  );

  return v_row;
end
$$;

revoke execute on function public.custom_payment_reject(text) from public, anon;
grant execute on function public.custom_payment_reject(text) to authenticated;
