# STRYT — Privacy Policy

**Effective Date:** [To be set by STRYT on publication]
**Last Updated:** 19 July 2026
**Version:** 1.0 (draft for legal review)

> This Privacy Policy was drafted from a direct reading of the STRYT database schema (72 tables), Edge Functions, and client code so that the data categories, flows, and third parties described here reflect what the product actually does. Items only STRYT can confirm (legal entity name, registered address, Data Protection Officer / Grievance Officer identity, and the data-residency region of the hosting project) are marked and must be completed before publication and reviewed by qualified Indian counsel.

---

## 1. Who we are (Data Fiduciary)

STRYT (the "Platform" — the app, **https://stryt.in**, and the native Android app) is operated by `[STRYT OPERATOR LEGAL NAME]`, `[REGISTERED ADDRESS]` ("STRYT", "we", "us"). For the purposes of the **Digital Personal Data Protection Act, 2023 ("DPDP Act")**, STRYT is the **Data Fiduciary** that determines the purposes and means of processing your personal data. In these terms "you" / "Data Principal" means the individual whose personal data we process.

This Policy explains what personal data we collect, why, how, with whom we share it, how long we keep it, and the rights you have. It should be read with the [Terms & Conditions](terms-and-conditions.md), [Cookie Policy](cookie-policy.md), and [Data Retention Policy](data-retention-policy.md).

---

## 2. Scope and consent

2.1 This Policy applies to personal data we process about Users (Guests, Customers, Business owners, Providers, Delegated Users) and people who contact us.

2.2 By creating an Account and using signed-in features, you consent to the processing described here for the stated purposes. Where the DPDP Act permits, we also process certain data for **legitimate uses** (for example, to provide a service you asked for, for security, and to comply with law) and to perform our contract with you. Where we rely on your consent, you may withdraw it (see Section 11); withdrawal does not affect processing already carried out, and may mean you can no longer use features that depend on that data.

2.3 **Guests.** If you browse without signing in, we process only the minimal data needed to show nearby content (for example approximate device location and basic technical/analytics data). Guest browsing is limited to about 1 km around your device.

---

## 3. The personal data we collect

We collect only what the features you use require. Grouped by purpose:

### 3.1 Account and profile
- Your name (real name — **kept private by default**), your public handle (**alias**), profile photo or emoji avatar, phone number, email address, neighbourhood/area, city, preferred language, roles/"hats", and your notification/discovery radius.
- Authentication identifiers from **Google Sign-In (via Firebase Authentication)** — your Google account email and basic profile, used to create and secure your Account.
- Your privacy settings (which of: real name, posts, asks, badges, phone, email, city, rating, exact location are public), onboarding status, and account state (enabled, deletion-scheduled timestamps).

### 3.2 Location data
- Your **exact device location (latitude/longitude)** when you grant permission, used to show what's nearby and to set your area; on the native app this may use native GPS.
- Your area, city, and PIN code derived by **reverse geocoding** through OpenStreetMap/Nominatim.
- Manual location choices (dropping a pin, setting a remote/"World" location, typed place searches — which are sent to Nominatim to return candidate places).
- **We store your last-known location, not a location history/trail.**

### 3.3 Verification / KYC data (sensitive)
- If you choose to seek a **STRYT Verified** badge for a Business or Provider, the identity, address, or business documents you upload. These are stored in restricted cloud storage (KYC folders) and reviewed by a human. This is sensitive personal data and is used only for verification and trust/safety.

### 3.4 Listings and commercial data (Sellers)
- Business/Provider details: name, category, description, address and pinned coordinates, hours, service area/radius, photos, catalogue/service items and prices, portfolio images, offers, and **UPI ID / payment QR** you add for receiving payments.
- Team roster entries (name, phone, role) and delegated-access grants you create.

### 3.5 Transactions and activity
- Requests/"asks" (including description, budget, optional photos, voice-to-text you dictate, and whether posted anonymously), quotes/proposals and counter-offers, deals/agreements and their status and tracking, appointments/bookings and blocked slots, live-queue tokens and party size, and cart/checkout selections.
- **Payment records as entered in the app**: method (UPI/cash), amount, an optional reference you type, and the claim/confirm/reject status. **We do not receive or store your bank details, UPI PIN, card numbers, or actual UPI transaction data — those stay with your bank and UPI app** (see Section 6). Records for the not-yet-live paid tiers (subscriptions, pro-payments, settlements) exist in the schema but are not activated for end-user charging.

### 3.6 Social, community, and reputation
- Community posts, comments, likes, poll votes, stories and who viewed them, follows, bookmarks, saved lists, and saved searches/alerts.
- Ratings and reviews, vouches, skill endorsements, Q&A and upvotes, leaderboard points, and achievement badges.

### 3.7 Messaging
- Direct messages between Users, including text and photo attachments, and conversation metadata (participants, timestamps, read/typing status).

### 3.8 Safety and location-sharing
- Live-location shares and their recipients, one-time location-share grants (requests/approvals), your chosen emergency contacts (limited to people you've chatted with), and public tracking tokens for shareable tracking links.
- (The society/gate-pass module exists in the schema but is **not currently enabled** for users.)

### 3.9 Device, notifications, and technical data
- Web-push subscriptions and Firebase Cloud Messaging device tokens (to deliver notifications), your in-app notifications, and technical data such as IP address, device/browser type, and app interactions collected to operate and secure the service.
- **Client error logs** and listing **view counts** (business/provider view logs) for reliability and analytics.

### 3.10 Support, moderation, and audit
- Support tickets (category, your reply-to email, subject, message — delivered to us by email), bug reports (with the role you were using), reports you file about content/people, and account appeals.
- Administrative action logs (audit records of moderation/verification/deletion actions).

### 3.11 Analytics
- Anonymous, aggregate usage and performance data via **Vercel Analytics and Speed Insights** (website).

We do **not** intentionally collect special categories such as biometric, health, or financial-account credentials. Do not submit such data in free-text fields, photos, or documents unless a feature specifically requires it.

---

## 4. How and why we use your data (purposes)

We process personal data to:

- create, secure, and operate your Account and roles;
- show you relevant nearby shops, providers, requests, and community content based on your location and radius;
- enable core features — requests/quotes, deals, bookings, queues, walk-ins, cart/checkout, and the payment claim/confirm records;
- power reputation and trust features (reviews, vouches, verification, reports);
- enable messaging and safety features (live location, emergency contacts, tracking links) at your instruction;
- send you service/transactional notifications and, where enabled, respond to support requests;
- provide the statistical "smart price" suggestion (see Section 7);
- prevent fraud, abuse, and security incidents, enforce our Terms, and moderate content;
- maintain, debug, and improve the Platform (including error logs and analytics); and
- comply with legal obligations and respond to lawful requests.

We use personal data only for purposes compatible with those for which it was collected, consistent with the DPDP Act's purpose-limitation and data-minimisation principles.

---

## 5. Privacy by default (what other Users see)

5.1 **Your real name is private by default.** Strangers see your alias/handle. Your phone, email, city, exact location, posts, asks, badges, and rating are shown to others **only if you switch each on** in your privacy settings.

5.2 **Exact location is private by default.** Distances shown to other Users are computed server-side from the viewer's own location; your raw coordinates are not exposed to them. Exact location is shared only when you globally opt in or approve a specific one-time location request.

5.3 **Sellers are more public by nature.** If you list a Business or Provider, your listing details (including business address, hours, catalogue, and contact options you enable) are public so customers can find and reach you.

5.4 **Anonymous posting.** Where a feature offers anonymous posting (e.g. certain requests/community posts), we still associate the content with your Account internally for safety and moderation, even though your identity is hidden from other Users.

---

## 6. Payments and your financial data

6.1 STRYT is **not** a payment processor and does not collect, hold, or transmit your money (see Terms Section 13). When you pay by UPI, you do so in your own UPI app; your **UPI PIN, bank account, and card details are never entered into or seen by STRYT**.

6.2 What STRYT stores is limited to the **record you and the Seller create** in the app: the amount, method, an optional reference you type, and the claim/confirm/reject status. A Seller's **UPI ID / QR** that they add to receive payments is stored so payment links/QRs can be generated.

6.3 Actual payment processing is performed by the **UPI ecosystem (NPCI, your bank, and your UPI app)** under their own terms and privacy policies, outside STRYT's control.

---

## 7. Automated processing and "AI"

7.1 The "smart price suggestion" is a **statistical aggregation** (median/quartiles) of recent comparable quote prices in your area, computed by our `ai-assist` server function using our own data. **It is not AI/LLM processing and it does not read or send your free-text content to any external AI service.**

7.2 We use automated logic for discovery, ranking, "nearby" results, wait-time estimates, and matching (e.g. saved-search alerts, request-to-seller matches). These are convenience features, are not "decisions" that produce legal or similarly significant effects on you, and may be inaccurate.

7.3 If we introduce AI-based processing of your content in future, we will update this Policy and obtain any notice/consent required by law before doing so.

---

## 8. Who we share data with

We do **not sell** your personal data. We share it only as follows:

### 8.1 With other Users
As inherent to the features you use — e.g. a Seller sees your name/alias and details for a booking or deal you make with them; the recipient of a live-location share sees your live location; other Users see content you post per your privacy settings.

### 8.2 With processors / third-party services (Data Processors)
- **Supabase** — database, authentication, and file storage infrastructure that hosts app data on our behalf.
- **Google / Firebase** — Google Sign-In (authentication) and Firebase Cloud Messaging (push notifications).
- **Vercel** — website hosting and anonymous analytics/speed insights.
- **OpenStreetMap / Nominatim** — geocoding; when you search a place or we reverse-geocode your coordinates, that query/those coordinates are sent to Nominatim to return results.
- **Email/SMTP provider** — to deliver support-ticket emails to our support inbox (your reply-to email, category, subject, and message are included).
- **Web Push services** — the browser's push service to deliver web notifications.
- **NPCI/UPI and your bank/UPI app** — you interact with these directly to make payments (not a STRYT processor, but essential to the payment you initiate).

Each processor is engaged to process data on our instructions for the purposes above; they have their own privacy terms for the parts they control.

### 8.3 For legal, safety, and business reasons
We may disclose data where required by law, court order, or a lawful government request; to protect the rights, safety, or property of Users, the public, or STRYT; to prevent or investigate fraud, abuse, or security incidents; and, if STRYT is involved in a merger, acquisition, financing, or asset transfer, to the relevant party subject to this Policy.

---

## 9. Cross-border storage and transfers

9.1 Our infrastructure providers (Supabase, Vercel, Google/Firebase) may store or process data on servers **outside India**, depending on region configuration. Where personal data is stored or transferred outside India, we will comply with the DPDP Act and any restrictions notified by the Central Government.

9.2 **Flagged for STRYT:** confirm the actual hosting region(s) of your Supabase project and other providers and state the country/region here for transparency.

---

## 10. Data retention

We keep personal data only as long as needed for the purposes above or as required by law, and then delete or anonymise it. Account deletion has a **30-day recoverable grace period**, after which we permanently remove or irreversibly anonymise your data (including uploaded files and KYC documents) subject to guardrails (no active deals / no "held"-status payment records) and legally required retention. Full details and periods are in the [Data Retention Policy](data-retention-policy.md).

---

## 11. Your rights (DPDP Act)

As a Data Principal you have the right to:

- **Access** — a summary of the personal data we process about you and the processing activities.
- **Correction and updating** — correct or complete inaccurate or incomplete data (much of which you can do directly in your profile/settings).
- **Erasure** — request deletion of your personal data where it is no longer required and retention is not legally mandated (you can start this from Settings → account deletion).
- **Withdraw consent** — as easily as you gave it, for processing based on consent.
- **Grievance redressal** — a readily available means to raise grievances with us (Section 13 and the [Grievance Redressal Policy](grievance-redressal-policy.md)).
- **Nominate** — nominate another individual to exercise your rights in the event of death or incapacity.

To exercise these rights, use the in-app controls or contact our Grievance Officer (Section 13). We may need to verify your identity, and we will respond within the timelines required by law. Some requests may be limited by legal-retention obligations or the rights of others (e.g. content already shared with other Users).

You also have the right to complain to the **Data Protection Board of India** if you are not satisfied with our response.

---

## 12. Security

12.1 We apply reasonable technical and organisational measures appropriate to the sensitivity of the data, including database **row-level security** (so Users can only access data they're permitted to), rate-limiting on sensitive actions (e.g. verification/admin/login flows), restricted server-side secrets kept out of the browser, origin-restricted server functions, and access controls on stored files.

12.2 No method of transmission or storage is completely secure; we cannot guarantee absolute security. You are responsible for the security of the Google account you sign in with and your Switch PIN.

12.3 In the event of a personal-data breach, we will follow the notification obligations under the DPDP Act, including notifying the Data Protection Board and affected Data Principals as required.

---

## 13. Grievance Officer and contact

For any question, request, or grievance about your personal data:

- **Grievance Officer:** `[NAME, designation]` — see the [Grievance Redressal Policy](grievance-redressal-policy.md)
- **Email:** contact@stryt.in (general) / stryt.assistance@gmail.com (support)
- **In app:** Account → Help & Support
- **Postal:** `[REGISTERED OFFICE ADDRESS]`

We will acknowledge and address grievances within the timelines set out in the Grievance Redressal Policy and applicable law.

---

## 14. Children

The Platform is for Users **18 and older** and is not directed at children (persons under 18 under the DPDP Act). We do not knowingly process children's personal data without verifiable parental/guardian consent. If we learn we have, we will delete it and close the account. (Note: the Platform does not yet implement technical age assurance — an open compliance item flagged for STRYT.) See Terms Section 48.

---

## 15. Cookies and local storage

The Platform uses cookies and browser local storage (for example to keep you signed in and remember preferences such as language and dismissed prompts). Details and choices are in the [Cookie Policy](cookie-policy.md).

---

## 16. Third-party links and content

The Platform may contain links or content from third parties (e.g. a Seller's external contact, or map data). We are not responsible for the privacy practices of third parties; review their policies.

---

## 17. Changes to this Policy

We may update this Policy from time to time. We will update the "Last Updated" date and, for material changes, provide notice through the Platform. Continued use after changes take effect constitutes acceptance, to the extent permitted by law.

---

*This document is a draft prepared for legal review and is not yet in force.*
