# 05 — Community Posts

**Priority:** P2 (per existing test plan), but this screen was fully
redesigned late Aug/early Sep 2026 **and** touched again this cycle for
bulk-buying — cover the full current surface, not the pre-redesign basics.
**Screens:** `CommunityHub`, `CommunityCompose`, `CommunityPostDetail`,
`CommunityActivity`, `StoryCompose`.
**Service:** `communityService.ts`.

## Flow A — Post each of the 6 types

| # | Type | What to check |
|---|------|----------------|
| 1 | Ask neighbors (`RECOMMENDATION`) | Optional "tag a place" — links to a real business/provider listing |
| 2 | Lost & Found | Last-seen location + optional reward fields |
| 3 | Alert | Urgency picker (Info/Warning/Urgent), auto-expiry hours shown match the severity |
| 4 | Giveaway | Pickup-details field |
| 5 | Poll | 2+ options, closing-time picker, can't submit duplicate option text |
| 6 | Shoutout | Tag-a-place is **required** (not optional) for this type |

For every type: title required (min length enforced), photos (up to the
cap), photo alt-text field appears once a photo is attached, "Post settings"
(who can reply, hide like count) collapsed by default and works when opened,
Preview shows the real `CommunityCard` before posting, Cancel with unsaved
content prompts save/discard/keep-editing (not a silent discard).

## Flow B — Seller identity posting

| # | Step | Expected |
|---|------|----------|
| 1 | From a business/provider dashboard's "Post to community" tile | Composer opens **already scoped to that seller identity** — badge shows Business/Provider, not "You" |
| 2 | Post | Appears in community feed authored by the business/provider, not the personal account |
| 3 | Open the composer as a **customer** (no seller context) | Badge shows "You", posts under the personal identity |
| 4 | A qualifying business's seller identity | Bulk-buying toggle available (see workflow 16) — a non-qualifying business/provider does **not** see it |

## Flow C — Feed, comments, reactions

| # | Step | Expected |
|---|------|----------|
| 1 | `CommunityHub` main feed | Sort/filter, infinite scroll |
| 2 | Open a post → `CommunityPostDetail` | Full content, comment thread |
| 3 | Add a comment | Appears immediately, comment policy respected (Off/Neighbors/Mutuals/Everyone) |
| 4 | Like a post rapidly several times | Never flickers/reverts after settling (this was a fixed regression) |
| 5 | Guest opens a post card | **Share button hidden** for guests (fixed regression — guests could previously see it when no other Share button in the app shows for guests) |
| 6 | Report a post | `ReportSheet` opens, submits |
| 7 | Mark resolved (Lost & Found / Alert / Giveaway only — poll/shoutout aren't resolvable) | Resolved badge appears |

## Flow D — Bulk buying tab specifically

| # | Step | Expected |
|---|------|----------|
| 1 | `CommunityHub` → "Bulk buying" filter | Two sections: **Group buys** (legacy peer pools, see workflow 07) and **Bulk-buying campaigns nearby** (business-run — see workflow 06) |
| 2 | Confirm the section is titled "Bulk-buying campaigns nearby", not the old "Bulk deals from shops nearby" | Renamed this cycle |
| 3 | Claim-passes-ready banner | Counts **both** group-buy and bulk-deal tokens |

## Flow E — Stories

| # | Step | Expected |
|---|------|----------|
| 1 | `/story/new` | Camera/gallery capture, post |
| 2 | Story appears on Home's stories bar | Viewable, avatar shows correctly |
| 3 | Story on the Map (avatar pins) | Renders; broken images hide cleanly |

## Flow F — Activity

| # | Step | Expected |
|---|------|----------|
| 1 | `/community/activity` | Claim passes (merged group-buy + bulk-deal), pools joined but not posted by you |
| 2 | Tap a claim pass | Opens the shared claim-pass modal, QR renders |
