# Moving STRYT's Google project to another account

**Written:** 2026-09-30
**Current project:** `zetax-52843` · project number `44008185482` · Android package `in.stryt.app`

---

## Read this first — you probably do not need to migrate

"I have a Google ID with a Blaze plan" and "my project must move to that account" are two different
things, and people conflate them constantly.

**Blaze is a property of the _billing account_, not of the project and not of the email.** A billing
account can be linked to any project, no matter who owns it. So if the only goal is Blaze features, the
whole job is:

> Google Cloud Console → Billing → link the new account's billing account to `zetax-52843`.

Nothing else changes. Same project id, same OAuth clients, same FCM sender, no rebuild, no downtime.

You only need the rest of this document if you also want the **new Google account to own and administer
the project** — because a different person is taking it over, or you are consolidating accounts.

Those two jobs are independent. You can do either, both, or the billing one alone.

---

## What STRYT actually uses Firebase for

Worth knowing, because it is much less than most projects and that makes this easy:

| Product | Used? | Notes |
|---|---|---|
| **Auth** | ✅ | Google sign-in only. Firebase does the sign-in, returns an ID token, and `supabase.auth.signInWithIdToken()` exchanges it. Firebase never holds the session. |
| **Cloud Messaging (FCM)** | ✅ | Push. Sent from the Supabase edge function `send-push` using a service account with the `firebase.messaging` scope. |
| Firestore | ❌ | Supabase Postgres |
| Firebase Storage | ❌ | Supabase Storage |
| Hosting | ❌ | Vercel |
| Cloud Functions | ❌ | Supabase Edge Functions |
| Crashlytics / Analytics / Remote Config | ❌ | not wired |

Two products. That is the entire surface.

---

## Option A — transfer ownership (recommended)

A Firebase project **is** a Google Cloud project. Ownership is IAM, so this is done in the Cloud Console
and Firebase follows automatically. The project id never changes, which is why nothing breaks.

### A1. Give the new account Owner

1. Google Cloud Console → select project **`zetax-52843`**
2. **IAM & Admin → IAM → Grant access**
3. New principal: the new Google account
4. Role: **Owner**
5. Save, then have the new account accept the emailed invitation

The new account now has full admin, including Firebase Console.

### A2. Link the Blaze billing account

1. Cloud Console → **Billing → Link a billing account**
2. Pick the new account's billing account (the one on Blaze)
3. Confirm in **Firebase Console → ⚙ → Usage and billing** that the plan reads **Blaze**

### A3. Move the project into the new Organization *(only if the new account has a Google Workspace org)*

Skip this on a personal Gmail — personal accounts have no organization.

If it does: **IAM & Admin → Settings → Migrate**, choose the destination organization. This needs
`resourcemanager.projects.move` on the source and Project Creator on the destination. Org policies can
override project settings afterwards, so re-check that Auth and FCM still work.

### A4. Remove the old owner — *last, and only after verifying*

Do **not** do this until §"Verify" below passes completely. Removing your own Owner role before the new
account is confirmed working can lock you out of your own project.

IAM → find the old account → remove the **Owner** role.

### What changes in the repo after Option A

**Nothing.** No new `google-services.json`, no new OAuth clients, no Supabase change, no rebuild.
That is the entire argument for this option.

---

## Option B — recreate the project under the new account

**Do not do this unless you have no choice.** Listed so the cost is explicit.

A new Firebase project means a new project number, and the project number *is* the FCM sender id.

| What breaks | Why |
|---|---|
| **Every existing push token** | FCM tokens are bound to the sender id. All of them (25 rows in `fcm_tokens` as of 2026-09-20) become invalid. Push stops silently — no error, messages simply never arrive. Users have to reinstall or re-register to get a new token. |
| **Google sign-in** | New OAuth client ids. Supabase → Auth → Google must be updated in the same breath, or `signInWithIdToken` rejects every attempt. Google is STRYT's only login method, so this locks everyone out. |
| **The Android build** | `google-services.json` is compiled into the APK. An OTA bundle cannot carry it — you need a new AAB and a Play release. |
| **The 14-day closed test** | If this lands mid-test, testers stop receiving push and the test is not representative. |

If you must: create the project, re-add the Android app with package `in.stryt.app` **and the release
keystore SHA-1**, download the new `google-services.json`, create the Web OAuth client, update Supabase
Auth, update `VITE_FIREBASE_*` in `.env` and Vercel, rebuild the AAB, and expect to lose push for
existing installs.

