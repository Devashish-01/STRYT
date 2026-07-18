# Guest Mode — browse before you sign up

> Implementation plan for letting a signed-out visitor land on STRYT, see real
> nearby activity within **1 km**, and hit a sign-in wall only when they try to
> *do* something. Grounded in the current code — every claim below was checked
> against the live repo/database, not assumed.
>
> Compiled 2026-07-17. Companion to [BUSINESS_DESIGN.md](BUSINESS_DESIGN.md) / [PROVIDER_DESIGN.md](PROVIDER_DESIGN.md).

---

## 1. Why this is cheaper than it sounds

Four things already exist that would normally be the expensive part:

| Already done | Evidence |
|---|---|
| **The database already allows anonymous reads** | RLS `SELECT` policies on `businesses`, `providers`, `requests`, `catalog_items`, `ratings` are all granted to the `public` role (which includes `anon`). `businesses`/`providers` are already scoped to `ACTIVE`-only; the rest are `qual: true`. ⚠️ **Corrected during build:** this was true of the *tables* but not the *nearby RPCs* — `businesses_nearby` lacked an `EXECUTE` grant to `anon` (uniquely; `providers_nearby` et al. already had it), so a guest's Home 401'd on the businesses rail. Fixed by `20260826_businesses_nearby_anon_grant.sql`. Only caught by running the app signed-out — the typecheck was clean. |
| **Screens already tolerate a blank user** | `seedUser` ([store.tsx:16-30](src/store.tsx#L16-L30)) is `id: ""`, `lat: 0`, `lng: 0`. Screens were built to survive it pre-hydration and already guard: `user.id ? appointmentService.listForCustomer(user.id) : Promise.resolve([])` ([BusinessDetail.tsx:49](src/screens/business/BusinessDetail.tsx#L49)), `businessService.get(id, user.lat \|\| undefined, ...)` ([BusinessDetail.tsx:41](src/screens/business/BusinessDetail.tsx#L41)). |
| **Post-login return-to-where-you-were exists** | `returnTo.remember()` / `returnTo.consume()`, already wired in both [ProtectedLayout](src/App.tsx#L239) and [PublicOnlyLayout](src/App.tsx#L300). |
| **A public unauthenticated route precedent exists** | `/track/:token` ([App.tsx:423](src/App.tsx#L423)) already renders outside every guard with its own scoped data access. |

**The consequence:** this is mostly *routing + gating + a location source*, not a
screen-by-screen rewrite. The earlier 6/10 estimate assumed the screens would
need heavy guest-proofing; on inspection most already are. Realistically **4–5/10**.

---

## 2. The four real blockers

**B1. `ProtectedLayout` is all-or-nothing.**
[App.tsx:238-241](src/App.tsx#L238-L241) — one `isAuthed` check bounces *every*
route to `/auth/phone`. All ~50 in-app routes sit under it. Needs a third tier
between "public-only" (auth screens) and "protected" (everything else).

**B2. `profileReady` will hang a guest forever.**
[App.tsx:247-249](src/App.tsx#L247-L249) — renders `<AppShellSkeleton/>` until the
profile loads. A guest never loads a profile, so they'd stare at a skeleton
indefinitely. Must be bypassed for guests, not just for `isAuthed`.

**B3. A guest has no location.**
Every nearby query reads `user.lat`/`user.lng` from the *profile*. Guests need
live browser geolocation held in memory/session only, with a hard 1 km ceiling —
separate from the user-adjustable `settings_radius` logged-in users get
([requestService.ts:168-169](src/services/engagement/requestService.ts#L168-L169)).

**B4. Every action button currently just works.**
Book, message, join queue, send proposal, like, follow, bookmark — none of them
check auth today (they don't need to; you can't reach them signed out). Each
needs to become "gate → remember where I was → sign in → come back and continue."

---

## 3. What a guest can see vs. must sign in for

**Browsable (1 km cap):**
`/` splash · `/home` · `/explore` · `/business/:id` · `/provider/:id` ·
`/requests` · `/request/:id` · `/search` · `/categories` · `/category/:id`

**Gated (sign-in required):**
everything under `/*/manage` · `/profile` · `/chats` · `/queues` · `/wallet` ·
`/agreements` · `/appointments` · `/ask` · `/request/:id/propose` ·
`/notifications` · `/bookmarks` · `/safety` · `/community/new` · `/story/new`

**Decisions (settled 2026-07-17):**
- **Community feed** (`/community`, `/community-hub`, `/community/:id`) — ✅ **guests can see it**, strictly read-only. Reading a post detail counts as seeing (a feed you can't tap into isn't browsable), but *every* write inside it — like, vote, comment, recommend — is gated. Composing (`/community/new`, `/story/new`) stays fully protected.
- **1 km** — ✅ **product default, and the hard cap for guest mode.** Logged-in users keep their adjustable `settings_radius`; guests are pinned to 1 km with no control to change it. Client-side enforcement (see §6).
- **`/map`** — ✅ **guests get the map too, pinned to 1 km.** The radius strip is hidden for them and replaced by the 1 km notice; `settings_radius` is never written for a guest.

---

## 4. Phases

### Phase 1 — Guest session foundation
- Add `isGuest` to the store: `authReady && !isAuthed && guestLocation != null`.
- New `useGuestLocation()` hook: browser geolocation → `sessionStorage` only (never the `users` table), hard-capped at `GUEST_RADIUS_KM = 1`.
- Bypass the `profileReady` gate (B2) when `isGuest` — a guest is "ready" the moment auth resolves as signed-out.
- **Risk:** low. Purely additive; no existing path changes behaviour.

### Phase 2 — Open the doors (routing)
- New `<GuestOrAuthLayout/>` sitting between `PublicOnlyLayout` and `ProtectedLayout`: renders `<Outlet/>` for both guests and authed users; never redirects to login.
- Move the §3 browsable routes under it. Everything else stays under `ProtectedLayout` untouched.
- `/` splash gains a "Look around first" entry alongside "Continue with Google" ([PhoneEntry.tsx](src/screens/auth/PhoneEntry.tsx) copy already sells the value prop — reuse that framing).
- **Risk:** medium. This is the one structural change; a mistake here could expose a gated screen. Mitigate by moving routes explicitly one at a time, never by inverting the default.

### Phase 3 — Remove the actions (guests are strictly view-only)
- **Decided 2026-07-17: hide, don't gate.** An earlier draft argued for keeping
  buttons visible and bouncing on tap (discovery value). That was overruled:
  a guest gets **no interaction controls at all** on business/provider/request/
  post surfaces — they see everything, they can press nothing.
- Interactive *regions* are replaced by a single `<GuestSignInPrompt/>` rather
  than each button being individually gated — fewer places to miss one, and the
  guest always has exactly one obvious way forward.
- Counts stay visible as **plain text** (likes, upvotes, endorsements, wait
  times, prices). Social proof is the hook; the control is what's removed.
- Removed for guests: save/bookmark/list, share, message, follow, notify,
  stock-alert, book, join queue, add-to-cart/checkout, ask question, upvote,
  write review, report, like, vote, comment, reply, recommend, send proposal,
  post story/community, story reactions.
- **Kept for guests: Call and Directions.** They're the entire point of finding
  a shop nearby, and they only use contact details the owner already published.
  They were briefly removed on the mistaken belief that they write a lead row for
  the owner — they don't: `recordInteraction`'s lead insert is already guarded by
  `if (uid)`, so a signed-out tap records nothing. Verified against production:
  a guest tapping both left the `leads` count unchanged (63 → 63, zero rows with
  a null user). The call/directions *counter* does still tick for guests, which
  is correct — the owner's phone really did ring.
  **Don't "fix" this by hiding them again without re-checking that guard.**
- `useRequireAuth()` remains for **navigation-level** entry points that aren't
  attached to someone else's content (bottom-nav Create FAB, Home's "Need
  something?" / My deals / Appointments tiles, desktop sidebar "Post a Request").
- Empty-state copy is guest-aware — "No one has reviewed this shop yet" instead
  of "Be the first to leave a review!", which invites an action they can't take.
- **Risk:** widest-touching phase (12 files). Every change is `!isGuest &&` or a
  guest-only branch, so signed-in behaviour is untouched by construction.

### Phase 4 — Guest chrome
- Bottom nav: swap the "You" tab for a "Sign in" tab for guests ([BottomNav.tsx:30](src/components/BottomNav.tsx#L30) currently hard-navs to `/profile`).
- A persistent-but-quiet "Showing what's within 1 km · Sign in to see your whole street" strip on browse screens — states the limit honestly *and* sells the upgrade.
- Empty states need a guest variant: "Nothing within 1 km yet" ≠ "nothing on STRYT".
- Ambient header greeting ([Home.tsx:197](src/screens/Home.tsx#L197) `safeFirstName(user.name)`) needs a guest fallback — currently would greet nobody.

### Phase 5 — Verify
- Drive it signed-out in a real browser (the technique used earlier this session): land on `/`, browse, tap a gated action, confirm the login bounce *and* the return-to-where-you-were.
- Confirm no gated route renders for a guest — walk the full route list, not a sample.
- Confirm a guest's location never persists to the `users` table.

---

## 5. Sequencing

Phases 1→2 are the foundation and should land together (Phase 1 alone does
nothing visible; Phase 2 without Phase 1 hangs on `profileReady`). Phase 3 can
land incrementally, action by action. Phase 4 is polish and can trail.

**Recommend doing this *after* the current launch-hardening work, not instead of
it** — it's a growth lever, not a launch blocker.

---

## 6. The one honest caveat (accepted)

**The 1 km cap is enforced client-side, which is a product limit — not a security
boundary.** The data is *already* publicly readable (§1): RLS grants `SELECT` on
these tables to `anon` today. Filtering to 1 km in the client shapes what a guest
*sees* in the app, but does not stop someone querying wider directly via the API.

Accepted as the trade-off, because this is public listing data whose entire
purpose is being discovered — there's no secret being protected, and nobody has a
motive to circumvent a limit on content that's meant to attract them.

**If that ever changes** (e.g. 1 km becomes a monetisation/scarcity lever people
want to bypass), the upgrade path is a `SECURITY DEFINER` RPC taking lat/lng and
enforcing the radius server-side for anonymous callers. Deliberately not built
now — it would be real extra work securing something that isn't a secret.
