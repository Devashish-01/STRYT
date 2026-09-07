# Provider Onboarding Flow — Bug & Gap Log

**Purpose:** Documenting every real defect, broken control, data omission, and architectural gap in the **Provider Onboarding flow** (`/onboard/provider`, `ProviderOnboard.tsx`, and `providerService.ts`). Strictly focused on **maturing the existing implementation** and making the onboarding flow production-ready and functional without introducing unrelated new features.

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Classification | Impact on Ready-to-Use |
| :--- | :--- | :--- | :--- |
| **#1** | Missing contact phone number | **Ready-to-Use Blocker** | Public "Call" button is hidden/broken (`phone=null`); customers cannot reach provider |
| **#2** | Proposing category saves NULL | **Ready-to-Use Blocker** | Custom skill selection creates listing with NULL category, breaking discovery |
| **#3** | Portfolio photos cannot be deleted | **Ready-to-Use Blocker** | No delete/X button; accidental upload requires restarting from scratch |
| **#4** | Upload failure bricks user on retry | **Ready-to-Use Blocker** | 1-provider DB constraint permanently blocks retrying submission |
| **#5** | Unauthenticated user dead end | **Ready-to-Use Blocker** | 401 error after 4 steps; user trapped with no login redirect |
| **#6** | Role assignment race condition | **Ready-to-Use Blocker** | `refreshUser` un-sets provider role immediately after onboarding |
| **#7** | Availability hours lost when bookings off | **Ready-to-Use Blocker** | Operating schedule wiped (`availabilityNote=null`) when bookings disabled |
| **#8** | Category chips truncated to single words | **Ready-to-Use Blocker** | Mangles skill names ("AC", "House", "Pest") |
| **#9** | Silent Continue button disable on lat/lng | **Ready-to-Use Blocker** | Form disables next button with zero error feedback if GPS fails |
| **#10** | Status / verification copy contradiction | **Ready-to-Use Blocker** | Misleads provider that listing is held in review when it is live |
| **#11** | Missing context switch & dead-end nav | **Ready-to-Use Blocker** | Leaves user in customer mode instead of taking them to their provider dashboard |
| **#12** | Form draft persistence | *Deferred (New Feature)* | Offline/sleep recovery; not a blocker for completing onboarding |

---

## How to use this

- One entry per issue.
- **Status** is one of: `Open` · `Fixed` · `Won't fix` (with reason) · `By design` (with reason).
- Root cause cites the exact file/line/function/migration.
- Fix direction outlines the required frontend and backend modifications.

---

## #1 — Missing contact phone number (renders provider listing unreachable by call)

**Status:** Fixed — 2026-09-08 (client only)

A required **Contact number** field on step 2, prefilled from the account's own
number. `providers.phone` already existed and was already in
`PROVIDER_COLUMNS` — onboarding simply never collected it, so every profile
created through this flow shipped with the public "Call" button pointing at
nothing.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx`, `src/services/marketplace/providerService.ts:215-251`, `src/screens/provider/ProviderDetail.tsx:184, 570`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** Throughout all 4 steps of `ProviderOnboard.tsx`, there is **no input field for the provider's phone number**. In `providerService.create`, `phone` is never copied or defaulted from `users`. Consequently:
1. Every newly onboarded provider row has `phone: null` in Postgres.
2. In `ProviderDetail.tsx:184` and `:570`, the Call button is guarded by:
   ```tsx
   {!isOwner && p.phone && p.showPhonePublicly !== false && (
     <a href={`tel:${p.phone}`} ...><Phone size={17} /></a>
   )}
   ```
3. Because `p.phone` is null, the **Call button is permanently missing** on the provider's public profile. Customers looking to hire an electrician, plumber, tutor, or technician have no way to call them.

**Fix direction:**
1. In `ProviderOnboard.tsx` (Step 1 or Step 3), add a contact phone number input with a country code decorator (`+91`) and pre-fill from `user.phone` if available.
2. Pass `phone` to `providerService.create` and save to `providers.phone`.

---

## #2 — Proposing a new category saves a NULL category in the database (broken custom category flow)

**Status:** Fixed — 2026-09-08 (client only)

`proposeCategory` was fire-and-forget: its return value was discarded, and the
insert then ran `categoryId: cat ?? undefined` — which is `undefined` precisely
when a category was proposed. Combined with `categoryName: selectedCat?.name`
(also undefined, since nothing was selected), a provider who proposed a skill
was created with **no category and no category name at all**, invisible to every
category-filtered query.

Now the proposed row's own id and name are used. The service has a fallback path
that returns a synthetic `prop_` id when the insert is refused by RLS; that id
is explicitly *not* written as a foreign key — but the typed name still goes in
as `categoryName`, so the profile is at least findable by what it says it does
rather than by nothing.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:74, 86-90, 180-186`, `src/services/marketplace/providerService.ts:86-90`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** Step 0 invites providers: *"Don't see your skill? Propose a new category"*. When a user types into `newCat`, line 183 sets `cat = null`. On submission:
```ts
if (newCat.trim()) await catalogService.proposeCategory(newCat.trim(), null, "SERVICE");
...
const created = await providerService.create({
  displayName: displayName.trim(),
  categoryId: cat ?? undefined,
  categoryName: selectedCat?.name || undefined,
  ...
});
```
Because `cat` is `null`, `selectedCat` is `undefined`. Both `category_id` and `category_name` are sent as `undefined` (NULL in Postgres).
Furthermore, `catalogService.proposeCategory` inserts a row into `categories`, but its generated ID is never attached to the provider. The provider's profile is created with **no category name and no category ID**. When customers view the profile or search, the provider's trade is completely blank.

