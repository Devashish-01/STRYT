# Play Console — Background location declaration (copy/paste)

Use this when Google Play asks you to declare **Background location**
(App content → Sensitive permissions → Background location access)
and when filling **Data safety**.

> ✅ **Decided 18 Sept 2026 — D19, option A.** Background location stays in v1.0 for **My People live
> share** and is declared with this page. Record the demo video with
> [`BACKGROUND_LOCATION_VIDEO_SCRIPT.md`](BACKGROUND_LOCATION_VIDEO_SCRIPT.md).

> ⏸ **v1.0 STATUS: delivery is deferred.** `DELIVERY_AGENT_ENABLED` is `false`
> for this submission (`src/lib/features.ts`) — the on-duty toggle, the
> `/delivery` console, and every path into it are unreachable in this build,
> and `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is commented out of the manifest
> because it would otherwise be a declared-but-unused permission. **Declare
> only My People below.** The delivery content further down is kept, not
> deleted, so it's ready to paste again for the v1.1 update — every block
> marked `⏸ DEFERRED` is not part of this submission.

You still must declare the use in Play Console yourself (it needs your developer account).

### What a reviewer will find in the build

Checked against the code on 18 Sept 2026. Three of these were wrong until that day, and a reviewer would
have seen each one.

| Play requires | STRYT |
|---|---|
| An in-app disclosure **immediately before** the system dialog, saying location is collected even when the app is closed or not in use | `BackgroundLocationDisclosure.tsx`, opened by `LiveShareProvider.tsx` **every time** background permission is not granted — `backgroundLocation.needsBackgroundDisclosure()` asks Android, it does not remember. *Fixed in `528763b`: it used to be shown once per install, so a user who denied the dialog was asked again with nothing in front of it.* |
| A persistent notification while location is collected | **"STRYT live location — Sharing your live location with My People until you stop. Open STRYT to stop sharing."** (`LIVE_SHARE_NOTICE`, `src/lib/backgroundLocation.ts`). *Fixed in `528763b`: it used to say "for active deliveries", a feature that is not in v1.0.* |
| User-initiated, and stoppable | Starts only when the user taps **Start sharing** (Account → My People) or the Home **My People** tile; after an app restart, only a share the user started and that has not expired is resumed. Stops on **Stop sharing**, on the live-share banner's **Stop**, or by itself 8 hours after it started. *Fixed on 18 Sept (P15-003): an expired share kept collecting location, and every launch resumed it.* |
| Only the people the user chose receive it | The user's emergency contacts. Each gets a live location card in their chat with the sharer. |

---

## 1. Background location access form

**Is background location access required for your app's core functionality?**
→ **Yes**

**Core functionality description — paste this for v1.0:**

```
STRYT uses background location for one user-initiated feature, behind its own
in-app disclosure and stoppable at any time.

My People live location share. A user shares their precise location with
contacts they explicitly choose, so those contacts can follow them on a map
until the user stops sharing. Location must keep updating while the app is
backgrounded or the screen is locked, which is the entire point of the
feature — a share that freezes when the phone locks does not work. A share
also ends by itself 8 hours after it starts.

Nearby discovery, maps and search use while-in-use location only. STRYT
stores a last known position, not a location history.
```

> ⏸ DEFERRED — v1.1 will need to declare a SECOND use once delivery ships:
> *"Delivery runs. A delivery agent who goes on duty and accepts an order
> reports position to the shop and to that order's customer for the duration
> of the run, so both can see where the order is. Reporting starts when the
> agent goes on duty and stops when they go off duty."* An undeclared second
> use of a sensitive permission is a rejection reason on its own — when
> delivery comes back, this form MUST be re-submitted with both paragraphs,
> not just re-using the v1.0 answer.

**Video link:** record it with [`BACKGROUND_LOCATION_VIDEO_SCRIPT.md`](BACKGROUND_LOCATION_VIDEO_SCRIPT.md),
upload to YouTube as **Unlisted**, and paste the link.

**Instructions for the reviewer** (paste if the form asks; the same steps are in `APP_ACCESS.md` §3):

```
1. Sign in with the customer account from App access. Its My People list
   already contains the second App access account.
