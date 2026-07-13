-- ============================================================
-- Queue lifecycle hardening: auto-close abandoned queues + let customers
-- cancel any time until payment. Run manually in Supabase SQL editor.
--
-- Two real-world gaps this closes:
--   1. If a business owner forgets to close the queue (or their app never
--      comes back), waiting customers were stranded forever — tokens stayed
--      WAITING, positions/ETAs froze, and new people could keep joining a
--      dead line. Nothing expired queue tokens (unlike requests/agreements/
--      stories, which all self-expire).
--   2. A customer could not back out once served, and nothing enforced the
--      "can't cancel after paying" rule at the database level.
--
-- queue_settings / queue_tokens were created in Studio (not in a tracked
-- migration), so everything here is defensive + idempotent.
-- ============================================================

-- ── 0. Defensive schema: make sure the columns this migration relies on exist ──
create table if not exists public.queue_settings (
  business_id      text primary key references public.businesses(id) on delete cascade,
  is_open          boolean not null default false,
  avg_service_min  int not null default 8,
  updated_at       timestamptz default now()
);

-- Owner "heartbeat" — bumped whenever the owner does anything that proves
-- they're actively running the line (call next / mark arrived / done / toggle
-- settings). Drives the inactivity auto-close below.
alter table public.queue_settings
  add column if not exists last_activity_at timestamptz default now();

-- EXPIRED = ended by the shop/system (distinct from LEFT = customer cancelled).
alter table public.queue_tokens alter column status type text using status::text;
alter table public.queue_tokens drop constraint if exists queue_tokens_status_check;
alter table public.queue_tokens add constraint queue_tokens_status_check
  check (status in ('WAITING','CALLED','SERVED','LEFT','EXPIRED'));

-- Why a live token was ended — for support/analytics only.
alter table public.queue_tokens
  add column if not exists closed_reason text;

-- Speeds up every sweep + owner console read.
create index if not exists queue_tokens_live_idx
  on public.queue_tokens (business_id, status)
  where status in ('WAITING', 'CALLED');

-- ── 1. The sweep: close abandoned queues + expire stale tokens ──────────────
-- Opportunistic, idempotent, SECURITY DEFINER so any caller (a customer just
-- opening My Queues) cleans up the whole table. Also safe to run from pg_cron.
--
-- A live token is expired when ANY of:
--   • DAY_ROLLOVER — created before today (Asia/Kolkata); a queue never carries
--     yesterday's line into a new day.
--   • STALE — older than the hard cap (4h); the ultimate backstop even if the
--     owner never returns.
--   • SHOP_CLOSED — its queue is closed (either the owner closed it or the
--     inactivity rule just did).
-- Never expires a token with money in flight (PENDING_CONFIRM/PAID). A CALLED
-- customer who has physically arrived is mid-service, so only the hard cap can
-- end them — never an inactivity/closed sweep.
create or replace function public.close_stale_queue_tokens()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  max_age     interval := interval '4 hours';    -- hard cap on any live token
  inactivity  interval := interval '90 minutes'; -- owner-gone-quiet window
  tz          text := 'Asia/Kolkata';
  today_start timestamptz := (date_trunc('day', now() at time zone tz) at time zone tz);
begin
  -- (a) Inactivity close: owner hasn't acted in `inactivity` while people wait.
  update public.queue_settings s
     set is_open = false, updated_at = now()
   where s.is_open = true
     and coalesce(s.last_activity_at, s.updated_at) < now() - inactivity
     and exists (
       select 1 from public.queue_tokens t
        where t.business_id = s.business_id
          and t.status in ('WAITING', 'CALLED')
     );

  -- (b) Expire the affected tokens in one pass, then notify each customer.
  with expired as (
    update public.queue_tokens t
       set status = 'EXPIRED',
           closed_reason = case
             when t.created_at < today_start        then 'DAY_ROLLOVER'
             when t.created_at < now() - max_age     then 'STALE'
             else 'SHOP_CLOSED' end
      from public.queue_settings s
     where t.business_id = s.business_id
       and t.status in ('WAITING', 'CALLED')
       and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
       and (
            t.created_at < today_start
         or t.created_at < now() - max_age
         or (s.is_open = false and not (t.status = 'CALLED' and t.arrived_at is not null))
       )
    returning t.id, t.customer_user_id, t.business_id, t.closed_reason
  )
  insert into public.notifications (user_id, type, title, body, deep_link)
  select e.customer_user_id,
         'QUEUE_UPDATE',
         'Queue closed',
         coalesce(b.name, 'The shop') || ' closed its queue — you''ve been removed from the line.',
         '/queues'
    from expired e
    left join public.businesses b on b.id = e.business_id;
