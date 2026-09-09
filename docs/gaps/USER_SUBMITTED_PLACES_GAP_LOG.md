# User-Submitted Place Listings — Bug & Gap Log

**Purpose:** Documenting every defect, data loss hazard, authentication gap, and UX issue in **Flow 1.5: User-Submitted Place Listings** (`src/screens/places/PlaceRequestForm.tsx`, `src/screens/places/PlaceDetail.tsx`, `src/services/marketplace/placesService.ts`, `src/services/marketplace/discoveryService.ts`, `src/services/core/adminService.ts`, and Supabase migrations `20260824_places_to_visit.sql` / `20260825_places_detail_fields.sql`).

---

## Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **P1** | Missing Upfront Auth Wall & Disastrous Data Loss for Guest Users | 🔴 P0 (Data Loss / Guest Trap) | In `PlaceRequestForm.tsx:1-105`, guests can fill out all 15+ fields and attach a photo without signing in. Only when tapping "Submit for review" does `placesService.request()` throw `"Sign in to suggest a place"`. There is no login redirect, and navigating to sign in permanently deletes all entered form data. |
| **P2** | Uncompressed Photo Upload Fails on High-Resolution Camera Photos | 🔴 P0 (Upload Crash / 413 Failure) | In `PlaceRequestForm.tsx:70-72, 167-176`, raw images selected from camera are uploaded directly via `uploadService.upload(photo, "place-photo")` without compression. Modern phone camera photos (6MB–20MB) exceed Supabase storage limits (5MB), failing submissions with a generic error. |
| **P3** | Hardcoded "Distance from Indore" Label Breaks for All Other Cities | 🟠 P1 (Localization & Hardcoding Defect) | In `PlaceDetail.tsx:180`, the distance card hardcodes `label="Distance from Indore"`. For places submitted in Pune, Mumbai, Manali, Goa, or Bengaluru, the detail screen absurdly displays "Distance from Indore: 35 km". |
| **P4** | Omission of City Column in Form Submissions Prevents Geo-Filtering | 🟠 P1 (Data Integrity & Incomplete Schema) | In `PlaceRequestForm.tsx:74-92`, the payload omits the `city` field, even though `public.places` has a `city` column and `PlaceDetail.tsx:134-138` renders `[addressLine1, city]`. All user-submitted places have `city = NULL`. |
| **P5** | Submitter Cannot Track Status, View Feedback, or Edit Submissions | 🟠 P1 (Broken Review Lifecycle) | Once submitted, places are invisible to submitters. In `PlaceDetail.tsx`, there is no status badge (`PENDING`, `REJECTED`, `ACTIVE`) or rejection reason. When rejected, `adminService.ts:512` sends a notification linking to `"/map"`, where rejected places do not appear. Submitters cannot find, edit, or resubmit their places despite RLS allowing it. |
| **P6** | Coordinate Pinning Silently Defaults to Submitter's Living Room | 🟡 P2 (Geotagging Accuracy Hazard) | In `PlaceRequestForm.tsx:43-44`, `lat` and `lng` default to `user.lat` and `user.lng`. If a user at home submits a distant trek or tourist spot without touching the map, the submission passes validation and the public place is placed on their private home coordinates. |
| **P7** | Unbounded Table Download in `discoveryService.places` | 🟡 P2 (Scalability Bottleneck) | In `discoveryService.ts:154-163`, `discoveryService.places()` performs an unconstrained `select("*").eq("status", "ACTIVE")` without pagination or bounding box filtering, downloading all active places nationwide over mobile networks. |
| **P8** | Hardcoded `#fff` Design System Token Violation & Memory Leak | 🟢 P3 (Design System & Memory) | In `PlaceRequestForm.tsx:161`, the delete photo button uses hardcoded `background: "#fff"` instead of design tokens, and `URL.createObjectURL` is created without matching `URL.revokeObjectURL` cleanup. |

---

## Detailed Gap Analyses

---

### #P1 — Missing Upfront Auth Wall & Disastrous Data Loss for Guest Users

**Area:** `src/screens/places/PlaceRequestForm.tsx:1-105`, `src/services/marketplace/placesService.ts:12-20`  
**Severity:** 🔴 P0 (Data Loss / Guest Trap)

