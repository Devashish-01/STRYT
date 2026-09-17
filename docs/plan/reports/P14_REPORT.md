# P14 Report — Operations & monitoring

**Agent / model:** Claude (Opus 5), Claude Code
**Session date (UTC):** 2026-09-18 (overnight run)
**Branch:** `night/2026-09-18`

## 1. Preconditions

| Check | Result | Pass? |
|---|---|---|
| Branch | `night/2026-09-18`, cut from `phase/07-e2e` | ⚠️ not `phase/14-ops`; see §2 |
| Weekly backup running | Not re-checked this run | ⬜ |
| D10 answered (Sentry) | Present | ✅ |

## 2. Deviations

| Phase file says | Done instead | Why |
|---|---|---|
| `git switch -c phase/14-ops origin/develop` | One overnight branch for several phases | The owner asked for a single side branch to review in the morning. |
| 14.A.2 "add `@sentry/capacitor` for native" | `@sentry/react` only | `@sentry/capacitor` captures crashes in the Java layer, which cannot be proven without a DSN **and** a real device. Adding an unverifiable second SDK the night before a review is not an improvement. Native *JavaScript* errors are covered by `@sentry/react` inside the WebView; native crashes are not, and `src/lib/sentry.ts` says so in its header. |
| 14.A.5 "test by throwing in a test route on the Vercel preview; the event appears in Sentry, scrubbed (screenshot)" | Not done | Needs a DSN and a deployed preview. Owner steps 3 and 8. |

## 3. What was done

### 14.A — Error monitoring

**The scrubber came first, and it turned out to matter more than Sentry.**

`src/lib/monitoring.ts` already ships errors to a `client_errors` table. Its header claimed "No PII beyond the
error text/stack + URL + UA". Building P15's data inventory showed that to be an *intention* with nothing
enforcing it: an error message contains whatever the throwing code put in it, and a failed fetch carries its
whole URL including the query string. So the leak was live, not hypothetical.

`src/lib/scrubPii.ts` removes, from messages, stacks, URLs, breadcrumbs and structured context:

- phone numbers in the shapes Indians type them — `+91 98765 43210`, `09876543210`, `98765-43210`;
- emails, Aadhaar (however spaced), PAN, UPI handles;
- coordinate pairs and `lat=`/`lng=` key-values;
- JWTs, bearer tokens, API keys, OTPs, handoff codes, tracking tokens;
- any object key that names something personal, dropped without inspecting the value.

It errs towards redacting. A false positive costs a redacted token in a stack trace; a false negative puts a
customer's phone number in a third-party service. Prices, counts, ids and version numbers survive — there are
tests for that, because a scrubber that eats the diagnostic value would just get turned off.

**26 tests**, each asserting the sensitive value is *absent* from the output rather than that something was
replaced. A scrubber that redacts one copy and leaves another passes the weaker check.

Wired into the existing `client_errors` sink — that is where the leak is today — and it is the `beforeSend`
for Sentry.

**Sentry** (`src/lib/sentry.ts`) is wired with three properties that are testable before an account exists:

1. With no `VITE_SENTRY_DSN`, nothing happens — no import, no init, no network. Dev, CI and the E2E suite stay
   silent.
2. The SDK is imported dynamically, so a build without a DSN never fetches it.
3. `scrubPii` is the `beforeSend` and `beforeBreadcrumb`. An event that cannot be scrubbed is **dropped**, not
   sent raw. A `user` object is reduced to its opaque id.

**Two bundle regressions caught while doing it** — both the exact trap P11's own comments in `vite.config.ts`
describe:

- `@sentry/react`'s path contains `/react/`, so `manualChunks` pinned it into `vendor-react`, the eagerly
  loaded chunk. +27 KB on every page load, and the dynamic import defeated entirely.
- The service worker then precached that chunk: ~350 KB pushed to every device for code that never runs
  without a DSN.

Fixed: its own chunk, excluded from the precache manifest. Precache 6003 → 6010 KiB — +7 KiB of glue rather
than +359.

**`npm audit` before committing:** the high and critical advisories are `vite` and `vitest`, both dev-only.
`npm audit --omit=dev` shows the two pre-existing moderate `react-router` ones and nothing new, so P11's "no
high or critical advisory in shipped code" still holds.

**14.A.3, 14.A.5 (error boundary, source maps):** already satisfied, verified rather than rebuilt.
`src/components/ErrorBoundary.tsx` wraps the router in `main.tsx`, reports via `captureException`, and offers
a reload. The build emits **zero** `.map` files.

### 14.B — Job monitoring

**Not done.** See §4.

## 4. Not done

| Item | Why |
|---|---|
| 14.B.7 — migration granting `ci_readonly` select on `cron.job_run_details` / `cron.job`, and the drift job failing on a stale or failed cron | Ran out of the night. It is a live database change and `docs/database/HANDOFF.md` §5 requires backup, snapshot, verbatim rollback, a forced-rollback test, then apply and verify — not something to start with an hour left and leave half-applied. The three jobs it would watch are `close-expired-bulk-deals` (*/10), `close-expired-business-sessions` (every minute) and `notify-ended-polls` (*/10). |
| 14.C — rollback drill | Depends on 14.B. |

## 5. Owner steps

| # | Step |
|---|---|
| 3 | Create the Sentry project; add `SENTRY_DSN` and `SENTRY_AUTH_TOKEN` as GitHub secrets. Nothing reports until `VITE_SENTRY_DSN` is set at build time. |
| 4 | Create the uptime monitors (stryt.in, the `app-update` function, Supabase REST). |
| — | Confirm GitHub emails on workflow failure are on. |

## 6. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | exit 0 |
| `npx vitest run` | 719 passed (34 new: 26 scrubber, 8 Sentry) |
| `npm run build` | succeeds; 0 `.map` files |
| Sentry absent from `index.html`'s scripts | confirmed — it is a lazy chunk |
| Precache delta | 6003 → 6010 KiB |
| `npm audit --omit=dev` | 2 moderate, pre-existing; no new |

## 7. Definition of Done

- [x] Errors reported with personal data removed — and the scrubber covers the *existing* sink, not only Sentry
- [x] Initialises only when a DSN is present
- [x] Scrubber unit-tested with realistic samples
- [x] Error boundary reports and offers recovery
- [x] No source maps served
- [ ] Sentry receiving a real scrubbed event — owner step 3
- [ ] Uptime monitors — owner step 4
- [ ] Cron job monitoring — §4
- [ ] Rollback drill — depends on the above
