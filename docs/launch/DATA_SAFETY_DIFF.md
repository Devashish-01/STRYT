# Data safety: inventory vs the dossier vs the privacy policy

**Built:** 2026-09-18 (P15 §15.A.2) · **Against:** [`DATA_INVENTORY.md`](DATA_INVENTORY.md),
[`play-console/PLAY_CONSOLE_MASTER_DOSSIER.md`](play-console/PLAY_CONSOLE_MASTER_DOSSIER.md) §4,
[`../../legal/privacy-policy.md`](../../legal/privacy-policy.md)

Three documents describe what STRYT collects. They do not agree. This lists every disagreement and says
**which one is wrong**, judged against the code and the schema rather than against each other.

Headline: **the privacy policy is the most accurate of the three.** It was drafted from a direct reading of
the schema and it shows. The dossier's Data safety table is the weakest — it is missing five data types the
app definitely collects, two of which (government ID, payment references) are ones Google cares about.

---

## 1. Rows the dossier declares, checked

| # | Dossier says | Reality | Verdict |
|---|---|---|---|
| 1 | Phone — Collected **Yes**, Optional | Correct. Google is the only sign-in offered (`PhoneEntry.tsx`), so phone is not required. | ✅ dossier right |
| 2 | Email — Collected **Yes**, **Required** | Correct, and for the reason the dossier does not give: Google supplies it at sign-in. | ✅ dossier right |
| 3 | Name — Required | Arguable. `users.alias` is auto-generated (`src/lib/aliasSuggest.ts`) and the real name is optional. | ⚠️ over-declares |
| 4 | Precise location — Shared **Yes** *(User-to-user only)* | **Wrong.** Coordinates also go to **Mapbox** (`mapboxReverse`, forward search) and Nominatim as fallback, and the viewport goes to tile hosts. | ❌ dossier wrong |
| 5 | Approximate location — Shared **No** | **Wrong**, same reason. | ❌ dossier wrong |
| 6 | Messages — Shared *(Buyer-seller)* | Correct in substance. | ✅ |
| 7 | Photos — Shared *(Public/profile)* | Correct, and understated: the `uploads` bucket is `public=true`, so an object URL is readable by anyone who has it, not only by app users. | ⚠️ understated |
| 8 | Device / Other IDs — Required, not shared | **Wrong on sharing.** The FCM token is sent to **Firebase Cloud Messaging** — that is its whole purpose. Also arguably optional: notifications can be declined. | ❌ dossier wrong |

## 2. Data the app collects and the dossier does not declare at all

These are the ones that would make the declaration incomplete rather than merely imprecise.

| # | Missing type | Evidence | Play category it belongs in |
|---|---|---|---|
| 9 | **Government ID** — Aadhaar and PAN documents | `verification-docs` bucket; `businesses.aadhaar_doc_url`, `businesses.pan_doc_url`, `providers.verification_document_url` | Personal info → Government ID (a *sensitive* one) |
| 10 | **Payment references and UPI ids** | `appointments.payment_reference`, `agreements.payment_reference`, `queue_tokens.payment_reference`, `businesses.upi_id`, `providers.upi_id`/`upi_qr_url`, `custom_payments` | Financial info → Other financial info |
| 11 | **Physical address** | `businesses.address_line1`, `places.address_line1`, `appointments.delivery_address_line`, `bulk_deal_pledges.delivery_address`, `request_me_toos.delivery_address` | Personal info → Address |
| 12 | **Crash logs** | `client_errors` table, written by `src/lib/monitoring.ts` | App info and performance → Crash logs |
| 13 | **Analytics / diagnostics** | Vercel Analytics + Speed Insights, `src/main.tsx:51-52` | App info and performance → Diagnostics |

**Also worth an explicit "not collected":** Contacts. `emergency_contacts.contact_user_id` is a STRYT user
id; nothing in the app reads the device contact book. Declaring it collected would be wrong in the other
direction.

## 3. Privacy policy vs the code

The policy holds up well. Four things to fix:

| # | Policy says | Reality | Fix |
|---|---|---|---|
| 14 | §3.1 "Authentication identifiers from **Google Sign-In (via Firebase Authentication)**" | Correct — and it is now the *only* offered method, which the policy does not say. | Say Google is the only sign-in method today. |
| 15 | §3.2 Mapbox primary, Nominatim fallback | **Correct** — verified in `src/lib/geocode.ts`. | None. Carry this wording into the dossier. |
| 16 | §5.2 "your raw coordinates are not exposed to them" | True of *other users*. Not true of Mapbox, which receives the raw pair to reverse-geocode. | Scope the sentence to other users, and state the processor separately. |
| 17 | §10 Retention | Describes deletion. **`purge-deleted-accounts` is not deployed**, so the 30-day purge does not run. | Deploy it (owner step 2), or the policy describes something that does not happen. |

## 4. The one that is not a wording problem

Findings 4, 5, 8, 9, 10, 11, 12, 13 are all "write it down correctly". **Finding 17 is different**: the
privacy policy and the store listing both promise that an account is deleted after 30 days, and the function
that completes it has never been deployed. A user who requests deletion today enters the grace period and
stays there.

That is the single highest-priority item in this document, and it is an owner step
(`docs/plan/NIGHT_RUN.md`, owner step 2).

## 5. Recommended order

1. Deploy `purge-deleted-accounts`, then prove one purge on staging (finding 17).
2. Rewrite the dossier §4 table from `DATA_INVENTORY.md` §1 — it is missing five types and wrong on three.
3. Patch the privacy policy for findings 14 and 16 (task A3).
4. Re-check `verification-docs` bucket RLS before declaring government ID (inventory finding 3).
5. Decide whether Vercel Analytics stays; if it does, disclose it in-app.
