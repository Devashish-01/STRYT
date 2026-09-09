# STRYT — Master Flow Maturity & Deployment Audit Tracker

**Purpose:** The single authoritative master tracker for conducting end-to-end, flow-by-flow gap audits and maturation fixes across the entire STRYT application. Every customer, merchant, provider, rider, and platform flow is cataloged here with its exact routing, service dependencies, verification criteria, and audit status.

**Deployment Objective:** Mature every existing flow to be 100% production-ready, resilient, accessible, and secure for real-world customers and local business owners—strictly eliminating bugs, data leaks, broken edge cases, and dead ends without introducing feature creep.

---

## 📊 High-Level Flow Audit Dashboard

| Domain | Total Flows | Audited & Logged | In Progress | Pending Audit | Launch Readiness |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **0. Onboarding & Identity** | 4 | 4 | 0 | 0 | 🟢 100% |
| **1. Customer Discovery & Search** | 5 | 5 | 0 | 0 | 🟢 100% |
| **2. Booking, Appointments & Scheduling** | 5 | 5 | 0 | 0 | 🟢 100% |
| **3. Digital Walk-In Queue & Tokens** | 2 | 2 | 0 | 0 | 🟢 100% |
| **4. Custom Requests, Quotes & Agreements** | 3 | 3 | 0 | 0 | 🟢 100% |
| **5. Local Delivery Dispatch & Live Tracking** | 3 | 3 | 0 | 0 | 🟢 100% |
| **6. 1:1 Direct Messaging & Chat** | 1 | 1 | 0 | 0 | 🟢 100% |
| **7. Storefront Console & Merchant Operations** | 10 | 10 | 0 | 0 | 🟢 100% |
| **8. Provider / Freelancer Console** | 6 | 6 | 0 | 0 | 🟢 100% |
| **9. Community, Social Trust & Reviews** | 5 | 5 | 0 | 0 | 🟢 100% |
| **10. Safety, Emergency & Location Sharing** | 2 | 2 | 0 | 0 | 🟢 100% |
| **11. Account, Multi-Role & Platform Security** | 6 | 6 | 0 | 0 | 🟢 100% |
| **TOTAL** | **52** | **52** | **0** | **0** | **🟢 100% Audited** |

**Audited ≠ Fixed.** This dashboard tracks *audit* completion. See [`EXECUTION_PHASE_PLAN.md`](./EXECUTION_PHASE_PLAN.md) for the fix-side plan — what's actually resolved, what's next, and in what order.

---

## 🛠️ Step-by-Step Flow Auditing Protocol

For every flow in this tracker, the review process follows this rigorous 6-step maturation lifecycle:

```
[ 1. Trace Flow ] ──▶ [ 2. Audit Code & RLS ] ──▶ [ 3. Triage Real Gaps ] ──▶ [ 4. Register Gap Log ] ──▶ [ 5. Implement & Verify ] ──▶ [ 6. Mark Mature ]
```

1. **Trace Flow:** Map UI triggers, router paths, modal sheets, and data fetching services end-to-end.
2. **Audit Code & RLS:** Inspect state management, optimistic updates, database schema, RPC functions, and Supabase Row Level Security (RLS) policies.
3. **Triage Real Gaps:** Focus strictly on **maturing existing features** (broken state, silent errors, race conditions, permission leaks, mobile touch hazards). Defer all enterprise sprawl and new feature requests.
4. **Register Gap Log:** Write or update the dedicated markdown gap log in `docs/gaps/` citing exact filenames, lines, and root causes.
5. **Implement & Verify:** Apply minimal, safe fixes. Run `npm run check-colors` (zero hardcoded CSS leaks) and `npx tsc --noEmit` (zero TypeScript errors).
6. **Mark Mature:** Update this master tracker and mark the flow as `Production Ready`.

---

## 🗺️ Detailed Flow Catalog & Audit Status

---

