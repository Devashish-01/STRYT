# Business Onboarding Flow — Bug & Gap Log

**Purpose:** Every real defect, missing control/button, validation flaw, and usability or architectural gap found during the **Business Onboarding flow** audit (`/onboard/business`) gets one entry here.

## Maturation Triage: Ready-to-Use vs. Deferred

To ensure the app becomes **production-ready and usable immediately without scope creep**, all gaps are partitioned into:
1. **Core Maturation (Ready-to-Use Blockers):** Real defects, data corruption bugs, user traps, and missing essential controls on existing features.
2. **Deferred (New Features / Enhancements):** Additions not strictly required for completing onboarding or viewing functional listings.

| Gap # | Title | Classification | Impact on Ready-to-Use |
| :--- | :--- | :--- | :--- |
| **#1** | Unauthenticated user entry dead end | **Ready-to-Use Blocker** | 401 error after 15 mins of data entry with zero recovery |
| **#2** | Missing 5-business limit pre-flight | **Ready-to-Use Blocker** | Form crashes on submit if user already owns 5 businesses |
| **#3** | Form draft auto-save | *Deferred (New Feature)* | Enhancement for background resume; not a blocker |
| **#4** | Missing delete/trash button on photos | **Ready-to-Use Blocker** | Wrong photo cannot be removed without full page refresh |
| **#5** | Cover photo selection & reordering | *Deferred (Enhancement)* | First photo works as default cover |
| **#6** | Photo upload file size validation | **Ready-to-Use Blocker** | High-res camera photos crash Supabase upload silently |
| **#7** | Location search bar / autocomplete | *Deferred (New Feature)* | Map pin & GPS already function |
| **#8** | Silent Continue button disable on lat/lng | **Ready-to-Use Blocker** | Form disables next button with zero error feedback |
| **#9** | Reverse geocode overwriting custom text | **Ready-to-Use Blocker** | Wipes user's manual city/pincode entry |
| **#10** | Phone input `+91`/`0` clipping bug | **Ready-to-Use Blocker** | `maxLength=10` truncates numbers, blocking submission |
| **#11** | Store hours wiped when bookings disabled | **Ready-to-Use Blocker** | Retail/cafes get NULL hours in DB; breaks listing |
| **#12** | Business bio/description field | *Deferred (Enhancement)* | Can already be edited in Manage Profile |
| **#13** | WhatsApp & business email fields | *Deferred (New Feature)* | Secondary contact channels; phone already collected |
| **#14** | Category chips single-word truncation | **Ready-to-Use Blocker** | Mangles category labels ("Home", "Pet", "Real") |
| **#15** | Propose custom category | *Deferred (New Feature)* | Existing catalog covers standard verticals |
| **#16** | Generic categories lock out package picker | **Ready-to-Use Blocker** | Owners cannot select page type |
| **#17** | Hardcoded 3,247 nearby users copy | *Deferred (Cosmetic)* | Non-blocking display copy |
| **#18** | Missing context switch & dead-end nav | **Ready-to-Use Blocker** | User left in customer mode instead of new dashboard |
| **#19** | Race condition between `addRole` & `refreshUser` | **Ready-to-Use Blocker** | User loses `business_owner` role on refresh |
| **#20** | Unconditional `isOpenNow: true` at midnight | **Ready-to-Use Blocker** | Corrupts live open status badge |
| **#21** | Orphaned storage files on DB fail | *Deferred (Hygiene)* | Backend storage hygiene; doesn't break user flow |
| **#22** | Redundant `submitForReview` call | **Ready-to-Use Blocker** | Eliminates duplicate failing HTTP roundtrip |
| **#23** | Admin notification trigger | *Deferred (New Feature)* | Notification system enhancement |
| **#24** | Missing "Under Review" banner | **Ready-to-Use Blocker** | Merchant has no visibility on review status |

---

## How to use this

- One entry per issue.
- **Status** is one of: `Open` · `Fixed` · `Won't fix` (with reason) · `By design` (with reason).
- Root cause cites the exact file/line/function/migration.
- Fix direction outlines the required frontend and backend modifications.

---

## #1 — Unauthenticated user entry dead end (no auth pre-flight or redirect)

**Status:** Fixed — 2026-09-08 (client only)

Signed-out visitors could fill in all four steps and only find out at submit, as
a 401 with no route back. Bounced at the door with a `next` state so signing in
resumes here.

