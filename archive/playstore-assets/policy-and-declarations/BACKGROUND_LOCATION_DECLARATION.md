# Play Console — Background location declaration (copy/paste)

**Updated 2026-11-16.** The app keeps both My People live sharing and delivery tracking. Google's background-location
form asks for **one** representative feature and a video of that feature. This submission uses delivery tracking;
the in-app disclosures, privacy policy and App access instructions still describe both uses. See
[`BACKGROUND_LOCATION_VIDEO_SCRIPT.md`](BACKGROUND_LOCATION_VIDEO_SCRIPT.md).

Where: **App content → Sensitive permissions → Background location access**, and — if the Console shows it —
**Foreground service permissions** (location). That separate form may ask about both uses; use the foreground-service
description below. Do not paste the two-use description into the background-location form.

STRYT already shows an in-app prominent disclosure before the system permission dialog
(`src/features/live-share/BackgroundLocationDisclosure.tsx`), used by both features:
`useLiveShare` (My People) and `DeliveryTrackingRunner` (delivery). It states the data, that it is collected
**even when the app is closed or not in use**, and why.

---

## 1. Background location access form

**Is background location access required for your app's core functionality?** → **Yes**

**Core functionality description — paste this:**

```
STRYT uses background location while an assigned delivery partner is actively
delivering an order for a local shop. The partner starts tracking from the
delivery screen after an in-app disclosure and Android's permission prompt. A
persistent notification remains visible. The shop sees the partner's current
position and the customer receives an estimated arrival time, not the partner's
coordinates. Partners travel with the phone locked or the app in the background;
foreground-only location would stop the shop's live view and the arrival estimate.
Tracking stops when the delivery ends or is cancelled. Only the latest position
is stored and it is erased when the delivery ends.
```

**Foreground service (location) — if asked what it is used for, paste:**

```
A foreground service of type "location" keeps a persistent notification visible
and keeps location updates running while (a) a user is live-sharing their
location with their chosen contacts, or (b) a delivery partner has a delivery
under way. It runs only in those two cases and stops when they end.
```

**Video instructions for the reviewer (paste):**

```
The video demonstrates delivery tracking, the single feature named in this
declaration. Sign in as the Delivery partner account (App access instruction 3)
with a prepared order already assigned. Open Assigned -> "Picked up from shop" ->
"Start delivery". Show the in-app disclosure before Android's permission prompt,
grant "Allow all the time" (on Android 11+, through app-location settings), show the persistent "STRYT Live Tracking"
notification, and background or lock the phone. On a second device signed in as
the Shop owner, show Orders -> Deliveries -> Live board updating. The recording
steps are in BACKGROUND_LOCATION_VIDEO_SCRIPT.md.
```

**Link to privacy policy:** `https://stryt.in/legal/privacy-policy` (section 3.8 for live share, 3.12 for delivery).

---

## 2. Battery optimisation — no restricted permission is used

STRYT does **not** declare `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (Google restricts it to a short allowlist that
delivery tracking is not on). A delivery partner who goes on duty on Android is shown a sheet that explains why
and opens the phone's own battery settings page (`Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS`, which
needs no permission) so they can choose "Don't optimise". It is shown only to a delivery partner, never to a
customer, can be declined, and the delivery still works if it is. If the Console ever asks about the permission:
it is not requested.

---

## 3. Data safety (location)

Use [`DATA_SAFETY.md`](DATA_SAFETY.md) — the form answers do not change for delivery. Summary so this page
stands alone: precise **and** approximate location are collected, **optional**, shared only with other users the
person chooses or is working with (live-share contacts; the shop a delivery partner delivers for), never with
advertisers or data brokers. Purpose: App functionality. The two must agree with this page and with privacy
policy §3.8 and §3.12.

---

## 4. After declaring

1. Build a new AAB (CI: the Android release workflow publishes it as the `stryt-playstore-aab` artifact).
2. Upload it to the closed testing track.
3. The build's permission list includes `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION`, and does
   **not** include `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — Play Console's "Permissions" view of the uploaded
   bundle shows this; check it before submitting.