---

## Verify — after either option

Do all five. The first three are the ones that fail silently.

1. **Google sign-in, web** — sign out on stryt.in, sign in again. Confirms Firebase Auth + the Supabase
   token exchange still agree.
2. **Google sign-in, native** — same on a real device build.
3. **Push** — trigger a real notification and confirm it arrives on a device. This is the one most likely
   to be quietly broken, because nothing errors when a sender id stops matching.
4. **Firebase Console** shows the project under the new account, plan **Blaze**.
5. **Billing** — Cloud Console → Billing shows the project linked to the new billing account.

Then, and only then, do §A4.

### Timing

Do this in a quiet window. Traffic is about one signup every three days and three sign-ins a day, so
almost any hour qualifies — but **not** during the Play closed test's 14-day window if it has started.

---

## Two repo problems to fix while you are here

**1. `.gitignore` is not protecting the Google config files.**

`.gitignore` lines 42–45 list `google-services.json` and `client_secret_*.json`, but both files are
**already tracked**, and gitignore has no effect on a tracked file. So they are in the repo and will keep
being committed.

`android/app/client_secret_…json` was checked: it is an *installed*-type client config holding
`client_id`, `project_id` and endpoint URLs — **no `client_secret` field**. Nothing secret has leaked,
despite the filename. (`docs/launch/LAUNCH_REPORT.md` lists rotating it as an open item; that is worth
re-reading with this in mind.)

`google-services.json` is not a secret either — it ships inside every APK. Keeping it tracked is a
reasonable choice for reproducible builds. But decide deliberately:

```bash
# if you want them out of the working tree but kept in history:
git rm --cached android/app/google-services.json "android/app/client_secret_*.json"
```

**2. The old `client_secret_*.json` is probably dead weight.** It references an Android OAuth client.
Nothing in the codebase reads it — the app gets everything from `google-services.json` and the Firebase
web config. Confirm, then delete it.

---

## What Blaze actually gets you — honestly

Most "what Blaze unlocks" lists do not apply to STRYT, because **the backend is Supabase, not Firebase**.
Cloud Functions, Firestore scale, Firebase Storage quotas, Extensions — none of it is in the path.

### Worth adding, and free on Spark too

These would genuinely improve the app. None of them need Blaze, so do not wait for the migration.

| | What it fixes |
|---|---|
| **Crashlytics** | **The real observability gap.** `@sentry/react` runs inside the Capacitor WebView, so it catches JavaScript errors — but a crash in the native Java/Kotlin layer produces nothing at all. Right now those are invisible. Crashlytics covers exactly that. `client_errors` has had 0 rows in 24h while the app is in use, which is consistent with either "no errors" or "errors we cannot see". |
| **Remote Config** | `DELIVERY_AGENT_ENABLED` and `LANGUAGES_ENABLED` are compile-time constants, so flipping either needs a rebuild and a Play release. Remote Config makes them server-side switches — you could enable delivery for v1.1 without shipping a binary. |
| **App Distribution** | Getting builds to the 12 closed testers. Play's own closed track is what satisfies the 14-day requirement, but App Distribution is faster for the iteration before that. |
| **App Check** | Attests that requests come from your real app. Useful against the abuse surfaces already logged — the `anon`-writable `events` table, and enumeration of `leaderboard_points`. |

### Actually Blaze-gated

| | Relevant? |
|---|---|
| Cloud Functions for Firebase | No — Supabase Edge Functions already do this |
| Phone Auth in production | No — and it is being switched off deliberately |
| Firebase Extensions | No |
| Firestore / Storage beyond free quota | No — not used |
| Outbound networking from Functions | No |

**Honest summary:** Blaze buys you headroom and removes quota cliffs, not capability. For STRYT today its
practical value is that FCM and Auth will never hit a free-tier wall, and Cloud Functions are there if
the architecture ever changes. If Blaze is the only reason you were considering a migration, link the
billing account (§A2) and stop — that is the whole job.

---

## Order

1. §A2 — link the Blaze billing account *(if this is all you wanted, stop here)*
2. §A1 — grant the new account Owner
3. **Verify** — all five checks
4. §A4 — remove the old owner
5. §A3 — organization move, only if applicable
6. Repo cleanup, and consider Crashlytics
