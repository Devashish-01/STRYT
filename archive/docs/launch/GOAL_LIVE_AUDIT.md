# Goal Live — Dashboards, Messaging & Profiles Audit

> Code-grounded report answering the 9 launch questions. Every claim links to the
> exact file/line it came from. Items are tagged **[BUG]** (broken, needs a fix),
> **[UX]** (works, should improve), or **[NEW]** (feature to add).
>
> Compiled 2026-07-15 from the current `reorg/codebase-priority-0-4` branch.

---

## 0. TL;DR priority table

| # | Topic | Verdict | Effort |
|---|-------|---------|--------|
| 8 | Post like / unlike | **[BUG] Confirmed** — like visually reverts after realtime refetch | S |
| 9 | Message “read” state | **[BUG] Confirmed** — list highlights the wrong person’s unread flag | S |
| 4 | Messaging role separation | **Mostly separate** (3 scoped inboxes) — 2 leaks to close | S–M |
| 5 | Alias vs real name | Two competing identity systems; no “show my name” toggle | M |
| 6 | Customer profile header | Works; shows raw phone + weak hierarchy | M |
| 7 | Business public profile | Solid; re-order for faster decisions | M |
| 1 | Provider dashboard endpoints | Add 6 (4 already have backing services) | M |
| 2 | Business dashboard endpoints | Add 7 (5 already have backing services) | M |
| 3 | Customer dashboard endpoints | Add 5 | M |

---

## 1. Provider profile dashboard — endpoints to add

**File:** [ProviderDashboard.tsx](src/screens/provider/manage/ProviderDashboard.tsx) ·
**Service:** [providerService.ts](src/services/marketplace/providerService.ts)

