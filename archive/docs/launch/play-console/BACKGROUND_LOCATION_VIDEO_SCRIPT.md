# Background location — demo video recording script

**For:** the owner, recording the one video Google Play asks for in the background-location declaration
**Updated 2026-10-24:** delivery ships in this release, so the video shows **both** features — My People live share
(Part A) and a delivery (Part B). One video, two parts, one YouTube link.
**Pairs with:** [`BACKGROUND_LOCATION_DECLARATION.md`](BACKGROUND_LOCATION_DECLARATION.md) (the text you paste)

A person at Google watches this video. They check four things for **each** feature:

1. an **in-app disclosure** is shown before Android's permission dialog;
2. it says location is collected **even when the app is closed or not in use**;
3. the **feature** that needs it exists and works;
4. a **persistent notification** is visible the whole time location is collected in the background.

If any of the four is missing for either feature, the declaration is rejected. Everything below puts each on screen,
unmistakably. Speak nothing; add the captions afterwards if your phone's editor allows.

---

## Before you record

### What you need

| Item | Why |
|---|---|
| **Phone A** — records the video | Android 11 or newer, so the "Allow all the time" Settings screen appears (reviewers look for it). Install the **same build you upload** (from the closed-test track, or the AAB/APK from CI). |
| **Phone B** — the other side | A second phone, or a laptop at stryt.in. Used to show the shop owner seeing the location. |
| The three review accounts | Sign in with the phone number and fixed code — no SMS is sent (see [`APP_ACCESS.md`](APP_ACCESS.md)): Customer **9222222222 / 222222**, Shop owner **9111111111 / 111111**, Delivery partner **9333333333 / 333333**. |
| Screen recording on phone A | Swipe down → Screen record. Close other apps so no unrelated notification shows. |

### Set up (once)

1. On phone A, **reset location permission**: Settings → Apps → STRYT → Permissions → Location → **Don't allow**.
   The disclosure shows whenever background permission is not granted, so this guarantees the reviewer sees it.
2. **Customer ↔ contact:** the Customer account already has the Shop owner account saved under
   Account → My People → Emergency contacts (checked 2026-10-24).
3. **An order waiting for the delivery partner (Part B).** Create it just before you record — an accepted delivery
   that nobody starts is closed automatically about 3 hours after its time:
   1. Customer account (phone A or B): open **Sharma General Store** → add two items → Checkout → **Home delivery** → Confirm.
   2. Shop owner account: Orders → **Accept** (choose 30 min) → **Mark packed** → **Assign delivery** → *suresh_k*.
4. Make sure no live share is running on the Customer account (My People → Stop sharing).

---

## Part A — My People live share (about 60 seconds)

Record on phone A signed in as the **Customer** (9222222222).

| # | Do this | What must be visible | Caption |
|---|---|---|---|
| 1 | Open STRYT on Home. | The app, signed in. | *STRYT — My People live location share* |
| 2 | Tap **Account → My People**. | The My People screen with the contact listed. | *The user chooses who receives their location* |
| 3 | Tap **Start sharing**. | — | — |
| 4 | **Hold on the disclosure 3–4 seconds. Do not tap.** | *"Allow location in the background?"* and the sentence that STRYT collects precise location **even when the app is closed or not in use**. | *In-app disclosure, before the system dialog* |
| 5 | Tap **Continue**, choose **While using the app**. | Android's location dialog. | *User accepts the disclosure* |
| 6 | When Android opens **Settings → Location permission**, choose **Allow all the time**. | The "Allow all the time" option being selected. **This is the frame reviewers look for.** | *User grants background location* |
| 7 | Allow notifications if asked; go back to STRYT. | The share shown as on. | *Live share is on* |
| 8 | **Pull down the notification shade; hold 3 seconds.** | **"STRYT live location — Sharing your live location with My People until you stop."** | *Persistent notification while location is collected* |
| 9 | Press **Home**, then **lock the screen** ~10 seconds. | Home screen, then lock screen. | *App closed and screen locked — sharing continues* |
| 10 | **Show phone B**, signed in as the Shop owner: open the chat with the customer. | The live location card showing the position. | *The chosen contact sees the live location* |
| 11 | Walk a few steps, or wait for an update, with B still on screen. | The position moves. | *Location keeps updating in the background* |
| 12 | On A: **My People → Stop sharing**. | The share turns off; the notification disappears. | *The user can stop at any time* |

