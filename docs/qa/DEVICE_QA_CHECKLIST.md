# Device QA checklist

**For:** P13 · **Companion to:** [`DEVICE_MATRIX.md`](DEVICE_MATRIX.md) (which device, and why)
**Functional flows live in** [`../launch/MANUAL_TEST_PLAN.md`](../launch/MANUAL_TEST_PLAN.md) — this is only
what a device proves and a browser cannot.

## How to use this

- Use the **staging** build. A booking made from a production build lands in a real merchant's console.
- Every row says what **pass** looks like. If the result is not that, it is a fail — not a "seems fine".
- A fail becomes a row in `docs/gaps/GAP_LEDGER.csv` with status `OPEN`, then gets fixed through the P09
  loop. Write what you saw, not what you think caused it.
- Record the **device, Android version and OEM skin** against each fail. Half these failures are
  OEM-specific and the skin is the most useful fact in the report.

Legend: ☐ not run · ✅ pass · ❌ fail (ledger row id) · ⊘ not applicable on this device

---

## 1. Permissions — the dialogs nothing automated sees

| # | Do this | Pass looks like | 1 Low | 2 Mid | 3 New | 4 OEM |
|---|---|---|---|---|---|---|
| 1.1 | Fresh install, open the app | No permission dialog before the user does anything that needs one. Location is requested **in context**, not at launch. | ☐ | ☐ | ☐ | ☐ |
| 1.2 | Reach a screen needing location, **allow** | Nearby content loads for your real area. | ☐ | ☐ | ☐ | ☐ |
| 1.3 | Fresh install, **deny** location | The app stays usable. Guest browsing still works. No dead screen, no infinite spinner, no repeated re-prompt. | ☐ | ☐ | ☐ | ☐ |
| 1.4 | Deny, then change your mind in Settings | The app notices on resume without a restart. | ☐ | ☐ | ☐ | ☐ |
| 1.5 | **Android 13+:** first notification-worthy moment | The `POST_NOTIFICATIONS` prompt appears, with the in-app explainer **before** it (the store explainer pattern). | ⊘ | ☐ | ☐ | ☐ |
| 1.6 | Decline notifications, then trigger one | The app does not pretend it worked. Nothing crashes. | ☐ | ☐ | ☐ | ☐ |
| 1.7 | **Battery optimisation prompt** — find every way to reach it | It appears **only** in the flow that justifies it, never at launch. This is BLOCKER 1 and the highest Play rejection risk in the app. | ☐ | ☐ | ☐ | ☐ |
| 1.8 | Camera, from a photo upload | Permission asked in context; capture returns to the app with the photo attached. | ☐ | ☐ | ☐ | ☐ |

## 2. Push notifications — the one automation cannot reach

`tests/push-delivery/` models the chain; it cannot see a banner. Use two devices, or a second account.

| # | Do this | Pass looks like | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 2.1 | App **foregrounded**, trigger a booking notification | In-app notification appears. | ☐ | ☐ | ☐ | ☐ |
| 2.2 | App **backgrounded** (home button) | System banner within ~10s. | ☐ | ☐ | ☐ | ☐ |
| 2.3 | App **fully closed** (swiped from recents) | Banner still arrives. **This is the one OEMs break.** | ☐ | ☐ | ☐ | ☐ |
| 2.4 | Tap the banner from closed | App opens **on the relevant screen**, not the home tab. | ☐ | ☐ | ☐ | ☐ |
| 2.5 | Leave the device idle 30+ min, then trigger | Still arrives — Doze did not silently drop it. | ☐ | ☐ | ☐ | ☐ |
| 2.6 | Row 4 device: repeat 2.3 **without** whitelisting the app | Record honestly. If it fails, that is the evidence for whether the battery-optimisation prompt is justified. | ⊘ | ⊘ | ⊘ | ☐ |
| 2.7 | Owner console: a customer books | The owner's device gets it. | ☐ | ☐ | ☐ | ☐ |

## 3. Background, resume and process death

| # | Do this | Pass looks like | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 3.1 | Background for 10 min, return | Still signed in. No white screen. Data refreshes. | ☐ | ☐ | ☐ | ☐ |
| 3.2 | Force-stop from Settings, reopen | Signed in, lands somewhere sensible. | ☐ | ☐ | ☐ | ☐ |
| 3.3 | Mid-booking, background and return | Either the sheet is intact or it closed cleanly. **Never** a half-filled form that submits wrong. | ☐ | ☐ | ☐ | ☐ |
| 3.4 | Start a live share, background the app | Persistent notification stays; recipient still sees movement. BLOCKER 2. | ☐ | ☐ | ☐ | ☐ |
| 3.5 | Live share, then force-stop | Sharing stops. The recipient is not left watching a frozen pin that looks live. | ☐ | ☐ | ☐ | ☐ |
| 3.6 | Rotate the device on a form | Nothing is lost. | ☐ | ☐ | ☐ | ☐ |

## 4. Network conditions

