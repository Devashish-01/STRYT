# Personal-data access matrix

**Generated:** 2026-09-20T07:28:25.720Z from `docs/security/data-access-results.json` by `scripts/audit/render-data-access-matrix.mjs`.
**Tests:** `scripts/audit/data-access-tests.mjs` — real queries on production (`gnswxlfmcwyhmzlfipql`), one forced-rollback
transaction per table, each actor in its own rolled-back sub-block. Nothing was kept.

> Replaces the P05 matrix generated on 2026-09-15 by `build-data-access-matrix.mjs`, which ran no queries: every
> cell was `-/-/-/-` and every table was marked SAFE. The first real run (before migrations 20260968–20260972)
> found a stranger reading password and recovery hashes, emails and exact locations from `users`, a stranger
> deleting business stories, and direct edits of agreements and bookings — see `supabase/APPLY_LOG.md` rows 31–35.

## How to read a cell

`visible · update · delete`

- **anon / stranger:** rows the actor can SELECT out of all rows · rows an UPDATE (`pk = pk`) touched · rows a DELETE touched.
- **participant / owner / team:** rows of *their own* scope they can SELECT / rows in that scope · UPDATE · DELETE (the
  update and delete run over the whole table, so they count every row the actor may change).
- `✗` = refused by privileges (42501). `n/a` = the table has no such relationship, or no fixture existed.
- **stranger** = a signed-in user id that owns nothing. **participant** = the user most present in the table's user
  column. **owner** = owner of the business most present in `business_id`. **team_right / team_wrong** = a fresh
  active scoped team session with / without the scope that domain needs (only for tables mapped in the script).
- INSERT is not tested generically. Inserts that matter were tested per table: stories, leads (20260971, 20260972).

## Matrix

| Table | Rows | anon | stranger | participant | owner | team_right | team_wrong |
|---|---:|---|---|---|---|---|---|
| `account_appeals` | 1 | 0 · 0 · 0 | 0 · 0 · 0 | 1/1 · 1 · 0 | n/a | n/a | n/a |
| `agreements` | 1 | ✗ · ✗ · ✗ | 0 · 0 · 0 | 1/1 · 0 · 0 | n/a | n/a | n/a |
| `appointment_deliveries` | 1 | ✗ · ✗ · 0 | 0 · 0 · 0 | 1/1 · 0 · 0 | 1/1 · 0 · 0 | 1/1 · 0 · 0 | 0/1 · 0 · 0 |
| `appointment_items` | 15 | ✗ · ✗ · ✗ | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `appointments` | 21 | ✗ · ✗ · ✗ | 0 · 0 · 0 | 14/14 · 2 · 0 | n/a | n/a | n/a |
| `bulk_deal_pledges` | 2 | 0 · 0 · 0 | 0 · 0 · 0 | 1/1 · 0 · 0 | n/a | n/a | n/a |
| `bulk_deal_tokens` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `business_login_credentials` | 0 | ✗ · ✗ · ✗ | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `business_packages` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `business_team_members` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `businesses` | 21 | 21 · ✗ · 0 | 21 · 0 · 0 | 5/5 · 5 · 5 | n/a | n/a | n/a |
| `catalog_items` | 64 | 64 · ✗ · ✗ | 64 · 0 · 0 | n/a | 4/4 · 4 · 4 | 4/4 · 4 · 4 | 4/4 · 0 · 0 |
| `categories` | 56 | 56 · 0 · 0 | 56 · 0 · 0 | n/a | n/a | n/a | n/a |
| `community_posts` | 2 | 2 · 0 · 0 | 2 · 0 · 0 | 2/2 · 2 · 2 | n/a | n/a | n/a |
| `conversations` | 8 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `custom_payments` | 2 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `delivery_batches` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `fcm_tokens` | 25 | 0 · 0 · 0 | 0 · 0 · 0 | 11/11 · 11 · 11 | n/a | n/a | n/a |
| `group_buy_tokens` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `leads` | 16 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | 5/5 · 10 · 0 | 0/5 · 0 · 0 | 0/5 · 0 · 0 |
| `live_shares` | 13 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `places` | 22 | 22 · 0 · 0 | 22 · 0 · 0 | n/a | n/a | n/a | n/a |
| `post_comments` | 2 | 2 · 0 · 0 | 2 · 0 · 0 | 2/2 · 2 · 2 | n/a | n/a | n/a |
| `proposals` | 1 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `provider_packages` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `providers` | 6 | 6 · 0 · 0 | 6 · 0 · 0 | 1/1 · 1 · 1 | n/a | n/a | n/a |
| `queue_tokens` | 0 | ✗ · ✗ · ✗ | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `reports` | 1 | 0 · 0 · 0 | 0 · 0 · 0 | 0/1 · 0 · 0 | n/a | n/a | n/a |
| `request_me_toos` | 2 | 2 · 0 · 0 | 2 · 0 · 0 | 1/1 · 0 · 1 | n/a | n/a | n/a |
| `requests` | 8 | 8 · 0 · 0 | 8 · 0 · 0 | 5/5 · 5 · 5 | n/a | n/a | n/a |
| `saved_searches` | 1 | 0 · 0 · 0 | 0 · 0 · 0 | 1/1 · 1 · 1 | n/a | n/a | n/a |
| `settlements` | 2 | 0 · 0 · 0 | 0 · 0 · 0 | 1/1 · 0 · 0 | n/a | n/a | n/a |
| `societies` | 1 | 1 · 0 · 0 | 1 · 0 · 0 | n/a | n/a | n/a | n/a |
| `stories` | 5 | 5 · 0 · 0 | 5 · 0 · 0 | 3/3 · 3 · 3 | n/a | n/a | n/a |
| `subscription_logs` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `subscriptions` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `support_tickets` | 0 | 0 · 0 · 0 | 0 · 0 · 0 | n/a | n/a | n/a | n/a |
| `user_lists` | 2 | 0 · 0 · 0 | 0 · 0 · 0 | 2/2 · 2 · 2 | n/a | n/a | n/a |
| `users` | 32 | 0 · 0 · 0 | 32 · 0 · 0 | n/a | n/a | n/a | n/a |

## Rows a guest, stranger or wrong-scope team member could change

None.

## Reading this correctly

- High **stranger visible** counts on `businesses`, `providers`, `categories`, `catalog_items`, `places`,
  `requests`, `community_posts`, `post_comments`, `request_me_toos`, `societies` and everyone-visibility
  `stories` are public listings by design.
- `users` rows stay visible to signed-in users (profiles), but since 20260968 only non-sensitive columns are
  readable. Contact numbers: see `supabase/pending/users_phone_column_lockdown.sql` (after the app release).
- Participant/owner update counts are the actor's own rows (policy-allowed); the database functions still enforce the
  business rules for status and payment changes where the direct update path was removed (20260969, 20260970).
