# Flow-Completeness Audit — 2026-09-05

**Purpose:** a systematic sweep for one specific class of bug, triggered by finding
it three times in the bulk-buying pledge flow the same day: an action succeeds at
the database level, but the surrounding UI never fully connects it to the rest of
the product. Not a security review, not a typo/polish pass, not a performance
audit — those are separate, already-covered categories. This is specifically:
does every flow in `docs/launch/workflows/01`–`23` actually connect all the way
through, end to end, for both parties?

**Method:** 8 full-stack investigation agents ran in parallel, each covering 2–3
workflow files, tracing screen → service call → RPC/migration → notification →
wherever the result should surface elsewhere in the app. Every finding below is
cited to exact file(s)/line(s)/function(s) — investigators were instructed to
flag uncertainty explicitly rather than assert a guess, and several did (marked
**unconfirmed**/**plausible** below).

**The five gap categories hunted for:**
1. An action succeeds but gives no lasting confirmation (toast-only, ~2s, no persistent state).
2. Something a user did/has is invisible where it should logically surface (a dashboard, Home's "Your day" rail, a natural landing screen).
3. A completed action doesn't notify the other party.
4. Stale state after an action — a screen isn't refetched after a related mutation.
5. Dead ends — no way forward, or a built feature with zero entry point.

---

## Read this first — the four most severe findings

### 1. ~~The legacy group-buy pool's entire join/leave/claim path is gone, not just creation~~ — confirmed by design, 2026-09-06

**Resolved, not a bug.** Asked directly: total removal (including access to
pools that existed before this cycle) was confirmed as the actual intent, not
scope creep. No fix needed — closing this out rather than restoring anything.
Original finding kept below for the record.

Earlier this session, customer-initiated group-buy **creation** was deliberately
removed per an explicit user instruction ("delete it permanently"). The removal
went further than intended: `requestService.joinGroupBuy`, `leaveGroupBuy`,
`groupBuyPledges`, `enrichGroupBuyPledges`, and `issueGroupBuyTokens` were deleted
outright (not just their creation-time call sites), and every UI surface for an
**existing** pool was deleted alongside them — `CommunityHub`'s "Group buys"
section, `CommunityActivity`'s "your group buys" section, `RequestCard`'s group-buy
badge/progress bar, and the Explore "group" filter chip. `requestService.meToo()`
— the function kept specifically to preserve this — now has **zero call sites**
anywhere in `src/`. `group_buy_issue_tokens` (mints claim passes on proposal
accept) also has zero call sites. Net effect: anyone with a stake in a pool made
before this cycle has no way to view, join, leave, or claim from it anywhere in
the app. Full detail: [Workflow 07](#07--customer-legacy-group-buys).

### 2. ~~Every share link, QR code, and the live tracking link resolves to `https://localhost` on native builds~~ — fixed, 2026-09-07

**Fixed.** See gap log `#7`. Turned out to be a 2-line fix, not 10 — `ShareCard`
is the one shared component every usage renders, so fixing its single
`shareCapabilities()` call site (plus `AgreementScreen.tsx`'s separate
tracking-link builder) covered everything. Original finding kept below.

`shareUrl`/`postShareUrl` (`src/lib/share.ts`, `src/lib/postInteractions.ts`) fall
back to `window.location.origin` when no origin is passed — and none of `ShareCard`'s
10 call sites, nor `AgreementScreen.tsx:724`'s delivery-tracking link builder, ever
pass one. Capacitor's WebView origin is `https://localhost` (`capacitor.config.ts`
has no custom `hostname`), so every business/provider/post/person/campaign share,
every printed QR artifact (counter-stand, lost-found flyer, campaign poster), and
the live agreement/delivery tracking link a customer explicitly shares via
WhatsApp all produce a dead link the moment anyone other than the sharer opens it
on the Android app. Full detail: [Workflow 22](#22--android-platform-checks).

### 3. ~~The business/provider side of the app is notified of almost nothing a customer does to them~~ — fixed, 2026-09-06

**Fixed.** See gap log `#6` for the full breakdown — 4 new migrations
(`20260909`–`20260912`) plus 3 admin service files now cover all 18 confirmed
instances (deduplicated to ~15 fixes, since a couple of workflow sections
were describing the same RPC from two angles). Original finding kept below.

This pattern repeated across nearly every workflow that has two parties: a
customer pledges into a campaign, claims a deposit, asks a Q&A question, leaves a
review, or a business rejects/revokes something — and the other party found out
only by manually reopening the relevant screen. Individually these looked like
small omissions; together they were a systemic gap in the notification layer's
coverage of the "customer → business" and "admin → user" directions specifically
(the reverse direction — business/admin notifying a customer — was generally well
covered). See the per-workflow sections below (04, 08, 09, 11, 12, 16, 17, 18, 21)
for the full list.

### 4. ~~Rejected businesses have no way back in, and their status is invisible on their own dashboard~~ — fixed, 2026-09-06

**Fixed.** See gap log `#6`. `ManageHub.tsx`'s badge now reflects real
`status`; `AccountStatusBanner.tsx` shows the rejection reason and a "Fix &
resubmit" button for businesses (providers left as-is — no confirmed
resubmit flow exists for them, see the gap log entry for why). Original
finding kept below.

`ManageHub.tsx` hardcodes a green "● Live" badge regardless of `business.status` —
a `PENDING`, `REJECTED`, or `SUSPENDED` listing looks identical to an approved one
on the one screen that lists "your businesses." Worse, once the one-time rejection
notification is read, `businessService.submitForReview` (the only way back into
the review queue) has exactly one caller in the whole codebase — the initial
onboarding flow — so a rejected owner has no in-app path to fix and resubmit.
Full detail: [Workflow 13](#13--business-onboarding--verification).

---

## Findings by workflow

### 01 — Auth & Onboarding

**Sign-out doesn't clear most personal-interaction state, leaking into the next account on the same device.**
`store.tsx` `signOut()` resets `user`/`roles`/business-owner fields, but never
touches `useSocialSlice`/`useCommerceSlice` state — `bookmarks`, `follows`,
`lists`, `vouched`, `endorsed`, `savedCoupons`, `meToos` are only overwritten on
the *next* sign-in's `hydratePersonalData()` (an async gap), and `likes`, `votes`,
`viewedStories`, `notifySubs`, `queuesJoined`, `extraStamps` are **never**
hydrated by account at all — they persist across the sign-out/sign-in boundary
indefinitely. *(Category 4.)* Fix direction: reset all social/commerce slice
setters inside `signOut()`; extend `hydratePersonalData()` to cover the
never-hydrated fields.

**"Notify me" (closed business reopens / item restocks) is never fulfilled.**
`BusinessDetail.tsx`'s `toggleNotify(key)` only calls `setNotifySubs(...)` — no
Supabase write at all, unlike every sibling toggle in the same file. No table,
trigger, or cron ever fires either promise. *(Category 1/3.)* Fix direction:
persist server-side with a trigger on `is_open_now`/stock status, or remove the
toggle until built.

### 02 — Customer Discovery

**"Suggest a place" (`/place/new`) has zero entry point anywhere in the app.**
The route and `PlaceRequestForm`/`placesService.request()` all work; nothing in
`MapView`, `PlaceDetail`, Home, or Explore ever navigates there (the only other
usage is a *different* admin-direct-insert codepath). *(Category 5.)* Fix
direction: add a "Suggest a place" affordance on Map/PlaceDetail.

### 03 — Customer Appointments / Booking

**Booking from a business/provider's own detail page doesn't refresh that page's own "Mine" tab or quick-pay banner.**
`BusinessDetail.tsx`'s `AppointmentSheet` `onBooked` callback never calls
`refetchMyAppointments()`/`refetchMyQueues()`; `ProviderDetail.tsx`'s equivalent
sheet usage doesn't even accept an `onBooked` prop. *(Category 4 — same shape as
the already-fixed bulk-pledge bug.)* Fix direction: wire both refetches into
`onBooked` on both screens.

*Everything else checked clean: notification trigger coverage for
create/accept/reject/cancel/no-show/payment-claim/reschedule is thorough and
correctly bidirectional; `MyAppointments`/`MyQueues` are realtime and refetch
correctly; `PaymentSheet`/`QueuePaymentSheet` close-without-paying paths do not
exhibit the bulk-pledge bug (their claim path always calls both `onPaid()` and
`onClose()`).*

### 04 — Customer Requests, Proposals, Agreements

**Counter-offers never notify the other party, and won't appear live even on an already-open page.**
`proposal_submit_counter` RPC inserts into `proposal_counters` with no
notification; `RequestDetail.tsx`'s realtime subscription is scoped to
`proposals` only, which a counter-insert never touches. *(Category 3+4.)*

**Losing proposals are silently rejected with no notice.**
Accepting one proposal auto-rejects every sibling — only the winner is notified;
losers' own "Sent" lists (`BusinessRequests.tsx`, `ProviderFindWork.tsx`) aren't
even realtime, so they stay stale too. *(Category 3+4.)*

**A PENDING agreement that auto-cancels (10-min window) notifies nobody** — while
the same function's 72-hour unpaid-ACTIVE branch, a few lines below, explicitly
does notify both parties. *(Category 1/3.)*

**Rating submission never notifies the person rated** (minor). *(Category 3.)*

Fix direction for all four: add the missing `notifications` inserts, mirroring
the pattern already used elsewhere in the same migrations.

### 05 — Customer Community Posts

**Poll-ended notifications exist in the schema but are never invoked.**
`notify_ended_polls()` is a fully-written sweep function whose own comment says
it needs a schedule — no `pg_cron` registration exists for it (unlike the
sibling `close_stale_queue_tokens`, which is registered), and no client code
calls it opportunistically either. *(Category 3 — built, wired to nothing.)*

**The Bulk-buying tab's "Group buys" section is gone** — see Workflow 07.

### 06 — Customer Bulk-Buying Campaigns

Already fully audited and fixed earlier today (gap log `#0` and `#5`) — pledge
confirmation, Home surfacing, and the RLS/grant bugs behind the false-403s are
resolved. Not re-covered here.

### 07 — Customer: Legacy Group Buys

**Resolved, by design (confirmed 2026-09-06).** The entire existing-pool path —
view, join, leave, claim-pass issuance — is unreachable, not just creation. See
"Read this first" #1 above. Asked directly whether this should be restored:
confirmed total removal was the actual intent. No fix planned.

### 08 — Payments, Wallet, Loyalty

**Agreement payment claim/confirm/reject notifies nobody — and the reject button's own toast falsely claims "requester notified."** A purpose-built RPC for
exactly this (`notify_agreement_confirm`) exists but is never called from
`src/`. *(Category 3, real money involved.)*

**Queue payment claim/confirm/reject also notifies nobody** (realtime keeps an
already-open queue screen in sync, but there's no push/notification at all).
*(Category 3.)*

**Bulk-deal deposit claim doesn't notify the owner** — the mirror-image gap of
confirm/reject, which do notify. *(Category 3.)*

**Loyalty stamps are written to the DB, then permanently invisible.** The only
screens that ever read stamp/loyalty-card state (`LoyaltySetup.tsx`,
`Wallet.tsx`) are deliberately unrouted. *(Category 1+2.)*

**Coupons have zero live entry point.** `toggleCoupon`/`saveCoupon` are called
from exactly one place — the same unrouted `Wallet.tsx`. *(Category 5.)*

### 09 — Chat & Notifications

**Fixed 2026-09-07 — gap log `#7`.**

**"Seen" read receipts don't update live while both users have the thread open simultaneously.** `ChatThread.tsx` fetches the conversation via plain `useQuery`
with no realtime subscription on `conversations` UPDATE events (contrast
`ConversationList.tsx`, which does subscribe and updates live). Self-heals on
next mount. *(Category 4.)*

*Everything else clean: per-hat unread badges correctly scoped; `Notifications.tsx`
fully realtime with correct deep-links; push-tap-to-navigate wired for both
cold-start and foregrounded cases.*

### 10 — Safety & Live Location

**Per-recipient revoke fixed 2026-09-07 — gap log `#7`.** The background-location
error-swallowing finding below was explicitly excluded — needs live-device
testing to confirm before any fix, not fixable blind.

**Removing an emergency contact doesn't revoke their access to an already-active share.** `live_share_recipients` is populated once, at share-start time, from
the contact list at that moment; `removeContact()` never touches it, and no RPC
exists to revoke a single recipient mid-share. There's also no per-contact share
targeting at all — sharing always fans out to the full list. *(Category 5.)*

**Permission revocation mid-share may not be detected — plausible, not confirmed.** Both native and Capacitor location-watcher error callbacks in
`backgroundLocation.ts` silently `return` on error rather than propagating it to
stop the share/update UI state. Not verified against actual OS/plugin behavior on
permission revocation. *(Category 4, if confirmed.)*

### 11 — Profile, Settings, Account

**Location-share deny/revoke never notifies the requester.** `respond_location_share`'s approve branch notifies; its deny branch (`else`) does nothing, and
`revoke` is a bare client-side update with no RPC to notify through at all.
*(Category 3.)*

*Every other flow checked (edit profile, all 7 settings screens, bookmarks,
followers, lists, achievements, deletion) persists correctly server-side with
proper confirmation/empty states.*

### 12 — Roles & Switching

**Fixed — the notification half 2026-09-06 (gap log `#6`), the realtime half 2026-09-07 (gap log `#7`).**

**Revoking or re-scoping a team member's access never notifies them.** Grant and
approve/deny both notify; `revoke_business_session` and
`update_team_member_scopes` — the two changes a team member would most want to
know about — don't, despite `Notifications.tsx` already having a renderer ready
for exactly this type. *(Category 3.)*

**A scoped team member isn't re-validated live while already inside the console on mobile.** `BusinessAccessGuard` only checks access on mount/id-change, not on
an interval or realtime subscription; the one realtime self-heal that exists
(inside `AccountSwitcher`/`RoleSwitcher`) is only persistently mounted on
desktop's always-visible sidebar, not during normal mobile console navigation.
*(Category 4 — contradicts the codebase's own comment asserting this is handled.)*

*Delivery hat invisibility, owner-only PIN-recovery gate, and two-CTA
create-a-business/become-a-provider entry points all confirmed working.*

### 13 — Business Onboarding & Verification

**Manage Hub shows "● Live" regardless of real approval status**, and **no way to resubmit a REJECTED listing exists anywhere in-app.** See "Read this first" #4
above for full detail.

### 14 — Business Catalog, Store, Inventory

**Fixed 2026-09-07 — gap log `#7`.** The freetext holiday-hours list was
removed (never wired to bookability, and never could be without a data-model
change — see `#7` for the reasoning) and replaced with a link to the real
block-date flow.

**"Special / holiday hours" has zero effect on bookability.** The field is
written and displayed nowhere else — not in slot generation (`availability.ts`),
not on the public `BusinessDetail` page. The actual, functioning block-date
mechanism lives entirely in a different screen (`BusinessAppointments.tsx`) with
no cross-link from Hours & Availability. *(Category 1/2 — a saved action with
literally no downstream effect, while the real feature exists unlinked
elsewhere.)*

**Saving Hours doesn't refresh cached business data**, so an immediate,
same-session toggle of "Shop open right now" computes its auto-clear time
against the *old* hours. *(Category 4, concrete behavioral consequence.)*

### 15 — Business Appointments & Queue

**Fixed 2026-09-07 — gap log `#7`.** Walk-in queue support surfaced a real,
separate integration bug along the way (an existing "queue must be open"
trigger blocked the owner's own walk-in insert) — also fixed, see `#7`.

**No way to add a walk-in directly to the live queue** — Appointments has a full
walk-in modal; Queue has no equivalent UI, service method, or RLS policy (the
insert policy hard-requires `customer_user_id = auth.uid()`, so even a modified
client call would be rejected as-is). *(Category 5.)*

**A delivery ETA promised at Accept isn't visible to the customer until an agent is separately assigned** — the only read path for the stored ETA text requires an
`appointment_deliveries` row that doesn't exist until a distinct, later, manual
assignment step. *(Category 2.)*

### 16 — Business: Bulk-Buying Campaigns (owner side)

**Fixed — notifications 2026-09-06 (gap log `#6`), the rest 2026-09-07 (gap log `#7`).**

**The business gets no notification when a customer pledges or claims a deposit** — the reverse direction of confirm/reject, which do notify. *(Category 3.)*

**Pending deposit confirmations are invisible everywhere a business actually looks for "things to do"** — not in `ManageDashboard`'s "Action needed" list, not
in `BusinessPayments`'s claims section, no nav badge on the Store tab. *(Category 2.)*

**The roster/campaign list doesn't update live** when a customer pledges or pays
while the owner has the screen open — plain `useQuery`, not realtime, unlike the
directly analogous `QueueManager`/`BusinessRequests`. *(Category 4.)*

**Deleting a campaign with paid pledges has no confirmation guard and never notifies affected pledgers** — the workflow doc itself flags this exact scenario
as a risk to avoid, and the code does exactly that: instant delete, no dialog, no
notice, pledgers' own "My activity" entry just silently vanishes. *(Category 3/5.)*

### 17 — Business: Team, Leads, Community

**Fixed — notifications 2026-09-06 (gap log `#6`), realtime + LeadsInbox 2026-09-07 (gap log `#7`).**
LeadsInbox is a partial fix, honestly scoped — see `#7` for why a precise
deep-link isn't possible without a schema change.

**Neither side of Q&A generates a notification** — a business doesn't know a
customer asked; the asker doesn't know it's been answered. *(Category 3.)*

**Editing a team member's scopes doesn't notify them; revoking doesn't either** — same finding as Workflow 12, confirmed again from the business-console side.

**A revoked grantee isn't bounced "within seconds" while active in the console**
— same root cause as Workflow 12's realtime gap in `BusinessAccessGuard`.

**LeadsInbox offers only "mark handled," no actual response action** — flagged
with more hedging: may be intentional if Q&A/chat are meant to be the sole
response channels, but as built a lead can be dismissed without ever being
answered, with no cross-check. *(Category 5, softer confidence.)*

### 18 — Business: Settings, Payments, Profile

**Fixed 2026-09-06 — gap log `#6`.**

**Replying to a review never notifies the reviewer.** `reply_to_rating` doesn't
even select the rater's user id. *(Category 3.)*

**Deleting a business doesn't notify team members whose access it just revoked** — compounds with Workflow 17's realtime gap (a team member active in the console
at deletion time is neither told nor bounced promptly). *(Category 3.)*

*The core delete-business script (live-booking refusal, typed confirmation,
discovery/switcher removal, booking-history preservation) matches the workflow
exactly — no gap there.*

### 19 — Provider Onboarding & Console

No flow-completeness gaps found. Onboarding, availability, catalog/portfolio,
Find Work, Money, and verification all refetch correctly after mutations and
match the appointments subsystem's reference-quality standard.

### 20 — Delivery Agent Console

No flow-completeness gaps found — the v1.0 deferral is genuinely clean, not
half-wired. Both route guards, the hat-visibility logic, the nav entry, and the
battery-permission call site are all correctly gated behind the same feature
flag, with no dead menu items or orphaned code paths left reachable.

### 21 — Admin Panel

**Fixed — notifications 2026-09-06 (gap log `#6`), redirect + real moderation 2026-09-07 (gap log `#7`).**

**Signed-out `/admin` visits go through the customer OTP flow, not `/admin/login`** — `/admin` sits inside the same `ProtectedLayout` as every customer
route, which has no special case for it. *(Category 5 — wrong redirect
destination, contradicts the workflow doc's explicit expectation.)*

**Appeal resolution never notifies the owner** — despite the function's own doc
comment asserting that it does. *(Category 3.)*

**Report/bug-report resolution never reaches the reporter, and there's no status screen anywhere for them to check.** *(Category 2+3.)*

**"Take action" on a report performs no actual moderation** — only the report's
own status label changes; the reported content itself is never hidden, removed,
or connected to the one real moderation lever that does exist (business/provider
suspend). *(Category 5 — dead end.)*

**Deletion-request rejection never notifies the requester** — the UI silently
self-heals on next profile fetch, but nothing proactively tells the user their
request was declined. *(Category 3.)*

*Verification queue, business/provider approval queue, location-change
approvals, and agreement-dispute resolution are all confirmed working with
correct bidirectional notifications.*

### 22 — Android Platform Checks

**Fixed 2026-09-07 — gap log `#7`**, except App Links (excluded, see the
summary above — infra work outside this repo).

**Every share link, QR code, and the live tracking link resolves to `https://localhost` on native builds.** See "Read this first" #2 above.

**Notification permission is requested as a cold OS prompt with no in-app disclosure**, immediately on every sign-in — no equivalent of the existing
`LiveShareExplainer` pattern was ever built for push. *(Category 5.)*

**Noted, not confirmed:** no Android App Link intent-filter / `assetlinks.json`
exists — even once the localhost bug above is fixed, an organically shared
`https://stryt.in/...` link would open the phone's browser, not the native app.
Flagged for confirmation, not asserted as a bug — push-tap deep-linking (a
separate, working mechanism) may have been the only intended v1 native
deep-link path.

*Battery-optimization permission, background-location call sites, the public
`/track/:token` route, native service-worker cleanup, OTA rollback safety, the
web deploy pipeline's update-polling, and CSP coverage for every external host
actually called were all verified intact.*

### 23 — Cross-Cutting Regression Risks

No flow-completeness gaps or regressions found — every previously-fixed item on
this cycle's list (team-access re-validation, delivery-cancel unreachability,
email-as-name leak, live-location explainer consent semantics, battery-prompt
gating, map/CSP coverage, the bulk-buying rebuild's dead-code cleanup, and the
`reschedule_appointment` RPC's four guards) was independently re-verified in the
current code and still holds. Two items couldn't be checked by reading code
alone (an actual push arriving on a physical device; rapid-tap UI flicker) —
noted as un-reverifiable by this method, not as failures.

---

## Summary

| Category | Count (distinct confirmed findings) | Status |
|---|---|---|
| No notification to the other party (3) | 18 | **Fixed 2026-09-06 — gap log `#6`** |
| Invisible where it should surface (2) | 6 | **Fixed 2026-09-07 — gap log `#7`** |
| Stale state after an action (4) | 8 | **Fixed 2026-09-07 — gap log `#7`** |
| Dead end / no entry point (5) | 7 (was 9 — group-buy resolved by design, rejected-business dead end fixed 2026-09-06) | **Fixed 2026-09-07 — gap log `#7`** (App Links explicitly excluded, see `#7`) |
| No lasting confirmation (1) | 3 | **Fixed 2026-09-07 — gap log `#7`** |
| Workflows with zero gaps found | 4 (06 — already fixed, 07 — by design, 19, 20, 23) | — |

2026-09-06: buckets 1 (all notification gaps) and 2 (rejected-business dead
end) fixed — gap log `#6`. 2026-09-07: bucket 3 (everything else in this
file) fixed — gap log `#7`, except two items excluded on request: Android
App Links (infra work outside this repo) and the background-location
error-swallowing finding (needs live-device testing to confirm before any
fix, not fixable blind). Every other finding in this document is now
implemented and verified live.

---

*Generated 2026-09-05 by 8 parallel full-stack investigation passes, one per
workflow cluster, cross-referencing `docs/launch/workflows/01`–`23` against the
current codebase. Companion to `docs/gaps/GAPS_LOG.md` (interactive dogfooding
findings) — this file is a proactive, systematic sweep instead.*