**Status was:** Open  
**Area:** `src/App.tsx:643`, `src/screens/business/BusinessOnboard.tsx:31-150`, `src/services/marketplace/businessService.ts:686`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** `<Route path="/onboard/business" element={<BusinessOnboard />} />` in `App.tsx` has no authentication wrapper or guard. Inside `BusinessOnboard.tsx`, there is no auth check on mount. An unauthenticated guest can navigate to `/onboard/business`, spend 10–15 minutes filling in Step 0 (name, category, radius), Step 1 (pin location, address, city, pincode), Step 2 (selecting up to 4 photos, opening offer), and Step 3 (phone number, opening date, weekly operating hours, package type), and click "Submit for review". Only inside `submit()` does `businessService.create` fail:
```ts
if (!uid) throw toApiError({ code: "UNAUTHENTICATED", message: "Sign in to list a business" }, 401);
```
The user is shown a toast: *"Sign in to list a business"*, but is **not redirected to sign in or register**. If the user navigates away to log in, all filled data and uploaded photo blobs are permanently erased.

**Fix direction:**
1. In `BusinessOnboard.tsx`, check `user.id` on mount. If unauthenticated, render a sign-in wall (or redirect to `/login?redirect=/onboard/business`).
2. Alternatively, preserve the entire onboarding draft in `localStorage` (`stryt_business_onboard_draft`) so the user can log in/sign up and seamlessly resume from where they left off.

---

## #2 — Missing pre-flight check for the 5-business per-owner limit

**Status:** Fixed — 2026-09-08 (client only)

The cap is a `BEFORE INSERT` trigger (`trg_enforce_business_owner_limit`), and
`businessService.create` already turns its error into a readable message — but
only *after* four steps of typing and every photo uploaded. A pre-flight on
`ownedBusinessIds` now shows a dedicated screen before any of that, with routes
to manage an existing shop. The trigger remains the real boundary; this is only
about when the user learns.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:31-65`, `src/screens/ManageHub.tsx:67`, `supabase/migrations/20260824_business_owner_limit.sql:29-33`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** PostgreSQL trigger `trg_enforce_business_owner_limit` enforces a maximum of 5 active businesses per user (`if v_count >= 5 then raise exception 'BUSINESS_OWNER_LIMIT_REACHED'`). While `ManageHub.tsx:67` conditionally hides its "+ Add a business" button when `businesses.length >= 5`, all other entry points across the app do not:
- `Home.tsx:602` & `851` ("List your spot")
- `AccountSwitcher.tsx:109` ("Add business")
- `RoleSwitcher.tsx:100` ("Add business")
- `HatSwitcherCard.tsx:54` ("List your business")
- Direct URL entry (`/onboard/business`)

`BusinessOnboard.tsx` never checks `ownedBusinessIds.length >= 5` on mount. An owner already at the cap is permitted to fill out all 4 steps, only to have final submission reject with *"You've reached the limit of 5 businesses — manage an existing one instead."*

**Fix direction:**
1. In `BusinessOnboard.tsx`, check `ownedBusinessIds.length >= 5` on mount.
2. If at capacity, immediately show a blocked state banner with a button directing them to `ManageHub` to manage their existing businesses.

---

## #3 — Zero state persistence / draft auto-save (catastrophic data loss on refresh/sleep)

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

Sixteen fields are covered here, `step` included, so resuming returns to the
question the owner left on. A restored city or pincode also re-arms the
`touched` refs from #9 — otherwise the next pin nudge would reverse-geocode over
values the owner had already typed and the draft had faithfully restored.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:35-64`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** All 15+ onboarding state variables (`name`, `cat`, `sub`, `broadcastRadius`, `address`, `city`, `pincode`, `hoursRaw`, `photos`, `phone`, `openDate`, `offer`, `lat`, `lng`, `packageOverride`, `bookingsOverride`) live exclusively in local React component state (`useState`). If a user on mobile switches to WhatsApp to ask their partner for the shop's GST/pincode, or if the mobile OS reclaims memory, or if the page reloads, the component unmounts and **all progress is completely lost**. The user is reset to Step 0 with empty inputs.

**Fix direction:**
1. Auto-save text and option fields to `sessionStorage` or `localStorage` keyed by user ID (e.g. `stryt_biz_onboard_draft_${uid}`).
2. On mount, detect existing draft and offer "Resume draft" or automatically restore values.
3. Clear the draft upon successful submission.

---

## #4 — Uploaded shop photos cannot be deleted or replaced (missing delete/trash button)

**Status:** Fixed — 2026-09-08 (client only)

