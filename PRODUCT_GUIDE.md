# STRYT Product Guide: Hyperlocal Marketplace & Live Storefront App

Welcome to the **STRYT Product Guide**. This document is a comprehensive inventory and functional description of every feature implemented in the **STRYT** application. It serves as a definitive resource for marketing analysis, business development, growth strategy, and product positioning.

---

## 🗺️ Core Vision & The "Hats" Model

**STRYT** (Your Street. Your People.) is a mobile-first, hyperlocal community marketplace and live storefront app. Designed to act as the digital heartbeat of a street or neighborhood, it bridges the gap between consumers, local brick-and-mortar shops, and independent freelancers without requiring complex enterprise software.

### The "Hats" Identity Model
Unlike traditional marketplaces that force users to register separate accounts for buying and selling, STRYT operates a unified account architecture. A single login grants access to the app, and users wear different "hats" by toggling their **active context** (`customer`, `business`, or `provider`) from a dropdown in the UI. 

This model removes registration barriers, encourages cross-role engagement, and builds a tight-knit community loop (e.g., a plumber who lists services as a Provider during the day can post a neighborhood request as a Customer in the evening).

---

## 👥 Role-Wise Feature Directory

```
                                  ┌───────────────────────────┐
                                  │   Unified STRYT Account   │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
      ┌────────────────────┐         ┌────────────────────┐         ┌────────────────────┐
      │ CUSTOMER (Neighbor)│         │ BUSINESS (Shop)    │         │ PROVIDER (Freelance│
      └────────────────────┘         └────────────────────┘         └────────────────────┘
       • Broadcast Request            • Today Triage Console         • Availability Toggle
       • Bidirectional Neg.           • Live Queue Management        • Prospecting Feed
       • Booking & Timetable          • Hourly Timetable             • Proposal Templates
       • Remote Queue Join            • Block Slots & Walk-ins       • Earnings Ledger
       • Chats & Pre-filled Qs        • Product Catalog              • Fixed-Price Packages
       • Community Feed & Polls       • Custom Service Packages      • Portfolio Showcase
       • Ephemeral Stories            • Team Roster                  • KYC Verification
       • Privacy Toggles              • Loyalty Stamps               • Seller Community Post
       • Trust Ratings                • KYC Verification             • Direct Chat
```

---

## 1. Customer (Neighbor) Features

Designed to minimize the time from "needing a service" to "getting it done," the Customer experience emphasizes real-time availability, clear price signals, and neighbor-vouched trust.

### 1.1 Hyperlocal Service Requests (Broadcast Loop)
*   **Description:** Instead of digging through directories, customers broadcast their needs directly to the neighborhood.
*   **Detailed Function:**
    *   **Post Composition:** Customers specify a Title, Description, Category (required), Subcategory (optional), Budget Range (min/max), Payment Type (fixed vs. hourly), Schedule, Radius (cap on broadcast, default 3km), and Expiration (3 to 24 hours). They can also attach up to 4 photos.
    *   **Anonymity Toggle:** A privacy switch allows customers to broadcast requests anonymously. The request displays as "Someone nearby" with a blank avatar until an agreement is formally entered.
    *   **Auto-Expiry:** System housekeeping automatically moves expired requests to `EXPIRED` status if no bid is accepted.
    *   **Social Proof ("Me Too"):** Other neighbors with the same problem can "+1" the broadcast, increasing the request's social weight and signaling high demand to providers.

### 1.2 Proposal View & Bidirectional Negotiation
*   **Description:** Customers review proposals from local responders and haggle on price and details.
*   **Detailed Function:**
    *   **Proposal Triage:** Proposals are displayed under the request, sortable by price, rating, or distance.
    *   **Haggling Threads:** A bidirectional chat interface allows the customer and responder to exchange counter-offers (price + message).
    *   **Atomic Acceptance:** Once the customer accepts a proposal, the system automatically rejects all sibling bids, updates the request to `IN_PROGRESS`, and initiates the Agreement flow.

