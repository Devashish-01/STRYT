# Customer Onboarding Flow — Bug & Gap Log

**Purpose:** Documenting every real defect, broken control, data omission, and usability gap in the **Customer Onboarding flow** (`/auth/onboard`, `UserOnboard.tsx`, and the 4 beats in `src/screens/auth/onboard/`). Strictly focused on **maturing the existing implementation** and making customer onboarding production-ready and functional without introducing unrelated new features.

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Classification | Impact on Ready-to-Use |
| :--- | :--- | :--- | :--- |
| **#1** | Google sign-in silently skips Beat 0 | **Ready-to-Use Blocker** | New users never see identity confirmation or the Language Switcher (Hindi/Marathi) |
| **#2** | Un-debounced location search | **Ready-to-Use Blocker** | Typing triggers HTTP 429 from OpenStreetMap, blanking out search results |
| **#3** | Global `ob_beat` bleeds across accounts | **Ready-to-Use Blocker** | New accounts skip Location (Beat 2) if another user previously used the device |
| **#4** | Geolocation denial CTA loop | **Ready-to-Use Blocker** | "Allow location" CTA repeats denied error with no alternative action |
| **#5** | Blank area creates placeholder glitch | **Ready-to-Use Blocker** | Home header displays literal string `"neighborhood_placeholder"` |
| **#6** | Transition `setTimeout` unmount leak | **Ready-to-Use Blocker** | Redirects to `/home` even if user tapped "Sign out" during reveal |
| **#7** | Missing back navigation between beats | **Ready-to-Use Blocker** | Misspelled name or mistaken handle cannot be changed without finishing flow |
| **#8** | Skipped location leaves feed unranked | **Ready-to-Use Blocker** | Skipping location leaves `lat=0, lng=0`, breaking nearby sorting on Home |
| **#9** | Avatar upload during onboarding | *Deferred (By Design)* | Streamlined flow relies on Google avatar; photo upload exists in ProfileEdit |
| **#10** | Phone collection at onboarding | *Deferred (By Design)* | Phone is collected at first booking rather than during signup |
| **#11** | Notification radius slider | *Deferred (By Design)* | Belongs in Settings; meaningless to brand-new users |

---

## How to use this

- One entry per issue.
- **Status** is one of: `Open` · `Fixed` · `Won't fix` (with reason) · `By design` (with reason).
- Root cause cites the exact file/line/function/migration.
- Fix direction outlines the required frontend and backend modifications.

---

## #1 — Google sign-in silently skips Beat 0 (Identity confirmation & Language Switcher lost)

**Status:** Fixed — 2026-09-08 (client only)

The beat resolver opened with `if (isUnusableName(user.name)) return 0;` — so
anyone arriving from Google, who by definition **has** a usable name, was dropped
at beat 1 and never saw beat 0. Beat 0 is where the language switcher lives, so
a Hindi or Marathi speaker signing in with Google had no way to change language
during onboarding: they read the whole flow in English and found the setting
only afterwards.

The gate is now `if (!user.alias) return 0;` — anyone who hasn't yet chosen a
handle starts at beat 0. For a Google user that's one tap on a name they only
need to confirm, and it's the one screen where choosing a language still helps.
Resuming users are unaffected.

**Status was:** Open  
**Area:** `src/screens/auth/UserOnboard.tsx:51-56`, `src/screens/auth/onboard/BeatIdentity.tsx:1-20`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
In `UserOnboard.tsx:51-56`:
```ts
const [beat, setBeat] = useState(() => {
  if (isUnusableName(user.name)) return 0;
  if (!user.alias) return 1;
  const saved = Number(localStorage.getItem(BEAT_KEY) ?? 2);
  return Math.min(Math.max(Number.isFinite(saved) ? saved : 2, 2), TOTAL_BEATS - 1);
});
```
When a user signs up via Google OAuth (the primary sign-in method on `PhoneEntry.tsx:17-19`), `userService.me()` seeds `user.name` with `au.user_metadata.full_name`.
Therefore, `isUnusableName(user.name)` evaluates to `false`.
Because `user.alias` is not yet set, line 53 immediately triggers:
`if (!user.alias) return 1;`

