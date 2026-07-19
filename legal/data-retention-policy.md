# STRYT — Data Retention Policy

**Effective Date:** [To be set by STRYT on publication]
**Last Updated:** 19 July 2026
**Version:** 1.0 (draft for legal review)

This Data Retention Policy explains how long STRYT keeps personal data and content, and what happens when you delete your account or a listing. It forms part of the [Terms & Conditions](terms-and-conditions.md) and [Privacy Policy](privacy-policy.md).

> Grounding note: the retention behaviours below are drawn from the actual account/profile deletion function and schema. Where a period is a **recommended default rather than one hard-coded in the product**, it is marked "(policy default — configure/confirm)". STRYT should confirm final periods with counsel and ensure operational practice matches this document before publication.

---

## 1. Principles

1.1 We retain personal data only for as long as necessary to fulfil the purposes described in the [Privacy Policy](privacy-policy.md), to operate and secure the Platform, to resolve disputes, and to comply with legal obligations — after which we delete or irreversibly anonymise it.

1.2 We follow **data minimisation** and **storage limitation** consistent with the DPDP Act.

---

## 2. While your account is active

We keep your account and content while your account is active so the Platform works — your profile, listings, transactions, messages, reputation, and preferences. You can edit or delete much of this yourself at any time (profile fields, posts, stories, listings, catalogue items, etc.).

**Self-expiring content:**
- **Stories** expire automatically between **1 hour and 7 days** after posting (as set by you), unless pinned as **Highlights**, and are then removed. "Story views" records associated with an expired story are removed with it.
- **Requests/"asks"** carry an **auto-expiry of up to 24 hours** as chosen by you, after which they stop being shown as open.
- **Live-location shares** run only until you stop them (or the share/session ends); **one-time location grants** are time-limited and revocable.
- **Slot holds / short windows** (e.g. the ~10-minute deal confirmation window, appointment slot holds) lapse automatically.

---

## 3. Account deletion (Customer)

3.1 **Self-service request + grace period.** You can request deletion from Settings. Your account then enters a **30-day grace period** during which it is hidden from other Users but **recoverable in one tap**. This protects against accidental or impulsive deletion.

3.2 **Guardrails.** Deletion cannot complete while you have **active Deals/Agreements** (not completed, cancelled, or disputed) or any payment record in a **"held" status** in the Deal tracker. These must be resolved first. (These are internal status checks; STRYT holds no money — see Terms Section 13.)

3.3 **What permanent deletion does.** When deletion proceeds (via the admin-executed deletion process, which for a full customer account additionally requires Super Admin authorisation and a typed confirmation), STRYT:
- **anonymises your user record** — for example replacing your name with "Deleted User", zeroing your phone number, clearing your avatar, and marking the account disabled with a deletion timestamp;
- **deletes your uploaded files** from storage, including avatars, stories, request photos, business/catalogue/portfolio photos, and **KYC/verification documents**;
- **deletes the Business and Provider profiles you own**, along with their catalogue items, offers, portfolio items, packages, and stories (deleting them, or where a hard delete is not possible, anonymising and suspending them);
- **deletes your authentication identity** so you can no longer sign in; and
- **updates your deletion request** to completed and **writes an audit-log entry** of the action.

3.4 **What may remain, and why.** After deletion, limited data may persist:
- **Content already shared with, sent to, or copied by other Users** (e.g. a message another User received, or a screenshot) is outside our unilateral control.
- **Records tied to another party's rights or ongoing matters** — for example a completed transaction, a review you left about a Seller, or a dispute — may be retained in anonymised or minimal form for the other party's records, fraud prevention, and legal defence.
- **Audit/compliance logs** (e.g. `admin_action_logs`) are retained for security, accountability, and legal-obligation purposes.
- **Anonymised or aggregate data** that no longer identifies you may be retained for analytics and service improvement.
- **Residual backups** may hold data briefly until they cycle out (see Section 6).

