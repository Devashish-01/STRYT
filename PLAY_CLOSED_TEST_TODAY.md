# STRYT Play closed test: owner checklist

**Prepared 17 November 2026; updated 18 November for the one-phone video.** App `in.stryt.app`. The first uploaded AAB was **1.0.77** (version code **113**). Use the newest AAB linked below for the next release, and confirm its version code in Play Console. Tick each box as you finish it. Console labels may vary slightly; use the closest named page.

## The two links to keep open

- [Google Play Console](https://play.google.com/console) — select **STRYT**.
- [Latest Play bundle: `stryt.aab`](https://github.com/Devashish-01/STRYT/releases/download/android-latest/stryt.aab). Download it **after the latest Android workflow succeeds**. Upload the **AAB**, not `stryt.apk` or an older local copy. Check the release page's asset upload time before downloading.

The [OTA workflow](https://github.com/Devashish-01/STRYT/actions/runs/44028336508) also passed. The production retention migration and rollback test passed on 16 November. **Play Console submission, Firebase app-signing setup, the video, and tester opt-ins are still owner actions.**

## 1. Start recruiting now (parallel with the Console work)

- [ ] Collect **20 or more** testers' Google Account email addresses; at least **12** must remain opted in continuously for 14 days. Ask each person which Google account is active in their Play Store. Keep a private list of name, Google email, invite sent, opted in, installed, and feedback. Do not commit this list to GitHub.
- [ ] Ask testers to be available when the link goes live. They can use STRYT and report bugs; Google counts their **continuous opt-in**, not a daily-open counter. Ask them to keep the test installed and try key flows so you get useful feedback.
- [ ] Tell testers **not to opt out** during the 14 days. If someone opts out and rejoins, that person's continuous 14-day period restarts. Invite extras so the group does not fall below 12.

The test does **not** start merely because an email list exists or the AAB is uploaded. The release must become available, then testers must join through the opt-in link. [Google's current 12-testers rule](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en) requires 12 continuously opted in for the 14 days preceding the production-access application.

## 2. Check the three reviewer accounts and prepare a delivery

Use [App access — exact reviewer instructions](archive/docs/launch/play-console/APP_ACCESS.md) as the source for the Play form. These are **demo** accounts, but anyone with their fixed codes can enter them while the test numbers remain enabled.

| Role | Phone | Fixed test code | What it must show |
|---|---|---|---|
| Customer: Priya Nair | `+91 9222222222` | `222222` | Home, Sharma General Store, checkout, My People |
| Shop owner: Rajesh Sharma | `+91 9111111111` | `111111` | Sharma General Store console, Orders, Deliveries → Live board |
| Delivery partner: Suresh Kumar | `+91 9333333333` | `333333` | Delivery account, On duty, Assigned order |

- [ ] In **Firebase project `zetax-52843` → Authentication → Sign-in method → Phone → Phone numbers for testing**, confirm all three exact number/code pairs. Enable Phone sign-in if the Console shows it disabled. Do not use real SMS or share personal OTPs in the video.
- [ ] Use **one Android phone**. Install the current release build. Check that all three demo accounts sign in. If a code fails, fix Firebase test-number setup before recording or filing App access.
- [ ] In the STRYT app, sign in as **Priya**. Add at least **₹100** of items from Sharma General Store. Choose **Home delivery**, enter a complete address, and check that the map pin is within the shop's **5 km** radius. Place a **cash-on-delivery** demo order.
- [ ] Sign out of Priya and sign in as **Rajesh**. Long-press Profile, choose **Sharma General Store**, open **Orders**, accept the order, mark it packed, and assign it to **`suresh_k`**.
- [ ] Sign out of Rajesh and sign in as **Suresh**. Long-press Profile, choose **Delivery**, turn **On duty** on, and find the order under **Assigned**. Prepare the order shortly before filming; an untouched accepted order can expire after about three hours.
- [ ] In **Chrome on the same phone**, sign in as Rajesh at `https://stryt.in` and open **Orders → Deliveries → Live board**. Confirm it loads before filming. Switch back to the STRYT app, still signed in as Suresh.

## 3. Record the background-location evidence video

The Play declaration names **delivery tracking as one representative feature**. My People stays in the app and is disclosed in App access, the in-app dialog, and the privacy policy. Follow the [one-phone checklist](archive/docs/launch/play-console/DELIVERY_VIDEO_ONE_PHONE_CHECKLIST.md). Use the [two-phone checklist](archive/docs/launch/play-console/DELIVERY_VIDEO_TWO_PHONE_CHECKLIST.md) if the Chrome owner view does not work.

- [ ] Reset the installed STRYT app's location permission to **Don't allow** so both the disclosure and Android prompt can be seen. Hide personal notifications. Start screen recording in portrait orientation.
- [ ] Show Suresh opening the assigned order and tapping **Picked up from shop → Start delivery**.
- [ ] Hold the in-app disclosure on screen long enough to read the background-location explanation. Tap **Continue** and show Android's permission prompt. On Android 11+, show the route through STRYT's app-location settings to **Allow all the time** when the app asks for it.
- [ ] Show the persistent **STRYT Live Tracking** notification. Press Home so the app is in the background, then open Rajesh's Live board in Chrome. Keep Suresh signed in to the installed app.
- [ ] Record the **Live board** with Suresh's current position updating while STRYT is in the background. If it does not update, investigate before submitting the video.
- [ ] Make one short final video, ideally **about 30 seconds**; keep enough time to prove the feature works. Hide fixed codes, real phone numbers, personal notifications, and unrelated data. Do not include a separate My People demonstration in this declaration video.
- [ ] Upload to YouTube as **Unlisted** (or use a reviewer-accessible Google Drive video link). Open the link in a signed-out/incognito browser and confirm it plays without requesting access. Save the URL for the declaration form.

[Google's background-location guidance](https://support.google.com/googleplay/android-developer/answer/9799150?hl=en) asks for **one** declared feature, its prominent disclosure, runtime prompt, and a short Android demonstration. The location permission remains in the app because delivery and My People use it.

## 4. Complete the Play Console app setup

In Play Console, use the **Dashboard** to find every item marked incomplete under app setup / App content. Complete and save each page. Do not copy from `PLAY_CONSOLE_MASTER_DOSSIER.md`: it is explicitly archival and names version 1.0.61 and obsolete Google-login credentials.

### Store listing and assets

- [ ] **Grow → Store presence → Main store listing:** title `STRYT`; copy short and full description from [current listing text](archive/playstore-assets/metadata/APP_TITLE_AND_DESCRIPTIONS_EN.txt). Choose the appropriate app category, contact email `support@stryt.in`, website `https://stryt.in`, and privacy URL `https://stryt.in/legal/privacy-policy` where requested.
- [ ] Upload the [512 px icon](archive/playstore-assets/graphics/icon-512.png), [feature graphic](archive/playstore-assets/graphics/feature-graphic-1024x500.png), and phone screenshots from [screenshots folder](archive/playstore-assets/graphics/screenshots). Preview the listing and save. If Console asks for further assets or translations, follow its validation messages.

### App content and declarations

- [ ] **Privacy policy:** `https://stryt.in/legal/privacy-policy`. **Account deletion URL:** `https://stryt.in/legal/account-deletion`. Open both publicly and check they load. The in-app route is **Account → Delete account**.
- [ ] **App access:** choose **All or some functionality is restricted**. Add the **four** instruction sets and fixed phone/code pairs from [APP_ACCESS.md](archive/docs/launch/play-console/APP_ACCESS.md): customer, shop owner, delivery partner, and My People. Reviewer sign-in is **phone + fixed code**, with no SMS. Save.
- [ ] **Ads:** answer **No** if the shipped app still has no ads. **Target audience:** select **18 and over**, matching the current dossier. Complete **content rating** honestly: users can interact, and location sharing exists. Finish any **news, government, financial-features, and other declarations** displayed by your Console; use the app's real behavior, not an old answer sheet.
- [ ] **Data safety:** go field by field using [DATA_SAFETY.md](archive/docs/launch/play-console/DATA_SAFETY.md), including location, contact details, messages, orders, search history, crash data, device IDs, and deletion. Save and verify the summary matches the app and public policy. The old master dossier has an incomplete table; use the dedicated Data safety file.
- [ ] **Sensitive permissions → Background location access:** answer **Yes** and paste **only the delivery description** from [BACKGROUND_LOCATION_DECLARATION.md §1](archive/docs/launch/play-console/BACKGROUND_LOCATION_DECLARATION.md). Paste the unlisted video URL. If the Console separately asks for a **foreground service location** declaration, use that file's foreground-service text, which mentions both delivery and My People. Save.
- [ ] Open Play Console's app-setup checklist again. Resolve any other required form before submitting. Some items are shown only after the AAB has been uploaded.

## 5. Create and submit the closed-testing release

- [ ] **Test and release → Testing → Closed testing:** create a track if none exists, then **Manage track → Testers**. Create an email list, add the Google emails you collected, select the list for this track, enter a feedback email or URL, and **Save changes**. Do not assume saving the list opts anyone in.
- [ ] **Releases → Create new release:** upload the newest **`stryt.aab`**. Confirm Play displays package `in.stryt.app`, the expected version name from `package.json`, and a version code **higher than 113** if replacing the already uploaded first bundle. Play will not accept a reused version code.
- [ ] Review the uploaded bundle's permissions: `ACCESS_BACKGROUND_LOCATION` and `FOREGROUND_SERVICE_LOCATION` are expected; `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` should **not** appear. If the permission list differs, pause submission and investigate.
- [ ] Use the displayed version name as the release name and concise notes such as `Closed test: local discovery, shopping, delivery tracking, and My People live sharing.` Save, review warnings, and **Send for review / Start rollout to closed testing** as the Console offers. Resolve every blocking error shown by Play. Record the submission date and review status.

[Google's closed-testing setup guide](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en) describes the tester list and opt-in link; [release instructions](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en) describe the AAB rollout.

## 6. Immediately after the first AAB upload: Play signing and Firebase

The **App signing key certificate** is different from the upload key. Use the **app signing** fingerprints, not the upload-key fingerprints.

- [ ] In Play Console, open **App integrity → App signing** (sometimes under **Test and release → Setup**). Copy the **App signing key certificate SHA-1 and SHA-256**.
- [ ] In **Firebase project `zetax-52843` → Project settings → General → Your apps → Android app `in.stryt.app`**, add both fingerprints. Firebase phone auth uses SHA-256 for Play Integrity and SHA-1 for its reCAPTCHA fallback. See [Firebase phone-auth setup](https://firebase.google.com/docs/auth/android/phone-auth).
- [ ] Download the refreshed **`google-services.json`**. Update GitHub Actions secret **`GOOGLE_SERVICES_JSON_BASE64`** using the correct base64 content, without pasting the JSON or secret into chat, an issue, or a commit. The repo's [signing runbook](archive/docs/launch/KEYSTORE_ROTATION.md) calls for a rebuild after this update. Ask me to help with the rebuild and verify the new AAB if you want; the current downloaded AAB does not change when a secret changes.
- [ ] Before inviting everyone to install, install the **Play-distributed** build on your own phone and test a fresh phone sign-in and the three fixed reviewer accounts. If sign-in fails, stop the tester invitation and fix the Play signing/Firebase setup. If a rebuilt AAB is needed, its version code must be higher than **113**, and it must be uploaded as a new closed-test release.

## 7. When Google publishes the closed-test release

- [ ] In **Closed testing → Testers**, copy the actual **opt-in link**. It may not appear while the app is Draft or Pending publication. Open it yourself with an invited Google account to confirm it works.
- [ ] Send the link to all invited testers. Suggested message:

  > Please open this link using the Google account I invited, tap **Become a tester**, then install STRYT from Google Play. Stay opted in for the full 14 days. Please try the app a few times and send me anything confusing or broken. Do not share private data in test posts.

- [ ] Have each tester confirm **(1) they tapped Become a tester, (2) they installed from Play, and (3) phone sign-in works**. If the link says they are not eligible, check their active Play Store account against the email list and the track's country availability.
- [ ] Watch Play Console's opted-in tester count. Record the date/time when **at least 12** are opted in. Keep at least 12 continuously opted in for 14 full days; invite 20+ as buffer. The first upload date and review-submission date are **not** the start of a tester's 14 days.

## 8. During the 14 days and after

- [ ] Keep the closed test published and testers opted in. Ask them to test sign-in, Explore, a local shop, placing an order, delivery, My People, and account deletion using **their own** accounts where appropriate. Collect feedback, fix material defects, and publish updated closed-test builds if needed.
- [ ] Check Play Console **Android vitals**, pre-launch report, reviews/feedback, and [Sentry](https://sentry.io/) for crashes and sign-in failures. Record fixes and tester feedback for the production-access questionnaire.
- [ ] After 14 continuous days for at least 12 testers, use Play Console's **Apply for production access** flow and answer its questions about test participation, feedback, and improvements. Google may request more testing. Keep the closed test active until production access is granted.
- [ ] When Google review no longer needs the fixed reviewer accounts, remove the three **Firebase test phone numbers**; their known codes allow access to demo accounts. Coordinate this with any pending review so App access does not break mid-review.

## If something blocks you today

Send me a screenshot or the exact Play Console error, plus the page name. Especially flag: an AAB/version-code rejection, missing declaration field, video rejection, unavailable opt-in link after publication, or failed Play-installed phone sign-in. Do not send Firebase secrets or personal tester email lists in chat.