### 1.3 Mutual Confirmation & Escrow Agreement Flow
*   **Description:** Gated contract activation to ensure both sides commit.
*   **Detailed Function:**
    *   **10-Minute Lock:** The agreement is initialized as `PENDING`. Both the customer and the provider must tap "Confirm" within 10 minutes. If the countdown expires without double-confirmation, the agreement auto-cancels, and the customer's request is reopened for bidding.
    *   **Escrow Security:** Once active, the customer pays a deposit (held securely by the STRYT system, shown as a 🔒 HELD badge). Funds are released (✓ RELEASED) only upon mutual completion or admin dispute resolution.
    *   **Dispute Center:** If the work is unsatisfactory or incomplete, the customer can flag the agreement as `DISPUTED` to trigger admin arbitration.

### 1.4 Live Status Tracking & Map view
*   **Description:** Real-time visibility into the provider's progress.
*   **Detailed Function:**
    *   **Progress Timeline:** Displays live status steps: `CONFIRMED` ➔ `LEAVING` ➔ `ON_THE_WAY` ➔ `ARRIVED` ➔ `WORKING` ➔ `DONE`.
    *   **Live Tracking Map:** Active when the provider is `ON_THE_WAY` or `ARRIVED`, displaying the provider's GPS coordinate updates.
    *   **Emergency SOS:** An on-screen SOS button allows customers to trigger an instant emergency alert, fanning out location coordinates to preset emergency contacts.
    *   **Shareable Tracking Link:** Customers can generate a public, 4-hour tracking link (un-guarded route) so family members can watch the provider's arrival without needing a STRYT login.

### 1.5 Direct Appointment Bookings
*   **Description:** Booking slots directly against a business's catalog menu or provider's packages.
*   **Detailed Function:**
    *   **1-Booking-Per-Day Guard:** To prevent slot hoarding and ensure fair neighborhood access, customers are restricted to booking a maximum of one slot per day per target.
    *   **Flexible Inputs:** The booking sheet allows selection of the specific service catalog item, date, time slot, additional text notes, and a reference photo of the issue.

### 1.6 Virtual Queue (Digital Walk-ins)
*   **Description:** Remotely joining the queue of local brick-and-mortar storefronts to avoid waiting in line.
*   **Detailed Function:**
    *   **Storefront Wait-Time Indicator:** Displays wait times dynamically under the storefront profile (e.g., `🟢 Open · 👥 3 in queue (~18 min)`).
    *   **Queue Dashboard (`MyQueues`):** Shows position, people ahead, estimated turn time, and a live counter.
    *   **Turn Notifications:** When the shop owner calls the customer's token, the UI flashes a `CALLED` banner: "It's your turn — head in now!".
    *   **Self-Service Exit:** Customers can exit the queue at any time, updating their token to `LEFT`.

### 1.7 Community Feed & Ephemeral Stories
*   **Description:** Interacting with neighbors and local businesses.
*   **Detailed Function:**
    *   **Post Categories:** Users post alerts, giveaway listings, lost-and-found items, recommendations, and polls.
    *   **Interactions:** Support for liking, commenting (with phone sharing gated by privacy), and voting on polls.
    *   **Map-Based Stories:** View 24-hour video/photo updates from neighbors within a 2km radius. Users see who has viewed their stories in a dedicated viewer list.

### 1.8 Privacy Control & "You" Page
*   **Description:** Comprehensive identity management and data privacy.
*   **Detailed Function:**
    *   **First-Name Identity:** Real names and alias identifiers are retired in public views; the first name serves as the public handle.
    *   **Field-Level Toggles:** Customers can hide/show chosen details on their public profile: Posts, Asks, Badges, Phone (creates a direct `tel:` link), City, and Ratings.
    *   **Deduplicated Hub:** Single panel displaying bookmarks, active queue tokens, appointment logs, and follower lists.

---

## 2. Business User (Local Shop) Features

Optimized for storefront owners who need to coordinate staff, manage walk-in traffic, and process payments rapidly with minimal distraction.

