# STRYT — Launch Blockers & Production-Readiness Bug Report

> Audit date: 2026-06-20 · Scope: full codebase read (services, RLS/SQL, auth, payments, store, screens).
> Focus: **bugs that can stop the app going live or harm real customers** (security, money, data-loss, broken core flows).

---

## ✅ Resolution status (implemented 2026-06-20)

All findings have code/SQL fixes in the repo. **Three steps remain manual** because they touch your live infrastructure (I can't safely do these from here):

| # | Status | What was done |
|---|--------|----------------|
| P0-1 | ✅ Code done | Owner-scoped agreement RLS in [migration_launch_hardening.sql](supabase/migration_launch_hardening.sql) |
| P0-2 | ✅ Code done | `conversations`/`messages` tables + participant RLS in the migration |
| P0-3 | ✅ Code done | `agreement_status` enum extended in the migration |
| P0-4 | ⚠️ Manual | `.env.example` documents it; **set `VITE_USE_MOCKS=false` in Vercel** |
| P0-5 | ✅ Code done | Online payment UI hidden for v1; `payments` table + RLS added; offline settlement only |
| P1-1 | ✅ Mitigated | Migration is idempotent, ordered last, self-verifying (query at file end) |
| P1-2 | ✅ Code done | `ai-assist` + `send-push` edge functions written (need secrets, see below) |
| P1-3 | ✅ Code done | `accept_proposal()` atomic RPC; client switched to it |
| P1-4 | ✅ Code done | `confirmAgreement` now uses the post-update row (race fixed) |
| P2-1 | ✅ Code done | `store.tsx` writes now await + revert + error toast |
| P2-2 | ✅ Code done | Session validated on mount; stale mirrored token cleared |
| P2-3 | ✅ Code done | OTP routing uses the profile-based guard; demo copy corrected |
| P2-4 | ✅ Code done | `get_tracking()` RPC; TrackingPage no longer reads `agreements` directly |
| P3-1 | ✅ Code done | `config.ts` rebranded to STRYT |
| P3-2 | ⚠️ Manual | Move `SUPABASE_AT` out of `.env` into CI/host secrets |
| P3-3 | ✅ Code done | `rating_avg` widened to `numeric(3,2)` in the migration |

### 3 manual steps to finish launch
1. **Apply the migration:** run [supabase/migration_launch_hardening.sql](supabase/migration_launch_hardening.sql) on your Supabase project (after the existing migrations). Then run the verification query at the bottom of that file.
2. **Set host env:** in Vercel, set `VITE_USE_MOCKS=false` and the `VITE_SUPABASE_*` vars; redeploy.
3. **Deploy + configure functions:** `supabase functions deploy ai-assist send-push`, then `supabase secrets set GEMINI_API_KEY=… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:team@stryt.app`.

> After applying, re-run the cross-user test in the checklist (User B must not be able to mutate User A's agreement or read their messages).

---

## How to read this
Each item has **Severity · What · Where · Impact · Fix**. Severities:

| Sev | Meaning |
|-----|---------|
| **P0** | Launch blocker. Do **not** onboard real users until fixed. Security, money, or core flow broken. |
| **P1** | Critical. Will cause real customer harm or data loss soon after launch. |
| **P2** | Important. Data integrity / trust / UX correctness. |
| **P3** | Polish / hygiene. |

**Counts:** P0 × 5 · P1 × 4 · P2 × 4 · P3 × 3

---

## P0 — Launch Blockers

### P0-1 · Any logged-in user can edit or delete ANY agreement (broken access control on money records)
- **Where:** [supabase/rls.sql:57-58](supabase/rls.sql#L57-L58) defines `write_agreements ... for all using (auth.role() = 'authenticated')`. [supabase/migration_writes.sql:50-58](supabase/migration_writes.sql#L50-L58) drops and replaces the permissive write policies for businesses/providers/requests/proposals/users — **but never touches `agreements`**. No owner-scoped agreement policy exists anywhere.
- **Impact:** `agreements` holds `agreed_price`, `status`, `requester_confirmed`, `responder_confirmed`, `payment_mode`. Because the policy only checks "is authenticated," **any signed-in user can UPDATE or DELETE any other users' agreement** — change the agreed price, mark a deal complete, flip confirmation flags, or release escrow (see P0-5). This is direct financial fraud / tampering. App code like [`completeAgreement`](src/services/requestService.ts#L334) and `markDepositPaid` run `.update().eq("id", id)` with **no ownership check in code** — they rely entirely on this (broken) RLS.
- **Fix:** Drop `write_agreements`; add owner-scoped policies:
  ```sql
  drop policy if exists write_agreements on public.agreements;
  create policy upd_agreements on public.agreements for update
    using  (auth.uid()::text in (requester_user_id, responder_user_id))
    with check (auth.uid()::text in (requester_user_id, responder_user_id));
  -- agreements should be created by the request owner via a SECURITY DEFINER RPC (see P1-3),
  -- not direct insert. Do NOT grant a blanket delete.
  ```
  Also add server-side guards so price/status transitions can't be set to arbitrary values by either party.

### P0-2 · Private chat tables are not in version control and have no RLS in the repo
- **Where:** `chatService` queries `.from("conversations")` and `.from("messages")` ([src/services/chatService.ts](src/services/chatService.ts#L48)), and [supabase/migration_chat_subject.sql](supabase/migration_chat_subject.sql) *alters* `conversations` — but there is **no `CREATE TABLE` for `conversations`/`messages` and no `enable row level security` / `create policy` for them anywhere in `supabase/`**.
- **Impact:** The tables were created out-of-band (dashboard), so the schema is **not reproducible** and, critically, **RLS state is unverifiable**. With Supabase, a table exposed through PostgREST **without RLS enabled is fully readable/writable with the public anon key** (which ships in the JS bundle). If RLS is not correctly enabled in prod, **every private message between every user is world-readable** — a catastrophic privacy breach and likely a legal/compliance problem.
- **Fix:** Add a checked-in migration that creates both tables and enables participant-scoped RLS, e.g.:
  ```sql
  alter table public.conversations enable row level security;
  alter table public.messages      enable row level security;
  create policy conv_members on public.conversations for select
    using (auth.uid()::text in (participant_a, participant_b));
  create policy msg_members on public.messages for all
    using (exists (select 1 from public.conversations c
                   where c.id = conversation_id
                     and auth.uid()::text in (c.participant_a, c.participant_b)))
    with check (sender_id = auth.uid()::text);
  ```
  Then **verify in the live DB** that RLS is `enabled` on both tables before any real users sign up.

### P0-3 · Core transaction flow throws a DB error past "confirm" (agreement status enum mismatch)
- **Where:** Schema enum is `agreement_status as enum ('PENDING','ACTIVE','COMPLETED','CANCELLED','DISPUTED')` ([schema.sql:24](supabase/schema.sql#L24)). No migration extends it. But the code writes values **not in the enum**:
  - `markDepositPaid` → `"DEPOSIT_PAID"` ([requestService.ts:350](src/services/requestService.ts#L350))
  - `startWork` → `"IN_PROGRESS"` ([requestService.ts:357](src/services/requestService.ts#L357))
  - `submitForReview` → `"REVIEW"` ([requestService.ts:362](src/services/requestService.ts#L362))
  These are wired to live buttons in [AgreementScreen.tsx:369,385,408](src/screens/requests/AgreementScreen.tsx#L369) on the **normal offline flow**.
- **Impact:** As soon as two parties confirm a deal and try to progress it ("Start work", "Mark deposit paid", "Send for review"), Postgres rejects the update with `invalid input value for enum agreement_status`. **The heart of the marketplace — completing a real job — is broken for every transaction.** `types.ts` (`AgreementStatus`) lists these states but the DB never got them.
- **Fix:**
  ```sql
  alter type agreement_status add value if not exists 'AGREED';
  alter type agreement_status add value if not exists 'DEPOSIT_PAID';
  alter type agreement_status add value if not exists 'IN_PROGRESS';
  alter type agreement_status add value if not exists 'REVIEW';
  ```
  (Enum `add value` can't run inside a transaction block with later use of the value — run as its own migration step.) Reconcile `types.ts` ↔ DB enum so they can't drift again.

### P0-4 · Committed `.env` ships `VITE_USE_MOCKS=true` → broken hybrid in production
- **Where:** [.env](.env) sets `VITE_USE_MOCKS=true`. Services (`requestService`, `businessService`, etc.) **do not branch on this flag — they always call Supabase** — but [store.tsx:189](src/store.tsx#L189) (`if (config.useMocks) return;`) disables the `onAuthStateChange` listener and `hydratePersonalData()`, and [uploadService](src/services/uploadService.ts) returns fake upload URLs.
- **Impact:** If this `.env` is used for a real build, the app is in a **half-live state**: reads/writes hit the real DB, but (a) **Google/email-magic-link sign-in never mirrors its session or runs `ensureProfile`** → those users are effectively broken, (b) **bookmarks, follows, lists, me-toos, vouches, saved coupons, unread counts never hydrate** from the DB, and (c) **uploaded photos don't persist**. This is silent, confusing breakage for the first real customers.
- **Fix:** Set `VITE_USE_MOCKS=false` in the production environment and **smoke-test the real path end to end** (OAuth login, post a request, upload a photo, bookmark). Longer term, remove the half-wired flag or make all services honor it consistently.

### P0-5 · Online payments & escrow are non-functional / unverifiable
- **Where:** `paymentService` calls edge functions `create-razorpay-order` and `verify-razorpay-payment` ([paymentService.ts:9,22](src/services/paymentService.ts#L9)) — **neither exists in `supabase/functions/`** (only `sos-alert`, `verify-aadhaar`, `verify-pan` are present). `completeAgreement` updates a `payments` table (`escrow_status` HELD→RELEASED, [requestService.ts:340-343](src/services/requestService.ts#L340-L343)) — **no `payments` table exists in version control and it has no RLS in the repo.**
- **Impact:** Any online payment attempt ([AgreementScreen.tsx:264-276](src/screens/requests/AgreementScreen.tsx#L264)) fails outright. Escrow release writes to a table that is unversioned and (like P0-2) potentially un-RLS'd — money records possibly exposed/writable via the anon key.
- **Fix:** Either (a) implement + deploy `create-razorpay-order` and `verify-razorpay-payment` (server-side signature verification) and add a checked-in `payments` table **with owner-scoped RLS**, or (b) **hide the online-payment UI** and ship offline-settlement-only for v1 (the default `payment_mode` is already `OFFLINE`).

---

## P1 — Critical

### P1-1 · All RLS security hinges on `migration_writes.sql` being applied (no single source of truth)
- **Where:** [rls.sql](supabase/rls.sql) installs deliberately permissive "any authenticated user can write" starter policies; [migration_writes.sql](supabase/migration_writes.sql) is what tightens them to owner-scoped. The repo has 10+ loose migration files and no consolidated, ordered "apply this exact list" script that's verified.
- **Impact:** A fresh or re-provisioned environment that runs `schema.sql` + `rls.sql` but **misses `migration_writes.sql`** leaves **every core table wide open to any logged-in user**. There's no automated check that prod is in the tightened state.
- **Fix:** Provide one ordered migration runner (or adopt `supabase/migrations/` properly) and add a startup/CI assertion that the owner-scoped policies (e.g. `upd_businesses`, `upd_requests`, `upd_agreements`) exist before allowing traffic.

### P1-2 · Missing edge functions: push notifications and AI assist are dead
- **Where:** Client references `functions/v1/send-push` and `functions/v1/ai-assist` ([aiService.ts:7](src/services/aiService.ts#L7); push registration in [pushNotifications.ts](src/lib/pushNotifications.ts)) — neither function exists in `supabase/functions/`.
- **Impact:** Push notifications never send (engagement/retention feature silently dead). AI price-suggestion and request auto-categorize always fail — they fail *gracefully* (`try/catch → null`), so the UI just never shows the value it advertises.
- **Fix:** Implement/deploy both functions, or remove the UI affordances that imply they work (e.g. the AI mic/price hints) until they're live.

### P1-3 · `acceptProposal` performs 4 writes with no transaction (can corrupt deal state)
- **Where:** [requestService.ts:200-250](src/services/requestService.ts#L200-L250): accept proposal → fetch request → insert agreement → set request `IN_PROGRESS` → reject sibling proposals, as four separate awaited calls.
- **Impact:** A failure or disconnect midway leaves inconsistent state: a proposal marked `ACCEPTED` with **no agreement row**, or an agreement created but other proposals never rejected (so two providers both think they won). No rollback.
- **Fix:** Move the whole accept flow into a single `SECURITY DEFINER` Postgres function (RPC) that runs atomically and enforces that only the **request owner** can accept.

### P1-4 · `confirmAgreement` has a TOCTOU race — deals can get stuck in PENDING
- **Where:** [requestService.ts:302-332](src/services/requestService.ts#L302-L332): reads the row, updates its own side, then decides "both confirmed → ACTIVE" using the **stale pre-update read**.
- **Impact:** If both parties confirm at nearly the same time, each read sees the other as not-yet-confirmed, so **neither transition fires** and the agreement stays `PENDING` forever (can't proceed). Conversely the non-atomic check can misfire.
- **Fix:** Do it in one statement / RPC: `update ... set <side>_confirmed = true` then set `status='ACTIVE'` in the same function using the **returned** post-update row (`where requester_confirmed and responder_confirmed`).

---

## P2 — Important

### P2-1 · Optimistic writes in `store.tsx` are fire-and-forget → silent data loss
- **Where:** [store.tsx](src/store.tsx) — bookmarks ([L313-L325](src/store.tsx#L313)), follows ([L343-L355](src/store.tsx#L343)), coupons, stamps, endorse/vouch, `addToList` all do `void getSupabase().from(...).upsert(...)` with **no `await` and no error handling**, while showing a success toast immediately.
- **Impact:** If the DB write fails (offline, RLS denial, transient error), the user sees "Saved ✓" but the change **vanishes on next refresh**. Erodes trust; hard to debug.
- **Fix:** `await` the write and revert the optimistic state + show an error toast on failure.

### P2-2 · `isAuthed` is seeded from a stale localStorage token
- **Where:** [store.tsx:186](src/store.tsx#L186): `useState(tokenStore.isAuthed)` reads the mirrored `naya_access` key. With `useMocks=true` the `onAuthStateChange` correction is disabled (P0-4).
- **Impact:** A stale/expired mirrored token makes the app briefly (or, in the hybrid mode, persistently) believe the user is authed, showing protected UI that then 401s on every call.
- **Fix:** Derive `isAuthed` from the live Supabase session (`getSession()` / `onAuthStateChange`) rather than the mirrored token; treat `tokenStore` as a cache only.

### P2-3 · OTP screen claims "demo mode" while calling the real backend
- **Where:** [OtpVerify.tsx](src/screens/auth/OtpVerify.tsx) shows "Demo mode: enter any 4 digits" when `config.useMocks`, but `authService.verifyOtp` always calls real Supabase. New-vs-returning detection uses `created_at < 120s` ([OtpVerify.tsx:57-60](src/screens/auth/OtpVerify.tsx#L57)).
- **Impact:** Misleading copy during real testing; the 120-second heuristic misroutes onboarding for slow SMS delivery or clock skew.
- **Fix:** Gate the demo hint on a true mock path; base new-user routing on a real signal (e.g. profile completeness) not a timestamp window.

### P2-4 · `tracking_tokens` are world-readable
- **Where:** `tt_read ... for select using (true)` (trust-layer migration). Live-location tracking links ([AgreementScreen.tsx:567](src/screens/requests/AgreementScreen.tsx#L567), `generateTrackingToken`).
- **Impact:** Tokens gate live provider/customer location sharing. World-readable `select` means anyone who obtains/guesses a token row can read tracking context; combined with predictable ids this risks **live-location exposure**.
- **Fix:** Scope token reads to the agreement's participants, or require the opaque token as a filter via a `SECURITY DEFINER` RPC and keep the table itself non-selectable.

---

## P3 — Polish / Hygiene

### P3-1 · Leftover legacy branding & dead backend URL
- **Where:** [config.ts:3,6](src/config.ts#L3-L6): `apiUrl` defaults to `https://api.naya.app/v1` and `appName: "Naya"`. The legacy `apiClient`/`tryRefresh` path ([apiClient.ts:110](src/lib/apiClient.ts#L110)) targets that domain.
- **Impact:** Cosmetic/branding leak; if the legacy `apiRequest` path is ever hit it fails against a non-existent host.
- **Fix:** Update `appName` to "STRYT", remove/replace the dead `apiUrl` default, or delete the unused legacy client.

### P3-2 · Powerful `SUPABASE_AT` token sits in `.env`
- **Where:** [.env](.env) contains `SUPABASE_AT` (a 44-char Supabase access/management token). `.env` is gitignored (good) so not committed.
- **Impact:** A management token in a frontend env file is high-blast-radius if the file ever leaks (screenshare, backup, CI artifact). It does not belong with `VITE_*` client vars.
- **Fix:** Move it to CI/server secrets only; never colocate management tokens with client build vars.

### P3-3 · `rating_avg numeric(2,1)` is brittle
- **Where:** [schema.sql:40](supabase/schema.sql#L40) (and businesses/providers). Precision 2 / scale 1 caps at 9.9 and requires 1-decimal rounding.
- **Impact:** Fine for a 0–5 scale today, but any averaging that yields >1 decimal place will error unless rounded; no headroom.
- **Fix:** Round on write, or widen to `numeric(3,2)`.

---

## Pre-launch checklist (minimum to onboard real customers)
- [ ] **P0-1** Owner-scoped RLS on `agreements` (drop the `auth.role()` write policy).
- [ ] **P0-2** `conversations`/`messages` created in a checked-in migration **with RLS verified enabled in prod**.
- [ ] **P0-3** Extend `agreement_status` enum (`AGREED`, `DEPOSIT_PAID`, `IN_PROGRESS`, `REVIEW`).
- [ ] **P0-4** `VITE_USE_MOCKS=false` in prod + full real-path smoke test.
- [ ] **P0-5** Online payment/escrow implemented & RLS'd — **or** hidden for v1 (offline only).
- [ ] **P1-1** One verified migration order; assert tightened policies exist before traffic.
- [ ] Re-run the Playwright audit (`npm run audit`) against a real Supabase project, signed in as two different users, and confirm User B cannot mutate User A's agreement/business/request/messages.

> Note on method: RLS findings are based on the SQL **in this repo**. Items P0-2 and P0-5 specifically flag schema that lives outside version control — these **must be verified against the live database**, because the repo cannot prove they're safe.