Each thumbnail gained a remove button, and the first is labelled COVER so the
cover-photo consequence of ordering is visible. Previously the only remedy for a
wrong pick was reloading the form, losing every other answer with it.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:301-320`

**Reported:** "any button should be there which is not in the app make a list of all the gaps"

**Root cause:** In Step 2 (Photos), when a user picks photos from their device camera/gallery, the thumbnails are rendered as:
```tsx
{photos.map((p, idx) => (
  <img key={idx} src={p.previewUrl} alt={`Shop photo ${idx + 1}`} className="thumb" style={{ width: 96, height: 96, borderRadius: 12, objectFit: "cover" }} />
))}
```
There is **NO delete button, NO trash icon, and NO "X" badge** anywhere on the uploaded photos. If an owner accidentally selects the wrong image, a personal photo, or a duplicate, they **cannot remove it**. The only way to discard an erroneous image is to refresh the entire webpage and start onboarding from scratch.

**Fix direction:**
1. Wrap each thumbnail in a relative container with an absolute-positioned close button (`X` icon).
2. Tapping the button calls `setPhotos(prev => prev.filter((_, i) => i !== idx))` and invokes `URL.revokeObjectURL(p.previewUrl)`.

---

## #5 — No ability to choose cover photo (arbitrary first-photo hardcoding)

**Status:** Fixed — 2026-09-08 (client only)

The cover was silently `uploadedUrls[0]`, with nothing on screen saying so and
no way to change it. Every photo after the first now carries a "COVER" button
that promotes it to the front, and the current cover carries a matching badge —
so the badge states the consequence and the button is how you act on it.

Promoting to the front rather than swapping with position 0 keeps the rest of the
gallery in the order the owner added it, which is the order they'll expect to see
it in on the listing.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:127-128, 301-320`

**Reported:** "any button should be there which is not in the app"

**Root cause:** In `submit()`, the cover photo is hardcoded as the first element in the array:
```ts
coverImage: uploadedUrls[0] || undefined,
gallery: uploadedUrls.length > 0 ? uploadedUrls : undefined,
```
There is no visual indicator showing which photo will be the public banner (no "Cover Photo" pill), no button to "Set as Cover", and no drag-and-drop or reorder buttons. The owner cannot choose which picture represents their storefront.

**Fix direction:**
1. Mark the first photo with a visible "Cover" badge.
2. Add a "Set as Cover" action or reorder arrows on photo cards.

---

## #6 — Missing photo validation (file size, dimensions, formats) & memory leak

**Status:** Fixed — 2026-09-08 (client only)

Type and size are now checked before a file is accepted (8 MB cap, common image
types). Both were unchecked, and Supabase's rejection was swallowed by
`upload()`'s data-URL fallback, so an oversized phone photo simply never
appeared with no error anywhere.

The leak half is fixed too: `URL.createObjectURL` was never revoked, so up to
four full-size images stayed pinned in memory for the life of the document.
Revoked on removal and on unmount.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:309-317`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:**
1. The `<input type="file" accept="image/*">` change handler pushes files into state without checking file size (e.g. 20MB+ DSLR shots or unsupported RAW formats).
2. It generates `URL.createObjectURL(file)` on every upload without ever calling `URL.revokeObjectURL()`, creating browser memory leaks during long sessions.
3. If an oversized file fails to upload during `Promise.all(photos.map(...))` on Step 3, the entire onboarding fails with an uninformative error after all 4 steps were filled.

**Fix direction:**
1. Enforce a 5MB/10MB file limit with immediate toast feedback on selection.
2. Revoke object URLs on photo removal and component unmount.

---

## #7 — LocationPicker lacks search bar / address autocomplete (trapped on device GPS)

**Status:** Fixed — 2026-09-08 (client only)

`LocationPicker` gained an address search wired to `forwardGeocode`, which
already existed in `src/lib/geocode.ts` and had no caller in this component.
Picking a result drops the pin there; the map stays interactive, so a geocode
that's close but not exact is a starting point to nudge rather than a final
answer.

Debounced 400 ms and token-guarded — same reasoning as CUSTOMER_ONBOARDING #2.
Nominatim allows roughly one request per second and answers a burst with HTTP
429, whose symptom is an empty result list indistinguishable from "no such
place". An explicit "No match" line now distinguishes the two.

Enabled by default, so all four call sites get it (business onboarding, provider
onboarding, `ProfileEditor`, and the delivery-address picker in
`AppointmentSheet`, where "not where I'm standing" is just as common). A
`searchable={false}` escape exists for any caller where the pin is definitionally
"here".

**Status was:** Open  
**Area:** `src/components/LocationPicker.tsx:82-149`, `src/screens/business/BusinessOnboard.tsx:261-282`, `src/lib/geocode.ts:384-440`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** `LocationPicker.tsx` provides only a Leaflet map and a "Detect my location" GPS button. It has **NO search bar or locality autocomplete**.
If a business owner is setting up their shop listing while at home, at their accountant's office, or anywhere other than the shop premises, tapping "Detect my location" places the pin at their current physical position. To position the pin at the shop, they must manually drag and pan across kilometers of map tiles on a tiny 190px box. The codebase already contains `forwardGeocode(query)` in `src/lib/geocode.ts`, but it is completely unused in `LocationPicker`.

**Fix direction:**
1. Add an address/locality search bar at the top of `LocationPicker`.
2. Connect the search bar to `forwardGeocode()` to let users type an area, street, or landmark (e.g., "Koregaon Park, Pune") and instantly center the pin.

---

## #8 — Silent "Continue" button disable when location pin is missing (no error guidance)

**Status:** Fixed — 2026-09-08 (client only)

A `blockedReason` line above the button naming the one thing still missing.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:62-63, 98, 399`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** `lat` and `lng` start as `null`. Step 1 validation requires:
```ts
address.trim().length > 4 && city.trim().length > 1 && lat !== null && lng !== null
```
If a user denies location permissions or is on a browser where GPS times out, the map loads at the default city center, but `lat` and `lng` remain `null`. The user enters Address, City, and Pincode, and finds the **"Continue" button disabled (greyed out)**. There is **no error message or helper text** explaining why the button is inactive. Users are left confused with no feedback.