### 2.1 The "Today" Triage Console
*   **Description:** A dashboard landing page designed to handle the day's revenue-generating actions.
*   **Detailed Function:**
    *   **Live Status Toggle:** One-tap switch to open/close the shop online.
    *   **Queue Control Panel:** A quick "Call next" button is surfaced on the dashboard to pull the oldest customer from the waitlist immediately.
    *   **Action Needed List:** A unified feed to accept/decline bookings, confirm or reject claimed UPI payments, answer questions, and reply to reviews inline without switching tabs.

### 2.2 Live Queue Console (`QueueManager`)
*   **Description:** Managing walk-in traffic and remote customers in a digital line.
*   **Detailed Function:**
    *   **Consolidated Board:** Visual columns showing `WAITING`, `CALLED`, and `SERVED` lists.
    *   **Wait-Time Calibration:** Set average service time (e.g., 15 minutes per customer) which dynamically recalculates the live wait times shown to customers.
    *   **Walk-in Registration:** Add walk-in customers manually (without STRYT accounts) using their names or descriptions to ensure the waitlist count remains accurate.

### 2.3 Hourly Timetable & Appointment Console
*   **Description:** Timetable-first scheduling sheet replacing paper appointment books.
*   **Detailed Function:**
    *   **Timetable Grid:** Interactive vertical timeline showing hour-by-hour bookings.
    *   **14-Day Date Strip:** Horizontal calendar chips showing the number of appointments scheduled on each day.
    *   **Slot Blocking:** Owners can block specific slots (e.g., for lunch breaks) or full days (e.g., Sunday closure), which instantly hides those hours from the customer's booking options.
    *   **Manual Booking Entry:** Owners can register walk-in appointments (customer name + phone number) directly onto the grid.
    *   **Attribution & Dimming:** Cancelled appointments show clear banners attributing who cancelled (`CUSTOMER`, `OWNER`, or `SYSTEM`). Customer-cancelled rows are dimmed automatically.

### 2.4 Catalog & Packages Manager
*   **Description:** Creating menus and bundles of services.
*   **Detailed Function:**
    *   **Menu Catalog:** List items with photos, descriptions, and a toggle for inventory type (`FINITE` stock vs. `INFINITE` service).
    *   **Service Packages:** Define bundles (Name, Description, Price, and Duration) that customers select on the booking screen instead of buying individual items.

### 2.5 Team Roster
*   **Description:** Storing staff details for scheduling.
*   **Detailed Function:**
    *   **Staff Profiles:** Name, phone, and role (`Staff` or `Manager`) fields. This roster allows the manager to track coverage and assign bookings.

### 2.6 Merchant Verification & Trust Setup
*   **Description:** Verification Center to lock in shop authenticity.
*   **Detailed Function:**
    *   **KYC Portal:** Upload Aadhaar, PAN, and storefront photos. Status is set to `UNDER_REVIEW` until approved by the admin, unlocking a green verified checkmark badge.

### 2.7 Payments & UPI Setup
*   **Description:** Managing bank routing and QR code display.
*   **Detailed Function:**
    *   **UPI Routing:** Set the business UPI ID.
    *   **Custom QR Code:** Upload a payment QR code displayed to customers during checkout.
    *   **UPI Verification:** View claimed customer UPI payments. Tapping "Confirm" updates the appointment to `PAID` (rejecting prompts the customer to retry).

---

## 3. Provider (Freelancer) Features

Geared towards independent service professionals who travel to jobs, require prospecting tools, and manage their own pricing.

### 3.1 "Available Now" Presence Controller
*   **Description:** The provider's core revenue driver.
*   **Detailed Function:**
    *   **Instant Availability:** Toggle "Available Now" with a duration slider (e.g., active for the next 2 hours). This highlights the provider on the map and places them in the customer's "Free Right Now" search results.

### 3.2 Prospecting & Proposal Feed
*   **Description:** Hunting for nearby jobs.
*   **Detailed Function:**
    *   **Matches Feed:** Filtered list of open service requests within the provider's radius and category.
    *   **Proposals Board:** Section to submit proposals (Price, ETA, custom message) and track active, accepted, and rejected proposals.
    *   **Proposal Templates:** Save reusable bid text and pricing templates to allow proposal submissions in under two taps.

