// Only ever called from cap:sync/cap:run (AFTER `npm run build`, BEFORE
// `npx cap sync android`) — never from the plain `build` script. `vite build`
// copies public/stryt.apk into dist/ verbatim; if that survives into
// `npx cap sync`, the native Android build embeds the entire APK as a raw
// asset inside itself ("an app inside the app" — this is how a stray build
// once ballooned to 94MB). The plain web build must KEEP dist/stryt.apk —
// that's the file Vercel serves at /stryt.apk for the "Download Android App"
// links on Splash/PhoneEntry.
import { rmSync } from "node:fs";
import { join } from "node:path";

try {
  rmSync(join(process.cwd(), "dist", "stryt.apk"), { force: true });
  console.log("Cleaned dist/stryt.apk to prevent Capacitor asset bloat.");
} catch (e) {
  console.error("Failed to delete dist/stryt.apk:", e);
}
