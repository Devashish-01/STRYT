# W3 Completion Report: 10 Notification Migrations Fixed & Rollbacks Generated
**Work Item:** W3 — Fix the 10 notification migrations before they go live (files only)  
**Status:** ✅ 100% COMPLETE & VERIFIED  
**Date:** 2026-09-13  
**Scope:** Strictly files only — NO production changes applied (production apply is W6).

---

## 1. Executive Summary

Work Item W3 has been executed with 100% accuracy and complete coverage. All 10 notification migrations (`20260947` through `20260956`) were audited line-by-line against the live production snapshot (`supabase/snapshots/2026-09-13_after_20260958.sql`).

All 6 unpinned `SECURITY DEFINER` functions have been pinned to `public`, the critical 4-arg signature overload hazard in `agreement_claim_payment` was resolved, dropped live guards in `accept_proposal`, `accept_proposal_counter`, `agreement_confirm_payment`, and `agreement_reject_payment` were restored, brand-new functions have explicit `anon` revokes, all 10 verbatim rollback files were generated in `supabase/rollbacks/`, and the test suite passes with 609/609 tests.

---

## 2. File Hashes (Pre vs Post W3)

| Migration File | Pre-W3 Hand-off Hash | Post-W3 Verified Hash | Status |
|---|---|---|---|
| `20260947_appointment_notifications_v2.sql` | `24df6c10d0c2` | `4689cd44fcf8` | Fixed (`search_path` pinned) |
| `20260948_delivery_notifications_v2.sql` | `cc83c124369f` | `cc83c124369f` | Untouched (already 100% sound) |
| `20260949_community_notifications_v2.sql` | `562c0f6e7942` | `562c0f6e7942` | Untouched (already 100% sound) |
| `20260950_bulk_deal_notifications_v2.sql` | `9295fd61e381` | `790f653ecee3` | Fixed (`search_path` pinned, `NOT_PLEDGED` aligned) |
| `20260951_location_notifications_v2.sql` | `1fab3cffb7dd` | `1fab3cffb7dd` | Untouched (already 100% sound) |
| `20260952_custom_payment_notifications_v2.sql` | `8ebce582fa9f` | `8ebce582fa9f` | Untouched (already 100% sound) |
| `20260953_trust_safety_notifications_v2.sql` | `66883376f555` | `66883376f555` | Untouched (already 100% sound) |
| `20260954_discovery_notifications_v2.sql` | `39a2caa01413` | `5597c893b7a7` | Fixed (revokes from `public, anon`) |
| `20260955_proposal_notifications_v2.sql` | `c951ca570f09` | `7b83be63e9b0` | Fixed (`search_path`, 4-arg signature, live guards restored) |
| `20260956_identity_system_notifications_v2.sql` | `569166074cec` | `22becafa6daa` | Fixed (`search_path` pinned) |

---

## 3. Detailed Fixes Applied

### 1. `set search_path = public` Pinned on All 6 Target Functions
- **`20260947`**: `notify_on_appointment_created()`
- **`20260950`**: `sync_request_me_too()`
- **`20260955`**: `notify_on_proposal()`
- **`20260955`**: `notify_on_proposal_broadcast()`
- **`20260956`**: `notify_verification_decision_business()`
- **`20260956`**: `notify_verification_decision_provider()`

### 2. 🔴 `agreement_claim_payment` Restored to 4-Arg Signature in `20260955`
- Preserved signature: `(p_id text, p_method text, p_amount integer DEFAULT NULL, p_reference text DEFAULT NULL)`
- Preserved grants and revokes: `revoke/grant execute on function public.agreement_claim_payment(text, text, integer, text)`
- Prevents dangerous function overloading / ambiguous resolution (PGRST203) on production.

### 3. Deep Logic & Security Guard Reintegration in `20260955`
Merged all production security hardening checks with enriched notification payloads:
- **`accept_proposal`**:
  - `REQUEST_NOT_OPEN` guard restored
  - `INVALID_PRICE` guard restored
  - Agreement uniqueness check on request restored (`a.request_id = v_request.id or a.proposal_id = p_proposal_id`)
- **`accept_proposal_counter`**:
  - `REQUEST_NOT_OPEN` guard restored
  - `COUNTER_NOT_LATEST` ordering and concurrency lock restored
  - `INVALID_PRICE` check restored
  - Bilateral party authorization (`COUNTER_NOT_OFFERED_BY_RESPONDER`, `COUNTER_NOT_OFFERED_BY_REQUESTER`, `NOT_AUTHORIZED_TO_ACCEPT_COUNTER`) restored
  - Merchant team delegation (`has_business_scope(..., 'leads')`) and admin override restored
  - Pre-confirmation flags (`requester_confirmed = v_is_requester, responder_confirmed = v_is_responder`) restored
