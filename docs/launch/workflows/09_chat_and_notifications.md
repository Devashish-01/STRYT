# 09 — Chat & Notifications

**Priority:** P0.
**Screens:** `ConversationList`, `ChatThread`, `Notifications`.
**Services:** `chatService.ts`, `notificationService.ts`.

## Flow A — Chat

| # | Step | Expected |
|---|------|----------|
| 1 | Start a conversation from a business/provider/request context | `getOrCreate` opens (or reuses) a thread |
| 2 | Send a message | Delivers, appears for the recipient |
| 3 | Recipient reads it | Sender's copy shows **read**, not stuck on sent/delivered |
| 4 | Go back to `ConversationList` | Unread badge cleared for that thread |
| 5 | Open a conversation while acting as **business** hat | Unread count doesn't bleed into the **customer** badge or **provider** badge — each hat's chat unread is separate |
| 6 | Same check for **provider** hat | Independent unread count |
| 7 | Send a message while the recipient is backgrounded | Push notification arrives (see workflow 22) |

## Flow B — In-app notifications

| # | Step | Expected |
|---|------|----------|
| 1 | `/notifications` | List of events (appointment status changes, deposit confirmed/rejected, campaign closed, agreement accepted, etc.) |
| 2 | Tap a notification | Deep-links to the **correct** related screen (not always Home) — check at least one of each: appointment, agreement, community post, bulk-deal deposit/close |
| 3 | "Mark all read" | Clears the unread badge everywhere it's shown (Home, bottom nav if it surfaces there) |
| 4 | New notification arrives while the list is open | Appears without a manual refresh, or refreshes cleanly on next open |

## New notification types to specifically check (this cycle's bulk-buying work)

| Type | Trigger | Expected deep link |
|---|---|---|
| `BULK_DEAL_DEPOSIT_CONFIRMED` | Business confirms your deposit | To the campaign / your claim status |
| `BULK_DEAL_DEPOSIT_REJECTED` | Business rejects your deposit | Somewhere you can re-pay |
| `BULK_DEAL_UNLOCKED` | Campaign closes Fulfilled, you're a paid pledger | `/community/activity` (claim pass) |
| `BULK_DEAL_REFUNDED` | Campaign closes Refunded | Business page (settle directly) |
| `BULK_DEAL_EXTENDED` | Business extends the deadline | Business page |

## Edge cases

- Push arrives with the app fully killed — tapping it cold-starts the app to
  the right screen, not just to Home.
- Two hats (business + provider) both have unread — badges are independent,
  correct icon/count per hat when switching.
