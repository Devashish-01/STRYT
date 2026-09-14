# Play Console — App access (copy/paste)

**App:** STRYT · `in.stryt.app`
**Console location:** App content → **App access**
**Prepared:** 4 August 2026

> ⏸ **v1.0 STATUS: delivery is deferred.** `DELIVERY_AGENT_ENABLED` is `false`
> for this submission — `/delivery`, the "Deliveries" console tab, and every
> other delivery entry point are unreachable in this build. **Only sections
> 1-3 below apply to this submission; section 4 is kept for v1.1 and marked
> ⏸ DEFERRED.**

Play rejects submissions where review cannot reach a declared feature. STRYT
gates almost everything behind sign-in and gates consoles behind roles a
new account does not have, so this form is not optional — answer
**"All or some functionality is restricted"** and fill in the table below.

---

## ⚠️ Read this before you fill anything in

**Google is currently the only sign-in method.** `src/screens/auth/PhoneEntry.tsx`
says so in a comment — phone and email OTP are hidden for launch. That means the
reviewer must sign into a **real Google account you hand them**, and that is the
single most fragile part of this submission:

- **Turn 2-Step Verification OFF** on the review account. A reviewer signing in
  from a Google datacentre IP cannot pass a phone challenge, and "couldn't log
  in" is an instant rejection.
- Sign into the account **once yourself, on a physical device**, before you
  submit. A brand-new Google account signing in from an unfamiliar device is
  exactly what Google's own risk checks block.
- Do not use a personal account. Make a dedicated one.

If review bounces on login, the fastest fix is re-enabling email OTP — not
arguing with the reviewer.

---

## The form

**Are any parts of your app restricted?** → **All or some functionality is
restricted**

Add one instruction set per role. Play allows several; use them — a single
customer login will not show a reviewer the business features they must
assess for the background-location declaration.

---

### 1. Customer (baseline)

| Field | Value |
|---|---|
| Instructions name | `Customer — standard account` |
| Username | `<review-customer@gmail.com>` |
| Password | `<password>` |
| Any other instructions | see below |

```
Sign-in is Google-only. On the welcome screen tap "Continue with Google" and
choose the account above (it is already added to the test device / add it via
the Google account picker).

This account has completed onboarding, so it lands directly on Home. From there:
- Explore  — browse nearby businesses and providers on the map
- Book      — open any business → Book → pick a slot
- My People — the live-location-share feature (see instruction set 3)
- Account → Delete account — the in-app deletion flow

No purchase is required anywhere in the app. STRYT processes no payments.
```

---

### 2. Business owner console

| Field | Value |
|---|---|
| Instructions name | `Business owner — manage console` |
| Username | `<review-business@gmail.com>` |
| Password | `<password>` |

```
Sign in as above. This account already owns a verified demo business, so no
onboarding or KYC upload is needed.

Account → switch to the business, or open Home → the business card → "Manage".
Console sections: Catalog, Hours, Queue, Appointments, Q&A, Inbox.
(Deliveries is not shown in this build — see the status note at the top of
this file.)

Note: the business console asks for a business password on entry. It is:
    <business password>
```

> Set this up **before** submitting: the business/provider consoles are behind a
> separate password (`users.business_password_hash`). A reviewer who cannot get
> past it will report the feature as broken.

---

### 3. Background location — live share (REQUIRED for the sensitive-permission review)

| Field | Value |
|---|---|
| Instructions name | `Background location — My People live share` |
| Username | `<review-customer@gmail.com>` |
| Password | `<password>` |

```
This is the feature the ACCESS_BACKGROUND_LOCATION declaration covers.

1. Sign in as the customer account. It already has one emergency contact saved.
2. Home → the My People (people) icon.
3. An in-app disclosure appears BEFORE any system dialog, stating that location
   is collected even when the app is closed or not in use, and naming exactly who
   receives it. Tap Continue.
4. Grant location "Allow all the time", and notifications if prompted.
5. A persistent "STRYT live location" notification appears while sharing.
6. Lock or background the device — the chosen contact keeps seeing live position.
7. Stop from the in-app banner, or My People → Stop sharing.

The share ends when the user stops it. Location is never collected in the
background at any other time.
```

---

### 4. Background location — delivery run (the second use of the same permission)

> ⏸ **DEFERRED to v1.1 — do not add this instruction set to this submission.**
> `/delivery` redirects to `/home` with the flag off, so a delivery test
> account has nothing to show a reviewer right now. Kept below so it's ready
> to re-add when delivery ships.

| Field | Value |
|---|---|
| Instructions name | `Background location — delivery run` |
| Username | `<review-delivery@gmail.com>` |
| Password | `<password>` |

```
The same permission also serves delivery tracking, so it is declared for both.

The delivery console is gated by an active "delivery" grant issued by a business
(RequireDeliveryAgent) — this account already holds one, so /delivery is
reachable straight after sign-in.

1. Sign in. Account → Delivery, or open stryt.in/delivery.
2. Toggle ON DUTY. The same background-location disclosure appears first.
3. Android only: a sheet then explains why STRYT asks to skip battery
   optimisation — it is shown ONLY to a delivery agent going on duty, never to a
   customer, and it can be declined without blocking the run.
4. Accept the pre-seeded test order → En route → Arrived → Handoff.
   "Can't deliver" is also available at any point.
5. Go OFF DUTY to stop location reporting.

While a run is active the shop and that order's customer can follow the agent's
position on a map. Nobody else can.
```

---

### 5. Admin console — do NOT declare this

`/admin/login` exists and uses an admin login ID + password. **Leave it out of
App access.** It is internal staff tooling, not user-facing functionality, and
handing a reviewer credentials to a console that can force-delete accounts and
grant roles is an unnecessary risk. If review ever asks about the route, answer
that it is internal-only and gated to STRYT staff.

---

## Pre-submission checklist for the review accounts

- [ ] Two Google accounts created, **2FA off**, each signed into once on a real device
- [ ] Customer account: onboarding completed, at least one emergency contact saved
- [ ] Business account: owns a demo business, business password set and written above
- [ ] ⏸ DEFERRED to v1.1: delivery account holding an active grant, one order queued
- [ ] Every password in this file replaced with the real value **before** pasting into the Console
- [ ] Demo data is safe to be screenshotted by a stranger — no real customer names, numbers, or addresses

> Keep the filled-in copy of this file **out of git**. The version in the repo is
> a template with placeholders; do not commit real credentials.
