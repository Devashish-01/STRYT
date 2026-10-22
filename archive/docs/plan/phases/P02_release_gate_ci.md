# P02 — Release gate in CI

**Who:** agent; owner changes GitHub branch-protection settings and confirms pushes
**Size:** 1 session
**Depends on:** P01

## Goal
No code reaches users (OTA, Android build, web) unless type-check, lint, unit tests and the production build all pass in CI. Every pull request gets the same checks.

## Why
- `.github/workflows/ota-release.yml` and `android-release.yml` run on every push to `main` and **only build**.
- A broken commit on `main` is published to every installed app within minutes.
- There's no CI on pull requests at all.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| On a fresh phase branch from develop | `git fetch origin && git switch -c phase/02-ci-gate origin/develop` | Switched |
| Clean tree | `git status --short` | Empty |
| Local gate passes today | `npm run lint && npx eslint . && npx vitest run && npm run build` | All exit 0 |

## Read first
- `.github/workflows/ota-release.yml`, `.github/workflows/android-release.yml`, `.github/workflows/purge-deleted-accounts.yml`
- `vitest.config.ts`, especially the `WEB_PUSH_VAPID_CONFIGURED` / `PUSH_BACKEND_CONFIGURED` attestations
- `docs/database/HANDOFF.md` W1: why tests must pass with **no `.env` at all**
- `package.json` scripts

## Known traps
1. **Don't create `.env` before running tests.** `tests/push-delivery` falls back to an attestation only when **no** `.env` exists. A `.env` without `VITE_VAPID_PUBLIC_KEY` makes those tests fail. Run tests first; create a placeholder `.env` only for the build step.
2. **ESLint has 30 warnings today.** Gate with `--max-warnings 30` (a ratchet). P12 lowers it to 0.
3. **Permissions.** The OTA job needs `contents: write` (it pushes the version bump). The verify job only needs `contents: read`.
4. Release workflows trigger only on `main`, so this phase is tested through PRs and a throwaway branch, **never a push to `main`**.

## Steps
1. Add to `package.json`:
   - `"verify": "npm run lint && eslint . --max-warnings 30 && vitest run && npm run build"`
   - `"verify:ci:test": "npm run lint && eslint . --max-warnings 30 && vitest run"`
2. Create `.github/workflows/ci.yml`:
   - `on:` `pull_request` (all branches), `push` to `develop`, and `workflow_call`.
   - One job `verify` on `ubuntu-latest`, `permissions: contents: read`, Node 22 with npm cache:
     1. `npm ci`
     2. `npm run verify:ci:test` (no `.env` exists at this point)
     3. Write a **placeholder** `.env` with non-secret dummy values for the `VITE_*` keys the build reads (list them from `src/config.ts` and `ota-release.yml`)
     4. `npm run build`
   - `concurrency: ci-${{ github.ref }}` with `cancel-in-progress: true`.
3. In `ota-release.yml`:
   - Add `verify: uses: ./.github/workflows/ci.yml` with `permissions: contents: read`.
   - Add `needs: verify` to the existing job.
   - Keep every existing step unchanged.
4. Do the same in `android-release.yml`.
5. Run `npm run verify` locally and paste the tail of each stage.
6. Prove the build works with **no real `.env`**, as CI will:
   - `git worktree add --detach .verify-wt HEAD`
   - Inside it, write the placeholder `.env` from step 2 and run `npm run build` using `../node_modules`: `node ../node_modules/vite/bin/vite.js build`, after the colour/token scripts and `tsc -b`.
   - `cd` out, then `git worktree remove --force .verify-wt`.
7. Commit (owner-confirmed): `ci: run type-check, lint, tests and build on every PR and before every release`.
8. Push `phase/02-ci-gate` (owner-confirmed) and open a PR into `develop`: `gh pr create --base develop`. Wait for `gh pr checks --watch`. It must pass.
9. **Negative test** (owner-confirmed):
   - Create branch `ci-negative-test` from the PR branch.
   - Add a deliberately failing unit test (`expect(1).toBe(2)` in a new file `src/lib/ciNegative.test.ts`) and push.
   - Open a draft PR. Confirm the `verify` check **fails**.
   - Close the PR and delete the branch, local and remote, with owner confirmation.
10. **Owner, in GitHub → Settings → Branches:** add protection rules for `main` and `develop`:
    - require a pull request before merging;
    - require the status check **`verify`** to pass;
    - require branches to be up to date;
    - disallow force pushes.

    The bot's version-bump push to `main` must keep working. The owner either allows `github-actions[bot]` to bypass, or confirms the bump step still succeeds; check on the next release.
11. Merge the PR into `develop` after the checker passes.
12. Update `docs/database/HANDOFF.md` §5 and `docs/engineering/CODEBASE_MAP.md` §1 with the new `npm run verify` gate.

## Verification
| Command | Expected |
|---|---|
| `npm run verify` | exit 0 |
| `gh pr checks <PR number>` | `verify` passes |
| `gh pr checks <negative PR number>` (before deleting) | `verify` fails |
| `gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'` | contains `verify` |
| `grep -n "needs: verify" .github/workflows/ota-release.yml .github/workflows/android-release.yml` | one match in each |

## Definition of Done
- [ ] `ci.yml` runs on PRs, on pushes to `develop`, and as a reusable workflow.
- [ ] OTA and Android release jobs `need` `verify`.
- [ ] Positive and negative PR runs proven.
- [ ] Branch protection on `main` and `develop` requires `verify`.
- [ ] `npm run verify` documented in HANDOFF and CODEBASE_MAP.

## Stop and ask if
- Tests fail in CI but pass locally. Investigate the environment (line endings, missing `.env`); don't skip tests.
- Branch protection would block the bot's version bump and there's no safe setting.

## Checker checklist
- Read the three workflow files. Confirm no release step runs without `needs: verify`, and the tests run before any `.env` is written.
- Confirm the negative-test branch and PR are gone: `gh pr list --state all --search ci-negative-test`, `git ls-remote --heads origin ci-negative-test`.
- Re-run `npm run verify` locally.
