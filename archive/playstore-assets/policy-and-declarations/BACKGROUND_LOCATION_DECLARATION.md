# Play Console — Background location declaration (copy/paste)

**Updated 2026-10-24 — delivery ships in this release**, so the declaration covers **two** uses of the one permission.
An undeclared second use of a sensitive permission is a rejection reason on its own; declare both, with one video
that shows both ([`BACKGROUND_LOCATION_VIDEO_SCRIPT.md`](BACKGROUND_LOCATION_VIDEO_SCRIPT.md)).

Where: **App content → Sensitive permissions → Background location access**, and — if the Console shows it —
**Foreground service permissions** (location). Use the same text and the same video link for both.

STRYT already shows an in-app prominent disclosure before the system permission dialog
(`src/features/live-share/BackgroundLocationDisclosure.tsx`), used by both features:
`useLiveShare` (My People) and `DeliveryTrackingRunner` (delivery). It states the data, that it is collected
**even when the app is closed or not in use**, and why.

---

## 1. Background location access form

**Is background location access required for your app's core functionality?** → **Yes**

**Core functionality description — paste this:**

```
STRYT uses background location for two features. Each has its own in-app
disclosure before the permission prompt, shows a persistent notification the
whole time it runs, and can be stopped by the user.

1. My People live share. A user shares their precise location with contacts they
   explicitly choose, so those contacts can follow them on a map until the user
   stops sharing (or after 8 hours). Location must keep updating while the app
   is in the background or the phone is locked, which is the whole point of the
   feature: a share that freezes when the phone locks does not work.

2. Delivery. A delivery partner who works for a local shop goes on duty and
   starts a delivery. While a delivery is under way, the app reports the
   partner's precise location to the shop, so the shop can see where the order
   is, and our servers use it to work out the customer's estimated arrival time.
   Delivery partners ride or walk with the phone locked or in a pocket, so
   reporting has to continue in the background. It stops when the delivery is
   finished or cancelled. Customers are shown progress and an estimated arrival
   time only; they are never shown the partner's location. Only the latest
   position is stored (no movement history), and it is erased when the delivery
   ends.

Nearby discovery, maps and search use while-in-use location only.
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
Two features use background location. Both are shown in the video, and both can
be reproduced with the test accounts in App access.

A. My People live share
1. Sign in as the Customer account (App access, instruction set 1).
2. Account -> My People -> Start sharing.
3. Read the in-app disclosure (states location is collected even when the app is
   closed or not in use) -> Continue.
4. Grant location "Allow all the time" (and notifications if prompted).
5. A persistent "STRYT live location" notification appears.
6. Lock the device. Signed in as the Shop owner account on a second device (or
   stryt.in), open the chat with the customer: the live location keeps updating.
7. Stop sharing from the in-app banner.

B. Delivery
1. Sign in as the Delivery partner account (instruction set 3) and turn ON DUTY.
2. Place and prepare an order first (instruction set 2 shows how); then, as the
   delivery partner, open the order under Assigned -> "Picked up from shop" ->
   "Start delivery".
3. The same in-app disclosure appears before the system dialog -> Continue ->
   grant "Allow all the time".
4. A persistent "STRYT Live Tracking" notification appears while the delivery is
   under way.
5. The shop owner's Deliveries screen shows the delivery partner's position.
6. "I've arrived" -> enter the customer's hand-over code -> collect cash ->
   Delivered. Location reporting stops.
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
