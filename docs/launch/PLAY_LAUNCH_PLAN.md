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
   which builds the AAB. The new code expects migrations `20260973`–`20260989`, which production does not have
   yet. **Apply the database changes to production before merging, or current users break.**

3. **Background location is the one open decision.** `android/app/src/main/AndroidManifest.xml` line 89 still
   requests `ACCESS_BACKGROUND_LOCATION` for My People live share. Play reads permissions from the build
   itself, so you cannot answer "No" in the console while the build asks for it. D2 removed delivery's use of
   the permission but not live share's.

Already verified and not a concern: the battery-optimisation permission (BLOCKER 1) really is commented out
of the manifest, and merging is a clean fast-forward — `origin/main` has nothing our branch lacks.

---

## Section 1 — What the agent does

### Before the owner merges

- [ ] **1. Apply the background-location decision** (blocked on owner step 1).
  - Option B: remove `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION`, make live share
    foreground-only, and check the *merged* manifest so the background-geolocation plugin does not re-add
    them.
  - Option A: finalise `play-console/BACKGROUND_LOCATION_DECLARATION.md` and write the demo-video script.
- [ ] **2. Wire `VITE_SENTRY_DSN` into `android-release.yml` and `ota-release.yml`.** Correction to the P14
  report, which said to create a `SENTRY_DSN` secret: the build reads `VITE_SENTRY_DSN`, and neither workflow
  passed it, so Sentry would never have switched on.
- [ ] **3. Fix P12-001** — a reply-to-chat notification navigates to `/chat`, which is not a route. The fix
  changes `src/screens/notifications/actions.ts` and the test in `actions.test.ts` that currently pins the
  broken fallback.
- [ ] **4. Rewrite `play-console/DATA_SAFETY.md` and dossier §4** as exact answers to paste into the console,
  from `DATA_INVENTORY.md` §1. Five data types are currently missing and three rows are wrong
  (`DATA_SAFETY_DIFF.md`).
- [ ] **5. Read-only check of the `verification-docs` bucket policies** (it holds Aadhaar/PAN) before
  government ID is declared.
- [ ] **6. Read-only production preflight:** confirm which of `20260973`–`20260989` are missing on production,
  and write the owner's step-by-step apply runbook.
- [ ] **7. Final checks on the release commit:** `npm run verify`, full E2E, and a written merge checklist.

### During the closed test

- [ ] **8.** Log tester feedback as `QA-` rows in `docs/gaps/GAP_LEDGER.csv`, fix it, and ship updates to the
  closed track.
- [ ] **9.** Write `docs/launch/GO_NO_GO.md` with fresh evidence before production.

---

## Section 2 — What the owner does

### Today

- [ ] **1. Decide background location.**
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

- [ ] **4. Apply migrations `20260973`–`20260989` to production**, using the agent's runbook and
  `docs/database/HANDOFF.md` §5.
- [ ] **5. Deploy three edge functions to production:** `purge-deleted-accounts`, `admin-delete-profile` and
  `verification-review`. `purge-deleted-accounts` matters most: without it, the 30-day account deletion that
  the privacy policy and store listing promise never completes.
- [ ] **6. Create the Sentry project** and add a `VITE_SENTRY_DSN` repository secret.

### Release

- [ ] **7. Review the branch and merge to `main`.** Remember fact 2: this ships to current users by OTA and
  builds the AAB.
- [ ] **8. Download the AAB** from the `android-release` workflow run.

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
  - option A only: the background location declaration and video
- [ ] **10. Store listing**, from `play-console/STORE_LISTING.md` and `play-console/graphics/`.
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
