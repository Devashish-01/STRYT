-- ============================================================
-- Manual Business + Provider Verification
-- ============================================================
-- Closes the gap called out in 20260724_seller_notifications.sql:
-- "Verification approve/reject currently has no in-app admin action... it's
-- done by direct database edit." This migration adds the columns a real
-- review decision needs, and — the important part — a trigger that makes
-- the "STRYT Verified" badge unforgeable: only the verification-review Edge
-- Function (running as service_role) may ever move verification_status to
-- APPROVED/REJECTED or flip is_verified. This holds even if a table's RLS
-- policies are permissive, because triggers fire regardless of RLS.
--
-- Also removes the automated third-party KYC path (SurePass Aadhaar/PAN) —
-- STRYT verification is 100% manual, human-reviewed, no auto-approval.
-- Run AFTER migration_r13.sql (verification_status/verification_document_url)
-- and 20240901_trust_layer.sql (provider_verifications/verification_tier).
-- ============================================================

-- ── 1. New columns for a real review decision ──────────────────
alter table public.businesses add column if not exists verification_reason text;
alter table public.businesses add column if not exists verification_reviewed_at timestamptz;
alter table public.businesses add column if not exists verification_reviewed_by text;
alter table public.businesses add column if not exists verification_documents text[] not null default '{}';

alter table public.providers add column if not exists verification_reason text;
alter table public.providers add column if not exists verification_reviewed_at timestamptz;
alter table public.providers add column if not exists verification_reviewed_by text;
alter table public.providers add column if not exists verification_documents text[] not null default '{}';

-- ── 2. Trust trigger — the badge can only be granted server-side ───────────
-- Owners may freely move NONE/REJECTED -> UNDER_REVIEW (submitting for
-- review). Only service_role may set APPROVED or REJECTED (a review
-- decision) or flip is_verified — on UPDATE *and* INSERT (a malicious create
-- payload could otherwise smuggle verification_status:'APPROVED' straight
-- into a brand-new row). This is defense-in-depth independent of whatever
-- RLS policies exist on these tables — triggers fire regardless of RLS.
create or replace function public.enforce_manual_verification_decision()
returns trigger as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      if new.verification_status in ('APPROVED', 'REJECTED') then
        raise exception 'verification_status can only be set to % by the verification review service', new.verification_status;
      end if;
      if new.is_verified = true then
        raise exception 'is_verified can only be set by the verification review service';
      end if;
    else
      if new.verification_status is distinct from old.verification_status
         and new.verification_status in ('APPROVED', 'REJECTED') then
        raise exception 'verification_status can only be set to % by the verification review service', new.verification_status;
      end if;
      if new.is_verified is distinct from old.is_verified then
        raise exception 'is_verified can only be changed by the verification review service';
      end if;
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists trg_enforce_verification_business on public.businesses;
create trigger trg_enforce_verification_business
  before insert or update on public.businesses
  for each row execute function public.enforce_manual_verification_decision();

drop trigger if exists trg_enforce_verification_provider on public.providers;
create trigger trg_enforce_verification_provider
  before insert or update on public.providers
  for each row execute function public.enforce_manual_verification_decision();

-- ── 3. Extend decision notifications with the reviewer's reason ────────────
create or replace function public.notify_verification_decision_business()
returns trigger as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.owner_user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.name || ' is now a verified business.', '/business/' || new.id || '/manage/verify');
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      new.owner_user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.name || ' were not approved — resubmit from Settings.'
      end,
      '/business/' || new.id || '/manage/verify'
    );
  end if;
  return new;
end $$ language plpgsql security definer;

create or replace function public.notify_verification_decision_provider()
returns trigger as $$
begin
  if new.is_verified = true and old.is_verified is distinct from true then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (new.user_id, 'VERIFICATION_DECIDED', 'You are verified!', new.display_name || ' is now a verified provider.', '/provider/' || new.id || '/manage/verify');
  elsif new.verification_status = 'REJECTED' and old.verification_status is distinct from 'REJECTED' then
    insert into public.notifications (user_id, type, title, body, deep_link)
    values (
      new.user_id, 'VERIFICATION_DECIDED', 'Verification needs another look',
      case when new.verification_reason is not null and new.verification_reason <> ''
        then 'Reason: ' || new.verification_reason || ' — resubmit from Settings.'
        else 'Your documents for ' || new.display_name || ' were not approved — resubmit from Settings.'
      end,
      '/provider/' || new.id || '/manage/verify'
    );
  end if;
  return new;
end $$ language plpgsql security definer;

-- (triggers already created in 20260724_seller_notifications.sql — CREATE OR
-- REPLACE FUNCTION above is enough to pick up the new reason text)

-- ── 4. Private storage bucket for verification documents ───────────────────
-- Separate from the public "uploads" bucket — government ID / business docs
-- must never be reachable by a guessable public URL. Owners can upload only
-- under their own auth uid prefix; nobody (not even "authenticated") gets a
-- SELECT policy — only service_role (bypasses RLS) can read, via
-- createSignedUrl() inside the verification-review Edge Function.
insert into storage.buckets (id, name, public)
values ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;

drop policy if exists "verification_docs_owner_insert" on storage.objects;
create policy "verification_docs_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'verification-docs'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 5. Remove automated third-party KYC (SurePass Aadhaar/PAN) ─────────────
-- STRYT verification is manual-only, no auto-approval, no third-party ID
-- verification API. provider_verifications held raw SurePass API responses
-- (KYC PII) — drop it entirely rather than leave stale identity data around.
drop table if exists public.provider_verifications;
alter table public.providers drop column if exists verification_tier;
