# Stories — gap log and completion plan

**Opened 2026-10-25.** Audit of "are stories complete end to end?" → no. Core loop existed (post → rail → viewer → react →
notify → highlight); safety, lifecycle, own-story management, i18n and several gesture/UX basics were missing.
Production state when audited: **0 stories, 0 views ever** — the feature had never run live.

## 1. What the audit found

| # | Gap | Evidence |
|---|-----|----------|
| S1 | No way to **report** a story; admin tooling expects `STORY` reports; `hide_after_reports` covers only POST/COMMENT | `ReportSheet` type union; live `hide_after_reports()` |
| S2 | **Blocking** exists only in chat and does nothing to stories; no **mute** | `stories_select` policy has no block term |
| S3 | **No delete** of own/shop story (RLS allows, no UI/service) | no `.delete()` on `stories` in `src` |
| S4 | **Expired stories never removed** (rows, views, photos) though Retention Policy + Terms §18.6 say they are; expired rows still readable by API | no cron job; `stories_select` has no expiry term |
| S5 | **Duration uncapped** (custom hours: any number); policy says 1 h–7 d | `StoryCompose` `parseInt` only; no DB check |
| S6 | Reaction notification → `/stories` → **no route** → lands on Home | `notify_on_story_reaction`; `App.tsx` |
| S7 | **No i18n** in viewer, composer, My activity, Create sheet row | zero `useI18n` in those files |
| S8 | "My story" / My activity show **only the newest** active story | `myStory()` `limit(1)` |
| S9 | **"Seen" ring state lost on every app launch** | `viewedStories` is plain `useState` |
| S10 | Viewer: no hold-to-pause, no swipe-down/sideways, no reply (STORY_REPLY lead type is dead code), no ⋯ menu, no preload, non-9:16 photos hard-cropped, Android BACK leaves the page instead of closing the viewer | `Stories.tsx` |
| S11 | Viewer list readable only by the exact poster, not by shop team | `read_story_views_owner` policy |
| S12 | Stories only reachable via Community tile → hub; no rail on Home | `StoriesBar` only in `CommunityHub` |

## 2. Target design — the Instagram / Snapchat pattern, mapped to STRYT

| Pattern (IG / Snap) | STRYT build |
|---|---|
| 24 h life | Default **24 h**; presets 6 / 12 / 24 / 48 h; custom 1–168 h; **DB cap 7 days** (matches Terms) |
| Ring: gradient = unseen, grey = seen, **green = close friends**, own tile first with "+" | Same; "seen" persisted on device across launches; own tile: tap = watch, "+" badge = add |
| Viewer: tap fwd/back, **hold = pause + hide chrome**, **swipe down = close**, **swipe sideways = next/previous person** | Same, pointer-event based; progress bars; preloads the next photo |
| Header: avatar · name · age · **⋯** · close | Same; ⋯ opens a sheet |
| Non-portrait photos: blurred fill, never cropped | Foreground `contain` over a blurred copy |
| **Reply bar** (DM) + quick reactions | Reply → chat message of kind `STORY_REPLY` carrying a thumbnail chip (to the person, or the shop/provider owner for seller stories); reactions kept, with a burst of emoji |
| Own story: viewer list + reactions, **delete**, save to Highlights, add more | Same; all own active stories play in one reel; shop team can see views |
| Safety: **report**, **mute**, **block**, hide-from | Report (auto-hides after the existing 5-reporter threshold), Mute (server-side, per author), Block (hides both directions via RLS), Hide-from kept |
| Auto-delete after expiry; Highlights kept | Daily SQL purge of rows + daily storage sweep (orphan photos); highlights kept |
| Entry: top of the feed + camera | Rail on **Home** (signed-in: always; guest: only when stories exist), Community hub, Create sheet, shop/provider dashboards |

**Deliberately not in this build** (and why): video stories (needs transcoding + size limits on a bucket with no limit);
stickers / drawing / filters (an editor project of its own); a persistent Close-Friends *list* (needs a table and a
management screen — product decision; per-story audience picking stays); story archive (conflicts with the retention
policy); multi-photo carousels in one post (post several, they play as one reel).

## 3. Work plan

**P1 — Database** (`supabase/migrations/20261008_stories_complete.sql`, rollback beside it — *owner applies*)
1. `stories_expiry_cap` CHECK: `expires_at <= created_at + 7 days + 1 h` (1 h clock-skew slack). Table is empty in prod.
2. `stories_select` rebuilt: existing rules + **expired stories visible only to their owner/managers or when highlighted** + **no story between blocked users** (`is_blocked_between`, already granted to anon).
3. `read_story_views_owner` rebuilt: poster **or** business manager **or** provider owner **or** admin.
4. `story_mutes(user_id, owner_type, owner_id)` + own-rows RLS (cascades with the user).
5. `hide_after_reports()` extended to `STORY` (same threshold, same advisory lock).
6. `purge_expired_stories()` + `pg_cron` daily job: deletes non-highlighted stories expired > 1 h (views cascade).

**P2 — Edge function + workflow** (`purge-expired-stories`, `.github/workflows/purge-expired-stories.yml` — *owner deploys*):
daily storage sweep removes `…/story/…` photos no `stories` row references (and any older than the grace window).

**P3 — Services / state**
`src/lib/stories.ts` (pure: grouping, ordering, seen-persistence, duration clamp, ring state) · `socialService`
(`myStories`, `activeFor`, `deleteStory`, mutes, blocked ids, expired self-cleanup) · `chatService.send` accepts `kind/meta`
· seen-set persisted in `useSocialSlice`.

