# STRYT — Flow 7.9: Service & Broadcast Radius Management Gap Log

**Audit Date:** September 9, 2026  
**Flow Identifier:** Flow 7.9 — Domain 7 (Storefront Console & Merchant Operations)  
**Primary Components:** [`BroadcastRadius.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BroadcastRadius.tsx), [`RadiusSelector.tsx`](file:///d:/zetax/name/STRYT/src/components/RadiusSelector.tsx), [`ProfileEditor.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/ProfileEditor.tsx), [`BusinessProfileHub.tsx`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BusinessProfileHub.tsx)  
**Backend Services & Tables:** `businessService.ts`, `public.businesses` (`broadcast_radius`)  
**Launch Readiness Status:** 🟡 **Audited & Blocked by P0 Cache Desync & Blind Radius Selection Gaps**

---

## 1. Executive Summary

Flow 7.9 manages a business's local operational perimeter (`/business/:id/manage/broadcast`). Originally envisioned as a radius notification push tool (referenced historically as `broadcast_logs`), the production implementation serves as the dedicated editor for `businesses.broadcast_radius`—controlling the maximum geographic distance for customer booking availability, local community post distribution, and neighborhood story visibility.

While the standalone screen isolates this critical operational setting, the audit revealed several key gaps:
1. **Cache Invalidation Failure:** Saving a new radius calls `businessService.update()` and immediately runs `nav(-1)` back to `BusinessProfileHub.tsx`. Because `bustBusinessGetCache(id)` and `invalidateQueryCache('business:${id}')` are not called, the hub and public profile continue operating under stale cached radius limits.
2. **Blind Slider Without Map Geographic Feedback:** Merchants select a kilometer radius (1 km, 3 km, 5 km, 10 km, 25 km) on a slider with zero geographic visualization. A shopkeeper in a dense urban neighborhood cannot see which surrounding localities, landmarks, or natural boundaries fall within their selected perimeter.
3. **Redundant Duplicate Surface with ProfileEditor:** Both `BroadcastRadius.tsx` and `ProfileEditor.tsx` expose the exact same `<RadiusSelector>` component bound to the same `broadcastRadius` field, creating confusion over where primary store boundaries should be maintained.
4. **No Customer Reach / Audience Estimation:** The screen provides no estimate of how many local users or potential customers are within the selected radius, preventing merchants from making data-driven decisions on service range.

---

## 2. Maturation Triage: Ready-to-Use vs. Deferred

| Gap # | Title | Severity | Impact on Ready-to-Use |
| :--- | :--- | :---: | :--- |
| **RAD-1** | Missing Query Cache Invalidation Reverts Radius on Back Navigation | 🔴 P0 (Stale Cache & Overwrite Risk) | In `BroadcastRadius.tsx:28-31`, `businessService.update` updates `broadcastRadius` and navigates back (`nav(-1)`). Stale cached data in `queryCache` (`business:${id}`) is served to `BusinessProfileHub` and subsequent `ProfileEditor` sessions, risking old values overwriting the new radius on subsequent edits. |
| **RAD-2** | Blind Radius Selection Without Geographic Visualizer | 🟠 P1 (Operational Misconfiguration) | Merchants choose a radius from a pure slider without a map circle overlay. In Indian cities where 5 km may span across a river, toll road, or distinct municipal boundary, owners frequently over-commit or under-serve their trade area. |
| **RAD-3** | Duplicate Edit Surface Divergence | 🟡 P2 (Redundant Code & Form Inconsistency) | `ProfileEditor.tsx:244-250` and `BroadcastRadius.tsx:50-55` both edit `broadcastRadius`. An owner editing other profile details in `ProfileEditor` might leave radius unchanged, overwriting recent adjustments made in `BroadcastRadius`. |
| **RAD-4** | Zero Realtime Reach Estimation | 🟡 P2 (Lack of Actionable Feedback) | The merchant has no feedback on how many active users or neighborhoods are encompassed by their radius choice. |

---

## 3. Detailed Findings & Root Cause Analysis

---

### 🔴 RAD-1 (P0): Missing Query Cache Invalidation Reverts Radius on Back Navigation

- **Location:** [`BroadcastRadius.tsx:25-35`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BroadcastRadius.tsx#L25-L35), [`businessService.ts:635-651`](file:///d:/zetax/name/STRYT/src/services/marketplace/businessService.ts#L635-L651)
- **Root Cause:**
  ```typescript
  async function save() {
    setSaving(true);
    try {
      await businessService.update(id, { broadcastRadius: radius });
      showToast("Service radius updated");
      nav(-1);
    } ...
  }
  ```
  `businessService.update(id, ...)` does not invoke `bustBusinessGetCache(id)`.
  `BroadcastRadius.tsx` does not invoke `invalidateQueryCache('business:${id}')`.
  When `nav(-1)` returns to `BusinessProfileHub.tsx`, the screen reads the existing query cache, reflecting old values.
- **Remediation Plan:**
  Add cache invalidation calls in `BroadcastRadius.save()`:
  ```typescript
  bustBusinessGetCache(id);
  invalidateQueryCache(`business:${id}`, () => bustBusinessGetCache(id));
  ```

---

### 🟠 RAD-2 (P1): Blind Radius Selection Without Geographic Visualizer

- **Location:** [`BroadcastRadius.tsx:50-55`](file:///d:/zetax/name/STRYT/src/screens/business/manage/BroadcastRadius.tsx#L50-L55)
- **Root Cause:**
  The screen renders only `<RadiusSelector>` (a numeric slider with radio chips).
  There is no interactive map preview or circle overlay showing the coverage area relative to the store's verified pin (`lat`, `lng`).
- **Remediation Plan:**
  Embed a static or interactive `MiniMap` preview with a semi-transparent circular boundary representing the selected kilometer radius centered on `b.lat, b.lng`.

---

## 4. Verification & Testing Checklist

- [ ] Saving service radius immediately invalidates query cache and updates public discovery checks.
- [ ] Navigating back to Profile Hub reflects the updated radius without requiring manual page reload.
- [ ] Ensure radius slider bounds (1 km to 50 km) are respected and persisted cleanly to PostgreSQL.
- [ ] Run `npm run check-colors` and `npx tsc --noEmit` to verify type and design token compliance.
