# Community Post Flow — Bug & Gap Log

**Purpose:** every real defect, missing button, and usability or architectural gap found during the community post flow audit gets one entry here. Covers both the **UI side** (missing buttons, controls, sheets, and navigation dead ends) and the **Backend side** (RPC limitations, trigger omissions, race conditions, and notification gaps).

## How to use this

- One entry per issue.
- **Status** is one of: `Open` · `Fixed` · `Won't fix` (with reason) · `By design` (with reason).
- Root cause cites the exact file/line/function/migration.
- Fix direction outlines the required frontend and backend modifications.

---

## #1 — Post Detail screen is missing the `+ Recommend` button

**Status:** Fixed — 2026-09-08

`+ Recommend` added to the detail page for RECOMMENDATION posts (signed-in
viewers), opening the same shared `ListingPickerSheet` the feed card uses and
calling the now-atomic `recommendListing` (see #16). The post query on this
screen is already realtime on `community_posts`, so the new recommendation
appears without a manual refetch.

**Status was:** Open  
**Area:** `src/screens/CommunityPostDetail.tsx:828-850`, `src/components/cards.tsx:910-921`

**Reported:** "see for the gaps in the community post flow any button should be there which is not in the app"

**Root cause:** on the feed card (`CommunityCard` in `cards.tsx:910-921`), `RECOMMENDATION` posts render a `+ Recommend` button that opens `ListingPickerSheet` and calls `communityService.recommendListing()`. However, inside `CommunityPostDetail.tsx` (the dedicated discussion view for the post), lines 828–850 only render the existing recommendations array (`safePost.recommendations.map(...)`). **The `+ Recommend` button was never placed on the detail page.** A neighbor who clicks into a recommendation post to read and contribute has no button to add their suggestion.

**Fix direction:**
1. In `CommunityPostDetail.tsx`, add a `+ Recommend` button in the Recommendations section header or empty state.
2. Render `ListingPickerSheet` on tap and wire it to `communityService.recommendListing()`.

---

## #2 — Comment composer is missing an "Attach Listing" button

**Status:** Fixed — 2026-09-08 (client only)

An "Attach a place" chip now sits beside "Share my number" in the composer,
opening the same `ListingPickerSheet` the post's "+ Recommend" and the
composer's own "tag a business" already use. The picked listing shows as a
filled chip with its name and an × to drop it, and `sendComment` passes
`listingType`/`listingId` through to `addComment`, clearing the selection once
the comment lands.

**No backend work was needed** — this really was dead UI on a complete path.
Verified end to end while fixing: `addComment` already accepted both options,
already wrote `listing_type`/`listing_id` on the insert, and already returned
them on the created `Comment`, and `CommentRow` already rendered
"→ View listing" whenever `c.listingId` was set. The only missing piece was
something to set it with.

Motivating case: "which shop?" is the most common reply on an ASK post, and a
typed shop name isn't tappable. Attaching the real listing makes the answer a
link into the profile instead of a name the reader has to go search for.

**Status was:** Open  
**Area:** `src/screens/CommunityPostDetail.tsx:974-1095`, `src/services/engagement/communityService.ts:615-648`

**Reported:** "any button should be there which is not in the app make a list of all the gaps"

**Root cause:** both the database schema (`post_comments.listing_type`, `post_comments.listing_id`), the service (`communityService.addComment` accepting `listingType` and `listingId`), and the comment display row (`CommentRow` at `CommunityPostDetail.tsx:231-239` rendering `→ View listing`) explicitly support attaching a business or provider to a comment. However, the comment input bar at `CommunityPostDetail.tsx:1002-1042` only exposes the "Share my number" toggle. There is **no button to attach a business or provider listing to a comment**. This capability is dead code from the UI perspective.

**Fix direction:**
1. Add an "Attach place / provider" button (`Tag` or `Store` icon) next to the "Share my number" chip in `CommunityPostDetail.tsx`.
2. Open `ListingPickerSheet` to select a business/provider and pass `listingType` and `listingId` to `communityService.addComment()`.

---

## #3 — Feed card overflow menu (`...`) is missing author quick actions (Edit, Delete, Mark Resolved, Comment Policy)

**Status:** Fixed — 2026-09-08 (client only, three of four actions)

`CommunityCard`'s `...` sheet gained an `isPostAuthor` branch alongside the
existing non-author one:

- **Edit post** — navigates to the detail screen with `state.openEdit`, which
  `CommunityPostDetail` now honours by opening `EditPostSheet` on mount.
  Deliberately *not* a second copy of the sheet on the card: it's a full form
  with uploads, and two copies would drift.
- **Mark as resolved / Reopen** — `communityService.setResolved`, optimistic
  with a `resolvedOverride` that reverts on failure and clears once the server
  agrees, the same pattern `likeOverride`/`saveOverride` already use in this
  file. The card's own "Resolved" badge reads the override, so the tap shows
  immediately. Offered for `LOST_FOUND`/`ALERT` only — the same rule the detail
  screen applies, since a poll or shoutout never had an outstanding thing to
  resolve.
- **Delete post** — confirmation sheet first (wording matched to the detail
  screen's), then `communityService.delete`, then both `onHide(post.id)` and
  `onRefetch()` so the row leaves the feed whichever of the two the parent
  passed.

**Comment policy is deliberately not here.** It isn't editable *anywhere* yet —
`community_post_update` has no `p_comment_policy` parameter, so a menu row for
it would have had nothing to call. That's [#6](#6--post-edit-sheet-cannot-edit-rich-per-type-fields-comment-policy-or-like-count-visibility)'s
scope, and the edit sheet is where it belongs regardless; this menu's "Edit
post" row will reach it once #6 lands.

**Status was:** Open  
**Area:** `src/components/cards.tsx:940-994` (`CommunityCard`)

**Reported:** "any button should be there which is not in the app"

**Root cause:** when a post's author taps the `...` (`DotsThree`) overflow menu on their own card in the feed, `cards.tsx:956` branches on `!isPostAuthor`. The non-author branch gets "Hide this post", "Mute author", and "Report post". For the post author, the menu renders **only** "Save for later" and "Share". The author sees:
- **NO "Edit Post" button**
- **NO "Delete Post" button**
- **NO "Mark as Resolved" button**
- **NO "Turn off / Change comments policy" button**

The author is forced to click through to the post detail screen to perform basic author lifecycle actions.

**Fix direction:**
1. In `cards.tsx:944-990`, add author action rows when `isPostAuthor`:
   - "Edit post" (opens `EditPostSheet` or navigates to edit)
   - "Mark as resolved" / "Reopen" (calls `communityService.setResolved()`)
   - "Delete post" with confirmation sheet (calls `communityService.delete()`)
2. Pass `onRefetch` or `onDelete` to update the parent feed instantly.

---

## #4 — Comments thread is missing all comment management buttons (Delete, Edit, Report, Pin)

**Status:** Fixed — 2026-09-08 (`20260929` + `CommentRow`)

All four actions now exist, behind a `⋯` overflow menu on each comment row.

**Backend (`20260929_comment_management.sql`)** — `post_comments` gained
`pinned_at` and `edited_at` plus a `(post_id, pinned_at desc nulls last,
created_at)` index, and three SECURITY DEFINER RPCs:

- `community_comment_delete(p_id)` — the comment's author **or** the post's
  author. Two legitimate deleters for different reasons: your own words are
  yours to retract, your own post is yours to keep clean. Clears the comment's
  reactions and nested replies first so nothing dangles.
- `community_comment_update(p_id, p_body)` — author only, body only, stamps
  `edited_at`. Mentions are deliberately **not** re-extracted: re-running
  extraction on an edit would let someone rewrite a benign comment into one
  that @-pings half the street after the fact.
- `community_comment_set_pinned(p_id, p_pinned)` — post author only, and
  single-pin (clears any previous pin in the same call), so the UI never has to
  decide which of several pins wins.

**Verified live**, in a rolled-back transaction with real RLS impersonation —
all seven permission cases: `stranger_delete → NOT_ALLOWED`,
`author_deleted_own → 0 rows left`, `post_author_deleted_spam → 0`,
`non_owner_pin → NOT_POST_AUTHOR`, `pinned_count_after_two_pins → 1`,
`stranger_edit → NOT_YOUR_COMMENT`, `author_edit_ok → 1`.

**Client** — `communityService` gained `deleteComment` / `updateComment` /
`setCommentPinned`; `comments()` orders `pinned_at desc nulls last` before
`created_at`; `Comment` gained `pinnedAt` / `editedAt`. `CommentRow` renders a
"Pinned by the author" badge and brand-tinted bubble, a `· edited` marker next
to the timestamp, an inline edit textarea (not optimistic — a rejected edit
keeps the typed text and the composer open rather than looking like it stuck),
and the overflow menu itself. Pin is offered on top-level comments only, since
the pin sorts to the top of the top-level list where a reply has no place.
`hoistPinned` keeps the pinned comment above everything **whatever sort is
chosen** — "Newest" shouldn't bury the answer the author marked as the answer.

Report is covered by [#20](#20--missing-backend-admin-moderation-and-reporting-for-comments).

**Status was:** Open  
**Area:** `src/screens/CommunityPostDetail.tsx:199-304` (`CommentRow`), `src/types/social.ts:143-144`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** `CommentRow` only renders reaction chips, a `+ React` button, and a `Reply` button. It is missing fundamental comment actions:
- **NO "Delete Comment" button:** a commenter cannot remove their own comment. The type definition in `social.ts:143-144` even notes: `authorUserId?: string; /** The user who wrote it — needed to link a mention back to a profile and to know whether the viewer may delete it. */`, yet the delete affordance was never written into `CommentRow`.
- **NO Post Author Moderation:** the post author cannot delete spam, abusive, or harmful comments under their own post.
- **NO "Edit Comment" button:** typos or outdated information cannot be corrected.
- **NO "Report Comment" button:** `ReportSheet.tsx` only accepts target types `POST`, `BUSINESS`, `PROVIDER`, `REQUEST`, `USER`, `PROPOSAL`, `RATING`. There is no way to report an abusive comment.
- **NO "Pin Comment / Accept Answer" button:** the post author cannot pin the most helpful comment or accepted solution to the top of the thread.

**Fix direction:**
1. Add an overflow menu or action trigger on `CommentRow` for:
   - "Delete" (visible to comment author and post author).
   - "Report" (visible to other users, triggering `ReportSheet` with `targetType: "COMMENT"`).
   - "Pin to top" (visible to post author).
2. Wire `communityService.deleteComment(commentId, postId)`.

---

## #5 — Saved community posts are completely inaccessible (`Bookmarks.tsx` missing tab)

**Status:** Fixed — 2026-09-08

**Fix:** a "Posts" tab in `Bookmarks.tsx`, rendering `communityService.savedPosts()`
through the existing `CommunityCard`. No service or backend work was needed —
`savedPosts()` was already written and correct (including ordering by *save*
time rather than post time), it simply had zero callers, so nothing in the app
could ever show a saved post back.

One difference from the sibling tabs worth noting: Business/Provider/Request
all resolve ids out of the client-side `bookmarks` store, but saves live
server-side in `post_saves`, so this tab is a real query rather than a
fetch-by-id. Its `loading` is folded into the shared flag and its count into
the tab badge like the others. New `tab_posts_saved` key in en/hi/mr.

**Verified live** (rolled-back) that the read path actually works under RLS,
since this query had never run in production: a user's own `post_saves` rows
are readable (1) and the referenced posts resolve (1). `tsc`/`eslint`/`vitest`
(518/518) clean.

**Original diagnosis, kept for the record:**
**Status was:** Open — Dead End  
**Area:** `src/screens/Bookmarks.tsx:13, 90-105`, `src/services/engagement/communityService.ts:482-507`

**Reported:** "see for the gaps in the community post flow"

**Root cause:** users can tap the bookmark icon on any post in `CommunityCard` (`cards.tsx:881-896`) and `CommunityPostDetail` (`:651-661`), which successfully calls `communityService.toggleSave()` and persists into the `post_saves` table (`migration 20260893`). `communityService` even contains a full retrieval method `savedPosts()` (`:482-507`). However:
- `Bookmarks.tsx` hardcodes tabs: `BUSINESS`, `PROVIDER`, `REQUEST`, `FOLLOWING`.
- There is **no "Posts" or "Community" tab in Bookmarks**.
- `CommunityHub.tsx` has no "Saved" view or chip either.
- `communityService.savedPosts()` has **zero callers** across the entire project.

A user can save posts, but can never view their saved posts anywhere in the application.

**Fix direction:**
1. Add a `"POST"` ("Community") tab to `Bookmarks.tsx` (e.g., `["POST", t("tab_posts_saved")]`).
2. Query `communityService.savedPosts()` and render using `CommunityCard`.

---

## #6 — Post edit sheet cannot edit rich per-type fields, comment policy, or like count visibility

**Status:** Fixed — 2026-09-08 (`20260930`)

**Backend (`20260930_community_post_update_rich_fields.sql`)** —
`community_post_update` gained `p_last_seen`, `p_reward`, `p_pickup_note`,
`p_tagged_listing`, `p_clear_tagged_listing`, `p_comment_policy` and
`p_hide_like_count`. `create or replace` can't change an argument list, so the
old 6-arg function was dropped and recreated; every new parameter defaults, so
the 4- and 6-arg calls from older app builds still resolve to this single
function (PostgREST matches on the body's named keys, not arity) — and there's
exactly one overload, so there's no ambiguity for it to resolve.

Three decisions worth recording:

- **NULL vs `''`** on the text params. NULL means "the caller didn't mention
  this field" and leaves the column alone; `''` means "the author emptied the
  box" and clears it. Without that split, an old client — which sends none of
  these — would blank every rich field on its next title edit.
- **`tagged_listing` needed a separate `p_clear_tagged_listing` flag**, not the
  same trick. PostgREST collapses a JSON `null` in the request body to SQL NULL,
  so "untag this post" and "don't mention tagged_listing" would have arrived as
  the identical value and untagging would have silently no-opped. Caught while
  writing the service call, not after.
- **`allow_comments` is kept in step** with `comment_policy`. It's the legacy
  boolean `resolveCommentPolicy` falls back to; leaving it stale would make a
  post edited to OFF still read as "on" to any path still checking it.

`comment_policy` is validated in the function so a bad value returns
`INVALID_COMMENT_POLICY` rather than an opaque 23514 from the table's CHECK.

**Verified live** in a rolled-back transaction with RLS impersonation:
legacy 4-arg call → title changed, `last_seen`/`reward`/policy/tag all
preserved; rich call → `last_seen` set, `reward` cleared by `''`, tag cleared by
the flag, policy `OFF` with `allow_comments` following it to `false`,
`hide_like_count` true, and `pickup_note` (unmentioned) untouched;
`bad_policy → INVALID_COMMENT_POLICY`; `blank_title → TITLE_REQUIRED`;
`stranger_edit → NOT_YOUR_POST`.

**Client** — `communityService.update`'s patch gained the six fields, each
*omitted from the request body entirely* unless the caller passed it, since the
RPC reads an absent key as "leave it alone". `EditPostSheet` renders the
per-type blocks in the composer's own shape and wording (Where & reward for
`LOST_FOUND`, Pickup for `GIVEAWAY`, Tagged place with `ListingPickerSheet` for
`RECOMMENDATION`/`SHOUTOUT`) plus a collapsed "Post settings" row carrying the
four-way reply policy and the hide-like-count toggle — the same collapsed
pattern the composer uses, so the current choice is readable without opening it.

`save()` sends **only the blocks this post's type actually rendered**. Sending a
field the sheet never showed would write the empty string it was initialised
with and silently clear data the author never saw.

Closing comments now reachable from the feed card too, via
[#3](#3--feed-card-overflow-menu--is-missing-author-quick-actions-edit-delete-mark-resolved-comment-policy)'s
"Edit post" row.

**Status was:** Open  
**Area:** `src/screens/CommunityPostDetail.tsx:49-170` (`EditPostSheet`), `supabase/migrations/20260891_community_post_rich_fields.sql:163-209`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** `EditPostSheet` only renders inputs for `title`, `body`, and photos (`media`/`imageAlt`). If a post was created as:
- `LOST_FOUND`: the author cannot update `lastSeen` or adjust the `reward`.
- `GIVEAWAY`: the author cannot update the `pickupNote`.
- `RECOMMENDATION` or `SHOUTOUT`: the author cannot change or add the `taggedListing`.
- Any post: the author cannot toggle `hideLikeCount` or change `commentPolicy` (e.g. closing comments if the thread becomes toxic).

On the backend, `community_post_update` in `20260891` only takes `(p_id, p_title, p_body, p_image, p_media, p_image_alt)` and has no parameters for any of the rich fields.

**Fix direction:**
1. Update `public.community_post_update` RPC to accept optional `p_last_seen`, `p_reward`, `p_pickup_note`, `p_tagged_listing`, `p_comment_policy`, and `p_hide_like_count`.
2. Update `communityService.update()` and `EditPostSheet` to present and submit these fields conditionally based on `post.type`.

---

## #7 — Public profile community post cards are unclickable, and "Hide from profile" is a local illusion

**Status:** Fixed — 2026-09-08 (`20260925_post_show_on_profile.sql`, applied & verified live)

**Fix, both halves:**
1. **Unclickable cards** — the card is now a tap target routing to
   `/community/:id`, matching what the adjacent requests tab already did. The
   two author-only hide toggles live inside that card, so both now
   `stopPropagation()` (and disable while the write is in flight) instead of
   opening the post out from under the tap.
2. **The fake hide** — replaced with a real `community_posts.show_on_profile`
   column plus an author-only `community_post_set_profile_visibility` RPC. The
   profile query selects the column, and the non-self filter reads
   `p.showOnProfile !== false` instead of the viewer's own localStorage.

**Deliberately not enforced in RLS**, unlike the block filter in `20260924`.
This flag means "don't list this on my profile", not "nobody may read this" —
the post stays in the neighbourhood feed and reachable by direct link. Putting
it in the read policy would have silently pulled posts out of the feed too,
which is not what the control claims to do.

**Verified live** (rolled-back): default flag `true`; a **non-author** calling
the RPC is rejected with `NOT_YOUR_POST`; the author's call flips it to
`false`. `tsc`/`eslint`/`vitest` (518/518) clean.

**Original diagnosis, kept for the record:**
**Status was:** Open  
**Area:** `src/screens/PublicProfile.tsx:470-512`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** two distinct defects in `PublicProfile.tsx`:
1. **Unclickable Post Cards:** while requests in the adjacent tab link to `/request/:id` (`onClick={() => nav('/request/' + r.id)}` at `:526`), community post cards rendered at lines 472–511 have **no `onClick` handler and no "View post" button**. Tapping a post card on any public profile does nothing.
2. **Fake "Hide from public profile" button:** lines 92–100 save hidden post IDs to `localStorage.getItem("stryt_hidden_posts")` on the *viewer's* local device. No database column (e.g. `community_posts.show_on_profile`) is updated. When any other user views that profile, they do not have that local storage entry, so all posts remain 100% visible to the public.

**Fix direction:**
1. Add `onClick={() => nav('/community/' + p.id)}` to post cards in `PublicProfile.tsx`.
2. Replace `localStorage` with a persistent database column/RPC on `community_posts` (e.g. `show_on_profile boolean default true`) so hiding a post actually takes effect for public viewers.

---

## #8 — Community feed is missing a keyword/text search bar

**Status:** Fixed — 2026-09-08 (`20260931`)

**Backend (`20260931_community_feed_search.sql`)** — `community_posts_feed`
gained `in_query`, matched with Postgres full-text over
`title || body || author_name`, backed by a GIN index whose expression is
character-for-character the one in the `WHERE` clause (they have to match
exactly or the planner ignores the index). Dropped and recreated to add the
parameter; it defaults to null, so existing 5-, 6- and 7-argument calls still
resolve here, and the `anon` grant was re-applied because `/community-hub` is a
public route.

Three choices worth recording:

- **`'simple'`, not `'english'`.** English stemming and stopword removal are
  wrong for the Hinglish/Marathi-in-Latin-script real posts are written in — it
  would quietly discard tokens it decided were noise. `'simple'` just lowercases
  and splits, which is the honest behaviour for mixed-script text.
- **Prefix matching (`:*` on every token)** is what makes "electric" find
  "electrician". Without it `'simple'` demands whole words, and a search box
  that only matches complete words reads as broken.
- **`community_search_tsquery` scrubs everything non-alphanumeric BEFORE the
  `::tsquery` cast**, so a query containing tsquery's own operators
  (`& | ! : *`) is the text somebody typed, never syntax. A query that scrubs
  down to nothing yields SQL NULL, which the feed reads as "no search" rather
  than "match nothing" — otherwise typing a lone `?` would blank the feed.

**Verified live** in a rolled-back transaction, ten cases:
`prefix` ("electric" → the electrician post, and only that one) ✓,
`two_tokens_and` = 1 and `two_tokens_no_match` = 0 (tokens AND, not OR) ✓,
`by_author` = 1 (author name is searchable) ✓, `body_match` = 1 ✓,
`no_query` = 3 (unchanged behaviour) ✓, `punct_only` = 3 (not zero) ✓,
`injection` = 1 with no error raised ✓, `type_plus_query` = 1 (filter composes
with search) ✓, index present ✓.

**Client** — `communityService.feed` takes `query`; `CommunityHub` has a search
toggle in the header opening a rounded input beneath it, debounced 300 ms so a
keystroke isn't a request. The query is part of the `useQuery` cache key — left
out, a second search would be served the first one's cached page — and is
carried into `loadMorePosts` so paginating a search doesn't silently drop the
search. Closing the bar clears the query, since a feed that stays filtered with
nothing on screen explaining why is worse than no search at all. A failed search
gets its own empty state ("Nothing matched" + Clear search) rather than the
neighbourhood one, whose "post something" would be a non-sequitur. Six new keys
in en/hi/mr.

**Known limit:** the two legacy fallback paths in `feed()` (for a deployment
without the RPC) can't search, so there the keyword is ignored and the
unfiltered feed comes back. A worse answer than asked for, but better than an
empty screen.

**Status was:** Open  
**Area:** `src/screens/CommunityHub.tsx:301-375`, `src/screens/Search.tsx`

**Reported:** "any button should be there which is not in the app"

**Root cause:** `CommunityHub` has headers for location radius, bulk passes, filters (`SlidersHorizontal`), and compose (`Plus`), but no search button or search bar. Global `Search.tsx` only searches businesses, providers, and categories. There is no way for a neighbor to search community posts for specific keywords or topics (e.g. "carpool", "electrician", "lost keys").

**Fix direction:**
1. Add a search icon button in `CommunityHub` header that toggles a search input or opens a dedicated search modal.
2. Extend `communityService.feed()` and `community_posts_feed` RPC to support `in_query text default null` with `title ILIKE` or PostgreSQL full-text search (`to_tsvector`).

---

## #9 — Composer lacks an in-screen role/identity switcher

**Status:** Fixed — 2026-09-08 (client only)

The identity banner gained a **Switch** control, shown only to someone who
actually has a second hat (`ownedBusinessIds` / `ownedProviderId` from the
store — a regular member does no extra work and sees no extra control). It
opens a "Post as" sheet listing your own name plus every owned business and
provider profile.

**Local, not global.** The choice is a `ctxOverride` inside the composer, taking
priority over both the router-state context and the app-wide `activeContext`.
This is "post as", not "become" — switching hats for one post shouldn't silently
move the whole app into the shop console, which is what reusing the global role
switcher would have done. `"USER"` is the explicit personal choice, kept
distinct from `null` ("nothing chosen, fall through to the usual resolution").

Drafts follow the identity, since `useDraft` is already keyed on it — the sheet
says so, because a half-written shop announcement vanishing on a switch would
otherwise read as data loss rather than the deliberate separation it is.

**A latent bug fixed along the way:** `sellerLat`/`sellerLng` were read from
`activeBiz`/`activeProv`, which are keyed on the *app-wide* context. That was
already wrong for a post started from a dashboard tile for some other shop
(`passedCtx`) — it would stamp the wrong premises' coordinates, or none — and
would have been wrong for every switch made here. They now come from
`sellerBiz`/`sellerProv`, fetched against the identity actually being posted
under; `sellerProv` is new, the provider twin of the existing `sellerBiz`.

Switching to an identity whose package can't run a bulk campaign clears
`isBulkBuying`, so the form can't keep collecting tier and deposit fields for a
post that can no longer be one.

**Status was:** Open  
**Area:** `src/screens/CommunityCompose.tsx:357-375`

**Reported:** "any button should be there which is not in the app"

**Root cause:** `CommunityCompose.tsx` renders an identity banner ("Posting as You / Business / Provider"). If an owner starts composing while in customer mode, the banner is static and read-only. There is no button to switch identity to their shop or provider profile within the composer. The user must cancel, discard or save their draft, open the global profile/role switcher, switch hats, and re-open compose.

**Fix direction:**
1. If the authenticated user owns businesses or provider profiles (`userService.owned()`), render a "Switch" button or dropdown menu on the identity banner in `CommunityCompose.tsx`.
2. Allow toggling between `user` and owned `business` / `provider` identities without navigating away.

---

## #10 — Composer is missing a custom location/map pin picker

**Status:** Fixed — 2026-09-08 (client only)

The composer's reach line (`📍 area · N km`) is now a button opening
`LocationPickerSheet`, and the chosen place is what `create()` stamps as
`area`/`lat`/`lng` — a deliberate pin beats both the author's GPS and the shop's
premises. A brand-tinted note under the banner says which spot the post is
about, with "Use my location" to drop back.

**`LocationPickerSheet` could not be reused as-is**, which the gap's fix
direction assumed. Every path in it called `userService.setLocation` +
`refreshUser` + `setArea` — it sets *your home*, not *a spot*. Pointing the
composer at it unchanged would have quietly relocated the author to the scene of
whatever they were reporting. It gained an `onPick` mode instead: hand the place
back, write nothing to the profile. Both paths honour it — the nearby-areas list
and the GPS button — plus optional `title`/`currentLabel` so a one-off pick can
say what it's actually choosing. Existing callers pass none of this and are
untouched.

This is what makes "near the park entrance" something the radius filter can act
on rather than a phrase buried in the body.

**Status was:** Open  
**Area:** `src/screens/CommunityCompose.tsx:367-370`

**Reported:** "any button should be there which is not in the app"

**Root cause:** `CommunityCompose.tsx` automatically anchors the post's latitude and longitude to the author's personal GPS or the seller's premises coordinates. For neighborhood posts like `ALERT` (e.g. "Water main burst at cross street"), `LOST_FOUND` ("Dog spotted near park entrance"), or `GIVEAWAY` ("Pick up at community center"), the incident location often differs from the user's current physical location. There is no "Change location" or "Pin on map" button, even though `LocationPickerSheet.tsx` is already built.

**Fix direction:**
1. Add a clickable "Change location" button next to `<MapPin /> {area}` in `CommunityCompose.tsx`.
2. Open `LocationPickerSheet` to allow setting a custom `lat`, `lng`, and `area` for the post.

---

## #11 — Polls lack "Change Vote" and "Close Poll Early" actions

**Status:** Fixed — 2026-09-08 (`20260932`)

**Change vote.** `handleVote` opened with `if (votedOption) return;` on *both*
surfaces (detail screen and feed card), and underneath it `communityService.vote`
used `ignoreDuplicates: true` — so even without the early return the upsert would
have been a no-op. Two independent locks on the same door: a mis-tap was
permanent and the option someone actually meant was never counted. Now tapping a
different option switches, and tapping your current one retracts it via a new
`clearVote`. No migration needed — `poll_votes`' policy is
`auth.uid() = user_id` for **ALL** commands, so the UPDATE and DELETE were
already permitted; nothing had ever issued them. `votePoll` in the store accepts
`null` and *deletes* the map entry rather than storing null, so `votes[postId]`
reads as absent again and every `?? post.votedOptionId` fallback behaves exactly
as it did pre-vote. Optimistic, reverted to the previous choice on failure.

**Close early (`20260932`).** `community_poll_close(p_id)`, author-only, brings
`poll_ends_at` forward to `now()` rather than introducing a state column — so
`isPollClosed()`, the feed's expiry filter and `notify_ended_polls` (20260927)
all keep working unchanged and the "poll ended" notification fires on the next
cron run exactly as for a naturally-expired poll. `least(coalesce(...), now())`
so closing an already-ended poll can't push its end time *forward*, resurrecting
it and re-arming a notification that already went out.

**No reopen counterpart, deliberately.** Voting that stops and restarts has an
unreadable tally — the people who saw "closed" have moved on and don't come
back. The confirmation sheet says it can't be reopened rather than offering a
toggle that would quietly corrupt the result.

**Verified live** in a rolled-back transaction: `closed_now` ✓,
`not_a_poll → NOT_A_POLL` ✓, `past_not_pushed_forward` ✓ (end time unchanged),
`stranger_close → NOT_YOUR_POST` ✓.

**Status was:** Open  
**Area:** `src/screens/CommunityPostDetail.tsx:532, 784-826`

**Reported:** "see for the gaps in the community post flow any button should be there which is not in the app"

**Root cause:**
- **No Vote Change:** in `CommunityPostDetail.tsx:532`, `handleVote` executes `if (votedOption) return;`. Once a user taps an option, they cannot retract or change their vote, even if tapped by accident.
- **No Early Close:** polls only close when `poll_ends_at <= now()`. The author has no "Close poll now" button if they have gathered sufficient responses or wish to conclude voting.

**Fix direction:**
1. Allow users to change vote by updating `poll_votes` with a new `option_id` or clearing it.
2. Provide a "Close Poll" author button in `CommunityPostDetail` that sets `poll_ends_at = now()`.

---

## #12 — Fullscreen photo lightbox / viewer is not integrated into post galleries

**Status:** Fixed — 2026-09-08

Both the single-photo view and the multi-photo strip now open `PhotoViewer` at
the tapped index, matching BusinessDetail / ProviderDetail / PlaceDetail /
Profile. `cursor: zoom-in` so the affordance is actually visible.

**Status was:** Open  
**Area:** `src/screens/CommunityPostDetail.tsx:761-781`, `src/components/PhotoViewer.tsx`

**Reported:** "see for the gaps in the community post flow"

**Root cause:** `PhotoViewer.tsx` is used across `BusinessDetail`, `ProviderDetail`, `PlaceDetail`, and `Profile`. In `CommunityPostDetail.tsx`, multi-photo posts render in a horizontal strip (`media-strip`), but clicking on any photo does nothing. Users cannot pinch, zoom, or view high-resolution photos of lost pets, notices, or items.

**Fix direction:**
1. Add `onClick={() => setViewingPhotos({ photos: detailMedia.map(url => ({ url })), startIndex: i })}` on gallery images in `CommunityPostDetail.tsx`.
2. Mount `<PhotoViewer>` when `viewingPhotos` is active.

---

## #13 — Threaded comment replies never notify the parent comment's author

**Status:** Fixed — 2026-09-08 (`20260926_notify_comment_reply.sql`, applied & verified live)

**Fix:** `notify_on_post_comment` now resolves `parent_id`'s author and sends
them a `COMMUNITY_REPLY` notification, alongside the existing owner
notification. (Patched against the **current** definition in `20260840:714-737`,
not the `20260718` original this entry cites — the function had been redefined
since.)

Routing was the fiddly part; three cases needed explicit handling so nobody is
notified twice or pointlessly:
- Replying to your **own** comment → no reply notification.
- Parent commenter **is** the post owner → exactly **one** notification, the
  reply one, since it's strictly more specific than "commented on your post"
  and both would otherwise fire for the same event. Guarded with
  `post_owner is distinct from v_parent_author` — `is distinct from`, not
  `<>`, so a NULL parent (a top-level comment) still notifies the owner.
- Top-level comments → unchanged.

`COMMUNITY_REPLY` registered in `NotificationType` + the icon map. Worth
noting: the drift guard rebuilt for that other log's `#17` **caught this
immediately** when the type was still unregistered — the exact class of miss
that previously let seven types ship as generic grey bells.

**Verified live** (rolled-back), all four routes:

| case | result |
|---|---|
| B replies to A's comment on C's post | A gets `COMMUNITY_REPLY` ✓, C gets `COMMUNITY_COMMENT` ✓ |
| Parent commenter is the post owner | exactly 1 notification total ✓ |
| Replying to your own comment | 0 notifications to self ✓ |
| Plain top-level comment | owner still notified ✓ |

`tsc`/`vitest` (518/518) clean.

**Original diagnosis, kept for the record:**
**Status was:** Open — Broken Notification Loop  
**Area:** `supabase/migrations/20260718_community_notifications.sql:14-36`, `supabase/migrations/20260807_community_replies.sql`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** in `20260718_community_notifications.sql`, `notify_on_post_comment()` fires on `after insert on public.post_comments`. It reads:
```sql
select author_user_id, title into post_owner, post_title
  from public.community_posts where id = new.post_id;
if post_owner is null or post_owner = new.author_user_id then return new; end if;
insert into public.notifications (user_id, type, title, body, deep_link)
values (post_owner, 'COMMUNITY_COMMENT', ...);
```
When nested replies were introduced in `20260807_community_replies.sql` (`parent_id`), this trigger was never updated. When User B replies directly to User A's comment on a post owned by User C:
- User C (the post owner) is notified.
- **User A (the person who was replied to) receives NO notification at all.**

In a neighborhood discussion, direct replies are the primary conversational loop. The parent commenter has no idea someone answered their comment.

**Fix direction:**
1. In `notify_on_post_comment()`, check if `new.parent_id is not null`.
2. Fetch `author_user_id` of the parent comment.
3. If distinct from `new.author_user_id`, insert a `COMMUNITY_REPLY` notification to the parent commenter.

---

## #14 — `notify_ended_polls()` function exists in database but is never scheduled or executed

**Status:** Fixed — 2026-09-08 (`20260927`)

Registered as a pg_cron job (`notify-ended-polls`, every 10 min), mirroring
`20260918`'s fix for the identical "sweep function with nothing scheduling it"
shape. Verified present and active in `cron.job`.

**Duplicate note:** this is the same finding as workflow 05 in
`docs/launch/workflows/24_flow_completeness_audit.md` — it was logged
independently in both places. Fixed once, here.

**Status was:** Open — Dead Database Function  
**Area:** `supabase/migrations/20260896_community_notification_loop.sql:350-402`, `docs/launch/workflows/24_flow_completeness_audit.md:171-175`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** `20260896` created `public.notify_ended_polls()` to sweep expired polls and send `'COMMUNITY_POLL_ENDED'` notifications ("Poll results are in") to the author and all voters. Line 397 explicitly states: `revoke all on function public.notify_ended_polls() from public, anon, authenticated;` because it is intended to be called by a scheduler. However:
- No `pg_cron` schedule was ever registered (unlike `close_stale_queue_tokens` or `close_expired_bulk_deals`).
- No edge function or backend worker invokes it.
- Voters and authors never receive notifications when polls close.

**Fix direction:**
1. Register `notify_ended_polls()` in `pg_cron` (e.g. `cron.schedule('notify-ended-polls', '*/10 * * * *', 'select public.notify_ended_polls()')`).
2. Alternatively, invoke it via a scheduled Supabase Edge Function.

---

## #15 — Insecure client-side counter mutation & race conditions on `comments_count` and `likes_count`

**Status:** Fixed — 2026-09-08 (`20260922_post_counter_triggers.sql`, applied & verified live)

> **Correction to this entry's diagnosis.** Verified against the live database
> before fixing, and it is neither a race nor a forgery risk — it is worse and
> simpler. `community_posts`' UPDATE policy is `author_user_id = auth.uid()`,
> so a commenter or liker (who by definition usually isn't the author) matches
> **zero rows**: RLS filters the row out, no error is raised, and the service
> never checked for one. Measured directly — a non-author's counter update
> returned `ROW_COUNT = 0` and the stored value did not move.
>
> So the counters didn't "occasionally lose an increment under concurrency" —
> **they never moved at all**, except when an author commented on or liked
> their own post. That same policy also disproves the security half of this
> entry: a third party cannot write another author's counters, because the
> policy already stops them.
>
> The prescribed fix (DB triggers) was right regardless — for a bigger reason
> than the entry gave.

**Fix:** `sync_post_comments_count()` / `sync_post_likes_count()` as
`AFTER INSERT OR DELETE` triggers on `post_comments` / `post_likes`, both
SECURITY DEFINER so they update the post row regardless of who acted — the
permission the client call never had. Recount rather than `+1`/`-1` on
purpose: self-healing against existing drift, idempotent under retries, and it
cannot drive a counter negative. Branching on `TG_OP` rather than
`coalesce(new, old)`, since `NEW` is unassigned on DELETE and referencing it
raises. Includes a one-time reconcile of every post the broken path missed.
Both client-side counter writes removed from `communityService`.

**Verified live**, in a rolled-back transaction, acting as a **non-author**
through RLS — i.e. the exact case that previously did nothing:

| | before | after insert | after delete |
|---|---|---|---|
| `comments_count` | 2 | 3 ✓ | 2 ✓ |
| `likes_count` | 3 | 4 ✓ | 3 ✓ |

`tsc`/`eslint`/`vitest` (518/518) clean.

**Original diagnosis, kept for the record:**
**Status was:** Open — Data Integrity & Security  
**Area:** `src/services/engagement/communityService.ts:452, 651-653`, `supabase/migrations/20260837_community_post_authoring.sql:4-10`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:**
1. **`comments_count`:** when a comment is created, `communityService.addComment` executes a client-side read-modify-write:
   ```ts
   const { data: cur } = await sb.from("community_posts").select("comments_count").eq("id", postId).maybeSingle();
   await sb.from("community_posts").update({ comments_count: ((cur as any)?.comments_count ?? 0) + 1 }).eq("id", postId);
   ```
   Two users commenting concurrently will race and lose increments. If a client disconnects between the insert and update, the counter permanently drifts. Additionally, because there is no column-level RLS restriction on `community_posts.comments_count`, any authenticated user can send an arbitrary number to forge the counter.
2. **`likes_count`:** `communityService.like` recounts from `post_likes` and then executes a raw client update: `await sb.from("community_posts").update({ likes_count: count ?? 0 }).eq("id", postId)`.

**Fix direction:**
1. Create PostgreSQL database triggers on `post_comments` (`after insert or delete`) and `post_likes` (`after insert or delete`) that atomically update `comments_count` and `likes_count` on `community_posts`.
2. Remove client-side raw counter updates from `communityService.ts`.

---

## #16 — Concurrency race condition on `recommendListing` array mutation

**Status:** Fixed — 2026-09-08 (`20260927`)

New `community_post_add_recommendation` RPC does an atomic JSONB append under
a `for update` row lock, so concurrent recommenders can no longer clobber each
other.

**The race was only half the problem.** Exactly as with #15, the old
client-side write was a raw UPDATE on `community_posts`, whose policy is
`author_user_id = auth.uid()` — so for anyone who wasn't the post's author it
matched zero rows and silently did nothing. Recommending on someone else's
post, i.e. the entire point of a RECOMMENDATION post, never worked at all.
SECURITY DEFINER fixes both problems at once.

**Verified live:** two different non-authors recommending in sequence now
yield 2 stored recommendations (previously 0).

**Status was:** Open — Data Integrity  
**Area:** `src/services/engagement/communityService.ts:702-709`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** `communityService.recommendListing` fetches the existing `recommendations` JSONB array:
```ts
const { data: post } = await sb.from("community_posts").select("recommendations").eq("id", postId).maybeSingle();
const existing = (post as any)?.recommendations ?? [];
const updated = [...existing, { listingType, listingId, byName }];
await sb.from("community_posts").update({ recommendations: updated }).eq("id", postId);
```
If two neighbors submit recommendations around the same time, the second write completely overwrites and erases the first neighbor's recommendation.

**Fix direction:**
1. Create a PostgreSQL RPC `community_post_add_recommendation(p_post_id text, p_listing_type text, p_listing_id text, p_by_name text)` that performs an atomic JSONB append (`recommendations = coalesce(recommendations, '[]'::jsonb) || jsonb_build_object(...)`) under a row lock (`for update`).
2. Call this RPC from `communityService.recommendListing()`.

---

## #17 — `community_posts_feed` RPC does not filter out blocked users

**Status:** Fixed — 2026-09-08 (`20260923` + `20260924`, applied & verified live)

**Fixed in the RLS read policy, not the feed RPC.** `communityService.feed()`
has **three** read paths, not one: the primary `community_posts_feed`, the
legacy `community_posts_nearby` geo fallback it drops to when that RPC errors,
and a plain `select` on `community_posts` for the non-geo case — plus every
other reader (post detail, public profiles, author history). Patching only the
RPC, as this entry's fix direction suggested, would have left paths 2 and 3 as
open bypasses. Both RPCs are SECURITY INVOKER (verified `prosecdef = false`),
so RLS applies inside them, which makes the read policy the one chokepoint
covering every path — including any reader added later. The old policy was
`(true OR true)`, and it had to be **replaced** rather than added to, since
permissive policies are OR'd and the old one would have re-admitted everything.

**Two things this entry's suggested SQL would have got wrong:**
- The columns are `blocker_user_id` / `blocked_user_id` (20260892:169-176), not
  `blocker_id` / `blocked_id`. That SQL would not have compiled.
- An inline `user_blocks` lookup only works in one direction — see below.

**The one-direction bug, and how it surfaced.** `20260923` inlined the lookup
and passed a first round of tests. Testing the *reverse* direction caught it:
`user_blocks` has its own RLS (`read_own_blocks` = `blocker_user_id =
auth.uid()`), so a viewer can only see block rows **they** created.
- "I blocked them" → my own row is visible → filtered ✓
- "They blocked me" → that row is invisible to me → EXISTS matched nothing →
  their posts stayed in my feed ✗

Diagnosed by measurement, not inspection: the block row existed, `auth.uid()`
resolved correctly, and the predicate still returned false.

`20260924` delegates to `public.is_blocked_between(text)` (20260892) instead —
SECURITY DEFINER, so it reads `user_blocks` regardless of caller RLS, already
bidirectional, and deliberately takes one free parameter with `auth.uid()` as
the implicit other side (20260892 records that the earlier two-id form was a
probing leak). Reusing it preserves that property.

**The `anon` grant is load-bearing.** `/community-hub` is public, so guests
read `community_posts` and now hit this policy. Per `20260887`: a policy whose
qual calls a function the querying role can't EXECUTE **aborts the whole
statement** — resolved at executor init, before any short-circuit, so guarding
with `auth.uid() is null or …` would not have helped. Without the grant, guest
browsing breaks entirely — the exact outage `20260887` exists to repair.
Granting leaks nothing: the function short-circuits to `false` when
`auth.uid()` is null and never reads the table, same reasoning as `20260887`
granting `is_admin()` to anon.

**Verified live** (rolled-back), full matrix:

| case | result |
|---|---|
| I blocked them — primary feed RPC | hidden ✓ |
| I blocked them — legacy `_nearby` RPC | hidden ✓ |
| I blocked them — plain select | hidden ✓ |
| **They blocked me** (the `20260923` bug) | hidden ✓ |
| Author viewing their own post | visible ✓ |
| Signed-out guest browsing the feed | works, rows returned ✓ |

**Original diagnosis, kept for the record:**
**Status was:** Open — Privacy & Harassment Gap  
**Area:** `supabase/migrations/20260894_community_feed_sort.sql:62-145` (`community_posts_feed`)

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** migration `20260892` implemented robust block checks for commenting (`_user_blocks_exists(v_uid, v_author)` in `can_comment_on_post`). However, the feed sorting RPC `community_posts_feed` in `20260894` does **not** check `user_blocks`. If User A blocks User B:
- User B cannot comment on User A's posts.
- **However, User B's posts and alerts still appear in User A's feed, and vice versa.**
- "Hide post" and "Mute author" are client-local localStorage arrays that do not persist across devices or sessions.

**Fix direction:**
1. In `community_posts_feed`, add a predicate excluding posts where an active block exists between `auth.uid()` and `cp.author_user_id`:
   ```sql
   and not exists (
     select 1 from public.user_blocks ub
     where (ub.blocker_id = auth.uid()::text and ub.blocked_id = cp.author_user_id)
        or (ub.blocker_id = cp.author_user_id and ub.blocked_id = auth.uid()::text)
   )
   ```

---

## #18 — Realtime feed misses post deletions, updates, and live poll vote changes

**Status:** Fixed — 2026-09-08 (client + `20260928`)

**Feed updates/deletes.** `CommunityHub` now runs a second subscription for
UPDATE and DELETE on `community_posts` that refetches. Kept deliberately
separate from `useRealtimeInserts`, which is INSERT-only *by design* — new
posts are counted into a "N new posts" banner rather than injected under
someone mid-read. That reasoning doesn't extend to these two: a row vanishing
or changing under you isn't something the reader chose to defer, so refetching
is right.

**Live poll votes.** `CommunityPostDetail` subscribes to `poll_votes` for its
own post. The existing post-row subscription could never have covered this:
vote counts aren't stored on `community_posts`, they're counted out of
`poll_votes` inside `communityService.get`, so casting a vote changes no row
this screen was watching. Only subscribes for POLL posts.

**`poll_votes` was not in the `supabase_realtime` publication** — caught by
checking `pg_publication_tables` rather than assuming. `community_posts`,
`post_comments` and `comment_reactions` were all already members; `poll_votes`
was the one that wasn't, so the new subscription would have attached, delivered
nothing, and surfaced only as the "check the supabase_realtime publication"
console warning. `20260928` adds it; verified present afterwards. No REPLICA
IDENTITY change needed since both new subscribers only trigger a refetch and
never read payload columns.

`tsc`/`eslint`/`vitest` (518/518) clean.

**Status was:** Open  
**Area:** `src/screens/CommunityHub.tsx:211`, `src/screens/CommunityPostDetail.tsx:324`

**Reported:** "see for the gaps in the community post flow"

**Root cause:**
1. **Feed Updates & Deletes:** `CommunityHub.tsx:211` uses `useRealtimeInserts("community_posts", ...)`. It only listens to `INSERT` events. When an author deletes a post or marks it resolved, other users currently browsing the feed see the stale or deleted post until they perform a manual pull-to-refresh.
2. **Poll Votes:** `CommunityPostDetail.tsx` subscribes to `community_posts` and `post_comments`, but has **no realtime subscription on `poll_votes`**. When neighbors cast votes, the vote count and percentage bars do not update live on open post screens.

**Fix direction:**
1. In `CommunityHub.tsx`, subscribe to `DELETE` and `UPDATE` on `community_posts` to remove deleted post cards and update resolved badges.
2. In `CommunityPostDetail.tsx`, subscribe to `postgres_changes` on `poll_votes` for `post_id = eq.${id}` and trigger `refetchPost()`.

---

## #19 — Comment reaction notifications are missing

**Status:** Fixed — 2026-09-08 (`20260927`)

`trg_notify_comment_reaction` on `comment_reactions` sends
`COMMUNITY_COMMENT_REACTION` to the comment's author; self-reactions are
skipped. Type registered in `NotificationType` and the icon map.

**Verified live:** author notified on another user's reaction (1), and zero
notifications on a self-reaction.

**Status was:** Open  
**Area:** `supabase/migrations/20260895_comment_reactions_and_mentions.sql`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** `20260895` added the `comment_reactions` table (👍, ❤️, 😂, 😮, 🙏, 💡). However, unlike `post_likes` which triggers a `COMMUNITY_LIKE` notification (`20260896:49-88`), `comment_reactions` has **no notification trigger**. When neighbors react to a comment, the comment author is never notified that their advice or answer helped someone.

**Fix direction:**
1. Add a trigger `trg_notify_comment_reaction` on `comment_reactions` (`after insert`).
2. If `user_id` != comment author, insert a `COMMUNITY_COMMENT_REACTION` notification to the comment author.

---

## #20 — Missing backend admin moderation and reporting for comments

**Status:** Fixed — 2026-09-08 (`20260927` + `ReportSheet` / `AdminPanel`)

**Reporting half, closed 2026-09-08:** `ReportSheet`'s target union now accepts
`"COMMENT"`, and `CommentRow`'s overflow menu opens it for any comment the
viewer didn't write (see [#4](#4--comments-thread-is-missing-all-comment-management-buttons-delete-edit-report-pin)).
The admin console's "Take action" gained a `COMMENT` branch calling
`admin_delete_comment`, so a filed report now has a moderator action behind it
instead of only flipping a status label. No `reports` schema change was needed
— see the correction below.

**Backend half, 2026-09-08 (`20260927`):**

`admin_delete_comment(p_id)` added, admin-gated via `is_admin`, clearing the
comment's reactions and its nested replies first so nothing is left orphaned
behind a removed parent. The `20260922` counter trigger fires on the delete and
keeps `comments_count` correct.

**Correction to this entry:** it expected a `target_type` check constraint on
`reports` that needed `COMMENT` added. There is no such constraint — only
`reports_status_check` — so there was nothing to widen.

**Verified live:** a non-admin call is rejected with `NOT_ALLOWED`.

**Still open:** the reporting half — adding `COMMENT` to `ReportSheet`'s target
union and surfacing comment reports in the admin console, so a neighbour can
actually file one and an admin can see it. The delete primitive now exists for
that to call.

**Status was:** Open  
**Area:** `supabase/migrations/20260916_admin_report_moderation.sql:24-38`, `src/components/ReportSheet.tsx:22`

**Reported:** "make a list of all the gaps remaining of the ui side and backend side"

**Root cause:** while `admin_delete_post(p_id)` was introduced in migration `20260916` to allow moderators to take down reported community posts:
- There is no `admin_delete_comment(comment_id)` RPC.
- The `reports` table constraint and `ReportSheet.tsx` target types (`POST`, `BUSINESS`, `PROVIDER`, `REQUEST`, `USER`, `PROPOSAL`, `RATING`) do not include `COMMENT`.
- Abusive or scam comments reported by neighbors have no moderation workflow in the admin console.

**Fix direction:**
1. Add `COMMENT` to `reports` target type check constraint.
2. Create `admin_delete_comment(p_id text)` security definer function for administrators.
3. Update `ReportSheet.tsx` to accept target type `COMMENT`.
