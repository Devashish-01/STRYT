# P15 — Store, legal & public launch

**Who:** the owner (Play Console, legal review, go/no-go); the agent prepares documents and evidence, and runs the release checks
**Size:** 2–3 sessions, plus the Play closed-test wait (14 days if D11 requires it) and Play review time
**Depends on:** P14 — and **every** earlier phase ✅ Done

## Goal
STRYT is live for the public on Google Play (production track) and stryt.in, with store declarations and legal documents that match what the app really does, and a watched launch window.

## Preconditions
| Check | How | Expected |
|---|---|---|
| All phases done | `docs/plan/README.md` | P00–P14 `✅ Done` |
| Branch | `git switch -c phase/15-launch origin/develop` | Switched |
| D1, D2, D11 answered | `DECISIONS.md` | Present |

## Read first
- `docs/launch/play-console/PLAY_CONSOLE_MASTER_DOSSIER.md`, `docs/launch/play-console/STORE_LISTING.md`
- `legal/*.md` (privacy policy, terms, account deletion, data retention, grievance redressal, cookie policy, refund/cancellation, merchant terms, community guidelines, acceptable use, disclaimer, operator)
- `docs/launch/ANDROID_LAUNCH_BLOCKERS.md`
- `android/variables.gradle` (targetSdk 36 on 2026-09-13), `AndroidManifest.xml`

## Steps

### 15.A — Data inventory (agent; the basis for every declaration)
1. Build `docs/launch/DATA_INVENTORY.md` **from the code and schema, not from existing docs**. For each data type:
   - where it's collected (screen/service);
   - where it's stored (table/bucket);
   - who can see it (from the P05 access matrix);
   - whether it's shared with third parties (Firebase/FCM, Twilio, Vercel Analytics/Speed Insights, Sentry, map tile providers, Nominatim);
   - retention and deletion behaviour;
   - whether it's optional.

   Cover at least: name, alias, phone, email, precise and approximate location, live location sharing, emergency contacts, photos, chat messages, payment references (UPI ids/claims), device/push tokens, crash data, analytics, verification documents, and ratings/reviews.
2. Diff the inventory against the dossier's *Data safety* table (§4) and the privacy policy. List every mismatch.

### 15.B — Legal (owner decides; agent drafts)
3. Update `legal/privacy-policy.md` and the related documents so they match the inventory exactly: purposes, third parties, retention, user rights, deletion, grievance officer contact, and where data is stored and processed.
4. **Owner:** have a qualified lawyer review the documents for India's Digital Personal Data Protection Act and IT Rules obligations (consent notice, purpose limitation, grievance redressal, children's data, breach handling) and for Play policy. Record the reviewer and date in `legal/README.md`. The agent must not claim legal compliance.
5. Confirm in the app:
   - the terms acceptance screen links to the current docs (`/legal/:slug`);
   - account deletion is reachable in-app;
   - a **web** deletion-request URL exists (Google Play requires one). Check `legal/account-deletion.md` and route `/legal/account-deletion`, and check it's reachable signed-out.

### 15.C — Play Console (owner in the console; agent prepares text and evidence)
6. **Update the dossier** so it matches D2 and the inventory:
   - the background location answer: Yes, only if D2 ships delivery runs, with a demo video;
   - the Data safety rows;
   - the permissions list (compare with `AndroidManifest.xml`).