### Domain 0: Onboarding & Account Entry

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **0.1** | **Customer Onboarding & First Beat** | Big | Customer | `/auth/phone`, `/auth/otp`, `/auth/terms`, `/auth/onboard` | `authService`, `userService`, `users` | 🟢 **Audited** | [`CUSTOMER_ONBOARDING_GAP_LOG.md`](./CUSTOMER_ONBOARDING_GAP_LOG.md) |
| **0.2** | **Business Store Onboarding** | Big | Merchant | `/onboard/business`, `BusinessOnboard.tsx` | `businessService`, `businesses`, `catalog_items` | 🟢 **Audited** | [`BUSINESS_ONBOARDING_GAP_LOG.md`](./BUSINESS_ONBOARDING_GAP_LOG.md) |
| **0.3** | **Provider Registration & Setup** | Big | Provider | `/onboard/provider`, `ProviderOnboard.tsx` | `providerService`, `providers`, `provider_packages` | 🟢 **Audited** | [`PROVIDER_ONBOARDING_GAP_LOG.md`](./PROVIDER_ONBOARDING_GAP_LOG.md) |
| **0.4** | **Guest Browsing & Conversion Wall** | Small | Guest / Anon | `GuestOrAuthLayout`, `useRequireAuth`, `AuthGateModal` | `store.tsx`, local storage session | 🟡 **Audited** | [`GUEST_BROWSING_GAP_LOG.md`](./GUEST_BROWSING_GAP_LOG.md) |

---

### Domain 1: Customer Discovery, Maps & Local Search

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **1.1** | **Home Feed & Neighborhood Discovery** | Big | Customer | `/home`, `Home.tsx`, `AreaPickerSheet`, `StoryStrip` | `discoveryService`, `socialService`, `businesses`, `providers` | 🟡 **Audited** | [`HOME_FEED_GAP_LOG.md`](./HOME_FEED_GAP_LOG.md) |
| **1.2** | **Global Search & Live Autocomplete** | Big | Customer | `/search`, `Search.tsx`, `SearchInput` | `discoveryService`, `catalogService`, `businesses` | 🟡 **Audited** | [`GLOBAL_SEARCH_GAP_LOG.md`](./GLOBAL_SEARCH_GAP_LOG.md) |
| **1.3** | **Interactive Map & Pin Radar** | Big | Customer | `/map`, `MapView.tsx`, `LeafletMap`, `PlaceBottomSheet` | `discoveryService`, `placesService`, geo RPCs | 🟡 **Audited** | [`INTERACTIVE_MAP_GAP_LOG.md`](./INTERACTIVE_MAP_GAP_LOG.md) |
| **1.4** | **Category Directory & Taxonomy** | Small | Customer | `/categories`, `/category/:id`, `CategoryListing.tsx` | `catalogService`, `categories`, `businesses` | 🟡 **Audited** | [`CATEGORY_DIRECTORY_GAP_LOG.md`](./CATEGORY_DIRECTORY_GAP_LOG.md) |
| **1.5** | **User-Submitted Place Listings** | Small | Customer | `/place/new`, `/place/:id`, `PlaceRequestForm.tsx` | `placesService`, `places`, `place_upvotes` | 🟡 **Audited** | [`USER_SUBMITTED_PLACES_GAP_LOG.md`](./USER_SUBMITTED_PLACES_GAP_LOG.md) |

---