**P4 — UI** (`src/components/stories/*`; `Stories.tsx` stays as the import point)
`StoriesBar` · `StoryViewer` (+ `useStoryPlayer`, menu sheet, viewers sheet) · composer (24 h default, presets, clamp,
i18n) · My activity (all own stories) · `/stories` route → My activity · Android BACK closes the viewer · Home rail ·
chat thread renders the reply chip · `ReportSheet` accepts `STORY`.

**P5 — Language**: every new string in en / hi / mr.

**P6 — Proof**: unit tests (helpers, service calls with a fake client, migration text), `npm run verify`, then a real
browser run as the three test accounts (post → watch → react → reply → report → mute → delete). Anything that needs the
migration (block/expiry/cap/viewer-team/auto-hide) is re-run once the owner has applied it.

## 4. Owner steps this adds

1. Apply `20261008_stories_complete.sql` (then add the APPLY_LOG row).
2. `supabase functions deploy purge-expired-stories --no-verify-jwt` (the workflow reuses the existing
   `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` secrets).

The app is written to work *before* both are done (it just keeps old rows longer); nothing breaks if they wait.

## 5. Found while building (not in the first audit)

| # | Gap | Found by |
|---|-----|----------|
| S13 | **No story view or reaction was ever saved.** The app upserted into `story_views`; `INSERT … ON CONFLICT` needs the viewer to be able to read the row, and only the story's author could. First upsert 42501, `ON CONFLICT DO NOTHING` 42501, update-own-reaction 0 rows, plain insert fine. The app ignored the error, so the UI looked fine. Explains "0 views ever". | rolled-back SQL test on production (no data left behind) |
| S14 | **A user's own file can never be deleted from the app.** `uploads` has a DELETE policy for the user's own folder but no SELECT policy; Storage deletes with RETURNING, so it reports success and removes nothing. Confirmed: a deleted story's photo stayed in the bucket. Affects every `uploadService.remove()` (also the onboarding rollback). | story delete test + `storage.objects` |
| S15 | **Strangers saw real names** — story `author_name` was the real name, the viewers list and the audience lists used `users.name`. Now: alias unless the person opted in (`aliasName`). | code review of the new viewer |
| S16 | 30 story photos already sit in storage with 0 story rows (abandoned composer uploads, test runs). | storage count |

## 6. Status — 2026-10-25

**Done in the app (uncommitted):** rail on Home + Community hub (unseen / close-friends / seen rings, own reel first, "+" separate,
seen state kept across launches, muted + blocked people filtered) · viewer rebuilt (hold to pause + chrome hides, tap zones,
swipe down to close, swipe sideways between people, blurred fill instead of cropping, preload, progress without re-render, Android BACK,
Esc/arrows) · ⋯ menu: report, mute, block (with confirm), delete (with confirm), details, save/remove Highlight · reply → chat message
with the story chip · reactions with burst + haptics, errors shown · own stories: all of them play as one reel, views + reactions + audience
sheet, add more · shop/provider stories work the same, reply goes to the owner · composer: caption on the photo, 24 h default, presets,
clamped custom, alias name, no more "~2 km" claim · My activity lists live + saved, translated · `/stories` route · notification link no longer
dead · Create sheet translated · en/hi/mr for everything new.

**Done in SQL (written, not applied — owner):** `20261008_stories_complete.sql` + rollback. **Edge function + workflow (not deployed — owner):**
`purge-expired-stories`.

**Proof:** `src/lib/stories.test.ts` (17), `socialService.stories.test.ts` (11), `storiesMigration.test.ts` (10), `SafeImg.test.ts`;
`npm run verify`; real browser run on the local app against production as the three test accounts — post (personal + as the shop),
rail, viewer, hold-to-pause, swipe-down, reply (chat shows the chip), report sheet, block confirm, own views + viewers list, delete.
**Not yet provable until the migration is applied:** saving a reaction, hidden-by-block, expired-story visibility, shop-team view counts,
auto-hide after 5 reports, the photo really leaving storage.

**Test data left in production** (remove when you say): 1 orphan story photo from the personal test post and 1 from the shop post (photos
cannot be deleted from the app until S14 is applied; the purge function removes them), 3 chat messages of kind `STORY_REPLY` between the
test accounts, their notifications.

**Deliberately not built:** video, stickers/drawing/filters, a persistent Close-Friends list, story archive, multi-photo posts (see §2).

## 7. Status — 2026-10-27 (after the owner applied the migration)

**Migration applied** (APPLY_LOG row 71). Verified from the app against production as the test accounts — the Supabase MCP was not
authorised in that session, so the ledger and definitions were *not* read:
reaction saved and shown to the author with the viewer's alias · mute accepted and listed, unmute restored the tile · signed-out
visitor loaded the stories request with no error · deleting a story left HTTP 400 `Object not found` for its photo (was 200) —
S14 is closed. **Not exercised:** block hiding, expired-story hiding, the 7-day check, shop-team view counts, the 5-reporter auto-hide.

**Found and fixed on the way:**
- S17 — after muting there was no way to unmute (the muted person vanished from the rail). New **Settings → Privacy → Muted stories**
  (`src/screens/settings/MutedStories.tsx`, route `/settings/muted-stories`).
- S18 — a signed-out visitor never saw any story: the client privacy filter returned nothing without a user. Now guests see public ones
  (the database still decides); the Home strip appears for them when someone nearby posted.
- Dialog and sheet titles in the viewer were dark-on-dark (global heading colour) — fixed.

**Still open (owner):** deploy `purge-expired-stories` (command in `OWNER_REMAINING_STEPS.md` §3b). Needs a Supabase login the agent
session does not have.
