# Launch Fix Plan

**Created:** 2026-08-02
**Closes:** [ANDROID_LAUNCH_BLOCKERS.md](ANDROID_LAUNCH_BLOCKERS.md)
**Status: PHASES 1–3 EXECUTED 2026-08-02.** Phase 4 deferred by decision,
Phase 5 (device testing) is yours and remains the only thing gating upload.

## Executed

| Step | Outcome |
|------|---------|
| 1.1 | Battery prompt moved off push-registration → `promptBatteryExemptionForDuty()`, fired only when an agent goes **on duty**. Copy rewritten to the run-tracking justification. Guard is now per-agent, not per-install. |
| 1.2 | 3 production logs wrapped in `import.meta.env.DEV` — FCM payload, `{aptId, action, paymentStatus}`, OTA lifecycle. **0 unguarded `console.log` left in `src/`.** |
| 2.1 | `anon` revoked on `has_business_scope` / `has_business_full_access`; `authenticated` retained. Verified live: `anon=false, authenticated=true`. |
| 2.2 | `claim_first_admin` — rejects unauthenticated callers, `pg_advisory_xact_lock` serialises the claim, and the no-admin condition is re-asserted inside the UPDATE. Revoked from `anon`. |
| 2.3 | Both inline `onerror=` handlers gone (**0 inline handlers in `src/`**); CSP flipped to enforcing with a corrected `connect-src`. |
| 3.1 | `0.1.24` → `1.0.0`, verified baked into the built bundle. |

**Migration:** `20260878_launch_security_hardening.sql`, applied and verified.

**Verification:** `tsc` clean · `eslint` 0 errors · 127/127 tests · build clean.

### Two things execution caught

1. **Enforcing the CSP as written would have broken production.** `connect-src`
   was missing `tiles.openfreemap.org` (the free-map fallback added earlier this
   session), `nominatim.openstreetmap.org` (reverse geocoding — every location
   name in the app), `overpass-api.de` (still live in `geocode.ts`) and
   `api.stryt.app`. All four now allowed; `worker-src`/`manifest-src` added
   explicitly for the service worker and PWA manifest.
2. **The inline handlers were an injection vector, not just a CSP nuisance.**
   `authorName` was interpolated unescaped into `alt="…"` inside
   `dangerouslySetInnerHTML`, so a name containing a double quote could break
   out of the attribute. Converting to JSX (`StoryAvatar`) fixes the escaping
   and the CSP problem together. `storyIconHtml()` in `mapIcons.ts` turned out
   to be dead code carrying the same flaw — deleted.

Checked and cleared: Razorpay checkout is **not** loaded client-side (payments
are UPI deep-link only) and there is no dynamic script injection anywhere, so
`script-src 'self'` is safe.

---

## Decisions taken

| # | Question | Decision |
|---|----------|----------|
| D1 | Battery permission | **Gate to delivery agents** — see §0, this changed on evidence |
| D2 | CSP | Remove the inline handlers, then enforce |
| D3 | Version | Bump to `1.0.0` |
| D4 | minify/shrink | **Not now** — deferred, needs ProGuard rules + a device pass |

---

## 0. Why the battery decision changed

You asked what Zepto, Blinkit, Zomato and Dunzo do. The important part isn't a
manifest flag — it's their **app architecture**:

> Those companies ship **two separate apps**. "Zomato" and "Zomato Delivery
> Partner", "Swiggy" and "Swiggy Delivery Partner", "Blinkit" and its partner
> app — separate Play listings, separate manifests, separate review.

All the heavy permissions — background location, foreground service, battery
exemption, OEM autostart nagging — live in the **rider app**, which is
distributed to a small vetted population who expect it. The consumer app carries
none of it, so it never faces this review problem.