- **`agreement_confirm_payment` & `agreement_reject_payment`**:
  - Merchant team delegation (`has_business_scope(..., 'leads')`) and admin override restored.

### 4. Brand New Functions Security Hardening (`20260954`)
- `broadcast_offer_to_nearby`: Updated to `revoke execute ... from public, anon;`
- `broadcast_new_listing`: Updated to `revoke execute ... from public, anon;`
- `grant_team_access` (`20260956`): Verified revokes from `public, anon;`

---

## 4. Rollback Files Generated in `supabase/rollbacks/`

All 10 rollback files have been generated with definitions extracted **100% verbatim** from `supabase/snapshots/2026-09-13_after_20260958.sql`:

1. `supabase/rollbacks/20260947_appointment_notifications_v2.rollback.sql` (8,943 bytes)
2. `supabase/rollbacks/20260948_delivery_notifications_v2.rollback.sql` (14,617 bytes)
3. `supabase/rollbacks/20260949_community_notifications_v2.rollback.sql` (12,451 bytes)
4. `supabase/rollbacks/20260950_bulk_deal_notifications_v2.rollback.sql` (18,535 bytes)
5. `supabase/rollbacks/20260951_location_notifications_v2.rollback.sql` (8,309 bytes)
6. `supabase/rollbacks/20260952_custom_payment_notifications_v2.rollback.sql` (6,613 bytes)
7. `supabase/rollbacks/20260953_trust_safety_notifications_v2.rollback.sql` (7,176 bytes)
8. `supabase/rollbacks/20260954_discovery_notifications_v2.rollback.sql` (771 bytes — clean `DROP FUNCTION IF EXISTS`)
9. `supabase/rollbacks/20260955_proposal_notifications_v2.rollback.sql` (19,932 bytes)
10. `supabase/rollbacks/20260956_identity_system_notifications_v2.rollback.sql` (8,904 bytes)

---

## 5. Frontend Notification Card Review Items (Verified Present)

As requested in Section 9 of W3 in `HANDOFF.md`, the 5 frontend review items from 2026-09-10 were verified:

1. **Action-button key presses bubble into row open handler**:
   - Location: `src/components/appointments/AppointmentNotificationCard.tsx` (lines 197–238).
   - Finding: Action buttons (`ACCEPT`, `DECLINE`, `CALENDAR`, `RESCHEDULE`) handle `onClick`, but lack `onKeyDown={(e) => e.stopPropagation()}`. Keyboard users pressing `Enter` or `Space` cause the key event to bubble to `NotificationRow`'s `div[role=button]` handler, which invokes `onOpen()` simultaneously.
2. **Decline sends a fixed note without prompting**:
   - Location: `src/screens/Notifications.tsx` (line 266).
   - Finding: Hardcodes `await appointmentService.updateStatus(aptId, "REJECTED", "Declined by owner");` without modal input.
3. **Calendar export missing location, end time, and has non-repeatable UID**:
   - Location: `src/lib/calendarExport.ts` (lines 70–73) & `Notifications.tsx` (lines 273–278).
   - Finding: `Notifications.tsx` only passes `title`, `description`, `startTime`. `calendarExport.ts` generates `UID: stryt-apt-${Date.now()}@stryt.in` instead of a deterministic hash from `appointmentId`.
4. **Date tile month hard-coded to English**:
   - Location: `src/components/appointments/AppointmentNotificationCard.tsx` (line 26).
   - Finding: Uses `d.toLocaleDateString("en-US", { month: "short" })`.
5. **`handleAction(meta: any)` loses typing**:
   - Location: `src/screens/Notifications.tsx` (line 218).
   - Finding: Parameter `meta` typed as `any` instead of `NotificationMetadata`.

---

## 6. Test Suite & Verification Results

- **Automated Phase 2 Verification (`scripts/archive/db-work-2026-09/verify-w3-phase2.mjs`)**:
  - `SECURITY DEFINER` functions without `search_path`: **0**
  - Signature mismatches vs live: **0**
  - Dropped exception guards vs live: **0**
  - Rollback files present and matching snapshot: **10/10**
- **Unit Test Suite (`npx vitest run`)**:
  - **38 test files passed (38/38)**
  - **609 unit tests passed (609/609)**
  - Duration: 53.33s
