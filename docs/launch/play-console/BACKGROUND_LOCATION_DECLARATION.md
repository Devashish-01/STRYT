# Play Console — Background location declaration (copy/paste)

Use this when Google Play asks you to declare **Background location**
(App content → Sensitive permissions → Background location access)
and when filling **Data safety**.

STRYT already shows an in-app prominent disclosure before the system
permission dialog (`BackgroundLocationDisclosure`). You still must
declare the use in Play Console yourself (requires your developer account).

---

## 1. Background location access form

**Is background location access required for your app's core functionality?**
→ **Yes**

**Core functionality description** (paste):

```
STRYT’s “My People / live location share” feature lets a user share their
precise location with emergency contacts they explicitly choose. Location
must continue updating while the app is in the background or the screen is
locked so those contacts can follow the user on a map until the sharer stops
sharing. Nearby discovery without a live share uses while-in-use location only.
```

**Video instructions** (what reviewers should do):

```
1. Sign in with a test Google account that has at least one “My People”
   emergency contact already added (or add one via My People → Emergency contacts).
2. Open Home → tap the My People (people) icon, or open My People from Account.
3. Read the in-app disclosure that states location is collected even when the
   app is closed or not in use → tap Continue.
4. Grant location “Allow all the time” (and notifications if prompted).
5. Confirm a persistent “STRYT live location” notification appears.
6. Background or lock the device; ask a second test account (the contact) to
   open the chat with the sharer and confirm the live map still updates.
7. Stop sharing from the in-app banner / My People → Stop sharing.
```

**Link to privacy policy:**
`https://stryt.in/legal/privacy-policy`

---

## 2. Data safety (location)

| Question | Answer |
|---|---|
| Approximate location | Yes (if you derive/use it) — or No if you only use precise |
| Precise location | **Yes** |
| Collected | **Yes** |
| Shared | **Yes** — with emergency contacts the user chooses during a live share |
| Ephemeral | No (last known / live share coordinates are stored while the share is active) |
| Required / optional | **Optional** — only when the user starts a live share / grants permission |
| Purposes | App functionality (safety live share + nearby discovery) |

Also declare: personal info (name/email from Google), photos/camera, messages/UGC,
device IDs / push tokens, app activity / analytics (Vercel), as already used in code.

---

## 3. After declaring

1. Build a new AAB (CI: Android release workflow, or local `bundleRelease`).
2. Upload to an internal/closed testing track first.
3. Ensure the build’s permission list includes `ACCESS_BACKGROUND_LOCATION`.
