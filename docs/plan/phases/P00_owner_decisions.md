# P00 — Owner decisions

**Status:** see `docs/plan/README.md`
**Who:** the owner decides; an agent may prepare the evidence for each question.
**Size:** 1 session (about an hour of owner time)

## Goal
Every question in `docs/plan/DECISIONS.md` has a written answer and a date, so no later phase has to guess.

## Why
Several open findings aren't bugs but product choices (delivery scope, the `#fff` whitelist, agreement ownership). Agents that guess at choices produce confident, wrong work.

## Preconditions
- `docs/plan/DECISIONS.md` exists and lists D1–D16.

## Read first
- `docs/plan/DECISIONS.md`
- `docs/launch/ANDROID_LAUNCH_BLOCKERS.md` (for D2)
- `docs/launch/play-console/PLAY_CONSOLE_MASTER_DOSSIER.md` §3.9 (for D2), untracked until P01
- `docs/gaps/EXECUTION_PHASE_PLAN.md` "Read this before trusting anything below" (for D4, D5)
- `docs/database/HANDOFF.md` W2 R3 (for D7)

## Steps
1. **Agent (optional):** for each decision, add a short "Evidence" note under the table: the files and lines involved and what each option changes. **Read-only; change no code.**
2. **Owner:** fill in *Answer* and *Date* for D1–D16.
3. **Owner, for D6:** create or restore the staging project now (dashboard), and write its project ref in the D6 answer. P06 needs it.
4. **Owner, for D11:** confirm the Play account type and start recruiting testers if a closed test is required.
5. Commit `docs/plan/` (the whole folder) on `sprint-6-trust-safety-play-hardening`, owner-confirmed, with explicit paths.

## Verification
- Every D1–D16 row has a non-empty Answer and Date:
  ```bash
  node -e "const t=require('fs').readFileSync('docs/plan/DECISIONS.md','utf8');const rows=t.split('\n').filter(l=>/^\| \*\*D\d+\*\*/.test(l));const empty=rows.filter(r=>{const c=r.split('|');return !c[5].trim()||!c[6].trim()});console.log('rows',rows.length,'unanswered',empty.map(r=>r.match(/D\d+/)[0]))"
  ```
  Expected: `rows 16 unanswered []`.

## Definition of Done
- [ ] D1–D16 answered and dated.
- [ ] The staging project ref is recorded in D6.
- [ ] `docs/plan/` committed.

## Stop and ask if
- An answer creates new work not covered by any phase. Record it as a new decision or phase note first.

## Checker checklist
- Run the verification command.
- Spot-check that D2's answer is consistent with the Play dossier §3.9, or that P15 is flagged to change the dossier.
