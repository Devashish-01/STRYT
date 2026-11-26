# End-to-end tests (staging only)

These tests drive the real app in a browser as synthetic personas, against the **staging** Supabase project. They never touch production: `global-setup.ts` refuses to start unless `.env.staging` points at the staging ref, and every seed/apply script refuses the production ref before sending anything.

## One-time setup

1. `node scripts/staging/setup-staging-auth.mjs` — writes `.env.staging` (gitignored) and configures the legacy Supabase SMS test path used by API checks. Browser sign-in now uses Firebase Phone Auth, so the persona numbers and `STAGING_TEST_OTP` must also be configured as Firebase test phone numbers in the Firebase project selected by `VITE_FIREBASE_*`.
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

Sign in with `signIn(page, "owner1")` or `personaPage(browser, "owner1")` from `fixtures/staging.ts`. It follows the real phone entry and OTP screens using the Firebase test code. Production supports both Google and phone sign-in. Browser runs also require Firebase's reCAPTCHA service to be reachable.

## Rules

- A test that fails because of a real bug calls `knownBug("<gap id> — <one line>")` (a `test.fixme`) — never weakened. `E2E_RUN_FIXME=1` runs those tests anyway, to show a bug still reproduces or that its fix works.
- No fixed sleeps; use Playwright auto-waiting and `expect.poll`.
- Tests create their own records and don't depend on order.
