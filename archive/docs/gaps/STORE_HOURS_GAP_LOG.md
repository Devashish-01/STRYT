# STRYT — Flow 7.3: Store Hours & Realtime Open Status Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.3 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`HoursEditor.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx), [`WeeklyHoursEditor.tsx`](file:///d:/zetax/name/STRYT/src/components/WeeklyHoursEditor.tsx), [`src/utils/availability.ts`](file:///d:/zetax/name/STRYT/src/utils/availability.ts)  
**Backend Services & Tables:** `businessService.ts`, `businesses` (`hours`, `is_available_now`, `available_until`), `set_business_availability` RPC  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0/P1 Availability Logic Gaps**

---

## 1. Executive Summary

Flow 7.3 governs how local businesses configure their weekly operating timetable (single-shift, split-shift, or 24×7) and manage their instant presence toggle ("Shop open right now"). The availability engine drives discovery badging ("Open Now" / "Closed"), walk-in digital token availability, and future appointment slot generation across customer browsing.

While the weekly schedule editor features clean split-shift and copy-to-all capabilities, the underlying availability state machine contains critical architectural flaws:
1. The manual presence toggle operates on a lossy boolean that permanently erases the `null` ("Automatic / Follow Posted Hours") state upon first touch, permanently trapping the merchant in manual closed mode.
2. Cross-midnight operating windows (e.g. 19:00 to 02:00 for bars, late pharmacies, food stalls) are discarded as invalid due to strict `toMin > fromMin` filter guards, wiping out shifts and bookable slots.
3. Off-hours auto-turnoff calculations mistakenly advance by 24 hours into the next day even during early morning hours.
4. Toggling instant availability auto-saves immediately to the database while weekly hours require a separate manual button press, causing high risk of lost schedule edits.

---

## 2. Detailed Findings & Gap Analysis

### 🔴 HRS-1 (P0): Binary Toggle Traps Business in Permanent Manual Override (Loss of "Auto" State)

