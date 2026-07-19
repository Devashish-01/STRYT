# STRYT — Strategy Maps

**Date:** 2026-07-19
**Note:** Auto-generated from codebase analysis (grounded in `STRYT-FEATURES.md`) plus current Indian hyperlocal market knowledge — verify with product & leadership before external use.

Two classic strategy frameworks, rebuilt for STRYT:

1. **Customer Journey Map** — the neighborhood Customer's arc across 5 stages (modeled on the Columbia Road / Strategyzer journey-map format).
2. **Business Model Environment Map** — the four external force-clusters surrounding STRYT's Business Model Canvas (modeled on the Strategyzer environment scan).

> **The one fact both maps keep returning to:** STRYT is a well-built, trust-first, India-DPI-native two-sided engine that is currently **pre-revenue** — it never holds money (UPI/cash only, no payment gateway), its paid tiers/lead-packs/boosts are built in code but **not purchasable**, and its switching costs are near-zero against a **free incumbent (the neighborhood WhatsApp group)**. Read both maps against that tension.

---
---

# PART 1 — Customer Journey Map
### Neighborhood Customer persona · 5 stages × 9 rows

**How to read this map.** Read left-to-right as one person's arc through five stages — from first hearing about STRYT to becoming a repeat user who recommends it. Each of the nine rows is a lens on the same journey (what they do, how they feel, what STRYT does behind the scenes, and on which real systems). The **Experience** row plots a deliberately honest emotional curve, with the trough at the point of genuine product friction, not a decorative smiley march.

**Persona followed here:** the **neighborhood Customer** — the person discovering and hiring/buying from local shops and providers within their own radius. STRYT's two *seller* personas — the **Business owner** and the independent **Provider** — each live a very different journey (listing, getting verified, winning leads, managing bookings, getting paid) that is **not mapped here** and would warrant its own map.

**A note on honesty:** STRYT is **pre-revenue**. It never holds money (no payment gateway — UPI/cash only), and Pro plans, lead packs and boosts exist in code but are **not purchasable**. There is therefore **no revenue/GMV metric to track yet**, and the only growth channel truly wired up is **neighbor-to-neighbor word of mouth**. Analytics are thin: anonymous web usage via Vercel is instrumented, but product-funnel and engagement metrics (DAU/MAU, retention, attribution) are **not** — so KPIs below are flagged *countable from backend records* vs *intended (not yet instrumented)*.

---

### Row 1 — Customer Activities

| Stage | What the customer is literally doing |
|---|---|
| **Awareness** | Hears about STRYT from a neighbor or building WhatsApp group, or scans a shop's physical STRYT QR sticker; opens the PWA link (or installs the Android app) and taps **"Look around first"** to browse shops, providers, open requests and the community feed — everything capped to **1 km**, no account. |
| **Consideration** | Wants to go deeper: opens shop/provider profiles, reads reviews, vouches and the Q&A. Hits the sign-in wall (to see past 1 km or to act) and **signs in with Google**, runs the short profile + neighborhood + radius setup. Then either searches/browses by category, or posts a **Request ("Ask your street")** and waits for quotes; saves favorites, maybe sets a saved-search alert. |
| **Decision** | Compares the quotes that came back (or a shortlist of shops/providers), **negotiates/counters the price in chat**, then commits: **accepts a quote (creates a Deal)**, OR **books an appointment slot** directly, OR **joins a live walk-in queue** remotely. |
| **Delivery & Use** | Watches the Deal's 5-stage tracker and the live **"leaving / on the way / arrived / working"** status (or their live queue position / appointment reminder); receives the service or collects the order; **pays via UPI QR / deep-link or cash and taps "I have paid,"** then waits for the other side to **confirm received**; coordinates over in-app chat; can share a live-tracking link with family. |
| **Loyalty & Advocacy** | Leaves a 1–5 rating with quick tags and an optional cash tip; writes a **"Verified booking"** review; **vouches/endorses** a provider; follows and saves them to a personal list; unlocks achievements; **shares the shop's QR / rating card into the building group**; returns to re-book or post the next Ask. |

### Row 2 — Customer Goals

| Stage | What they want to achieve / feel |
|---|---|
| **Awareness** | "Show me whether there's actually anything useful near me — without making me sign up for yet another app first." |
| **Consideration** | Find the right shop or person, judge whether they're trustworthy and fairly priced, or get real local options for a specific need without ringing around the neighborhood myself. |
| **Decision** | Pick with confidence and lock in a time and price; feel I got a fair deal from someone real and genuinely nearby. |
| **Delivery & Use** | Have it actually happen, on time; know where the person is; pay safely and have proof the money is settled. |
| **Loyalty & Advocacy** | Reward good service, build my own shortlist of trusted locals, and look good passing a good find on to my neighbors. |

### Row 3 — Touchpoints (STRYT's real ones only)