### Domain 2: Booking, Appointments & Scheduling

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **2.1** | **Customer Appointment Booking Sheet** | Big | Customer | `AppointmentSheet.tsx`, `BusinessDetail`, `ProviderDetail` | `appointmentService`, `availability.ts`, `appointments` | 🟢 **Production Ready** | [`APPOINTMENT_BOOKING_GAP_LOG.md`](./APPOINTMENT_BOOKING_GAP_LOG.md) |
| **2.2** | **Customer Bookings Hub (Upcoming/Past)** | Big | Customer | `/appointments`, `MyAppointments.tsx` | `appointmentService`, `appointments` | 🟡 **Audited** | [`MY_APPOINTMENTS_GAP_LOG.md`](./MY_APPOINTMENTS_GAP_LOG.md) |
| **2.3** | **Business Appointment Calendar Console** | Big | Merchant | `/business/:id/manage/appointments`, `BusinessAppointments.tsx` | `appointmentService`, `appointments` | 🟡 **Audited** | [`BUSINESS_APPOINTMENTS_GAP_LOG.md`](./BUSINESS_APPOINTMENTS_GAP_LOG.md) |
| **2.4** | **Provider Jobs & Service Bookings** | Big | Provider | `/provider/:id/manage/jobs`, `ProviderJobs.tsx` | `appointmentService`, `appointments` | 🟡 **Audited** | [`PROVIDER_JOBS_GAP_LOG.md`](./PROVIDER_JOBS_GAP_LOG.md) |
| **2.5** | **Owner Slot Blocking & Holiday Overrides** | Small | Merchant / Pro | `BlockSlotModal.tsx`, `HoursEditor.tsx`, `DayTimetable.tsx` | `slotBlockService`, `blocked_slots` | 🟡 **Audited** | [`SLOT_BLOCKING_GAP_LOG.md`](./SLOT_BLOCKING_GAP_LOG.md) |

---

### Domain 3: Digital Walk-In Queue & Tokens

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **3.1** | **Customer Digital Token & Live Queue** | Big | Customer | `BusinessDetail.tsx`, `/queues`, `MyQueues.tsx` | `businessService`, `queue_tokens`, `notifications` | 🟡 **Audited** | [`CUSTOMER_QUEUE_GAP_LOG.md`](./CUSTOMER_QUEUE_GAP_LOG.md) |
| **3.2** | **Merchant Live Queue Counter Console** | Big | Merchant | `/business/:id/manage/queue`, `QueueManager.tsx` | `businessService`, `queue_settings`, `queue_tokens` | 🟡 **Audited** | [`MERCHANT_QUEUE_GAP_LOG.md`](./MERCHANT_QUEUE_GAP_LOG.md) |

---

### Domain 4: Custom Requests, Bids & Work Agreements

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **4.1** | **Customer "Ask / Request" Creation** | Big | Customer | `/ask`, `AskCompose.tsx`, `LocationPicker` | `requestService`, `requests`, `request_photos` | 🟡 **Audited** | [`ASK_REQUEST_CREATION_GAP_LOG.md`](./ASK_REQUEST_CREATION_GAP_LOG.md) |
| **4.2** | **Seller Proposal & Quote Submission** | Big | Merchant / Pro | `/request/:id/propose`, `SubmitProposal.tsx` | `requestService`, `proposals` | 🟡 **Audited** | [`SELLER_PROPOSALS_GAP_LOG.md`](./SELLER_PROPOSALS_GAP_LOG.md) |
| **4.3** | **Agreement Negotiation & Completion** | Big | Both | `/agreement/:id`, `/agreements`, `AgreementScreen.tsx` | `requestService`, `agreements`, `chatService` | 🟡 **Audited** | [`AGREEMENT_NEGOTIATION_GAP_LOG.md`](./AGREEMENT_NEGOTIATION_GAP_LOG.md) |

---

### Domain 5: Local Delivery & Realtime Rider Tracking

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **5.1** | **Merchant Order Delivery Dispatch** | Big | Merchant | `/business/:id/manage/deliveries`, `BusinessDeliveries.tsx` | `deliveryService`, `appointment_deliveries` | 🟡 **Audited** | [`MERCHANT_DELIVERY_DISPATCH_GAP_LOG.md`](./MERCHANT_DELIVERY_DISPATCH_GAP_LOG.md) |
| **5.2** | **Delivery Rider Console & Batch Runs** | Big | Rider | `/delivery`, `DeliveryConsole.tsx`, `TeamMyDeliveries.tsx` | `deliveryService`, `delivery_batches` | 🟡 **Audited** | [`DELIVERY_RIDER_CONSOLE_GAP_LOG.md`](./DELIVERY_RIDER_CONSOLE_GAP_LOG.md) |
| **5.3** | **Customer Live Delivery Tracking** | Big | Customer | `/track/:token`, `TrackingPage.tsx` | `deliveryService`, `appointment_deliveries` | 🟡 **Audited** | [`CUSTOMER_DELIVERY_TRACKING_GAP_LOG.md`](./CUSTOMER_DELIVERY_TRACKING_GAP_LOG.md) |