### 3.3 Earnings Ledger & Money Home
*   **Description:** A dedicated finance section.
*   **Detailed Function:**
    *   **Earnings Tracking:** Summary of this week's and month's earnings.
    *   **Unpaid Claims:** List of appointments waiting for payment confirmation.
    *   **UPI & QR Setup:** Configure payment credentials and QR codes.

### 3.4 Jobs Timetable & Block Slots
*   **Description:** Timetable scheduling matching the business owner's console.
*   **Detailed Function:**
    *   **Timetable Integration:** View appointments in vertical time blocks.
    *   **Slot Blockers:** Tap slot cards to mark hours unavailable.

### 3.5 Portfolio Showcase & Profile Editor
*   **Description:** Direct customer-conversion surface.
*   **Detailed Function:**
    *   **Work Reels:** Upload portfolio photos. The customer-facing profile uses these photos as a swipeable, full-screen background hero with the provider's face and ratings overlaid.
    *   **Profile Editor:** Set starting price, service radius (km), bio, and skills tags.

---

## 4. System & Admin Features

Backend mechanisms that maintain safety, stability, and trust across the platform.

### 4.1 KYC & Verification Approval
*   **Description:** Admin portal for onboarding reviews.
*   **Detailed Function:**
    *   Review uploaded Aadhaar/PAN documents for businesses and providers, granting or rejecting verification status.

### 4.2 Escrow & Dispute Resolution
*   **Description:** Mediating transaction deadlocks.
*   **Detailed Function:**
    *   Admin console can override agreement statuses, release escrowed funds to providers, or refund customers in the event of a dispute.

### 4.3 Bug & Support Ticket Tracking
*   **Description:** System reliability reporting.
*   **Detailed Function:**
    *   Bug reports are tagged automatically by the reporter's active role (`CUSTOMER`, `BUSINESS`, `PROVIDER`) and submitted to the admin console for resolution.

### 4.4 Automated Housekeeping Triggers
*   **Description:** Automated database triggers that execute self-healing actions.
*   **Detailed Function:**
    *   **Expired Requests:** Moves past-expiry requests to `EXPIRED`.
    *   **Agreement Timeout:** Cancels `PENDING` agreements if not double-confirmed in 10 minutes.
    *   **Past Bookings:** Auto-completes accepted appointments if the slot time has passed with no owner action.

---

## 📈 Marketing & Business Strategy Insights

```
                   STRYT HYPERLOCAL TRUST ENGINE
                   
      [ Customer ] ═════════ Vouch / Rate ═════════► [ Merchant ]
           │                                              ▲
           │                                              │
      Posts Request                                  Claim / Verify
           ▼                                              │
      [ Escrow Lock ] ══ Deposit Verified ════════════════╝
```

The functional design of STRYT enables unique marketing and business strategies:

### 1. The "Hat Switcher" as a Acquisition Engine
*   **Business Opportunity:** By making role-switching instant, STRYT lowers the barrier for service providers to act as buyers.
*   **Marketing Angle:** Promote STRYT to local merchants as a way to support neighboring businesses, creating a high-retention "circular economy" within a single street.

### 2. High-Trust Escrow & KYC Verification
*   **Business Opportunity:** The verification badge, escrow locks, and role-tagged reviews create a "Trust Engine."
*   **Marketing Angle:** Position STRYT against unverified platforms (like Facebook Marketplace or Craigslist) as a safe, scam-proof community sandbox.

### 3. Real-time Storefront "Pulse"
*   **Business Opportunity:** Queue ETAs and "Available Now" toggles allow businesses to fill downtime.
*   **Marketing Angle:** Drive customer adoption with campaigns like "Check your street's wait times before you leave the house," targeting high-friction local services (barbers, clinics).

### 4. The 10-Minute Mutual Confirmation
*   **Business/Product Logic:** Solves "ghosting" by canceling unconfirmed agreements quickly, keeping providers' calendars open for active leads.