exception
  -- A constraint on notifications.type (schema drift) must never abort the
  -- actual cleanup — the tokens/settings changes above still commit.
  when others then
    -- Re-run the expiry without the notification insert as a safe fallback.
    update public.queue_tokens t
       set status = 'EXPIRED',
           closed_reason = case
             when t.created_at < today_start    then 'DAY_ROLLOVER'
             when t.created_at < now() - max_age then 'STALE'
             else 'SHOP_CLOSED' end
      from public.queue_settings s
     where t.business_id = s.business_id
       and t.status in ('WAITING', 'CALLED')
       and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
       and (
            t.created_at < today_start
         or t.created_at < now() - max_age
         or (s.is_open = false and not (t.status = 'CALLED' and t.arrived_at is not null))
       );
end $$;

grant execute on function public.close_stale_queue_tokens() to anon, authenticated;

-- Optional: run every 10 min via pg_cron if the extension is available.
-- Wrapped so the migration still succeeds on projects without pg_cron.
do $$
begin
  perform cron.schedule('close-stale-queues', '*/10 * * * *', 'select public.close_stale_queue_tokens();');
exception when others then null;
end $$;

-- ── 2. Immediate tail cleanup when a queue is closed (manual or automatic) ──
-- Flipping is_open true→false must resolve the customers still in line right
-- then — not leave them frozen until the next sweep. Same protections as the
-- sweep (skip money-in-flight, keep mid-service arrivals).
create or replace function public.expire_tokens_on_queue_close()
returns trigger as $$
begin
  if old.is_open = true and new.is_open = false then
    begin
      with expired as (
        update public.queue_tokens t
           set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
         where t.business_id = new.business_id
           and t.status in ('WAITING', 'CALLED')
           and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
           and not (t.status = 'CALLED' and t.arrived_at is not null)
        returning t.id, t.customer_user_id, t.business_id
      )
      insert into public.notifications (user_id, type, title, body, deep_link)
      select e.customer_user_id, 'QUEUE_UPDATE', 'Queue closed',
             coalesce(b.name, 'The shop') || ' closed its queue — you''ve been removed from the line.',
             '/queues'
        from expired e
        left join public.businesses b on b.id = e.business_id;
    exception when others then
      update public.queue_tokens t
         set status = 'EXPIRED', closed_reason = 'SHOP_CLOSED'
       where t.business_id = new.business_id
         and t.status in ('WAITING', 'CALLED')
         and coalesce(t.payment_status, 'UNPAID') not in ('PENDING_CONFIRM', 'PAID')
         and not (t.status = 'CALLED' and t.arrived_at is not null);
    end;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_expire_on_queue_close on public.queue_settings;
create trigger trg_expire_on_queue_close
  after update on public.queue_settings
  for each row execute function public.expire_tokens_on_queue_close();

-- ── 3. Cancel-until-payment guard (server-side enforcement) ─────────────────
-- A customer may cancel (→ LEFT) while WAITING/CALLED/SERVED, but NOT once a
-- payment is being verified or has completed. The UI hides the button; this is
-- the authoritative check against a stale client or a direct API call.
create or replace function public.enforce_queue_cancel_rules()
returns trigger as $$
begin
  if new.status = 'LEFT' and old.status <> 'LEFT'
     and coalesce(old.payment_status, 'UNPAID') in ('PENDING_CONFIRM', 'PAID') then
    raise exception 'This visit has a payment in progress and can''t be cancelled.';
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_enforce_queue_cancel on public.queue_tokens;
create trigger trg_enforce_queue_cancel
  before update on public.queue_tokens
  for each row execute function public.enforce_queue_cancel_rules();

-- ── 4. After-update: owner heartbeat + "customer left before paying" ────────
create or replace function public.on_queue_token_update()
returns trigger as $$
declare
  v_owner text;
begin
  -- Owner presence heartbeat — any owner-driven progress keeps the queue live.
  if (new.status in ('CALLED', 'SERVED') and new.status is distinct from old.status)
     or (new.arrived_at is not null and old.arrived_at is null) then
    update public.queue_settings set last_activity_at = now() where business_id = new.business_id;
  end if;

  -- Customer walked away after their turn (before paying): tell the owner so a
  -- no-show isn't mistaken for a finished, paid visit.
  if new.status = 'LEFT' and old.status in ('CALLED', 'SERVED') then
    begin
      select b.owner_user_id into v_owner from public.businesses b where b.id = new.business_id;
      if v_owner is not null then
        insert into public.notifications (user_id, type, title, body, deep_link)
        values (v_owner, 'QUEUE_UPDATE', 'Customer left the queue',
                coalesce(new.customer_name, 'A customer') || ' left before paying.',
                '/business/' || new.business_id || '/manage/queue');
      end if;
    exception when others then null;
    end;
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_on_queue_token_update on public.queue_tokens;
create trigger trg_on_queue_token_update
  after update on public.queue_tokens
  for each row execute function public.on_queue_token_update();
