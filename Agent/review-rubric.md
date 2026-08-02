# Review Rubric — Four Feature Validation Checks

Referenced by `AGENTS.md` Phase 2. Evaluate **every feature** from the
inventory against all four checklists below. Mark each check:
`pass`, `fail`, `partial`, `n/a`, or `unverified` (flow only).

**After the four checks**, append the layer-specific detail block from
`layer-checklists.md` (visual table for frontend/website, API table for
backend). This is mandatory — not optional depth.

A finding must point at something concretely wrong or missing.
"Could be cleaner" is not a finding; "Submit button missing per tracker
§Login" is.

Before logging **database** or **functionality** findings, weigh them
against confirmed architecture and schema docs — patterns that look wrong
in isolation may be documented conventions (e.g. multi-tenant scoping).

---

## Check 1 — Screen alignment

Compare tracker UI spec to actual pages/components.

**Frontend & website:** follow the full **Visual & screen detail** workflow
in `layer-checklists.md` (UI element table, states, responsive/a11y).
Screen alignment `pass` only if every tracker-listed UI element is present.

**Backend:** mark screen alignment `n/a`.

- [ ] Page or route exists at the path the tracker specifies
- [ ] Page title, heading, and navigation match tracker
- [ ] All buttons listed in tracker are present with correct labels
- [ ] All form fields listed in tracker are present (name, type, placeholder)
- [ ] No extra interactive elements absent from tracker (log as gap if undocumented)
- [ ] Layout regions match spec (sidebar, modal, tabs, table columns)
- [ ] Destructive actions use confirmation when tracker requires it
- [ ] Loading, empty, and error states exist for async views
- [ ] Responsive behavior: no broken layout at small/large viewports
- [ ] Accessibility: labeled inputs, alt text, keyboard focus order

**Common findings:**

- Tracker describes UI not implemented → `gap`
- Code has UI not in tracker → `gap`
- Wrong label, missing button, wrong route → `bug`

---

## Check 2 — Functionality

Verify behavior matches tracker acceptance criteria.

**Backend:** document every endpoint in **API & handler detail**
(`layer-checklists.md`) before scoring functionality.

- [ ] Each button/action triggers the documented behavior
- [ ] Form validation matches tracker rules (required fields, formats)
- [ ] API calls use documented method, path, and payload shape
- [ ] API responses handled per spec (success redirect, error messages)
- [ ] Permissions/roles enforced as tracker describes
- [ ] Edge cases listed in tracker are handled (or logged as gap)
- [ ] Client and server validation agree on the same business rules
- [ ] Async actions show loading/disabled state; prevent double-submit
- [ ] Error messages are specific and actionable, not generic

**Common findings:**

- API endpoint missing or wrong verb → `bug` or `gap`
- Validation mismatch FE vs BE → `bug`
- Tracker criterion not implemented → `gap`

---

## Check 3 — Database validation

Verify data layer against confirmed schema/migrations/ORM.

- [ ] Tables/collections referenced by the feature exist
- [ ] Columns/fields match documented types, nullability, defaults
- [ ] Foreign keys and relations match schema doc
- [ ] Enums/status values match documented allowed set
- [ ] Tenant/scoping rules applied correctly (if documented)
- [ ] CRUD operations target the correct table/entity
- [ ] Indexes or constraints mentioned in spec are used where required
- [ ] Soft-delete vs hard-delete matches tracker/schema
- [ ] Migration state consistent with code (no orphaned references)

Mark `n/a` for pure static/marketing pages with no data persistence.

**Common findings:**

- Code writes to wrong table → `bug`
- Missing column used in query → `bug`
- Schema doc and tracker disagree → `doc-mismatch`

---

## Check 4 — Flow validation (log files)

Trace the feature through logs, audit trails, or runtime evidence.

- [ ] Happy path produces expected log markers or audit entries
- [ ] Error path logs failure with enough context to debug
- [ ] Status transitions match System Journey / tracker flow (e.g. draft → submitted)
- [ ] Idempotency: duplicate actions don't corrupt state (if applicable)
- [ ] External service calls logged with correlation/request ID
- [ ] Sensitive data not logged in plain text

If no logs available (per discovery manifest):

- Set check to `unverified`
- Note which scenario must be run manually to validate
- Log `gap` only if tracker explicitly requires audit trail/logging

**Common findings:**

- Missing audit log for state change → `gap` or `bug`
- Wrong status transition → `bug`
- Cannot verify → check `unverified`, optional minor `gap`

---

## Severity guide

| Severity | Criteria |
|----------|----------|
| critical | Blocks core flow; data loss/corruption risk; security bypass |
| major | Feature broken or spec deviation affecting primary use case |
| minor | Cosmetic, edge case, or missing non-critical logging |

---

## Edge-case bank

When describing functionality findings, reference applicable cases:

**Input / data**

- Empty, null, zero, negative, oversized input
- Special characters, unicode, whitespace-only
- Duplicate submissions (double-click)

**State / timing**

- Concurrent access; action before dependencies load
- Timeout, dropped connection; session expired mid-action

**Access / permissions**

- Unauthenticated or under-privileged access attempts
- Cross-tenant or cross-user resource access

**UI-specific**

- Small/large viewport; keyboard-only; content overflow

Pick only cases relevant to the feature — do not paste the full bank
into every finding.
