# Customer "Ask / Request" Creation — Bug & Gap Log

**Purpose:** Documenting every defect, data loss hazard, geolocation failure, photo upload error, and UX flaw in **Flow 4.1: Customer "Ask / Request" Creation** (`src/screens/requests/AskCompose.tsx`, `src/services/engagement/requestService.ts`, `src/lib/requestDraft.ts`, `src/services/core/uploadService.ts`, and Supabase migrations `20260836_request_flow_fixes.sql` / `20260717_delete_fix_indexes_expiry.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **R1** | Null Island Coordinates (0, 0) Stored on Geolocation Failure | 🔴 P0 (Ghost Request & Total Delivery Failure) | In `AskCompose.tsx:247-257, 276-277`, if GPS is denied or times out after 4 seconds, the request is posted with `lat: 0, lng: 0` (in the Atlantic Ocean). The DB notification trigger `notify_on_request()` queries around (0, 0), notifying 0 local businesses/providers in India. The request feed calculates distance as ~7,500 km and filters it out of every user's feed, rendering the request completely invisible. |
| **R2** | Uncompressed Mobile Camera Uploads Fail Over 5MB Limit | 🔴 P0 (Upload Crash / 413 Failure) | In `AskCompose.tsx:177-197, 472-473`, photos from camera and gallery are uploaded raw via `Promise.all(files.map(f => uploadService.upload(f, "request-photo")))`. High-resolution mobile phone camera photos (6MB–20MB) exceed Supabase's 5MB upload limit, causing HTTP 413 errors and blocking submission. |
| **R3** | Smart Template Field Answers Are Silently Discarded | 🟠 P1 (Data Loss & Incomplete Requests) | In `AskCompose.tsx:331-358, 259-278`, users select answers for template fields (e.g. Birthday Cake: Flavour, Weight, Eggless; Plumber: Issue type). The state is collected in `fieldVals`, but in `post()`, `fieldVals` is completely ignored and never appended to `description` or sent to the backend. Responders receive requests missing all selected template specifications. |
| **R4** | Voice Dictation Hardcodes Hindi (`hi-IN`) & Leaks Mic Stream | 🟠 P1 (Voice Dictation Distortion) | In `AskCompose.tsx:123-156`, `rec.lang = "hi-IN"` is hardcoded regardless of the user's active app language (`en` or `mr`), transcribing English and Marathi speech as phonetically garbled Hindi. Furthermore, the speech recognition stream is not stopped in a cleanup effect, leaking the active microphone indicator upon unmount. |
| **R5** | Fragile Substring Matching on Voice Dictation Overwrites Category | 🟠 P1 (Accidental Category Overwrite) | In `AskCompose.tsx:143-149`, transcript words are matched against category names and slugs using loose `.includes()`. Common spoken words like "car", "tap", or "home" trigger false matches and silently overwrite the user's selected category. |
| **R6** | Missing "Clear Draft" / "Start Over" Reset Action | 🟡 P2 (Draft Trapping UX) | In `AskCompose.tsx:84, 233-242`, form state is automatically saved to `localStorage`. There is no button to discard a draft or reset the form. Once saved, re-entering `/ask` permanently restores the stale draft, forcing the user to manually backspace every field. `fieldVals` is also omitted from `RequestDraft` and lost on reload. |
| **R7** | "Me Too" Crashes on Doorstep Fulfillment Requests | 🟡 P2 (Uncaught RPC Exception) | In `requestService.ts:432`, `meToo()` calls `group_buy_join` without passing `p_delivery_address`. When called on requests with `fulfillment_type = 'DOORSTEP'`, PostgreSQL throws an unhandled `DELIVERY_ADDRESS_REQUIRED` exception. |
| **R8** | Hardcoded `#fff` Tokens in Form Surfaces | 🟢 P3 (Design System) | Hardcoded `#fff` and `#ffffff` in `AskCompose.tsx:436, 445, 498, 502, 591, 592, 620, 649, 650` violate theme token architecture and dark mode styling. |

---

## Detailed Gap Analyses

---

### #R1 — Null Island Coordinates (0, 0) Stored on Geolocation Failure

**Area:** `src/screens/requests/AskCompose.tsx:247-257, 276-277`, `supabase/migrations/20260836_request_flow_fixes.sql:21-74`  
**Severity:** 🔴 P0 (Ghost Request & Total Delivery Failure)

**Root cause:**
1. In `AskCompose.tsx`:
   ```ts
   // AskCompose.tsx:247-257
   let lat = user.lat;
   let lng = user.lng;
   if (!lat && !lng) {
     await new Promise<void>((resolve) => {
       nativeGeolocation.getCurrentPosition(
         (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
         () => resolve(),
         { enableHighAccuracy: true, timeout: 4000 }
       );
     });
   }
   ...
   lat: lat || 0,
   lng: lng || 0,
   ```
2. If the user skipped location setup or if GPS times out (e.g. indoors, low signal, or desktop browser), `lat` and `lng` remain undefined.
3. The fallback sets `lat: 0, lng: 0` (Null Island in the Gulf of Guinea).
4. When `requestService.create` inserts the row into `public.requests`, the database trigger `notify_on_request()` executes:
   ```sql
   delta := coalesce(new.radius_km, 5) / 111.0;
   ...
   and u.lat between new.lat - delta and new.lat + delta
   and u.lng between new.lng - delta and new.lng + delta
   ```
5. It looks for users located within 5 km of (0, 0). Exactly 0 local businesses, service providers, or neighbors in India receive the notification.
6. When anyone (including the author) visits `/explore?tab=requests`, `requestService.feed` filters posts by distance:
   ```ts
   rows = rows.filter((r) => {
     const postCap = r.radiusKm ? Math.min(radiusLimit, r.radiusKm) : radiusLimit;
     return r.distanceKm <= postCap;
   });
   ```
7. Distance from any Indian city to Null Island is ~7,500 km. Because `7500 <= 5` is false, the request is filtered out and completely invisible.
8. The customer believes the request posted, but it is orphaned forever.

**Fix Recommendation:**
- If `lat` and `lng` are not available, prompt the user with a `LocationPickerSheet` to pick their neighborhood before submitting.
- Never write `lat: 0, lng: 0`.

---

### #R2 — Uncompressed Mobile Camera Uploads Fail Over 5MB Limit

**Area:** `src/screens/requests/AskCompose.tsx:177-197, 472-473`, `src/services/core/uploadService.ts`  
**Severity:** 🔴 P0 (Upload Crash / 413 Failure)

**Root cause:**
1. In `AskCompose.tsx`:
   ```ts
   async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
     const remaining = 4 - photos.length - pendingPreviews.length;
     const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, remaining));
     ...
     const urls = await Promise.all(files.map((f) => uploadService.upload(f, "request-photo")));
     setPhotos((p) => [...p, ...urls]);
   }
   ```
2. Users click the camera button (`capture="environment"`) or gallery picker.
3. Modern mobile cameras produce photos between 6MB and 20MB.
4. Supabase Storage buckets enforce a 5MB request body limit.
5. Unlike other compose screens in STRYT that utilize `compressImage(file)`, `AskCompose` uploads the raw multi-megabyte `File` objects directly.
6. The upload fails with HTTP 413 Payload Too Large. `Promise.all` rejects immediately, showing a generic toast `"Couldn't upload photo"`.

**Fix Recommendation:**
- Compress images client-side via `compressImage(f, { maxWidth: 1200, quality: 0.8 })` before uploading.

---

### #R3 — Smart Template Field Answers Are Silently Discarded

**Area:** `src/screens/requests/AskCompose.tsx:331-358, 259-278`  
**Severity:** 🟠 P1 (Data Loss & Incomplete Requests)

**Root cause:**
1. In `AskCompose.tsx`, quick-start templates (Birthday Cake, Plumber, AC Service, Daily Tiffin) provide smart structured inputs:
   ```tsx
   {template.fields.map((f) => (
     ...
     onClick={() => setFieldVals((v) => ({ ...v, [f.key]: o }))}
   ))}
   ```
2. A user selects their cake flavour ("Chocolate"), weight ("1 kg"), and dietary preference ("Eggless").
3. However, inside `post()`:
   ```ts
   await requestService.create({
     title,
     description: desc,
     categoryId: cat,
     ...
   });
   ```
4. `fieldVals` is NEVER appended to `desc` and never included in the payload!
5. Responders who see the request on their console or in the feed only receive `"Birthday cake"` with zero details on flavour, weight, or dietary needs.

**Fix Recommendation:**
- When `template` is active, format the non-empty fields in `fieldVals` and append them to `description` before submitting (e.g. `\n\nDetails:\n• Flavour: Chocolate\n• Weight: 1 kg\n• Eggless: Yes`).

---

### #R4 — Voice Dictation Hardcodes Hindi (`hi-IN`) & Leaks Mic Stream

**Area:** `src/screens/requests/AskCompose.tsx:123-156`  
**Severity:** 🟠 P1 (Voice Dictation Distortion)

**Root cause:**
1. In `AskCompose.tsx:134`:
   ```ts
   const rec = new SpeechRecognition();
   rec.lang = "hi-IN";
   ```
2. `rec.lang` is hardcoded to `"hi-IN"`.
3. If an English-speaking or Marathi-speaking user taps the microphone button to dictate their request, speech recognition treats English or Marathi speech as Hindi phonetics, generating incomprehensible gibberish.
4. In addition, there is no `useEffect` cleanup hook on unmount to call `recognitionRef.current?.stop()`. If the user taps back while the mic is active, the browser audio recording stream remains open.

**Fix Recommendation:**
- Map `rec.lang` dynamically to the user's active language:
  ```ts
  rec.lang = lang === "hi" ? "hi-IN" : lang === "mr" ? "mr-IN" : "en-IN";
  ```
- Add a cleanup effect in `AskCompose` to stop speech recognition on unmount.

---

### #R5 — Fragile Substring Matching on Voice Dictation Overwrites Category

**Area:** `src/screens/requests/AskCompose.tsx:143-149`  
**Severity:** 🟠 P1 (Accidental Category Overwrite)

**Root cause:**
1. When voice dictation finishes a phrase:
   ```ts
   const lower = transcript.toLowerCase();
   const matched = (categories ?? []).find(
     (c) => lower.includes(c.name.toLowerCase()) || lower.includes((c.slug ?? "").toLowerCase())
   );
   if (matched) { setCat(matched.id); setSubCat(null); }
   ```
2. Loose `.includes()` matching matches common words (e.g. "car", "tap", "home") against short category slugs or names.
3. If a user says "Please come to my home to fix my car", the category can randomly flip to "Home Repair" instead of "Automotive", unexpectedly overwriting an intentional selection.

**Fix Recommendation:**
- Use word boundary regex `\b${word}\b` rather than loose `.includes()`, and only auto-select category if the user has not already explicitly chosen one.

---

### #R6 — Missing "Clear Draft" / "Start Over" Reset Action

**Area:** `src/screens/requests/AskCompose.tsx:84, 233-242`, `src/lib/requestDraft.ts`  
**Severity:** 🟡 P2 (Draft Trapping UX)

**Root cause:**
1. Request form state is auto-saved to `localStorage` on every keystroke.
2. If a user starts typing a request, abandons it, and returns days later to post something completely different, the old draft is automatically restored with no "Discard draft" or "Start fresh" button.
3. The user must manually erase all text boxes and toggles.
4. In addition, `fieldVals` (template answers) is omitted from `RequestDraft`, so a page refresh clears template selections while keeping the title.

**Fix Recommendation:**
- Provide a "Clear draft" button in the AppBar or draft restore notification banner.
- Add `fieldVals: Record<string, string>` to `RequestDraft`.

---

### #R7 — "Me Too" Crashes on Doorstep Fulfillment Requests

**Area:** `src/services/engagement/requestService.ts:432`, `supabase/migrations/20260827_bulk_checkout.sql:44-47`  
**Severity:** 🟡 P2 (Uncaught RPC Exception)

**Root cause:**
1. In `requestService.ts:432`:
   ```ts
   await sb.rpc("group_buy_join", { p_request_id: requestId, p_quantity: 1 });
   ```
2. In PostgreSQL function `public.group_buy_join`:
   ```sql
   if v_req.fulfillment_type = 'DOORSTEP'
      and nullif(trim(coalesce(p_delivery_address, '')), '') is null then
     raise exception 'DELIVERY_ADDRESS_REQUIRED';
   end if;
   ```
3. If a request is flagged with `fulfillment_type = 'DOORSTEP'`, calling `group_buy_join` without a delivery address raises an exception, failing the "Me too" interaction.

**Fix Recommendation:**
- Implement a dedicated lightweight `me_too_toggle` RPC that increments/decrements `me_too_count` without triggering group-buy delivery address validations.

---

### #R8 — Hardcoded `#fff` Tokens in Form Surfaces

**Area:** `src/screens/requests/AskCompose.tsx:436, 445, 498, 502, 591, 592, 620, 649, 650`  
**Severity:** 🟢 P3 (Design System)

**Root cause:**
1. Multiple form inputs and action chips use hardcoded `#fff` instead of `var(--bg-surface)` or `var(--ink-0)`.
2. This creates jarring contrast and flash artifacts when viewing in dark mode.

**Fix Recommendation:**
- Replace `#fff` strings with theme semantic variables.
