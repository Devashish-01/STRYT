# STRYT — Codebase Map

> **Purpose:** one file to orient anyone (human or AI) before touching the code.
> Read this first to know *where* a feature lives and *what* to update to change it.
>
> **Keep it updated:** whenever you add/rename a **service, screen, route, DB table, or store field**,
> update the matching table below in the same change. Sections are ordered so you can jump straight
> to what you need. Line references use `file.ts:line` and may drift — trust the table, verify the line.


---

## 1. Stack & commands

| | |
|---|---|
| **Framework** | React 18 + TypeScript + Vite |
| **Routing** | react-router-dom v6 (lazy routes) |
| **Backend** | Supabase (Postgres + Auth + RLS + Storage + Realtime) |
| **Maps** | Leaflet + react-leaflet |
| **Icons** | lucide-react |
| **Styling** | Hand-rolled CSS design tokens in `src/index.css` (no Tailwind/UI lib) |
| **Shell** | 480px phone shell (`.app-shell`, `--maxw`) — mobile-first PWA |

```bash
npm run dev      # vite dev server
npm run build    # tsc -b && vite build   ← run before shipping; noUnusedLocals is enforced
npm run lint     # tsc --noEmit (type check only)
npm run audit    # playwright e2e
```

**Always run `npm run build` (or `npx tsc --noEmit`) after edits** — the project uses `noUnusedLocals`,
so an unused import fails the build.

---

## 2. Boot, routing & shell

| Concern | File | Notes |
|---|---|---|
| Entry | `src/main.tsx` | Mounts `<App/>` inside `<AppProvider>` |
| App + route table | `src/App.tsx` | All routes; `ProtectedLayout` / `PublicOnlyLayout` guards; `TAB_ROUTES` decides when BottomNav shows |
| Global state | `src/store.tsx` | `AppProvider` + `useApp()` hook (see §4) |
| Bottom nav | `src/components/BottomNav.tsx` | Home · Map · Create(FAB) · You; the FAB opens the create sheet (Ask / Story / Community) |
| Runtime config | `src/config.ts` | `config.*` (env-driven), default location, preset areas |
| Supabase client | `src/lib/supabaseClient.ts` | `getSupabase()` (throws if env unset), `currentUserId()`, `hasSupabaseEnv` |

**Auth guard flow:** `store.authReady` gates routing so OAuth/magic-link redirects aren't bounced.
`ProtectedLayout` requires `isAuthed`; `PublicOnlyLayout` is for `/`, `/auth/phone`, `/auth/otp`.

---

## 3. Route map (from `src/App.tsx`)

Four layout guards gate the tree: `PublicOnlyLayout` (bounces OUT if already signed in),
fully-unguarded routes, `GuestOrAuthLayout` (browsable signed-out, capped; writes gated per-action via
`useRequireAuth()`), and `ProtectedLayout` (bounces to `/auth/phone` if signed out).

**Public-only (`PublicOnlyLayout`):** `/` `Splash` · `/auth/phone` `PhoneEntry` · `/auth/otp` `OtpVerify`

**Fully public / unguarded:** `/track/:token` `TrackingPage` · `/admin/login` `AdminLogin` ·
`/legal` `LegalIndex` · `/legal/:slug` `LegalDoc` · `/guide` `GuideIndex` · `/guide/:slug` `GuideDoc`

**Guest-or-auth browsable (`GuestOrAuthLayout`, see `GUEST_MODE_PLAN.md`):** `/home` `Home` ·
`/explore` `Explore` · `/requests` → redirects to `/explore?tab=requests` · `/request/:id` `RequestDetail` ·
`/business/:id` `BusinessDetail` · `/provider/:id` `ProviderDetail` · `/place/:id` `PlaceDetail` ·
`/bulk` → redirects to `/community-hub` · `/community/activity` `CommunityActivity` · `/search` `Search` ·
`/categories` `AllCategories` · `/category/:id` `CategoryListing` · `/map` `MapView` ·
`/community-hub` `CommunityHub` · `/community/:id` `CommunityPostDetail`

**Protected (`ProtectedLayout`) — auth-adjacent:** `/auth/terms` `TermsAccept` · `/auth/onboard` `UserOnboard`
(beats in `screens/auth/onboard/`) · `/auth/deletion-pending` `DeletionPending`

