# Delivery background-location video — two-phone checklist

Use this with [App access](APP_ACCESS.md), the [video script](BACKGROUND_LOCATION_VIDEO_SCRIPT.md), and the [declaration](BACKGROUND_LOCATION_DECLARATION.md). Record the **delivery partner feature only** for the Play background-location form.

## Equipment and accounts

- **Phone A:** Android phone with STRYT's submitted release build. Use it first for Priya Nair (customer), then sign out and use it for Suresh Kumar (delivery partner). This phone supplies the main screen recording.
- **Phone B:** Android phone with the same build, signed in as Rajesh Sharma (shop owner). This phone supplies the Live board recording.
- Use the three test phone numbers and codes in [App access](APP_ACCESS.md). Confirm those exact pairs in Firebase Authentication before filming, and confirm phone sign-in on a Play-installed build after the Play app-signing fingerprints are added to Firebase.

## Before recording

1. On Phone B, sign in as Rajesh. Long-press the Profile tab, select **Sharma General Store**, and open **Orders**.
2. On Phone A, sign in as Priya. Open **Sharma General Store**, add items totalling at least **₹100**, choose **Home delivery**, enter a complete delivery address, and pin the address on the map inside the shop's **5 km** delivery radius. Place the order. Check the pin in checkout before confirming; the saved demo profile pin may be far from the shop.
3. On Phone B, accept the new order, mark it packed, and assign it to **suresh_k**. Leave **Orders → Deliveries → Live board** ready.
4. On Phone A, sign out of Priya and sign in as Suresh. Open the Delivery account from the account switcher, check **On duty**, and find the order in **Assigned**. If the battery-settings suggestion appears, it may be skipped.
5. Reset STRYT's location permission on Phone A to **Don't allow** before recording so the prominent disclosure and Android permission steps appear. Hide personal notifications. Start a fresh order close to filming time; an untouched accepted order can expire after about three hours.

## Record

1. Start Phone A's built-in screen recorder. Tap **Picked up from shop → Start delivery**.
2. Hold on STRYT's disclosure long enough to read the background-location statement, then tap **Continue**. Show the Android runtime prompt. On Android 11+, **Allow all the time** is in the app-location settings; record that step if needed.
3. Show the persistent **STRYT Live Tracking** notification. Background or lock Phone A while recording continues. Keep the delivery active.
4. Record Phone B's **Live board** showing Suresh's position while Phone A is in the background. If the marker does not update, stop and investigate before submitting the video.
5. Send both original recordings for editing. Aim for a final video around 30 seconds, but preserve enough footage to prove each required step. Do not show the sign-in codes, unrelated personal data, or My People as a second declared feature.

## Production setup rechecked 2026-11-18

The three Supabase Auth users and public profiles are confirmed and onboarded, with city set to Pune. Sharma General Store's approved live pin and address are **Amanora Park Town, Hadapsar, Pune 411028**. The shop is active, open, delivery enabled, and has seven in-stock catalog items. Suresh has an active delivery access grant and is on duty. No active delivery order was present at the check. Priya's saved pin is approximately **0.31 km** from the shop, inside the 5 km radius. Confirm the phone's actual position and checkout pin before filming. Firebase test-number configuration, the Play app-signing fingerprints, and real-device sign-in still require verification outside Supabase.
