# Next Batch — Plan

**Created:** 2026-08-04
**Scope:** map (superseded, see below), team-access history, delivery waiting list
**Excluded by decision:** push-notification plumbing (invisible until ~10k users)

> **Context, stated once and not repeated:** none of this moves supply, and
> supply is the launch constraint (3 shops, 4 catalogue items, 0 payments).
> These are worth building — they're just not what unblocks launch.

> **Superseded 2026-08-04:** items 1 and 4 below (map search, map visual pass)
> are now one body of work — **[MAP_SNAPCHAT_STYLE_PLAN.md](MAP_SNAPCHAT_STYLE_PLAN.md)**
> — a full-bleed, avatar-pin, carousel-driven redesign, not a small search fix
> and a separate polish pass. That plan's Phase A+D (new pins + working search)
> is the equivalent of what item 1 describes here; its Phase B/C/E/F is the
> equivalent of item 4, done properly instead of as a coat of paint. Go there
> for the map. Items 2 and 3 below (delivery queue, access history) are
> unaffected and still current.

| # | Item | User-visible? | Effort | Do it |
|---|------|---------------|--------|-------|
| 1 | ~~Map search finds shops~~ | — | — | See MAP_SNAPCHAT_STYLE_PLAN.md |
| 2 | Delivery waiting list | Owners with deliveries | M | First (of what remains here) |
| 3 | Team-access history | Owners, when things go wrong | M | Second |
| 4 | ~~Map visual pass~~ | — | — | See MAP_SNAPCHAT_STYLE_PLAN.md |

---

## 1. Map search — find shops, not just places

