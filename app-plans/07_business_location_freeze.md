# Task 7 — Freeze Business Location + Admin-Approved Change

## Goal
A business's live location is frozen. To move it, the owner picks a new spot on a
**full-map** experience; that request goes to an **admin** who verifies and
grants it. Once granted, the new location is frozen again until the next
approved request. The owner's device location must NEVER auto-move the shop.

## Current state (verified) — mostly built
- Migration `20260833_business_location_review.sql`: `pending_lat`,
  `pending_lng`, `location_review_status ('NONE'|'PENDING')`,
  `pending_location_requested_at`. Live `lat/lng/geom` untouched until approval.
- `businessService.requestLocationChange(id, lat, lng)` writes staging columns +
  status PENDING.
- `adminService.approveLocationChange(id)` promotes staged→live (geom auto-syncs)
  and clears staging; `rejectLocationChange(id, reason?)` discards.
- AdminPanel "Location changes" queue renders pending requests with approve/
  reject.
- `ProfileEditor.tsx` calls `requestLocationChange` from a picker.

## Gaps to close / mature
1. **Full-map picker** — confirm ProfileEditor uses a real draggable map
   (MapView/maplibre) picker, not a coarse input; upgrade if weak.
2. **Freeze enforcement** — ensure NO code path writes `businesses.lat/lng`
   directly except `approveLocationChange` (audit: onboarding, Google import,
   any auto-sync). Google import (Task 5) must NOT write lat/lng.
3. **Owner feedback** — while PENDING, show "location change under review" with
   the requested pin; disable re-request until resolved.
4. **Admin UX** — show old vs new pin on a mini-map + distance delta + reason box.
5. **Notifications** — notify owner on approve/reject.

## Steps
- [ ] Audit all writers of `businesses.lat/lng`; funnel owner-initiated changes
      through `requestLocationChange` only.
- [ ] Verify/upgrade the map picker to a full-map drag experience.
- [ ] Add PENDING banner + disable duplicate requests.
- [ ] Confirm approve/reject notifies the owner.

## Risk
Medium. DB layer done; work is enforcement + UX. No destructive changes.