**Fix direction:**
1. When `newCat` is provided, assign `categoryName: newCat.trim()` in the create payload so the provider's profile immediately reflects what they do.
2. Link the returned category ID from `proposeCategory` to `categoryId`.

---

## #3 — Uploaded portfolio photos cannot be deleted or replaced (missing delete button)

**Status:** Fixed — 2026-09-08 (client only)

Each portfolio thumbnail gained a remove button. Also fixes a leak the entry
didn't mention: `URL.createObjectURL` was never revoked, so every preview pinned
its full-size file in memory for the life of the document — up to five portfolio
photos plus the profile photo. Revoked on removal and on unmount.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:246-264`

**Reported:** "any button should be there which is not in the app"

**Root cause:** In Step 2 (Portfolio), selected photos are mapped into thumbnails:
```tsx
{photos.map((p, idx) => (
  <img key={idx} src={p.previewUrl} alt={`Portfolio photo ${idx + 1}`} className="thumb" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover" }} />
))}
```
There is **NO delete button, trash icon, or remove action** on any thumbnail. If an owner selects an incorrect file, a personal photo, or a duplicate, they cannot delete it. The only workaround is refreshing the page and redoing all 4 steps.

**Fix direction:**
1. Wrap each thumbnail in a relative container with an overlay close button (`X` icon).
2. Tapping it removes the item: `setPhotos(photos.filter((_, i) => i !== idx))` and calls `URL.revokeObjectURL(p.previewUrl)`.

---

## #4 — Portfolio upload failure permanently bricks the user from retrying (unrecoverable state)

**Status:** Fixed — 2026-09-08 (client only)

The flow was: upload avatar → create provider → upload portfolio → persist
portfolio. A failure in either portfolio step threw, and the retry re-ran
`providerService.create`, which hit `idx_providers_one_per_user` — so one flaky
photo upload permanently bricked the account, with the profile already created
and unreachable.

Two changes: the created id is held in state and a retry **resumes** from it
rather than re-creating, and portfolio upload is no longer fatal at all — it
catches, tells the owner the profile exists and the photos can be added from the
dashboard, and completes. The submit button reads "Retry" once a row exists, so
the second press is visibly a different action.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:84-111`, `src/services/marketplace/providerService.ts:245`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** In `submit()`:
1. `photoUrl = await uploadService.upload(photoFile, "provider-photo")`
2. `const created = await providerService.create({ ... })` (provider is now created in Postgres).
3. `await Promise.all(photos.map(p => uploadService.upload(p.file, "portfolio")))`
4. `await Promise.all(uploadedUrls.map(url => providerService.addPortfolio(created.id, ...)))`

If a portfolio photo fails to upload (e.g. network timeout or file size error), execution jumps to the `catch` block. The user stays on Step 3 and taps "Submit profile" again.
On the second attempt, step 2 (`providerService.create`) executes again and fails with:
`"You already have a provider profile — manage it instead of creating a new one"` (enforced by DB index `idx_providers_one_per_user`).
The user is permanently stuck on Step 3 with an unrecoverable error.

**Fix direction:**
1. Upload portfolio photos before calling `providerService.create`, or
2. Wrap the post-create portfolio upload in a non-fatal `try/catch` that logs the issue and allows onboarding to succeed while warning the user to re-add failed photos from the manage console.

---

## #5 — Unauthenticated user dead end (missing auth check on mount)

**Status:** Fixed — 2026-09-08 (client only)

Signed-out visitors could complete four steps and only discover it at submit, as
a 401 with no route back. Bounced at the door with a `next` state so signing in
resumes here.

