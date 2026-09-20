-- Rollback for 20260995_drop_escrow_surface
--
-- Rebuilds public.payments and restores the two functions' escrow updates, exactly as they were read from
-- the live catalogue on 2026-09-20 (information_schema, pg_constraint, pg_policy, pg_indexes,
-- role_table_grants, pg_get_functiondef) — not from memory.
--
-- ⚠ Applying this re-introduces a claim the product cannot back: the schema will once again say STRYT
-- holds and releases customer funds. Only run it if 20260995 is shown to break something, and note that
-- the table had 0 rows when it was dropped, so there is no data to bring back — only the shape.

begin;

create table public.payments (
  id uuid default gen_random_uuid() not null,
  agreement_id text not null,
  payer_user_id text not null,
  razorpay_order_id text not null,
  razorpay_payment_id text,
  razorpay_signature text,
  amount integer not null,
  currency text default 'INR'::text not null,
  status text default 'CREATED'::text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  escrow_status text default 'PENDING'::text not null
);

alter table only public.payments add constraint payments_pkey primary key (id);
alter table only public.payments add constraint payments_agreement_id_fkey
  foreign key (agreement_id) references public.agreements(id) on delete cascade;
alter table only public.payments add constraint payments_payer_user_id_fkey
  foreign key (payer_user_id) references public.users(id);
alter table only public.payments add constraint payments_status_check
  check ((status = any (array['CREATED'::text, 'PAID'::text, 'FAILED'::text])));
alter table only public.payments add constraint payments_escrow_status_check
  check ((escrow_status = any (array['PENDING'::text, 'HELD'::text, 'RELEASED'::text, 'REFUNDED'::text])));

create index payments_payer_idx on public.payments using btree (payer_user_id);
create index idx_payments_agreement on public.payments using btree (agreement_id);
create index idx_payments_order on public.payments using btree (razorpay_order_id);

alter table public.payments enable row level security;

create policy payments_own on public.payments as permissive for all to public
  using (((select auth.uid())::text = payer_user_id));
create policy payments_insert on public.payments as permissive for insert to public
  with check (((select auth.uid())::text = payer_user_id));

grant select, insert, update, delete, truncate, references, trigger
  on table public.payments to authenticated;

-- Restore the escrow update inside agreement_complete.
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
  update public.payments set escrow_status = 'RELEASED'
  where agreement_id = p_id and escrow_status = 'HELD';
end $function$;

-- Restore the escrow update inside admin_resolve_agreement_dispute.
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

  update public.payments
  set escrow_status = case when p_resolution = 'COMPLETED' then 'RELEASED' else 'REFUNDED' end
  where agreement_id = p_id and escrow_status = 'HELD';

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

notify pgrst, 'reload schema';

commit;
