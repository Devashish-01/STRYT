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

**Tab/customer core:** `/home` `Home` · `/explore` `Explore` · `/map` `MapView` · `/profile` `Profile` ·
`/search` `Search` · `/categories` `AllCategories` · `/category/:id` `CategoryListing` ·
`/notifications` · `/bookmarks` · `/settings` · `/support`

**Auth:** `/` `Splash` · `/auth/phone` · `/auth/otp` · `/auth/onboard` `UserOnboard` · `/auth/location` · `/auth/deletion-pending`

**Detail pages:** `/business/:id` `BusinessDetail` · `/provider/:id` `ProviderDetail` · `/request/:id` `RequestDetail` · `/u/:id` `PublicProfile`

**Requests / deals / appointments:** `/ask` `AskCompose` · `/request/:id/propose` `SubmitProposal` ·
`/agreement/:id` · `/agreements` · `/appointments` `MyAppointments` (customer bookings hub) · `/rate/:id`

**Onboarding:** `/onboard/business` `BusinessOnboard` · `/onboard/provider` `ProviderOnboard` · `/manage` `ManageHub`

**Business console** (`/business/:id/manage/*`): `` (Dashboard) · `catalog` · `profile` · `hours` · `offers` ·
`photos` · `story` · `queue` · `loyalty` · `qna` · `reviews` · `reservations` · **`appointments`** · `inbox` ·
`promote` · `verify` · `settings` · `requests`

**Provider console** (`/provider/:id/manage/*`): `` (Dashboard) · `profile` · `availability` · `packages` ·
`portfolio` · `leads` (leads + appointments) · `settings`

**Chat:** `/chats` `ConversationList` · `/chat/:id` `ChatThread`

**Community/social:** `/community-hub` · `/community` · `/community/new` · `/community/:id` · `/story/new` ·
`/neighborhood` · `/available` `AvailableNow` · `/leaderboard` · `/achievements` · `/lists`

**Wallet/society/subs/pro/admin:** `/wallet` · `/society` · `/subscriptions[/new|/:id]` ·
`/pro-upgrade/business/:id` · `/admin` · `/track/:token` (public, unguarded)

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

| Service | Responsibility | Key methods | Main tables |
|---|---|---|---|
| `authService` | Phone/OTP + OAuth, ensure `users` row, logout | login/verify/logout | `users`, auth |
| `userService` | Current user profile + owned entities | `me()`, `owned()`, `update()` | `users`, `businesses`, `providers` |
| `catalogService` | Category taxonomy | `getCategories(kind?)` | `categories` |
| `discoveryService` | Search/feed of businesses+providers | feed/search | `businesses`, `providers` |
| `businessService` | **Business CRUD + storefront** (catalog, offers, photos, queue, loyalty, Q&A, analytics, boosts, availability, reviews) | see §7 | `businesses`, `catalog_items`, `offers`, `queue_*`, `ratings`, `leads` |
| `providerService` | **Provider CRUD + service funnel** (packages, portfolio, availability, leads, analytics, reviews) | see §7 | `providers`, `provider_packages`, `portfolio_items`, `ratings`, `leads` |
| `appointmentService` | **Bookings** (create/list/updateStatus) — Supabase table + localStorage fallback | `create`, `listForCustomer`, `listForTarget`, `updateStatus` | `appointments` |
| `requestService` | Requests, proposals, agreements feed | `feed`, `agreements`, propose | `requests`, `proposals`, `agreements` |
| `communityService` | Community posts/comments/likes | `feed`, `byAuthor`, `like`, `comments`, `addComment` | `community_posts`, `post_likes`, `post_comments` |
| `socialService` | Vouches, endorsements, available-now list | add/remove vouch/endorsement, `availableNow()` | `vouches`, `endorsements`, `providers` |
| `chatService` | 1:1 conversations + messages | `getOrCreate`, send, list | `conversations`, `messages` |
| `notificationService` | In-app notifications | `getUnreadCount`, `markAllRead` | `notifications` |
| `walletService` | Coupons + loyalty stamps | save/unsave coupon, `addStamp` | `user_saved_coupons`, loyalty tables |
| `uploadService` | File upload to Supabase Storage | `upload(file, folder)` | Storage buckets |
| `kycService` | Aadhaar/PAN verification | submit/verify | verification tables |
| `leaderboardService` | Points leaderboard | fetch board | points/leaderboard views |
| `societyService` | Society/neighborhood groups | CRUD | society tables |
| `subscriptionService` | Recurring subscriptions | CRUD | subscriptions |
| `proService` | Pro plans + lead packs (`PRO_PLANS`, `LEAD_PACKS`) | plans, purchase | pro/billing |
| `paymentService` | Payment intents (V3 stub) | — | — |
| `aiService` | AI helpers | — | — |
| `supportService` | Support tickets | submit | support |
| `adminService` | Admin panel data | moderation/queries | many |
| `profileControlService` | Privacy / alias / profile visibility | get/set controls | `users` |

