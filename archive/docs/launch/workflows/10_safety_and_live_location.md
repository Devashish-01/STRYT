# 10 — Safety & Live Location

**Priority:** P0 — background location is the single highest Play-review
risk area in this app (see `PLAY_SUBMISSION_CHECKLIST.md`).
**Screens:** `SafetyHub`, `EmergencyContacts`.
**Service:** `locationService.ts`, `emergencyService.ts`.

## Flow A — "My People" live sharing explainer gate

Full detail already in `MANUAL_TEST_PLAN.md` §1.5 (P0) — this is the
authoritative script, repeat it exactly:

| # | Step | Expected |
|---|------|----------|
| 1 | Fresh install, tap **My People** on Home | Explainer sheet — who sees it, how to stop |
| 2 | Tap "Not now" | Nothing starts, no sharing begins |
| 3 | Tap My People again | Explainer shows **again** — dismissing is not consent |
| 4 | Tap "Start sharing" | Android disclosure → OS permission prompt → sharing starts, live dot pulses |
| 5 | Tap My People again | Stops **immediately** — no explainer, no confirm dialog |
| 6 | Tap again to restart | Starts directly — explainer does **not** reappear once you've consented once |
| 7 | Long-press My People | Opens the hub screen, does **not** toggle sharing |

## Flow B — Sharing mechanics

| # | Step | Expected |
|---|------|----------|
| 1 | Start a share | Foreground-service notification appears and stays visible |
| 2 | Background the app for 10 minutes with sharing active | Location keeps posting; FGS notification never disappears |
| 3 | Recipient's view of the share | Live-updating position, not stale |
| 4 | Stop sharing | FGS notification clears, recipient sees "sharing stopped" |
| 5 | Renew an about-to-expire share | Extends without re-showing the explainer |
| 6 | Revoke a share you granted someone else | Their view stops updating immediately |

## Flow C — Emergency contacts

| # | Step | Expected |
|---|------|----------|
| 1 | `/safety/contacts` | Add a contact from candidates (existing chats/follows) or manually |
| 2 | Remove a contact | Removed cleanly |
| 3 | Start a share targeted at a specific contact | Only that contact can view |

## Edge cases

- Deny the location permission at the OS prompt — app degrades gracefully
  (sharing doesn't start, clear message), does not crash.
- Revoke location permission in OS settings **while a share is active** —
  app detects it and stops cleanly rather than silently failing.