**Root cause:**
1. A guest user navigates to `/place/new` (e.g. from the map, an empty state CTA, or direct link).
2. `PlaceRequestForm.tsx` mounts without any authentication check or auth guard:
   ```ts
   // PlaceRequestForm.tsx:36-39
   export default function PlaceRequestForm({ mode = "request", embedded = false, onDone, onClose }: PlaceRequestFormProps) {
     const nav = useNavigate();
     const { user, showToast } = useApp();
     const [name, setName] = useState("");
     ...
   ```
3. The guest spends several minutes filling out 15 complex fields: Name, Category, Description, Address, Location pin, Photo, Best time to visit, Entry fee, Hours, Typical visit length, Difficulty, How to reach, Parking info, Distance from city, Safety tips, Weather notes.
4. When they tap `"Submit for review"`, the function calls `placesService.request(payload)`:
   ```ts
   // placesService.ts:12-20
   async request(data: Partial<Place>): Promise<Place> {
     const sb = getSupabase();
     const uid = await currentUserId();
     if (!uid) throw new Error("Sign in to suggest a place");
     ...
   }
   ```
5. `placesService.request` throws `Error("Sign in to suggest a place")`.
6. In `PlaceRequestForm.tsx:100-102`:
   ```ts
   } catch (e: any) {
     showToast(e?.message || "Couldn't submit — try again");
   } finally {
     setSubmitting(false);
   }
   ```
7. The toast simply says `"Sign in to suggest a place"`. There is no login redirect, no auth modal, and no draft preservation.
8. If the user navigates away to log in or register, all their entered information and attached photos are permanently discarded.

**Fix Recommendation:**
- Add an upfront check at the top of `PlaceRequestForm`: if `!user.id` and `mode === "request"`, prompt the user to sign in or render an `AuthGateModal` before letting them type.
- Alternatively, cache the form state in `sessionStorage` (`draft_place_submission`) and redirect to `/auth/phone?redirect=/place/new` so that the draft is restored immediately upon login.

---

### #P2 — Uncompressed Photo Upload Fails on High-Resolution Camera Photos

**Area:** `src/screens/places/PlaceRequestForm.tsx:70-72, 167-176`, `src/services/core/uploadService.ts`  
**Severity:** 🔴 P0 (Upload Crash / 413 Failure)

**Root cause:**
1. In `PlaceRequestForm.tsx`, when a user attaches a photo:
   ```tsx
   <input
     type="file"
     accept="image/*"
     style={{ display: "none" }}
     onChange={(e) => {
       const f = e.target.files?.[0];
       if (!f) return;
       setPhoto(f);
       setPhotoPreview(URL.createObjectURL(f));
     }}
   />
   ```
2. On submit (lines 70-72):
   ```ts
   let coverImage: string | undefined;
   if (photo) coverImage = await uploadService.upload(photo, "place-photo");
   ```
3. Modern mobile cameras shoot 12MP to 50MP images, producing JPEGs between 5MB and 20MB.
4. Supabase Storage buckets enforce an upload payload limit (typically 5MB).
5. Other forms in the app (e.g. `BusinessOnboard.tsx`, `CommunityComposeSheet.tsx`) utilize `compressImage(file)` to scale photos down and compress them under 1MB before calling `uploadService.upload`.
6. Because `PlaceRequestForm.tsx` uploads the raw `File` object directly, mobile camera uploads fail with HTTP 413 (Payload Too Large) or network timeout.
7. The submission terminates in the catch block with `"Couldn't submit — try again"`, baffling the user.
8. Furthermore, calling `URL.createObjectURL(f)` without corresponding `URL.revokeObjectURL(photoPreview)` when the user removes or replaces the photo creates a memory leak.

**Fix Recommendation:**
- Import `compressImage` and compress the photo to max 1200px / 0.8 quality before uploading.
- Clean up object URLs on photo replacement and component unmount.

---

### #P3 — Hardcoded "Distance from Indore" Label Breaks for All Other Cities

**Area:** `src/screens/places/PlaceDetail.tsx:176-185`  
**Severity:** 🟠 P1 (Localization & Hardcoding Defect)