7. **App access for reviewers:** a dedicated reviewer account on production, using a test OTP number from P05 step 13 with no admin rights. Write exact sign-in steps in the dossier. The OTP value goes only into the Play Console field, never into the repo.
8. **Owner** completes in Play Console:
   - store listing (from `STORE_LISTING.md` and `playstore-assets/`);
   - content rating questionnaire;
   - target audience;
   - ads (none);
   - financial features declaration (the app records UPI payment claims between users and doesn't process payments; answer accordingly);
   - Data safety;
   - privacy policy URL;
   - account deletion URL;
   - app access.
9. **Build:** the AAB comes from the `android-release.yml` artifact of the release commit. Confirm `versionCode` is higher than any previously uploaded build.
10. **Tracks:**
    1. **Internal testing** (owner and team): install from Play; run the P13 checklist "install and first run", "push" and "dialing" sections on a production-signed build.
    2. **Closed testing**, if D11 requires it: ≥12 testers opted in for 14 continuous days. Track tester feedback as `QA-` ledger rows and fix via P09.
    3. **Apply for production access** when eligible.

### 15.D — Web launch (agent)
11. **Public pages:**
    - `<title>`, meta description, Open Graph/Twitter tags for home and public business/provider/place pages;
    - `robots.txt` and a sitemap for public pages, if D1/owner wants search indexing;
    - a real 404;
    - legal links in the footer or settings.
12. Confirm Vercel analytics and speed insights are covered in the privacy policy (15.B).

### 15.E — Go / No-Go (owner decides from agent evidence)
13. The agent writes `docs/launch/GO_NO_GO.md` with **fresh evidence** (commands run that day) for each finish-line gate in `docs/plan/README.md` §1:

    | # | Gate | Evidence |
    |---|---|---|
    | 1 | Ledger | `node scripts/gaps/ledger-summary.mjs`: 0 OPEN; deferred rows listed with decision ids |
    | 2 | Flows | `npm run e2e` ×3 green; `grep -rn test.fixme tests/e2e` empty |
    | 3 | Devices | P13 results files |
    | 4 | Release gate | Latest CI run green; branch protection JSON |
    | 5 | Security | Advisor output (only accepted findings); P05 audit docs |
    | 6 | Dependencies | `npm audit --omit=dev` |
    | 7 | Rebuildable | Staging vs production snapshot diff |
    | 8 | Operations | Uptime monitors, Sentry test event, latest backup log line, rollback drill |
    | 9 | Language | `npm run check-strings`; reviewer sign-off |
    | 10 | Store and legal | Play production access, lawyer review date |

    Any gate without evidence → **No-Go**.
14. **Owner** signs Go (name, date) in the file.

### 15.F — Launch and watch
15. Release, following `docs/ops/RUNBOOK_RELEASE.md`:
    - PR `develop` → `main` (owner approves);
    - verify the OTA manifest and bundle, stryt.in and the Android artifact;
    - in Play Console, promote to **production with a staged rollout**: 10% → 50% → 100%, at least 24 h between steps if error rates stay normal.
16. **Watch for 72 hours:**
    - Sentry error rate and new issues;
    - uptime;
    - Supabase logs and advisor;
    - cron checks;
    - Play pre-launch report and Android vitals (crash rate, ANR rate);
    - support inbox.

    Log observations twice daily in `docs/launch/LAUNCH_LOG.md`.
17. **Rollback triggers** (decided in advance): crash-free sessions < 99%; any data exposure; sign-in or booking broken for any user group → halt the rollout and follow `RUNBOOK_ROLLBACK.md`.
18. After 72 h stable: set every phase to Done, record the launch in `docs/database/HANDOFF.md` and `README.md`, and schedule the first post-launch review of deferred (D17+) items.

## Verification
| Check | Expected |
|---|---|
| `docs/launch/DATA_INVENTORY.md` vs Data safety vs privacy policy | 0 mismatches |
| Web deletion URL (signed-out `curl`) | 200, with deletion instructions |
| `docs/launch/GO_NO_GO.md` | All 10 gates with same-day evidence; owner Go signature |
| Play Console | Production release live (owner screenshot) |
| `docs/launch/LAUNCH_LOG.md` | 72 h of entries; no rollback trigger hit (or rollback executed per runbook) |

## Definition of Done
- [ ] Data inventory, declarations and legal documents consistent; lawyer review recorded.
- [ ] Internal and closed tests completed as required; production access granted.
- [ ] Go/No-Go signed with same-day evidence for all 10 gates.
- [ ] Staged rollout to 100% on Play, and stryt.in live.
- [ ] 72-hour watch logged, with no unresolved launch incident.

## Stop and ask if
- Any gate lacks evidence on launch day.
- Play review rejects the app. Paste the exact rejection text; don't guess at fixes.
- The inventory reveals data collection the privacy policy doesn't cover.

## Checker checklist
- Re-run every command in GO_NO_GO.md on the launch day and compare.
- Open stryt.in signed-out: legal links work, and the deletion URL is reachable.
- Confirm the Data safety answers (owner screenshot) match DATA_INVENTORY.md row by row.