This **completely bypasses Beat 0 (`BeatIdentity.tsx`) on the user's first login**.
1. `BeatIdentity` was explicitly designed with the **Language Switcher** (English, Hindi, Marathi) at the very bottom so non-English speakers can select their language before reading the flow. The comment in `BeatIdentity.tsx:18-20` explicitly states:
   > *"The language switcher lives here rather than in a step of its own: it costs one row on the first screen, and putting it any later means a Hindi or Marathi speaker reads the whole flow in English to reach it."*
   Because Beat 0 is skipped, the user never sees the language switcher on their first screen.
2. `BeatIdentity` is where the user confirms their name and Google avatar. The comment in `BeatIdentity.tsx:10-12` states:
   > *"Google already gave us a real name and avatar... so for almost everyone this is a confirmation, not a form: one tap and they're past what used to be the two required fields."*
   Instead of one tap to confirm, it is never shown.
3. The street lamp progress indicator starts with Lamp 1 lit instead of Lamp 0, breaking the visual 4-lamp progression.

**Fix direction:**
In `UserOnboard.tsx`, determine the initial beat by checking whether Beat 0 was completed (e.g. `localStorage.getItem(\`ob_beat_${user.id}\`) === null`). A brand new user should always see Beat 0 first to confirm their name and set their language.

---

## #2 — Search-as-you-type in `BeatLocation` has no debounce (OSM Nominatim 429 rate limit risk)

**Status:** Fixed — 2026-09-08 (client only)

`onChange={(e) => void search(e.target.value)}` fired a `forwardGeocode` per
keystroke. Nominatim's published policy is one request per second and it answers
a burst with HTTP 429, so typing a neighbourhood name at any normal speed got the
search rate-limited and the results list went blank — a failure mode
indistinguishable from "no such place".

Debounced to 400 ms, with the in-flight request token-guarded so a slow early
response can't overwrite a later one's results. Added a spinner while a search is
in flight and an explicit "No match" line, so an empty list now says which of the
two things it means.

**Status was:** Open  
**Area:** `src/screens/auth/onboard/BeatLocation.tsx:101-109, 156`, `src/lib/geocode.ts:420-425`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
In `BeatLocation.tsx`:
```tsx
<input
  className="input ob-search-input"
  value={query}
  onChange={(e) => void search(e.target.value)}
/>
```
And:
```ts
async function search(q: string) {
  setQuery(q);
  if (q.trim().length < 2) { setResults([]); return; }
  try {
    setResults(await forwardGeocode(q));
  } catch {
    setResults([]);
  }
}
```
There is **zero debouncing**. Contrast this with `BeatHandle.tsx:75-89` which uses a 400ms debounce timer with a sequence ref (`checkSeq.current`).
In `BeatLocation.tsx`, every single character typed in the search box immediately invokes `forwardGeocode(q)`. If Mapbox token is absent or fails, it hits OpenStreetMap Nominatim. Nominatim has a strict 1 request/second limit. Rapid typing instantly triggers HTTP 429 / network errors, which causes `search()` to catch and clear results (`setResults([])`), leaving the search dropdown completely blank while the user is actively typing.

**Fix direction:**
Add a 350ms–400ms debounce timer and request sequence ref to `BeatLocation.tsx` so `forwardGeocode` only fires after the user pauses typing.

---

## #3 — Global `localStorage` key `ob_beat` bleeds between different accounts on the same device

**Status:** Fixed — 2026-09-08 (client only)

`ob_beat` was a single global localStorage key. On a shared or handed-down phone
one account's progress carried into the next: a brand-new user signing in after
someone who had reached beat 3 was dropped straight at Interests, skipping
Location entirely, and landed on an unranked Home with no idea why. Keyed per
user id now.

**Status was:** Open  
**Area:** `src/screens/auth/UserOnboard.tsx:38, 54, 64, 89`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
In `UserOnboard.tsx`:
```ts
const BEAT_KEY = "ob_beat";
```
The state key `ob_beat` in `localStorage` is **global and not scoped to `user.id`**.
If User A uses a device or browser, advances to Beat 3, but signs out before finishing, and then User B (a brand new user!) signs in on the same browser:
When `UserOnboard.tsx` mounts for User B:
```ts
const saved = Number(localStorage.getItem(BEAT_KEY) ?? 2);
return Math.min(Math.max(Number.isFinite(saved) ? saved : 2, 2), TOTAL_BEATS - 1);
```
`saved` will read `3` from User A's leftover local storage!
User B will be skipped straight to Beat 3 (Interests), completely bypassing Beat 2 (Location)!
User B will never be prompted to grant GPS or set their area, leaving their coordinates as `0, 0` or null.