**Protected — profile/account:** `/profile` `Profile` · `/profile/edit` `ProfileEdit` · `/notifications` ·
`/bookmarks` · `/followers` `Followers` · `/queues` `MyQueues` · `/my-activity` `MyActivity` ·
`/account` `AccountSettings` (hub) · `/account/business-access` `BusinessAccess` · `/settings` → redirects to
`/account` · `/settings/notifications|privacy|discovery|language|security|location|data` (one screen each,
`screens/settings/`) · `/support` `Support`

**Protected — requests / deals / appointments:** `/ask` `AskCompose` · `/place/new` `PlaceRequestForm` ·
`/request/:id/propose` `SubmitProposal` · `/agreement/:id` `AgreementScreen` · `/agreements` `Agreements` ·
`/appointments` `MyAppointments` (customer bookings hub) · `/rate/:id` `RateScreen`

**Onboarding:** `/onboard/business` `BusinessOnboard` · `/onboard/provider` `ProviderOnboard` ·
`/manage` `ManageHub`

**Business console** (`/business/:id/manage/*`, behind `BusinessAccessGuard` + `BusinessManageLayout`):
`` `ManageDashboard` · `business` `BusinessHub` (both self-filter for scoped team members, not hard-gated) ·
scope **`catalog`**: `store` `BusinessStoreHub` · `catalog` `CatalogManager` · `inventory` `InventoryAlerts` ·
`portfolio` `BusinessPortfolio` · `hours` `HoursEditor` · scope **`queue`**: `queue` `QueueManager` ·
scope **`appointments`**: `appointments` `BusinessAppointments` · `deliveries` `BusinessDeliveries` (live
agent tracking) · `RequireBusinessDeliveryMember`: `my-deliveries` `TeamMyDeliveries` · scope **`leads`**:
`qna` `QnaManager` · `inbox` `LeadsInbox` · `requests` `BusinessRequests` · **owner-only**
(`RequireOwner`): `profile` `BusinessProfileHub` · `edit-profile` `ProfileEditor` · `broadcast`
`BroadcastRadius` · `reviews` `ReviewsManager` · `payments` `BusinessPayments` · `bulk-deals`
`BulkDealsManager` · `verify` `VerificationCenter` · `settings` `BusinessSettings` · `community`
`BusinessCommunity` (= `screens/ProfileCommunity.tsx`).
_(The Offers feature was removed; the `offers` table remains only as the backing store for Wallet coupons —
Wallet itself is now unrouted, see below. Catalog items support FINITE/INFINITE inventory.)_

**Provider console** (`/provider/:id/manage/*`, behind `ProviderAccessGuard`): `` `ProviderDashboard` ·
`profile` `ProviderProfileHub` · `edit-profile` `ProviderProfileEditor` · `availability`
`ProviderAvailability` · `catalog` `ProviderCatalog` · `inventory` `ProviderInventory` · `portfolio`
`ProviderPortfolio` · `inbox` `LeadsInbox` · `jobs` `ProviderJobs` · `find-work` `ProviderFindWork` ·
`money` `ProviderMoney` · `community` `ProviderCommunity` · `verify` `ProviderVerification` · `settings`
`ProviderSettings`

**Delivery agent console:** `/delivery` `DeliveryConsole` (own hat, behind `RequireDeliveryAgent`,
active `delivery` grant + feature flag) — Active/Assigned/History, multi-stop runs, OTP handoff.

**Safety:** `/safety` `SafetyHub` · `/safety/contacts` `EmergencyContacts` (live location sharing)

**Chat:** `/chats` `ConversationList` · `/chat/:id` `ChatThread`

**Community/social (write actions; the read-only feed/detail routes are listed above under
guest-browsable):** `/story/new` `StoryCompose` · `/community/new` `CommunityCompose` · `/lists` `Lists` ·
`/u/:id` `PublicProfile` · `/achievements` `Achievements`

**Admin:** `/admin` `AdminPanel`

**Catch-all:** unmatched paths → `ContextHomeRedirect` (home of whatever hat — customer/business/provider —
is currently active)

