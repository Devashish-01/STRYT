# Delivery background-location video — one-phone checklist

Use this when you have one Android phone. The existing [two-phone checklist](DELIVERY_VIDEO_TWO_PHONE_CHECKLIST.md) remains the fallback. This video demonstrates the **delivery partner** feature named in the [Play declaration](BACKGROUND_LOCATION_DECLARATION.md); the app also discloses My People.

## Accounts and equipment

- One Android phone with the same STRYT release build submitted to Play, its built-in screen recorder, and Chrome.
- Customer **Priya Nair**: `9222222222` / `222222`.
- Shop owner **Rajesh Sharma**: `9111111111` / `111111`.
- Delivery partner **Suresh Kumar**: `9333333333` / `333333`.
- The +91 country code is already selected in STRYT. These are the fixed Firebase test codes described in [App access](APP_ACCESS.md). Check that each login actually works on the Play-installed build before filming. Do not show the codes in the final video.

## Prepare the order on the phone (before recording)

**Location preflight (verified 2026-11-18):** Sharma General Store's approved live pin and address are **Amanora Park Town, Hadapsar, Pune 411028**. Priya's saved pin is approximately **0.31 km** from the shop, inside its **5 km** delivery radius. Check the pin again in checkout and make sure your phone's actual position is near Hadapsar before recording.

1. In the **STRYT app**, sign in as Priya (`9222222222` / `222222`). Priya defaults to Customer mode on Home. Open **Sharma General Store**, add at least **₹100** of in-stock items, choose **Home delivery**, enter a full address, confirm the map pin is within the shop's **5 km** delivery radius, and place the cash-on-delivery order.
2. Sign out of Priya. Sign in as Rajesh (`9111111111` / `111111`). Long-press **Profile**, choose **Sharma General Store**, then open **Orders**. Accept the new order, tap **Mark Packed & Ready**, and assign delivery to **suresh_k**.
3. Sign out of Rajesh. Sign in as Suresh (`9333333333` / `333333`). Long-press **Profile**, choose **Delivery**, switch **On duty** on, and find the order under **Assigned**.
   - *Time-Saving Tip for the 30-Second Limit:* You can optionally tap **"Picked up from shop"** *before* starting screen recording. That transitions the button to **"Start delivery"**, allowing your recording to begin immediately on the action that triggers the disclosure modal.
   - Prepare the order shortly before filming; an untouched accepted order can expire after about three hours.
4. Open **Chrome** on the same phone and visit `https://stryt.in`. Sign in as **Rajesh** there. Long-press **Profile**, choose **Sharma General Store**, then open **Orders → Deliveries → Live board** (`/business/:id/manage/deliveries`). Confirm the board loads and shows the assigned delivery. Leave Chrome signed in and switch back to the STRYT app, still signed in as Suresh. Chrome and the installed app keep separate sessions; verify this on your phone.
5. Reset **STRYT app's** Android location permission to **Don't allow** so the in-app disclosure and Android permission flow appear when tracking starts. Turn on phone location and internet. Hide personal notifications and disable screen-recorder microphone if it would capture private conversation.

## Record one continuous take

| Shot | What to show |
| --- | --- |
| 1 | Start the phone's built-in screen recorder. In the installed STRYT app, show Suresh's assigned delivery. Tap **Start delivery** (or tap **Picked up from shop** then **Start delivery**). |
| 2 | Pause on the STRYT background-location disclosure dialog ("Allow location in the background?") long enough to read that precise location is collected even when the app is closed or not in use. Tap **Continue**. Record the Android runtime location prompt and grant permission. On Android 11–15, follow the prompt to App Info / Settings → **Permissions → Location → Allow all the time**. |
| 3 | Show that the delivery is active. Pull down the Android notification shade and highlight the persistent **"STRYT Live Tracking"** notification (`Sharing live location for active deliveries. Open STRYT to view status.`). |
| 4 | Press **Home** so STRYT is in the background. Keep the delivery running. Open Chrome from the home screen and show Rajesh's **Live board** receiving Suresh's current position updating live while STRYT is backgrounded. Wait for a fresh position or update timestamp; move a safe short distance if needed. |

Do **not** sign out of Suresh after starting the delivery. The app's delivery tracking stops on sign-out, so switching accounts inside the installed app cannot prove background tracking. The owner view must be in Chrome while the installed app remains in the background. Do not claim that the position updated unless the board visibly shows it.

Google recommends roughly **30 seconds or less**, but keep the disclosure, runtime prompt, and working background feature legible. If Android settings make the recording longer, trim idle waiting while preserving the real sequence. Do not simulate the location marker, splice different orders into one apparent run, or hide a failed permission step.

## If the one-phone owner view does not work

If Chrome cannot sign Rajesh in, the board does not load, or no fresh position appears, stop and investigate. Re-record with the [two-phone checklist](DELIVERY_VIDEO_TWO_PHONE_CHECKLIST.md) after the flow works. A notification alone does not demonstrate that the shop received a background position.

## Submit

Review the recording for exposed codes and personal data. Upload it as an **Unlisted** YouTube video (or a reviewer-accessible Google Drive video) and paste the link into Play Console's background-location declaration. Use the delivery-only text from [BACKGROUND_LOCATION_DECLARATION.md](BACKGROUND_LOCATION_DECLARATION.md) §1.

[Google Play's background-location video guidance](https://support.google.com/googleplay/android-developer/answer/9799150?hl=en) asks for the declared feature, the prominent disclosure, the runtime prompt, and a demonstration while the app is not in use. Approval depends on Google's review; the video cannot guarantee it.
