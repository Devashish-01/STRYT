# Background location — demo video recording script

**For:** the owner, recording the video Google Play asks for in the background-location declaration
**Decision:** D19 — keep background location for My People live share in v1.0 (option A, 18 Sept 2026)
**Pairs with:** [`BACKGROUND_LOCATION_DECLARATION.md`](BACKGROUND_LOCATION_DECLARATION.md) (the text you paste)

A person at Google watches this video. They are checking four things, in this order:

1. there is an **in-app disclosure** before Android's permission dialog;
2. it says location is collected **even when the app is closed or not in use**;
3. the **feature** that needs it really exists and works;
4. a **persistent notification** is visible the whole time location is collected in the background.

If any of the four is missing or unclear, the declaration is rejected. Everything below is arranged so each is
on screen, unmistakably.

---

## Before you record

### What you need

| Item | Why |
|---|---|
| **Phone A** — the sharer | Records the video. Android 11 or newer, so the "Allow all the time" Settings screen appears — that is the step reviewers most want to see. |
| **Phone B** — the contact | Shows the other side: the location actually arriving. A second phone, or a second account on a laptop at stryt.in. |
| **Two STRYT accounts** | A = sharer, B = contact. Use the two accounts you give Google under *App access* (A = the customer account, B = the second one), so the reviewer can repeat exactly what the video shows. |
| **A build of the release commit** | Best: installed from your Play **internal testing** track. If Play will not roll out that release until this declaration is filled in, record on a build of the same commit from Android Studio instead — the screens and the notification are identical. Either way it must include `528763b` and the P15-003 fix. |

### Set it up

1. **On phone A, reset location permission** so the whole flow appears: Settings → Apps → STRYT → Permissions →
   Location → **Don't allow**. The app shows the disclosure whenever background permission is not granted, so
   this guarantees the reviewer sees it.
2. **Make B a My People contact of A.** On phone A: Account → My People → **Emergency contacts** →
   **Add a contact** → enter B's mobile number, email or username.
   - Adding by number/email/username needs database update `20260988`, which is one of the 17 in
     `../RELEASE_RUNBOOK.md` part 1. Do this after that is applied.
   - Before then, only people A has already chatted with can be added — so send a chat message between A and B
     first.
3. **Make sure no share is already running** on A. If one is, stop it: Account → My People → **Stop sharing**.
4. **Turn on screen recording** on phone A (swipe down → Screen record). Include touches if your phone offers
   it. Close other apps so no unrelated notification appears.

---

## The recording — about 60 to 90 seconds

Speak nothing; the screen should explain itself. If your phone lets you add captions afterwards, the text in
*caption* is what to add.

| # | Do this on phone A | What must be visible | Caption |
|---|---|---|---|
| 1 | Open STRYT on the Home screen. | The app, signed in. | *STRYT — My People live location share* |
| 2 | Tap **Account → My People**. | The My People screen, with contact B listed. | *The user chooses who receives their location* |
| 3 | Tap **Start sharing**. | — | — |
| 4 | **Hold on the disclosure for 3–4 seconds.** Do not tap yet. | *"Allow location in the background?"* and the sentence **"STRYT collects your precise location even when the app is closed or not in use so My People can follow your live share on a map until you stop sharing."** | *In-app disclosure, shown before any system permission request* |
| 5 | Tap **Continue**. | Android's location dialog. | *User accepts the disclosure* |
| 6 | Choose **While using the app** (or *Precise*, then *While using*). | — | — |
| 7 | Android asks for background access, or opens **Settings → Location permission**. Choose **Allow all the time**. | The **"Allow all the time"** option being selected. This is the frame reviewers look for. | *User grants background location in system Settings* |
| 8 | If asked, allow **notifications**. Go back to STRYT. | The app shows the share as **on**. | *Live share is now on* |
| 9 | **Swipe down the notification shade.** Hold 3 seconds. | A persistent notification: **"STRYT live location — Sharing your live location with My People until you stop."** | *A persistent notification is shown while location is collected* |
| 10 | Press **Home** to leave the app, then **lock the screen** for about 10 seconds. | The home screen, then the lock screen. | *App closed and screen locked — sharing continues* |
| 11 | **Show phone B** (hold it up to the camera, or cut to its screen recording). Open the chat with A. | The **live location card** in the chat, showing A's position. | *The chosen contact sees the live location* |
| 12 | Walk a few steps, or wait for an update, with phone B still on screen. | The position on B updates. | *Location keeps updating in the background* |
| 13 | Unlock phone A, open STRYT → **Account → My People → Stop sharing**. | The share turns off, and the notification disappears. | *The user can stop at any time* |

**Length:** keep it short — Google reviews many of these. Check the Play Console field for its current
length guidance when you upload.

---

## After recording

1. Trim the start and end. Do **not** cut steps 4, 7 or 9 — those are the proof.
2. Check that no personal data is visible: another person's phone number, a home address, unrelated
   notifications. Blur anything that is.
3. Upload to YouTube as **Unlisted** (not Private — the reviewer needs the link to work) and paste the link into
   the declaration form.
4. Paste the description from `BACKGROUND_LOCATION_DECLARATION.md` §1.
5. If Play Console also shows **Foreground service permissions**, use the same link there
   (`BACKGROUND_LOCATION_DECLARATION.md` §1b).

---

## If the review comes back rejected

The rejection email names the reason. The common ones, and what to check:

| Reason | Check |
|---|---|
| "Prominent disclosure not shown" | Did step 4 hold long enough to read? Was permission reset before recording (setup step 1)? |
| "Video does not show the feature" | Is step 11–12, the contact seeing the location, clearly on screen? |
| "Feature does not require background location" | The description must say the share would stop working when the phone locks — `BACKGROUND_LOCATION_DECLARATION.md` §1 already does. |
| "Notification not shown" | Step 9 — the shade must be pulled down and held. |

If it is rejected twice, the fallback is option B from `../PLAY_LAUNCH_PLAN.md`: sharing only while the app is
open, with no declaration. That is a code change the agent can make in an afternoon.