Today the dashboard surfaces: availability toggle, today’s appointments rail, KPI
analytics (views/leads/won/earnings/jobs/rating), and tiles for Edit Profile,
Leads & Requests, Availability, Catalog, Portfolio, QR, Community, Story, My
Activity ([ProviderDashboard.tsx:436-472](src/screens/provider/manage/ProviderDashboard.tsx#L436-L472)).

Routes that already exist in the provider console but are **not** on the tile grid:
`packages`, `settings`, `verify` (see console list in [CODEBASE_MAP.md](CODEBASE_MAP.md)).

| Add | What it does | Backing endpoint | Type |
|-----|--------------|------------------|------|
| **Reviews inbox** | Read/reply to ratings; distribution bars | `providerService.reviews()` exists ([providerService.ts](src/services/marketplace/providerService.ts)) | [UX] surface only |
| **Verification center** | Upload Aadhaar/photo, show badge status | `submitVerification` + `/provider/:id/manage/verify` route exists | [UX] surface only |
| **Earnings / ledger** | Offline-earnings history behind the “Earned” KPI | `analytics().earnings` exists; needs a list endpoint | [NEW] `providerService.earningsLedger()` |
| **Packages** | Fixed-price service packages (distinct from catalog) | `providerService.packages/addPackage/deletePackage` exist | [UX] surface only |
| **“Share my availability” quick action** | One-tap post to community that you’re free now | reuses `setAvailability` + `communityService.create` | [NEW] compose shortcut |
| **Quote/Proposal templates** | Saved reply snippets for leads → faster responses | — | [NEW] `providerService.quoteTemplates()` |

Fast-access priority: put **Reviews** and **Verification** on the grid (they exist,
just hidden), and add an **Earnings ledger** since providers care about money.

---

## 2. Business profile dashboard — endpoints to add

**File:** [ManageDashboard.tsx](src/screens/business/manage/ManageDashboard.tsx) ·
**Service:** [businessService.ts](src/services/marketplace/businessService.ts)

Today: availability toggle, live-queue rail, today’s appointments rail, weekly KPIs,
“Action Needed” (Q&A + Reviews), and tiles for Edit Profile, Appointments, Live
Queue, Find Requests, Catalog, Portfolio, Hours, QR, Community Post, My Community,
Story, My Activity ([ManageDashboard.tsx:508-546](src/screens/business/manage/ManageDashboard.tsx#L508-L546)).

Routes that exist in the business console but are **not** on the tile grid:
`loyalty`, `promote`, `verify`, `settings`, `reservations`, `inbox` (see [CODEBASE_MAP.md](CODEBASE_MAP.md)).

| Add | What it does | Backing endpoint | Type |
|-----|--------------|------------------|------|
| **Promote / Boost** | Buy featured placement; renew before expiry | `buyBoost` / `activeBoosts` exist; `/promote` route exists | [UX] surface only |
| **Loyalty card** | Stamp-card setup for repeat customers | `loyaltyCard` exists; `/loyalty` route exists | [UX] surface only |
| **Verification center** | Aadhaar+PAN upload, badge status | `submitVerification` + `/verify` route | [UX] surface only |
| **Payments & UPI** | Set UPI id / settlement QR (used by ShareCard already) | reads `b.upiId`; needs a save endpoint | [NEW] `businessService.setPayment()` |
| **Reviews management** | Reply to reviews (Action-Needed only counts them) | `businessService.reviews` + `/reviews` route | [UX] surface only |
| **Low-stock alerts** | Notify owner when a FINITE catalog item sells out | catalog has inventory; needs a trigger | [NEW] `businessService.lowStock()` |
| **Broadcast to customers** | One message/offer to all followers or queue | — | [NEW] `businessService.broadcast()` |

Fast-access priority: add **Promote**, **Loyalty**, **Verify** tiles (all already
have services + routes — pure UI), then build **Payments & UPI** since checkout
already depends on `upiId`.

---

## 3. Customer profile dashboard — endpoints to add

**File:** [Profile.tsx](src/screens/Profile.tsx) ·
**Service:** [userService.ts](src/services/core/userService.ts)

Today the customer quick-grid is Appointments, Requests, Wallet, Queues, Community,
Badges ([Profile.tsx:101-108](src/screens/Profile.tsx#L101-L108)), plus stats
(Saved/Following/Followers/Deals) and a role switcher.

| Add | What it does | Backing endpoint | Type |
|-----|--------------|------------------|------|
| **Order / booking history** | Past appointments + queue visits in one list | `appointmentService.listForCustomer` exists | [NEW] combined view |
| **My reviews given** | Reviews the customer has written, editable | `userService.me().reviewsGiven` exists | [UX] surface only |
| **Payments / receipts** | Paid vs unpaid across bookings | `appointmentService` has `paymentStatus` fields | [NEW] `walletService.receipts()` |
| **Saved searches / alerts** | Re-run a search; alert when a match opens | `notifySubs` store already models alerts | [NEW] persist saved searches |
| **Referral / invite** | Share invite link, track joins | ShareCard exists | [NEW] `userService.referralCode()` |

Fast-access priority: **Order/booking history** and **Payments/receipts** — the two
things customers reopen the app to check.

---

## 4. Is messaging fully separate per role? (business / provider / customer)

**Short answer: it is *scoped* into three separate inboxes today, but the isolation
has two leaks.** There is **one** `conversations`/`messages` table and **one**
thread screen; separation is done with a `scope` query param, not separate features.

**How the separation works** ([chatService.ts:38-58](src/services/engagement/chatService.ts#L38-L58)):
- Customer inbox → `/chats?scope=CUSTOMER` (from the customer header, [Profile.tsx:130](src/screens/Profile.tsx#L130))
- Business inbox → `/chats?scope=BUSINESS&id=<bizId>` ([ManageDashboard.tsx:205](src/screens/business/manage/ManageDashboard.tsx#L205))
- Provider inbox → `/chats?scope=PROVIDER&id=<provId>` ([ProviderDashboard.tsx:177](src/screens/provider/manage/ProviderDashboard.tsx#L177))

`applyChatScope()` pushes the filter to Postgres so each inbox only ever sees its own
rows — a business owner does **not** see personal customer chats in the business
inbox, and vice-versa. So **there is no cross-role redirection when opening an inbox
or a thread** — “View profile” in the thread correctly opens the *other* person’s
public profile ([ChatThread.tsx:133](src/screens/chat/ChatThread.tsx#L133)), never a role switch.

**The two leaks to close for true isolation:**

1. **[BUG] The unread badge bleeds across roles.** The thread screen updates the badge
   with an **unscoped** `totalUnread()` and writes it into the *customer-scoped*
   `chatUnread` store value ([ChatThread.tsx:47](src/screens/chat/ChatThread.tsx#L47)),
   even though the store loads that value with `{ scope: "CUSTOMER" }`
   ([store.tsx:221](src/store.tsx#L221)). Opening a business chat therefore rewrites
   the customer badge with an all-roles total. **Fix:** pass the current inbox’s scope
   into `totalUnread()` and only write the matching badge.

2. **[UX] The thread is scope-agnostic.** `/chat/:id` keeps no memory of which inbox
   you came from; it fetches *all* conversations to resolve the row
   ([ChatThread.tsx:24](src/screens/chat/ChatThread.tsx#L24)). Back-navigation works
   (`nav(-1)`), but a deep link to `/chat/:id` can’t tell which hat you were wearing.
   **Fix (optional):** carry `?scope=` through to the thread so the back target and
   badge refresh are unambiguous.

**Recommendation:** keep the single-table design (it’s correct and avoids duplicate
conversations) and just fix the two leaks above — that gives you the “no bleed between
business/provider/customer” behavior you want without a rewrite.

---

## 5. Alias name vs real name — default off + a public toggle

**Current model is contradictory and has no name-visibility toggle.**

- `Display Name` = the **real name** (`user.name`), and the UI already promises it is
  **private**: *“Kept private. Only shared with a shop/provider once you book, join
  their queue, or send a proposal.”* ([ProfileEdit.tsx:281-283](src/screens/ProfileEdit.tsx#L281-L283)).
- `Public alias` = the **handle** shown to everyone; the public profile renders
  `aliasName(u)` everywhere ([PublicProfile.tsx:161](src/screens/PublicProfile.tsx#L161),
  [PublicProfile.tsx:209-211](src/screens/PublicProfile.tsx#L209-L211)).
- `aliasName()` = alias if set, else first-name, else “STRYT Neighbor”
  ([publicName.ts:29-36](src/lib/publicName.ts#L29-L36)).

So the *real name is already off-by-default in public views* (only the alias/first
name shows), **but there is no switch** for a user who *wants* their real name public.
The confusion you’re describing comes from the app carrying **two identity systems at
once** — `name` and `alias` — while an older product note said the alias system was
removed in favor of first-name. The code did **not** remove alias; it’s live in chat,
community posts, comments and the public profile.

**Recommendation (the toggle you asked for):**

1. Add one privacy field `showNamePublicly` to `PRIVACY_FIELDS`
   ([ProfileEdit.tsx:16-25](src/screens/ProfileEdit.tsx#L16-L25)), **defaulting to
   `false`** (like `showEmailPublicly` does at [ProfileEdit.tsx:46](src/screens/ProfileEdit.tsx#L46)).
2. Add the `users.show_name_publicly` column + include it in `userService.me()` /
   `publicProfile()` selects ([userService.ts](src/services/core/userService.ts)).
3. In the public identity helper, when the viewed user has `showNamePublicly === true`,
   return the real `name`; otherwise keep returning the alias/first-name. Do this in
   one place (`aliasName`) so chat, community and profile all follow the toggle.
4. Decide the end state to kill the confusion: either (a) keep alias as the default
   public handle with the new toggle promoting to real name, or (b) drop alias
   entirely and let the toggle switch between *first name* and *full name*. **(b) is
   simpler for launch** and matches the earlier product direction.

---

## 6. Customer profile page header — why it looks off + fix

**File:** [Profile.tsx:114-226](src/screens/Profile.tsx#L114-L226)

The header is a `living-sky-header` with an ambient sky, avatar, name, and a stats
strip. Concrete issues:

- **Raw phone number is the subtitle** ([Profile.tsx:162](src/screens/Profile.tsx#L162)) —
  a 10-digit number under the name reads as clutter and is odd on one’s *own* profile.
  Replace with alias/handle or `@area • member since`.
- **Three stacked identity rows** (name+phone+greeting, then two badge pills, then a
  4-up stats strip) compete for attention — no single focal point.
  ([Profile.tsx:159-225](src/screens/Profile.tsx#L159-L225)).
- **Rating pill shows for brand-new users as “New”** next to a location pill; fine, but
  the two pills + stats duplicate rating/followers info that also appears on the
  public profile.
- **`displayName(user.name)` shows the real name to yourself** — correct, but once the
  `showNamePublicly` toggle (§5) exists, add a small “Private” lock chip so the user
  understands neighbors don’t see it.

**Recommended header hierarchy (top→bottom):** avatar + **name** (with a lock/`@alias`
line), one row of *action* buttons (Edit · Public profile · Share — already present at
[Profile.tsx:178-201](src/screens/Profile.tsx#L178-L201)), then the single stats strip.
Drop the raw phone line and the redundant rating/location pills.

---

## 7. Business public profile — redesign for faster customer decisions

**File:** [BusinessDetail.tsx](src/screens/business/BusinessDetail.tsx)

The page is already feature-rich: cover, verified badge, rating, distance/open-now,
call/directions/message, follow/notify, book, live queue, highlights, and tabs
Menu/Posts/Work/About/Reviews ([BusinessDetail.tsx:467-481](src/screens/business/BusinessDetail.tsx#L467-L481)).
For a customer *deciding fast*, the decision signals are spread out and the default
tab is the full menu.

**What a customer decides on, in order:** is it open & close? is it trusted (rating +
verified + review count)? how long is the wait? what does it cost / is there an offer?
can I reach them now?

**Redesign recommendations:**

1. **Decision strip under the name** — one compact row combining Open-now + distance +
   rating(count) + queue wait, so the four top signals are visible without scrolling.
   Today Open/distance are in one row ([BusinessDetail.tsx:266-272](src/screens/business/BusinessDetail.tsx#L266-L272))
   and the queue wait is a separate card lower down
   ([BusinessDetail.tsx:368-380](src/screens/business/BusinessDetail.tsx#L368-L380)).
2. **Trust cluster** — put Verified + rating distribution + “X verified bookings”
   near the top; verified-booking data already exists on reviews
   ([BusinessDetail.tsx:712-716](src/screens/business/BusinessDetail.tsx#L712-L716)).
3. **Lead with value** — surface bestseller / on-sale catalog items (the data has
   `bestSeller` and `salePrice`, [BusinessDetail.tsx:498-502](src/screens/business/BusinessDetail.tsx#L498-L502))
   as a 2–3 item “Popular” peek *above* the tab bar, instead of only inside the Menu tab.
4. **Sticky action bar** — keep Call / Directions / Book / Message pinned at the bottom
   so the primary conversions are always one tap away (they currently scroll away with
   the info card, [BusinessDetail.tsx:279-312](src/screens/business/BusinessDetail.tsx#L279-L312)).
5. **Default tab by intent** — if the shop has an active offer or a short queue, default
   to Menu; if it’s a service business with a portfolio, default to Work.

---

## 8. [BUG] Post like / unlike not working — confirmed root cause

**Root cause: two competing sources of truth for “liked”, reconciled by an XOR that
double-applies once the realtime refetch lands.**

- The store’s `toggleLike` **only mutates a local session array** and never persists —
  it’s purely the optimistic hint ([useSocialSlice.ts:112-114](src/store/useSocialSlice.ts#L112-L114)).
- Each card computes `liked = toggled ? !post.liked : post.liked`, where `toggled =
  likes.includes(post.id)` and `post.liked` is the DB truth
  ([Community.tsx:113-115](src/screens/Community.tsx#L113-L115),
  [CommunityPostDetail.tsx:91-93](src/screens/CommunityPostDetail.tsx#L91-L93)).
- Persistence is correct on its own — `communityService.like()` deletes/inserts in
  `post_likes` and recounts `likes_count` ([communityService.ts:277-297](src/services/engagement/communityService.ts#L277-L297)).
- **But** both feeds use `useQueryWithRealtime(..., "community_posts", ...)`
  ([Community.tsx:29-33](src/screens/Community.tsx#L29-L33),
  [CommunityPostDetail.tsx:64](src/screens/CommunityPostDetail.tsx#L64)). Writing
  `likes_count` fires a realtime UPDATE → the feed refetches → `post.liked` flips to
  DB-true **while the store toggle is still set**. The XOR then computes
  `!true = false`, and `likeCount = max(0, 1 + 0 - 1) = 0`. **Net effect: the heart
  fills, then reverts to empty and the count drops back** — “like doesn’t work”.

**Failure trace:** empty → tap → store adds id, `liked=true`, count +1 (persist runs) →
realtime refetch lands, `post.liked=true`, store still has id → `liked = !true = false`,
count recomputes to original → visual revert.

**Fix (pick one):**
- **Simplest & robust:** stop XOR-ing against a refetching value. Drive the heart from
  `post.liked`/`post.likes` with a local per-card optimistic override that is cleared
  when the next `post` prop arrives (so server truth wins cleanly).
- **Minimal:** after `communityService.like()` resolves, clear the post’s id from the
  store `likes` set so the toggle can’t double-apply on the next refetch.
- Either way, make `toggleLike` and the persistence a single action instead of a store
  toggle + a separate service call in each screen.

---

## 9. [BUG] Message doesn’t move to “read” on open — confirmed root cause

**Root cause: the conversation list highlights unread using *both* participants’ flags
instead of the current user’s flag.**

- The list computes `const unread = c.hasUnreadA || c.hasUnreadB;`
  ([ConversationList.tsx:111](src/screens/chat/ConversationList.tsx#L111)) and uses it
  for the bold text + tinted background + dot.
- But the two flags are **per participant**: `send()` sets the *recipient’s* flag true
  and the *sender’s* false ([chatService.ts:190-195](src/services/engagement/chatService.ts#L190-L195)),
  and `markRead()` clears **only the current user’s** flag
  ([chatService.ts:201-210](src/services/engagement/chatService.ts#L201-L210)).
- So the OR is wrong from *your* point of view:
  - After **you send** a message, `has_unread_(other)=true` → your own list shows that
    conversation as unread — and **opening it never clears it**, because the set flag
    belongs to the other person, not you. That is exactly “clicking the message doesn’t
    go to read state.”

**Fix (one line):** compute the current user’s flag only. The list already has
`user` from `useApp()` context available:

```ts
const mineUnread = user.id === c.participantA ? c.hasUnreadA : c.hasUnreadB;
```

Use `mineUnread` for the styling. `markRead` on thread-open
([ChatThread.tsx:44-49](src/screens/chat/ChatThread.tsx#L44-L49)) then correctly clears
*your* flag and the row goes read.

**Related:** while here, also fix the badge-scope bleed from §4.1 (ChatThread writes an
unscoped `totalUnread()` into the customer badge, [ChatThread.tsx:47](src/screens/chat/ChatThread.tsx#L47)).

---

## Appendix — files reviewed

Chat: [chatService.ts](src/services/engagement/chatService.ts) ·
[ConversationList.tsx](src/screens/chat/ConversationList.tsx) ·
[ChatThread.tsx](src/screens/chat/ChatThread.tsx).
Community/likes: [communityService.ts](src/services/engagement/communityService.ts) ·
[Community.tsx](src/screens/Community.tsx) ·
[CommunityPostDetail.tsx](src/screens/CommunityPostDetail.tsx) ·
[useSocialSlice.ts](src/store/useSocialSlice.ts) · [store.tsx](src/store.tsx).
Identity/privacy: [publicName.ts](src/lib/publicName.ts) ·
[profileControlService.ts](src/services/core/profileControlService.ts) ·
[ProfileEdit.tsx](src/screens/ProfileEdit.tsx) ·
[PublicProfile.tsx](src/screens/PublicProfile.tsx).
Dashboards/profiles: [ManageDashboard.tsx](src/screens/business/manage/ManageDashboard.tsx) ·
[ProviderDashboard.tsx](src/screens/provider/manage/ProviderDashboard.tsx) ·
[Profile.tsx](src/screens/Profile.tsx) ·
[BusinessDetail.tsx](src/screens/business/BusinessDetail.tsx).
Services surface: [businessService.ts](src/services/marketplace/businessService.ts) ·
[providerService.ts](src/services/marketplace/providerService.ts) ·
[userService.ts](src/services/core/userService.ts) ·
[appointmentService.ts](src/services/engagement/appointmentService.ts).
