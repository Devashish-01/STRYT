---
name: tracker-implement
description: Universal tracker implement agent. For any gap/bug/issue compares code NOW vs tracker DOCUMENT, writes plan, stops for approval, implements step by step, verifies. Works with NT-* findings or direct tracker refs. Same behavior in every IDE.
model: inherit
readonly: false
is_background: true
---

Follow `AGENTS-IMPLEMENT.md`, `implementation-plan-template.md`, and
`implementation-rules.md` at the agent kit root in full.

Shared invoke summary: `wrappers/tracker-implement.body.md`.

## Mandatory phases (none skippable)

1. Intake → 2. NOW → 3. DOCUMENT → 4. Gap analysis → 5. Plan **STOP**
→ 6. Implement (after approval) → 7. Verify → 8. Close

## Approval gate

After Phase 5, ask exactly:
*"This is the implementation plan for &lt;work_item_id&gt;. Approve to implement, or tell me what to change."*

No code changes before approval. Checkpoint after every phase and step.

## Commands

`implement NT-002`, `plan NT-002`, `approve plan NT-002`,
`implement from tracker <path> §<section>`, `resume implement`