STRYT is one app carrying customer, business owner **and** delivery agent. So it
currently asks **every customer** for a rider-grade permission — and the prompt
fires on first push registration ([pushNotifications.ts:52](../../src/lib/pushNotifications.ts#L52))
with copy that says *"Keep notifications reliable."* That framing is the single
weakest justification available: notification delivery is explicitly **not** on
Google's allowlist for `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.

For an **active rider** the case is defensible, and rider apps do get approved
with it. So the fix is to mirror the rider-app pattern *inside* the single app:
ask only the people who are actually doing rider work.

**Honest caveat:** I can't inspect those companies' manifests, and I'm not going
to claim what's in them. The separate-app structure is publicly observable from
their Play listings; the permission specifics are inference from Google's
published policy, not from their binaries.

---

## Phase 1 — Play review risk

### 1.1 Re-scope the battery prompt to delivery agents

| | |
|---|---|
| Files | `src/lib/pushNotifications.ts`, `src/components/BatteryOptimizationSheet.tsx`, `src/screens/delivery/DeliveryConsole.tsx` |
| Keep | The permission, the Java plugin, the sheet |

- **Remove** the trigger from push registration. No customer ever sees it.
- **Add** the trigger when an agent goes **on duty** or accepts a run — the
  moment the app genuinely needs to survive Doze.
- **Rewrite the copy** from "Keep notifications reliable" to the real reason:
  the shop and the customer need your location to keep updating until the run is
  finished. That sentence is also what goes in the Play Console justification.
- Keep the once-per-install guard, but key it per *agent*, not per install.

**Why this is the whole game:** it converts an indefensible request into a
defensible one, and removes it from ~100% of your users.

### 1.2 Strip production log leaks

| File | Line | Leak |
|------|------|------|
| `src/lib/pushNotifications.ts` | 64 | full FCM notification payload |
| `src/screens/provider/manage/ProviderDashboard.tsx` | 219 | `{aptId, action, paymentStatus}` |

Wrap both in `import.meta.env.DEV`. `nativeApp.ts:53` is an OTA lifecycle log —
low value in production, same treatment.

---

## Phase 2 — Security hardening

### 2.1 Narrow the `anon` grant on the RLS helpers

Migration. `20260870` granted `has_business_scope` and
`has_business_full_access` to `authenticated, anon`. `authenticated` is required
(RLS evaluates them as the calling role, and without it owners get *permission
denied for function*). `anon` is not.

Today an anonymous caller can probe *"does user X hold scope Y on business Z"* —
information disclosure, not a breach.

```
revoke execute on function public.has_business_scope(text,text,text) from anon;
revoke execute on function public.has_business_full_access(text,text) from anon;
```

**Verify after:** an owner can still update their business, and a public
(logged-out) business page still loads. Both exercise these predicates through
RLS. This is the one change here that can break a working path, so it gets a
rolled-back transaction test before it's applied for real.

### 2.2 Harden `claim_first_admin`

Currently safe only because one admin exists. Add an explicit
`if auth.uid() is null then raise` and re-check the admin-exists test inside the
same statement, so the "no admins" window can't be raced.

### 2.3 CSP: remove inline handlers, then enforce

1. `src/screens/MapView/mapIcons.ts` and `MapMarkers.tsx` build marker HTML
   strings containing `onerror="this.style.display='none'"`. Inline event
   handlers are blocked by CSP without `'unsafe-inline'` in `script-src`.
   Replace with a real `error` listener attached after render, or render the
   avatar as a React `<img onError>` instead of an HTML string.
2. Then flip `Content-Security-Policy-Report-Only` →
   `Content-Security-Policy` in `vercel.json`.

**Order matters.** Flipping first breaks story avatars on the map.

**Not a Play gate** — this is web-only. It ships with the same release but it
isn't what's holding the Android submission.

---

## Phase 3 — Release prep

### 3.1 Version → `1.0.0`

`package.json`. Flows automatically into the Android `versionName`,
`__APP_VERSION__`, and the capgo OTA manifest. `versionCode` stays CI-driven
from `github.run_number`, so nothing else changes.

Do this **last**, after the code changes, so the version marks the actual
release commit.

---

## Phase 4 — Deferred, with reasons

| Item | Why not now |
|------|-------------|
| `minifyEnabled` / `shrinkResources` | Needs ProGuard keep-rules for Capacitor plugins, `@capgo/*` (reflection) and Firebase. Breakage is **runtime-only** — it builds fine and crashes on device. Not something to land in the same push as a launch. |
| TMA-007 (grant audit trail) | Real gap, no user impact at this scale (4 businesses). Post-launch. |
| DLV-009 (unassigned-delivery queue) | Works today at current volume; matters before SLA timers or auto-dispatch. Post-launch. |
| Feedback #9 | Unreproducible — 0 pending submissions. Needs one real business submitted. |
| Feedback #12 | Believed already correct; needs 30 seconds of your confirmation. |
| Feedback #17 (full sweep) | Two global defects fixed. Per-screen enumeration needs devices — folds into Phase 5. |

---

## Phase 5 — The actual blocker: device testing

None of the above is what stops you shipping. **Nothing from this entire session
has run on an Android device.**

Run on a real phone, release build, before upload:

- [ ] Fresh sign-up — confirm the greeting is a name/alias, never an email
- [ ] Book an appointment end to end
- [ ] Delivery run: accept → en route → arrived → handoff code → delivered
- [ ] **"Can't deliver"** → confirm you can then go off duty
- [ ] Battery prompt appears **only** on going on duty, never at sign-up
- [ ] My People: first tap shows the explainer, second tap starts, FGS notification visible
- [ ] Background the app 10 min with a run active — location still posting
- [ ] Delete a test business
- [ ] Map: pins tappable one-handed, popup closes when its layer is toggled off
- [ ] Deploy twice to Vercel and confirm the second lands **without** a manual refresh (the SW fix)

---

## Sequence

```
1.1  battery re-scope        ← biggest review risk, do first
1.2  log leaks
2.1  anon grant  (migration + rolled-back verification)
2.2  claim_first_admin       (migration)
2.3  inline handlers → CSP enforce
3.1  version 1.0.0
5    device pass             ← gate to upload
```

Phases 1–3 are code and I can do them now. Phase 5 needs you and a phone.