---

### Domain 6: Direct Messaging & Realtime Chat

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **6.1** | **1:1 Chat Messaging & Media Sharing** | Big | All Users | `/chats`, `/chat/:id`, `ChatThread.tsx` | `chatService`, `conversations`, `messages` | 🟡 **Audited** | [`CHAT_MESSAGING_GAP_LOG.md`](./CHAT_MESSAGING_GAP_LOG.md) |

---

### Domain 7: Merchant Console & Storefront Operations

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **7.1** | **Business Team & Delegated Access** | Big | Merchant / Staff | `/account/business-access`, `BusinessAccess.tsx` | `businessAccessService`, `business_access_sessions` | 🟢 **Audited** | [`TEAM_ACCESS_GAP_LOG.md`](./TEAM_ACCESS_GAP_LOG.md) |
| **7.2** | **Catalog & Price List Management** | Big | Merchant | `/business/:id/manage/catalog`, `CatalogManager.tsx` | `businessService`, `catalog_items` | 🟡 **Audited** | [`CATALOG_MANAGEMENT_GAP_LOG.md`](./CATALOG_MANAGEMENT_GAP_LOG.md) |
| **7.3** | **Store Hours & Realtime Open Status** | Big | Merchant | `/business/:id/manage/hours`, `HoursEditor.tsx` | `businessService`, `businesses` | 🟡 **Audited** | [`STORE_HOURS_GAP_LOG.md`](./STORE_HOURS_GAP_LOG.md) |
| **7.4** | **Bulk Deals & Group Buy Management** | Big | Merchant | `/business/:id/manage/bulk-deals`, `BulkDealsManager.tsx` | `bulkService`, `bulk_deals`, `bulk_deal_pledges` | 🟡 **Audited** | [`BULK_DEALS_GAP_LOG.md`](./BULK_DEALS_GAP_LOG.md) |
| **7.5** | **Storefront Branding & Profile Hub** | Small | Merchant | `/business/:id/manage/profile`, `BusinessProfileHub.tsx` | `businessService`, `businesses` | 🟡 **Audited** | [`STOREFRONT_BRANDING_GAP_LOG.md`](./STOREFRONT_BRANDING_GAP_LOG.md) |
| **7.6** | **Portfolio & Visual Gallery Manager** | Small | Merchant | `/business/:id/manage/portfolio`, `BusinessPortfolio.tsx` | `businessService`, `portfolio_items` | 🟡 **Audited** | [`BUSINESS_PORTFOLIO_GAP_LOG.md`](./BUSINESS_PORTFOLIO_GAP_LOG.md) |
| **7.7** | **Storefront Q&A Management** | Small | Merchant | `/business/:id/manage/qna`, `QnaManager.tsx` | `businessService`, `business_qna` | 🟡 **Audited** | [`STOREFRONT_QNA_GAP_LOG.md`](./STOREFRONT_QNA_GAP_LOG.md) |
| **7.8** | **Inventory Low-Stock Alerts** | Small | Merchant | `/business/:id/manage/inventory`, `InventoryAlerts.tsx` | `businessService`, `catalog_items` | 🟡 **Audited** | [`INVENTORY_ALERTS_GAP_LOG.md`](./INVENTORY_ALERTS_GAP_LOG.md) |
| **7.9** | **Broadcast Radius Notification Push** | Small | Merchant | `/business/:id/manage/broadcast`, `BroadcastRadius.tsx` | `businessService`, `broadcast_logs` | 🟡 **Audited** | [`BROADCAST_RADIUS_GAP_LOG.md`](./BROADCAST_RADIUS_GAP_LOG.md) |
| **7.10** | **Business KYC Verification Center** | Small | Merchant | `/business/:id/manage/verify`, `VerificationCenter.tsx` | `businessService`, `business_verifications` | 🟡 **Audited** | [`BUSINESS_VERIFICATION_GAP_LOG.md`](./BUSINESS_VERIFICATION_GAP_LOG.md) |