| Stage | Where the interaction happens |
|---|---|
| **Awareness** | Word of mouth in the neighborhood; a shop's physical **STRYT QR sticker**; the PWA link / Android download link on the welcome screen; the **Map** and **Explore** tabs (guest, 1 km); the **Community feed & Stories** (guest view); the view-only **Home** dashboard; a "new business opened nearby" push once they're in. |
| **Consideration** | Shop/provider **profile pages** (reviews, vouches, Q&A, portfolio); **Search** and the category grid; the **"Ask your street" Request composer**; in-app + push notification when quotes arrive; the **Google sign-in** screen; first-time profile setup; the saved-search bell. |
| **Decision** | The **Request detail page** (quote list, counter-offer, accept); in-app **1:1 chat**; the **appointment booking** sheet; **Join queue** on a shop page; in-app + push notifications. |
| **Delivery & Use** | The **Deal/Agreement screen** and progress tracker; the **live location map + shareable WhatsApp tracking link**; the **"it's your turn"** queue card on Home / My Queues; the **UPI QR / payment sheet**; in-app chat; push turn/status alerts. |
| **Loyalty & Advocacy** | The post-deal **rate & tip** sheet; reviews and Q&A on profiles; **vouch/endorse** buttons; **Achievements** and the monthly local **Leaderboard**; Follow / Save / Lists; the shareable **QR + rating card** (dropped into WhatsApp / the building group); the community feed & Stories; re-engagement push. |

### Row 4 — Experience (sentiment + first-person quote)

| Stage | Sentiment | In their words |
|---|---|---|
| **Awareness** | 🙂 **Good** | *"Oh — there's actually a bunch of shops and people right on my own street. Let me poke around."* |
| **Consideration** | 😐 **Neutral** | *"I have to sign in with Google just to look past 1 km… and now that I've posted my ask, I'm just sitting here hoping someone actually replies."* |
| **Decision** | 🙂 **Good** | *"Three real quotes from people a few streets away — and I could haggle a bit. Going with her."* |
| **Delivery & Use** | 🙁 **Poor — the dip** | *"I've paid a stranger over UPI, there's no 'protected' middle-man bit, and now I'm just waiting for them to tap 'received.' Did it even go through?"* |
| **Loyalty & Advocacy** | 😄 **Great** | *"Honestly easier than asking around the building. Five stars, and I'm dropping this in the group chat."* |

**Where the curve dips and why.** The friction isn't one moment but two soft pressures that converge, and STRYT's honest low point is at **Delivery & Use**. Consideration already nudges the mood down — the **guest 1 km cap forces a Google-only sign-in**, and after posting a Request there's a real **"will anyone even answer?" wait**. But the true trough is the **trust leap of paying a real person over UPI with no escrow and no gateway**, followed by **waiting for the other side to manually confirm the "I paid" claim** — STRYT can't even see whether the UPI transfer succeeded, because the money never passes through it. Recovery to "great" comes only *after* the hand-off goes fine and the loop closes cleanly.

### Row 5 — Business Goal (what STRYT the company wants)

| Stage | STRYT's goal |
|---|---|
| **Awareness** | Be discovered as *"the app for my neighborhood"*; show dense, real local supply so the value lands in seconds; get the guest to an aha moment **before** the sign-in ask. |
| **Consideration** | Convert guest → signed-in account, and earn a first meaningful action (a Request posted, a favorite saved, an alert set); let trust signals — reviews, vouches, human-checked verification — do the persuading. |
| **Decision** | Turn intent into a committed **Deal / booking / queue token**, and keep the negotiation and acceptance inside the app. |
| **Delivery & Use** | Make the real-world hand-off feel safe and tracked so people trust neighbor-to-neighbor commerce; get both the **"I paid"** and **"received"** ticks so the transaction loop closes without a dispute. |
| **Loyalty & Advocacy** | Turn a one-off into a habit and a referral; grow the reputation data (reviews/vouches) that makes the *next* customer convert faster; fuel the word-of-mouth loop that is currently STRYT's only real growth engine. |

### Row 6 — KPIs (honest about what's instrumented)

| Stage | Metrics |
|---|---|
| **Awareness** | *Instrumented today:* anonymous visits/sessions and load performance via **Vercel Analytics & Speed Insights** (website only). *Countable from backend records:* new sign-ups, app installs. *Intended (not yet instrumented):* guest→signup conversion, DAU/MAU, and install source — **no attribution or analytics funnel exists yet**. |
| **Consideration** | *Countable from records:* profiles completed, **Requests posted**, favorites saved, saved-search alerts set, quotes received per request. *Intended (not instrumented):* **time-to-first-quote**, % of Requests that get ≥1 quote, and sign-in-wall drop-off — no funnel dashboard. |
| **Decision** | *Countable from records:* quotes accepted → **Deals created**, appointments booked, queue tokens taken, negotiation messages. *Intended:* quote→accept rate, booking abandonment, and the **10-minute deal-confirm expiry rate** — not dashboarded. |
| **Delivery & Use** | *Countable from records:* Deals completed, **"I paid" claims vs "received" confirmations**, disputes raised, live-tracking links generated. *Intended:* payment-confirm turnaround time, on-time status-update rate, dispute rate. *Structural blind spot:* STRYT **cannot measure actual UPI success** — the money never touches it. |
| **Loyalty & Advocacy** | *Countable from records:* reviews/ratings left, vouches/endorsements, follows/saves, repeat bookings, achievements unlocked, QR share-cards generated. *Intended (not instrumented):* **repeat-purchase / retention cohorts, referral attribution (no share-tracking), NPS**. And note: **no revenue/GMV KPI exists** — the product is pre-monetization. |

