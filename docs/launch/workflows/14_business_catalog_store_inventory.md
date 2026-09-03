# 14 — Business: Catalog, Store, Inventory

**Priority:** P0/P1.
**Screens:** `BusinessStoreHub`, `CatalogManager`, `InventoryAlerts`,
`BusinessPortfolio`, `HoursEditor`.

## Flow A — Store hub

| # | Step | Expected |
|---|------|----------|
| 1 | `/business/:id/manage/store` | Tiles: Catalog, Inventory management, (Bulk deals if package qualifies — workflow 16), Portfolio, Hours & Availability, Edit profile |
| 2 | Business whose package does **not** sell countable units (salon/clinic/homeservice-type) | **Bulk deals tile absent** — confirm this is the same `showCartStepper` gate the community composer uses, not a separate/inconsistent check |
| 3 | Flagged-item count badge on Inventory tile | Matches actual out-of-stock + low-stock (≤5) items |

## Flow B — Catalog

| # | Step | Expected |
|---|------|----------|
| 1 | `CatalogManager` → add item | Name, price, photo, veg/non-veg flag (if food category), description |
| 2 | Set inventory type: **FINITE** | Quantity field appears, decrements on sale/booking |
| 3 | Set inventory type: **INFINITE** | No quantity tracking, never shows out-of-stock |
| 4 | Edit an existing item | Changes persist, reflected immediately on the public business page |
| 5 | Delete an item | Removed from the public page; existing past bookings that reference it still display correctly (don't break history) |
| 6 | Set `slot_capacity` / `max_party_size` on a service item | Reflected correctly in `AppointmentSheet`'s slot picker (workflow 03) |

## Flow C — Inventory alerts

| # | Step | Expected |
|---|------|----------|
| 1 | `InventoryAlerts` | Lists out-of-stock and low (≤5) FINITE items |
| 2 | Restock an item | Alert clears |
| 3 | Business Store hub reads "Inventory" (label check — was flagged as a feedback item, not "Menu"/other wording) | Confirmed |

## Flow D — Portfolio

| # | Step | Expected |
|---|------|----------|
| 1 | Add a portfolio photo/item | Appears on the public business page's portfolio section |
| 2 | Reorder / delete | Persists |

## Flow E — Hours

| # | Step | Expected |
|---|------|----------|
| 1 | `HoursEditor` — set weekly hours | Reflected in the public "open/closed" state (`evaluateProviderAvailability`) |
| 2 | Block a specific date (holiday) | Slots on that date unavailable in booking |
| 3 | Block a recurring day | Same, every week |
| 4 | Unblock | Slots return |
