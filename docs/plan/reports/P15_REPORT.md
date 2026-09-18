# P15 Report — Store, legal & public launch

**Agent / model:** Claude (Opus 5), Claude Code
**Session date (UTC):** 2026-09-18 (overnight run)
**Branch:** `night/2026-09-18`

**Status: 15.A done, 15.B drafted and unreviewed, 15.C onwards is owner-only.**
The phase's own precondition — "all phases P00–P14 ✅ Done" — is **not met**, and this report does not pretend
otherwise. What follows is the groundwork so the owner's console session is not blocked on an agent.

## 1. 15.A — Data inventory ✅

`docs/launch/DATA_INVENTORY.md`, built from the code and the live staging schema rather than from the existing
docs, which is what §15.A.1 asks for and which turned out to matter — the existing docs were wrong in several
places.

Verified by script before committing: **all 18 file paths and all 22 `table.column` references resolve**,
against the tree and against a live read of the schema. A *Data safety* declaration built on a guess is worse
than one with a stated gap.

Covers all the types the phase lists. Six findings came out of it:

| # | Finding | Status |
|---|---|---|
| 1 | **`purge-deleted-accounts` has never been deployed**, so the 30-day deletion promise starts and never completes | **Owner** — `RELEASE_RUNBOOK.md` part 2. *18 Sept:* deletion also never removed Aadhaar/PAN documents (P15-001) — fixed in both functions, reaches production with that deploy |
| 2 | `client_errors` had no scrubber; its "no PII" note was intent, not enforcement | **Fixed** in P14 (`scrubPii`) |
| 3 | `verification-docs` — the only non-public bucket, holding Aadhaar and PAN — deserves its own RLS re-check | **Done 18 Sept** — private on both projects, no read policy for any client role |
| 4 | "Contacts" must be declared **not collected**: `emergency_contacts` holds a STRYT user id, and the app never reads the device contact book | For the form |
| 5 | Map tile hosts and the geocoder receive location; absent from the policy | **Fixed** in §15.B below |
| 6 | Vercel Analytics runs with no in-app disclosure found | **Resolved 18 Sept** — it runs on the website only; its script cannot load inside the app |

## 2. 15.A.2 — Diff against the dossier and the policy ✅

> **Correction (later on 18 Sept).** This section overstated the problem. It diffed the dossier's short
> summary table rather than `play-console/DATA_SAFETY.md`, which is the copy/paste source and already
> declared most of the "missing" types. And it used the everyday meaning of *shared*: Play excludes
> service providers, so the "wrong on three rows" verdict below was itself wrong. The genuine gaps turned
> out to be one under-declaration (**in-app search history**) and the deletion precondition — both now
> fixed in `DATA_SAFETY.md`. The dossier summary has been replaced with a pointer to it.

`docs/launch/DATA_SAFETY_DIFF.md`. Three documents describe what STRYT collects and they disagree; this says
which one is wrong in each case, judged against the code rather than against each other.

**The privacy policy is the most accurate of the three** — it was drafted from the schema and it shows.
**The dossier's Data safety table is the weakest:**

- **Wrong on three rows.** Precise and approximate location are declared "not shared / user-to-user only";
  both go to Mapbox for geocoding, to the tile hosts for the viewport, and Nominatim as fallback. The FCM
  token is declared not shared, and sharing it with Firebase is its entire purpose.
- **Missing five data types entirely:** government ID (Aadhaar/PAN), payment references and UPI ids, physical
  address, crash logs, analytics. The first two are categories Google looks at closely.
- **Over-declares Name as Required**, when the alias is generated and the real name is optional.

**It also corrected me.** I had written that phone was the sign-in identifier and email optional. The shipped
UI offers Google only — `PhoneEntry.tsx` says so and wires only `handleGoogleLogin` — so email is *required*
and phone *optional*. The dossier was right and my inventory was wrong; fixed before it propagated. `/auth/otp`
is still routed, so phone sign-in is reachable by direct URL and unadvertised rather than gone, which is how
the E2E personas sign in.

## 3. 15.B — Legal 🟨 drafted, unreviewed

Three factual corrections to `legal/privacy-policy.md`:

1. §3.1 — Google Sign-In is currently the **only** way in, which is what makes email required and phone
   optional.
2. §5.2 — "your raw coordinates are not exposed to them" was true of other Users but not of the geocoding
   provider, which receives the pair by design. Scoped, with the processors stated separately.
3. §8.2 — names the map tile providers (OpenFreeMap, CARTO, Mapbox) and the Overpass API, all of which the
   code calls.

`legal/README.md` records these as **unreviewed**, with an empty reviewer row. §15.B.4 reserves the DPDP
Act / IT Rules judgement for a qualified Indian lawyer, and **nothing in any document written this run claims
compliance**.

§15.B.5's in-app checks (terms screen links, in-app deletion, a web deletion URL) were **not** re-walked this
run — they need the running app, and they are rows 7.4 and 7.5 of the device checklist.

## 4. Not done

| Step | Why |
|---|---|
| 15.C — Play Console | Owner-only console access |
| 15.D — release checks, closed test | Depends on 15.C, plus the 14-day wait if D11 requires it |
| ~~Rewriting dossier §4 from the inventory~~ | **Done differently, 18 Sept:** dossier §4 now points at `play-console/DATA_SAFETY.md`, which was revised instead — see the correction in §2 |
| §15.B.5 in-app confirmations | Needs the running app — device checklist 7.4/7.5 |

## 5. Owner steps, in the order that matters

1. **Deploy `purge-deleted-accounts`**, then prove one purge on staging. The policy and the store listing both
   promise deletion after 30 days and nothing completes it today. This is the one that could be called a
   misrepresentation rather than a gap.
2. **Fill the Data safety form from `play-console/DATA_SAFETY.md`** (revised 18 Sept). *(This step used to say "rewrite dossier §4 — five types missing, three rows wrong"; see the §2 correction.)*
3. **Lawyer review** of the legal documents; record reviewer and date in `legal/README.md`.
4. ~~Re-check `verification-docs` bucket RLS~~ — done by the agent on 18 Sept; it is locked down.
5. ~~Decide on Vercel Analytics~~ — it runs on the website only, so it is not an app declaration; the privacy policy already names it.
6. Play Console paperwork and the closed test.

## 6. Verification

| Check | Result |
|---|---|
| Every file path cited in the inventory | 18/18 exist |
| Every `table.column` cited | 22/22 exist in the staging schema |
| Compliance claimed anywhere | **No** — deliberately |
| `legal/README.md` reviewer row | Empty, marked pending |

## 7. Definition of Done

- [x] Data inventory built from code and schema, every citation verified
- [x] Diffed against the dossier and the policy, with a verdict per row
- [x] Privacy policy corrected where it described something the code does not do
- [x] Corrections recorded as unreviewed
- [ ] Lawyer review — **owner**
- [x] Data safety answers revised and made a single source (`play-console/DATA_SAFETY.md`) — agent, 18 Sept
- [ ] Play Console, closed test, launch — **owner**
- [ ] Account deletion actually completing — **owner step 1, and it gates an honest declaration**
