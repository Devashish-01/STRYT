# Play Console — Background location declaration (copy/paste)

Use this when Google Play asks you to declare **Background location**
(App content → Sensitive permissions → Background location access)
and when filling **Data safety**.

> ⏸ **v1.0 STATUS: delivery is deferred.** `DELIVERY_AGENT_ENABLED` is `false`
> for this submission (`src/lib/features.ts`) — the on-duty toggle, the
> `/delivery` console, and every path into it are unreachable in this build,
> and `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is commented out of the manifest
> because it would otherwise be a declared-but-unused permission. **Declare
> only My People below.** The delivery content further down is kept, not
> deleted, so it's ready to paste again for the v1.1 update — every block
> marked `⏸ DEFERRED` is not part of this submission.

STRYT already shows an in-app prominent disclosure before the system
permission dialog (`BackgroundLocationDisclosure`) — wired into
`useLiveShare.tsx` (live for v1.0) and `DeliveryConsole.tsx` (deferred). You
still must declare the use in Play Console yourself (requires your developer
account).

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
feature — a share that freezes when the phone locks does not work.

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

**Video instructions for v1.0** (what reviewers should do):

```
1. Sign in with the test Google account provided in App access. It already has
   one "My People" emergency contact saved.
2. Open Home → tap the My People (people) icon, or open My People from Account.
3. Read the in-app disclosure that states location is collected even when the
   app is closed or not in use → tap Continue.
4. Grant location "Allow all the time" (and notifications if prompted).
5. Confirm a persistent "STRYT live location" notification appears.
6. Background or lock the device; the second test account (the contact) opens
   the chat with the sharer and the live map keeps updating.
7. Stop sharing from the in-app banner / My People → Stop sharing.
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
3. Ensure the build’s permission list includes `ACCESS_BACKGROUND_LOCATION`.