### Row 7 — Organisational Activities (what STRYT does to support the stage)

| Stage | STRYT's activities |
|---|---|
| **Awareness** | **Seed a neighborhood before launch** — recruit an initial set of shops and providers so it's never an empty map; print and distribute **STRYT QR stickers** to shops; lean on word of mouth; fire "new business nearby" pushes; keep the 1 km guest view genuinely useful. |
| **Consideration** | **Moderate new listings** via the admin approval queue and action content reports; run the **human verification-badge reviews**; keep the price-suggestion comparison data fresh; make sure Requests actually reach relevant nearby sellers (matching + push); community-manage the feed so it stays alive. |
| **Decision** | Keep seller supply responsive so quotes come back quickly (nudge sellers with matching job leads); make sure booking/queue tooling works reliably; keep an eye on the 10-minute deal-confirm window. |
| **Delivery & Use** | Stand ready as the neutral referee — **resolve disputes** (release or cancel a stalled deal) via the admin console; answer support tickets and bug reports; watch payment-claim confirmations; keep push and live-tracking reliable. |
| **Loyalty & Advocacy** | Run the **monthly local Leaderboard**; surface achievements; prompt reviews and vouches; feature active neighborhoods and shops; keep re-engagement notifications relevant and respect quiet hours. |

### Row 8 — Responsible (owning function)

*Caveat: at STRYT's stage these "functions" may be the same one or two people wearing several hats — this maps ownership, not headcount.*

| Stage | Primary owner(s) |
|---|---|
| **Awareness** | **Growth / Community** (neighborhood seeding, QR stickers, word of mouth), supported by **Product** (guest experience) and **Engineering** (map, push). |
| **Consideration** | **Trust & Safety / Ops** (listing approval, verification, moderation), **Community** (feed liveliness), **Product** (Request flow + price helper). |
| **Decision** | **Product** (booking / queue / deal flows), with **Growth / Community** keeping seller supply responsive. |
| **Delivery & Use** | **Trust & Safety / Ops** (dispute resolution, verification, payment-claim oversight), **Support** (tickets, bug reports), **Engineering** (live tracking, push reliability). |
| **Loyalty & Advocacy** | **Community / Growth** (leaderboard, referrals, re-engagement), with **Product** (reviews, achievements, sharing). |

### Row 9 — Technology Systems (only the relevant real ones)