---

### Domain 8: Provider / Freelancer Console Operations

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **8.1** | **Service Packages & Tiered Pricing** | Big | Provider | `/provider/:id/manage/catalog`, `ProviderCatalog.tsx` | `providerService`, `provider_packages` | 🟡 **Audited** | [`PROVIDER_CATALOG_GAP_LOG.md`](./PROVIDER_CATALOG_GAP_LOG.md) |
| **8.2** | **Provider Availability & Service Radius** | Big | Provider | `/provider/:id/manage/availability`, `ProviderAvailability.tsx`| `providerService`, `providers` | 🟡 **Audited** | [`PROVIDER_AVAILABILITY_GAP_LOG.md`](./PROVIDER_AVAILABILITY_GAP_LOG.md) |
| **8.3** | **Provider Portfolio & Testimonials** | Small | Provider | `/provider/:id/manage/portfolio`, `ProviderPortfolio.tsx` | `providerService`, `portfolio_items` | 🟡 **Audited** | [`PROVIDER_PORTFOLIO_GAP_LOG.md`](./PROVIDER_PORTFOLIO_GAP_LOG.md) |
| **8.4** | **Direct Leads & Inquiries Inbox** | Small | Provider | `/provider/:id/manage/inbox`, `LeadsInbox.tsx` | `providerService`, `leads` | 🟡 **Audited** | [`PROVIDER_LEADS_GAP_LOG.md`](./PROVIDER_LEADS_GAP_LOG.md) |
| **8.5** | **Provider Money & Receipts Tracking** | Small | Provider | `/provider/:id/manage/money`, `ProviderMoney.tsx` | `providerService`, recorded receipts | 🟡 **Audited** | [`PROVIDER_MONEY_GAP_LOG.md`](./PROVIDER_MONEY_GAP_LOG.md) |
| **8.6** | **Provider Identity & Badges Verification**| Small | Provider | `/provider/:id/manage/verify`, `ProviderVerification.tsx`| `providerService`, `provider_verifications` | 🟡 **Audited** | [`PROVIDER_VERIFICATION_GAP_LOG.md`](./PROVIDER_VERIFICATION_GAP_LOG.md) |

---

### Domain 9: Community, Social Trust, Ratings & Reviews

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **9.1** | **Community Feed, Posts & Post Sharing** | Big | All Users | `/community-hub`, `/community/:id`, `CommunityPostDetail`| `communityService`, `community_posts`, `post_comments` | 🟢 **Audited** | [`COMMUNITY_POSTS_GAP_LOG.md`](./COMMUNITY_POSTS_GAP_LOG.md) |
| **9.2** | **Customer Review & Rating Flow** | Small | Customer | `/rate/:id`, `RateScreen.tsx`, `StarRating` | `businessService`, `providerService`, `ratings` | 🟡 **Audited** | [`CUSTOMER_RATINGS_GAP_LOG.md`](./CUSTOMER_RATINGS_GAP_LOG.md) |
| **9.3** | **Owner Response to Storefront Reviews** | Small | Merchant / Pro | `/business/:id/manage/reviews`, `ReviewsManager.tsx` | `businessService`, `ratings` | 🟡 **Audited** | [`REVIEWS_MANAGER_GAP_LOG.md`](./REVIEWS_MANAGER_GAP_LOG.md) |
| **9.4** | **Vouches & Neighborhood Trust Scores** | Small | Customer | `VouchButton.tsx`, `EndorsementCard.tsx` | `socialService`, `vouches`, `endorsements` | 🟡 **Audited** | [`VOUCHES_TRUST_GAP_LOG.md`](./VOUCHES_TRUST_GAP_LOG.md) |
| **9.5** | **Curated Bookmarks & Custom Lists** | Small | Customer | `/bookmarks`, `/lists`, `Lists.tsx` | `store.tsx`, `user_lists`, `user_list_items` | 🟡 **Audited** | [`BOOKMARKS_LISTS_GAP_LOG.md`](./BOOKMARKS_LISTS_GAP_LOG.md) |

