# STRYT — Legal Documents

This folder contains STRYT's legal and policy documents, drafted from a direct reading of the STRYT codebase (frontend, the 72-table Supabase schema, Edge Functions, and configuration) so that each clause maps to functionality that actually exists in the product.

> **Status: DRAFT for legal review — not yet in force.** Every document is version 1.0 and must be reviewed and approved by qualified Indian legal counsel, and the fill-in items below completed, before publication.

## Documents

| Document | Purpose |
|---|---|
| [terms-and-conditions.md](terms-and-conditions.md) | Master Terms & Conditions (all 54 requested sections). The anchor document; everything else is referenced from it. |
| [TERMS_SUMMARY.md](TERMS_SUMMARY.md) | Plain-language summary of the Terms for everyday users. |
| [privacy-policy.md](privacy-policy.md) | DPDP Act 2023-aligned privacy notice; data categories mapped to the real schema. |
| [cookie-policy.md](cookie-policy.md) | Cookies & browser local-storage usage (STRYT relies mostly on local storage). |
| [refund-cancellation-policy.md](refund-cancellation-policy.md) | How refunds/cancellations work given STRYT holds no funds. |
| [merchant-terms.md](merchant-terms.md) | Additional terms for Business owners, Providers, and Delegated Users. |
| [acceptable-use-policy.md](acceptable-use-policy.md) | Enforceable rules on prohibited content, goods, and conduct. |
| [data-retention-policy.md](data-retention-policy.md) | Retention periods and the account/profile deletion + anonymisation process. |
| [grievance-redressal-policy.md](grievance-redressal-policy.md) | Grievance Officer and process (IT Rules 2021, DPDP, Consumer Protection). |
| [community-guidelines.md](community-guidelines.md) | User-friendly conduct expectations for the community surfaces. |
| [disclaimer.md](disclaimer.md) | Consolidated disclaimers (platform-not-party, no-warranty, verification, safety). |

## Laws considered

Indian Contract Act 1872; Information Technology Act 2000 and the IT (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021; Digital Personal Data Protection Act 2023; Consumer Protection Act 2019 and its e-commerce rules; Payment and Settlement Systems Act 2007 and UPI/NPCI framework (relevant to why STRYT is **not** a payment system — it holds no funds); Arbitration and Conciliation Act 1996; GST law (as a Seller responsibility).

## Product facts these documents are built on (verified in code)

- **No money custody.** STRYT is not a payment gateway/aggregator/escrow. Payments are direct Customer to Seller via UPI deep-link/QR or cash; the app only records claim/confirm/reject **status**. No Razorpay/gateway is wired. Therefore **STRYT issues no refunds**.
- **Paid features are dormant.** Pro plans, provider lead packs, boosts, wallet/loyalty/coupons, recurring subscriptions, the society/gate-pass module, phone/email OTP sign-in, and SMS all exist in the code but are **not available to users** — documented as such, not as live offerings.
- **"AI" is statistics.** The price suggestion is SQL aggregation of recent quotes; the deployed `ai-assist` function calls no external LLM and does not process user free-text. (A Gemini key is referenced in config but not wired into the deployed function.)
- **Auth** is Google Sign-In via Firebase only; guests are capped to ~1 km.
- **Sensitive data:** optional KYC/verification documents are uploaded and stored; exact location is used but only the **last-known** point is stored (no history); privacy-by-default (real name/contact/location private).
- **Deletion** = 30-day recoverable grace period, then anonymise user record + delete Auth identity + purge storage/KYC files; blocked while active deals or "held"-status payment records exist; admin actions audit-logged; full customer deletion needs Super Admin + typed confirmation.
- **Integrations:** Supabase (data/auth/storage), Google/Firebase (auth + FCM push), OpenStreetMap/Nominatim (maps/geocoding), Vercel (hosting + anonymous analytics), SMTP/Gmail (support email to stryt.assistance@gmail.com), Web Push. Domain: **stryt.in**.

## ⚠️ Must be completed before publication (fill-ins)

Search the documents for these bracketed tokens and complete them:

1. **`[STRYT OPERATOR LEGAL NAME]`** — the legal entity operating STRYT (proprietorship / Pvt Ltd / etc.).
2. **`[REGISTERED ADDRESS]` / `[REGISTERED OFFICE ADDRESS]`** — registered office.
3. **`[CIN...]` and `[GSTIN]`** — company/firm registration and GST numbers, if applicable.
4. **`[GRIEVANCE OFFICER NAME]` + designation + dedicated email + phone** — a named, India-based Grievance Officer is **mandatory** (IT Rules 2021 / DPDP).
5. **`[grievance@stryt.in]`** — provision a dedicated grievance mailbox (interim: contact@stryt.in / stryt.assistance@gmail.com).
6. **`[CITY, STATE OF REGISTERED OFFICE]`** — governing jurisdiction / arbitration seat in Terms §50–51 (currently suggested as Pune, Maharashtra based on the app's default location — confirm).
7. **Effective Date** — set on each document at publication.

## Open compliance items flagged for STRYT (decide with counsel)

- **Age assurance / children (DPDP):** no technical age gate exists; Terms set 18+ by representation only. Decide on age-verification and verifiable parental-consent controls.
- **Data residency:** confirm the actual hosting region(s) of Supabase/Vercel/Firebase and state them in Privacy Policy §9 and Terms §44; assess DPDP cross-border rules.
- **Retention enforcement:** the periods in the Data Retention Policy marked "(policy default — configure)" are targets, not yet all hard-coded — implement pruning (logs/notifications) and prompt KYC-document deletion after a verification decision.
- **Significant Data Fiduciary / significant intermediary status:** if thresholds are met, appoint a DPO / Chief Compliance Officer / Resident Grievance Officer and adopt stricter timelines.
- **Cookie-consent banner:** add one if operating in regions that require it before any non-essential cookies.
- **Before enabling any paid feature or payment gateway:** add gateway terms and a paid-feature-specific refund policy at checkout.
- **Native push (FCM):** configuration may be incomplete — confirm before relying on it in user-facing copy.

---

*Drafted 19 July 2026. Do not publish without legal review.*
