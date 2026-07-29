-- Notification preferences that actually do something.
--
-- The customer Settings screen has shipped six notification toggles since
-- launch; five of them wrote to localStorage and were read by nothing, anywhere
-- (verified by grepping every read of settings_silent / settings_quiet /
-- settings_new_biz / settings_reqs / settings_offers). There was nowhere to
-- store them server-side and send-push had no preference logic at all, so the
-- switches were purely cosmetic. This gives them somewhere real to live; the
-- send-push edge function reads them at delivery time.
--
-- SAFETY RULE, enforced in send-push, stated here so it travels with the schema:
-- these preferences may ONLY gate discovery/marketing notifications
-- (NEW_BUSINESS, NEW_PROVIDER, NEARBY_REQUEST, QUOTE_BROADCAST, OFFER).
-- Transactional notifications — APPOINTMENT, QUEUE_UPDATE, AGREEMENT, DELIVERY,
-- chat and payment — must always be delivered. It is an allowlist, never a
-- denylist, so a new notification type is deliverable by default.

alter table public.users
  add column if not exists notif_new_business    boolean not null default true,
  add column if not exists notif_nearby_requests boolean not null default true,
  add column if not exists notif_offers          boolean not null default true,
  -- Sound-only preferences: they downgrade the alert, never drop the message.
  add column if not exists notif_silent          boolean not null default false,
  add column if not exists notif_quiet_hours     boolean not null default false,
  -- IANA zone (e.g. "Asia/Kolkata"), seeded from the device at sign-in.
  -- Quiet hours can't be evaluated without it; send-push assumes Asia/Kolkata
  -- when null rather than silently skipping the check.
  add column if not exists timezone              text;

comment on column public.users.notif_new_business    is 'Discovery push: a new business opened nearby. Never gates transactional notifications.';
comment on column public.users.notif_nearby_requests is 'Discovery push: a neighbour posted a request / quote broadcast.';
comment on column public.users.notif_offers          is 'Discovery push: offers and deals.';
comment on column public.users.notif_silent          is 'Deliver pushes without sound. Does not suppress delivery.';
comment on column public.users.notif_quiet_hours     is 'Silence push sound 22:00-07:00 in users.timezone.';
comment on column public.users.timezone              is 'IANA timezone from the device, used for quiet-hours evaluation.';
