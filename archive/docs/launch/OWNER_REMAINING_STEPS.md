# Play Store release — what only the owner can do

**Written 2026-10-24**, after everything that could be done in the repo, the database and CI was done. Delivery ships
in this release. Work top to bottom; items inside a group can be done in any order.

What is already done (so you do not redo it): Capacitor upgraded to 8.4.3 (critical advisory closed; native build
verified), `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` removed in favour of a permission-free battery-settings page, the
in-app delivery location disclosure made exact, privacy policy and retention policy updated for delivery (§3.12),
declaration + video script + App access + Data safety + listing text rewritten for delivery, the three review
accounts prepared (customer has the shop owner as its My People contact), target SDK is 36, the Play bundle is built
by CI as the `stryt-playstore-aab` artifact.

---

## 1. Vercel — `stryt.in`

- [x] **Remove the bot challenge — done 2026-11-08.** Firewall rule *Allow public privacy policy* now bypasses Bot
  Protection for every `/legal/…` path (Bot Protection stays on elsewhere). Verified by curl: privacy-policy,
  account-deletion and terms → 200 on `stryt.in` and `www.stryt.in`, also with a Googlebot user agent; `/` is still
  challenged (fine for Play). Original note: every URL on `stryt.in`, including `/legal/privacy-policy`, answers
  **HTTP 429** with `X-Vercel-Mitigated: challenge` — Vercel's firewall is serving a JavaScript challenge, which
  Google's privacy-policy check cannot pass. *Checked 2026-11-08:* Attack Challenge Mode is already off; the cause is
  **Bot Protection = Challenge** (Firewall → Rules → Bot Management). Set it to **Log**, or publish a *Bypass* rule for
  path prefix `/legal/` — then **Review Changes → Publish** (unpublished changes do nothing). An incognito browser is
  **not** a valid test (browsers solve the challenge silently); the test is
  `curl -I https://stryt.in/legal/privacy-policy` and `/legal/account-deletion` → `200`, no `X-Vercel-Mitigated`.
- [ ] After step 2 below is pushed, confirm the web deploy succeeded (Vercel has needed your approval before).

## 2. Legal text — needs your postal address

