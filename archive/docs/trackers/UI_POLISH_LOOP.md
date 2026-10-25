# UI polish loop — progress

**Brief (the `/loop` prompt):** go page by page and make each UI page look like a production-grade app UI
(Instagram / Snapchat quality): best-suited component-wise design for the existing functions, world-class patterns,
**keep all existing behaviour**.

**How a round works:** pick the next unchecked page → screenshot it as the real test users on the local app
(390×844 @2x, plus a narrow 360 check for layout-heavy pages) → list concrete defects (cut-off text, empty boxes,
stale states, weak hierarchy, inconsistent spacing, missing empty-state actions, broken images) → fix with small
edits that reuse existing components and design tokens (no hex colours, all strings through i18n en/hi/mr) →
re-shoot → add a test when there is logic → `npm run verify` before a batch is called done.

**Rules:** no behaviour changes; no database changes; nothing is committed or pushed by the loop (the owner asks for
that); new strings go through `src/lib/i18n` in all three languages; check `prefers-reduced-motion` for anything animated.

Test accounts (local dev server, Firebase test numbers): customer 9222222222 / 222222, shop owner 9111111111 / 111111,
delivery partner 9333333333 / 333333.

## Order and status

Legend: ✅ done · 🔧 in progress · ⬜ not started

### Customer app
| | Page | Notes |
|---|---|---|
| ✅ | Notifications (delivery cards) | Old delivery notifications kept showing the one-time code and Track/Call buttons after delivery; empty bordered strips; "Track Live" over-promised. Now: finished orders drop the code/buttons/"on the way" and show Delivered/Cancelled; pill-only cards have no empty box; "Track order". Tests: `notificationService.reconcile.test.ts`. |
| ✅ | Shop page (`/business/:id`) | A photo that fails to load now shows the app placeholder (was a broken-image icon with alt text); "1 review" singular (en/hi/mr). Still heavy: four stacked call-to-action rows — revisit if the loop gets to a second pass. |
| ✅ | Map | Phone tray cards were 152px wide, so names and distance were clipped to a few letters; now 236px, names wrap to two lines, sub text 11.5px in a readable colour. List and desktop views untouched. |
| ✅ | Chats (empty state) | Personal inbox now has an "Explore now" button; a shop's or provider's inbox deliberately does not. |
| ✅ | Home | Shop/provider card names were washed-out grey on white; now `--ink-900`. Rest of the launchpad checked, no change. |
| ✅ | Explore | Reviewed on the phone viewport — no defects. |
| ✅ | Search | Reviewed — no defects. |
| ✅ | Community hub | Reviewed (empty state is fine). Post/compose not re-shot. |
| ✅ | Profile, Edit profile, Public profile | Reviewed — no defects. |
| ✅ | Appointments, My requests, Queues | Queues empty state now has an "Explore now" button. Requests tab keeps its heavy nested tabs (left alone on purpose). Agreements not re-shot. |
| ✅ | Settings and its sub-pages | Reviewed — no defects. |
| ✅ | Safety / My People | Contact strip: 52px round avatars (were tiny), wider name label. |
| ✅ | Auth: phone | Reviewed signed-out — already production grade. OTP / terms / onboarding not re-shot (need a session in a specific state; onboarding redone 2026-10-22). |

### Shop console
| | Page | Notes |
|---|---|---|
| ✅ | Dashboard / Home | Reviewed. Titles are now primary ink (see global fixes below). The first-run "Hold Home…" tip overlaps the last card until dismissed — left as is. |
| ✅ | Orders (appointments) | Redone for delivery 2026-10-24; empty state reviewed. |
| ✅ | Catalog | Names/prices were secondary grey — fixed by the global rule. (Items with a pen image are test data, not an app fallback.) |
| ✅ | Hours, Queue, Q&A, Inbox, Reviews, Payments, Settings, Team & access | **Hours: the open-now switch was invisible** (knob hung off the card edge) — fixed in `Toggle`. Queue empty message now centred. Reviews "1 reviews" → "1 review". Payments avatars now round. Q&A, Inbox, Settings, Team: no change. |

### Provider console
| | Page | Notes |
|---|---|---|
| 🔧 | Dashboard, Jobs, Find work, Money, Availability, Settings | **Not visually checked — there is no test provider account.** Gets the global fixes below (shared Toggle, avatars, text colour, reviews screen). Needs a provider fixture to go further. |

### Delivery partner console
| ✅ | Delivery console | Redone 2026-10-24 (mission card, where-to-go, counter) |

## Global fixes (affect many screens — worth a look when reviewing)

- `.small.semi` / `.small.bold` text now uses `--ink-900` (was `--ink-600`, i.e. names and titles looked washed out) — ~360 places; `.muted` and inline colours still win. `src/index.css`.
- `Toggle` track is `inline-block` — it collapsed to zero width inside a plain button, so the knob drifted outside its card. `src/components/Toggle.tsx`.
- `SafeImg variant="avatar"` is always round and cropped (23 call sites passed only a size and rendered squares). `src/components/common.tsx`, test `SafeImg.test.ts`.

## Housekeeping while the loop runs

- Loop ended 2026-10-24: the dev server was stopped, `.env.development.local` restored to its original and the backup deleted. To resume, start `vite --port 5173`, re-add the three test phones to `VITE_FIREBASE_TEST_PHONES` (and `VITE_DELIVERY_AGENT_ENABLED=true`), and run `/loop` again.
- Nothing from the loop is committed. `npm run verify` passed in full on 2026-10-24 after round 3 (98 test files, 1252 tests, build). Run the build from a lowercase `d:\` shell — from `D:\` Vite fails to resolve `legal/OPERATOR.md?raw` (a path-case quirk, not a code error).
- Round 1 (2026-10-24): Notifications, Shop page, Map, Chats.
- Round 2 (2026-10-24): Home, Explore, Search, Community hub, Profile, Appointments/Queues, Settings, Safety.
- Round 3 (2026-10-24): auth phone screen, whole shop console, global fixes above. Left: provider console (needs a test provider), shop-page second pass (decided: leave), OTP/terms.