**Fix direction:**
Scope the local storage key to `user.id`:
`const beatKey = \`ob_beat_${user.id}\`;`

---

## #4 — Geolocation denial CTA loop (endless "Allow" prompt with no alternative)

**Status:** Fixed — 2026-09-08 (client only)

Once permission is denied the browser/OS won't re-prompt, but the CTA still read
"Allow location" and still called `requestGps()` — so it replayed the same error
forever. After a denial the primary action becomes "Search for your area
instead" and focuses the field that does still work.

**Status was:** Open  
**Area:** `src/screens/auth/onboard/BeatLocation.tsx:117-125, 148`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
In `BeatLocation.tsx`:
```tsx
ctaLabel={found ? t("ob_continue") : locating ? t("ob_beat3_locating") : t("ob_beat3_allow")}
onCta={() => (found ? onDone(place) : requestGps())}
```
If the user denies browser location permissions:
1. `denied` is set to `true`.
2. An inline hint is rendered: `t("ob_beat3_denied")` (*"Location permission was denied. You can search for your neighborhood below."*).
3. HOWEVER, the primary CTA button remains **"Allow location access"** (which calls `requestGps()`).
4. Clicking the button simply triggers the browser permission denial error callback instantly again.
5. The button does NOT transform into "Search neighborhood" or auto-focus the search input.
6. The user is stuck staring at a button that repeats the denied error, and their only escape route is noticing the subtle "Skip for now" link.

**Fix direction:**
When `denied === true`, update the CTA label to `"Search your area"` and have `onCta` focus the search input, or highlight the search input field.

---

## #5 — Blank reverse-geocoded area creates `"neighborhood_placeholder"` string on Home header

**Status:** Fixed — 2026-09-08 (client only)

Home fell back to `t("neighborhood_placeholder")` — which is the *example text
for an input box*, "e.g. Amanora Park Town, Pune". Rendered in the header where
the user's own neighbourhood goes, it reads as a real answer that happens to be
wrong: users in Bangalore saw "Pune".

**Correction to this entry:** it says the literal string
`"neighborhood_placeholder"` is displayed. It isn't — the key resolves through
`t()`, so what appears is the translated example. Still wrong, but a milder
symptom than described.

The fallback is now "Set your area", and the header it sits in was already the
button that opens the location picker.

**Status was:** Open  
**Area:** `src/screens/auth/onboard/BeatLocation.tsx:89-91`, `src/screens/auth/UserOnboard.tsx:148-150`, `src/screens/Home.tsx:98`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
In `BeatLocation.tsx:89`:
```ts
const area = (await reverseGeocode(latitude, longitude).catch(() => null)) ?? "";
```
If reverse geocoding fails or returns an empty area name (e.g. coordinates on an unmapped road, satellite GPS fix with slow network, or OSM timeout):
`place.area` is `""`.
In `UserOnboard.tsx:148`:
```ts
await userService.setLocation(p.lat, p.lng, p.area || undefined);
if (p.area) setArea(p.area);
```
1. `p.area || undefined` is `undefined`.
2. `userService.setLocation` only updates `users.area` if `area !== undefined`. Because it is undefined, `users.area` remains `null`.
3. `if (p.area) setArea(p.area)` skips updating the in-memory `area` in `useApp()`.
4. When the user completes onboarding and lands on `Home.tsx:98`:
   `const area = rawArea || t("neighborhood_placeholder");`
   The header shows the literal fallback string `"neighborhood_placeholder"` ("Your neighborhood") instead of falling back to city or a friendly default label, giving the impression of an unconfigured or broken profile.

**Fix direction:**
If `reverseGeocode` returns an empty area, fall back to city name or a friendly localized default (e.g. `"Near you"` or the nearest recognized locality) before calling `onDone`.

---

## #6 — Transition `setTimeout` unmount leak forcibly redirects after sign out

**Status:** Fixed — 2026-09-08 (client only)