---

## Part B — Delivery (about 90 seconds)

Switch phone A to the **Delivery partner** account: sign out, then sign in with **9333333333 / 333333**.
Reset the location permission again if Android remembers "Allow all the time" from Part A (setup step 1), so the
disclosure shows again.

| # | Do this on phone A | What must be visible | Caption |
|---|---|---|---|
| 1 | Open the account switcher (long-press the profile tab) → **Delivery**. | The Delivery console. | *Delivery partner console* |
| 2 | Switch **On duty**. | The toggle on. If a "Keep your delivery tracking" sheet appears, **hold 3 seconds**, then tap **Open battery settings** and back (or **Not now**). | *Optional battery setting — no special permission used* |
| 3 | Open **Assigned** → the order → tap **Picked up from shop** → then **Start delivery**. | The order card showing "Pick up the order", then "Deliver to …". | *Delivery partner starts a delivery* |
| 4 | **Hold on the disclosure 3–4 seconds. Do not tap.** | The sentence that STRYT collects precise location **even when the app is closed or not in use** so the shop can see where the partner is and the customer gets an arrival time. | *In-app disclosure, before the system dialog* |
| 5 | **Continue** → **While using the app** → in Settings choose **Allow all the time**. | "Allow all the time" being selected. | *User grants background location* |
| 6 | **Pull down the notification shade; hold 3 seconds.** | **"STRYT Live Tracking — Sharing live location for active deliveries."** | *Persistent notification while location is collected* |
| 7 | Press **Home**, **lock the screen** ~10 seconds. | Home, then the lock screen. | *App closed and screen locked — tracking continues* |
| 8 | **Show phone B**, signed in as the Shop owner: Orders → **Deliveries** tab → **Live board** (the live map). | The delivery partner's position on the map. | *The shop sees where the delivery is* |
| 9 | Show the Customer account (phone B, or switch): Home → **Your order** card. | "On the way to you" with minutes away — **no map, no location**. | *The customer sees progress and an arrival time, never the location* |
| 10 | On A: **I've arrived** → enter the customer's code → **Collect cash** → done. | The "Delivered" celebration; the tracking notification disappears. | *Location reporting stops when the delivery ends* |

**Length:** short beats long — Google reviews many of these. Trim dead time, but **do not cut** Part A steps 4, 6, 8
or Part B steps 4, 5, 6: those are the proof.

---

## After recording

1. Check no personal data is visible beyond the test accounts (another person's number, a home address, unrelated
   notifications). Blur anything that is.
2. Upload to YouTube as **Unlisted** (not Private — the reviewer needs the link to work).
3. Paste the link into **Background location access** and, if the Console shows it, **Foreground service
   permissions**; paste the description from `BACKGROUND_LOCATION_DECLARATION.md` §1.
4. Once Google approves the app, remove the Firebase test phone numbers (they let anyone who knows them sign in as
   the review accounts) — see `OWNER_REMAINING_STEPS.md`.

---

## If the review comes back rejected

| Reason | Check |
|---|---|
| "Prominent disclosure not shown" | Did the disclosure stay on screen long enough to read? Was location permission reset before each part? |
| "Video does not show the feature" | Part A step 10–11 and Part B steps 8–9 — the other side clearly on screen? |
| "Feature does not require background location" | The description says the feature would stop working when the phone locks — `BACKGROUND_LOCATION_DECLARATION.md` §1 does. |
| "Notification not shown" | Part A step 8 / Part B step 6 — the shade pulled down and held. |
| "Unlisted permission" | The AAB must not contain `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; it was removed on purpose. |
