# Owner decisions

Agents must not guess any of these. Phase P00 gets them answered. A phase that depends on an unanswered decision must stop.

Fill in **Answer** and **Date**. The recommendation is a suggestion, not a decision.

| ID | Question | Options | Recommendation | Answer | Date |
|---|---|---|---|---|---|
| **D1** | Which platforms launch publicly now? | a) Android + web · b) Android + web + iOS | **a)** The iOS project was last touched 2026-07-26 and has never been release-tested. | a) Android + web (defer iOS to a later release) | 2026-09-14 |
| **D2** | Are delivery runs (rider console, batch dispatch, live rider GPS) in the public v1.0? And is background location declared to Google Play? | a) Defer delivery runs to v1.1: hide the rider console, don't declare background location · b) Ship in v1.0 with a background-location declaration (needs a demo video and Play review) | **a)** `docs/launch/ANDROID_LAUNCH_BLOCKERS.md` already defers them, but the Play dossier currently answers "Yes" to background location. The two must match. | a) Defer delivery runs to v1.1: hide rider console, do not declare background location for delivery | 2026-09-14 |
| **D3** | The 13 shelved screens in `src/screens/future-enhancement/` (Wallet, Subscriptions, Leaderboard, …) | a) Delete (git history keeps them) · b) Keep | **a)** | a) Delete (git history keeps them) | 2026-09-14 |
| **D4** | The 26 `#fff` / greyscale hex findings across 15 files | a) Accept the whitelist in `scripts/check-hardcoded-colors.js`; close them as `NOT_A_BUG` · b) Replace every one with tokens | **a)** | a) Accept whitelist in scripts/check-hardcoded-colors.js; close as NOT_A_BUG | 2026-09-14 |
| **D5** | How do team-negotiated proposals attribute ownership in `agreements`? (`AGREEMENT_NEGOTIATION` A1) | a) Resolve through the `proposals` join (no schema change) · b) Add `responder_type` / `responder_entity_id` columns | **a)** | b) Add responder_type / responder_entity_id columns to the agreements table | 2026-09-14 |
| **D6** | Staging project | a) Restore the inactive project `wqfxnmvopnpgkcbpedbu` ("STRYT", ap-south-1) · b) Create a new free project `stryt-staging` in ap-northeast-1 (same region as production) | **b)** Same region and Postgres version as production. If the free-project limit blocks it, delete the inactive project first (irreversible, owner only). Record the staging ref here. | b) Create new free project stryt-staging in ap-northeast-1 (ref: laswruzdyqehziyupmdm) | 2026-09-14 |
| **D7** | How the database becomes rebuildable (HANDOFF W2 R3) | a) Official baseline dump + migrations after its cutoff · b) Hand-write migrations for all 48 missing tables | **a)** | a) Official schema baseline dump + migrations after its cutoff | 2026-09-14 |
| **D8** | Database access for CI drift checks | a) Least-privilege role `ci_readonly`, connection string in a GitHub secret · b) Personal access token in a GitHub secret | **a)** A personal access token gives full control of the whole Supabase account. | a) Dedicated least-privilege role ci_readonly (connection string in GitHub secret) | 2026-09-14 |
| **D9** | Translations | Who reviews Hindi and Marathi? Does the admin panel stay English-only? | Name a native reviewer for each language; admin panel English-only. | Admin panel English-only; Owner (Devashish) will review Hindi and Marathi translations | 2026-09-14 |
| **D10** | Error monitoring | a) Sentry free tier, with personal-data scrubbing · b) None | **a)** | a) Sentry free tier, with personal-data scrubbing | 2026-09-14 |
| **D11** | Google Play developer account | Personal or organisation? If personal and created after 13 Nov 2023, production needs a closed test with ≥12 testers for 14 days. Who are the testers? | Confirm the account type and list the testers early; the 14 days is the longest wait in the plan. | Personal account created after Nov 13, 2023 (Owner will recruit 12+ testers from personal/business network for the 14-day test) | 2026-09-14 |
| **D12** | The 28 one-off database scripts left untracked in `scripts/` (W2–W7) | a) Move to `scripts/archive/db-work-2026-09/` and commit · b) Delete | **a)** Several are cited in `docs/database/`. | a) Move to scripts/archive/db-work-2026-09/ and commit | 2026-09-14 |
| **D13** | The uncommitted Android changes, Play Store assets and the 2026-09-11 docs | a) Verify and commit; move store screenshots and the feature graphic out of `public/` · b) Discard | **a)** Everything in `public/` ships inside every web deploy and OTA bundle. | a) Verify and commit; move store screenshots and feature graphic out of public/ | 2026-09-14 |
| **D14** | Email sign-in (enabled; used by the admin login) and OTP abuse protection | a) Keep email for admin only; turn on leaked-password protection; add CAPTCHA (Cloudflare Turnstile or hCaptcha) to phone-OTP sending and admin login · b) Leave as is | **a)** Unprotected OTP sending invites SMS-pumping costs on Twilio. | b) Leave auth settings as is (no CAPTCHA, standard OTP sending) | 2026-09-14 |
| **D15** | Release cadence during P09 | a) Release to users after every 2–3 finished domains · b) One big release at the end | **a)** Smaller releases are easier to roll back. | a) Release to users after every 2–3 finished domains | 2026-09-14 |
| **D16** | Leaflet and MapLibre are both used for maps | a) Keep both, lazy-loaded · b) Consolidate to one (large refactor) | **a)** for v1.0; revisit later. | a) Keep both, lazy-loaded for v1.0; revisit later | 2026-09-14 |

