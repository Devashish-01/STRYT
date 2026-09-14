# P10 — Translation completeness

**Who:** agent; native Hindi and Marathi reviewers (D9) approve the wording
**Size:** 3–4 sessions. 10.A the checker script; 10.B–10.C converting screens; 10.D review fixes.
**Depends on:** P09; D9 answered

## Goal
A Hindi or Marathi user never sees English in customer-, merchant- or provider-facing screens. English, Hindi and Marathi have identical key sets, and CI blocks new hardcoded strings.

## Baseline (2026-09-13)
- `src/lib/i18n.tsx`: en 1,170 keys, hi 1,170, mr 1,166 (4 missing).
- 62 of 245 screen/component files use `useI18n`.
- ~356 `showToast("literal")` calls in 97 files, vs 40 `showToast(t(…))`. Top files:
  - `BusinessSettings.tsx` 20, `AdminPanel.tsx` 16
  - `useCommerceSlice.ts` 12, `ProviderMoney.tsx` 12, `CommunityPostDetail.tsx` 12
  - `BusinessAccess.tsx` 11
  - `ProviderJobs.tsx` 10, `BusinessAppointments.tsx` 10, `ProfileEdit.tsx` 10
  - `RequestDetail.tsx` 9, `BulkDealsManager.tsx` 8, `BusinessPayments.tsx` 7
- Server-written notification titles and bodies (SQL functions) are English-only.

## Preconditions
| Check | Command | Expected |
|---|---|---|
| Branch | `git switch -c phase/10-i18n origin/develop` | Switched |
| D9 answered | `DECISIONS.md` | Reviewers named; admin panel scope decided |
| Suites green | `npm run verify`, `npm run e2e` | exit 0 |

## Read first
- `src/lib/i18n.tsx`: the structure; `t(key, fallback)`; `tf`; fallback order (`lang → en → fallback → key`)
- `docs/i18n_shadow_pattern` note in project memory, if you have it. **Trap:** `.map(([t, label]) => …)` shadows `useI18n()`'s `t`. Run `git grep -n "\[t," -- src` before wiring a file.
- `src/lib/format.ts` (`formatDate` with `LOCALE_BY_LANG`)
- Existing i18n tests in `src/lib/*Notifications.test.ts` (they check keys)

## Steps

### 10.A — The checker (ratchet first, then zero)
1. Write `scripts/check-hardcoded-strings.mjs`. It scans `src/**/*.tsx` and `src/store/**/*.ts`, excluding tests and paths excluded by D9 (e.g. `src/screens/admin/`), and reports:
   - `showToast("…")` / `showToast('…')` with letters;
   - JSX attribute literals with letters: `placeholder`, `title`, `aria-label`, `alt`, `label`;
   - JSX text nodes with ≥2 letters that aren't inside `t(`, excluding pure symbols, numbers, brand names and `.i18n-ignore` allow-list entries.

   Output `file:line: text`, plus a total.
2. Commit an allow-list `scripts/i18n-allowlist.json` (brand names such as "STRYT", units, emoji-only). Every entry needs a reason.
3. Add to `package.json`: `"check-strings": "node scripts/check-hardcoded-strings.mjs --max <current total>"`. Add it to `npm run lint`, so CI enforces it as a ratchet: the count can't grow.
4. Add a unit test `src/lib/i18n.parity.test.ts`:
   - en, hi and mr have **identical key sets** (fails today on the 4 missing mr keys; fix them);
   - no key has an empty value.

### 10.B–10.C — Convert, by user impact
5. Order:
   1. customer screens: onboarding, home, search, business/provider detail, booking sheet, my appointments, queues, requests/agreements, chat, notifications, profile/settings;
   2. merchant console;
   3. provider console;
   4. shared components and the store slices that raise toasts.
6. For each file:
   - import `useI18n` (watch the shadow trap);
   - replace literals with `t("<area>_<meaning>")`;
   - add the key to **en, hi and mr together**. hi/mr are machine-drafted, marked for review in `docs/i18n/REVIEW_QUEUE.md` (key, en, hi draft, mr draft);
   - keep interpolation through the existing `tf` helper, never string concatenation;
   - use `formatDate` for dates and `₹` with `Intl.NumberFormat('en-IN')` for money.
7. After each batch:
   - lower `--max` in `check-strings` to the new total;
   - run `npm run verify` and the E2E specs for the screens touched (E2E uses English, so text assertions must still match `en`).
8. **Server-side notification text:** don't translate inside SQL. If notification titles/bodies must be localised, render them on the client from `type` + `metadata`, as the notification cards already mostly do. List any notification still showing server English in the report as a `DECISION`.

### 10.D — Native review
9. Send `docs/i18n/REVIEW_QUEUE.md` to the reviewers (owner does this). Apply their corrections exactly, mark the rows reviewed, and record reviewer and date.
10. Set `--max 0` for in-scope paths. The phase isn't done until then.
11. Screenshots: switch the app language to hi and to mr on staging, and capture the 20 most-used screens into `docs/i18n/screenshots/`. Check for overflow and truncation at 360 px width; fix layout issues within the phase.

## Verification
| Command | Expected |
|---|---|
| `npm run check-strings` | exit 0 with `--max 0` |
| `npx vitest run src/lib/i18n.parity.test.ts` | pass |
| `docs/i18n/REVIEW_QUEUE.md` | Every row reviewed, with a reviewer name and date |
| `npm run e2e` | 0 failed |
| `npm run verify` | exit 0 |

## Definition of Done
- [ ] 0 hardcoded user-facing strings in scope, enforced in CI.
- [ ] Identical key sets across en/hi/mr, enforced by a test.
- [ ] Every new hi/mr string reviewed by a native speaker.
- [ ] hi/mr screenshots of the top 20 screens, with no overflow at 360 px.

## Stop and ask if
- A string's meaning is ambiguous without product context.
- The admin panel scope (D9) is unclear.

## Checker checklist
- Run `npm run check-strings` and the parity test.
- Switch to Marathi on staging and open 5 random converted screens: no English remains, except allow-listed text.
- Grep for concatenated translations: `git grep -n -E "t\\(\\"[a-z_]+\\"\\) *\\+" -- src` should print nothing.
