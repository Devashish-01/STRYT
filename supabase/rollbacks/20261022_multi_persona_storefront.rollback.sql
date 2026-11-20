-- ==============================================================================
-- 20261022 — Multi-Persona Architecture & Dynamic Storefront Engine (ROLLBACK)
-- ==============================================================================

drop view if exists public.customer_unified_activity;

drop index if exists public.conversations_team_entity_idx;
alter table public.conversations
  drop column if exists team_entity_id,
  drop column if exists last_replier_id,
  drop column if exists last_replied_at;

drop index if exists public.messages_entity_id_idx;
alter table public.messages
  drop constraint if exists messages_sender_role_check,
  drop column if exists sender_role,
  drop column if exists entity_id,
  drop column if exists entity_name,
  drop column if exists entity_avatar,
  drop column if exists staff_alias;

alter table public.businesses
  drop column if exists operating_model,
  drop column if exists fulfillment_capabilities;

drop type if exists public.business_operating_model;