**Fix direction:**
1. If `lat === null || lng === null`, show a prominent warning beneath the map: *"Please tap the map to set your shop's exact location pin."*
2. Alternatively, allow tapping "Continue" to trigger field validation with inline error messages.

---

## #9 — Reverse geocoding silently overwrites manually entered City & Pincode

**Status:** Fixed — 2026-09-08 (client only)

`reverseGeocodeFull` ran on **every** pin nudge and assigned City and Pincode
unconditionally, so a hand-typed correction was silently reverted the next time
the map moved. Two `touched` refs now mark either field as the owner's the
moment they type in it; the geocode only fills what's still untouched.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:268-280`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `LocationPicker`'s `onChange`:
```tsx
const res = await reverseGeocodeFull(newLat, newLng);
if (res) {
  if (res.city) setCity(res.city);
  if (res.pincode) setPincode(res.pincode);
}
```
If the owner has already typed their preferred city or postal code (e.g. "Pimpri-Chinchwad" or "411033"), adjusting the pin on the map triggers reverse geocoding asynchronously and unconditionally overwrites their custom input with OpenStreetMap's geocoded output.

**Fix direction:**
Only auto-populate `city` and `pincode` if the corresponding fields are currently empty, or prompt the user before replacing existing text.

---

## #10 — Phone input truncation bug on `+91` / `0` country code prefixes

**Status:** Fixed — 2026-09-08 (client only)

`maxLength={10}` counted **raw keystrokes**, not digits. Typing "+91 98765 43210"
was clipped to "+91 98765 " before the non-digit strip ran, leaving 7 digits and
a Continue button that could never enable — with nothing on screen explaining
why. The cap now applies to digits, and keeping the **last** ten drops a country
code or leading zero rather than the real number.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:100, 334`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** The phone input is structured as:
```tsx
<input className="input" inputMode="numeric" maxLength={10} placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
```
And `canNext` checks `phone.replace(/\D/g, "").length === 10`.
Because `maxLength={10}` is enforced directly on the HTML input *before* stripping non-digits, if an Indian user pastes or types their number with `+91` or leading `0` (e.g. `+919876543210` or `09876543210`):
- `+919876543210` is clipped by `maxLength={10}` to `+919876543`.
- `replace(/\D/g, "")` then strips `+` to yield `919876543` (9 digits).
The user's actual phone number is truncated, and the validation blocks them from continuing without any explanation.

**Fix direction:**
1. Render a static `+91` prefix badge outside the input.
2. In the `onChange` handler, strip leading `+91`, `91`, or `0` before slicing to 10 digits.

---

## #11 — Store operating hours are wrongly hidden and nullified when bookings are disabled

**Status:** Fixed — 2026-09-08 (client only)

Hours were collected only when bookings were on, and written as
`wantsBookings ? hoursRaw : undefined` — so every retail shop, cafe or salon that
didn't take in-app reservations was filed with NULL hours and a listing showing
none. Opening hours are what a customer checks before walking over; only
`bookingsEnabled` should decide whether those hours can be reserved against. The
editor is now always shown and the value always persisted.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:124-126, 358-377`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `BusinessOnboard.tsx`:
```tsx
{wantsBookings && (
  <div className="card col gap-14" style={{ padding: 16 }}>
    <WeeklyHoursEditor initialRaw={hoursRaw} onChange={setHoursRaw} />
  </div>
)}
```
And during submission:
```ts
bookingsEnabled: wantsBookings,
hours: wantsBookings ? (hoursRaw || undefined) : undefined,
...(wantsBookings ? { isOpenNow: true } : {}),
```
Store operating hours (opening and closing times) are **100% conflated with appointment booking availability**.
If a retail grocery store, pharmacy, bakery, hardware store, or boutique selects a package with bookings disabled (or toggles off bookings):
1. The working hours editor is completely hidden from onboarding.
2. `hours` is submitted as `undefined` (NULL in Postgres).
3. The business is created with NO operating hours.
4. When customers view the shop on `BusinessDetail.tsx`, the store opening hours are missing, and `evaluateProviderAvailability` cannot determine if the shop is open or closed.