- [ ] Put your address in `legal/operator.yaml` → `registered_address` (it is empty), check `effective_date`, then run
  `node scripts/apply-legal-operator.mjs`, and commit + push. Until then the published policy still shows
  `[REGISTERED ADDRESS]` and `[To be set by STRYT on publication]`. (Or send the address and I'll do it.)
- [ ] Optional but recommended: have counsel add a *Home delivery* clause to the Terms and Merchant Terms (STRYT is a
  platform; who is responsible for the goods, cash handling, undelivered orders). Not a Play requirement.

## 3. Supabase

- [ ] **Retire the legacy `service_role` key** (a working one is in git history). In order: create a secret key →
  put it in GitHub → Settings → Secrets → `SUPABASE_SERVICE_ROLE_KEY` → push once and confirm the OTA workflow is
  green → *then* disable the legacy key.
- [ ] Auth → turn on **Leaked Password Protection** (the advisor still flags it; may need the Pro plan).

## 3b. Stories (added 2026-10-25 — see `archive/docs/gaps/STORIES_GAP_LOG.md`)

- [x] **`20261008_stories_complete.sql` — applied 2026-10-27** and checked from the app (reaction saves, mute works, a deleted
  story's photo is really gone, a signed-out visitor loads stories). `APPLY_LOG.md` row 71 records it.
- [x] **Deploy the photo sweep — done** (checked 2026-11-06: `purge-expired-stories` ACTIVE v1 in production, the daily
  *Purge expired stories* workflow ran green on 2026-11-05). Original instructions, kept for reference: one command, from the repo root, after `npx supabase login`:
  `npx supabase functions deploy purge-expired-stories --project-ref gnswxlfmcwyhmzlfipql`
  (`supabase/config.toml` already sets `verify_jwt = false` for it). Then push the repo so the daily workflow
  `.github/workflows/purge-expired-stories.yml` exists on GitHub, and run it once by hand (Actions → *Purge expired stories* →
  *Run workflow*) — it prints `rowsDeleted` / `photosRemoved`. It also clears the ~30 old orphan story photos in storage.
  Until it is deployed nothing breaks: expired stories are already hidden and their rows are purged by the database job;
  only their photo files linger.

## 3c. State-machine fixes (added 2026-11-13 — see `archive/docs/gaps/GAPS_LOG.md` #38–#49)

Seven migrations — **all applied 2026-11-13**, checked in the live catalog. Still open: the app half (last box) and, optionally, running the test files. #38 (an owner can approve their own listing) is a launch blocker;
#48 / #49 (location shares that never expire) are privacy bugs. Apply **in this order** in the Supabase SQL editor, and after
each one run its test file from `supabase/tests/` in the same editor. A pass ends in an error that says `ALL_…_PASSED`, and
nothing is saved. Then record each in `supabase/APPLY_LOG.md`.

- [x] `20261011_listing_status_guard.sql` → `listing_status_guard.test.sql` (#38)
- [x] `20261012_appointment_writes_via_functions.sql` → `appointment_writes_via_functions.test.sql` (#39, #40)
- [x] `20261013_queue_token_transitions.sql` → `queue_token_transitions.test.sql` (#41, #42)
- [x] `20261014_request_proposal_status_guard.sql` → `request_proposal_status_guard.test.sql` (#43)
- [x] `20261015_visit_outcome.sql` → `visit_outcome.test.sql` (#44; adds cron `sweep-stale-appointments`)
- [x] `20261016_expiry_sweeps.sql` → `expiry_sweeps.test.sql` (#45, #48, #49; adds cron `expire-stale-rows`, restores `close-stale-queues`)
- [x] `20261017_dormant_tables_read_only.sql` (#47; no test file)
- [ ] Ship the app half (OTA + web) **after** the migrations: the new "Done" / "No-show" buttons need 20261015. Old app builds keep
  working against the new database. Every move they make is still allowed, and undoing a queue payment claim starts working
  for them too, because that fix is in the database.

Each migration has a rollback in `supabase/rollbacks/` with the same name.

**Added 2026-11-13 (GAPS #51, #52) — applied 2026-11-13, test passed, checked in the live catalog:**

- [x] `20261018_money_scope.sql` → `money_scope.test.sql`. Adds the team permission "Money & rider cash": seeing rider cash,
  unpaid deliveries and delivery totals, and settling riders' cash, now needs it instead of just "Orders". Anyone who has
  "Orders" today gets it in the same step, so nobody loses anything. It also fixes saving the shop login password, which has been
  failing since 20261006 (#52). Safe before the app update: old builds still work, because every current Orders holder keeps the
  money panels. Ship the app half (the new tick box in Team access) with the other app changes above.
- [x] `20261019_shop_login_sessions.sql` (applied 2026-11-13, checked) → `shop_login_sessions.test.sql` (#53). Turning the shop login off now really signs out
  everyone who used it (named team members are not affected), and the login ID is checked. Database only; no app update needed.
  Production has no saved shop login yet, so nothing changes for anyone today.

## 3d. Retention (added 2026-11-13 — GAPS #54)

- [ ] Apply `supabase/migrations/20261020_retention.sql` in the SQL editor, then run `supabase/tests/retention.test.sql` (pass = `ALL_RETENTION_CHECKS_PASSED`). Adds the daily clean-up (`purge-old-rows`) and the 180-day copy of a deleted account's registration details that the IT Rules require. Then say "push": the matching legal text is waiting uncommitted.
- [ ] Confirm `grievance@stryt.in` exists on Hostinger and is read; ask TypeSafe where it processes data; check the Supabase project region (CERT-In wants logs kept 180 days in India).

## 4. Android signing and Firebase

- [ ] **Rotate the keystore passwords** — `docs/launch/KEYSTORE_ROTATION.md` (three GitHub secrets).
- [ ] After the first upload, Play Console → **App integrity → App signing** shows the *App signing key certificate*.
  Add its **SHA-1 and SHA-256** to the Android app in Firebase project `zetax-52843`, download the new
  `google-services.json` and update the GitHub secret that holds it. Without this, phone sign-in fails in the
  Play-signed build.
- [ ] Firebase → Authentication → Phone → **Phone numbers for testing**: confirm these three exist with exactly
  these codes — `+91 9111111111` / `111111`, `+91 9222222222` / `222222`, `+91 9333333333` / `333333`.

## 5. Play Console

- [ ] **Store listing** (the last app-setup item): paste from
  `archive/playstore-assets/metadata/APP_TITLE_AND_DESCRIPTIONS_EN.txt` (it now includes a home-delivery section);
  graphics are in `archive/playstore-assets/graphics/`. The four screenshots predate the new Home, tracker and
  delivery screens — replace or add some if you want the listing to show them (optional).
- [ ] **App access:** add the four instruction sets from `archive/docs/launch/play-console/APP_ACCESS.md`.
- [ ] **Record the background-location video** with `BACKGROUND_LOCATION_VIDEO_SCRIPT.md` (one delivery-tracking
  demonstration; Google recommends about 30 seconds), upload to YouTube as **Unlisted**.
- [ ] **Sensitive permissions → Background location:** paste the single-feature delivery text from
  `BACKGROUND_LOCATION_DECLARATION.md` §1 and the video link. If the Console also shows **Foreground service
  permissions**, use the separate foreground-service text in that file. My People stays in the app and is covered by
  its in-app disclosure, privacy policy and App access instructions.
- [ ] **Data safety:** no new data types are needed for delivery. Open the form once and confirm it still matches
  `archive/docs/launch/play-console/DATA_SAFETY.md`.
- [ ] **Download the AAB** (see below), create a **Closed testing** release, upload it, and in the Console's permission
  list confirm `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is **not** present.
- [ ] **Recruit at least 12 testers** (invite 20 or more) and make sure each one **opts in and installs**.
- [ ] **Keep the closed test running 14 continuous days** with 12 testers still opted in.
- [ ] **Apply for production access**, then create the production release and roll it out (staged is safer).

## 6. After Google approves

- [ ] Remove the three Firebase test phone numbers (they let anyone who knows them sign in as the review accounts).
- [ ] Remove the temporary web-login fixtures: `vercel remove stryt-56hscnd1y-devashish-01s-projects.vercel.app` and
  `vercel alias rm stryt-otp-test.vercel.app`, and `https://stryt-otp-test.vercel.app` from `ALLOWED_ORIGINS` of the
  `firebase-phone-auth` function and from Firebase's authorised domains.
- [ ] Decide what to do with the demo shop and accounts in production (keep for future reviews, or delete).

---

## Where the Play bundle is

CI builds it on every push to `main` and uploads it as the GitHub Actions artifact **`stryt-playstore-aab`**
(`gh run download --name stryt-playstore-aab`). The same build is also attached to the `android-latest` GitHub
release as `stryt.aab`. A copy is saved locally at `archive/output/play-release/` (not committed).
