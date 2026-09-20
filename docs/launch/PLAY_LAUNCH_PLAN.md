# Play Store launch plan

**Written:** 2026-09-18 · **Branch:** `night/2026-09-18` · **Goal:** STRYT live on Google Play (production track)

This plan was built by checking the release workflows, the Android manifest, the branch state and the launch
docs in this repo. It was not written from memory. Tick the boxes as you go.

---

## Read this first — three facts that set the order

1. **The 14-day closed test is the critical path.** The Play developer account is personal and was created
   after Nov 2023 (decision D11), so Google requires **≥12 testers opted in for 14 continuous days** before
   production access. The clock cannot start until a build is live on the closed track. Everything else fits
   inside those 14 days.

2. **Merging to `main` ships to every current user immediately.** A push to `main` triggers
   `ota-release.yml`, which sends an over-the-air update to existing installs, and `android-release.yml`,
   which builds the AAB. The new code expects migrations `20260973`–`20260991`, which production does not have
   yet. **Apply the database changes to production before merging, or current users break.**

3. **Background location is declared, not removed** — decided 18 Sept (D19, option A). The build requests
   `ACCESS_BACKGROUND_LOCATION` for My People live share, so Play needs a declaration, a demo video and a
   human review before the closed test can start. A rejection costs days on the critical path; the fallback
   after two rejections is option B (foreground-only).

Already verified and not a concern: the battery-optimisation permission (BLOCKER 1) really is commented out
of the manifest, and merging is a clean fast-forward — `origin/main` has nothing our branch lacks.

---

## Section 1 — What the agent does

### Before the owner merges

- [x] **1. Apply the background-location decision** — option A (D19), 18 Sept.
  - The app now meets the policy it is declared under. Three defects a reviewer would have seen are fixed:
    the notification said "for active deliveries"; the disclosure was shown once per install rather than
    whenever the permission is not granted (both `528763b`); and an expired share kept collecting location
    and was resumed on every launch (P15-003 — production had one such share on 18 Sept).
  - `play-console/BACKGROUND_LOCATION_DECLARATION.md` finalised, including the foreground-service answers
    (§1b); `play-console/BACKGROUND_LOCATION_VIDEO_SCRIPT.md` written; `APP_ACCESS.md` §3 corrected.
- [x] **2. Wire `VITE_SENTRY_DSN` into `android-release.yml` and `ota-release.yml`.** *Done `4dd2a70`.* Correction to the P14
  report, which said to create a `SENTRY_DSN` secret: the build reads `VITE_SENTRY_DSN`, and neither workflow
  passed it, so Sentry would never have switched on.
- [x] **3. Fix P12-001** *(done `4dd2a70`, 37 tests pass)* — a reply-to-chat notification navigates to `/chat`, which is not a route. The fix
  changes `src/screens/notifications/actions.ts` and the test in `actions.test.ts` that currently pins the
  broken fallback.
- [x] **4. Revise `play-console/DATA_SAFETY.md` and make it the single source** — dossier §4 now points at it.
  *Correction:* it was largely right already. The earlier "five missing, three wrong" came from diffing the
  dossier's short summary and from using the everyday meaning of *shared*; Play excludes service providers.
  The genuine fixes: **in-app search history** was under-declared, and the deletion answer needs
  `purge-deleted-accounts` live first.
- [x] **5. Read-only check of the `verification-docs` bucket policies** — locked down on both projects. It
  also found that **deletion never removed these documents** (P15-001): fixed in both edge functions
  (`fd20e49`), tested against the shipped code, deployed to staging. (it holds Aadhaar/PAN) before
  government ID is declared.
- [x] **6. Read-only production preflight** — see `RELEASE_RUNBOOK.md`. Production is missing exactly the 17;
  all 17 files and rollbacks match their logged hashes. confirm which of `20260973`–`20260989` are missing on production,
  and write the owner's step-by-step apply runbook.
- [x] **7. Final checks on the release commit:** `npm run verify` passed (743 unit tests, build clean); full
  E2E **150 passed, 0 failed** on `45626bf`, which holds every code change; the merge checklist is
  `RELEASE_RUNBOOK.md` part 4. Commits after that are documentation only.

### During the closed test

- [ ] **8.** Log tester feedback as `QA-` rows in `docs/gaps/GAP_LEDGER.csv`, fix it, and ship updates to the
  closed track.
- [ ] **9.** Write `docs/launch/GO_NO_GO.md` with fresh evidence before production.

---

## Section 2 — What the owner does

### Today

