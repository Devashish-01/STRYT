# P13 Report — Device, accessibility & browser QA

**Agent / model:** Claude (Opus 5), Claude Code
**Session date (UTC):** 2026-09-18 (overnight run)
**Branch:** `night/2026-09-18`

**Status: the agent half is done; the device half has not started and cannot be done by an agent.**

## 1. What this phase is for

`docs/launch/ANDROID_LAUNCH_BLOCKERS.md` BLOCKER 3: *"Nothing has been tested on a device."* That is still
true of the hardware. The E2E suite proves 137 journeys in a desktop Chromium emulating a Pixel 7; it cannot
see a permission dialog, a push banner, the dialler, what Android does to a backgrounded process, or what
TalkBack reads out.

## 2. What was done (13.A — prepare)

### `docs/qa/DEVICE_MATRIX.md`

Five device classes, each present for a reason rather than for coverage:

| Class | Why it is in the list |
|---|---|
| Low-end on Android 7–8 | `minSdkVersion` is 24. Pre-Android-10 background location has no separate prompt, and MapLibre is the heaviest thing the app does. |
| Mid-range on 12–13 | The volume device in India, and where `POST_NOTIFICATIONS` became a runtime prompt. |
| Recent on 14–16 | Matches `targetSdkVersion 36` and its stricter foreground-service rules. |
| **Aggressive OEM — Xiaomi, Oppo, Vivo, Realme** | The likeliest cause of "push doesn't work" in India. These kill background processes regardless of Android's own rules, which is the whole reason BLOCKER 1 exists. |
| Tablet/foldable | Only to confirm nothing is catastrophically broken wide. |

It also records **what has already been proven and how**, so device time is not spent re-proving the E2E
suite, and it names the eight runtime permissions the manifest declares — each of which produces a dialog no
automated test sees.

### `docs/qa/DEVICE_QA_CHECKLIST.md`

Eight sections, ~60 rows, each stating **what pass looks like** so a result is either that or a fail rather
than a "seems fine". It deliberately does not repeat `MANUAL_TEST_PLAN.md`'s 420 lines of functional flows; it
covers only what a device proves: permissions, push in all three app states, process death mid-booking,
airplane mode mid-booking (which must not record a phantom success), hand-offs to dialler/maps/UPI, TalkBack,
font scaling, and the browser matrix.

The failure-recording example asks for the OEM skin, because "push is broken" and "this OEM kills the process"
are different bugs with different fixes.

### 13.D — automated accessibility pass

`tests/e2e/flows/accessibility.spec.ts` runs axe-core 4.13 over 13 screens against staging, at WCAG 2.1 A and
AA. It **reports rather than fails**: gating the suite before the count is known would just get the spec
skipped. Findings land in `test-results-e2e/a11y-findings.json`.

**34 findings across 8 rules.** Two fixed, two logged for the owner:

| Rule | Impact | Nodes | Outcome |
|---|---|---|---|
| `color-contrast` | serious | **132** across 11 screens | **P13-001, OPEN** — these are the Street Light design tokens, so fixing them changes the brand palette. Not the agent's call. |
| `meta-viewport` | moderate | all 13 screens | **P13-003, fixed** — `maximum-scale=1.0, user-scalable=no` disabled pinch-zoom app-wide. WCAG 1.4.4: anyone who needs to magnify text could not, anywhere. |
| `button-name` | **critical** | 10 across 5 screens | **P13-002, fixed** — back, share and save announced as just "button". Labelled via `t()`. |
| `image-alt` | **critical** | 3 | **P13-002, fixed** — gallery thumbnails open the photo viewer, so they are controls, not decoration. |
| `nested-interactive`, `aria-command-name`, `link-name`, `scrollable-region-focusable` | serious | 1 each | **P13-004, OPEN** — the map ones come from Leaflet's own DOM and the fix risks breaking the directions tap target. |

**What the pass does not prove.** axe reads markup. Roughly half of real accessibility problems are invisible
to it — whether the booking flow makes sense read aloud, whether focus lands somewhere sensible after a sheet
closes. Treating a clean axe run as "accessible" would be the mistake. That is checklist §6, on a device.

## 3. Not done — and it needs a person

| Item | Why |
|---|---|
| **The entire device pass** | Needs real phones. This is the owner's step, and it is what BLOCKER 3 is about. |
| The browser matrix | Needs Safari/iOS in particular. |
| Triaging device findings into the ledger | Follows the pass. |
| A staging-pointing test build | Not built this run. **Confirm it points at staging before handing it to anyone** — a tester booking against production creates real rows in a real merchant's console. |

## 4. Verification

| Check | Result |
|---|---|
| Accessibility spec | 13 passed, 1.9 min, against staging |
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | exit 0 |
| `npm run check-strings` | 966/970 — the new labels go through `t()` and do not eat the ratchet |
| `npx vitest run` | 719 passed |
| i18n parity | passes; `save_word` and `photo_n_of_m` added to en/hi/mr |

**One thing to watch:** I added `share_word` to `en.ts` without checking and it already existed further down,
under "Keys that were called but never defined". The duplicate is removed and each key now appears exactly
once per language, but it is the kind of mistake worth knowing I made.

## 5. Definition of Done

- [x] Device matrix
- [x] Device QA checklist with pass criteria
- [x] Automated accessibility pass in the suite
- [x] Findings triaged to the ledger (P13-001..004)
- [ ] The device pass itself — **owner**
- [ ] Browser matrix — **owner**
- [ ] BLOCKER 3 closed — not until the above happen