**Root cause:**
1. In `PlaceDetail.tsx`, the distance info row is rendered as follows:
   ```tsx
   // PlaceDetail.tsx:176-185
   {(place.howToReach || place.parkingInfo || place.distanceFromCityKm != null) && (
     <div className="card col gap-12" style={{ padding: 14 }}>
       <div className="tiny semi muted">Getting there</div>
       {place.distanceFromCityKm != null && (
         <InfoRow icon={Navigation} label="Distance from Indore" value={`${place.distanceFromCityKm} km`} />
       )}
       {place.howToReach && <InfoRow icon={Navigation} label="How to reach" value={place.howToReach} />}
       {place.parkingInfo && <InfoRow icon={Info} label="Parking" value={place.parkingInfo} />}
     </div>
   )}
   ```
2. The label explicitly hardcodes `"Distance from Indore"`.
3. In `PlaceRequestForm.tsx:242`, the field is generically labeled `"Distance (km)"`.
4. If a user in Pune adds Sinhagad Fort, or a user in Himachal Pradesh adds Solang Valley, or a user in Bangalore adds Nandi Hills, the detail screen claims:
   `Distance from Indore: 30 km`!
5. This is completely erroneous and misleading for every place outside the city of Indore.

**Fix Recommendation:**
- Render the label dynamically:
  ```tsx
  label={place.city ? `Distance from ${place.city}` : "Distance from city center"}
  ```

---

### #P4 — Omission of City Column in Form Submissions Prevents Geo-Filtering

**Area:** `src/screens/places/PlaceRequestForm.tsx:73-93`, `supabase/migrations/20260824_places_to_visit.sql:20`  
**Severity:** 🟠 P1 (Data Integrity & Incomplete Schema)

**Root cause:**
1. In the database schema (`supabase/migrations/20260824_places_to_visit.sql`), the `places` table defines a dedicated `city text` column:
   ```sql
   create table if not exists public.places (
     id text primary key,
     ...
     address_line1 text,
     city text,
     lat double precision,
     lng double precision,
     ...
   );
   ```
2. In `PlaceDetail.tsx:134-138`, the header attempts to display:
   ```tsx
   {[place.addressLine1, place.city].filter(Boolean).join(", ")}
   ```
3. However, in `PlaceRequestForm.tsx:73-93`, the submitted payload completely omits `city`:
   ```ts
   const payload = {
     name: name.trim(),
     category,
     description: description.trim() || null,
     addressLine1: addressLine1.trim() || null,
     lat,
     lng,
     coverImage: coverImage ?? null,
     ...
   };
   ```
4. As a result, every place created by a user has `city = NULL`.
5. City searches, city-level grouping, and reverse geocoded display cards remain permanently blank or incomplete.

**Fix Recommendation:**
- When the user selects a location on the `LocationPicker` or reverse geocodes their pin, capture `city` (or provide a lightweight `City` input) and include `city: city.trim() || null` in the payload.

---

### #P5 — Submitter Cannot Track Status, View Feedback, or Edit Submissions

**Area:** `src/screens/places/PlaceDetail.tsx:127-140`, `src/services/core/adminService.ts:506-523`, `supabase/migrations/20260824_places_to_visit.sql:57-59`  
**Severity:** 🟠 P1 (Broken Review Lifecycle)

**Root cause:**
1. When a user submits a place, the database creates the row with `status = 'PENDING'`.
2. Under RLS policy `select_places`, the submitter has permission to view their own submission:
   ```sql
   create policy select_places on public.places for select
     using (status = 'ACTIVE' or submitted_by_user_id = (auth.uid())::text or public.is_admin());
   ```
3. However, `PlaceDetail.tsx` has no status indicator. If the submitter views `/place/:id`, there is no banner indicating `Under Review` or `Action Required`.
4. If an admin rejects the place in `AdminPanel` with a feedback reason, `adminService.reject` triggers a notification:
   ```ts
   // adminService.ts:511-518
   const title = "Place Suggestion Needs Updates";
   const link = "/map"; // <--- Broken link!
   await notificationService.send(ownerId, title, `Reason: ${reason}`, link, "SYSTEM");
   ```
5. The notification links to `"/map"`. The submitter taps the notification, arrives on `/map`, and cannot see their rejected place because `/map` only shows `status = 'ACTIVE'`.
6. Furthermore, RLS policy `update_places_owner` explicitly allows the submitter to update their place row:
   ```sql
   create policy update_places_owner on public.places for update
     using (submitted_by_user_id = (auth.uid())::text)
     with check (submitted_by_user_id = (auth.uid())::text);
   ```
7. But there is NO "Edit Place" button, modal, or screen anywhere in the customer app. The user has no way to fix the issues requested by the admin.
8. Lastly, there is no "My Submissions" section in Account Settings or Profile, leaving the user with zero access to their submitted items once the initial submission screen closes.

