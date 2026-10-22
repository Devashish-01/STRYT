# 17 — Business: Team, Leads, Community

**Priority:** P0/P1.
**Screens:** `BusinessAccess` (team grants), `QnaManager`, `LeadsInbox`,
`BusinessRequests`, `BusinessCommunity` (= `ProfileCommunity.tsx`).

## Flow A — Team access management

Full security script: `MANUAL_TEST_PLAN.md` §1.1 / workflow 23. Here, the
happy-path management UI:

| # | Step | Expected |
|---|------|----------|
| 1 | Grant a team member **FULL** access | They get the whole console except owner-only screens |
| 2 | Grant **SCOPED** access with specific scopes (`catalog`, `queue`, `appointments`, `leads`) | Nav shows exactly those screens |
| 3 | Edit an existing grant's scopes | Takes effect without the grantee needing to re-login |
| 4 | Revoke | Grantee bounced within seconds |
| 5 | List all grants for this business | Accurate, matches what was actually granted |

## Flow B — Q&A

| # | Step | Expected |
|---|------|----------|
| 1 | Customer asks a question on the business page | Appears in `QnaManager` |
| 2 | Business answers | Visible publicly on the business page |

## Flow C — Leads inbox

| # | Step | Expected |
|---|------|----------|
| 1 | A customer's interaction generates a lead (view, message, etc.) | Appears in `LeadsInbox` |
| 2 | Respond to a lead | Customer receives the response (chat or notification) |
| 3 | This screen is shared between business and provider via an `entityType` prop | Confirm the provider console's leads inbox (workflow 19) shows the same shape, scoped correctly |

## Flow D — Requests (business responding to open customer requests)

| # | Step | Expected |
|---|------|----------|
| 1 | `BusinessRequests` | Open requests matching the business's category nearby |
| 2 | Submit a proposal from here | Same `SubmitProposal` flow as workflow 04 |

## Flow E — Posting to community as the business

| # | Step | Expected |
|---|------|----------|
| 1 | `BusinessCommunity` (business's own posts view) | Lists everything posted under this business identity |
| 2 | "Post to community" tile | Opens `CommunityCompose` pre-scoped to this business — see workflow 05 Flow B and workflow 16 Flow A for the bulk-buying-specific path |
