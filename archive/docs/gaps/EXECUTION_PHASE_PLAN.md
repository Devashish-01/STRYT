# STRYT — Fix Execution Phase Plan

**What this is:** every flow in [`MASTER_FLOW_AUDIT_TRACKER.md`](./MASTER_FLOW_AUDIT_TRACKER.md) is now audited (52/52). This document orders what's still *open* — roughly 360 individual findings across 44 flows — into an execution sequence. Six flows are fully resolved and excluded: `APPOINTMENT_BOOKING`, `BUSINESS_ONBOARDING`, `COMMUNITY_POSTS`, `CUSTOMER_ONBOARDING`, `PROVIDER_ONBOARDING`, `TEAM_ACCESS`.

**How to read severity:** every gap log tags findings 🔴 P0 / 🟠 P1 / 🟡 P2 / 🟢 P3. Rough counts across the 44 open flows: **~85 P0, ~115 P1, ~115 P2, ~35 P3**.

---

## Read this before trusting anything below

1. **A logged finding is a claim, not a fact.** This session has already found six documented gaps that didn't survive checking against the live code or database — one described a symptom worse than what was actually wrong, two cited schema columns that don't exist, one cited a constraint that was never added. Every item below gets re-verified against live code/DB before a fix is written, the same way Phases 1–3 were done. Expect the real count to move in both directions as that happens.
2. **🟢 #fff findings (26 across 15 files) are not bugs — they're a pending decision.** `#fff`/pure-grayscale hex is *deliberately whitelisted* in `check-hardcoded-colors.js` ("no token equivalent, acceptable in SVG fills / rgba base values"). Fixing all 26 means overturning that whitelist choice, which is yours to make, not mine to assume. Flagged in Phase 4 below; not touched until you decide.
3. **Realtime/GPS bugs can only be half-verified from a terminal.** I can confirm the code is *structurally* correct (right table, right filter, subscription doesn't churn) but not that a real phone sees the update in real time. Every phase touching `useQueryWithRealtime`, live GPS, or push notifications needs a human pass on a device before being trusted.
4. **Some items are product decisions, not code fixes** — e.g. `AGREEMENT_NEGOTIATION` A1 assumed `agreements` has columns it doesn't have; the real fix requires deciding how team-submitted proposals should attribute ownership. These get flagged, not silently resolved by guessing.
5. **Migrations are applied only with your explicit go-ahead**, verified live in a rolled-back transaction first. Nothing gets committed or pushed without you asking.

---

## Already done (for context — not repeated below)

| Phase | What | Status |
|---|---|---|
| 1 | DB integrity: 5 anon RLS policy aborts (`20260937`), queue self-payment exploit (`20260938`) | **Applied to production, committed** |
| 2 | Shared client infra: browsing-writes-profile bug (map recenter, category radius), ghost requests at 0,0, `useQueryWithRealtime` reconnect-per-render | **Committed** |
| 3 | Guest funnel: can't set location as guest, stuck on Pune default, conversion destination discarded at signup | **Committed** |

---

## Phase 4 — Security-critical, pulled forward regardless of domain number

These are the same *class* of severity as Phase 1 (auth/integrity bypass, not UI polish) and shouldn't wait for domain-sequential order just because they live in Domain 11.

| Finding | File:ID | Why it jumps the queue |
|---|---|---|
| Business/provider PIN gate has no server session — direct URL nav bypasses it entirely | `SECURITY_SETTINGS:SEC-1`, `ROLE_SWITCHER:ROLE-2` (same bug, two audits) | `verify_business_password` returns a bare boolean with no session grant. This is a real access-control bypass, not a UX gap. |
| Shared rate limiter locks the owner out on a staff member's failed guesses | `SECURITY_SETTINGS:SEC-2` | Availability/DoS on the owner's own business. |
| Editing phone bypasses Supabase Auth OTP, can desync login | `PROFILE_PRIVACY:PROF-1` | Account-hijack shaped; touches `auth.users` identity, not just a profile field. |
| `get_public_profile` omits `alias`, leaking real names publicly | `PROFILE_PRIVACY:PROF-2` | Direct privacy leak — the whole point of the alias system. |
| Reports on `USER`/`PROPOSAL`/`RATING` no-op while claiming "action taken" | `ADMIN_MODERATION:MOD-2` | Abuse reports silently do nothing; the UI lies about it. |
| Moderation actions bypass the audit log | `ADMIN_MODERATION:MOD-3` | Insider-abuse / compliance exposure. |
| `activeRole`/`activeContext` can diverge, corrupting downstream identity | `ROLE_SWITCHER:ROLE-1` | Same state-integrity class as the RLS work — wrong identity flows into support tooling and headers. |
| Server trigger never enforces `blocked_slots` | `SLOT_BLOCKING:S1` *(carried over from Domain 2, confirmed real in Phase 1, not yet fixed)* | Same shape as `enforce_slot_capacity` — a booking gate that silently doesn't gate. |
| `agreements` has no business/team linkage — owners locked out of agreements their staff negotiated | `AGREEMENT_NEGOTIATION:A1` *(carried over, investigated, premise partly wrong)* | **Decision needed, not a fix**: the doc assumed columns (`responder_type`, `responder_entity_id`) that don't exist. Real options: add them, or join through `proposals`. Flagging for your call before Phase 8. |
| **⏸ Pending your decision:** whitelist `#fff` as a real token, or start fixing 26 findings across 15 files | *(cross-cutting, see caveat #2 above)* | Not scheduled until you decide which side of this it's on. |

---

## Phase 5 — Cross-cutting patterns (fix the pattern once, close many findings)

Found empirically by scanning every open finding's title across all 44 files for repeated shapes — not guessed. Each cluster becomes one piece of work (a shared helper, a systematic sweep) rather than N separate fixes.

| Cluster | Count | Representative IDs | The fix |
|---|---|---|---|
| Swallowed/silent errors (`.catch(() => {})`, discarded `{ error }`) | 21 | `ADMIN_MODERATION:MOD-1`, `AGREEMENT_NEGOTIATION:A7`, `ASK_REQUEST_CREATION:R3`, `VOUCHES_TRUST:VOUCH-3`, `CATEGORY_DIRECTORY:C5`… | Same pattern `useQuery` already fixed for fetches (surface via `showToast`) — sweep the write-side call sites. |
| Missing cache invalidation after mutation | 9 | `BROADCAST_RADIUS:RAD-1`, `PROVIDER_CATALOG:PCAT-1`, `PROVIDER_MONEY:MONEY-4`, `PROVIDER_PORTFOLIO:PPORT-3`… | `invalidateQueryCache`/`bustXCache` already exist as the pattern (used correctly elsewhere) — just missing at these mutation sites. |
| No confirmation before a destructive tap | 7 | `CUSTOMER_QUEUE:Q7`, `PROVIDER_PORTFOLIO:PPORT-2`, `BUSINESS_PORTFOLIO:PORT-2`, `SECURITY_SETTINGS:SEC-3`… | One shared confirm-sheet pattern (already exists in several screens), applied at each site. |
| Unfiltered/wildcard realtime subscription wakes every client on any row change | 2 confirmed | `HOME_FEED:H3`, `LOCATION_SHARING:LOC-7` | Add a row filter (`filter:` param `useQueryWithRealtime` already supports) — **distinct from** the reconnect-per-render bug Phase 2 already fixed; this is a missing filter, not closure churn. |
| Realtime subscription missing entirely / subscribed to the wrong table | 4 | `CUSTOMER_DELIVERY_TRACKING:T1` (no subscription, one-time fetch only), `MERCHANT_DELIVERY_DISPATCH:D3` (batched runs stream to `delivery_batches`, screen only listens to `appointment_deliveries`), `MERCHANT_QUEUE:M5` (ignores `queue_settings`), `CATALOG_MANAGEMENT` (recommends adding realtime) | Each needs a subscription *added*, not stabilized — genuinely separate work from the render-loop fix. |
| Cash/in-person payment has no owner-side "mark received" action | 3 | `BUSINESS_APPOINTMENTS:B2`, `PROVIDER_JOBS:P3`, `PROVIDER_MONEY:MONEY-3` | One RPC extension (`appointment_record_walk_in_payment` currently blocks non-walk-in bookings) fixes all three call sites. |
| Walk-in phone trapped as plain text, not tappable | 2 | `BUSINESS_APPOINTMENTS:B3`, `PROVIDER_JOBS:P6` | Same `tel:` link fix, two consoles. |
| Fragile ad-hoc regex parsing a time-slot label | 2 | `BUSINESS_APPOINTMENTS:B4`, `PROVIDER_JOBS:P4` | Shared parsing helper instead of two divergent regexes. |
| Unbounded party size | 4 | `CUSTOMER_QUEUE:Q5`, `MERCHANT_QUEUE:M8`, `MY_APPOINTMENTS:A4`, `MY_APPOINTMENTS:A9` | One bound, applied everywhere party size is accepted. |
| Missing 1:1 chat/call shortcut on a booking card | 3 | `BUSINESS_APPOINTMENTS:B6`, `MERCHANT_QUEUE:M6`, `PROVIDER_JOBS:P7` | Same card-action pattern `CommentRow`/queue cards already use elsewhere. |
| Delegate/team-scope gap (an action available to the owner silently unavailable to a scoped team member) | 6 | `BULK_DEALS:BLK-3`, `MERCHANT_DELIVERY_DISPATCH:D6`, `ROLE_SWITCHER:ROLE-4`, `STORE_HOURS:HRS-6`… | Each needs its own `has_business_scope` check added — same fix shape, different call sites. |

---

## Phase 6 — Finish Domains 0–4 (the rest of what Phases 1–3 didn't close)

Everything left in the five logs Phases 1–3 already opened, minus whatever Phase 4/5 above already covers.

- `CUSTOMER_QUEUE` — Q2 (unfiltered realtime → **Phase 5**), Q3, Q4, Q6, Q9, Q10 (`#fff` → **Phase 4 decision**)
- `MERCHANT_QUEUE` — M1, M2 (race condition), M3, M4, M7, M9 (`#fff`)
- `MY_APPOINTMENTS` — A1, A2, A3, A5, A6, A7 (→ **Phase 5** swallowed-error), A10 (`#fff`)
- `BUSINESS_APPOINTMENTS` — B1, B5 (`#fff`)
- `PROVIDER_JOBS` — P1, P2, P5 (`#fff`)
- `GLOBAL_SEARCH` — the full flow, including S1 (no spatial bounds/ordering — deferred here from Phase 1 since it's a client-service fix, not SQL)
- `HOME_FEED` — remainder (minus H3 → **Phase 5**)
- `USER_SUBMITTED_PLACES` — full flow, untouched so far
- `GUEST_BROWSING` — G4–G7 (conversion-hook UX), G8 (`#fff`)
- `ASK_REQUEST_CREATION` — R2, R4 (`#fff`), R5–R8 (R1 already fixed Phase 2; R3 → Phase 5)
- `SELLER_PROPOSALS` — full flow, untouched so far

## Phase 7 — Domain 5 (Delivery) + Domain 6 (Chat)

Paired because both lean on the realtime patterns Phase 5 just standardized (GPS streaming, message delivery) — doing them right after means applying a fresh pattern instead of a stale one.

`MERCHANT_DELIVERY_DISPATCH`, `DELIVERY_RIDER_CONSOLE`, `CUSTOMER_DELIVERY_TRACKING`, `CHAT_MESSAGING` — minus D3/T1 (→ Phase 5) and any `#fff` (→ Phase 4 decision).

## Phase 8 — Domain 7 remainder: Merchant console (9 flows)

`CATALOG_MANAGEMENT`, `STORE_HOURS`, `BULK_DEALS`, `STOREFRONT_BRANDING`, `BUSINESS_PORTFOLIO`, `STOREFRONT_QNA`, `INVENTORY_ALERTS`, `BROADCAST_RADIUS`, `BUSINESS_VERIFICATION` (7.1 Team Access already done). Priority within the phase: `BULK_DEALS` BLK-1/BLK-2 first (no-deposit deals never mint claim passes; deleting a campaign wipes customers' redeemed QR passes — both are trust/revenue bugs, not polish).

## Phase 9 — Domain 8: Provider console (6 flows)

`PROVIDER_CATALOG`, `PROVIDER_AVAILABILITY`, `PROVIDER_PORTFOLIO`, `PROVIDER_LEADS`, `PROVIDER_MONEY`, `PROVIDER_VERIFICATION`. Largely mirrors Domain 7's shape (catalog cache, portfolio delete-confirm, cash payment, verification) — process built in Phase 8 should make this faster, not from-scratch.

## Phase 10 — Domain 9 remainder + Domain 10 (Safety)

`CUSTOMER_RATINGS`, `REVIEWS_MANAGER`, `VOUCHES_TRUST`, `BOOKMARKS_LISTS` (9.1 Community Posts already done); `EMERGENCY_CONTACTS`, `LOCATION_SHARING` (LOC-7 → Phase 5).

## Phase 11 — Domain 11 remainder

`NOTIFICATION_CENTER`, `ACCOUNT_DELETION`, `ADMIN_MODERATION` remainder (MOD-2/MOD-3 already pulled into Phase 4). `ACCOUNT_DELETION` DEL-1 (storefronts stay live during the 30-day deletion grace period) and DEL-2 (purge Edge Function crashes on an un-cascaded FK, bricking the delete) are worth flagging here even at "last phase" — they're P0s that could also justify a Phase-4-style pull-forward if you'd rather not wait.

---

## Open question for you: does Phase 4's pull-forward list look right?

I moved 9 items ahead of pure domain order because they're security/integrity-shaped rather than UX-shaped. That's a judgment call, not a mechanical one — if you'd rather I stick to strict domain order (0→11) instead, say so and I'll flatten Phase 4 back into its natural domain slots.

---

## On using another model/tool (Gemini 3 + Antigravity) for this backlog

Asked directly: could Gemini (high reasoning effort) via Google's Antigravity work through this same list solo?

**What I can say with confidence:** Antigravity is Google's real agentic coding surface, built around Gemini 3, in the same category as this tool — shell access, file edits, browser control, multi-agent orchestration. There's no capability-class reason a frontier agentic model couldn't attempt the same loop I've been running: read code, form a hypothesis, verify it empirically against the live DB in a rolled-back transaction, write a fix, run the full build (not just a type-checker), and iterate. I'm not aware of a confirmed model designation exactly matching "Gemini 3.8" — "high" more likely names a reasoning-effort tier than a version number, the same way this conversation's "high/medium/low" would.

**What I can't tell you:** how it actually performs on *this* repository, because I haven't run it here and have no tool in this session to do so. That would be a claim about a product I haven't observed, and I'd rather say that plainly than fabricate a benchmark.

**What actually determines success, regardless of which model runs it:**
- Verifying claims against the live database/code before trusting them — audits in this very backlog have already been wrong six times.
- Running the *actual* build pipeline, not a proxy for it — my own worst mistake this session was checking `tsc --noEmit` for hours and never once running `npm run build`, which starts with a colour-token gate `tsc` doesn't know exists.
- Stopping for a human on anything irreversible — applying a migration, pushing, committing, deleting — the same gate you've held me to all session.
- Attention discipline over a long run: my two `git add -A` mistakes today both happened late in long sessions, on otherwise-easy steps. That's a risk for any agent, not a Claude-specific one or a Gemini-specific one — it's a property of long autonomous runs in general.
- Knowing when something is a design decision, not a bug — `#fff`, the `agreements` schema question, the rate-limiter design — no model should resolve those by guessing.

**If you want to try it:** the safest setup is a separate git branch or worktree, so its output can be diffed against mine before anything merges, rather than two agents editing the same tree at once. Whether it can, "in the end, one by one or in groups," close all 360 — I'd trust that only after seeing it actually run here, the same way I wouldn't trust my own claim of "all fixed" without the rolled-back-transaction proof each phase above has required.