2. Open Account -> My People and tap Start sharing.
3. Read the in-app disclosure "Allow location in the background?". It states
   that STRYT collects precise location even when the app is closed or not in
   use. Tap Continue.
4. Allow location, then choose "Allow all the time" (Android 11 and later open
   Settings for this). Allow notifications if asked.
5. Pull down the notification shade. A persistent notification reads
   "STRYT live location - Sharing your live location with My People until
   you stop."
6. Press Home or lock the phone. Signed in as the second account (another
   phone, or stryt.in in a browser), open the chat with the first: a live
   location card shows its position and keeps updating.
7. On the first phone, tap Stop on the live-share banner, or Account ->
   My People -> Stop sharing. The notification disappears. A share also ends
   by itself 8 hours after it starts.
```

> ⏸ DEFERRED — v1.1 delivery-run video script:
> 1. Sign in with the delivery test account provided in App access (it already
>    holds an active delivery grant).
> 2. Account → Delivery, and toggle ON DUTY.
> 3. The same in-app disclosure appears before the system dialog → Continue,
>    then grant "Allow all the time".
> 4. Accept the queued test order → En route → Arrived → Handoff.
> 5. Confirm the shop/customer view shows the agent moving.
> 6. Toggle OFF DUTY — location reporting stops.

> ⏸ DEFERRED — battery-optimisation prompt. Not reachable in v1.0 (its only
> call site, delivery's on-duty toggle, is unreachable — see status note
> above), and the permission itself is commented out of the manifest, so
> there's nothing for a reviewer to ask about this round. For v1.1: it's
> requested **only** from the delivery on-duty toggle
> (`promptBatteryExemptionForDuty()` in `src/lib/batteryOptimization.ts`,
> called from `DeliveryConsole.tsx`), never at launch and never for a
> customer. It exists because OEM battery managers on Xiaomi/Oppo/Vivo/Samsung
> kill the foreground location service mid-run. It can be declined and the
> run still works.

**Link to privacy policy:**
`https://stryt.in/legal/privacy-policy`

### 1b. Foreground service permissions — if Play Console lists it

The app targets API 36 and declares `FOREGROUND_SERVICE_LOCATION`: while a share is on, the
background-geolocation plugin runs a foreground service of type `location`. Google asks apps targeting
Android 14+ to declare their foreground service types on the App content page
([Play Console Help](https://support.google.com/googleplay/android-developer/answer/13392821)). If
**App content → Foreground service permissions** appears for this app, answer:

- **Type:** Location.
- **Task:** My People live location share. The user starts it, a persistent notification is shown the whole
  time, the user can stop it at any time, and it ends by itself after 8 hours.
- **If it were interrupted or deferred:** the contacts the user chose would stop receiving their location
  while the phone is locked — the moment the feature exists for.
- **Video:** the same link as §1.

---

## 2. Data safety (location)

**Superseded — use [`DATA_SAFETY.md`](DATA_SAFETY.md) in this folder.** It covers
location alongside every other data type, with the code that justifies each
answer. The two must agree: a location answer here that contradicts the Data
safety form is the kind of inconsistency review does notice.

Summary, so this page stands alone: precise **and** approximate location are
collected, **optional**, and **shared with other users the person chooses** —
live-share contacts for v1.0 (⏸ DEFERRED for v1.1: and the shop plus customer
during a delivery run). Never shared with advertisers or data brokers.
Purpose: App functionality.

---

## 3. After declaring

1. Build a new AAB (CI: Android release workflow, or local `bundleRelease`).
2. Upload to an internal/closed testing track first.
3. Ensure the build’s permission list includes `ACCESS_BACKGROUND_LOCATION` and
   `FOREGROUND_SERVICE_LOCATION`.
