# Closed-test remediation status (2026-11-25)

Production project: `gnswxlfmcwyhmzlfipql`.

| Migration | Purpose | Production status |
| --- | --- | --- |
| `20261021_delivery_live_tracking_enabled.sql` | Returns live rider coordinates and repairs delivery tracking queries. | Applied; `my_delivery_progress` return type checked. |
| `20261022_multi_persona_storefront.sql` | Adds chat sender/team fields and the combined customer activity view. | Applied after replacing references to nonexistent appointment columns with `appointment_items`; columns and view checked. |
| `20261023_security_and_logic_fixes.sql` | Closes reservation helper access, proposal-counter writes, handoff and pledge guards, and password lockout overflow. | Applied as five separately named production migrations after the original batch timed out; each guard and grant checked. |
| `20261024_harden_geofence_discovery.sql` | Clamps public nearby search radius and result size. | **Applied as `20261024_harden_geofence_discovery_invoker`.** The rejected `SECURITY DEFINER` plan was rewritten to retain caller permissions, table RLS, and existing execute grants. All seven live functions were checked for `prosecdef = false`. Listing KYC exposure remains separate. |
| `20261025_teleportation_and_telemetry_hardening.sql` | Accepts seven-argument rider GPS pings, logs invalid positions, and stores controlled location history. | Applied; signatures and location-history write policy checked. |
| `20261026_onboarding_legal_version_sync.sql` | Aligns onboarding terms acceptance with the current legal version. | Applied to production and staging separately before this remediation; verified in the apply log. |
| `20261027_closed_test_privacy_and_authorization.sql` | Masks private public-profile fields, limits gate passes and boosts, authorizes broadcasts, and moves leaderboard awards to trusted triggers. | Applied as separate production migrations; function body, policies, grants, and three triggers checked. Listing KYC columns remain a separate unresolved exposure. |

The original `20261023` and `20261027` files were not submitted as single migration ledger entries. Their production changes were applied in smaller named units and verified. Future schema reconciliation must compare live definitions, not infer deployment solely from those original filenames.

## Release dependencies

- The existing Play closed-test build does not include local Android and web code changes. Publish a new signed AAB and verify the Play build before claiming those fixes reached testers.
- The current client queries `businesses` and `providers` with `select("*")`. Revoking table-wide `SELECT` immediately would break that installed build. First migrate clients to safe public fields and owner/admin-specific access, then revoke private-column access after the compatible release is in use.
- Supabase Auth email sign-in was enabled and `https://www.stryt.in/**` was added to the redirect allow list through the Management API using the existing personal access token. Both values were read back from production.
- The nightly `DRIFT_DATABASE_URL` GitHub secret is still missing; the local environment does not have that credential, and the installed `gh` login is invalid.
