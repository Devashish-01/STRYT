# Release keystore password rotation

**Date:** 4 August 2026
**Keystore:** `android/app/stryt-release.keystore` (PKCS12, alias `stryt-key`)
**Status:** local rotation **done and verified** · **3 GitHub secrets still to update**

---

## Why

The old store password `stryt123` is in git history — commits `73bfc4f`,
`8e1ca44`, `ca9d690`, where it was hardcoded in `android/app/build.gradle`.
`build.gradle` reads it from env/CI now, but the value is permanently readable by
anyone who has cloned the repo.

The `.keystore` file itself was **never committed** (verified with
`git log --all --diff-filter=A`), so what leaked is a password without its key.
Rotating the password closes it completely.

### Why rotate the password instead of generating a new keystore

Changing the password does not touch key material, so the certificate
fingerprint is unchanged:

```
SHA1: D5:B9:AA:BF:79:C3:DB:47:C2:3E:1E:97:22:68:89:E3:89:E7:31:71
```

That fingerprint is registered in `android/app/google-services.json`
(`d5b9aabf79c3db47c23e1e97226889e389e73171`), so **Google Sign-In keeps working
with no Firebase changes**. A new keystore would change the SHA-1 and force a
Firebase Console update, a `google-services.json` re-download, and a
`GOOGLE_SERVICES_JSON_BASE64` secret update — more moving parts, and no extra
security, because the key was never exposed.

### CI is not affected by the local rotation

A common misreading, worth stating plainly: CI never uses the keystore on your
disk. `.github/workflows/android-release.yml:80` decodes the
`ANDROID_KEYSTORE_BASE64` secret into `android/app/stryt-release.keystore` at
build time. The old secret and the old password stay consistent **with each
other**, so builds kept working throughout the rotation. There was no window of
breakage and no sequencing to manage.

The corollary is the step that gets forgotten: changing the password **changes
the keystore file's bytes**, so `ANDROID_KEYSTORE_BASE64` must be re-uploaded
too. That is three secrets, not two.

---

## Steps 1–5 — done

| # | Step | Result |
|---|---|---|
| 1 | Back up the pre-rotation keystore outside the repo | `C:\Users\D Patel\stryt-release.keystore.bak` — md5 matched the original before any change |
| 2 | Generate a 32-character alphanumeric password | Alphanumeric only, so it passes through Gradle `-P` properties and GitHub Actions without quoting problems |
| 3 | `keytool -storepasswd -keystore android/app/stryt-release.keystore -storepass stryt123 -new '<NEW>'` | Exit 0. PKCS12 does not support a store password differing from the key password, so this covers both — keep them identical everywhere |
| 4 | Confirm the old password no longer opens the keystore | `stryt123` **rejected** |
| 5 | Confirm key material survived | `keytool -list -v` → alias `stryt-key`, `PrivateKeyEntry`, SHA1 **unchanged** |

### Signing proof

A real signed bundle was produced with the new password, not just a keystore
listing:

```bash
cd android && ./gradlew bundleRelease --no-daemon \
  -PstrytVersionCode=999 -PstrytVersionName=1.0.4 \
  -Pandroid.injected.signing.store.file="$(pwd)/app/stryt-release.keystore" \
  -Pandroid.injected.signing.store.password='<NEW>' \
  -Pandroid.injected.signing.key.alias=stryt-key \
  -Pandroid.injected.signing.key.password='<NEW>'
```

Exit 0 · `app-release.aab` 8.8 MB ·
`keytool -printcert -jarfile` on the bundle reports
`CN=Stryt, …` with SHA1 `D5:B9:AA:…` — the same certificate. Signing works end to
end.

> The version code `999` was a throwaway for this test. Real releases take it
> from the CI run number; do not upload this AAB.

---

## Step 6 — yours: update three GitHub secrets

**Repo → Settings → Secrets and variables → Actions.** All three must change
together, in one sitting. CI keeps building with the old pair until you do, so
there is no rush — but a half-update *will* break the next run.

| Secret | New value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | full contents of `C:\Users\D Patel\stryt-keystore-base64.txt` (3648 chars, single line, no trailing newline) — **the one people forget** |
| `ANDROID_KEYSTORE_PASSWORD` | the new password |
| `ANDROID_KEY_PASSWORD` | the same new password (PKCS12 — must match) |

`ANDROID_KEY_ALIAS` stays `stryt-key`. Nothing else changes.

The base64 was verified by decoding it back and comparing md5 against the live
keystore — byte-identical, so a correct paste cannot produce a corrupt keystore
in CI.

### Then

- [ ] Re-run the **Android release** workflow (push to `main`, or run it manually)
- [ ] Confirm it produces a signed `stryt.aab` artifact
- [ ] **Delete `C:\Users\D Patel\stryt-keystore-base64.txt`** — it is the signing key in plain text
- [ ] **Delete `C:\Users\D Patel\stryt-release.keystore.bak`** once CI is green — that backup still opens with the leaked `stryt123`, so keeping it around re-creates the exact problem this rotation fixed
- [ ] Store the new password in a password manager. It is **not** written into this file or anywhere else in the repo, by design

---

## The gotcha waiting at first upload

When the first AAB goes up and you opt into Play App Signing, **Google generates
its own app signing key with a different SHA-1**. Users installing from Play get
builds signed with *that* key, not yours — your keystore becomes only the
*upload* key.

Google Sign-In will fail for every Play installer until you:

1. Play Console → **Setup → App integrity** → copy the **app signing key** SHA-1
2. Firebase Console → Project settings → your Android app → **Add fingerprint**
3. Re-download `google-services.json` → update the `GOOGLE_SERVICES_JSON_BASE64`
   secret → rebuild

This is the most common "login worked in testing, broke on release" bug. Do it in
the same sitting as the first upload.

---

## Rollback

If anything signs incorrectly before the secrets are swapped:

```bash
cp ~/stryt-release.keystore.bak android/app/stryt-release.keystore
```

That restores the pre-rotation file, which opens with `stryt123` and matches the
`ANDROID_KEYSTORE_BASE64` secret currently in GitHub. CI is unaffected either
way. After a successful rollback, start again from step 1.

**If the keystore is ever lost entirely** — before the first Play upload it means
generating a new one and re-registering the SHA-1 in Firebase. After the first
upload, Play App Signing lets you request an upload-key reset from Google, which
is why opting into it matters.