**Fix direction:**
Decouple store operating hours from appointment bookings. All physical businesses have operating hours (e.g. Mon-Sat 9AM-9PM). Always show the hours editor, and let `wantsBookings` toggle only whether customers can book appointment slots.

---

## #12 — Missing Business Description / Bio / "About" field in onboarding

**Status:** Fixed — 2026-09-08 (client only)

An "About your business" textarea on step 0, passed through as `description`.
No backend work: the column exists, `BusinessDetail` already renders it at the
top of the listing, and `ProfileEditor` already edits it — onboarding simply
never asked, so every new shop went live with a blank About section and had to
be told to go find Settings.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx`, `src/screens/business/BusinessDetail.tsx:384`, `src/screens/business/manage/ProfileEditor.tsx:21`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** The `businesses` table has a core `description` column, and `BusinessDetail.tsx` prominently renders the business description at the top of the page. `ProfileEditor.tsx` has a multi-line description input. However, throughout all 4 steps of `BusinessOnboard.tsx`, **there is NO field to write a business description or about section**. Every newly onboarded business starts with an empty bio, forcing the owner to hunt through settings after onboarding to describe what their shop offers.

**Fix direction:**
Add an "About your business" / "Description" textarea field in Step 0 (Basics) or Step 2 (Branding).

---

## #13 — Missing alternative contact channels (WhatsApp & business email)

**Status:** Fixed — 2026-09-08 (client only)

A WhatsApp field on step 3 with a **"Same as my contact number" checkbox, ticked
by default** — that's the true answer for nearly every shop here, so the common
case costs zero taps and only the exception needs typing. Plus an optional
business email. Both columns already existed on the table and in
`BUSINESS_COLUMNS`.

The email field notes that it stays hidden from the public listing until turned
on in Settings, since `show_email_publicly` defaults off — worth saying, because
an owner who types an address into an onboarding form reasonably assumes it will
be published.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:328-356`, `src/services/marketplace/businessService.ts:114-119`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In local commerce in India, WhatsApp is the predominant customer communication channel, and business email is required for official inquiries. The `businesses` table already includes `whatsapp`, `email`, `show_phone_publicly`, and `show_email_publicly`. However, `BusinessOnboard.tsx` only offers a single phone number field. There is no field to configure WhatsApp (or a checkbox "Same as phone number") or a contact email during onboarding.

**Fix direction:**
Add a WhatsApp input with a "Same as contact number" auto-fill checkbox, and an optional business email input in Step 3.

---

## #14 — Category chip names are truncated to single words (`split(" ")[0]`)

**Status:** Fixed — 2026-09-08 (client only)

`{c.name.split(" ")[0]}` mangled "Home Services" to "Home", "Pet Care" to "Pet",
"Real Estate" to "Real". Full names now, here and in `ProfileEditor.tsx`, which
the entry didn't cite.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:210`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** Category buttons on Step 0 render as:
```tsx
{c.icon} {c.name.split(" ")[0]}
```
Splitting on space damages multi-word categories:
- "Pet Care" renders as "Pet"
- "Home Services" renders as "Home"
- "Fitness & Gym" renders as "Fitness"
- "Real Estate" renders as "Real"
- "Automotive & Repairs" renders as "Automotive"
This creates ambiguous, truncated labels on the primary category picker.

