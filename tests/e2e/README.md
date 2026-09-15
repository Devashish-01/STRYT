# End-to-end tests (staging only)

These tests drive the real app in a browser as synthetic personas, against the **staging** Supabase project. They never touch production: `global-setup.ts` refuses to start unless `.env.staging` points at the staging ref, and every seed/apply script refuses the production ref before sending anything.

## One-time setup

1. `node scripts/staging/setup-staging-auth.mjs` — writes `.env.staging` (gitignored) and gives each persona a test phone number on staging.
2. `npm run seed:staging -- --reset` — synthetic personas, one business, one provider, team sessions.
3. `npm run check:staging-signin` — every persona can sign in (API level).

## Run

- `npm run e2e` — builds the app in `--mode staging`, serves it with `vite preview` on port 5174, reseeds staging, runs `tests/e2e/**/*.spec.ts`.
- `E2E_SKIP_SEED=1 npm run e2e` — skip the reseed (faster when re-running one spec).
- `npm run e2e -- -g owner1` — filter by test name.

## Personas (`scripts/staging/personas.mjs`)

| Key | Role |
|---|---|
| `customer1`, `customer2` | customers |
| `owner1` | owns **Test Salon One** (catalog, all-day hours, open queue) |
| `staff_queue` | team member of Test Salon One with the `queue` scope |
| `staff_appointments` | team member with the `appointments` scope |
| `provider1` | owns provider **Test Plumber One** (2 packages) |
| `admin1` | admin role |

Sign in with `signIn(page, "owner1")` or `personaPage(browser, "owner1")` from `fixtures/staging.ts`. It uses the app's real OTP screen (`/auth/otp`) with the staging test code. Production login is Google-only, so the phone entry screen doesn't exist; the OTP screen is the app's own phone sign-in path.

## Rules

- A test that fails because of a real bug is marked `test.fixme(true, "<GAP_LOG>:<ID> — <one line>")` — never weakened.
- No fixed sleeps; use Playwright auto-waiting and `expect.poll`.
- Tests create their own records and don't depend on order.