**Fix Recommendation:**
- In `PlaceDetail.tsx`: Check if `user.id === place.submittedByUserId`. If `place.status !== "ACTIVE"`, display a prominent review banner (`🟡 Pending Review` or `🔴 Needs Updates: [rejectionReason]`) and provide an `"Edit Submission"` button that re-opens `PlaceRequestForm` in edit mode.
- In `adminService.ts:512`: Correct the rejection notification link to `/place/${id}` so the submitter lands directly on their place page.
- Add `placesService.listMine()` and expose a "Suggested Places" tab in Account/Profile.

---

### #P6 — Coordinate Pinning Silently Defaults to Submitter's Living Room

**Area:** `src/screens/places/PlaceRequestForm.tsx:43-44, 67`  
**Severity:** 🟡 P2 (Geotagging Accuracy Hazard)

**Root cause:**
1. In `PlaceRequestForm.tsx`:
   ```ts
   const [lat, setLat] = useState<number | null>(user.lat || null);
   const [lng, setLng] = useState<number | null>(user.lng || null);
   ```
2. When the user opens the form, `lat` and `lng` are pre-populated with their current user coordinates (e.g. their home address).
3. The validation check at line 67:
   ```ts
   if (lat == null || lng == null) { showToast("Drop a pin for the location"); return; }
   ```
4. This validation immediately passes without the user ever interacting with the map!
5. If someone sitting at home suggests a distant trek (e.g. 50 km away) and types the name and description but forgets to move the map pin, the place is geotagged to their private residence.

**Fix Recommendation:**
- Initialize `lat` and `lng` to `null`, requiring the user to explicitly tap on the map or pick an address before submitting.
- In `LocationPicker`, center the initial viewport on `user.lat/lng`, but do not set the marker coordinate until the user clicks or searches.

---

### #P7 — Unbounded Table Download in `discoveryService.places`

**Area:** `src/services/marketplace/discoveryService.ts:154-163`  
**Severity:** 🟡 P2 (Scalability Bottleneck)

**Root cause:**
1. In `discoveryService.ts`:
   ```ts
   async places(p: { lat?: number; lng?: number; radius?: number } = {}): Promise<Place[]> {
     const sb = getSupabase();
     const { data, error } = await sb.from("places").select("*").eq("status", "ACTIVE");
     throwIfError(error);
     const rows = (data ?? []).map((r) => toCamel<Place>(r));
     if (!p.lat || !p.lng) return rows;
     const userLat = p.lat, userLng = p.lng;
     const withDist = rows.map((r) => ({ ...r, distanceKm: (r.lat && r.lng) ? haversineKm(userLat, userLng, r.lat, r.lng) : Infinity }));
     return p.radius ? withDist.filter((r) => r.distanceKm <= p.radius!) : withDist;
   }
   ```
2. Every map viewport load or place discovery query downloads all active places from the database nationwide without limits or bounding boxes.
3. While acceptable for a small seed dataset, as crowdsourced places are approved across cities, this creates unnecessary bandwidth usage and client-side calculation overhead.

**Fix Recommendation:**
- Implement PostGIS spatial bounding box filtering or an RPC (`rpc('nearby_places', { lat, lng, radius_km })`) matching the pattern used for businesses and providers.

---

### #P8 — Hardcoded `#fff` Design System Token Violation & Memory Leak

**Area:** `src/screens/places/PlaceRequestForm.tsx:161, 174`  
**Severity:** 🟢 P3 (Design System & Memory)

**Root cause:**
1. In `PlaceRequestForm.tsx:161`:
   ```tsx
   <button className="icon-btn" style={{ position: "absolute", top: -8, right: -8, width: 26, height: 26, background: "#fff", boxShadow: "var(--shadow-sm)" }} ...>
   ```
   `background: "#fff"` is hardcoded, violating the design token requirement.
2. In `PlaceRequestForm.tsx:174`:
   `setPhotoPreview(URL.createObjectURL(f));` is called without cleaning up previous object URLs with `URL.revokeObjectURL(photoPreview)`.

**Fix Recommendation:**
- Replace `#fff` with `var(--bg-surface)` or `var(--ink-0)`.
- Add `URL.revokeObjectURL` cleanup when resetting or replacing photos.
