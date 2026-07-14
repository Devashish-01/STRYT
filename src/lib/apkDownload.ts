/**
 * APK download URL.
 *
 * Points DIRECTLY at the public Supabase Storage object — not the site-relative
 * "/stryt.apk" path, which went through a Vercel cross-origin 307 redirect.
 * That redirect was the likely cause of "There was a problem parsing the
 * package": some Android browsers / download managers follow a cross-origin
 * redirect for a download poorly and save a partial file (or the redirect's
 * HTML), which then fails to install. A direct link to the public object —
 * served with Content-Type application/vnd.android.package-archive and, via
 * `?download=`, a Content-Disposition filename — has no redirect hop and is the
 * most reliable path. The `uploads` bucket is public, so no auth is needed.
 *
 * The CI (`.github/workflows/android-release.yml`) builds the signed release
 * APK and uploads it here on every push to main.
 */
export const APK_DOWNLOAD_URL =
  "https://gnswxlfmcwyhmzlfipql.supabase.co/storage/v1/object/public/uploads/stryt.apk?download=stryt.apk";

export const APK_FILENAME = "stryt.apk";