**Unrouted — `screens/future-enhancement/`:** `Wallet`, `SocietyScreen`, `SubscriptionManager` /
`NewSubscription` / `SubscriptionDetail`, `BusinessProUpgrade`, `Neighborhood`, `AvailableNow`,
`Leaderboard`, `LoyaltySetup`, `Promote`, `PhotosManager`, `StoryComposer` — 13 screens total, shelved
(no in-app nav link, found during a launch audit) rather than deleted. Not live routes; re-add a lazy
import + `<Route>` in `App.tsx` to bring one back.

---

## 4. Global state — `useApp()` (`src/store.tsx`)

One React context holds session + optimistic social state. Import with `import { useApp } from "@/store"`.

| Group | Fields / actions |
|---|---|
| **User/session** | `user` (`CurrentUser`), `refreshUser()`, `isAuthed`, `authReady`, `signIn()`, `signOut()` |
| **Location** | `area`, `city`, `setArea()` |
| **Roles & context** | `activeRole`, `roles`, `setActiveRole()`, `addRole()`, `activeContext` (`customer`/`business`/`provider` "hat"), `setContext()`, `ownedBusinessIds`, `ownedProviderId` |
| **Bookmarks** | `bookmarks`, `toggleBookmark(type,id)`, `isBookmarked(type,id)` → DB `bookmarks` |
| **Follows** | `follows`, `toggleFollow(type,id,name?)`, `isFollowing(type,id)` → DB `follows` |
| **Social** | `vouched`/`toggleVouch`, `endorsed`/`toggleEndorse`, `meToos`/`toggleMeToo`, `likes`/`toggleLike`, `votes`/`votePoll` |
| **Notify/queue** | `notifySubs`/`toggleNotify(key)`, `queuesJoined`/`joinQueue(id)` |
| **Lists** | `lists`, `createList()`, `addToList()`, `isInAnyList()` → DB `user_lists`/`user_list_items` |
| **Coupons/loyalty** | `savedCoupons`/`toggleCoupon`, `extraStamps`/`addStamp` → `walletService` |
| **Counters** | `unreadCount`/`markAllRead()`/`decrementUnread()`, `chatUnread`/`setChatUnread()` |
| **UI** | `toast`, `showToast(msg)` (2.2s auto-dismiss) |

**Pattern:** most toggles are **optimistic** — update state first, persist async, **revert on failure** + toast.
Follow this pattern for any new social toggle. Personal data hydrates via `hydratePersonalData()` on auth.

---

## 5. Data layer conventions (how services work)

Every service is a plain object of async methods in `src/services/*` and re-exported from `src/services/index.ts`.

**The boundary rules:**
1. Get the client: `const sb = getSupabase();` (`src/lib/supabaseClient.ts`).
2. Get the user: `const uid = await currentUserId();`.
3. **Read →** `toCamel(rows)`; **Write →** `toSnake(payload)`. (`src/lib/caseMap.ts`.) DB is snake_case, app is camelCase.
4. Errors: `throwIfError(error)` or `toApiError(err)`; lists → `toPage<T>()` for `{ data, page }` (`src/lib/supabasePage.ts`).
5. For write tables, whitelist columns with a `COLUMNS` set + `pickColumns()` so unknown keys never break inserts (see `businessService`/`providerService`).

**Consuming in screens** (`src/hooks/useApi.ts`):
```ts
const { data, loading, error, refetch } = useQuery(() => svc.method(id), [id]);
const { mutate, pending } = useMutation((args) => svc.write(args), { onSuccess });
// live tables: useQueryWithRealtime(fn, "table_name", deps, filter?)
```
`useQuery` **swallows errors into `error`** — surface it (ErrorView/toast) or it silently loads forever.

**Mocks:** many services short-circuit demo ids (`b1`, `p1`, `biz_mock_*`, `prov_mock_*`) with canned data —
handy for local dev without a backend. Real ids hit Supabase.

---

## 6. Services index (`src/services/`)

32 files split into `core/` (account/platform), `marketplace/` (discovery + listings + commerce), and
`engagement/` (social + ongoing usage) — see the barrel `src/services/index.ts`, which re-exports every
service so existing `@/services` imports keep resolving unchanged. Two services
(`appealService`, `leaderboardService`) aren't re-exported by the barrel and are imported by their full
subfolder path instead (`@/services/core/appealService`, `@/services/marketplace/leaderboardService`).

**`core/`**