**Fix direction:**
Render `c.name` in full (or use CSS `text-overflow: ellipsis` with appropriate chip sizing).

---

## #15 — No ability to propose or suggest a custom business category

**Status:** Fixed — 2026-09-08 (client only)

A "Propose a category" input on step 0, mirroring the provider flow, calling
`catalogService.proposeCategory(name, null, "BUSINESS")`. Typing in it clears
any selected category and its sub-categories, so the two can't both be set.

**Built with PROVIDER_ONBOARDING #2's bug already fixed**, not copied with it:
the provider version discarded `proposeCategory`'s return value and then wrote
`categoryId: cat ?? undefined` — `undefined` exactly when a category had been
proposed — producing a listing with no category and no category name at all.
Here the proposed row's own id and name are used; when the insert is refused by
RLS the service returns a synthetic `prop_` id, which is deliberately never
written as a foreign key, but the typed name still goes in as `categoryName` so
the shop is findable by what it says it is rather than by nothing.

`canNext` and the step-0 blocked-reason line both accept a proposed category, so
the Continue button doesn't stay grey for someone who has answered the
question.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:196-215` vs `src/screens/provider/ProviderOnboard.tsx:28-29, 74`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `ProviderOnboard.tsx`, when a service category is not found, the provider can type a custom category into `newCat`, which invokes `catalogService.proposeCategory(newCat.trim(), null, "SERVICE")`. In `BusinessOnboard.tsx`, there is no such capability. If an owner's trade is not in the predefined categories, they have no option to suggest or propose their actual business vertical.

**Fix direction:**
Add an "Other / Propose a category" chip and text input that calls `catalogService.proposeCategory(name, null, "BUSINESS")`.

---

## #16 — Generic categories lock owner out of choosing a page type

**Status:** Fixed — 2026-09-08 (client only)

`PackageConfirmCard` was rendered only when `bizThemeKey !== "generic"`, which is
exactly backwards: the owner whose category matched no package was the **one
person who couldn't choose a page type**, and was stuck with the generic console
permanently. The card is now always shown.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:383-390`, `src/components/PackageConfirmCard.tsx`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** `PackageConfirmCard` is conditionally rendered as:
```tsx
{bizThemeKey !== "generic" && (
  <PackageConfirmCard
    suggested={bizThemeKey}
    selected={effectivePackageKey}
    onChange={setPackageOverride}
    accentColor="var(--brand-600)"
  />
)}
```
If a category resolves to `"generic"`, the card is hidden completely. The owner is **never shown the page type selector** and cannot choose any package (Dining, Retail, Salon, Services, Clinic, etc.). They are permanently locked into the generic template without any button to switch.

**Fix direction:**
Always display `PackageConfirmCard` regardless of whether the suggested package is `"generic"`, allowing the user to select their desired vertical template.

---

## #17 — Hardcoded fake "3,247 nearby users" notification claim on success screen

**Status:** Fixed — 2026-09-08 (client only)

"3,247 nearby users" was a hardcoded literal shown to every owner in every city,
including the first shop in a brand-new market with no users at all. There's no
cheap honest count to put there, and a promise the app can't keep is worse than
no number — replaced with the shop's own broadcast radius, which is true and
which the owner just chose.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:162`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** On the submission confirmation screen:
```tsx
We'll verify your business within ~24 hours. Once approved, <span className="semi" style={{ color: "var(--ink-900)" }}>3,247 nearby users</span> get a silent heads-up that you're open.
```
The number `3,247` is hardcoded. It displays the same fictitious count whether the business is located in central Pune, rural areas, or a remote road. Meanwhile, the backend RPC `get_nearby_user_ids(lat, lng, radius)` exists specifically to calculate actual nearby customer counts.

**Fix direction:**
Fetch the real count of nearby users using `get_nearby_user_ids` or display dynamic localized copy (e.g. *"users within your 5 km reach"*).

---

## #18 — Missing context switch on completion & dead-end navigation to ManageHub

**Status:** Fixed — 2026-09-08 (client only)

`setContext({ type: "business", id, name })` before completion, and "Go to
dashboard" routes to `/business/:id/manage` rather than the generic `/manage`.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:140-142, 169`, `src/store.tsx:412-419`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** After successful business creation:
1. `activeContext` remains `{ type: "customer", id: null }`.
2. The "Go to dashboard" button calls `nav("/manage")` (ManageHub list), NOT the business management console (`/business/${biz.id}/manage`).
3. The merchant has to scroll through ManageHub and tap "Manage" again.
4. If they instead tap "Back to home", they are returned to customer mode with no indication of their newly created business.

