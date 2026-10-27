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

- [ ] **Remove the bot challenge.** Today every URL on `stryt.in`, including `/legal/privacy-policy`, answers
  **HTTP 429** with `X-Vercel-Mitigated: challenge` — Vercel's firewall is serving a JavaScript challenge, which
  Google's privacy-policy check cannot pass. Vercel → the project → **Firewall** → switch off **Attack Challenge
  Mode**, and delete or loosen any rule whose action is *Challenge*. Then confirm
  `https://stryt.in/legal/privacy-policy` and `/legal/account-deletion` open in an incognito window (from a phone
  on mobile data too).
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
- [ ] **Deploy the photo sweep.** One command, from the repo root, after `npx supabase login`:
  `npx supabase functions deploy purge-expired-stories --project-ref gnswxlfmcwyhmzlfipql`
  (`supabase/config.toml` already sets `verify_jwt = false` for it). Then push the repo so the daily workflow
  `.github/workflows/purge-expired-stories.yml` exists on GitHub, and run it once by hand (Actions → *Purge expired stories* →
  *Run workflow*) — it prints `rowsDeleted` / `photosRemoved`. It also clears the ~30 old orphan story photos in storage.
  Until it is deployed nothing breaks: expired stories are already hidden and their rows are purged by the database job;
  only their photo files linger.

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
- [ ] **Record the background-location video** with `BACKGROUND_LOCATION_VIDEO_SCRIPT.md` (two parts: live share, then a
  delivery; about 2–3 minutes), upload to YouTube as **Unlisted**.
- [ ] **Sensitive permissions → Background location:** paste the text from `BACKGROUND_LOCATION_DECLARATION.md` §1 and
  the video link. If the Console also shows **Foreground service permissions**, use the same text and link.
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