| Service | Responsibility | Key methods | Main tables |
|---|---|---|---|
| `authService` | Phone/OTP + OAuth, ensure `users` row, logout | login/verify/logout | `users`, auth |
| `userService` | Current user profile + owned entities | `me()`, `owned()`, `update()` | `users`, `businesses`, `providers` |
| `uploadService` | File upload to Supabase Storage | `upload(file, folder)` | Storage buckets |
| `adminService` | Admin panel data | moderation/queries | many |
| `appealService` | Suspended/banned account appeals (not in the barrel — import directly) | `submit`, `mine`, `pending`, `resolve` | appeal tables |
| `proService` | Pro plans + lead packs (`PRO_PLANS`, `LEAD_PACKS`) | plans, purchase | pro/billing |
| `aiService` | AI helpers | — | — |
| `supportService` | Support tickets | submit | support |
| `profileControlService` | Privacy / alias / profile visibility | get/set controls | `users` |
| `entityPasswordService` | Business/provider console passwords (replaced the switch PIN) | `isSet`, `set`, `clear`, `verify` | `users`, `entity_password_attempts` |

**`marketplace/`**

| Service | Responsibility | Key methods | Main tables |
|---|---|---|---|
| `catalogService` | Category taxonomy | `getCategories(kind?)` | `categories` |
| `discoveryService` | Search/feed of businesses+providers | feed/search | `businesses`, `providers` |
| `businessService` | **Business CRUD + storefront** (catalog, photos, queue, loyalty, Q&A, analytics, boosts, availability, reviews) | see §7 | `businesses`, `catalog_items`, `queue_*`, `ratings`, `leads` |
| `providerService` | **Provider CRUD + service funnel** (packages, portfolio, availability, leads, analytics, reviews) | see §7 | `providers`, `provider_packages`, `portfolio_items`, `ratings`, `leads` |
| `customPaymentService` | UPI-deeplink custom payment flow (STRYT has no payment-gateway integration — this is the real service; the old `paymentService` stub named in earlier docs no longer exists) | create/track payment intent | payment tables |
| `placesService` | User-submitted places (request/approve a new place listing) | `request`, `createAsAdmin`, `get`, `update` | `places` |
| `bulkService` | Bulk/group-buy deals | `deals`, `dealsForBusiness`, `getDeal`, `createDeal`/`updateDeal`/`deleteDeal`, `quote` | bulk deal tables |
| `businessAccessService` | Delegated business login (team members, scoped access) | `getConfig`, `setLogin`, `login`, `grantTeamMember`, `updateTeamMemberScopes` | `businesses`, access/session tables |
| `leaderboardService` | Points leaderboard (not in the barrel — import directly) | `addPoints(userId, points)` | points/leaderboard tables |

**`engagement/`**

| Service | Responsibility | Key methods | Main tables |
|---|---|---|---|
| `appointmentService` | **Bookings** (create/list/updateStatus) — Supabase table + localStorage fallback | `create`, `listForCustomer`, `listForTarget`, `updateStatus`, `acceptWithEta`, `createWalkInPayment`, `bookedSlots` (per-slot usage), `slotCapacities` | `appointments`, `catalog_items` |
| `deliveryService` | **Home delivery** — agent runs, owner tracking, customer progress | `myDeliveries`, `acceptBatch`/`declineBatch`, `updateBatchPosition`, `assignDelivery`/`assignBatch`, `businessDeliveries` (owner), `myProgress` (customer, no coords) | `appointment_deliveries`, `delivery_batches` |
| `slotBlockService` | Owner-blocked slots/dates (holidays, time off) | `list`, `blockDate`, `blockRecurring`, `unblock` | blocked-slot tables |
| `requestService` | Requests, proposals, agreements feed | `feed`, `agreements`, propose | `requests`, `proposals`, `agreements` |
| `communityService` | Community posts/comments/likes | `feed`, `byAuthor`, `like`, `comments`, `addComment` | `community_posts`, `post_likes`, `post_comments` |
| `socialService` | Vouches, endorsements, available-now list | add/remove vouch/endorsement, `availableNow()` | `vouches`, `endorsements`, `providers` |
| `chatService` | 1:1 conversations + messages | `getOrCreate`, send, list | `conversations`, `messages` |
| `notificationService` | In-app notifications | `getUnreadCount`, `markAllRead` | `notifications` |
| `walletService` | Coupons + loyalty stamps | save/unsave coupon, `addStamp` | `user_saved_coupons`, loyalty tables |
| `societyService` | Society/neighborhood groups | CRUD | society tables |
| `subscriptionService` | Recurring subscriptions | CRUD | subscriptions |
| `locationService` | Live location sharing grants (safety feature) | `request`, `respond`, `renew`, `revoke`, `getSharedLocation`, `pendingForMe`, `sharedByMe` | location-grant tables |
| `emergencyService` | Emergency contacts + live share sessions | `candidateContacts`, `listContacts`, `addContact`/`removeContact`, `startShare`/`updateShare`/`stopShare` | contact/share tables |

