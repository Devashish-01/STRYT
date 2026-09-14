# STRYT: Google Play Store Assets & Submission Guide

This folder contains all finalized graphics, metadata copy, and policy declaration answers needed to publish **STRYT (`in.stryt.app`)** on the Google Play Developer Console.

---

## 📂 Folder Structure

```text
playstore-assets/
├── README_UPLOAD_GUIDE.md                   <-- You are here
├── graphics/
│   ├── icon-512.png                         <-- 512x512 App Icon (Upload to Main Store Listing)
│   ├── feature-graphic-1024x500.png         <-- 1024x500 Banner (Upload to Main Store Listing)
│   └── screenshots/
│       ├── 01_hyperlocal_discovery.png      <-- Phone Screenshot 1 (Explore & Map)
│       ├── 02_live_proposals_bargain.png    <-- Phone Screenshot 2 (Bargaining & UPI)
│       ├── 03_instant_appointments.png      <-- Phone Screenshot 3 (Appointments)
│       └── 04_notifications_my_people.png  <-- Phone Screenshot 4 (Alerts & Safety)
├── metadata/
│   ├── APP_TITLE_AND_DESCRIPTIONS_EN.txt    <-- English Title, Short & Full Description
│   ├── LOCALIZATION_HINDI.txt               <-- Hindi Translations for Play Store
│   ├── LOCALIZATION_MARATHI.txt             <-- Marathi Translations for Play Store
│   └── STORE_LISTING_FULL.md                <-- Complete Markdown Documentation
└── policy-and-declarations/
    ├── QUICK_COPY_POLICY_ANSWERS.txt        <-- Fast copy-paste answers for all console forms
    ├── PLAY_CONSOLE_MASTER_DOSSIER.md       <-- Detailed questionnaire walkthrough
    ├── DATA_SAFETY.md                       <-- Complete Data Safety breakdown
    ├── BACKGROUND_LOCATION_DECLARATION.md   <-- Background location justification & video script
    └── APP_ACCESS.md                        <-- Google reviewer test account setup
```

---

## 🚀 Quick Step-by-Step Upload Instructions

### 1. Store Presence → Main Store Listing
1. Open [Google Play Console](https://play.google.com/console) and select `STRYT`.
2. Go to **Grow → Store presence → Main store listing**.
3. **App Details**:
   - Open [`metadata/APP_TITLE_AND_DESCRIPTIONS_EN.txt`](file:///d:/zetax/name/STRYT/playstore-assets/metadata/APP_TITLE_AND_DESCRIPTIONS_EN.txt).
   - Copy **App title**: `STRYT`.
   - Copy **Short description**: `Hyperlocal street discovery, appointments, group buying, and community network.`.
   - Copy the **Full description**.
4. **Graphics**:
   - Drag & drop [`graphics/icon-512.png`](file:///d:/zetax/name/STRYT/playstore-assets/graphics/icon-512.png) into the **App icon** box.
   - Drag & drop [`graphics/feature-graphic-1024x500.png`](file:///d:/zetax/name/STRYT/playstore-assets/graphics/feature-graphic-1024x500.png) into the **Feature graphic** box.
   - Drag & drop all 4 images from [`graphics/screenshots/`](file:///d:/zetax/name/STRYT/playstore-assets/graphics/screenshots/) into the **Phone screenshots** box.
5. Click **Save**.

---

### 2. Policy → App Content
Go to **Policy → App content** and open [`policy-and-declarations/QUICK_COPY_POLICY_ANSWERS.txt`](file:///d:/zetax/name/STRYT/playstore-assets/policy-and-declarations/QUICK_COPY_POLICY_ANSWERS.txt):

1. **Privacy Policy**: Paste `https://stryt.in/legal/privacy-policy`.
2. **Ads**: Select **No, my app does not contain ads**.
3. **App Access**: Select **All or some functionality is restricted** and paste the reviewer credentials.
4. **Content Rating**: Click **Start questionnaire**, select **Utility/Communication/Other**, answer "No" to violence/content questions, and declare location sharing.
5. **Target Audience**: Select **18 and over**.
6. **Financial Features**: Select **None of the above**.
7. **Sensitive Permissions (Background Location)**: Select **Yes** and paste the justification script.
8. **Data Safety**: Answer the questionnaire using the Data Safety summary table.

---

### 3. Release Track (Uploading the App Bundle)
1. Go to **Testing → Internal testing**.
2. Click **Create new release**.
3. Upload your signed `.aab` file (`app-release.aab` generated from Step 3).
4. Save and rollout to your internal testing team!
