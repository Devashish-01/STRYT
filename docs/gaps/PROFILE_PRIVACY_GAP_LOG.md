# STRYT — Flow 11.2: Profile Edit & Privacy Controls Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 11.2 — Domain 11 (Account, Multi-Role & Platform Security)  
**Primary Components:** [`ProfileEdit.tsx`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx), [`PrivacySettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/PrivacySettings.tsx), [`PublicProfile.tsx`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx), [`Profile.tsx`](file:///d:/zetax/name/STRYT/src/screens/Profile.tsx), [`UserProfileSheet.tsx`](file:///d:/zetax/name/STRYT/src/components/UserProfileSheet.tsx)  
**Backend Services & Tables:** [`userService.ts`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts), [`profileControlService.ts`](file:///d:/zetax/name/STRYT/src/services/core/profileControlService.ts), [`publicName.ts`](file:///d:/zetax/name/STRYT/src/lib/publicName.ts), `profile-control` Edge Function, `public.users`, `public.location_share_grants`, `public.providers`  
**Launch Readiness Status:** 🔴 **Critical Audit Blockers (Unverified Phone Number Mutation & Auth Desync, Missing RPC Alias Leaking Real Names on Public Profiles, Premature Avatar Auto-Commit, Disconnected Privacy State Overwrites)**

---

## 1. Executive Summary

Flow 11.2 governs personal profile management, customer discoverability, and granular privacy controls across STRYT. The flow spans three primary screens:
1. **Profile Editor ([`ProfileEdit.tsx`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx)):** Manages core user identity including display name, unique `@alias` handle, profile avatar, contact phone, neighborhood name, GPS coordinate geolocation, and individual field privacy toggles.
2. **Privacy & Visibility Settings ([`PrivacySettings.tsx`](file:///d:/zetax/name/STRYT/src/screens/settings/PrivacySettings.tsx)):** Configures high-level customer profile visibility (`customerEnabled`), community post visibility (`showPostsPublicly`), service request visibility (`showAsksPublicly`), and trust badge exposure (`showBadgesPublicly`).
3. **Public Profile Consumer ([`PublicProfile.tsx`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx)):** Renders the public-facing profile card, social statistics, community posts, requests, trust badges, and exact-location request gates as viewed by neighbors and prospective counterparties.

While STRYT's privacy architecture incorporates thoughtful server-side primitives (such as the `get_public_profile` RPC, PII column revokes under ISS-009, and cryptographic alias lookup), thorough line-by-line inspection of the implementation revealed critical authentication and privacy vulnerabilities:

1. **Unverified Phone Number Mutation Decouples Auth Identity & Creates Hijack Vector (P0):** In `ProfileEdit.tsx`, the mobile number is rendered as a plain text input. Submitting the form calls `userService.update({ phone })`, directly modifying `public.users.phone` in Postgres without an SMS OTP verification challenge. In STRYT, mobile phone is the primary Supabase Auth authentication credential. Directly updating the application profile phone leaves `auth.users.phone` unchanged, breaking subsequent OTP logins, orphaning user profiles, and allowing users to arbitrarily claim another person's phone number on public profiles.
2. **`get_public_profile` RPC Omits `alias` Column, Leaking Real Names to Strangers (P0):** In database migration `20260821_show_name_publicly.sql`, the `get_public_profile` RPC function omits `u.alias` from its return table definition. As a result, `userService.publicProfile()` always receives `alias: null`. When `showNamePublicly` is `false` (the default setting intended to keep the user's real name confidential), [`publicName.ts:aliasName()`](file:///d:/zetax/name/STRYT/src/lib/publicName.ts#L75-L85) finds an empty alias and falls back to `firstName(input?.name)`. This directly exposes the user's real first name to arbitrary visitors on every public profile view, completely undermining the privacy guarantee of the `@alias` handle.
3. **Premature Avatar Auto-Commit Decoupled from Form Lifecycle (P1):** In `ProfileEdit.tsx`, selecting an image from the file picker immediately uploads the file and executes `await userService.update({ avatar: url })`. If the user cancels their other edits, hits the Back button, or abandons the screen, the avatar change has already been permanently committed to the database without tapping "Save Changes".
4. **Public Profile Conflates Coarse Area with Exact Coordinates, Hiding Neighborhoods (P1):** In `PublicProfile.tsx`, `u.area` (the coarse neighborhood name, e.g. "Koramangala") is conditionally masked behind `{isSelf || locStatus === "APPROVED"}`. Visitors without an approved exact GPS location grant are shown *"📍 Location shared on request"* instead of the neighborhood name, completely ignoring the user's `showCityPublicly` privacy setting and breaking locality discovery.
5. **Rating Privacy Toggle Ignored in Public Profile Hero Header (P1):** `ProfileEdit.tsx` provides a `showRatingPublicly` toggle. While the lower social statistics card in `PublicProfile.tsx` honors this flag, the prominent hero header renders the star rating badge unconditionally, leaking the user's review rating even when set to private.
6. **Duplicated Privacy Toggles Cause Silent Stale State Overwrites (P1):** `showPostsPublicly`, `showAsksPublicly`, and `showBadgesPublicly` are exposed in both `ProfileEdit.tsx` and `PrivacySettings.tsx`. While `PrivacySettings.tsx` writes updates immediately, `ProfileEdit.tsx` buffers them in local state on mount. If a user edits preferences in `/settings/privacy` and later saves their name or neighborhood in `/profile/edit`, the stale buffered state in `ProfileEdit` silently reverts the settings made in `/settings/privacy`.
7. **Inability to Clear Public Alias in `ProfileEdit` (P1):** Clearing the `@alias` field sends `alias: cleanAlias || undefined`. Because `pickColumns()` strips `undefined` values, the update query never sends `alias: null` to Supabase, making it impossible for a user to delete their existing handle.
8. **Provider Coordinates Left Stale on Location Update (P1):** When a user changes their neighborhood or coordinates in `ProfileEdit`, `userService.update()` syncs `avatar` and `name` to the user's `providers` profile, but fails to sync `lat` and `lng`. A service provider who moves home has their provider listing left pinned to their old location.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **PROF-1** | Direct Phone Edit Bypasses Supabase Auth OTP & Desyncs Auth Identity | 🔴 P0 (Critical Security & Auth Corruption) | Editing phone in ProfileEdit modifies `public.users.phone` without OTP. Decouples profile from `auth.users`, breaks subsequent logins, and creates phone hijacking vector. |
| **PROF-2** | `get_public_profile` RPC Omits `alias`, Leaking Real Names on Public Profiles | 🔴 P0 (Critical Privacy & Data Leak) | The RPC return definition lacks `alias`. `publicProfile()` always returns `alias: null`, causing `aliasName()` to fall back to `firstName(u.name)` and expose real names to strangers. |
| **PROF-3** | Premature Avatar Auto-Commit on File Select Decoupled from Form Lifecycle | 🟠 P1 (Data Mutation & UX Inconsistency) | Picking an image immediately commits the new avatar to Postgres without tapping "Save Changes". Cancelling or navigating back leaves the photo permanently changed. |
| **PROF-4** | Public Profile Hides Coarse Neighborhood Behind Exact Location Grant | 🟠 P1 (Broken Privacy Logic & Locality) | `PublicProfile.tsx` masks `u.area` behind `locStatus === "APPROVED"`, hiding public neighborhood names from neighbors even when `showCityPublicly` is ON. |
| **PROF-5** | Rating Privacy Setting (`showRatingPublicly`) Ignored in Profile Hero Header | 🟠 P1 (Privacy Setting Bypass) | The hero header renders the star rating badge unconditionally, ignoring the user's `showRatingPublicly = false` preference. |
| **PROF-6** | Duplicated Privacy Toggles Between Screens Cause Stale State Overwrites | 🟠 P1 (State Desync & Data Loss) | `ProfileEdit` buffers post/ask/badge toggles in local state. Saving ProfileEdit overwrites and reverts real-time updates made in `/settings/privacy`. |
| **PROF-7** | Inability to Clear or Delete Public Alias in `ProfileEdit` | 🟠 P1 (Unclearable Form State) | Passing `cleanAlias || undefined` causes `pickColumns` to drop the field. Deleting an alias silently fails and retains the old handle. |
| **PROF-8** | `userService.update` Omits Coordinate Synchronization to Provider Profile | 🟠 P1 (Geographic Desync) | Updating location in ProfileEdit syncs name and avatar to `providers`, but drops `lat` and `lng`, leaving provider listings stranded at old coordinates. |
| **PROF-9** | Missing "Profile Hidden" Notice for Account Owner on Public Profile | 🟡 P2 (UX Feedback Gap) | Owners with `customerEnabled = false` view `/u/:id` normally with no indicator that neighbors and search engines receive 404. |
| **PROF-10** | Hardcoded Empty Verifications Array in `userService.publicProfile` | 🟡 P2 (Cosmetic Feature Gap) | `userService.ts` hardcodes `verifications: []`, preventing earned phone and ID verification badges from ever rendering. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 PROF-1 (P0): Direct Phone Edit Bypasses Supabase Auth OTP & Desyncs Auth Identity

- **Location:** [`src/screens/ProfileEdit.tsx:358-367`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L358-L367), [`src/screens/ProfileEdit.tsx:147-153`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L147-L153), [`src/services/core/userService.ts:27, 186`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts#L27)
- **Root Cause:**
  1. In `ProfileEdit.tsx`, the Contact section contains a direct text input for mobile number:
     ```tsx
     <div className="field">
       <label>Main Mobile Number</label>
       <input
         className="input"
         placeholder="10-digit number"
         inputMode="numeric"
         maxLength={10}
         value={phone}
         onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
       />
     </div>
     ```
  2. In `handleSave()`:
     ```typescript
     await userService.update({
       name: name.trim(),
       alias: cleanAlias || undefined,
       phone: phone.trim() || undefined,
       ...
     });
     ```
  3. `userService.update()` executes a direct SQL `UPDATE public.users SET phone = ... WHERE id = auth.uid()`.
  4. In Supabase Auth, phone number is the core cryptographic authentication credential stored in `auth.users.phone`. Changing `public.users.phone` directly in Postgres **does not change `auth.users.phone`**.
  5. Consequences:
     - **Authentication Desynchronization:** If user enters `9876543210`, their `public.users` row shows `9876543210`, but `auth.users` still has their old number `9123456780`. When they next attempt OTP sign-in with `9876543210`, Supabase Auth either throws "user not found" or initiates a signup flow creating a second, duplicate user row with a new UUID. The user is permanently locked out of their original profile, orders, and agreements.
     - **Account Hijacking & Impersonation:** Any authenticated user can change their `users.phone` to anyone else's phone number without proving ownership of the number via SMS OTP. If `showPhonePublicly` is enabled, the imposter's public profile displays the victim's phone number.
- **Recommended Remediation:**
  - Make the mobile phone number input in `ProfileEdit.tsx` **read-only** with a verified status badge.
  - Add a dedicated "Change Number" action button that opens an OTP verification sheet or routes to a secure phone change flow (`supabase.auth.updateUser({ phone: newPhone })` -> prompt user for SMS OTP code -> verify via `supabase.auth.verifyOtp` -> update `public.users.phone` only upon cryptographic confirmation).

---

### 🔴 PROF-2 (P0): `get_public_profile` RPC Omits `alias` Column, Leaking Real Names on Public Profiles

- **Location:** [`supabase/migrations/20260821_show_name_publicly.sql:20-29, 44-63`](file:///d:/zetax/name/STRYT/supabase/migrations/20260821_show_name_publicly.sql#L20-L29), [`src/services/core/userService.ts:338`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts#L338), [`src/screens/PublicProfile.tsx:167, 205`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L167), [`src/lib/publicName.ts:75-85`](file:///d:/zetax/name/STRYT/src/lib/publicName.ts#L75-L85)
- **Root Cause:**
  1. Migration `20260821_show_name_publicly.sql` recreated the `get_public_profile(target_id text)` RPC function:
     ```sql
     create or replace function public.get_public_profile(target_id text)
     returns table (
       id text, name text, phone text, avatar text, area text,
       rating_avg numeric, rating_count int, created_at timestamptz,
       show_posts_publicly boolean, show_asks_publicly boolean, show_badges_publicly boolean,
       show_phone_publicly boolean, show_city_publicly boolean, show_rating_publicly boolean,
       distance_km numeric,
       email text, show_email_publicly boolean,
       show_name_publicly boolean
     )
     ```
  2. Notice that `alias text` is **completely missing** from the table return signature and the `select` statement.
  3. In `src/services/core/userService.ts`:
     ```typescript
     async publicProfile(id: string): Promise<PublicUser | undefined> {
       const { data: u, error } = await sb.rpc("get_public_profile", { target_id: id }).maybeSingle();
       ...
       return {
         id: ur.id,
         name: ur.name,
         alias: ur.alias ?? null, // ur.alias is ALWAYS undefined because RPC never selected it!
         ...
       };
     }
     ```
  4. In `PublicProfile.tsx`:
     ```tsx
     <AppBar title={aliasName(u)} ... />
     <h1 className="h1">{aliasName(u)}</h1>
     ```
  5. In `src/lib/publicName.ts`:
     ```typescript
     export function aliasName(
       input?: { alias?: string | null; name?: string | null; showNamePublicly?: boolean | null } | null,
       fallback = "STRYT Neighbor",
     ): string {
       if (input?.showNamePublicly) {
         return displayName(input?.name, fallback);
       }
       const alias = (input?.alias ?? "").trim();
       if (alias) return alias;
       return firstName(input?.name) === "Neighbor" ? fallback : firstName(input?.name);
     }
     ```
  6. When a user has `showNamePublicly = false` (explicitly requesting that their real name be kept confidential and only their `@alias` be shown to strangers), `input.alias` is `null`. `aliasName()` falls through to line 84:
     `return firstName(input?.name)`!
  7. **Real Name Privacy Leak:** Even though the user configured a unique public handle `@johndoe` and kept "Real name" OFF, anyone viewing `/u/:id` sees their actual real first name (e.g. "Devashish" or "Priya") instead of their chosen handle!
- **Recommended Remediation:**
  - Create a migration updating `get_public_profile` to include `alias text` in `returns table` and `select u.alias`.
  - In `userService.ts:publicProfile()`, map `alias: ur.alias ?? null`.
  - As a client-side defensive safeguard, if `ur.alias` is missing from the RPC, fetch `alias` from `public.users` (similar to the fallback in `userService.me()`).

---

### 🟠 PROF-3 (P1): Premature Avatar Auto-Commit on File Select Decoupled from Form Lifecycle

- **Location:** [`src/screens/ProfileEdit.tsx:116-120`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L116-L120), [`src/screens/ProfileEdit.tsx:147-153`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L147-L153)
- **Root Cause:**
  1. In `ProfileEdit.tsx:114-126`:
     ```typescript
     try {
       const url = await uploadService.upload(file, "avatar");
       setAvatar(url);
       await userService.update({ avatar: url });
       await refreshUser();
       showToast("Photo uploaded ✓");
     } catch ...
     ```
  2. Selecting an image file immediately uploads and writes `avatar: url` to the database and global store.
  3. However, `ProfileEdit` is structured as an edit form with a sticky "Save Changes" button at the bottom:
     ```tsx
     <AppBar title="Edit Profile" />
     ...
     <button onClick={handleSave}>Save Changes</button>
     ```
  4. If a user selects a new photo to test how it looks in the avatar preview, but then decides not to save their edits (or clicks the Back button on the AppBar), the photo change has **already taken permanent effect**.
  5. Furthermore, if they proceed to edit their display name or alias and hit an error (such as a 23505 unique constraint violation on alias), their avatar remains changed while other changes are aborted.
- **Recommended Remediation:**
  - Decouple file upload from database persistence: when an image is picked, upload it to storage and store `url` in component state (`setAvatar(url)`), but **do not call `userService.update({ avatar: url })`** inside `handleAvatarChange()`.
  - Only write `avatar: avatar || undefined` to Postgres inside `handleSave()` when the user explicitly commits the form.

---

### 🟠 PROF-4 (P1): Public Profile Hides Coarse Neighborhood Behind Exact Location Grant

- **Location:** [`src/screens/PublicProfile.tsx:209-220`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L209-L220), [`src/screens/ProfileEdit.tsx:25`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L25), [`supabase/migrations/20260821_show_name_publicly.sql:48, 88`](file:///d:/zetax/name/STRYT/supabase/migrations/20260821_show_name_publicly.sql#L48)
- **Root Cause:**
  1. In `ProfileEdit.tsx`, the user configures:
     `{ key: "showCityPublicly", label: "Neighborhood", hint: "Your area/city on your public profile" }` (default: ON).
  2. In Postgres, the `get_public_profile` RPC respects this server-side:
     `case when v_is_self_or_admin or u.show_city_publicly then u.area else null end`
  3. However, in `PublicProfile.tsx:209-220`:
     ```tsx
     {isSelf || locStatus === "APPROVED" ? (
       <>
         <span>📍 {u.area || t("neighborhood_member_fallback")}{distanceText && ` • ${distanceText}`}</span>
         <span>•</span>
       </>
     ) : (
       <>
         <span>📍 {t("location_shared_on_request")}</span>
         <span>•</span>
       </>
     )}
     ```
  4. `PublicProfile.tsx` treats `u.area` as if it were exact GPS coordinates! It checks whether the visitor has an approved location grant (`locStatus === "APPROVED"`). For any regular visitor, `locStatus` is `"NONE"`.
  5. As a result, the coarse neighborhood name (e.g. "Bandra West") is replaced with `"📍 Location shared on request"` for all visitors, completely breaking neighborhood discoverability and rendering the `showCityPublicly` toggle ineffective.
- **Recommended Remediation:**
  - Decouple coarse neighborhood display from exact GPS share grants. Since `get_public_profile` already masks `u.area` based on `show_city_publicly`, `PublicProfile.tsx` should render `u.area` whenever `u.area` is non-null:
    ```tsx
    {u.area ? (
      <>
        <span>📍 {u.area}{distanceText && ` • ${distanceText}`}</span>
        <span>•</span>
      </>
    ) : null}
    ```
  - Reserve `LocationShareControl` and `locStatus === "APPROVED"` strictly for opening exact Google Maps turn-by-turn directions.

---

### 🟠 PROF-5 (P1): Rating Privacy Setting (`showRatingPublicly`) Ignored in Profile Hero Header

- **Location:** [`src/screens/PublicProfile.tsx:239-256`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L239-L256), [`src/screens/PublicProfile.tsx:380`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L380), [`src/screens/ProfileEdit.tsx:26`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L26)
- **Root Cause:**
  1. In `ProfileEdit.tsx`:
     `{ key: "showRatingPublicly", label: "Rating", hint: "Your star rating on your public profile" }`
  2. In `PublicProfile.tsx:380-388`, the bottom social stats bar checks:
     ```tsx
     {(isSelf || u.showRatingPublicly !== false) && (
       <div className="col center grow">
         <span className="bold">{u.ratingAvg}★</span>
         <span className="tiny semi muted">{t("rating_label")}</span>
       </div>
     )}
     ```
  3. However, in the top hero header ([`PublicProfile.tsx:239-256`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L239-L256)):
     ```tsx
     {/* Verification & Rating Badges */}
     <div className="row center gap-8" style={{ marginTop: 10 }}>
       <span style={{ ... }}>
         <Star size={12} fill="var(--amber-500)" stroke="none" />
         {u.ratingCount > 0 ? <>{u.ratingAvg} ({u.ratingCount})</> : t("new_word")}
       </span>
       ...
     </div>
     ```
  4. The Star rating pill in the hero header is rendered unconditionally. A user who turns off "Rating" under Privacy to conceal their rating still has their rating displayed in the most prominent location on their profile.
- **Recommended Remediation:**
  - Wrap the star rating pill in `PublicProfile.tsx:239-256` with `{(isSelf || u.showRatingPublicly !== false) && (...) }`.

---

### 🟠 PROF-6 (P1): Duplicated Privacy Toggles Between Screens Cause Stale State Overwrites

- **Location:** [`src/screens/ProfileEdit.tsx:44-54, 325-350`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L44-L54), [`src/screens/settings/PrivacySettings.tsx:10-17, 35-46, 66-87`](file:///d:/zetax/name/STRYT/src/screens/settings/PrivacySettings.tsx#L10-L17)
- **Root Cause:**
  1. The code comment in `PrivacySettings.tsx` specifies:
     > *"The name/phone/email/location visibility switches deliberately stay in Edit profile... The row at the bottom links there rather than cloning them, so there is exactly one home for each switch."*
  2. In reality, `ProfileEdit.tsx` contains toggles for `showPostsPublicly`, `showAsksPublicly`, and `showBadgesPublicly` as well as name, phone, email, and location.
  3. `PrivacySettings.tsx` also contains toggles for `showPostsPublicly`, `showAsksPublicly`, and `showBadgesPublicly`.
  4. **The Divergence:**
     - In `PrivacySettings.tsx`, clicking a toggle immediately calls `userService.update(patch)`.
     - In `ProfileEdit.tsx`, the toggles are initialized once into component state `const [privacy, setPrivacy] = useState(...)` and only sent to the server when clicking "Save Changes".
  5. If a user visits `/settings/privacy`, turns OFF "Community posts" (which saves to Postgres), and later navigates to `/profile/edit` to update their name or location, `ProfileEdit`'s buffered `privacy` object (which still holds the old values if not re-fetched) overwrites and reverts the user's privacy choices.
- **Recommended Remediation:**
  - Remove `showPostsPublicly`, `showAsksPublicly`, and `showBadgesPublicly` from `ProfileEdit.tsx`. Dedicate `PrivacySettings.tsx` as the single source of truth for activity privacy, and leave `ProfileEdit.tsx` to govern personal contact and identity privacy (name, phone, email, area, coordinates).

---

### 🟠 PROF-7 (P1): Inability to Clear or Delete Public Alias in `ProfileEdit`

- **Location:** [`src/screens/ProfileEdit.tsx:132-136, 149`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L149), [`src/services/core/userService.ts:42-48, 180`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts#L42-L48)
- **Root Cause:**
  1. In `ProfileEdit.tsx:132`:
     ```typescript
     const cleanAlias = normalizeAlias(alias);
     ...
     await userService.update({
       name: name.trim(),
       alias: cleanAlias || undefined,
       ...
     });
     ```
  2. If an existing user who previously configured `@myhandle` decides to remove their alias and revert to standard display name rules, they clear the input (`alias = ""`, `cleanAlias = ""`).
  3. Expression `cleanAlias || undefined` evaluates to `undefined`.
  4. In `src/services/core/userService.ts`:
     ```typescript
     function pickColumns<T extends Record<string, unknown>>(obj: T, allowed: Set<string>) {
       const out: Record<string, unknown> = {};
       for (const [k, v] of Object.entries(obj)) {
         if (allowed.has(k) && v !== undefined) out[k] = v;
       }
       return out;
     }
     ```
  5. `pickColumns()` strips any key whose value is `undefined`. Consequently, `alias` is omitted from the `toSnake(cleanPatch)` payload sent to `sb.from("users").update(...)`.
  6. The database retains the old alias, silently failing the user's intent to remove their public handle.
- **Recommended Remediation:**
  - Update `ProfileEdit.tsx:149` to pass `alias: cleanAlias ? cleanAlias : null`.
  - In `pickColumns()`, allow `null` values so that explicit field clearing is propagated to Postgres.

---

### 🟠 PROF-8 (P1): `userService.update` Omits Coordinate Synchronization to Provider Profile

- **Location:** [`src/screens/ProfileEdit.tsx:147-153`](file:///d:/zetax/name/STRYT/src/screens/ProfileEdit.tsx#L147-L153), [`src/services/core/userService.ts:191-198`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts#L191-L198)
- **Root Cause:**
  1. In `ProfileEdit.tsx`, the user can update their neighborhood and pick new GPS coordinates via map search or device GPS.
  2. `handleSave()` calls:
     ```typescript
     await userService.update({
       area: areaInput.trim() || undefined,
       lat: resolvedLat,
       lng: resolvedLng,
       ...
     });
     ```
  3. In `src/services/core/userService.ts:191-198`:
     ```typescript
     // Sync avatar and name changes to any provider profile owned by this user
     if (patch.avatar !== undefined || patch.name !== undefined) {
       const provPatch: TablesUpdate<"providers"> = {};
       if (patch.avatar !== undefined) provPatch.avatar = patch.avatar;
       if (patch.name !== undefined) provPatch.display_name = patch.name;
       const { error: provErr } = await sb.from("providers").update(provPatch).eq("user_id", uid);
       if (provErr) console.warn("update (provider sync):", provErr.message);
     }
     ```
  4. Notice that while `avatar` and `name` are synced to `providers`, `lat` and `lng` are **not synced**.
  5. Contrast this with `userService.setLocation()` and `userService.autoSyncLocation()`, both of which explicitly execute:
     `await sb.from("providers").update({ lat, lng }).eq("user_id", uid)`.
  6. When a user who is also a provider changes their location in `ProfileEdit`, their customer profile moves to the new neighborhood, but their provider profile remains stranded at their previous coordinates on provider discovery feeds.
- **Recommended Remediation:**
  - In `userService.update()`, sync coordinates to `providers`:
     ```typescript
     if (patch.lat !== undefined && patch.lng !== undefined) {
       provPatch.lat = patch.lat;
       provPatch.lng = patch.lng;
     }
     ```

---

### 🟡 PROF-9 (P2): Missing "Profile Hidden" Notice for Account Owner on Public Profile

- **Location:** [`src/screens/PublicProfile.tsx:64, 164-219`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L64), [`src/screens/settings/PrivacySettings.tsx:89-97`](file:///d:/zetax/name/STRYT/src/screens/settings/PrivacySettings.tsx#L89-L97)
- **Root Cause:**
  1. In `PrivacySettings.tsx`, users can turn off "Show my profile publicly" (`customerEnabled = false`).
  2. The `get_public_profile` RPC enforces this:
     `where u.id = target_id and (v_is_self_or_admin or (u.customer_enabled = true and u.customer_deleted_at is null) or u.id = v_uid)`
  3. For other users, `get_public_profile` returns zero rows, rendering the empty state: *"Profile not found"*.
  4. For the owner (`isSelf`), `get_public_profile` returns the full profile data.
  5. When the owner visits `/u/:id` (e.g. by clicking "Preview your public profile" in `PrivacySettings.tsx`), the screen renders completely normally without any banner indicating that the profile is currently hidden from other users. The owner has no visual confirmation of their hidden state.
- **Recommended Remediation:**
  - In `PublicProfile.tsx`, render an amber warning banner when `isSelf && user.customerEnabled === false`:
    *"Your profile is currently hidden from search and neighbors. Tap here to manage visibility in Privacy Settings."*

---

### 🟡 PROF-10 (P2): Hardcoded Empty Verifications Array in `userService.publicProfile`

- **Location:** [`src/services/core/userService.ts:364`](file:///d:/zetax/name/STRYT/src/services/core/userService.ts#L364), [`src/screens/PublicProfile.tsx:258-276, 565-578`](file:///d:/zetax/name/STRYT/src/screens/PublicProfile.tsx#L258-L276)
- **Root Cause:**
  1. In `src/screens/PublicProfile.tsx`, lines 258-276 and 565-578 contain dedicated UI rendering verified badges:
     ```tsx
     {u.verifications.length > 0 && (
       <span className="...">
         <BadgeCheck size={13} color="var(--green-500)" /> {t("verified_badge")}
       </span>
     )}
     ```
  2. However, in `src/services/core/userService.ts:364`:
     ```typescript
     verifications: [],
     ```
  3. `publicProfile()` hardcodes `verifications` as an empty array. Even if a user has verified their phone number or undergone manual KYC verification, their trust badges never appear on their public profile or in `UserProfileSheet`.
- **Recommended Remediation:**
  - Derive `verifications` dynamically: if `ur.phone` is present and verified, include `"phone"`. If manual ID verification exists in `user_verifications` table, include `"id"`.

---

## 4. Validation & Non-Regression Checks

- **TypeScript Compilation:** Run `npx tsc --noEmit` to verify type signatures across `userService.ts`, `ProfileEdit.tsx`, `PrivacySettings.tsx`, and `PublicProfile.tsx`.
- **Design Token Compliance:** Run `npm run check-colors` to confirm that all alert banners, location status pills, and toggle containers utilize platform design tokens (`var(--brand-*)`, `var(--ink-*)`, `var(--amber-*)`).

---

## 5. Summary & Next Immediate Actions

1. **Register Gap Log:** Log recorded as `docs/gaps/PROFILE_PRIVACY_GAP_LOG.md`.
2. **Master Tracker Update:** Advance Flow 11.2 from `In Progress` to `AUDITED` in [`docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md`](file:///d:/zetax/name/STRYT/docs/gaps/MASTER_FLOW_AUDIT_TRACKER.md) (Domain 11: 2/6, Platform Total: 48/52, ~92%).
3. **Execute Verification Commands:** Confirm clean type compilation and styling checks.
4. **Proceed to Flow 11.3:** Begin audit of Flow 11.3 (In-App Notification Center & Badges: `/notifications`, `/settings/notifications`).