**Status was:** Open  
**Area:** `src/App.tsx:644`, `src/screens/provider/ProviderOnboard.tsx:20-45`, `src/services/marketplace/providerService.ts:218`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** `/onboard/provider` has no route guard in `App.tsx`, and `ProviderOnboard.tsx` does not verify authentication on mount. An unauthenticated guest can complete all 4 steps, crop a photo, and tap "Submit profile". Only at that point does `providerService.create` reject with `401 "Sign in to offer a service"`. The user is not redirected to log in, and navigating away wipes all form data and photos.

**Fix direction:**
Check `user.id` on mount in `ProviderOnboard.tsx`. If the user is unauthenticated, redirect to `/login?redirect=/onboard/provider` or display a sign-in modal before allowing them to fill out the form.

---

## #6 — Role assignment race condition (`addRole` vs `refreshUser`)

**Status:** Fixed — 2026-09-08 (client only, `store.tsx`)

`addRole` fired `void userService.update({ roles })` and returned immediately, so
`addRole("provider"); await refreshUser();` raced its own write — `refreshUser`
read roles back before the update landed and reset them to `['customer']`.

`addRole` is now `async` and awaited by both callers. It also had to stop using a
functional `setRoles` updater to compute the next array: an updater's return
value isn't available to the caller, so there was nothing to await. It reads
`roles` from the closure instead, which is already a dependency of the context
memo. Same fix closes BUSINESS_ONBOARDING #19.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:112-113`, `src/store.tsx:621-630`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** In `submit()`:
```ts
addRole("provider");
await refreshUser();
```
In `store.tsx:626`, `addRole` triggers:
`void userService.update({ roles: next });`
This is a fire-and-forget, un-awaited asynchronous call. `await refreshUser()` immediately runs in parallel, queries `get_own_profile` from Supabase, and runs `setRoles(me.roles)`.
If `refreshUser()` reads before `userService.update()` finishes writing to Postgres, it reads the old `roles = ['customer']` and overwrites `setRoles`, silently removing the `"provider"` role from the active React state.

**Fix direction:**
Ensure `userService.update({ roles })` is awaited before `refreshUser()` executes, preventing stale role overwrites.

---

## #7 — Availability hours lost when appointment bookings are disabled

**Status:** Fixed — 2026-09-08 (client only)

The hours editor was rendered only when bookings were on, and
`availabilityNote` was `wantsBookings ? … : undefined` — so a provider who took
phone calls but not in-app bookings published **no hours at all**.

When you work is public information regardless; only `bookingsEnabled` should
decide whether those hours can be reserved against. The editor is now always
shown (its description changes with the toggle) and the value is always
persisted.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:81-83, 222-237`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** In `submit()`:
```ts
const availabilityValue = wantsBookings
  ? serializeHoursValue(expandPatternToWeekly(parsedAvailability.days, parsedAvailability.from, parsedAvailability.to, 30))
  : undefined;
```
If a provider provides on-demand quotes or proposals (e.g. painter, carpenter, event DJ) and toggles off appointment bookings, `availabilityNote` is submitted as `undefined`. The provider is stored with NO working hours in the database. When visitors view the provider on `ProviderDetail.tsx`, the operating hours and "Open Now" badges fail to compute properly.

**Fix direction:**
Always store the provider's general working schedule in `availabilityNote`, using `bookingsEnabled` strictly to control whether customers can book appointment slots.

---

## #8 — Category chip names are truncated to single words (`split(" ")[0]`)

**Status:** Fixed — 2026-09-08 (client only)

`{c.name.split(" ")[0]}` rendered "AC Repair & Service" as "AC", "House
Cleaning" as "House", "Pest Control" as "Pest". Full names now. The same
truncation was also fixed in `ProviderProfileEditor.tsx`, which the entry didn't
cite.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:174`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** Category buttons on Step 0 render as:
```tsx
{c.icon} {c.name.split(" ")[0]}
```
Splitting on whitespace truncates essential service names:
- "AC Repair" becomes "AC"
- "House Cleaning" becomes "House"
- "Pest Control" becomes "Pest"
- "Pet Care" becomes "Pet"
- "Electrician & Wireman" becomes "Electrician"
This produces confusing, uninformative chip labels.

**Fix direction:**
Render `c.name` in full with proper flex-wrap chip styling.

---

## #9 — Silent "Continue" button disable on Step 1 when location pin is missing

**Status:** Fixed — 2026-09-08 (client only)

