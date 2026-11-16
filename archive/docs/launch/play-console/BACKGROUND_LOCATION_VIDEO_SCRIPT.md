# Background location — delivery video for Play review

**Updated 2026-11-16.** Google's background-location form evaluates one feature at a time. This video demonstrates **delivery partner tracking only**, the feature named in [BACKGROUND_LOCATION_DECLARATION.md](BACKGROUND_LOCATION_DECLARATION.md). My People remains in the app and is disclosed in the app and privacy policy.

Google recommends a video of about 30 seconds or less. Keep it short, but show the disclosure, Android permission prompt and the feature working while the app is backgrounded. Use an Android device and an Unlisted YouTube link that reviewers can open.

## Prepare before recording

1. Use the same app build submitted to the closed test. Confirm the delivery partner test account can sign in on it; see [APP_ACCESS.md](APP_ACCESS.md).
2. On a second device, sign in as the shop owner. As the customer, place a home-delivery order at Sharma General Store. As the shop owner, accept it, mark it packed and assign it to `suresh_k`.
3. On the recording phone, sign in as the delivery partner. Reset STRYT's location permission to **Don't allow** so the in-app disclosure and Android permission flow will appear. Turn **On duty** and open the assigned order. On Android 11 or newer, **Allow all the time** is in Android's app-location settings, not the first permission dialog.
4. Hide unrelated notifications and personal information before recording.

## Record one continuous feature demonstration

| Shot | Show |
|---|---|
| 1 | Delivery partner taps **Picked up from shop**, then **Start delivery**. |
| 2 | Hold on STRYT's in-app disclosure long enough to read that precise location is collected even when the app is closed or not in use. The disclosure also mentions My People, as Google's in-app disclosure rule requires. |
| 3 | Tap **Continue** and show Android's runtime location prompt. On Android 11 or newer, follow the app/system route to **Settings → STRYT → Permissions → Location → Allow all the time** if needed; record the setting being granted. |
| 4 | Show the persistent **STRYT Live Tracking** notification, then background or lock the phone. |
| 5 | On the shop-owner device, show **Orders → Deliveries → Live board** receiving the partner's current position while the partner's app is backgrounded. |

If the live-board update makes the video longer than 30 seconds, keep the evidence clear instead of cutting it away. Google asks for the declared feature, prominent disclosure and runtime prompt in the video; a short, working demonstration is better than unrelated screens.

## Submit

Upload the video as **Unlisted** and paste its link into the background-location declaration. Use the single-feature description from [BACKGROUND_LOCATION_DECLARATION.md](BACKGROUND_LOCATION_DECLARATION.md) §1. Do not add a My People sequence to this declaration video. My People remains available to reviewers through its separate [App access instructions](APP_ACCESS.md).

[Google Play's current background-location instructions](https://support.google.com/googleplay/android-developer/answer/9799150?hl=en) distinguish the one-feature form and video from the in-app disclosure, which must list all features using background location.