| Stage | Systems in play |
|---|---|
| **Awareness** | The **PWA + native Android app** (with over-the-air updates); **Leaflet / OpenStreetMap map + Nominatim geocoding**; **Supabase** (serves nearby listings and enforces the 1 km guest cap); **Vercel Analytics & Speed Insights**; **web push (VAPID) / Firebase Cloud Messaging** for "new nearby" alerts *(native-push config is incomplete per engineering)*; the **QR scanner** (scanning a shop's sticker); **Google sign-in via Firebase Auth** as the eventual gate. |
| **Consideration** | **Google Sign-In (Firebase Auth)**; **Supabase** (profiles, listings, reviews, vouches, Requests); the **statistics-based price-suggestion helper** *(not an AI chatbot)*; in-app realtime notifications + push for incoming quotes; **Nominatim geocoding** for setting neighborhood/address. |
| **Decision** | **Supabase** (creates the Deal/Agreement, appointment, or queue token; stores the full negotiation history); **in-app realtime 1:1 chat**; realtime + push notifications. |
| **Delivery & Use** | **Live location tracking on the Leaflet map + a public, account-free shareable tracking link**; **UPI deep-links + generated QR codes**; the **QR scanner**; **Supabase** (payment claim/confirm records, live status updates); realtime chat; web push / FCM for turn and status alerts. *No payment gateway is involved — STRYT never processes the money.* |
| **Loyalty & Advocacy** | **Supabase** (reviews, ratings, cash-tip notes, vouches/endorsements, achievements, leaderboard, follows/lists); the shareable **QR + rating card**; the realtime **community feed & Stories**; **saved-search and re-engagement push notifications**. |

### Experience curve at a glance

**Awareness** 🙂 Good → **Consideration** 😐 Neutral → **Decision** 🙂 Good → **Delivery & Use** 🙁 Friction → **Loyalty & Advocacy** 😄 Great

*(The arc dips into real friction at the UPI-payment / manual-confirmation moment — STRYT's genuine trust leap — then recovers strongly once the neighbor-to-neighbor loop closes cleanly.)*

---
---

# PART 2 — Business Model Environment Map

**How to read this map.** This map places STRYT's **Business Model Canvas** in the center and surrounds it with four clusters of external forces, read along four axes exactly as in the Strategyzer frame:

- **↑ Foresight — KEY TRENDS.** What's coming: technology, regulation, society, and the economy shifting *toward or against* STRYT.
- **← Competitive Analysis — INDUSTRY FORCES.** Who else is in the ring right now: incumbents, insurgents, substitutes, suppliers, stakeholders.
- **→ Market Analysis — MARKET FORCES.** The demand side: who the customers are, what they need, why the market is hard, and whether money is on the table.
- **↓ Macroeconomics — MACRO-ECONOMIC FORCES.** The weather system STRYT operates inside: global conditions, capital markets, economic infrastructure, and input costs.

Every bullet ends in the **"so what for STRYT."** Where a force cuts both ways, it's flagged as **Threat + Opportunity**.

## Business Model Canvas (Center) — STRYT as it exists today

| Block | STRYT reality (honest) |
|---|---|
| **Customer Segments** | (1) Urban/peri-urban **neighborhood consumers** who want nearby shops, providers, help, and a local feed. (2) **Small local shops** with weak or no digital storefront (kirana, salon, tiffin, repair, clinic, tuition centre). (3) **Independent solo providers** — plumber, electrician, tutor, beautician, freelancer — one profile each. (4) **Residential societies** — a real, fully-built segment but the module is **dormant/unreachable today**. The same person can be all of segments 1–3 at once ("hats"). |
| **Value Propositions** | *For consumers:* find trusted people *actually near you* (radius-locked), post an "Ask" and get local quotes, book/queue/track, all with privacy (real name hidden by default) and a safety net (dispute resolution, live-location "My People"). *For sellers:* get discovered locally in minutes, run bookings/queue/catalog/payments from one console, win jobs from open Requests — with **no commission taken** (STRYT never touches the money). *The moat:* human-verified badges, neighbor vouches, and no stored location trail — trust-first, not scale-first. |
| **Channels** | Mobile-web **PWA** + **native Android app**; guest browsing (1 km) as a try-before-signup top-of-funnel; QR codes bridging physical shop → STRYT page; in-app + web/FCM push; word-of-mouth within a neighborhood (the core viral loop). |
| **Customer Relationships** | Self-serve throughout; community-driven (feed, Stories, vouches, leaderboard, achievements = light gamification); human-in-the-loop only at the trust chokepoints (verification review, dispute resolution, moderation). Retention rests on **network density + accumulated reputation data**, not lock-in. |
| **Revenue Streams** | **₹0 today — NOT activated.** Pro subscription tiers (Basic/Pro/Premium for shops), provider lead-credit packs, and paid visibility Boosts are **fully priced in code but not purchasable** (no payment gateway; Boosts explicitly say "billed offline for now"). Loyalty/coupons wallet, recurring-subscription tracking, and the society module are **built but dormant**. There is **no live monetization**. |
| **Key Resources** | The neighborhood **graph + reputation data** (reviews, vouches, verified badges, deal history) — the compounding asset. The **codebase** (three consoles, queue engine, deal/tracking engine, community). The **trust brand** ("Your street. Your people."). Human moderation/verification capacity. |
| **Key Activities** | Seeding **neighborhood-by-neighborhood liquidity** (two-sided cold start); manual verification + dispute resolution + moderation; product build-out of the dormant monetization surfaces; keeping the map/geo/push infrastructure running. |
| **Key Partners** | **Supabase** (all backend/data + auth-enforcement), **Firebase** (Google sign-in; FCM push, config incomplete), **OpenStreetMap / Nominatim** (maps + geocoding — *not* Google Maps), **UPI apps / NPCI rails** (GPay/PhonePe/Paytm/BHIM for the actual money movement), **Vercel** (web hosting + analytics), **Google Play / Android** ecosystem. |
| **Cost Structure** | Lean: **Supabase compute/storage/bandwidth**, push/(future SMS)/map-API calls, Vercel hosting, **engineering talent**, and — the big one for a low-ARPU market — **customer-acquisition + neighborhood-seeding cost**. No payment-processing cost (a benefit of the non-custodial model), no inventory, no logistics fleet. |

> **Center-of-map flag:** The canvas is coherent and lean, but the **Revenue Streams block is empty by design-state, not by strategy** — every lever exists in code and none is switched on. Read the whole map as "a well-built two-sided engine idling at the start line, waiting on liquidity and a payment rail."

## ↑ KEY TRENDS (Foresight)

### Technology Trends
- **UPI is now the default way India pays.** STRYT's entire payment model is UPI-deeplink + QR claim/confirm — riding this tailwind means **zero payment-onboarding friction**. *But it also means STRYT captures **no transaction margin** — the rail it depends on is exactly the rail that lets money bypass it.*
- **UPI-first commerce (autopay, UPI Lite, credit-on-UPI).** *A future STRYT monetization path (subscriptions, lead packs) could plug into UPI Autopay for recurring billing without a heavy gateway — the lightest possible route to switching Revenue Streams "on."*
- **ONDC maturing.** An open, interoperable network for local commerce is the single biggest structural shift in Indian hyperlocal. **Threat:** any ONDC-connected buyer app can surface local sellers, eroding STRYT's "discover nearby" moat. **Opportunity:** STRYT could become an **ONDC node**, plugging its verified local shops into national demand without building it. *ONDC is the one external platform STRYT must have an explicit position on — join it or be disintermediated by it.*
- **Quick-commerce has normalized "instant local."** *STRYT's live queue, "Available now" toggle, and urgent Requests align with this expectation — but the bar is now set by the quick-commerce giants.*
- **PWA + sub-₹8,000 Android + cheap data (Jio effect).** *The PWA/guest-browse combo is the right architecture for the "next billion users" and keeps distribution cost low.*
- **Vernacular + voice for the next-billion user.** STRYT already ships English/Hindi/Marathi + voice-to-text on Requests. *Table-stakes-correct, but the language set (3) must widen fast to travel beyond Maharashtra/Hindi-belt.*
- **AI in local discovery.** **Threat:** Google/Gemini-style assistants may answer "who's a good local X" above STRYT. **Opportunity:** STRYT's structured, verified, review-rich local data is exactly the corpus AI-local needs. *Don't over-claim "AI" now, but protect the trust graph that makes AI-local possible later.*

### Regulatory Trends
- **DPDP Act 2023 + 2025–26 rules.** STRYT already does privacy-by-default (names hidden, **no location trail — only last-known point**, per-field privacy switches, 30-day deletion grace). *Unusually well-positioned to be compliant and to market privacy as a differentiator — but must formalize consent, a Supabase/Firebase data-processing agreement, and a grievance officer. "My People" live-location is the highest-sensitivity surface.*
- **Gig-worker regulation (Code on Social Security 2020; state platform-gig laws).** *STRYT's non-custodial, non-dispatching model (never assigns jobs, never holds pay, providers set their own price) likely sits **outside** the heaviest aggregator obligations — a structural advantage over Urban Company-style models, worth a legal read to preserve if commissions are ever added.*
- **KYC norms.** Verification is human-reviewed, not automated. *Defensible and trust-building, but a scaling cost; DigiLocker/Aadhaar e-KYC could speed it up without losing the "a human approved it" credibility.*
- **Consumer-protection / e-commerce marketplace rules (2020).** **Threat:** STRYT looks like a marketplace and may attract seller-info/grievance obligations even though it holds no money. *Its built-in dispute + reporting flows are assets here; it needs a clear public intermediary-status stance.*
- **Platform-liability debates.** *STRYT's "holds no money" + dispute-resolution + moderation posture is its liability shield — but taking a commission or holding funds changes that profile materially. A conscious fork in the road.*

### Societal & Cultural Trends
- **Neighborhood revival vs. anonymity of national platforms.** *STRYT's "your street, real neighbors, private-by-default" is with the cultural grain — "the anti-JustDial that knows your street" is a genuine wedge.*
- **Trust deficit in unvetted local services.** *STRYT isn't inventing a behavior — it's digitizing "ask a trusted neighbor," the most defensible thing it does.*
- **Safety, especially for women meeting service people/strangers.** *"My People" live-location, tracking links, and approval-gated exact-location are real, resonant differentiators in the Indian context — should be front-and-center in marketing, particularly to women users and households.*
- **WhatsApp-group-as-local-commerce is the entrenched behavior.** **Threat (huge):** free, habitual, everyone's already in it. **Opportunity:** groups are chaotic, unsearchable, un-moderated, with no reputation memory or safety layer. *The pitch must be "the structure and trust your WhatsApp group can't give you." Convert the group, don't fight the habit.*
- **"Vocal for Local" sentiment.** *STRYT's whole premise (radius-locked, local, no commission) aligns with a live national sentiment — lean on it in brand storytelling and merchant onboarding.*

### Socioeconomic Trends
- **Explosion of the solo / gig / creator service economy.** *The Provider hat is purpose-built for this growing segment; the leaner provider toolkit is correctly sized for a one-person operation.*
- **Small-merchant digitization wave (post-UPI).** *STRYT arrives as many small shops are ready for a *second* digital step beyond accepting UPI — a discoverable storefront + bookings + queue, in minutes, no commission.*
- **Urbanization & dense neighborhoods.** *Density is STRYT's friend — the radius model only produces value where supply is dense, so launch neighborhood-by-neighborhood in dense areas, not thin national coverage.*
- **Rising disposable income in tier-1/2 cities.** *Willingness to pay for convenience is rising — but low per-transaction ARPU constrains direct user charges, pushing monetization toward sellers, not buyers.*

## ← INDUSTRY FORCES (Competitive Analysis)

### Competitors (Incumbents) — who owns which STRYT loop today
- **JustDial (Reliance) & Sulekha** — own "find a local business/service + get callbacks/quotes," overlapping STRYT's **Requests→quotes** loop most directly. *STRYT differentiates on radius-honesty, privacy, no spam-callbacks, human-verified badges, and neighbor vouches — JustDial's weakness is that it feels like a lead-spam machine, not a trusted neighbor.*
- **Urban Company** — owns **standardized home services** with vetting + in-app payment, overlapping STRYT's provider **appointment booking**. *UC is premium, curated, commission-heavy, not hyperlocal-social; STRYT counters with independent local providers at local prices, no commission, community trust. Don't out-curate UC — out-*localize* and out-*breadth* it (STRYT lists the plumber UC won't).* 
- **Google Business Profile / Maps + Search** — owns **discovery + reviews + call/directions**, free and default; STRYT's most powerful discovery competitor. *STRYT can't beat Google on map data (it runs on OpenStreetMap) — it wins on what Google lacks: **live queue, join-remotely, bookable slots, verified neighbor vouches, a two-way Request marketplace, and privacy.** "The transaction + trust layer Google Maps doesn't have."*
- **Facebook Marketplace / Groups & Nextdoor-style apps** — own the **community feed / buy-sell / chatter** loop. *STRYT's edge: the feed and the marketplace are the same app, so a "recommend a plumber" post can become a booking.*
- **Hyperlocal listing directories / city apps** — *fragmented, low-trust, ad-driven; STRYT's integrated trust + transaction + safety stack is a step up, but they hold local SEO and habit in specific cities.*

### New Entrants (Insurgents)
- **Quick-commerce expanding sideways (Blinkit, Zepto, Swiggy Instamart; Swiggy/Zomato services ambitions).** **Threat:** if they add "book a local service," they arrive with instant liquidity STRYT would kill for. *Defensibility is the stuff they won't build — non-custodial peer payments, human-verified trust, privacy, community, safety. Speed to neighborhood density is the only real defense on liquidity.*
- **ONDC-based buyer/seller apps.** *Simultaneously STRYT's biggest new-entrant threat and its biggest potential distribution partner — neutral-to-hostile if ignored, powerful if embraced.*
- **RWA / society super-apps (MyGate, NoBroker, ADDA, Apnacomplex).** MyGate already owns gated-community entry/visitor/local-services and is expanding into community + commerce — a **direct threat to STRYT's dormant Society/gate-pass module.** *Releasing that module head-on against MyGate is a hard fight; better to treat it as a *distribution channel into a neighborhood* (seed liquidity society-by-society) than as a MyGate competitor.*
- **AI-native local-discovery startups.** *Their weakness is the same — they need trustworthy, verified, structured local data, which STRYT is quietly accumulating. Risk: a well-funded AI entrant buying/scraping liquidity faster.*
- **Apna / local-jobs apps drifting toward services.** *Adjacent; watch the provider-side overlap ("find local workers").*

### Substitute Products & Services — *treat this as the real competition*
- **The neighborhood WhatsApp / Telegram group.** Free, universal, habitual, zero-install, already contains everyone. Substitutes STRYT's **entire community feed AND Requests loop AND recommendations**. *This — not JustDial or UC — is STRYT's true primary competitor. STRYT wins only where the group fails: search, reputation memory, verified identity, safety, structured bookings, and no 200-message scroll. GTM must explicitly convert existing groups.*
- **Phone call / word-of-mouth / "ask the watchman or neighbor."** *STRYT digitizes exactly this (vouches = word of mouth made durable); its job is to make the recommendation *persist and travel*.*
- **Physical noticeboards / society boards / shop windows.** *Low-tech but zero-friction; STRYT's QR-code bridge (physical → STRYT page) is the right tool to convert it.*
- **Google Search + "near me."** *The default reflex; STRYT must earn a place in the consideration set *before* the search reflex fires, via neighborhood presence and community habit.*
- **Just walking to the shop.** *STRYT only beats walking when it saves a wasted trip — live open/closed, live queue, "in stock," "available now." Those specific features are the substitute-beaters; generic browsing is not.*

### Suppliers & Other Value-Chain Actors (dependency & lock-in risk)
- **Supabase — entire backend, data, auth-enforcement, RLS.** The #1 supplier-power risk. *High concentration; pricing/downtime/migration all hit existentially. Mitigated somewhat by Postgres-underneath portability, but monitor cost and portability actively.*
- **Google / Firebase — sign-in (only live auth) + FCM push (config incomplete).** *STRYT's only live login is Google — an outage/policy change locks users out entirely. The built-but-off phone/email OTP flow is a de-risking asset to prioritize. Native push isn't fully live — a functional gap.*
- **OpenStreetMap / Nominatim — maps + geocoding.** *Lower cost, no Google lock-in, but Nominatim has usage limits and thinner India POI data — a conscious quality tradeoff; may need a paid geocoding tier at volume.*
- **UPI rails / NPCI + UPI apps.** *STRYT depends on UPI reliability and NPCI policy (e.g. any future UPI MDR) for its whole payment UX, but bears none of the processing cost. Low lock-in, high reliance.*
- **Vercel — hosting + analytics.** *Standard, replaceable, low-risk.*
- **Google Play / Android + OTA update channel.** *Play policy (payments, data-safety, APK distribution) governs native reach; the OTA-update capability reduces dependence on Play review cycles — a small strategic edge.*

### Stakeholders
- **Local shop owners** — supply side #1; the harder half of the cold start. *"No commission, live in minutes" is the acquisition lever.*
- **Gig / solo providers** — supply side #2; likely the cheapest, most enthusiastic supply to seed first.
- **Neighborhood residents** — demand side + community lifeblood; *without them posting/vouching/reviewing, the trust graph never compounds.*
- **RWAs / housing societies** — gatekeepers to dense, pre-formed neighborhoods; *a B2B2C channel, but also where MyGate already sits.*
- **Moderators / verification reviewers (STRYT's own humans)** — the trust guarantee; *a real cost and scaling constraint the whole brand rests on.*
- **Potential investors** — *will press hardest on ₹0 revenue and near-zero switching costs.*
- **Potential regulators** — *STRYT's privacy/non-custodial posture is a regulatory asset today; keep it that way rather than trade it for margin.*

## → MARKET FORCES (Market Analysis)

### Market Segments
- **Urban neighborhood consumers (tier-1/2, dense areas)** — *the beachhead; launch where density makes the radius model instantly useful.*
- **Small local shops with weak/no digital presence** — *highest-volume supply, most under-served; the "free storefront in minutes" wedge.*
- **Independent solo service professionals** — *fast-growing, natural Provider-hat fit, cheap to acquire, where trust/vouches matter most.*
- **Residential societies (module dormant)** — *built-for but not yet serviceable; treat as a future channel, and be honest it's not live.*

### Needs & Demands
- **Trust in local providers** — *STRYT's core job-to-be-done; vouches + verified badges + reviews serve it directly.*
- **Proximity & convenience (genuinely near)** — *the radius-lock *is* the value prop; distance-honesty is a feature to market, not a limitation.*
- **Fair, transparent local pricing** — *served by upfront pricing, quote negotiation, group buy, Smart Price Suggestions.*
- **Safety meeting strangers** — *"My People," tracking links, approval-gated location meet a need competitors ignore.*
- **Being discovered (sellers)** — *the supply-side demand STRYT monetizes later — but must deliver organic discovery first.*
- **Getting paid simply (UPI) with proof** — *the claim/confirm model gives both sides a record without a gateway — meets the need, sacrifices the margin.*

### Market Issues
- **Trust deficit + fragmentation in local services** — *the market gap STRYT exists to fill; its central opportunity.*
- **Low digital literacy among some merchants** — *onboarding must be near-zero-friction (it's 4 steps + live-in-minutes), and may need field-agent hand-holding to seed a neighborhood.*
- **Two-sided cold start, *per neighborhood*.** *The hardest structural problem on the map — value is radius-locked, so there's a fresh cold start in *every* neighborhood. National counts are meaningless; only local density creates value. Win block-by-block.*
- **The strongest alternative (WhatsApp) is free and habitual** — *STRYT must offer what the group *structurally cannot*; incremental convenience won't overcome a free incumbent habit.*

### Switching Costs — *analyzed honestly*
- **Switching TO STRYT from WhatsApp/word-of-mouth: low effort, but needs behavior change + local liquidity.** *Acquisition friction is *social*, not technical — you can't onboard one person usefully; you must onboard a critical mass of a neighborhood at once.*
- **Switching costs are LOW in both directions.** *Nothing locks a shop or resident in — no held balance, no exclusive inventory, no contract. A **strategic vulnerability**: STRYT cannot rely on lock-in. Retention must be earned continuously through (a) network density and (b) accumulated, non-portable reputation data.*
- **The only real switching cost STRYT can build is reputation gravity.** *A provider with 40 vouches, a verified badge, and 30 verified-booking reviews loses that if they leave. Deliberately deepening reputation-data density is the *only* moat available in a zero-lock-in world.*

### Revenue Attractiveness — *blunt*
- **Today: pre-revenue. ₹0. No live monetization** (no gateway; every paid surface off). *State plainly to stakeholders — an engine with no fuel line.*
- **Latent levers already in code (need a payment rail + liquidity):** Pro subscriptions for shops (cleanest first revenue), provider lead-credit packs (cost aligned to value), paid visibility Boosts (currently "billed offline"). *Fastest activation is likely subscriptions + boosts via UPI Autopay, monetizing sellers (willingness-to-pay) not buyers (low ARPU).*
- **Plausible future levers:** transaction commission (*only if a gateway is added — which changes the liability + regulatory profile*), the society module as B2B2C, loyalty/coupons wallet economics, featured-placement ads. *Each trades something away — commission trades the "no commission / never touch your money" trust pitch; ads trade the clean feel that differentiates it from JustDial. Monetization choices are positioning choices.*
- **The chicken-and-egg:** *no lever earns until a neighborhood is liquid enough that visibility/leads/pro-tools are worth paying for. **Liquidity precedes revenue, always.** Fund and sequence for density first.*

## ↓ MACRO-ECONOMIC FORCES (Macroeconomics)

### Global Market Conditions
- **Funding climate for consumer/hyperlocal has cooled from the 2021 peak** — a "proven-then-cooled" category worldwide. *STRYT raises into skepticism; lead with capital-efficiency (lean, non-custodial, no fleet, PWA distribution) and a density-first path, not a blitzscale story.*
- **Higher-for-longer rates raised the cost of startup capital.** *Investors want line-of-sight to revenue; the pre-built (un-activated) monetization surfaces are the asset to show "the meter is ready to switch on."*
- **"Community/local" is having a values-moment even as its economics are scrutinized.** *The narrative tailwind is real, but must be paired with hard per-neighborhood economics to convince capital.*

### Capital Markets
- **Indian VC for pre-revenue consumer marketplace: available but cautious, thesis-driven.** *STRYT fits a fundable thesis (Bharat/next-billion, UPI-native, trust-and-safety) but is underwritten on cohort density and retention, not vanity installs.*
- **Skepticism post quick-commerce shakeout and hyperlocal flameouts.** *Expect pointed questions on CAC in a low-ARPU market, the WhatsApp substitute, and zero switching costs — pre-empt exactly these three in the deck.*
- **Pressure to show a monetization path, not just growth.** *Advantage: STRYT can honestly say "paid tiers, lead packs, boosts are already built — activation is a payment-rail + liquidity decision, not a build," turning the ₹0 weakness into a "loaded and ready" story.*

### Economic Infrastructure — *India's DPI is a genuine tailwind*
- **UPI** — the payments rail STRYT is built directly on. *The single biggest enabling piece; STRYT's payment model literally could not exist without it.*
- **Aadhaar / DigiLocker e-KYC** — *a path to faster, cheaper verification without losing the human-approved trust layer; a way to scale the moderation bottleneck.*
- **Cheap mobile data + high smartphone penetration (Jio effect)** — *makes a data-heavy map/feed/chat app viable down to low-income tier-2/3 users; the "next billion" is actually reachable.*
- **ONDC as public commerce infrastructure** — *a national demand/supply network STRYT can plug into instead of building alone; the most consequential DPI piece for STRYT's *growth*, as UPI is for its *payments*.*
- **Net:** *India's DPI stack is unusually favorable to a lean, local, UPI-native, ID-verifiable app — STRYT rides four public rails (UPI, Aadhaar/DigiLocker, cheap data, ONDC) it didn't have to build. The strongest structural tailwind on the map.*

### Commodities & Other Resources (real input costs)
- **Cloud / Supabase compute, storage, bandwidth** — scales with data (maps, images, chat, stories, notifications). *The primary variable cost; image/story-heavy features and per-neighborhood realtime can drive it up — needs active cost governance as density grows.*
- **Push / (future) SMS / map-geocoding API calls** — *enabling SMS-OTP and native push adds real per-message cost; weigh against the reliability benefit of a non-Google login fallback.*
- **Engineering talent cost in India** — *lower than the West but rising for quality full-stack/mobile talent; the small, capable codebase is an asset — keeping the team lean is essential pre-revenue.*
- **Customer-acquisition cost in a low-ARPU market** — the hardest input: acquiring a *whole neighborhood* (both sides) cheaply. *Paid CAC won't clear a low-ARPU, zero-switching-cost model — growth must lean on organic, viral, word-of-mouth, QR-bridge, and society/RWA channel seeding. CAC discipline is existential.*

## Strategic tensions — *the sharpest contradictions this map reveals*

1. **Trust-and-privacy is the real moat — but the biggest competitor is free and already trusted.** STRYT's defensible edge (human-verified badges, vouches, privacy-by-default, safety tools) is exactly what the neighborhood WhatsApp *group* lacks — yet the group is free, universal, and habitual. STRYT wins only by converting existing groups with structure and safety they *cannot* replicate, not by asking neighbors to abandon a free habit for a marginally nicer feed.

2. **The non-custodial, no-gateway model keeps STRYT lean, low-liability, and regulator-friendly — but caps monetization to indirect, seller-side levers.** Never touching the money is a genuine trust and cost advantage (no processing fees, lighter aggregator/gig-labour/consumer-protection exposure). The same choice forfeits the most natural revenue stream (commission) — and adding commission later would trade away the very trust/positioning that differentiates STRYT.

3. **Network density is everything, yet switching costs are near-zero in both directions.** Value is radius-locked, so STRYT faces a fresh two-sided cold start in *every* neighborhood — and nothing locks anyone in once they're there. The only durable retention asset is **reputation gravity** (vouches, verified badges, review and deal history that live only inside STRYT). Without deliberately deepening that non-portable trust data, STRYT has no moat at all.

4. **Everything to monetize is already built — but nothing can earn until liquidity exists first.** Pro tiers, lead packs, boosts, loyalty, and a whole society module sit finished in code — a strong "loaded and ready" investor story, but also a trap: activating revenue before a neighborhood has density will fail and burn trust. **Liquidity must precede monetization, always** — the sequencing is non-negotiable.

5. **India's public infrastructure (UPI, ONDC, Aadhaar, cheap data) is STRYT's greatest tailwind and its greatest disintermediation risk.** The same rails that make STRYT cheap and viable also let money bypass it (UPI), let any rival surface its local sellers (ONDC), and let AI assistants answer "find a plumber" above it. STRYT must ride these rails *and* take an explicit position on each — especially ONDC, either its biggest distribution partner or the network that routes around it.

---

**Bottom line for strategy + marketing:** STRYT is a well-architected, trust-first, India-DPI-native two-sided engine that is currently idling — coherent canvas, empty revenue block, near-zero switching costs, and a free incumbent (the neighborhood WhatsApp group) as its true rival. Its entire strategic game is: **win neighborhood density block-by-block, convert the WhatsApp group with structure + safety it can't match, compound reputation data as the only available moat, and switch on the already-built seller-side monetization only once a neighborhood is liquid — without trading away the privacy/non-custodial trust that is the whole reason to prefer it.**