**Fix direction:**
1. Upon creation, set `activeContext` to `{ type: "business", id: biz.id, name: biz.name }`.
2. Update "Go to dashboard" to navigate directly to `/business/${biz.id}/manage`.

---

## #19 — Asynchronous race condition between `addRole` and `refreshUser`

**Status:** Fixed — 2026-09-08 (client only, `store.tsx`)

Same root cause and same fix as PROVIDER_ONBOARDING #6 — `addRole` is now
awaitable and is awaited before `refreshUser()`, so the read-back can't
overwrite the freshly granted role. See that entry for why the functional
`setRoles` updater had to go.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:140-141`, `src/store.tsx:621-630`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `BusinessOnboard.tsx`:
```ts
addRole("business_owner");
await refreshUser();
```
In `store.tsx:626`, `addRole` executes:
`void userService.update({ roles: next });`
This is a fire-and-forget, un-awaited promise. `await refreshUser()` immediately runs in parallel, calling `sb.rpc("get_own_profile")` and setting `setRoles(me.roles)`.
If `refreshUser()` resolves before `userService.update()` finishes writing to Postgres, `refreshUser()` reads the old user profile (`roles = ['customer']`), silently overwriting the optimistic state and stripping `"business_owner"` from the user session.

**Fix direction:**
Make `addRole` async and `await userService.update()`, or ensure `refreshUser()` waits for in-flight profile mutations to complete.

---

## #20 — Unconditional `isOpenNow: true` hardcoding for booking-enabled shops

**Status:** Fixed — 2026-09-08 (client only)

`...(wantsBookings ? { isOpenNow: true } : {})` — a flat true, so a shop
submitted at midnight was published as open, and the "Open now" badge lied from
the first minute. Now derived from the hours just entered via
`evaluateProviderAvailability`, which is the same function the badge itself
reads, so the two cannot disagree.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:126`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `submit()`:
```ts
...(wantsBookings ? { isOpenNow: true } : {}),
```
Whenever `wantsBookings` is true, `is_open_now` is hardcoded to `true` in the database. If a business owner completes registration at midnight (2:00 AM) and specified working hours as 10:00 AM – 8:00 PM, their shop is permanently flagged as `isOpenNow: true`. The shop shows "Open Now" with a live green pulse on customer discovery and maps during the middle of the night until the owner manually finds the toggle in Settings.

**Fix direction:**
Do not hardcode `isOpenNow: true`. Allow `isOpenNow` to be derived dynamically from `evaluateProviderAvailability(hours, ...)` or default it based on the current time relative to the configured schedule.

---

## #21 — Orphaned Supabase storage files on database creation failure

**Status:** Fixed — 2026-09-08 (client only)

Photos upload before the row is inserted, so a failed insert left them in the
bucket with nothing referencing them and nothing that would ever collect them.
The attempt's URLs are now tracked and removed on failure via a new
`uploadService.remove(publicUrl)`.

That helper resolves `false` rather than throwing for anything it can't act on —
a data-URL from `upload()`'s fallback path (never in storage to begin with), a
URL from another bucket, or a delete the caller isn't allowed to make. Callers
are cleaning up after an error they're already reporting; a failure here must not
replace that error with a less useful one.

