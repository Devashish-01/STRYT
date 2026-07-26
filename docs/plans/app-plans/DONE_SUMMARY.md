# Overnight Work — Done Summary

All 10 requested tasks were addressed. The codebase was far more mature than a
greenfield, so several tasks were **audit + harden + mature** rather than
build-from-scratch. Every code change passed `tsc` and the final `npm run build`.
DB changes were additive + reversible, applied to production, and mirrored as
tracked migration files.

## Per-task outcome

1. **Profile routing isolation** — Security isolation was already enforced
   (BusinessAccessGuard / ProviderAccessGuard / RequireScope / RLS; mobile
   bottom-nav path-gated). Hardened the **desktop sidebar** to derive the
   console entity from the URL (not a stale `activeContext`), so a console page
   can never render a different profile's nav. Did NOT auto-switch context
   (that would bypass the PIN gate). `DesktopSidebar.tsx`.

2. **Play Store publishing** — `android/app/build.gradle` versionCode/Name now
   injectable; CI (`android-release.yml`) now builds a **signed AAB**
   (`bundleRelease`) with a monotonic versionCode, uploads it as an artifact,
   and attaches it to the GitHub Release. `PLAY_STORE_CHECKLIST.md` covers the
   manual Play Console steps + a signing-key rotation action.

3. **Team member access** — Already production-grade (`BusinessAccess.tsx`:
   presets, per-scope toggles, add by phone/email/username, edit, revoke,
   history). The enabling fix earlier this session was granting EXECUTE on
   `has_business_scope` / `has_business_full_access` (they were breaking every
   owner/team write). Verified delegated RLS policies across 11 business tables.

4. **Delegate access** — Same infra; FULL vs scoped distinction present, PIN
   gate on switch-in, revoke + guard-based bounce. Matured/verified.

5. **Google import → Store** — Extracted `GoogleImportCard.tsx`, removed it from
   the Verification page, added it to the Store hub. Import now **excludes
   location** (respects the freeze) and **drops placeholder** phone/hours so a
   weak match can't clobber real data.

6. **Website presence / logo** — The PNG icons were a tiny logo in an empty
   canvas. Regenerated full-bleed `icon-192/512`, `apple-touch-icon`, and a real
   1200×630 `og-image` from the brand SVG (`scripts/gen-icons.mjs`,
   `@resvg/resvg-js`). Added apple-touch-icon + web-app metas; OG/Twitter now
   point at the proper share image.

7. **Business location freeze** — Client already stripped lat/lng and routed
   moves through request → admin approve (with owner notifications) via a
   full-map picker + PENDING banner. Added a **server-side trigger** so only an
   admin / service_role can ever change live `businesses.lat/lng` — the freeze
   is now real at the DB level, not just client-side.

8. **Alias-name privacy** — `aliasName` already applied broadly; onboarding
   requires an alias; real name revealed only during active queue/appointment.
   Closed the gap: **55 legacy users had no alias** (leaking first name) —
   backfilled unique private handles + added a default-alias trigger for new
   users.

9. **Delivery-boy flow** — Delivered as a **mature plan**
   (`09_delivery_boy_flow.md`): assignment, customer tracking via existing
   live-share infra, handoff code via tracking_tokens, alias-based privacy,
   pay-on-delivery tie-in, phased rollout. Plan-first by design (new
   live-location + payment surface — not safe to ship untested overnight).

10. **Free-choice / hardening** — Ran security + performance advisors. Findings
    are mostly by-design (SECURITY DEFINER RPCs are the intended API; deny-all
    audit tables) or risky to change (PostGIS `spatial_ref_sys`, extensions in
    public). Documented rather than churning a live DB. See "Follow-ups".

## Migrations applied to production (also tracked in supabase/migrations)
- `20260842_grant_business_scope_helpers` — fixed the toggles/team writes.
- `20260843_backfill_and_default_user_alias` — alias privacy backfill + trigger.
- `20260844_enforce_business_location_freeze` — server-side location freeze.

## Follow-ups the owner should action (cannot be done safely/automatically here)
- **Rotate** the Supabase `service_role` key (was committed in git history) and
  the Android keystore password (`stryt123` hardcoded in `build.gradle`).
- Add `VITE_GOOGLE_MAPS_API_KEY` if true Google Places results are wanted
  (import currently falls back to OpenStreetMap).
- Enable **leaked-password protection** in Supabase Auth (dashboard).
- Confirm the 5 CI secrets exist (`ANDROID_KEYSTORE_*`,
  `SUPABASE_SERVICE_ROLE_KEY`) so the signed APK/AAB build completes.
- `spatial_ref_sys` RLS advisor is a PostGIS false-positive — leave as-is.

## Verification
`tsc -b --noEmit` clean; `npm run build` clean (see final CI/commit).
