# STRYT — Terms & Conditions

**Effective Date:** [To be set by STRYT on publication — see Section 54]
**Last Updated:** 19 July 2026
**Version:** 1.0 (draft for legal review — not yet published)

> **Reviewer's note (delete before publication).** This document was drafted from a direct reading of the STRYT codebase (frontend, Supabase database schema of 72 tables, Edge Functions, and configuration) so that every clause maps to functionality that actually exists in the product. Where the product genuinely does not yet do something (for example, in-app paid subscriptions or a payment gateway), the clause says so rather than inventing terms. Items that only the company can supply — legal entity name, registered address, GST/CIN, and the named Grievance Officer — are listed in **Section 0 (Operator Information)** and must be completed by STRYT and confirmed by qualified Indian legal counsel before this document is published. Do not publish with the bracketed placeholders in Section 0 unfilled.

---

## 0. Operator Information (to be completed before publication)

The STRYT application, website (**https://stryt.in**), and native Android application (together, the **"Platform"**) are operated by:

- **Legal entity name:** `[STRYT OPERATOR LEGAL NAME — e.g. "____ Private Limited" / proprietorship name]`
- **Registered office:** `[REGISTERED ADDRESS, City, State, PIN]`
- **CIN / registration no.:** `[CIN or firm registration number, if applicable]`
- **GSTIN:** `[GST number, if registered]`
- **General contact email:** contact@stryt.in *(present in the codebase)*
- **Support email / in-app support:** stryt.assistance@gmail.com and **Account → Help & Support** in the app *(present in the codebase)*
- **Grievance Officer:** `[NAME, designation, email, phone — see grievance-redressal-policy.md]`

In these Terms, **"STRYT"**, **"we"**, **"us"**, and **"our"** refer to the operator named above. **"You"** and **"User"** refer to any person who accesses or uses the Platform in any capacity.

---

## 1. Introduction

1.1 STRYT is a hyperlocal discovery and community platform for a single neighbourhood at a time. It lets people discover nearby shops and independent service providers, post requests ("asks") for goods and services and receive quotes, book appointments, join virtual walk-in queues, chat, share a local community feed, and record payments made directly between neighbours.

1.2 STRYT is an **intermediary and technology platform** within the meaning of the Information Technology Act, 2000 ("IT Act") and the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 ("Intermediary Guidelines"). Except where these Terms expressly state otherwise, STRYT does **not** itself sell goods, provide services, employ providers, or act as a party to transactions between Users. Those transactions are directly between the customer and the merchant or provider.

1.3 These Terms & Conditions ("Terms") govern your access to and use of the Platform. They form a legally binding electronic contract between you and STRYT under the Indian Contract Act, 1872 and the IT Act, and do not require a physical or digital signature to be enforceable.

1.4 These Terms incorporate by reference, and must be read together with, the following policies, each of which forms part of your agreement with us:

- Privacy Policy (`privacy-policy.md`)
- Cookie Policy (`cookie-policy.md`)
- Refund & Cancellation Policy (`refund-cancellation-policy.md`)
- Merchant & Provider Terms (`merchant-terms.md`)
- Acceptable Use Policy (`acceptable-use-policy.md`)
- Data Retention Policy (`data-retention-policy.md`)
- Grievance Redressal Policy (`grievance-redressal-policy.md`)
- Community Guidelines (`community-guidelines.md`)
- Disclaimer (`disclaimer.md`)

If there is a direct conflict between these Terms and a specific policy on a topic that the policy governs, the specific policy prevails for that topic.

---

## 2. Definitions

In these Terms, unless the context requires otherwise:

- **"Account"** — a user account created through Google Sign-In (via Firebase Authentication), giving access to signed-in features.
- **"Guest"** — a person who uses the Platform without signing in; Guest access is limited to browsing content within approximately 1 kilometre of the device.
- **"Customer"** — the default role of every signed-in User.
- **"Business" / "Merchant"** — a shop or outlet listing created and operated by a User from the business management console.
- **"Provider"** — an independent-service profile (e.g. a solo tradesperson, tutor, or freelancer) created and operated by a User.
- **"Seller"** — a Business or a Provider, collectively, when acting as the supplying side of a transaction.
- **"Delegated User"** — a User to whom a Business owner has granted management access to that Business.
- **"Admin" / "Super Admin"** — authorised internal STRYT personnel who moderate listings, verifications, disputes, reports, and accounts through a separate admin console.
- **"Request" / "Ask"** — a post by a Customer describing goods or services they need.
- **"Proposal" / "Quote"** — a priced response to a Request.
- **"Deal" / "Agreement"** — the tracked arrangement created when a Customer accepts a Quote.
- **"Appointment" / "Booking"** — a scheduled booking made directly from a Seller's profile.
- **"Live Queue"** — a Business's virtual walk-in line that Customers may join remotely.
- **"Content"** — any text, photo, rating, review, comment, story, message, voice input, listing, or other material submitted to the Platform.
- **"UPI"** — the Unified Payments Interface operated under the National Payments Corporation of India (NPCI).
- **"Verified" / "STRYT Verified"** — a trust badge granted only after a human STRYT reviewer approves documents submitted by a Seller.
- **"DPDP Act"** — the Digital Personal Data Protection Act, 2023.

---

## 3. Acceptance of Terms

3.1 By accessing or using the Platform — including by browsing as a Guest, creating an Account, listing a Business or Provider profile, or completing any transaction — you acknowledge that you have read, understood, and agree to be bound by these Terms and the policies referenced in Section 1.4.

3.2 If you do not agree to these Terms, you must not access or use the Platform.

3.3 If you use the Platform on behalf of a business or another person (for example, as a Delegated User or an employee), you represent that you are authorised to bind that business or person to these Terms.

3.4 We may require you to re-affirm your acceptance when we make material changes to these Terms (see Section 53).

---

## 4. Eligibility

4.1 You must be at least **18 years of age** and competent to enter into a contract under the Indian Contract Act, 1872 to create an Account, list a Business or Provider, transact, or post Content.

4.2 The Platform is intended for use in **India** and is designed around Indian addresses, ₹ (INR) pricing, UPI payments, and Indian languages. Use from outside India is not supported and is at your own risk.

4.3 You must not use the Platform if you are barred from doing so under any applicable law, or if your Account has previously been suspended or terminated by STRYT.

4.4 **Assumption/limitation (flagged for STRYT):** the Platform currently authenticates via Google Sign-In and does not implement an automated age-verification gate. Eligibility under Section 4.1 is therefore established by your acceptance of these Terms and your representation of age. STRYT should treat implementing age assurance as an open compliance item, particularly in light of the DPDP Act's rules on children (see Section 48).

---

## 5. User Accounts

5.1 **Creation.** Accounts are created and accessed through Google Sign-In (via Firebase Authentication). You are responsible for maintaining the security of the Google account you use to sign in. A phone/email one-time-password sign-in method exists in the codebase but is not currently enabled.

5.2 **Profile.** On first sign-in you may set a display name, a public handle (**alias**), a neighbourhood, a profile photo or emoji avatar, a phone number, a preferred language (English, Hindi, or Marathi), and a discovery/alert radius. You may skip onboarding and complete it later.

5.3 **Accuracy.** You agree that the information you provide is true, current, and complete, and that you will keep it updated.

5.4 **One person, multiple roles.** A single Account may simultaneously act as a Customer, own one or more Businesses, and hold one Provider profile. You switch between these roles ("hats") from your profile. You remain responsible for all activity conducted under your Account in every role.

5.5 **Switch PIN.** You may set an optional 4–6 digit Switch PIN that is required to switch **into** a Business or Provider console (never to return to the Customer view). The Switch PIN is a convenience control to protect a console on a shared device; it is not a guarantee of security and does not replace the security of your Google account.

5.6 **Responsibility.** You are responsible for all activity that occurs under your Account. Notify us promptly through Help & Support if you suspect unauthorised use.

---

## 6. Business Accounts

6.1 Any signed-in Customer may create a Business listing through a short setup covering name, category, discovery radius, pinned location and address, up to four photos, an optional opening offer, and contact details with weekly hours.

6.2 A Business listing goes live immediately upon submission, while STRYT may separately conduct a verification review in the background (see Section 6.4 and Section 16).

6.3 A single User may own more than one Business.

6.4 The **STRYT Verified** badge is only ever granted after a human STRYT reviewer approves documents you submit. It is never automatic. A Verified badge is a limited trust signal about document review at a point in time; it is not a guarantee of the Business's quality, legality, licensing, solvency, or conduct.

6.5 Business owners and Delegated Users are additionally bound by the **Merchant & Provider Terms** (`merchant-terms.md`).

---

## 7. Merchant Responsibilities

7.1 As a Seller (Business or Provider) you are solely responsible for:

- (a) the accuracy of your listing, catalogue, pricing (including any sale prices), stock/availability, hours, and service area;
- (b) holding all licences, registrations, GST registration, and permissions required by law to offer your goods or services;
- (c) the quality, safety, legality, and fitness of the goods or services you provide;
- (d) fulfilling appointments, queue commitments, deals, and orders you accept;
- (e) honouring the payment timing policy you configure (pay-before-accept or pay-around-service);
- (f) issuing any tax invoice, collecting and remitting any applicable GST, and meeting your own tax obligations; and
- (g) responding to your customers, reviews, questions, disputes, and reachouts.

7.2 STRYT is not a party to, and bears no responsibility for, the underlying commercial transaction between you and your customers. See Sections 13, 39, and 40, and the Merchant Terms.

7.3 You must not use the Platform to advertise or supply goods or services that are unlawful, or that you are not licensed or entitled to provide.

---

## 8. Customer Responsibilities

8.1 As a Customer you agree to:

- (a) provide accurate information in Requests, bookings, and payments;
- (b) deal fairly and lawfully with Sellers and other Users;
- (c) honour commitments you make (attend appointments, turn up for queue slots you hold, complete deals you accept), and cancel promptly if you cannot;
- (d) pay Sellers directly and honestly for goods and services you receive, using the agreed method (UPI or cash), and only mark a payment as made when you have actually made it; and
- (e) leave reviews, ratings, vouches, and reports that are honest and based on genuine experience.

8.2 You understand that a Deal created by accepting a Quote, and an accepted Appointment, are commitments to a real person in your neighbourhood, and that cancelling or failing to appear may affect your reputation on the Platform.

---

## 9. Queue Management

9.1 A Business may operate a Live Queue that Customers can join remotely, choosing a party size, and can see their position, the number of people ahead, and an estimated wait time.

9.2 Wait-time estimates are **indicative only**. They are calculated from the average time-per-customer set by the Business and change as the queue moves. STRYT does not warrant that any estimate is accurate, and you may still have to wait longer or be served sooner.

9.3 The Business controls the queue: it may call the next customer, mark customers arrived or served, remove no-shows, and open or close the queue at any time. STRYT does not control queue order or guarantee that you will be served.

9.4 You may leave a queue at any time. Once you have been "called" or are being served, leaving may require confirming that you will lose your place.

9.5 Joining a queue is not a guarantee of service, of a specific product being in stock, or of any particular price.

---

## 10. Appointment Booking

10.1 You may book an Appointment directly from a Seller's profile by selecting a service/package and a date and time slot from the Seller's stated availability, and adding notes or a reference photo.

10.2 Some Sellers require payment before they accept a booking; others allow payment around the time of service. The Seller's configured policy governs.

10.3 A booking request may be **accepted or declined** by the Seller. A booking is only confirmed once the Seller accepts it (or where the Seller's settings auto-confirm). STRYT does not guarantee that any booking will be accepted or honoured.

10.4 Availability, slots, and blocked times shown to you reflect what the Seller has configured and may change. STRYT is not responsible for a Seller's failure to honour a booking; your remedy is with the Seller.

10.5 Rescheduling and cancellation of Appointments are governed by the **Refund & Cancellation Policy**.

---

## 11. Walk-in Management

11.1 A Customer physically present at a Business may, without a prior booking, select catalogue items and quantities on the Business's profile and record a walk-in payment.

11.2 A Business owner may also add walk-in bookings and record walk-in payments on their console for customers served in person.

11.3 Walk-in records reflect what the parties enter. STRYT does not verify that a walk-in transaction occurred, that goods were delivered, or that money changed hands, and provides no warranty in respect of walk-in transactions.

---

## 12. QR Code Usage

12.1 The Platform generates QR codes that link to a Business, Provider, profile, or Request, and can generate UPI payment QR codes/deep links, and (where enabled) loyalty-stamp QR codes. The Platform also includes an in-app camera scanner for reading STRYT QR codes.

12.2 You must only scan QR codes you trust. STRYT is not responsible for QR codes generated, printed, altered, or displayed outside the Platform, or for any payment made by scanning a code that was not generated by the intended recipient.

12.3 Camera access is used only to operate the scanner while you are using it and is subject to the Privacy Policy.

---

## 13. Payments

13.1 **STRYT is not a payment system, payment aggregator, payment gateway, escrow agent, trustee, or money-services business, and does not collect, hold, process, route, or disburse any money between Users.** STRYT is not a "payment system provider" under the Payment and Settlement Systems Act, 2007 and does not require RBI authorisation for the payment functionality described here, because it never comes into possession of Users' funds.

13.2 **How payments actually work.** All payments for Appointments, Deals, Live Queue visits, and walk-in purchases are made **directly between the payer and the Seller**, using either:

- (a) **UPI** — via a UPI deep-link or QR code that the Platform generates so the payer can pay using any UPI app (e.g. GPay, PhonePe, Paytm, BHIM); the payment is settled bank-to-bank under NPCI/UPI rules, entirely outside STRYT; or
- (b) **cash**, handed over in person.

13.3 **Claim and confirm.** After paying, the payer taps "I have paid" (a **claim**), and the Seller must then **confirm** receipt or **reject** the claim. These claim/confirm/reject actions are **status labels recorded for the parties' convenience**. They are **not** proof of payment, a receipt, a settlement, a clearing service, or a guarantee by STRYT that money was actually sent or received. STRYT does not verify UPI transaction references or bank statements.

13.4 **Deal status flags ("held"/"release").** Within the Deal/Agreement tracker, a payment may be marked with an internal status such as "held" or "released", and a Dispute may be resolved by an Admin marking a Deal complete ("release") or cancelled. **These are informational status flags within the Platform only. STRYT does not actually hold, escrow, or control any money at any stage.** Any money exchanged between the parties has already moved directly between them; changing a status flag does not move, refund, or recover money.

13.5 **No STRYT-issued refunds.** Because STRYT never holds your money, STRYT cannot and does not issue refunds. Refunds, chargebacks, and payment disputes are strictly between the payer and the Seller and are governed by the **Refund & Cancellation Policy**.

13.6 **Payment risk is yours.** You are responsible for verifying the identity of the person you pay, that the UPI ID/QR belongs to the intended recipient, and that you have actually received what you paid for before confirming. STRYT is not liable for payments made to the wrong person, for goods or services not delivered, or for any UPI, bank, or app failure.

13.7 **Paid STRYT features are not currently live.** Certain paid features referenced in the app — such as business "Pro" plans, provider lead packs, and listing "boosts" — are **not currently available for purchase in-app**; no online payment gateway is integrated. If and when such features become purchasable, additional terms and a Refund & Cancellation Policy specific to those STRYT-charged fees will apply and will be presented to you at the point of purchase. Any such fees, until an in-app gateway is live, are handled offline by arrangement.

---

## 14. Refund Policy

14.1 Refunds for goods and services obtained through the Platform are the responsibility of the Seller, not STRYT, because STRYT holds no funds (Section 13).

14.2 The full terms — including that STRYT issues no refunds for peer-to-peer UPI/cash payments, and how any future STRYT-charged fees would be treated — are set out in the **Refund & Cancellation Policy** (`refund-cancellation-policy.md`), which forms part of these Terms.

---

## 15. Cancellation Policy

15.1 Appointments, Deals, Live Queue slots, and (where offered) walk-in arrangements may be cancelled subject to the rules, timing, and reputational consequences described in the **Refund & Cancellation Policy**.

15.2 Each Seller may set its own practical cancellation and no-show expectations. Where a Seller's stated policy conflicts with a Customer's expectation, the parties must resolve it between themselves; STRYT may, but is not obliged to, assist through the Dispute and Grievance processes.

---

## 16. Business Listings

16.1 Listings are created by Users, go live on submission, and may be reviewed by STRYT before or after going live. STRYT may reject, edit the placement of, suspend, hide, or remove any listing that violates these Terms, the Acceptable Use Policy, the Community Guidelines, or applicable law, or that is the subject of valid reports.

16.2 STRYT does not independently verify the truth of every listing detail. Search ranking, discovery radius, category placement, and "nearby" results are produced by automated logic based on location and other signals and may change without notice.

16.3 A listing's live status, "open/closed" indicator, availability, and stock reflect what the Seller configured and may be inaccurate; STRYT does not warrant them.

16.4 Listing removal on account deletion or suspension is described in the **Data Retention Policy**.

---

## 17. Reviews and Ratings

17.1 Signed-in Customers may leave a 1–5 star rating and a written review of a Seller. A review tied to a genuine completed booking may be marked with a "Verified booking" badge; other reviews are not so marked.

17.2 Reviews, ratings, vouches, and skill endorsements must reflect your genuine, first-hand experience. You must not post fake, incentivised, defamatory, or malicious reviews, or reviews of your own Business/Provider profile, or trade reviews.

17.3 Sellers may publicly reply to reviews and may report a review for moderation. STRYT may remove reviews that violate these Terms, the Community Guidelines, or law, but is not obliged to monitor or remove any particular review.

17.4 Ratings, review text, vouches, endorsements, leaderboard positions, and achievement badges are aggregated and displayed as part of the Platform's reputation system, subject to your privacy settings where applicable.

---

## 18. User Generated Content

18.1 **Definition.** "User Generated Content" (UGC) includes Requests, Quotes, reviews, ratings, community posts, comments, poll votes, stories, highlights, Q&A, chat messages, listing details, catalogue and portfolio items, photos, captions, voice-to-text input, support and bug reports, and any other Content you submit.

18.2 **Ownership.** You retain ownership of Content you create. STRYT does not claim ownership of your UGC.

18.3 **Licence to STRYT.** You grant STRYT a worldwide, non-exclusive, royalty-free, sub-licensable licence to host, store, reproduce, adapt (for formatting/display), publish, and display your UGC **solely to operate, provide, secure, and improve the Platform** and to the extent your privacy settings and these Terms permit. This licence ends when the relevant Content is deleted, except (a) for content already shared with or copied by other Users, (b) where retention is required by law, and (c) for residual backups pending deletion, as described in the Data Retention Policy.

18.4 **Your responsibility.** You represent that you own or have the rights to the Content you submit, and that it does not infringe any third party's rights or violate any law, the Acceptable Use Policy, or the Community Guidelines.

18.5 **No obligation to monitor; right to moderate.** As an intermediary, STRYT does not pre-screen all UGC. STRYT may, at its discretion, remove, hide, or restrict UGC, and may act on reports, without being obliged to monitor content generally. Content-related grievances are handled under the Grievance Redressal Policy.

18.6 **Ephemeral content.** Stories expire automatically (from 1 hour up to 7 days) unless pinned as Highlights; expiry and deletion do not create any obligation on STRYT to retain, restore, or archive that content.

---

## 19. Loyalty Programs

19.1 The Platform's schema and code include a loyalty-stamp system (stamp cards, stamps, and saved coupons) that a Business could configure. **These loyalty and coupon features are not currently enabled/linked for end users** (the Wallet, loyalty-setup, and coupon surfaces are built but not reachable in the current app).

19.2 If and when loyalty programs are enabled, the following will apply and be supplemented by additional terms shown at the point of use: any stamps, coupons, or rewards are offered by the **Business**, not by STRYT; they have no cash value; they are non-transferable unless stated; and the Business is solely responsible for honouring them. STRYT is not the promoter of, and is not liable for, any Business's loyalty offer.

---

## 20. Coupons

20.1 Coupons and saved-coupon functionality, where present in the code, are part of the loyalty feature set described in Section 19 and are **not currently enabled** for end users.

20.2 When enabled, coupons are issued and honoured by the relevant Business, subject to the terms that Business sets (validity, exclusions, one-time use, etc.). STRYT merely provides the technical means to store and present a coupon and is not responsible for a Business's failure to honour it.

---

## 21. Rewards

21.1 Non-monetary reputation rewards — achievement badges, "Good Neighbour"/"Top Helper" style community badges, leaderboard positions, vouches, and endorsements — are recognition features only. They have **no cash or monetary value**, cannot be redeemed, sold, or transferred, and may be changed, recalculated, reset, or discontinued at any time.

21.2 STRYT may remove or adjust any reward, badge, or ranking obtained through fraud, manipulation, or violation of these Terms.

---

## 22. Notifications

22.1 The Platform sends notifications through (a) an in-app notification centre, (b) web push notifications (in the browser), and (c) Firebase Cloud Messaging push on the native Android app (note: native push configuration may not be fully live — see the Privacy Policy).

22.2 By using the Platform you consent to receive **service and transactional** notifications necessary to operate the features you use — for example queue turns, booking and deal updates, quote and offer alerts, saved-search matches, community replies, verification decisions, location-share requests, and account/security notices.

22.3 You can control notification categories, discovery/alert radius, and quiet hours in Settings, and can disable push notifications through your device or browser. Some service notifications are integral to a feature and cannot be separated from using that feature.

22.4 Notifications may be delayed, undelivered, or duplicated for reasons outside our control (device, network, OS, or third-party push infrastructure). STRYT does not guarantee delivery or timeliness of any notification, and you must not rely on notifications as the sole means of receiving time-critical information.

---

## 23. AI Features Disclaimer

23.1 **What the Platform does.** The Platform offers a "smart price suggestion" when you post a Request. As implemented, this is a **statistical aggregation of recent, comparable local quote prices** (a median/quartile computation over historical proposal data) surfaced through the `ai-assist` Edge Function. **It is not a large language model, chatbot, or general artificial-intelligence assistant, and it does not process your free-text content.**

23.2 **No live LLM processing of your content.** Although the project configuration references a third-party AI key for a possible request-categorisation feature, the deployed function does **not** call any external AI model, and no User content is sent to a third-party AI/LLM service for this feature as currently built. If STRYT later enables AI-based processing of User content, this Section and the Privacy Policy will be updated and, where required, additional notice or consent will be obtained.

23.3 **Suggestions are indicative only.** Any price suggestion, estimate, ranking, or automated recommendation is informational, may be wrong or incomplete, and does not constitute advice. You are responsible for your own pricing and decisions. STRYT disclaims liability for reliance on any automated suggestion.

---

## 24. Analytics

24.1 The website uses **Vercel Analytics and Speed Insights** to collect anonymous, aggregate usage and performance data to help us understand and improve the Platform. The Platform also records limited technical telemetry (for example client-side error logs and listing view counts) to operate and improve the service.

24.2 Analytics are described in more detail in the Privacy Policy and Cookie Policy. STRYT does not sell your personal data.

---

## 25. Third Party Services

25.1 The Platform relies on third-party services, including: **Google Sign-In via Firebase Authentication** (authentication), **Supabase** (backend database, storage, and authentication infrastructure), **OpenStreetMap / Nominatim / Leaflet** (maps and geocoding), **UPI/NPCI** (the payment rails you use directly), **Firebase Cloud Messaging** and browser Web Push (notifications), **Vercel** (hosting and analytics), and an **SMTP email** service (support ticket delivery).

25.2 Your use of these third-party services may be subject to their own terms and privacy policies. STRYT does not control and is not responsible for third-party services, and their availability or changes may affect the Platform.

25.3 STRYT is not affiliated with, endorsed by, or sponsored by any third-party provider named in these Terms except as a customer/integrator of their services.

---

## 26. Google Services

26.1 Sign-in uses your Google account through Firebase Authentication. Your use of Google Sign-In is subject to Google's terms and privacy policy. STRYT receives only the basic profile information necessary to create and operate your Account (see the Privacy Policy).

26.2 The native Android app uses the device's native Google sign-in picker and native location services. Distribution of the Android app may be subject to Google Play policies where applicable.

---

## 27. Razorpay / Payment Gateway

27.1 **No payment gateway is currently integrated.** An earlier Razorpay integration was removed in favour of the direct UPI-link/QR approach described in Section 13. STRYT does not currently process card, netbanking, wallet, or gateway payments, and does not currently charge Users through any gateway.

27.2 If STRYT integrates a payment gateway (e.g. Razorpay) in future — for example to charge for Pro plans, lead packs, or boosts — its use will be governed by that provider's terms, additional STRYT terms presented at checkout, and an updated Refund & Cancellation Policy. This Section will be updated accordingly before any such charging goes live.

---

## 28. Cloud Storage

28.1 User-uploaded files — including profile avatars, story images, request photos, business and catalogue photos, portfolio images, and identity/verification (KYC) documents — are stored in STRYT's cloud storage (a Supabase Storage `uploads` bucket) subject to access controls.

28.2 You are responsible for the files you upload and for ensuring you have the right to upload them. Do not upload files you are not entitled to share, or that contain another person's personal or sensitive information without a lawful basis.

28.3 Storage, access, and deletion of uploaded files are further described in the Privacy Policy and Data Retention Policy.

---

## 29. Email Communication

29.1 STRYT may send you email for account, security, support, and legally required communications. Support tickets you submit through **Help & Support** are delivered by email to the STRYT support inbox (via an SMTP mailer) and include the email address, category, subject, and message you provide.

29.2 By contacting support you consent to STRYT using your provided email to respond. Manage other communications through your Settings where controls are available.

---

## 30. SMS Communication

30.1 **No SMS provider is currently active.** A phone-number one-time-password (OTP) sign-in flow exists in the codebase but is not currently enabled, and STRYT does not currently send SMS.

30.2 If STRYT enables SMS (e.g. for OTP or alerts) in future, it will do so in compliance with applicable TRAI/telecom regulations, and standard carrier charges may apply to messages you receive.

---

## 31. Push Notifications

31.1 Push notifications are delivered via browser Web Push and, on the native Android app, via Firebase Cloud Messaging. To deliver them, the Platform stores a push subscription or device token associated with your Account.

31.2 You may enable or disable push notifications through your browser or device settings at any time. Section 22 (Notifications) applies to push notifications, including the no-guarantee-of-delivery provision.

---

## 32. Intellectual Property

32.1 The Platform, including its software, source code, design, "STRYT" name and branding, "Your street. Your people." tagline, user interface, graphics, and compilation of content, is owned by STRYT or its licensors and is protected by Indian and international intellectual-property laws.

32.2 Subject to these Terms, STRYT grants you a limited, personal, non-exclusive, non-transferable, revocable licence to use the Platform for its intended purpose. All rights not expressly granted are reserved.

32.3 You may not copy, modify, reverse-engineer, decompile, scrape, frame, republish, or create derivative works of the Platform except as permitted by law or with our prior written consent.

---

## 33. Copyright

33.1 STRYT respects intellectual-property rights and expects Users to do the same. Do not upload or share Content that infringes another's copyright.

33.2 If you believe Content on the Platform infringes your copyright, submit a notice through the Grievance Redressal Policy channels with: identification of the work, the location of the allegedly infringing Content on the Platform, your contact details, and a statement of good-faith belief and accuracy. STRYT may remove or disable access to Content that is the subject of a valid complaint and may terminate repeat infringers.

---

## 34. Trademark

34.1 "STRYT", the STRYT logo, and related marks are trademarks (registered or unregistered) of STRYT. You may not use them without our prior written permission, except to accurately refer to the Platform.

34.2 Trademarks, brand names, and logos of Businesses, Providers, and third parties displayed on the Platform belong to their respective owners, who are responsible for their use.

---

## 35. Acceptable Use Policy

35.1 Your use of the Platform is subject to the **Acceptable Use Policy** (`acceptable-use-policy.md`) and the **Community Guidelines** (`community-guidelines.md`), which are incorporated into these Terms.

35.2 Breaching either policy is a breach of these Terms and may lead to Content removal, suspension, or termination under Sections 37 and 38.

---

## 36. Prohibited Activities

Without limiting the Acceptable Use Policy, you must not:

- (a) use the Platform for any unlawful, fraudulent, or harmful purpose, or to facilitate a transaction in goods or services that are illegal or that you are not licensed to offer;
- (b) impersonate any person or misrepresent your identity, affiliation, alias, or which role/"hat" you are acting as;
- (c) post false, misleading, defamatory, obscene, hateful, harassing, or infringing Content, or spam;
- (d) manipulate reviews, ratings, vouches, endorsements, leaderboards, achievements, group-buys, or search ranking;
- (e) misuse the payment claim/confirm system — for example falsely claiming to have paid, or falsely confirming or rejecting a payment;
- (f) misuse safety features, including live-location sharing, emergency contacts, one-time location requests, or public tracking links, to stalk, harass, surveil, or endanger any person;
- (g) collect, scrape, harvest, or misuse other Users' personal data, location, or contact details, including data made visible through profiles, listings, or the map;
- (h) attempt to gain unauthorised access to any Account, console, admin function, database, Edge Function, or storage, or to bypass access controls, verification, rate limits, or the Switch PIN;
- (i) introduce malware, overload, disrupt, or interfere with the Platform or its infrastructure;
- (j) create Accounts or listings by automated means, or create Accounts to evade a suspension or ban;
- (k) use the Platform to send unsolicited marketing, or to abuse the notification, messaging, reachout, or "request payment" features; or
- (l) use the Platform in a way that violates the DPDP Act, IT Act, Consumer Protection Act, or any other applicable law.

---

## 37. Suspension of Accounts

37.1 STRYT may suspend or restrict your Account, a Business, a Provider profile, a listing, or specific features — with or without prior notice where the situation warrants — if it reasonably believes you have breached these Terms or a referenced policy, engaged in fraud or harm, created risk for other Users or STRYT, or where required by law or a valid legal request.

37.2 A suspended Business or Provider may request reinstatement through the in-app **Appeals** process, which STRYT reviews and decides at its discretion with a note. Suspension and appeal actions are logged.

37.3 Suspension does not entitle you to any refund of amounts already paid to Sellers (which STRYT never held) or of any future STRYT fees except as required by law.

---

## 38. Account Termination

38.1 **By you.** You may request deletion of your Account from Settings. Your Account enters a **30-day grace period** during which it is hidden from others but recoverable in one tap; after the grace period, STRYT proceeds to permanently remove or irreversibly anonymise it, subject to the guardrails below and the Data Retention Policy.

38.2 **Deletion guardrails.** For everyone's protection, an account/profile deletion cannot complete while you have **active Deals/Agreements** that are not completed, cancelled, or in dispute, or while any payment record is in a "held" status within the Deal tracker. Resolve these first. (These are internal status checks, not custody of your money — see Section 13.)

38.3 **What deletion does.** On permanent deletion, STRYT removes or anonymises your user record (for example replacing your name and contact number with neutral placeholder values and clearing your avatar), deletes your uploaded files including KYC documents and stories, removes owned Business/Provider profiles and their catalogue/portfolio/story content (deleting them, or where a hard delete is not possible, anonymising and suspending them), and deletes your authentication identity. Some records are retained or anonymised as described in the Data Retention Policy (e.g. audit logs, and content already shared with or copied by others).

38.4 **By STRYT.** STRYT may terminate your Account or listings for serious or repeated breach, unlawful conduct, fraud, risk to others, or as required by law. Deletion of a Customer account through the admin console additionally requires Super Admin authorisation and a logged, typed confirmation step.

38.5 Sections that by their nature should survive termination (including 13, 18.3, 32–34, 39–43, 49–51) continue to apply after termination.

---

## 39. Limitation of Liability

39.1 To the maximum extent permitted by law, STRYT (and its directors, employees, and agents) shall not be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, or for any loss of profits, revenue, goodwill, data, or opportunity, arising out of or relating to your use of, or inability to use, the Platform.

39.2 To the maximum extent permitted by law, STRYT is not liable for:

- (a) the acts, omissions, conduct, quality, safety, legality, or non-performance of any Seller, Customer, Delegated User, or other User;
- (b) any transaction, payment, refund, goods, or services between Users (STRYT is not a party to them and holds no funds);
- (c) any inaccuracy in a listing, price, availability, wait-time estimate, map result, price suggestion, or notification;
- (d) failure or delay in UPI, banking, device, network, push, or third-party services; or
- (e) loss or harm arising from another User's conduct, including in-person meetings arranged through the Platform.

39.3 **Cap.** To the maximum extent permitted by law, STRYT's total aggregate liability to you for all claims relating to the Platform shall not exceed the greater of (a) the total STRYT fees (if any) actually paid by you to STRYT in the three (3) months before the event giving rise to the claim, or (b) ₹1,000. Because STRYT does not currently charge Users, this cap will typically be ₹1,000.

39.4 Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for fraud, or for death or personal injury caused by proven gross negligence, or any liability under the Consumer Protection Act, 2019 that cannot be contracted out of.

---

## 40. Disclaimer of Warranties

40.1 The Platform is provided **"as is"** and **"as available"**, without warranties of any kind, whether express or implied, including implied warranties of merchantability, fitness for a particular purpose, non-infringement, accuracy, or uninterrupted or error-free operation, to the maximum extent permitted by law.

40.2 STRYT does not warrant the identity, trustworthiness, quality, licensing, or conduct of any User, Seller, or Provider, even where a "STRYT Verified" badge is shown (which reflects only a point-in-time human document review). You transact and meet other Users at your own risk and should exercise the same caution you would with any stranger.

40.3 Further disclaimers are set out in `disclaimer.md`, which forms part of these Terms.

---

## 41. Indemnification

41.1 You agree to indemnify, defend, and hold harmless STRYT and its directors, employees, and agents from and against any claims, demands, losses, liabilities, damages, costs, and expenses (including reasonable legal fees) arising out of or relating to: (a) your use of the Platform; (b) your Content; (c) your goods, services, listings, or transactions; (d) your breach of these Terms or any referenced policy; (e) your violation of any law or third-party right; or (f) your interactions or disputes with other Users.

41.2 STRYT may, at its option, assume the exclusive defence and control of any matter subject to indemnification, and you agree to cooperate.

---

## 42. Force Majeure

42.1 STRYT is not liable for any failure or delay in performing its obligations caused by events beyond its reasonable control, including acts of God, natural disasters, epidemics/pandemics, war, civil unrest, government action or regulation, strikes, failures of power, internet, telecom, UPI/banking, cloud hosting, or other third-party infrastructure, or cyber-attacks.

---

## 43. Security

43.1 STRYT implements reasonable technical and organisational security measures, including access controls (row-level security on the database), rate-limiting on sensitive actions, restricted server-side secrets, and origin-restricted server functions.

43.2 **No absolute security.** No system is completely secure. STRYT does not guarantee that the Platform is free from unauthorised access, vulnerabilities, or data loss. You are responsible for the security of the Google account you sign in with and for keeping your Switch PIN confidential.

43.3 You must promptly report any security vulnerability or suspected breach through Help & Support and must not exploit, publicise, or misuse it.

43.4 Handling of any personal-data breach follows the DPDP Act and is addressed in the Privacy Policy.

---

## 44. Data Storage

44.1 The Platform's data is stored and processed on cloud infrastructure (Supabase and Vercel). Depending on provider configuration, data may be stored or processed on servers located outside India. Where personal data is transferred or processed outside India, STRYT will comply with the DPDP Act and applicable law. **(Flagged for STRYT: confirm the actual data-residency region of your Supabase project and reflect it here.)**

44.2 Categories of data stored, and the basis for storing them, are described in the Privacy Policy.

---

## 45. Data Retention

45.1 STRYT retains personal data only as long as necessary for the purposes described in the Privacy Policy or as required by law. Specific retention periods and the account-deletion/anonymisation process are set out in the **Data Retention Policy** (`data-retention-policy.md`).

---

## 46. Privacy Reference

46.1 Your privacy is governed by the **Privacy Policy** (`privacy-policy.md`) and **Cookie Policy** (`cookie-policy.md`), which explain what personal data we collect, why, the legal basis under the DPDP Act, how it is shared, your rights, and how to exercise them. By using the Platform you acknowledge those policies.

---

## 47. Cookies

47.1 The Platform uses cookies and equivalent local-storage technologies (for example to keep you signed in, remember preferences such as language and dismissed prompts, and support analytics). Details and your choices are in the **Cookie Policy** (`cookie-policy.md`).

---

## 48. Children Policy

48.1 The Platform is intended only for Users aged 18 and above and is not directed at children. STRYT does not knowingly create accounts for, or collect personal data from, children as defined under the DPDP Act (persons under 18).

48.2 If STRYT learns that it has collected the personal data of a child without verifiable parental/guardian consent as required by the DPDP Act, it will delete that data and terminate the account.

48.3 A parent or guardian who believes a child has used the Platform should contact the Grievance Officer (see `grievance-redressal-policy.md`).

48.4 **Assumption/limitation (flagged for STRYT):** the Platform does not currently implement technical age assurance. STRYT should treat age verification and child-data controls as an open DPDP compliance item.

---

## 49. Governing Law

49.1 These Terms and any dispute or claim arising out of or in connection with them, the Platform, or your use of it, are governed by and construed in accordance with the laws of India, without regard to conflict-of-laws principles.

---

## 50. Jurisdiction

50.1 Subject to Section 51 (Arbitration), the courts at `[CITY, STATE OF REGISTERED OFFICE — e.g. "Pune, Maharashtra"]`, India shall have exclusive jurisdiction over any dispute arising out of or relating to these Terms, and you consent to the personal jurisdiction of those courts. **(Flagged for STRYT: set this to the seat consistent with your registered office in Section 0.)**

---

## 51. Arbitration

51.1 Any dispute, controversy, or claim arising out of or relating to these Terms or the Platform that is not resolved through the Grievance Redressal process (see `grievance-redressal-policy.md`) shall, to the extent permitted by law, be referred to and finally resolved by **arbitration** under the Arbitration and Conciliation Act, 1996.

51.2 The arbitration shall be conducted by a sole arbitrator appointed by STRYT (or as otherwise agreed in writing by the parties), the seat and venue of arbitration shall be `[CITY as in Section 50]`, India, the language shall be English, and the award shall be final and binding.

51.3 Nothing in this Section prevents either party from seeking urgent interim or injunctive relief from a competent court, or limits any non-waivable statutory right of a consumer under the Consumer Protection Act, 2019, including recourse to consumer dispute redressal forums.

---

## 52. Contact Information

- **General:** contact@stryt.in
- **Support:** stryt.assistance@gmail.com, or **Account → Help & Support** in the app
- **Grievance Officer:** as named in `grievance-redressal-policy.md`
- **Postal:** `[REGISTERED OFFICE ADDRESS — Section 0]`

---

## 53. Changes to Terms

53.1 STRYT may update these Terms and the referenced policies from time to time. When we make changes, we will update the "Last Updated" date and, for material changes, provide reasonable notice through the Platform (for example an in-app notice or notification) before they take effect.

53.2 Your continued use of the Platform after changes take effect constitutes acceptance of the updated Terms. If you do not agree, you must stop using the Platform and may request account deletion.

---

## 54. Effective Date

54.1 These Terms take effect on the Effective Date shown at the top of this document, which STRYT will set on publication, and remain in effect while you use the Platform.

54.2 This version (1.0) is a **draft prepared for legal review** and is not yet in force. It must be reviewed and approved by qualified Indian legal counsel, and the Operator Information in Section 0 completed, before publication.

---

*End of Terms & Conditions.*