| # | Do this | Pass looks like | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 4.1 | Throttle to 3G, open the map | It loads eventually with a spinner. No blank screen, no crash. | ☐ | ☐ | ☐ | ☐ |
| 4.2 | Airplane mode, open the app | An offline message, not a spinner that never ends. | ☐ | ☐ | ☐ | ☐ |
| 4.3 | Airplane mode **mid-booking** | A clear error, and the booking is **not** silently recorded as successful. | ☐ | ☐ | ☐ | ☐ |
| 4.4 | Restore network after 4.3 | Retry works. No duplicate booking. | ☐ | ☐ | ☐ | ☐ |
| 4.5 | Switch WiFi → mobile data mid-session | Session survives; realtime reconnects. | ☐ | ☐ | ☐ | ☐ |
| 4.6 | Upload a photo on a slow link | Progress shown; failure is reported, not swallowed. | ☐ | ☐ | ☐ | ☐ |

## 5. Hand-offs to other apps

| # | Do this | Pass looks like | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 5.1 | Tap a phone number on a booking | Dialler opens with the number filled. Back returns to STRYT. | ☐ | ☐ | ☐ | ☐ |
| 5.2 | Tap directions on a listing | Maps opens at the right place, in a **new** task — STRYT is still behind it. | ☐ | ☐ | ☐ | ☐ |
| 5.3 | Tap a UPI pay option with GPay/PhonePe installed | The app chooser appears. | ☐ | ☐ | ☐ | ☐ |
| 5.4 | Same with **no** UPI app installed | A sensible message, not a crash or a dead tap. | ☐ | ☐ | ☐ | ☐ |
| 5.5 | Share a listing | The system share sheet opens with sensible text. | ☐ | ☐ | ☐ | ☐ |

## 6. Accessibility

Automated checks cover markup. These cover what a person actually experiences.

| # | Do this | Pass looks like | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 6.1 | Turn on **TalkBack**, walk home → listing → book | Every control is reachable and announced. Nothing is a silent stop. | ☐ | ☐ | ☐ | ☐ |
| 6.2 | With TalkBack, find an **icon-only** button (back, bookmark, share) | It announces what it *does* — "Save listing", not "button" or "image". | ☐ | ☐ | ☐ | ☐ |
| 6.3 | Font size to **largest** | Text scales. Nothing is clipped, no button loses its label, no row collapses. | ☐ | ☐ | ☐ | ☐ |
| 6.4 | Display size to largest | Layout holds. Bottom nav still usable. | ☐ | ☐ | ☐ | ☐ |
| 6.5 | Try to operate the map by touch only, no pinch | There is a way to zoom without a two-finger gesture. | ☐ | ☐ | ☐ | ☐ |
| 6.6 | Dark mode, if the OS offers it | No unreadable text, no white-on-white. | ☐ | ☐ | ☐ | ☐ |
| 6.7 | Tap targets on the smallest device | Nothing important is under ~44 px. | ☐ | ☐ | ☐ | ☐ |

## 7. First run and install

| # | Do this | Pass looks like | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|---|
| 7.1 | Install over an older build | Signed in; no data loss; no migration crash. | ☐ | ☐ | ☐ | ☐ |
| 7.2 | First launch, cold | Splash → usable screen in reasonable time. Note it on the 2 GB device. | ☐ | ☐ | ☐ | ☐ |
| 7.3 | Sign in with Google | Account picker appears and returns. **The only sign-in the UI offers.** | ☐ | ☐ | ☐ | ☐ |
| 7.4 | Terms screen | Links open the current documents. | ☐ | ☐ | ☐ | ☐ |
| 7.5 | Account deletion, in-app | Reachable, explains the 30-day grace. **Known gap:** `purge-deleted-accounts` is not deployed, so the purge does not complete yet (owner step 9). | ☐ | ☐ | ☐ | ☐ |
| 7.6 | OTA update | Applies and the app still works. | ☐ | ☐ | ☐ | ☐ |

## 8. Browsers (stryt.in)

| # | Do this | Pass looks like | Chrome/Android | Safari/iOS | Chrome/desktop | Firefox |
|---|---|---|---|---|---|---|
| 8.1 | Home, signed out | Renders; guest browsing works. | ☐ | ☐ | ☐ | ☐ |
| 8.2 | Sign in | Completes. | ☐ | ☐ | ☐ | ☐ |
| 8.3 | Map | Tiles render, pan and zoom work. | ☐ | ☐ | ☐ | ☐ |
| 8.4 | Install as a PWA | Installs and launches standalone. | ☐ | ☐ | ⊘ | ⊘ |
| 8.5 | Web push after install | Arrives. iOS only supports this for an installed PWA — record the difference rather than filing it as a bug. | ☐ | ☐ | ☐ | ☐ |
| 8.6 | Admin panel, desktop | Usable at desktop width. | ⊘ | ⊘ | ☐ | ☐ |

---

## Recording a failure

```
Device:   Redmi Note 12 · Android 13 · MIUI 14
Row:      2.3 (push with app closed)
Expected: banner within ~10s
Saw:      nothing, waited 5 min. Worked again after whitelisting in Battery saver.
```

That last sentence is the valuable part — it is the difference between "push is broken" and "this OEM kills
the process", which are different bugs with different fixes.
