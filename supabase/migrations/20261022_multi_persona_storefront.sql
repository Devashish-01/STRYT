-- ==============================================================================
-- 20261022 — Multi-Persona Architecture & Dynamic Storefront Engine
--
-- 1. Business operating models and dynamic fulfillment capabilities.
-- 2. Chat message persona attribution (sender_role, entity_id, staff_alias).
-- 3. Team inbox support on conversations (team_entity_id).
-- 4. Customer unified activity view (orders vs appointments).
-- ==============================================================================

-- ── 1. Business Operating Model & Capabilities ──
do $$
begin
  if not exists (select 1 from pg_type where typname = 'business_operating_model') then
    create type public.business_operating_model as enum (
      'RETAIL_COMMERCE',
      'FOOD_DINING_TAKEAWAY',
      'SERVICE_APPOINTMENT',
      'HEALTHCARE_CONSULT',
      'FIELD_SERVICE_DISPATCH',
      'BATCH_OR_SESSION',
      'PROFESSIONAL_QUOTE',
      'RETAIL_SHOWROOM'
    );
  end if;
end $$;

alter table public.businesses
  add column if not exists operating_model public.business_operating_model default 'RETAIL_COMMERCE',
  add column if not exists fulfillment_capabilities jsonb default '{"delivery": true, "pickup": true, "appointments": false, "queue": false}'::jsonb;

-- ── 2. Message Attribution & Persona Snapshots ──
alter table public.messages
  add column if not exists sender_role text,
  add column if not exists entity_id text,
  add column if not exists entity_name text,
  add column if not exists entity_avatar text,
  add column if not exists staff_alias text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_sender_role_check'
  ) then
    alter table public.messages
      add constraint messages_sender_role_check
      check (sender_role is null or sender_role in ('customer', 'business_owner', 'business_agent', 'provider', 'rider'));
  end if;
end $$;

create index if not exists messages_entity_id_idx 
  on public.messages (entity_id) where entity_id is not null;

-- ── 3. Shared Team Inbox for Stores ──
alter table public.conversations
  add column if not exists team_entity_id text,
  add column if not exists last_replier_id text,
  add column if not exists last_replied_at timestamptz;

create index if not exists conversations_team_entity_idx
  on public.conversations (team_entity_id) where team_entity_id is not null;

-- ── 4. Unified Activity View (Orders vs Appointments) ──
create or replace view public.customer_unified_activity
with (security_invoker = true)
as
select 
  a.id,
  a.customer_user_id,
  a.target_type,
  a.target_id,
  a.status,
  a.payment_status,
  a.scheduled_for,
  item_summary.items,
  case when item_summary.item_count > 0
    then item_summary.item_total + coalesce(a.delivery_fee, 0)
    else coalesce(a.package_price, 0) + coalesce(a.delivery_fee, 0)
  end as total_amount,
  a.created_at,
  case 
    when a.fulfillment_type = 'DELIVERY' then 'ORDER'
    when item_summary.item_count > 0 then 'ORDER'
    else 'APPOINTMENT'
  end as activity_kind
from public.appointments a
left join lateral (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', ai.item_name, 'unitPrice', ai.unit_price, 'quantity', ai.quantity
  )), '[]'::jsonb) as items,
  coalesce(sum(ai.unit_price * ai.quantity), 0) as item_total,
  count(*) as item_count
  from public.appointment_items ai
  where ai.appointment_id = a.id
) item_summary on true;

grant select on public.customer_unified_activity to authenticated;