> If you added a method, add it to the "Key methods" cell. If a service touches a new table, add it to "Main tables".

---

## 7. The two seller roles (business vs provider)

The most-edited area. Both follow the same service+screen shape.

**Shared method names (both services):** `mine` · `get` · `reviews` · `update` · `create` ·
`submitVerification` · `recordView` · `leads` · `analytics` · `addReview` · `setAvailability`.

**`businessService` only:** catalog (`addCatalogItem`/`update`/`delete`), offers (`addOffer`/`deleteOffer`),
photos (`addPhoto`/`deletePhoto`/`setCoverPhoto`), queue (`queue`/`queueOwnerState`/`setQueueSettings`/
`callNextToken`/`serveToken`/`joinQueueToken`), `loyaltyCard`, Q&A (`qna`/`askQuestion`/`answerQuestion`),
`buyBoost`/`activeBoosts`, `recordInteraction`, `submitForReview`, `team`, `reservations`/`setReservation`.
⚠️ `reservations`/`setReservation`/`team` are **stubs** (`[]` / `{ok:false}`).

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
| Service (Supabase `appointments` + local fallback) | `src/services/appointmentService.ts` |
| Customer hub (Upcoming/Past, cancel, reschedule, book-again) | `src/screens/requests/MyAppointments.tsx` |
| Business owner console | `src/screens/business/manage/BusinessAppointments.tsx` |
| Provider owner console (Leads + Appointments tabs) | `src/screens/provider/manage/ProviderLeads.tsx` |
| Book buttons | `BusinessDetail.tsx`, `ProviderDetail.tsx` |
| Home entry (tile + upcoming badge) | `src/screens/Home.tsx` |
| Type | `AppointmentRecord`, `AppointmentStatus` in `src/types.ts` |
| DB | `supabase/migrations/20260701_appointments.sql` |

---

## 9. Screens map (`src/screens/`)

**Root / customer:** `Home`, `Explore`, `Search`, `MapView`, `AllCategories`, `CategoryListing`,
`Profile`, `ProfileEdit`, `PublicProfile`, `Notifications`, `Bookmarks`, `Lists`, `Settings`, `Support`,
`Wallet`, `Leaderboard`, `Achievements`, `Neighborhood`, `AvailableNow`, `Splash`, `Requests`,
`Community`, `CommunityHub`, `CommunityCompose`, `CommunityPostDetail`, `StoryCompose`, `TrackingPage`.

**auth/** `PhoneEntry`, `OtpVerify`, `UserOnboard`, `LocationPermission`, `DeletionPending`.

**requests/** `AskCompose`, `SubmitProposal`, `AgreementScreen`, `Agreements`, `RequestDetail`,
`RateScreen`, `MyAppointments`.

**business/** `BusinessDetail`, `BusinessOnboard`; **business/manage/** `ManageDashboard`, `ManageNav`,
`ProfileEditor`, `HoursEditor`, `CatalogManager`, `OffersManager`, `PhotosManager`, `StoryComposer`,
`QueueManager`, `LoyaltySetup`, `QnaManager`, `ReviewsManager`, `Reservations`, `BusinessAppointments`,
`LeadsInbox`, `Promote`, `VerificationCenter`, `BusinessSettings`, `BusinessRequests`.

**provider/** `ProviderDetail`, `ProviderOnboard`; **provider/manage/** `ProviderDashboard`,
`ProviderManageNav`, `ProviderProfileEditor`, `ProviderAvailability`, `ProviderPackages`,
`ProviderPortfolio`, `ProviderLeads`, `ProviderSettings`.

**chat/** `ConversationList`, `ChatThread`. **society/** `SocietyScreen`.
**subscriptions/** `SubscriptionManager`, `NewSubscription`, `SubscriptionDetail`.
**monetization/** `BusinessProUpgrade`. **admin/** `AdminPanel`.

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

- **`src/types.ts`** — the single source of domain types: `CurrentUser`, `Role`, `Business`, `CatalogItem`,
  `Offer`, `Provider`, `ProviderPackage`, `PortfolioItem`, `RequestPost`, `Review`, `AppointmentRecord`,
  `AppointmentStatus`, `ReservationReq`, `QnaItem`, `BookmarkTarget`, etc. **Add new domain shapes here.**
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

*Last mapped: 2026-07 (appointments subsystem, business availability parity, Home appointments tile).* 
*When you change structure, update the section above and bump this line.*