`setTimeout(() => nav("/home"), 1100)` was fire-and-forget, so tapping "Sign out"
during the 1.1 s reveal signed you out and then pushed you to `/home` anyway,
landing a signed-out user on an authed route. The handle is held in a ref and
cleared on unmount.

**Status was:** Open  
**Area:** `src/screens/auth/UserOnboard.tsx:95-96`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
In `UserOnboard.tsx`:
```ts
async function finish(interestCategoryIds: string[]) {
  ...
  setRevealing(true);
  setTimeout(() => nav("/home", { replace: true }), 1100);
}
```
If the user clicks "Sign out" (`signOut()` on line 175) or presses the browser back button during that 1100ms window:
1. The unmounted component timer still fires `nav("/home", { replace: true })`, forcibly redirecting the user into `/home` even if they intended to exit or sign out.
2. The timer is unmanaged and lacks cleanup.

**Fix direction:**
Store the timer in a `useRef` and clear it on unmount or in a `useEffect` cleanup handler.

---

## #7 — Missing back navigation between beats traps users from correcting input

**Status:** Fixed — 2026-09-08 (client only)

A back control on every beat after the first. Every beat commits as it
completes, so stepping back re-opens a question whose answer is already saved and
re-answering overwrites it — no extra persistence needed. Hidden during the
reveal and while a save is in flight, since neither is a moment when going back
means anything.

**Status was:** Open  
**Area:** `src/screens/auth/UserOnboard.tsx`, `src/screens/auth/onboard/BeatFrame.tsx:40-65`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
`BeatFrame.tsx` has NO back button or previous step navigation.
Once a user advances from Beat 0 → 1 → 2 → 3:
- If a user tapped a suggested handle in Beat 1 and hit "Continue", but realizes they wanted to customize their handle or misspelled their name in Beat 0, there is **NO Back button** anywhere on the screen.
- The top bar only renders `BrandLockup`.
- The bottom bar only has "Continue" (or "Skip") and "Sign out".
- If the user presses the browser/hardware back button, it pops them out of `/auth/onboard` back to `/` or the previous website, but upon re-entering they are forced back to `/auth/onboard` at whatever beat is saved in `localStorage`.
- There is zero way to return to Beat 0 or Beat 1 without completing onboarding and later hunting through profile settings.

**Fix direction:**
Add a back arrow button (`<button onClick={() => setBeat(b => b - 1)}>`) in `BeatFrame` header when `beat > 0`.

---

## #8 — Skipped location leaves `lat=0, lng=0` with no default city fallback, breaking Home ranking

**Status:** Fixed — 2026-09-08 (client only)

Skipping leaves `lat/lng` at the seeded `0, 0`.

**Correction to this entry:** the feed is not ranked against the Gulf of Guinea.
Every discovery call already passes `user.lat || undefined`, so `0` degrades to
"no location" and the feed comes back *unranked* rather than wrongly ranked. The
real defect is that nothing said so — nothing on screen distinguished "nothing
nearby" from "we don't know where you are", and the header (#5) showed an
example area as if it were the user's own.

A `LOCATION_SKIPPED_KEY` flag plus a `hasNoLocation()` helper in the new
`src/lib/locationPrompt.ts`; Home shows "Set your area to see what's actually
near you" under the header, attached to the picker that fixes it.

**Status was:** Open  
**Area:** `src/screens/auth/onboard/BeatLocation.tsx:155-158`, `src/screens/Home.tsx:114-122`

**Reported:** "only those which will make the app ready to use not anything new just to mature the existing i want"

**Root cause:**
If the user clicks "Skip for now" on Beat 2 (`BeatLocation`):
- `user.lat` remains `0` and `user.lng` remains `0` (or `null`).
- `user.area` remains `null`.
- On `Home.tsx`:
  ```ts
  discoveryService.businesses({ lat: user.lat || undefined, lng: user.lng || undefined, sort: "nearby" })
  ```
  If `user.lat` is `0`, `0 || undefined` evaluates to `undefined`.
  `discoveryService.businesses` receives no coordinates, so it cannot compute distance or sort listings by proximity.
  The customer is left on Home with an empty or unranked feed, with no fallback city (e.g. Pune/Mumbai) to populate initial discovery content.

**Fix direction:**
When location is skipped, assign a default metropolitan coordinate fallback (or trigger the location picker sheet on first Home view) so discovery queries return populated rails instead of blank states.