---

## 4. Business / Provider deletion

4.1 A Business or Provider profile can be deleted (by the owner, subject to the same active-deal/held-payment guardrails, or by an Admin). On deletion, STRYT purges the profile's catalogue/portfolio/offers/packages/stories and its uploaded photos and KYC documents, and either hard-deletes the profile or, if that is not possible due to linked records, **anonymises and suspends** it (e.g. name set to "Deleted Business"/"Deleted Provider", contact zeroed, photos cleared).

4.2 Deleting a Business/Provider profile does not delete the owner's Customer account; the owner can continue as a Customer.

4.3 Reviews, ratings, and transaction records tied to other Users may be retained in anonymised/minimal form as in Section 3.4.

---

## 5. Suggested retention periods by data category

The following are STRYT's retention targets. Except where a mechanism is hard-coded in the product (noted), these are **policy defaults to be configured and confirmed**.

| Data category | Retention target |
|---|---|
| Active account profile & settings | While account is active; deleted/anonymised on account deletion |
| Stories | Auto-expire 1 hour–7 days (product behaviour); Highlights until unpinned/deleted |
| Requests/"asks" | Open until fulfilled or auto-expiry (up to 24h); records kept while account active *(policy default — configure)* |
| Deals/Agreements, appointments, queue tokens, payment **records** | Life of account + a period after completion for dispute/fraud/legal purposes *(policy default: e.g. up to 3 years — confirm)* |
| Direct messages | While account active; removed/anonymised on deletion *(policy default — configure)* |
| Reviews, ratings, vouches, endorsements | Retained as community record; anonymised link to a deleted author |
| KYC / verification documents | Until verification lifecycle ends or profile deletion; deleted on profile deletion *(policy default: delete promptly after review decision + minimal proof-of-check retention — confirm)* |
| Push tokens / web-push subscriptions | Until you disable notifications or the token expires/deletion |
| In-app notifications | Rolling; older items pruned *(policy default — configure)* |
| Support tickets & bug reports | For handling + reasonable record *(policy default: e.g. 24 months — confirm)*; note support tickets are also delivered to a support email inbox |
| Reports & appeals | For trust/safety record and any legal need |
| Admin action / audit logs | Extended retention for accountability & legal obligation *(policy default: e.g. 3–7 years — confirm)* |
| Client error logs / view logs | Short operational retention *(policy default: e.g. 90 days — confirm)* |
| Analytics (Vercel) | Per provider defaults; anonymous/aggregate |
| Backups | Short rolling window (Section 6) |

**Flagged for STRYT:** confirm each period, ensure the product/operations enforce them (e.g. scheduled pruning of logs/notifications, and prompt deletion of KYC documents after a verification decision), and align with any statutory retention (e.g. tax records that a **Seller** must keep are the Seller's responsibility, not STRYT's).

---

## 6. Backups

Encrypted or access-controlled backups maintained by our infrastructure providers may retain copies of data for a limited period after deletion from the live system, purely for disaster recovery. Such copies are not used for normal operations and are overwritten on the backup cycle. **(Flagged for STRYT: confirm your provider's backup retention window and state it here.)**

---

## 7. Legal holds

We may retain specific data beyond these periods where required to comply with a legal obligation, respond to a lawful request, or establish, exercise, or defend legal claims. Such data is retained only for as long as the obligation or matter requires.

---

## 8. Your rights

You can access, correct, and request erasure of your personal data, and withdraw consent, as described in the [Privacy Policy](privacy-policy.md) Section 11, subject to the guardrails and retained-data exceptions above. To exercise these rights, use in-app controls or contact the Grievance Officer (see the [Grievance Redressal Policy](grievance-redressal-policy.md)).

---

## 9. Changes

We may update this Policy. We will update the "Last Updated" date and give notice of material changes through the Platform.

---

*This document is a draft prepared for legal review and is not yet in force.*
