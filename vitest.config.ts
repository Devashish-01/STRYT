import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Mirrors vite.config.ts's alias. Without it, any test importing a module
  // that uses the "@/..." path alias fails to resolve at collection time —
  // which is most of the codebase, and is why the suite could previously only
  // cover dependency-free helpers.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    env: {
      // tests/push-delivery — the backend half of the push chain lives in
      // Supabase, so it can't be probed from a unit test. This flag is the
      // verifier's attestation that it HAS been checked (see
      // deliverPushModel.ts → liveBackendConfigured for what was confirmed).
      //
      // Verified 2026-08-02: send-push ACTIVE v28, both vault secrets set,
      // pg_net installed, triggers on notifications, both token tables present.
      //
      // Re-verify after rotating any secret — the trigger no-ops SILENTLY when
      // a secret is missing, so nothing else will tell you:
      //   select name, (decrypted_secret is not null
      //                 and length(decrypted_secret) > 0) as is_set
      //   from vault.decrypted_secrets
      //   where name in ('functions_url','service_role_key');
      PUSH_BACKEND_CONFIGURED: "true",
    },
  },
});
