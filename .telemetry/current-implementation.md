## Current Implementation

**SDK:** custom first-party wrapper `src/lib/analytics.ts` on `@supabase/supabase-js` ^2.108.2, inserting into `public.events`. Supplementary: `@vercel/analytics` ^2.0.1, `@vercel/speed-insights` ^2.0.0.
**Captured:** 2026-10-27

### Initialization
No init step. `track()` lazily calls `getSupabase()` (`src/lib/supabaseClient.ts`) on each send and returns silently if the client is unavailable. Vercel `<Analytics />` and `<SpeedInsights />` mount once in `src/main.tsx:54-55`, inside `AppProvider`. Sentry (`initSentry`) and `initMonitoring` start in `main.tsx` too, for errors only.

The schema side lives in migrations:
- `supabase/migrations/20260996_product_analytics.sql`: `events` table, RLS policies, indexes, `marketplace_health()` RPC
- `supabase/migrations/20260999_otp_funnel_events.sql`: widens the name whitelist with `otp_*`
- `supabase/migrations/20261003_delivery_operations.sql:1296`: widens it again with `delivery_*` (current definition)
- Rollback: `supabase/rollbacks/20260996_product_analytics.rollback.sql`

### Client vs Server
Client only. Every `events` row is inserted from the browser or Capacitor WebView through PostgREST under the user's JWT (or `anon` for guests). No Edge Function or SQL trigger writes to `events`. Server-side behavior data comes from the source tables themselves (via `marketplace_health()`) and from the `bump_business_metric` / `bump_provider_views` RPCs, which update counters and view-log tables.

### Call Routing
A centralized wrapper. One exported function, `track(name: EventName, props?: Props)`:
1. Checks a module-level counter (`MAX_PER_SESSION = 500`) and increments it.
2. Fires `send()` as an un-awaited promise.
3. `send()` scrubs props with `scrubValue` (`src/lib/scrubPii.ts`) and inserts `{ name, props, session_id, app_version }`.

`EventName` is a TypeScript union kept in step by hand with the DB `events_name_known` CHECK. A guard test (`src/lib/deliveryOperationsMigration.test.ts:140`) reads `analytics.ts` source. `Props` is `Record<string, string | number | boolean | null | undefined>`, so only flat primitives are allowed. Callers are mostly service methods in `src/services/{core,engagement}`, which call `track` after their RPC succeeds. Tests mock the module with `vi.mock("@/lib/analytics")`.

### Identity Management
- **User:** implicit. `events.user_id` defaults to `auth.uid()::text`, and the RLS policies `events_insert_own` / `events_insert_guest` pin it, so the client never sends it. No traits are stored anywhere in the analytics path.
- **Anonymous:** `session_id` = `s_` + UUID in `sessionStorage["stryt_analytics_session"]`, created on first event. It falls back to `s_unknown` if storage is unavailable. It does not persist past the tab session, by design (comment at `analytics.ts:60-65`).
- **Groups:** none.
- **Logout:** no reset of `session_id` or the event counter.

### Environment Variables
None specific to product analytics. The sink uses the existing Supabase client config (`VITE_SUPABASE_URL` / anon key via `supabaseClient.ts`). `__APP_VERSION__` is a Vite define that provides `app_version`. Sentry is gated on `VITE_SENTRY_DSN`. Vercel Analytics needs no key.

### Error Handling
Non-blocking and silent. `track()` and `send()` each have a try/catch that swallows everything (offline, RLS rejection, pre-migration, constraint violation). No retry, no queue, no logging.

### Shutdown / Flush
Not handled. Nothing is buffered, so there is nothing to flush. In-flight inserts at page unload or app background are lost. The delivery rider path has its own offline outbox (`src/features/delivery-tracking/riderQueue.ts`) for the underlying RPCs. Its `track` calls fire only once those RPCs succeed on flush.

### Patterns worth preserving
- A single typed entry point with a DB-enforced whitelist, so event names cannot drift between code and storage.
- Fire-and-forget calls with full try/catch, which keep analytics out of user-visible failure paths.
- Shared PII scrubber plus the 2 KB props cap. Props observed in practice are categorical only.
- Guest-capable inserts with forgery-proof `user_id`, which supports signed-out funnels.
- Calls made in the service layer right after the RPC succeeds, so events reflect operations that actually happened.
- A deliberate split: client events cover what only the client knows, and SQL aggregates cover what the tables already prove.
