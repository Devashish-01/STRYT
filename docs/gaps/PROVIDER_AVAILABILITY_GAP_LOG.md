# STRYT — Flow 8.2: Provider Availability & Service Radius Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 8.2 — Domain 8 (Provider / Freelancer Console Operations)  
**Primary Components:** [`ProviderAvailability.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderAvailability.tsx), [`WeeklyHoursEditor.tsx`](file:///d:/zetax/name/STRYT/src/components/WeeklyHoursEditor.tsx), [`ProviderManageNav.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderManageNav.tsx), [`ProviderDetail.tsx`](file:///d:/zetax/name/STRYT/src/screens/provider/ProviderDetail.tsx)  
**Backend Services & Tables:** `providerService.ts`, `public.providers` (`availability_note`, `is_available_now`, `available_until`, `service_radius_km`), `utils/availability.ts`  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Unsaved Duration Slider & P0 Cache Invalidation Gaps**

---

## 1. Executive Summary

Flow 8.2 manages a service provider's operational availability, working schedule, and service radius (`/provider/:id/manage/availability`). Through this console, solo professionals, home-service technicians, tutors, and freelancers configure their weekly working hours, toggle immediate on-demand job availability ("Available right now ⚡"), and define their travel distance perimeter for on-site services.

While the skeleton loader and clean toggle switch provide a polished initial experience, deep technical auditing revealed severe state desynchronization, unpersisted user inputs, and architectural omissions:
1. **Unpersisted Duration Slider:** When toggling "Available right now", a range slider appears allowing the provider to select an active duration between 1 and 8 hours. However, moving this slider updates only local component state (`setHours`). There is no `onBlur` or debounce call to `providerService.setAvailability()`. The selected duration is **never sent to PostgreSQL**. The backend remains set to the initial 3-hour expiry, causing the provider to be silently taken offline hours earlier than expected.
2. **Missing Cache Invalidation on Schedule Save:** Tapping "Save Working Timing" executes `providerService.update(id, { availabilityNote })`, but neither `bustProviderGetCache(id)` nor `invalidateQueryCache('provider:${id}')` is called, and `refetchProvider()` is omitted. The local `provider` state and the shared query cache retain the old schedule, serving stale availability to customer booking sheets and corrupting subsequent `calculateNextTurnoffTime()` evaluations.
3. **Service Radius Control is Missing:** Although Flow 8.2 is mandated as "Provider Availability & Service Radius", `ProviderAvailability.tsx` contains zero controls for `service_radius_km`. It is isolated in `ProviderProfileEditor.tsx` and `ProviderSettings.tsx` without map visualization.
4. **Erroneous "Tomorrow" Toast Copy:** In `toggleNow()`, the toast message hardcodes `"Available until HH:MM tomorrow ⚡"` even when the turnoff time is later today during regular business hours, confusing providers.
5. **No Ad-Hoc Date or Slot Blocking:** Providers cannot block a specific date (e.g. next Friday) or a single afternoon slot. Their only option is permanently disabling the day in `WeeklyHoursEditor`, requiring manual re-enabling later.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **PAVL-1** | Active Duration Slider Is Never Persisted to Backend | 🔴 P0 (Silent Premature Offline Drop) | In `ProviderAvailability.tsx:150-156`, moving the active duration slider (1–8h) updates only `hours` in React state. No network call is dispatched. The provider believes they are live for 6 hours, but PostgreSQL retains the initial 3-hour timestamp in `available_until`, dropping them offline unexpectedly. |
| **PAVL-2** | Save Working Timing Fails to Invalidate Cache or Refetch Provider | 🔴 P0 (Stale Booking Schedules & Logic Drift) | In `ProviderAvailability.tsx:77-88`, `handleSaveHours` updates `availability_note` in PostgreSQL but does not call `bustProviderGetCache(id)`, `invalidateQueryCache`, or `refetchProvider()`. Customer appointments and `toggleNow()` calculate turnoff against stale working hours. |
| **PAVL-3** | Service Radius Control Completely Missing from Availability Console | 🟠 P1 (Feature Omission & Operational Friction) | The operational console has no controls for `service_radius_km`. Service providers cannot adjust how far they are willing to travel for jobs without navigating to settings or the profile editor. |
| **PAVL-4** | Hardcoded "Tomorrow" in Live Availability Toast | 🟠 P1 (Confusing & Inaccurate User Feedback) | In `toggleNow:64`, the toast hardcodes `"tomorrow"` even if `turnoff` is today at 7:00 PM, misleading providers into believing their schedule was shifted by 24 hours. |
| **PAVL-5** | Inability to Set Specific Date Blocks or Holiday Overrides | 🟡 P2 (Inflexible Schedule Management) | Unlike businesses (`HoursEditor.tsx`), providers have no `BlockSlotModal` or single-date holiday overrides. To take an afternoon off, they must alter their permanent recurring weekly schedule. |
| **PAVL-6** | Lack of Unsaved Changes Guard on Working Timing | 🟡 P2 (Accidental Edit Loss) | Navigating away via `ProviderManageNav` after modifying `WeeklyHoursEditor` silently discards draft hours without warning. |
| **PAVL-7** | Dark Mode Theme Inconsistencies on Live Status Card | 🟢 P3 (Theme Contrast) | `var(--green-100)` background causes contrast issues with white text when rendering in dark mode. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 PAVL-1 (P0): Active Duration Slider Is Never Persisted to Backend

- **Location:** [`ProviderAvailability.tsx:143-158`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderAvailability.tsx#L143-L158), [`providerService.ts:308-337`](file:///d:/zetax/name/STRYT/src/services/marketplace/providerService.ts#L308-L337)
- **Root Cause:**
  ```tsx
  {effectiveNow && (
    <div style={{ marginTop: 12 }}>
      <div className="row between tiny semi">
        <span className="row gap-4 center-v"><Clock size={13} /> Active duration</span>
        <span style={{ color: "var(--green-500)" }}>{hours} hours</span>
      </div>
      <input
        type="range"
        min={1}
        max={8}
        value={hours}
        onChange={(e) => setHours(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--green-500)", marginTop: 6 }}
      />
    </div>
  )}
  ```
  When the provider toggles availability ON, `providerService.setAvailability(id, true, hours)` is called with `hours = 3`.
  The slider then appears on screen. When the provider adjusts the slider from 3 hours to 6 hours:
  `onChange` only invokes `setHours(Number(e.target.value))`.
  There is no `onPointerUp`, `onChangeEnd`, or debounced API call to update `available_until` in PostgreSQL.
  The database timestamp remains `Date.now() + 3 * 3600 * 1000`.
- **Remediation Plan:**
  Attach an `onPointerUp` / `onChange` debounce handler that calls `providerService.setAvailability(id, true, nextHours)` and refreshes the cache.

---

### 🔴 PAVL-2 (P0): Save Working Timing Fails to Invalidate Cache or Refetch Provider

- **Location:** [`ProviderAvailability.tsx:77-88`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderAvailability.tsx#L77-L88)
- **Root Cause:**
  ```typescript
  async function handleSaveHours() {
    if (noteRaw === undefined) return;
    setSaving(true);
    try {
      await providerService.update(id, { availabilityNote: noteRaw });
      showToast("Saved availability");
    } catch {
      showToast("Couldn't update availability note");
    } finally {
      setSaving(false);
    }
  }
  ```
  Neither `bustProviderGetCache(id)` nor `invalidateQueryCache('provider:${id}')` is called.
  `refetchProvider()` is also not invoked.
  The local component's `provider` prop remains stale.
  If the provider immediately toggles live availability:
  ```typescript
  const turnoff = calculateNextTurnoffTime(provider?.availabilityNote);
  ```
  This evaluates against the pre-save hours! Furthermore, `ProviderDetail.tsx` continues serving the old booking slot availability.
- **Remediation Plan:**
  Update `handleSaveHours` to call:
  ```typescript
  bustProviderGetCache(id);
  invalidateQueryCache(`provider:${id}`, () => bustProviderGetCache(id));
  await refetchProvider();
  ```

---

### 🟠 PAVL-3 (P1): Service Radius Control Completely Missing from Availability Console

- **Location:** [`ProviderAvailability.tsx:1-188`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderAvailability.tsx#L1-L188)
- **Root Cause:**
  `ProviderAvailability.tsx` manages only working hours and the live presence toggle.
  `serviceRadiusKm` controls how far the provider is discovered and booked by customers (`ProviderDetail.tsx:121-123`), but can only be changed inside `ProviderProfileEditor.tsx` or `ProviderSettings.tsx`.
- **Remediation Plan:**
  Add a "Service Radius & Travel Reach" section to `ProviderAvailability.tsx` using `<RadiusSelector>` so providers can manage both timing and travel boundaries in a single operational hub.

---

### 🟠 PAVL-4 (P1): Hardcoded "Tomorrow" in Live Availability Toast

- **Location:** [`ProviderAvailability.tsx:64`](file:///d:/zetax/name/STRYT/src/screens/provider/manage/ProviderAvailability.tsx#L64)
- **Root Cause:**
  ```typescript
  showToast(`Available until ${turnoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} tomorrow ⚡`);
  ```
  `calculateNextTurnoffTime` returns the timestamp when the current shift ends. If the provider turns on during morning hours, `turnoff` is today at closing time. Displaying `"tomorrow"` creates unnecessary confusion.
- **Remediation Plan:**
  Check if `turnoff.getDate() === new Date().getDate()`:
  ```typescript
  const isToday = turnoff.toDateString() === new Date().toDateString();
  const dayLabel = isToday ? "today" : "tomorrow";
  showToast(`Available until ${turnoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ${dayLabel} ⚡`);
  ```

---

## 4. Verification & Testing Checklist

- [ ] Moving the active duration slider sends an updated `available_until` timestamp to Supabase.
- [ ] Saving working hours invalidates `provider:${id}` query cache and updates `ProviderDetail` booking slots immediately.
- [ ] Toggling live availability during daytime displays "today" in the confirmation toast when turnoff is today.
- [ ] Adding service radius slider to the screen allows updating `service_radius_km` seamlessly.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