> If you added a method, add it to the "Key methods" cell. If a service touches a new table, add it to "Main tables".

---

## 7. The two seller roles (business vs provider)

The most-edited area. Both follow the same service+screen shape.

**Shared method names (both services):** `mine` · `get` · `reviews` · `update` · `create` ·
`submitVerification` · `recordView` · `leads` · `analytics` · `addReview` · `setAvailability`.

**`businessService` only:** catalog (`addCatalogItem`/`update`/`delete`), portfolio (`addPortfolio`/`updatePortfolio`/`deletePortfolio`),
photos (`addPhoto`/`deletePhoto`/`setCoverPhoto`), queue (`queue`/`queueOwnerState`/`setQueueSettings`/
`callNextToken`/`serveToken`/`joinQueueToken`), `loyaltyCard`, Q&A (`qna`/`askQuestion`/`answerQuestion`),
`buyBoost`/`activeBoosts`, `recordInteraction`, `submitForReview`. (The `Reservations` screen and its
`reservations`/`setReservation`/`team` stub methods were removed entirely — team access is now
`businessAccessService`, and there's no reservations feature.)

**`providerService` only:** packages (`packages`/`addPackage`/`deletePackage`), portfolio
(`addPortfolio`/`updatePortfolio`/`deletePortfolio`), richer `setAvailability(id, availableNow, hours)`.

**Availability model (both):** presence (`isAvailableNow` + `availableUntil`) is **separate** from bookable
working-hour slots (`hours`/`availabilityNote`). Compute open-state with
`evaluateProviderAvailability(...)` in `src/utils/availability.ts`; generate slots with `generateWorkingSlots(...)`.

---

## 8. Appointments subsystem (fully wired reference feature)

A good template for an end-to-end flow.

| Piece | File |
|---|---|
| Booking sheet (date/slot/package/photo, `onBooked` cb) | `src/components/AppointmentSheet.tsx` |
| Slot generation + open/closed eval | `src/utils/availability.ts` |
| Service (Supabase `appointments` + local fallback) | `src/services/engagement/appointmentService.ts` |
| Customer hub (Upcoming/Past, cancel, reschedule, book-again) | `src/screens/requests/MyAppointments.tsx` |
| Business owner console | `src/screens/business/manage/BusinessAppointments.tsx` |
| Provider owner console (bookings/jobs) | `src/screens/provider/manage/ProviderJobs.tsx` |
| Book buttons | `BusinessDetail.tsx`, `ProviderDetail.tsx` |
| Home entry (tile + upcoming badge) | `src/screens/Home.tsx` |
| Type | `AppointmentRecord`, `AppointmentStatus` in `src/types.ts` |
| DB | `supabase/migrations/20260701_appointments.sql` |

---

## 9. Screens map (`src/screens/`)

**Root / customer:** `AccountSettings`, `Achievements`, `AllCategories`, `Bookmarks`, `BusinessAccess`,
`CategoryListing`, `CommunityActivity`, `CommunityCompose`, `CommunityHub`, `CommunityPostDetail`,
`Explore`, `Followers`, `Home`, `Lists`, `ManageHub`, `MapView/` (folder — see below), `MyActivity`,
`MyQueues`, `Notifications`, `Profile`, `ProfileCommunity`, `ProfileEdit`, `PublicProfile`, `Search`,
`Splash`, `StoryCompose`, `Support`, `TrackingPage`.

**`MapView/`** is a folder, not a file — entry is `index.tsx`, plus `AvatarPin`, `LocationPinDrop`,
`MapCarousel`, `MapControllers`, `MapFilterStrip`, `MapMarkers`, `MapSheet`, `SearchBar`,
`SearchThisArea`, `mapIcons.ts`, `mapPalette.ts`, `mapboxFallback.ts`, `useLocationPinDrop.ts`,
`useMapViewport.ts`, `__tests__/`.

**auth/** `PhoneEntry`, `OtpVerify`, `TermsAccept`, `UserOnboard`, `DeletionPending`;
**auth/onboard/** (`UserOnboard`'s beats) `BeatFrame`, `BeatHandle`, `BeatIdentity`, `BeatInterests`,
`BeatLocation`.

**requests/** `AskCompose`, `SubmitProposal`, `AgreementScreen`, `Agreements`, `RequestDetail`,
`RateScreen`, `MyAppointments`.

**business/** `BizCatalogGrid`, `BusinessDetail`, `BusinessOnboard`; **business/manage/**
`ManageDashboard`, `ManageNav`, `BusinessHub`, `BusinessStoreHub`, `BusinessProfileHub`, `ProfileEditor`,
`BroadcastRadius`, `HoursEditor`, `CatalogManager`, `InventoryAlerts`, `BusinessPortfolio`,
`QueueManager`, `QnaManager`, `ReviewsManager`, `BusinessAppointments`, `BusinessDeliveries`,
`TeamMyDeliveries`, `BusinessPayments`, `BulkDealsManager`, `VerificationCenter`, `BusinessSettings`,
`BusinessRequests`.

**provider/** `ProviderDetail`, `ProviderOnboard`; **provider/manage/** `ProviderDashboard`,
`ProviderManageNav`, `ProviderProfileHub`, `ProviderProfileEditor`, `ProviderAvailability`,
`ProviderCatalog`, `ProviderInventory`, `ProviderPortfolio`, `ProviderJobs`, `ProviderFindWork`,
`ProviderMoney`, `ProviderCommunity`, `ProviderVerification`, `ProviderSettings`.

**settings/** (each row of the `/account` hub opens one of these) `NotificationSettings`,
`PrivacySettings`, `DiscoverySettings`, `LanguageSettings`, `SecuritySettings`, `LocationSettings`,
`DataSettings`.

**safety/** `SafetyHub`, `EmergencyContacts` (live location sharing). **places/** `PlaceDetail`,
`PlaceRequestForm`. **manage/** `LeadsInbox` (shared by both consoles via an `entityType` prop).

**chat/** `ConversationList`, `ChatThread`. **delivery/** `DeliveryConsole`.
**admin/** `AdminLogin`, `AdminPanel`. **legal/** `LegalIndex`, `LegalDoc`. **guide/** `GuideIndex`,
`GuideDoc`.

**future-enhancement/** — 13 screens kept but **deliberately unrouted** (no `<Route>` in `App.tsx`, no
in-app nav link — shelved together after a launch audit, not deleted): `AvailableNow`,
`BusinessProUpgrade`, `Leaderboard`, `LoyaltySetup`, `Neighborhood`, `NewSubscription`, `PhotosManager`,
`Promote`, `SocietyScreen`, `StoryComposer`, `SubscriptionDetail`, `SubscriptionManager`, `Wallet`.
Do not treat these as live screens when tracing a route — re-check §3 first.

---

## 10. Shared components (`src/components/`)

| Component | Use |
|---|---|
| `common.tsx` | Primitives: `AppBar`, `EmptyState`, `SafeImg`, `Rating`, `StarRow`, `VegDot`, `inr()` |
| `states.tsx` | `Skeleton`, `ListSkeleton`, `ErrorView` |
| `AppointmentSheet.tsx` | Booking bottom-sheet (§8) |
| `ReviewSheet.tsx` | Write-a-review sheet |
| `ReportSheet.tsx` | Report entity |
| `ShareCard.tsx` | Shareable card modal |
| `AddToListSheet.tsx` | Save to custom list |
| `QrScannerSheet.tsx` | QR scanner (heavy chunk) |
| `LocationPicker*.tsx` | Location choose/sheet |
| `Stories` (`src/components/Stories`) | Home stories bar |
| `BottomNav.tsx` | Tab bar + create sheet |
| `AccountSwitcher.tsx` | Switch customer/business/provider hat |
| `ErrorBoundary.tsx` | Top-level error boundary |

---

## 11. Types & lib

- **`src/types.ts`** — the single source of domain types: `CurrentUser` (+ `alias`), `Role`, `Business`, `CatalogItem` (+ inventory),
  `Provider`, `ProviderPackage`, `PortfolioItem`, `RequestPost`, `Review`, `AppointmentRecord`,
  `AppointmentStatus`, `ReservationReq`, `QnaItem`, `BookmarkTarget`, etc. **Add new domain shapes here.**
  Public identity uses `aliasName()` in `src/lib/publicName.ts` (alias-first; real name only in active relationships).
- **`src/lib/`** — `supabaseClient.ts`, `caseMap.ts`, `supabasePage.ts`, `apiClient.ts` (`ApiError`, `Page`),
  `auth.ts` (`tokenStore`), `geocode.ts` (`haversineKm`, reverse geocode), `alias.ts` (privacy alias),
  `i18n.tsx`, `clipboard.ts`, `returnTo.ts`, `pushNotifications.ts`, `leafletIcon.ts`, `mock.ts`.
- **`src/hooks/`** — `useApi.ts` (`useQuery`/`useMutation`/`useQueryWithRealtime`), `useGeolocation.ts`.
- **`src/utils/`** — `availability.ts` (hours/slots), `constants.ts`.
- **`src/features/`** — `ambient/` (time-of-day theme, `useAmbientTheme`), `neighborhood-today/`.

---

## 12. Supabase (`supabase/`)

- **Schema baseline:** `schema.sql`, `rls.sql`, `functions.sql`, `seed_core.sql`, `seed_listings.sql`.
- **Migrations (apply in order):** `migration_r3` … `migration_r17_agreement_expiry`, `migration_writes.sql`,
  `migration_phase2_supply.sql`, `migration_launch_hardening.sql`, `migration_chat_subject.sql`,
  `migrations/20240901_trust_layer.sql`, **`migrations/20260701_appointments.sql`**.
- **Conventions:** text PKs with prefixes (`apt_`, `cv_`, …), `references public.users(id)`, RLS via
  `auth.uid()::text`, idempotent `create ... if not exists` + `do $$ ... exception when duplicate_object then null; end $$;`.
- ⚠️ **The MCP connection is often down** — write SQL to a migration file and have the user run it in the
  Supabase SQL editor. Any new table needs: table + indexes + `enable row level security` + policies.

---

## 13. Styling & config

- **Design tokens** live in `src/index.css` `:root` — token families `--brand-*` (purple),
  `--accent-*` (orange), `--ink-*` (greys), `--green-*`, plus `--line`, `--bg`, `--shadow-*`, `--maxw`.
- **Utility classes** (used everywhere): layout `screen`/`screen-scroll`/`page-pad`/`row`/`col`/`grow`/
  `gap-N`/`between`/`center`; surfaces `card`/`divider`; buttons `btn`+`btn-primary|green|outline|ghost|
  purple|sm|block`; `chip`/`chip.active`; `badge`+`badge-green|gray|amber|purple|red|new`; text `bold`/
  `semi`/`small`/`tiny`/`muted`. **Match nearby markup — don't invent new classes casually.**
- **Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_USE_MOCKS`, `VITE_MAPBOX_TOKEN`,
  `VITE_DEFAULT_LAT/LNG/COUNTRY`. Never commit service tokens. If categories/posting "don't load" in prod,
  it's almost always missing env on the host or a stale deploy.

---

## 14. Playbook — adding a feature

For a typical new capability, touch these in order:

1. **Type** → add/extend interface in `src/types.ts`.
2. **DB** (if persisted) → new `supabase/migrations/<date>_<name>.sql` (table + indexes + RLS). Tell the user to run it.
3. **Service** → method in the right `src/services/*.ts` (use `getSupabase`/`currentUserId`/`toCamel`/`toSnake`/
   `throwIfError`; whitelist write columns). Export from `services/index.ts` if new file.
4. **Screen/UI** → consume with `useQuery`/`useMutation`; render `loading`/`error` via `states.tsx`; **surface errors**.
5. **Route** → add `<Route>` in `src/App.tsx` (+ lazy import); add nav entry (BottomNav / ManageNav / ProviderManageNav / a dashboard tile).
6. **Store** (if it's cross-screen personal state) → add field + optimistic action in `src/store.tsx`.
7. **Verify** → `npx tsc --noEmit` then `npm run build`.
8. **Update this file** → adjust the relevant table(s).

---

## 15. Gotchas & conventions

- **Optimistic + revert:** social toggles update UI first, persist async, revert + toast on failure (see `store.tsx`).
- **Denormalized counters:** `likes_count`/`comments_count` are caches; the source of truth is the join table
  (e.g. `post_likes`). Recount from source after writes and clamp display with `Math.max(0, …)`.
- **RLS-safe reads:** don't join other users' rows you can't read (e.g. `users(phone)`); store the needed value
  on the row and gate visibility in code.
- **localStorage fallback:** `appointmentService` (and demo/mock ids) fall back to local when signed-out/mock —
  real cross-device data requires the DB path + a signed-in user.
- **`noUnusedLocals`:** remove unused imports or the build fails.
- **Deep-link auth:** `authReady` must resolve before route guards redirect (OAuth/magic-link).
- **Windows/PowerShell env:** dev shell is PowerShell; a Bash tool is also available for POSIX scripts.

---

*Last mapped: 2026-09-03 — refreshed §3/§6/§9 against the actual current `App.tsx` route table,
`src/services/**` (32 files across `core/`/`marketplace/`/`engagement/`), and `src/screens/**` (new
`settings/`, `safety/`, `places/`, `manage/`, `auth/onboard/` folders; `future-enhancement/`'s 13
deliberately-unrouted screens called out as such). Removed the stale `kycService`/`paymentService`
entries (neither exists under `src/services/`, confirmed by grep — nothing imports them); added
`customPaymentService`, `appealService`, `placesService`, `bulkService`, `businessAccessService`,
`slotBlockService`, `locationService`, `emergencyService`, `leaderboardService` to the index.

Earlier: home delivery (per-business `delivery_enabled`, two-way ETA, multi-stop
routing via `src/lib/routeLink.ts`, owner live-tracking page, customer restricted to progress-only);
business/provider console passwords replaced the switch PIN; cart Buy-now vs Book-later
(`CartCheckoutSheet`). Earlier still: offers removed; catalog inventory; business portfolio; alias/privacy
model; wallet sourcing + routing; community replies; appointment/queue notifications; My Activity
archive; native safe-area.*

**Slot capacity (multi-booking).** A time slot can hold more than one booking. Capacity is per catalogue
item (`catalog_items.slot_capacity`, falling back to `businesses.default_slot_capacity`), one customer may
take several spots (`catalog_items.max_party_size` → `appointments.party_size`), and an optional
`businesses.max_concurrent_bookings` caps all services combined. Enforcement is the
`trg_enforce_slot_capacity` trigger — it **replaced the old `appointments_no_double_book` UNIQUE index**,
and takes `pg_advisory_xact_lock` because a counting check (unlike a unique index) is not atomic.
Everything defaults to 1, reproducing the old one-per-slot rule exactly. Providers are always capacity-1.
`generateWorkingSlots(...)` takes optional capacity opts; **omit them and it behaves exactly as before**.

⚠️ **A migration file in `supabase/migrations/` is NOT proof it ran.** `20260848` and `20260851`
(entity password recovery) both sat committed and unapplied long enough to break booking and password
setup in production, respectively. Verify with `list_migrations` (Supabase MCP) against the DB before
assuming schema state. Note also that widening a function's `RETURNS TABLE` requires `DROP FUNCTION`
first — `CREATE OR REPLACE` rejects a return-type change. **`npm run check-migrations`**
(`scripts/check-migration-drift.mjs`, needs `DATABASE_URL`) scans every migration file for the
functions/tables it creates and confirms they exist in the live DB — run it after any migration work.

⚠️ **Before rewriting an existing RPC, read its current definition first** (`pg_get_functiondef` via
MCP, or the migration that last defined it) — don't reconstruct from memory/summary. A same-session
rewrite of `reschedule_appointment` this way silently dropped four guards (`is_walk_in` rejection, an
optimistic-concurrency check, the "Rescheduled" note, notes truncation) that had to be restored in a
follow-up migration once caught by a functional test.
*When you change structure, update the section above and bump this line.*