- [x] **1. Decide background location.** *Decided 18 Sept: **A** — keep it and declare it (D19).*
  - **A — keep it.** Needs a Play declaration, a demo video and a human review. This is the highest
    remaining rejection risk, and a rejection delays the 14-day clock.
  - **B — foreground-only for v1.0** *(agent's recommendation)*. The permission is removed and no declaration
    is needed. Cost: sharing stops when the phone is locked or the app is in the background. It returns in
    v1.1.
- [ ] **2. Recruit 12+ testers** and collect their Google account emails. This is the longest wait — start
  now.
- [ ] **3. Create the reviewer's Google account** and sign into it once on a real phone.
  `play-console/APP_ACCESS.md` explains why (Google's risk checks block a brand-new account on an unfamiliar
  device).

### Before merging — order matters

- [x] **4. Apply migrations `20260973`–`20260991` to production** *(done 18 Sept ~19:50 UTC by the owner with `scripts/release/apply-production-migrations.mjs`, after a verified backup; recorded as APPLY_LOG #36–#54. Until the merge, the old app's "Request payment" button fails — 20260980 — so merge soon.)* *(19 — `20260990` and `20260991`, moderation, were added 19 Sept)*, using the agent's runbook and
  `docs/database/HANDOFF.md` §5.
- [x] **5. Deploy three edge functions to production:** *(done 18 Sept ~19:57 UTC by the owner: purge-deleted-accounts v6 — first deploy, verify_jwt off — admin-delete-profile v18, verification-review v6; each answered the anon-key boot check with its own 401 JSON. Still to check: the GitHub secrets the purge workflow needs.)* `purge-deleted-accounts`, `admin-delete-profile` and
  `verification-review`. `purge-deleted-accounts` matters most: without it, the 30-day account deletion that
  the privacy policy and store listing promise never completes. These versions also delete Aadhaar/PAN
  documents with the account (P15-001). Follow `RELEASE_RUNBOOK.md` parts 1–2.
- [x] **6. Create the Sentry project** and add a `VITE_SENTRY_DSN` repository secret. *(done 20 Sept: org `zetax-f4`, project `javascript-react`, US region. DSN set as the GitHub Actions secret and as a Vercel Production variable (type Config — a `VITE_*` value is public by design, it ships in the bundle). Checked through Sentry's API: IP addresses scrubbed, server-side data scrubbing on, key rate-limited to 100 events/minute. Live from release 1.0.68; the legal documents name Sentry as of `d5e74b5`.)*

### Release

- [x] **7. Review the branch and merge to `main`.** *(done 18 Sept 21:37 UTC: fast-forward to `69d91bf`, 130 commits. OTA 1.0.64 published (run 35397697103, gate green). The Android build of that push was cancelled by a CI concurrency clash — fixed in `3305486`, which ships with the next release — and was re-run from `main` as run 35398394593.)* Remember fact 2: this ships to current users by OTA and
  builds the AAB.
- [x] **8. Download the AAB** from the `android-release` workflow run. *(done 19 Sept: run 35398394593 on `1eb9692`, version 1.0.64, gate and build green. Artifact `stryt-playstore-aab` (kept until 18 Oct) downloaded to `D:/STRYT-release/1.0.64/stryt.aab`, 9,379,749 bytes, sha256 starts `c02bb827915b7d39`.)*

### Play Console

- [ ] **9. App content:**
  - privacy policy URL
  - account deletion URL (`https://stryt.in/legal/account-deletion`)
  - app access — the reviewer account from step 3
  - ads: none
  - content rating questionnaire
  - target audience
  - Data safety — paste the agent's answers (agent step 4)
  - financial features declaration — the app records UPI payment claims between users and does **not**
    process payments
  - background location declaration — paste `play-console/BACKGROUND_LOCATION_DECLARATION.md` §1, and the
    video link. **Record the video** with `play-console/BACKGROUND_LOCATION_VIDEO_SCRIPT.md` (two phones, or
    a phone and a laptop). Answer §1b too if *Foreground service permissions* is listed.
- [ ] **10. Store listing**, from `play-console/STORE_LISTING.md` and the images in `playstore-assets/graphics/` (repo root).
- [ ] **11. Internal testing:** upload the AAB, install it on your own phone, and run
  `docs/qa/DEVICE_QA_CHECKLIST.md`. At minimum: first run (§7), push notifications (§2) and dialling (§5).
- [ ] **12. Closed testing:** add the 12+ tester emails, roll out, and send the opt-in link. The 14 days count
  only while at least 12 testers stay opted in.

### During the 14 days

- [ ] **13. Lawyer review** of the legal documents. Record the reviewer and date in `legal/README.md`.
- [ ] **14. Uptime monitors** for stryt.in, the `app-update` function and Supabase REST.

### After the 14 days

- [ ] **15. Apply for production access.** Play asks questions about the closed test.
- [ ] **16. Sign `GO_NO_GO.md`**, then release to production as a staged rollout (e.g. 20%). Watch it for
  72 hours, then go to 100%.

---

## Not needed for the Play Store

Do not wait on these. They are real work, but none of them is a Play requirement:

- the five screens over 700 lines
- the remaining `any` reduction
- the P07 action specs for screen-only flows
- Hindi and Marathi (deferred to v1.1 by D18)
- Lighthouse
- the contrast / brand palette decision (P13-001) — recommended, not required

## Timeline (rough)

About 2–3 days to get the closed test live, then 14 days, then Google's review of the production-access
application and of the release. **Roughly three weeks from today**, provided testers are recruited now.