---

## Decision Notes & Evidence

* **D1 (Platforms)**: iOS target has no active provisioning profiles, push certificates, or device validation (`ios/` last updated July 2026). Web (`stryt.in`) and Android (`android/`, Capacitor 8, targetSdk 36) are the release targets.
* **D2 (Delivery Runs & Location)**: Delivery dispatch & rider duty are toggled off via `DELIVERY_AGENT_ENABLED` in `src/lib/features.ts`. Battery optimization exemption is commented out in `AndroidManifest.xml`. Background location will not be declared for delivery to avoid rejection.
* **D3 (Future Enhancement Screens)**: The 13 screens in `src/screens/future-enhancement/` are unlinked stubs. Removing them reduces bundle size and eliminates dead code; git history preserves all components.
* **D4 (Hardcoded #fff)**: `scripts/check-hardcoded-colors.js` explicitly whitelists pure white/grayscale for SVG fills and alpha composites. Accepted as `NOT_A_BUG`.
* **D5 (Agreement Attribution)**: Owner selected Option b. New columns `responder_type` and `responder_entity_id` will be added to `agreements` in P04/P09 via an audited database migration.
* **D6 (Staging Project)**: Dedicated staging project — *correction 2026-09-15 (P06): the Management API reports region `ap-south-1`, not ap-northeast-1; Postgres 17.6, same extensions; no effect on the tests* — ref `laswruzdyqehziyupmdm` (`https://laswruzdyqehziyupmdm.supabase.co`).
* **D7 (Database Rebuildability)**: Baseline dump from production plus subsequent ordered migrations will establish reproducible staging and local environments (HANDOFF W2 R3).
* **D8 (CI Database Access)**: A least-privilege PostgreSQL role `ci_readonly` with SELECT permissions on system catalogs will be used in GitHub Actions.
* **D9 (Translations)**: Consumer-facing app strings in Hindi and Marathi will be reviewed by owner (Devashish). Admin dashboard remains English-only.
* **D10 (Error Monitoring)**: Sentry free tier integration with `beforeSend` personal-data scrubber to monitor production runtime crashes.
* **D11 (Google Play Account)**: Personal account created post-Nov 2023. Owner will run a closed test with 12+ testers for 14 days before submitting for public release.
* **D12 (Database Audit Scripts)**: Untracked scripts from W2–W7 will be moved to `scripts/archive/db-work-2026-09/` to maintain audit trail while cleaning up root.
* **D13 (Store Assets)**: Screenshots and feature graphic in `public/` will be moved to `playstore-assets/` to keep web and OTA bundles lightweight.
* **D14 (Auth Settings)**: Owner chose Option b. Current Supabase Auth configuration remains as is for v1.0.
* **D15 (P09 Release Cadence)**: Incremental releases every 2–3 completed domains to minimize rollback risk.
* **D16 (Map Engines)**: Leaflet and MapLibre both remain in v1.0 via dynamic code-splitting (`React.lazy()`) to avoid large refactoring churn before launch.