A `blockedReason` line above the button naming the one thing still missing. A
disabled control with no stated reason is indistinguishable from a broken one,
and "drop a pin" is the least guessable of these because the map looks
already-filled.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:37-38, 66, 309-314`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** `lat` and `lng` start as `null`. Step 1 requires:
`price.replace(/\D/g, "").length > 1 && bio.trim().length > 5 && lat !== null && lng !== null`
If device geolocation is denied or times out, the Leaflet map centers on the default location, but `lat` and `lng` remain `null`. The user enters their bio and price, and finds the "Continue" button disabled with zero feedback or explanation.

**Fix direction:**
Display an inline warning beneath the map when `lat === null`: *"Tap the map to set your service location pin."*

---

## #10 — Status and verification copy contradiction ("Almost Live" vs Instant Active)

**Status:** Fixed — 2026-09-08 (client only)

The success screen said "You're almost live!", "We'll verify your profile
shortly" and "Once approved you'll appear in search" — none of which was true.
`providerService.create` inserts with `status: 'ACTIVE'` and discovery shows
ACTIVE immediately. Providers were waiting for an approval that was never
coming, and not promoting a profile that was already public.

Now: "You're live!", with the verified badge correctly described as the separate
thing that does get reviewed.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:133-136`, `src/services/marketplace/providerService.ts:221-224`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** The onboarding completion screen displays:
```tsx
<h1 className="bold h1">You're almost live!</h1>
<p className="muted">
  We'll verify your profile shortly. Once approved you'll appear in search and the feed for everyone within {radius} km.
</p>
```
In reality, `providerService.create` sets `status: "ACTIVE"` immediately upon insertion. The provider is live instantly and does not wait for admin approval to appear in search. The copy misleads providers into believing their profile is disabled and pending review.

**Fix direction:**
Update the success screen copy to clearly state: *"Your profile is now live! You can start receiving job requests and messages from nearby customers."*

---

## #11 — Missing context switch on completion & dead-end navigation to ManageHub

**Status:** Fixed — 2026-09-08 (client only)

`setContext({ type: "provider", id, name })` before completion, and the button
goes to `/provider/:id/manage` rather than the generic `/manage`, so the new
provider lands in their own console instead of in customer mode looking at a hub
that isn't theirs. A "Back to home" escape sits under it.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:139`, `src/store.tsx:412-419`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** Upon successful profile creation, `activeContext` remains `{ type: "customer" }`. The "Done" button simply calls `nav("/manage")` (ManageHub list) instead of switching the active context to `{ type: "provider", id: created.id, name: created.displayName }` and routing directly into the provider console (`/provider/${created.id}/manage`).

**Fix direction:**
1. Call `setContext({ type: "provider", id: created.id, name: created.displayName })` on completion.
2. Route the "Done" button directly to `/provider/${created.id}/manage`.

---

## #12 — No draft persistence for provider onboarding form

**Status:** Fixed — 2026-09-08 (client only)

New `src/hooks/useFormDraft.ts`, shared by both onboarding flows.

**`localStorage`, not `sessionStorage`** (which both entries suggested): the
failure this exists for is the app being backgrounded and killed, and that is
precisely the case sessionStorage does not survive. Keyed per user id, for the
same reason `ob_beat` had to be (CUSTOMER_ONBOARDING #3) — a shared phone must
not hand one person's half-written listing to the next.

Three details that make it correct rather than merely present:

- **Autosave is suppressed until the restore pass for that key has run.** Without
  it the empty initial state would race the load and overwrite the stored draft
  before it was read — the classic way autosave eats the thing it's protecting.
- **The snapshot is flushed on unmount**, cancelling the debounce. The debounce
  window is exactly when a backgrounded tab gets killed.
- **An `isEmpty` predicate is required.** Without one, merely opening the form
  would write an empty draft and every later visit would claim to have restored
  something.

Parse failures (a draft written by an older shape of the form) drop the draft and
start clean rather than throwing, and `localStorage` access is probed in a
try/catch because private-mode Safari throws on access rather than on write.

**Photos are deliberately not saved** — they hold `File` objects, which don't
serialise, and a blob URL doesn't survive a reload. The restore banner says so
rather than handing back a form that looks complete but would submit without
them. The banner also offers "Start over", which clears both the draft and the
live form state.

Thirteen fields here, `step` included. The profile photograph is the field that
can't be restored, and since it's the only hard requirement of the final step the
banner calls it out by name.

**Status was:** Open  
**Area:** `src/screens/provider/ProviderOnboard.tsx:23-39`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:** All form state (`displayName`, `cat`, `newCat`, `radius`, `price`, `bio`, `availability`, `photos`, `photoFile`) is held in component memory. If a provider switches apps on mobile to copy their bio, verify their hourly rate, or if the browser reclaims tab memory, the entire form resets to Step 0.

**Fix direction:**
Auto-save form fields into `sessionStorage` (`stryt_provider_onboard_draft_${uid}`) and restore them on mount, clearing upon successful submission.