- **Location:** [`HoursEditor.tsx:28, 45-68`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx#L28), [`availability.ts:324-326`](file:///d:/zetax/name/STRYT/src/utils/availability.ts#L324-L326)
- **Problem:**
  In the database schema, `businesses.is_available_now` has three semantic states:
  - `NULL`: **Auto Mode** (Store dynamically opens and closes based on the posted weekly schedule in `businesses.hours`).
  - `TRUE`: **Forced Open** (Manual override open).
  - `FALSE`: **Forced Closed** (Manual override emergency closed).

  In [`HoursEditor.tsx:28`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx#L28):
  ```typescript
  setOpenNow(b.isAvailableNow ?? false);
  ```
  `null` is coerced to `false`. When an owner opens this screen at 2:00 PM during posted working hours, the switch renders as "OFF", misleading the merchant into thinking their shop is closed. When they toggle it, `toggleOpenNow()` calls `businessService.setAvailability(id, next, ...)`, writing an explicit `false` or `true` boolean.

  Once `false` is written:
  ```typescript
  // availability.ts:324-325
  const finalOpen = isAvailableNow === false ? false : (isAvailableNow === true ? true : isOpen);
  ```
  `finalOpen` evaluates to `false` forever. On subsequent days, weeks, and months, the store will **never automatically open** during posted hours. The UI provides zero way to revert `is_available_now` back to `null` ("Auto Mode").
- **Impact:** Any merchant who tests or touches the toggle once permanently breaks their automated daily store hours. Customers will see the business marked "Closed" every single day unless the merchant manually toggles it ON every morning.
- **Remediation:**
  1. Support a tri-state or distinct "Manual Override vs Auto Schedule" model in the UI.
  2. If `b.isAvailableNow === null`, the toggle should reflect `scheduleEval.isOpenNow` with a badge saying "Following weekly schedule (Auto)".
  3. Provide an explicit "Resume schedule (Auto)" action that invokes `businessService.setAvailability(id, null, null)`.

---

### 🔴 HRS-2 (P0): Cross-Midnight & Overnight Shift Inversion

- **Location:** [`availability.ts:197-204`](file:///d:/zetax/name/STRYT/src/utils/availability.ts#L197-L204), [`WeeklyHoursEditor.tsx:138-140, 197-200`](file:///d:/zetax/name/STRYT/src/components/WeeklyHoursEditor.tsx#L138-L140)
- **Problem:**
  [`availability.ts:202`](file:///d:/zetax/name/STRYT/src/utils/availability.ts#L202) defines valid windows as:
  ```typescript
  export function getDayWindows(w: WeeklyHours, day: DayCode): { fromMin: number; toMin: number }[] {
    const ds = w.days[day];
    if (!ds || !ds.open || ds.ranges.length === 0) return [];
    return ds.ranges
      .map((r) => ({ fromMin: parseTimeToMinutes(r.from), toMin: parseTimeToMinutes(r.to) }))
      .filter((r) => r.toMin > r.fromMin) // <-- Drops overnight windows!
      .sort((a, b) => a.fromMin - b.fromMin);
  }
  ```
  For nightlife venues, clubs, 24-hour pharmacies with night shifts, food trucks, and late-night dine-ins operating from `19:00` to `02:00`:
  - `parseTimeToMinutes("19:00")` = 1140.
  - `parseTimeToMinutes("02:00")` = 120.
  - Because `120 > 1140` is `false`, the entire window is filtered out and dropped!
  - `getDayWindows()` returns an empty array `[]`.
- **Impact:** Businesses with evening/night shifts spanning past midnight are marked completely "Closed" 24/7. Slot generation returns 0 appointment slots, and walk-in queue tokens cannot be issued.
- **Remediation:**
  Support overnight ranges by splitting any window where `toMin <= fromMin` into two canonical spans across day boundaries: `[fromMin, 1440)` on Day $N$, and `[0, toMin)` on Day $N+1$, or validate and prompt the merchant to input split midnight boundaries explicitly.

---

### 🟠 HRS-3 (P1): Erroneous 24h Advance in `calculateNextTurnoffTime`

- **Location:** [`availability.ts:338-348`](file:///d:/zetax/name/STRYT/src/utils/availability.ts#L338-L348)
- **Problem:**
  ```typescript
  export function calculateNextTurnoffTime(availabilityNote?: string): Date {
    const target = new Date();
    target.setDate(target.getDate() + 1); // target next day

    const w = parseHoursValue(availabilityNote);
    const windows = getDayWindows(w, JS_DAY_INDEX[target.getDay()]);
    const toMin = windows.length > 0 ? windows[windows.length - 1].toMin : 19 * 60;

    target.setHours(Math.floor(toMin / 60), toMin % 60, 0, 0);
    return target;
  }
  ```
  In [`HoursEditor.tsx:53-56`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx#L53-L56), if an owner toggles "Open Right Now" outside normal working hours, `calculateNextTurnoffTime()` is called to determine when to automatically clear the override.
  However, `calculateNextTurnoffTime()` unconditionally adds `+1` day (`target.setDate(target.getDate() + 1)`).
  - If a merchant opens their shop early at 7:00 AM (normal hours: 10:00 AM – 8:00 PM), `calculateNextTurnoffTime()` sets the turnoff time to **tomorrow at 8:00 PM** (37 hours later!) instead of **today at 8:00 PM**.
  - Even if turned on at 9:00 PM (after closing), jumping to tomorrow's closing time keeps the shop marked open throughout the entire upcoming night and following day.
- **Impact:** The temporary "Open Now" override stays active for 24 to 36+ hours, falsely reporting stores as open in the middle of the night.
- **Remediation:**
  If the current time is before today's closing window, the turnoff target must be today's closing window. Only if current time is *after* all windows today should it target tomorrow's closing window.

---

### 🟠 HRS-4 (P1): Decoupled Save Paradigm: Toggle Auto-Persists While Schedule Discards

- **Location:** [`HoursEditor.tsx:45-86`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx#L45-L86)
- **Problem:**
  The screen combines two fundamentally different interaction models:
  1. The top card's "Shop open right now" toggle auto-saves immediately on tap (`await businessService.setAvailability(id, next, ...)`).
  2. The bottom "Working Hours" weekly grid updates local React state `hoursRaw` and requires scrolling down to tap a sticky footer button "Save Working Timing".
  If a merchant changes their Wednesday opening hours from 9 AM to 10 AM, and then flips the "Shop open right now" toggle at the top (which gives a toast "Shop marked open right now ⚡"), they navigate back expecting their schedule edits were saved. Because `save()` was never invoked, all weekly hour edits are discarded without a dirty-state warning dialog.
- **Impact:** Lost merchant configuration; mismatched expectations between immediate toggle feedback and uncommitted schedule state.
- **Remediation:** Add dirty-state tracking (`isDirty = hoursRaw !== b?.hours`) with an unsaved changes warning when navigating away, or unify save behavior.

---

### 🟡 HRS-5 (P2): Missing Timezone Normalization for Public & Multi-Region Viewers

- **Location:** [`availability.ts:253, 290, 316-317`](file:///d:/zetax/name/STRYT/src/utils/availability.ts#L253)
- **Problem:**
  `availability.ts` relies on `new Date().getHours()` and `new Date().getDay()` from the client browser's local clock:
  ```typescript
  const now = new Date();
  const currentDayName = JS_DAY_INDEX[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  ```
  If an Indian business operates 09:00–18:00 IST, an overseas customer, traveler, or remote booking client viewing the storefront from UTC or EST will evaluate `currentDayName` and `currentMinutes` against their local device clock (e.g. UTC 05:00 or EST 00:30). A shop that is open at 2:00 PM IST will be calculated as "Closed • Opens tomorrow at 09:00".
- **Impact:** Incorrect "Open Now" badges and false "Closed" states shown to travelers, diaspora customers, and devices with misconfigured system timezones.
- **Remediation:** Accept an optional store timezone string (e.g. `Asia/Kolkata`) or format `now` in the target merchant's IANA timezone using `Intl.DateTimeFormat`.

---

### 🟡 HRS-6 (P2): Broken Navigation Link to Appointments for Scoped Staff Members

- **Location:** [`HoursEditor.tsx:130-141`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx#L130-L141), [`App.tsx:669`](file:///d:/zetax/name/STRYT/src/App.tsx#L669)
- **Problem:**
  [`HoursEditor.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/HoursEditor.tsx) includes an educational navigation card:
  ```tsx
  <button onClick={() => nav(`/business/${id}/manage/appointments`)}>
    <Calendar size={20} />
    <div>Block a specific date or time</div>
  </button>
  ```
  In [`App.tsx:669`](file:///d:/zetax/name/STRYT/src/App.tsx#L669), the route `/business/:id/manage/hours` is protected with:
  ```tsx
  <RequireScope scope="catalog">
  ```
  However, `/business/:id/manage/appointments` is guarded with:
  ```tsx
  <RequireScope scope="appointments">
  ```
  Staff members who have been granted `catalog` permissions (allowing them to update store hours and pricing) but lack the `appointments` scope will tap "Block a specific date or time" and be greeted with an access denial / unauthorized bounce.
- **Impact:** Confusing dead end for delegated store staff.
- **Remediation:** Conditionally hide the link or disable it with a clear permission note if the current user session lacks the `appointments` scope.

---

### 🟢 HRS-7 (P3): Hardcoded `#fff` Surface Tokens in Weekly Editor

- **Location:** [`WeeklyHoursEditor.tsx:45, 150`](file:///d:/zetax/name/STRYT/src/components/WeeklyHoursEditor.tsx#L45)
- **Problem:**
  Lines 45 and 150 contain hardcoded `#fff` styles:
  ```tsx
  // line 45 (Toggle knob):
  background: "#fff"
  // line 150 (Open 24x7 button card):
  background: "#fff"
  ```
  In dark mode, this creates an unstyled glaring white card and toggle handle against dark surfaces.
- **Impact:** Violates dark-mode consistency and design token standards.
- **Remediation:** Replace `#fff` with `var(--surface)` / `var(--card)` or theme-aware tokens.

---

## 3. Maturation Roadmap & Action Plan

| Gap ID | Priority | Description | Action Item |
| :--- | :---: | :--- | :--- |
| **HRS-1** | 🔴 P0 | Toggle traps business in permanent manual off mode | Implement tri-state or "Resume Auto Schedule" button writing `null` to `is_available_now`. |
| **HRS-2** | 🔴 P0 | Overnight shifts past midnight dropped | Handle split cross-midnight ranges or validate day spans in `getDayWindows`. |
| **HRS-3** | 🟠 P1 | `calculateNextTurnoffTime` leaps 24h forward | Target today's closing time if current time is before today's closing window. |
| **HRS-4** | 🟠 P1 | Unsaved hours lost when toggling or navigating | Add dirty state tracking and confirm dialog before route change. |
| **HRS-5** | 🟡 P2 | Browser clock used instead of business timezone | Standardize availability evaluation with `Intl.DateTimeFormat` or store timezone. |
| **HRS-6** | 🟡 P2 | Appointments link crashes for staff lacking scope | Check `appointments` scope before rendering calendar navigation card. |
| **HRS-7** | 🟢 P3 | Hardcoded `#fff` in WeeklyHoursEditor | Replace `#fff` with CSS variables `var(--surface)`. |
