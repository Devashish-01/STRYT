// STRYT — app-update edge function (self-hosted OTA update check).
//
// @capgo/capacitor-updater POSTs an update check here on each foreground.
// Supabase Storage's public object endpoint rejects POST (400), so a static
// file can't be the updateUrl — this function is the updateUrl instead. It
// reads the manifest the publish script wrote to app-updates/latest.json (via
// the service role, so it bypasses the CDN and always sees the latest) and
// returns it in the shape the plugin expects: { version, url, checksum }.
//
// The plugin does the version comparison itself against the device's current
// bundle version (anchored to package.json via the `version` config in
// capacitor.config.ts), so we just hand back the newest manifest. If no bundle
// has been published yet, we return a benign "no update" body the plugin no-ops
// on, rather than an error.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

function json(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { data, error } = await admin.storage.from("app-updates").download("latest.json");
    if (error || !data) {
      // No bundle published yet — tell the plugin there's nothing to do.
      return json({ message: "no update available" }, 200, cors);
    }

    const manifest = JSON.parse(await data.text());
    if (!manifest?.version || !manifest?.url) {
      return json({ message: "no update available" }, 200, cors);
    }

    // Exactly the fields the plugin reads; extra keys are ignored.
    return json({
      version: manifest.version,
      url: manifest.url,
      checksum: manifest.checksum ?? "",
    }, 200, cors);
  } catch (e) {
    // Never 500 the updater — a bad check should just mean "no update", not a
    // crash loop on the client.
    return json({ message: "no update available", error: String(e) }, 200, cors);
  }
});