> **Superseded — see [MAP_SNAPCHAT_STYLE_PLAN.md](MAP_SNAPCHAT_STYLE_PLAN.md).**
> The dual-intent search design below is unchanged in substance (it's that
> plan's §3), just relocated into the new top strip instead of a floating bar.
> The location-rewrite bug found here is carried over and still tracked there.
> Left in place below for the reasoning; don't implement from this section.

### What's wrong

The map's search box only does **location** lookup. Type "Koregaon Park" and the
map moves. Type "chemist" and you get nothing — on a screen covered in shop
pins. Users will type shop names into it, because it's a search box on a map.

### Second problem, found while planning this

`SearchBar.pickPlace()` calls `userService.setLocation()`. **Picking a search
result permanently rewrites the user's saved home location.** Search for a shop
in Bangalore to see what's there, and the app now thinks you live in Bangalore —
which changes discovery, notification radius, and the map's opening position
everywhere else.

This is the same class of bug as the long-press-rewrites-your-location one fixed
earlier. It matters more now: since the map searches the viewport, picking a
place only needs to **move the map**.

### The build

- **No backend work.** `discoveryService.search(q, { lat, lng })` already exists
  and is what the Search screen uses.
- Search both sources in parallel as the user types (debounced).
- One dropdown, two labelled groups:

```
  ┌──────────────────────────────┐
  │ 🔍 chem                      │
  ├──────────────────────────────┤
  │ SHOPS & PEOPLE               │
  │  🏬 Anand Chemist    400 m   │
  │  🏬 Wellness Pharmacy 1.2 km │
  │ AREAS                        │
  │  📍 Chembur, Mumbai          │
  └──────────────────────────────┘
```

- Pick a **shop** → map flies to it, its pin opens, sheet scrolls to it.
- Pick an **area** → map flies there, "Search this area" fires automatically.
  **Does not touch the saved profile location.**
- Search scopes to the current map area, so results match what's on screen.

### Done when
Typing a shop name finds it; picking an area moves the map and leaves the
profile location alone; results are sensible in both Pune and Bangalore.

---

## 2. Delivery waiting list

### What's wrong

A "waiting for a driver" order is currently an **absence** — a DELIVERY
appointment with *no* delivery row attached. Nothing records it, so nothing can:

- count it ("3 orders waiting")
- age it ("this one's been 25 minutes")
- alert on it
- auto-assign from it later

The owner has to notice unassigned orders by eye, in the Bookings screen.

### The build

**A database view, not a new table.** A table would be a second copy of the
truth that has to be kept in sync — and a delivery queue that drifts out of sync
with real orders is worse than no queue. A view is derived from the orders
themselves and cannot disagree with them.

```sql
create view business_delivery_queue as
select a.id as appointment_id, a.target_id as business_id,
       a.customer_user_id, a.scheduled_for,
       a.delivery_address_line, a.delivery_lat, a.delivery_lng,
       a.created_at as ordered_at,
       now() - a.created_at as waiting_for
from appointments a
where a.fulfillment_type = 'DELIVERY'
  and a.status in ('PENDING','ACCEPTED')
  and not exists (
    select 1 from appointment_deliveries d
    where d.appointment_id = a.id
      and d.status in ('ASSIGNED','EN_ROUTE','ARRIVED')
  );
```

Then:
- An RPC returning it for one business, scoped to the `appointments` permission.
- A **"Waiting for a driver (N)"** section at the top of the Deliveries board,
  oldest first, showing how long each has waited, with Assign inline.
- Ages past a threshold turn amber then red. That's the whole point — an order
  waiting 40 minutes should look different from one placed 2 minutes ago.

### Note
A cancelled delivery puts the order **back** into this queue automatically,
because the cancelled row no longer counts as live. That's correct and it's a
nice consequence of deriving rather than storing.

### Done when
An order placed with no driver appears in the queue within seconds; assigning
removes it; cancelling a delivery returns it; the age is right.

---

## 3. Team-access history

### What's wrong

Check the table and there is genuinely **no history at all**:

`business_access_sessions` has `id, business_id, grantee_user_id, status,
requested_at, decided_at, expires_at, created_ip, access_level, scopes`.

Two gaps:
1. **No `granted_by`.** Even the *current* row doesn't record who gave access.
2. **`status` is overwritten in place.** Granting, editing scopes and revoking
   all mutate the same row, so the previous state is gone forever.

So if a shop owner asks *"who gave this person access to my bookings, and
when?"* — the answer cannot be reconstructed. It was never written down.

That's a merchant-trust problem: the first time staff access is disputed, the
owner finds out the system can't tell them.

### The build

An **append-only** log — the point is that nothing overwrites anything.

```sql
create table business_access_audit (
  id           bigserial primary key,
  business_id  text not null,
  actor_user_id   text,          -- who did it
  subject_user_id text,          -- who it was done to
  action       text not null,    -- GRANTED | SCOPES_CHANGED | REVOKED | EXPIRED
  access_level text,
  scopes       text[],
  prev_scopes  text[],
  at           timestamptz not null default now()
);
```

- Written from inside the existing RPCs — `grant_team_member_access`,
  `update_team_member_scopes`, `revoke_business_session` — so it can't be
  bypassed by a client.
- **No UPDATE or DELETE policy.** Owner can read their own business's rows; a
  log anyone can edit isn't a log.
- A simple "Access history" list on the Team & access screen: *"You gave Priya
  Appointments access — 12 Aug"*, *"You removed Rahul's access — 3 Sep"*.

### Also worth adding
`granted_by` on `business_access_sessions` itself, so the current state answers
"who gave this?" without reading the log.

### Done when
Grant, edit and revoke each write exactly one row; the history reads in plain
English; nobody — including the owner — can edit or delete entries.

---

## 4. Map visual pass

> **Superseded — see [MAP_SNAPCHAT_STYLE_PLAN.md](MAP_SNAPCHAT_STYLE_PLAN.md).**
> "Restyle the pins" turned into "replace the pins with a unified avatar system
> and a heat layer" after a scope decision — that plan's Phases A and E. Left
> in place below for context; don't implement from this section.

### What's wrong
Nothing functional. The pins, glass panels and spacing predate the Street Light
design and don't quite match the rest of the app.

### The build
- Pins restyled to brand colours, consistent sizes (keeping the 44pt tap area).
- Search bar, FABs and sheet on one consistent glass treatment.
- Sheet typography and spacing matched to other sheets.
- Loading and empty states aligned with the rest of the app.

### Deliberately not included
Marker clustering. Real need at density, own project, and nothing in current
data volume calls for it.

### Done when
The map looks like the same app as Home and Explore.

---

## Sequence

For what's still tracked in *this* file (the map items moved to
[MAP_SNAPCHAT_STYLE_PLAN.md](MAP_SNAPCHAT_STYLE_PLAN.md), which has its own
build order):

```
1. Delivery queue    ← view + RPC + board section
2. Access history    ← table + RPC writes + screen
```

Each ships independently.

## Verification

Per item: `tsc`, `eslint`, `vitest`, build. Database work verified in a
rolled-back transaction with before/after access checks, as with the delivery
and RLS migrations.

Then on device: place a delivery order and watch it enter
and leave the queue; grant and revoke access and read the history back.
