-- ============================================================
-- Scope notifications to an entity (business / provider / customer) so each
-- context's bell shows only its own notifications — a user with several
-- businesses sees each business's notifications separately, providers see only
-- provider ones, and the personal bell shows customer + system notifications.
-- Run manually in Supabase SQL editor.
--
-- Rather than editing the ~15 triggers that create notifications, the scope is
-- derived from the deep_link (which already encodes context, e.g.
-- /business/<id>/manage/... , /provider/<id>/manage/...). A single BEFORE
-- INSERT trigger stamps every current and future notification automatically.
-- ============================================================

alter table public.notifications
  add column if not exists entity_type text,   -- 'BUSINESS' | 'PROVIDER' | 'CUSTOMER'
  add column if not exists entity_id   text;   -- business/provider id when scoped

create or replace function public.derive_notification_scope()
returns trigger as $$
begin
  if new.entity_type is null then
    if new.deep_link ~ '^/business/[^/]+/manage' then
      new.entity_type := 'BUSINESS';
      new.entity_id := split_part(new.deep_link, '/', 3);
    elsif new.deep_link ~ '^/provider/[^/]+/manage' then
      new.entity_type := 'PROVIDER';
      new.entity_id := split_part(new.deep_link, '/', 3);
    else
      new.entity_type := 'CUSTOMER';
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_derive_notification_scope on public.notifications;
create trigger trg_derive_notification_scope
  before insert on public.notifications
  for each row execute function public.derive_notification_scope();

-- One-time backfill of existing rows.
update public.notifications set
  entity_type = case
    when deep_link ~ '^/business/[^/]+/manage' then 'BUSINESS'
    when deep_link ~ '^/provider/[^/]+/manage' then 'PROVIDER'
    else 'CUSTOMER' end,
  entity_id = case
    when deep_link ~ '^/(business|provider)/[^/]+/manage' then split_part(deep_link, '/', 3)
    else null end
where entity_type is null;

create index if not exists notif_scope_idx
  on public.notifications (user_id, entity_type, entity_id, is_read);