---

### Domain 10: Safety, Emergency & Location Sharing

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **10.1** | **Emergency Contacts & SOS Alerts** | Small | Customer | `/safety/contacts`, `EmergencyContacts.tsx` | `emergencyService`, `emergency_contacts` | 🟡 **Audited** | [`EMERGENCY_CONTACTS_GAP_LOG.md`](./EMERGENCY_CONTACTS_GAP_LOG.md) |
| **10.2** | **Live Location Sharing & Auto-Expiry** | Small | Customer | `/safety`, `SafetyHub.tsx` | `locationService`, `location_grants` | 🟡 **Audited** | [`LOCATION_SHARING_GAP_LOG.md`](./LOCATION_SHARING_GAP_LOG.md) |

---

### Domain 11: Account, Multi-Role & Platform Security

| # | Flow Name | Scope | Persona | Primary Route / Components | Services & DB Tables | Status | Gap Log |
|---|---|---|---|---|---|---|---|
| **11.1** | **Role & Hat Switching Navigation** | Small | All Users | `RoleSwitcher.tsx`, `AccountSwitcher.tsx`, `useAccountOptions` | `store.tsx`, `useApp` context | 🟡 **Audited** | [`ROLE_SWITCHER_GAP_LOG.md`](./ROLE_SWITCHER_GAP_LOG.md) |
| **11.2** | **Profile Edit & Privacy Controls** | Small | Customer | `/profile/edit`, `/settings/privacy`, `ProfileEdit.tsx` | `userService`, `profileControlService`, `users` | 🟡 **Audited** | [`PROFILE_PRIVACY_GAP_LOG.md`](./PROFILE_PRIVACY_GAP_LOG.md) |
| **11.3** | **In-App Notification Center & Badges** | Small | All Users | `/notifications`, `/settings/notifications` | `notificationService`, `notifications` | 🟡 **Audited** | [`NOTIFICATION_CENTER_GAP_LOG.md`](./NOTIFICATION_CENTER_GAP_LOG.md) |
| **11.4** | **Entity Password & Security Settings** | Small | Merchant / Pro | `/settings/security`, `SecuritySettings.tsx` | `entityPasswordService`, `users` | 🟡 **Audited** | [`SECURITY_SETTINGS_GAP_LOG.md`](./SECURITY_SETTINGS_GAP_LOG.md) |
| **11.5** | **Account Deletion & Data Privacy** | Small | All Users | `/auth/deletion-pending`, `DeletionPending.tsx` | `userService`, scheduled deletion RPC | 🟡 **Audited** | [`ACCOUNT_DELETION_GAP_LOG.md`](./ACCOUNT_DELETION_GAP_LOG.md) |
| **11.6** | **Admin Moderation & Content Appeals** | Small | Admin | `/admin`, `AdminPanel.tsx` | `adminService`, `appealService`, audit tables | 🟡 **Audited** | [`ADMIN_MODERATION_GAP_LOG.md`](./ADMIN_MODERATION_GAP_LOG.md) |

---

## 🎯 Fix Sequence

All 52 flows are audited. The batches originally sketched here (booking loop,
queue, catalog/hours, requests, delivery) are now superseded by
[`EXECUTION_PHASE_PLAN.md`](./EXECUTION_PHASE_PLAN.md), which orders every
still-open finding across all 52 gap logs — roughly 360 line items — into
execution phases, with cross-cutting root causes deduplicated and
security-critical findings pulled forward ahead of pure domain order.
