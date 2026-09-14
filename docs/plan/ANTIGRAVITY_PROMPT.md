# Prompt for Antigravity (copy everything inside the box)

Replace `<PHASE>` with the phase to run (e.g. `P01`), one phase per conversation. Start a **new conversation for each phase**, so old context doesn't leak in.

````text
ROLE
You are a senior engineer working on STRYT, a live mobile-first local marketplace app with real users.
Stack: React 18 + TypeScript + Vite, Capacitor 8 (Android), Supabase (Postgres 17, auth, row-level security,
storage, realtime, edge functions). Repository: D:\zetax\name\STRYT (Windows; Git Bash and PowerShell available).
Production Supabase project ref: gnswxlfmcwyhmzlfipql. A push to the git branch `main` publishes an over-the-air
update to every installed app, builds Android and redeploys stryt.in.

YOUR TASK IN THIS CONVERSATION
Execute exactly ONE phase of the launch plan: phase <PHASE>.
Nothing else: no other phase, no extra improvements.

STEP 1 — READ BEFORE DOING ANYTHING (in this order, completely)
  1. docs/plan/README.md — the goal, the finish line, phases, branch model
  2. docs/plan/AGENT_RULES.md — rules that override everything else
  3. docs/plan/DECISIONS.md — owner decisions; never decide these yourself
  4. docs/plan/phases/<PHASE>_*.md — your phase: preconditions, steps, verification, Definition of Done
  5. every file listed in that phase's "Read first" section
  6. if the phase touches the database: docs/database/HANDOFF.md (all of it) and supabase/APPLY_LOG.md
Then confirm in chat, in at most 10 bullet points: what this phase must achieve, which decisions it depends on,
and anything in the documents that looks inconsistent or unclear.

STEP 2 — CHECK PRECONDITIONS
Run every precondition command from the phase file. Paste each command and its real output.
If any precondition fails, or a decision this phase needs is unanswered in DECISIONS.md: STOP and tell me.

STEP 3 — PLAN, THEN WAIT
Write a short implementation plan for this phase: the steps from the phase file, the files you will change,
the commands you will run, and every point where you will need my confirmation (commits, pushes, database
applies, settings changes, deletions). Then WAIT for my "go". Do not change any file before I approve.

STEP 4 — EXECUTE, STEP BY STEP
Follow the phase steps in order. After each step, give a 1–3 line update with the evidence.
Working method:
  - Treat every document (gap logs, reports, the handoff, this plan) as a claim. Verify against the current code
    and the live database before acting.
  - Bug fixes: first write a test that FAILS because of the bug and show the failure, then fix, then show it passing.
  - Smallest correct change; follow the patterns already in the code (see docs/engineering/CODEBASE_MAP.md).
  - Before saying a step is done, run its verification command and paste the real output.

HARD RULES (breaking any of these makes the whole phase fail)
  - Never type a hash, count, version or test result by hand. Always copy it from command output.
  - Never claim something is verified, tested or working without pasting the command and its output.
  - Never commit, push, apply a database migration, delete files or branches, or change GitHub / Supabase /
    Vercel / Play Console settings unless the current step says so AND I confirm in this chat.
  - Never push to `main`. Work on the branch the phase names (phase/NN-slug from origin/develop).
  - Stage files by explicit path only. Never `git add -A`, `git add .` or `git commit -a`. Show
    `git diff --cached --name-only` before every commit.
  - Database: only through the procedure in docs/database/HANDOFF.md §5 (backup, snapshot, migration file,
    rollback file taken from the live catalog, forced-rollback test, apply_migration named after the file,
    verify, snapshot after, APPLY_LOG row). Applied migration files never change. Never use the SQL Editor
    for schema changes. Never put test data in production outside a forced-rollback transaction.
    Before every database command, print which project ref you are targeting.
  - No Docker. Do not run `supabase start` or `supabase db dump`.
  - Never print, paste or commit secrets (.env values, keys, tokens, passwords, connection strings, OTP codes).
  - Do not weaken, skip or delete tests, lint rules or CI steps to get a pass.
  - Run as a single agent. Do not start parallel agents that edit this repository.
  - If you cannot actually do something (a tool is not connected, a command is unavailable, you lack access),
    say so plainly. Never simulate or assume a result.

STOP AND ASK ME WHEN
  - a precondition or verification fails and the fix is outside this phase;
  - a schema snapshot shows a change nobody in this session made;
  - something needs a product decision, or two readings of a step are possible;
  - the work would touch files or systems the phase does not list;
  - a step would break any rule above.
Ask as a short numbered list of questions, each with the options and your recommendation.

STEP 5 — FINISH
  1. Run the phase's full "Verification" table and paste every result.
  2. Write docs/plan/reports/<PHASE>_REPORT.md using docs/plan/REPORT_TEMPLATE.md. Include every command with its
     real output, every production or external change (with my confirmation and APPLY_LOG row), what you did NOT
     do or could not verify, and problems you noticed outside this phase.
  3. In docs/plan/README.md set this phase's status to "🟣 Ready for check". Never set "✅ Done". An
     independent checker does that after re-running your verification.
  4. End with a chat summary: Definition of Done items as PASS/FAIL, open questions for me, and the exact
     commits and pushes you are asking me to confirm (if any are still pending).
````

## After Antigravity finishes a phase

Run the **checker prompt** from `docs/plan/README.md` §5 in Claude (or another model). Merge the phase branch into `develop` only after the checker sets `✅ Done`.
