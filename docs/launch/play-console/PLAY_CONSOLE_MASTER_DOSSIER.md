# STRYT: Google Play Console Master Submission Dossier

**App Name:** STRYT  
**Package ID:** `in.stryt.app`  
**Target SDK:** 36 (Android 15+) | **Min SDK:** 24 (Android 7.0+)  
**Version:** `1.0.61` (or latest monotonic build)  
**Publishing Status:** Step 4 Complete — Ready for Play Console Entry

This master dossier provides exact, code-audited copy-paste responses, file references, and walkthrough instructions for completing your app submission in the Google Play Console without ambiguity or rejections.

---

## 📁 1. Asset Uploads Checklist

All graphics have been generated to exact Google Play specifications and verified in the repository:

| Asset | File Path in Repo | Exact Dimension | File Size | Compliance Status |
|---|---|---|---|---|
| **App Icon** | [`public/icon-512.png`](file:///d:/zetax/name/STRYT/public/icon-512.png) | 512 × 512 px | ~84 KB | ✅ 32-bit PNG, full bleed, no pre-rounded corners |
| **Feature Graphic** | [`public/play-feature-graphic.png`](file:///d:/zetax/name/STRYT/public/play-feature-graphic.png) | 1024 × 500 px | 299 KB | ✅ 24-bit PNG, centered brand emblem & tagline |
| **Screenshot 1** | [`public/store-screenshots/01_hyperlocal_discovery.png`](file:///d:/zetax/name/STRYT/public/store-screenshots/01_hyperlocal_discovery.png) | 1080 × 1920 px | 404 KB | ✅ Explore map, nearby vendors, category chips |
| **Screenshot 2** | [`public/store-screenshots/02_live_proposals_bargain.png`](file:///d:/zetax/name/STRYT/public/store-screenshots/02_live_proposals_bargain.png) | 1080 × 1920 px | 410 KB | ✅ Street requests, live proposals, 0-fee UPI |
| **Screenshot 3** | [`public/store-screenshots/03_instant_appointments.png`](file:///d:/zetax/name/STRYT/public/store-screenshots/03_instant_appointments.png) | 1080 × 1920 px | 400 KB | ✅ Local pro booking, interactive slot picker |
| **Screenshot 4** | [`public/store-screenshots/04_notifications_my_people.png`](file:///d:/zetax/name/STRYT/public/store-screenshots/04_notifications_my_people.png) | 1080 × 1920 px | 404 KB | ✅ Notification center, My People live safety |

---

## 📝 2. Main Store Listing Metadata

Navigate to: **Grow → Store presence → Main store listing**

### App Details
* **App Name:** `STRYT`
* **Short Description (79 / 80 chars):**
  ```text
  Hyperlocal street discovery, appointments, group buying, and community network.
  ```
* **Full Description:**
  *(Paste directly from [`docs/launch/play-console/STORE_LISTING.md`](file:///d:/zetax/name/STRYT/docs/launch/play-console/STORE_LISTING.md))*

---

## 🔒 3. App Content & Policy Questionnaires

Navigate to: **Policy → App content**

### 3.1. Privacy Policy
* **Privacy Policy URL:** `https://stryt.in/legal/privacy-policy` *(Verified live, HTTP 200)*

### 3.2. Ads
* **Does your app contain ads?** → **No, my app does not contain ads**

### 3.3. App Access (Crucial for Google Reviewers)
* **Are parts of your app restricted?** → **All or some functionality is restricted**
* **Add Credential Set 1 (Customer Account):**
  * **Instructions name:** `Customer Standard Account`
  * **Username / Email:** `stryt.playtest@gmail.com` *(or your designated test Google account)*
  * **Password:** *(password for the test account)*
  * **Instructions:**
    ```text
    1. Sign in with Google using the provided test account.
    2. Note: 2-Step Verification is turned OFF.
    3. The account opens directly onto the Explore / Map home screen.
    4. To test "My People" live location sharing, open Account -> My People.
    5. A test emergency contact is already configured. Tap "Start Sharing" to observe the prominent in-app disclosure followed by the system location prompt.
    ```

### 3.4. Content Rating (IARC)
* **Category:** `Utility, Productivity, Communication, or Other`
* **Violence, Blood, Sexuality, Profanity, Drugs:** Select **No** for all.
* **Can users interact or exchange content?** → **Yes** *(Users can post street requests and send bargaining proposals to merchants)*.
* **Does the app share the user's current and precise physical location with others?** → **Yes** *(Through user-initiated "My People" live location sharing)*.
* **Does the app allow users to purchase digital goods?** → **No** *(STRYT facilitates direct peer-to-peer UPI payments for physical goods and local services directly to merchant VPAs)*.
* **Resulting Rating:** **PEGI 3 / Everyone (ESRB)** with "Users Interact" and "Shares Location" tags.

### 3.5. Target Audience & Content
* **Target age groups:** **18 and over**
* **Could your store listing appeal to children?** → **No**

### 3.6. News Apps & COVID-19 Apps
* **Is your app a news app?** → **No**
* **Is your app a COVID-19 contact tracing or status app?** → **No**

### 3.7. Financial Features Declaration
* **Select all financial features that apply:** → **None of the above**
* *Explanation:* STRYT is a hyperlocal discovery and communication platform. It does not provide banking, lending, wallet storage, currency exchange, or payment escrow. Users scan standard Bharat/NPCI UPI QR codes using external UPI apps on their device.

### 3.8. Government Apps
* **Is your app developed by or on behalf of a government agency?** → **No**

### 3.9. Sensitive Permissions: Background Location
* **Is background location access required for your app's core functionality?** → **Yes**
* **Core functionality description (Paste this text):**
  ```text
  STRYT uses background location for one user-initiated feature, behind its own in-app disclosure and stoppable at any time.

  My People live location share: A user shares their precise location with contacts they explicitly choose, so those contacts can follow them on a map until the user stops sharing. Location must keep updating while the app is backgrounded or the screen is locked, which is the essential utility of the safety feature.

  Nearby discovery, maps, and search use while-in-use location only. STRYT stores a last known position, not a historical trail.
  ```
* **Video Demonstration:**
  * Prepare a short 30-second screen capture showing:
    1. The "My People" screen.
    2. The in-app prominent disclosure dialog explaining location use.
    3. Granting the permission and turning on live share.
    4. Backgrounding the app with the persistent foreground notification visible.

---

## 🛡️ 4. Data Safety Questionnaire (Field-by-Field)

Navigate to: **Policy → App content → Data safety**

> **Fill the form from [`DATA_SAFETY.md`](DATA_SAFETY.md), not from this section.** It is the copy/paste
> source: every row there cites the code or schema behind it, and it was revised on 18 September 2026.
>
> This section used to carry its own shorter table. The two drifted — this one was missing **ten** data types
> the other declares (user IDs, address, other info including government ID, purchase history, other
> financial info, app interactions, other user-generated content, in-app search history, crash logs and
> diagnostics), and disagreed with it on whether **name** and **phone** are shared. Keeping one table is how
> that stops.

### Before you open the form

1. **Deploy `purge-deleted-accounts` to production** (`../RELEASE_RUNBOOK.md` part 2). The form asks whether
   users can request deletion. The honest answer is only "Yes" once the function that completes a deletion
   exists — it has never been deployed there.
2. **Settle the background-location decision** (`../PLAY_LAUNCH_PLAN.md`, owner step 1). It decides whether §3.9
   above applies at all.

### The global answers, for reference

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** |
| Do you provide a way for users to request that their data is deleted? | **Yes** — subject to point 1 above |

Everything else — each data type, whether it is shared, optional or required, and its purposes — is in
`DATA_SAFETY.md` §1–§11.

---

## 🚀 5. App Bundle & Rollout Instructions

### 5.1. Generate Signed Release AAB
Build the production Android App Bundle from your terminal:
```bash
./gradlew bundleRelease
```
The output file is generated at:
`android/app/build/outputs/bundle/release/app-release.aab`

*(Alternatively, CI builds and signs `stryt.aab` automatically on every push to `main` and attaches it to the GitHub Release)*.

### 5.2. Recommended Release Steps
1. **Internal Testing Track:**
   * Create a new release in **Testing → Internal testing**.
   * Upload `app-release.aab`.
   * Add your internal tester email list.
   * Verify on physical test devices that sign-in, Google Play Services, and FCM push notifications function flawlessly.
2. **Pre-Launch Report Review:**
   * Review Google's automated Firebase Test Lab run for any crashes, ANRs, or security warnings.
3. **Promote to Closed / Production Track:**
   * Once validated, promote the release to **Production** and submit for Google Play Review.