The URLs are also reused on retry, so a second attempt doesn't upload a fresh
copy of every photo.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:106-113`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `submit()`:
```ts
uploadedUrls = await Promise.all(
  photos.map((p) => uploadService.upload(p.file, "business-photo"))
);
const biz = await businessService.create({ ... });
```
Photos are uploaded to the public Supabase storage bucket `business-photo` **before** the database transaction occurs. If `businessService.create` fails (e.g. 5-business owner limit reached, network drop, database constraint error, or RLS block), the uploaded image files remain permanently in cloud storage as untracked, orphaned assets with no cleanup.

**Fix direction:**
Wrap the flow in a try/catch that calls storage deletion for uploaded files if row insertion fails, or defer full storage upload until row initialization.

---

## #22 — Redundant and non-atomic `submitForReview` call

**Status:** Fixed — 2026-09-08 (client only)

`businessService.create` already inserts with `status: 'PENDING'`, so the
`submitForReview(biz.id)` call immediately after it re-set the value it already
had. Worse than redundant: it was a second round trip that could fail on its
own, and when it did the business existed anyway while the owner saw an error
and — reasonably — retried, creating a duplicate listing. Call removed.

**Status was:** Open  
**Area:** `src/screens/business/BusinessOnboard.tsx:137-139`, `src/services/marketplace/businessService.ts:699, 723-732`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** In `businessService.create`, the row is already inserted with `status: "PENDING"`. Immediately following creation, `BusinessOnboard.tsx` executes:
```ts
if (biz?.id) {
  await businessService.submitForReview(biz.id);
}
```
`submitForReview` issues a second redundant HTTP request:
`UPDATE businesses SET status = 'PENDING', rejection_reason = null WHERE id = id`.
There is no atomic backend RPC managing the onboarding lifecycle (row insert, audit trail, admin review queue notification, role assignment). If the second call fails due to a network glitch, the listing is left in an ambiguous state.

**Fix direction:**
Remove the redundant `submitForReview` call after `create()`, or consolidate into a single database RPC `business_onboard(...)`.

---

## #23 — Missing admin notification when new business is submitted for review

**Status:** Fixed — 2026-09-08 (`20260933`)

Nothing told an admin that a business was waiting. The console has a queue, but
it's a screen somebody has to remember to open, while the onboarding screen
promises "~24 hours" — a promise nothing in the system was set up to keep.

`trg_notify_admins_business_pending` notifies every admin on the transition
**into** PENDING. Keyed on the edge rather than on INSERT so a resubmission after
a rejection notifies too — that's the same "something needs a decision" event,
and a rejected owner who fixed their listing is exactly who a silent queue
strands longest. `TG_OP` is checked rather than coalescing NEW/OLD, since OLD is
unassigned on INSERT and referencing it raises.

New `ADMIN_REVIEW_QUEUE` notification type. The type-drift guard in
`communityNotifications.test.ts` caught the missing `Notifications.tsx` icon
mapping on the first run, which is what it's for.

**Verified live** in a rolled-back transaction: `on_insert_pending` ✓,
`went_to_admins_only` ✓, `no_notify_on_approve` ✓, `resubmit_notifies` ✓,
`no_notify_on_other_edit` ✓. Run without `set local role` on purpose — the rows
belong to the admins, not the caller, and switching role would let RLS hide the
very rows being asserted on.

**Status was:** Open  
**Area:** `src/services/marketplace/businessService.ts:683-732`, `src/services/core/adminService.ts`, `supabase/migrations/`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** When a business is registered with status `PENDING`, **no notification, email, or webhook is generated for platform administrators**. There is no database trigger inserting into `admin_notifications` or alerting admins of pending submissions. A newly onboarded business sits silently in the database until an admin happens to log into the `/admin` review console.

**Fix direction:**
Create a database trigger on `businesses` (INSERT with status `PENDING`) to notify admin users or dispatch a notification event.

---

## #24 — Missing "Under Review" banner in ManageDashboard & public preview

**Status:** Fixed — 2026-09-08 (client only)

`AccountStatusBanner` returned `null` for anything that wasn't SUSPENDED or
REJECTED, so a business sat at PENDING — invisible in discovery — while its
console showed a normal dashboard, zero views, and no explanation. The commonest
reading of that is "the app is broken".

An "Under review" branch now states the ~24 hour expectation, that the listing
won't appear until approved, and that setup can continue meanwhile. Businesses
only: providers have no PENDING state (`providerService.create` inserts ACTIVE),
which is the same distinction the REJECTED branch already makes.

**Status was:** Open  
**Area:** `src/components/AccountStatusBanner.tsx:48-49`, `src/screens/business/manage/ManageDashboard.tsx:463`, `src/screens/business/BusinessDetail.tsx`

**Reported:** "find gaps while on boarding a new business flow"

**Root cause:** `AccountStatusBanner.tsx` explicitly ignores `PENDING`:
```ts
const showRejected = status === "REJECTED" && entityType === "BUSINESS";
if (status !== "SUSPENDED" && !showRejected) return null;
```
When an owner navigates to their newly onboarded business in `ManageDashboard`, no banner appears. The dashboard looks like a normal live business, giving the owner no indication that their listing is pending review and invisible to customers. Furthermore, if the owner opens the public profile (`/business/${id}`), it renders live booking and payment action buttons without any "Pending Approval" or "Private Preview" badge.

**Fix direction:**
1. Extend `AccountStatusBanner.tsx` to handle `status === "PENDING"` with an informational banner: *"Your listing is under review by STRYT admins and will be visible to nearby customers once approved."*
2. In `BusinessDetail.tsx`, render a "Preview Mode — Under Review" banner when viewed by the owner.
