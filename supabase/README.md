# Naya — Supabase setup (do this when your account is ready)

Everything below is prepped. When you create your Supabase project, you only
have to run 4 SQL files, set 2 keys, flip 1 switch, and test.

## 1. Create the project
- supabase.com → New project. Pick a region close to your users (e.g. Mumbai).

## 2. Run the SQL (in this exact order)
Open **SQL Editor** in the Supabase dashboard and run each file's contents:

1. `schema.sql`     — tables, enums, indexes, geom triggers (enables PostGIS)
2. `functions.sql`  — the nearby/distance RPC functions
3. `rls.sql`        — Row Level Security (public read, authenticated write)
4. `seed_core.sql`  — categories, users, requests, proposals, agreements
5. `seed_listings.sql` — businesses, catalog, offers, providers, portfolios
6. `migration_writes.sql` — REQUIRED FOR WRITES: auto-generated ids,
   auto profile creation on login, user lat/lng, owner-scoped RLS

(If PostGIS errors on `schema.sql`, enable it first: Database → Extensions →
search "postgis" → enable, then re-run.)

## 3. Create the storage bucket (for photo uploads)
- Storage → New bucket → name it **uploads** → mark it **Public** → create.

## 4. Turn on phone auth (for OTP login)
- Authentication → Providers → Phone → enable.
- Connect an SMS provider (Twilio/MSG91). For India, start DLT registration
  early — it has external lead time.
- For local testing without SMS cost, you can add a test phone number with a
  fixed OTP under Authentication → (phone) test numbers.

## 5. Connect the app
Copy `.env.example` to `.env` and fill in (Project Settings → API):

```
VITE_USE_MOCKS=false
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Use ONLY the **anon/public** key. Never put the service_role key in the app.

## 6. Test the read path first
Run `npm run dev`, then verify:
- Home loads real categories + businesses + providers + requests
- Open a business → its catalog and offers show
- Open a provider → portfolio shows
- Distance sort works (businesses nearest your map center first)

Then test login (phone OTP) and the create flows.

## Switching back to mocks
Set `VITE_USE_MOCKS=true` (or remove the Supabase vars). The app falls back to
in-memory data with zero code changes.

## What's wired so far (read path = live-ready)
- discoveryService: businesses/providers feeds (PostGIS nearby), detail, search
- catalogService: category tree (rebuilt from the flat table)
- requestService: feed / mine / get (proposals nested)
- authService: phone OTP via Supabase Auth
- uploadService: Supabase Storage upload

## Write path (now live — needs migration_writes.sql)
- userService: me / owned / update / setLocation (real auth user)
- businessService: create, update, submitForReview, catalog add/edit/delete,
  offers add/delete, addPhoto, mine, get
- providerService: create, update, addPortfolio, mine, get
- requestService: create, submitProposal, acceptProposal, meToo

How writes work: each insert stamps the logged-in user id (owner_user_id /
user_id / requester_user_id) and lets the DB auto-generate the row id.
Owner-scoped RLS then guarantees a user can only edit their own records.
New users get a public.users row automatically on first login (DB trigger).

## Still on the legacy apiRequest fallback (wire when needed)
- Agreements confirm/complete, ratings
- Q&A, reservations, leads, analytics, boosts, team
- adminService, socialService, communityService, walletService,
  notificationService, publicProfile, provider availability/packages

These still work in mock mode. Wire each one's `useMocks=false` branch to
Supabase the same way (select/insert + toCamel/toSnake) as you need it.

## NOT built yet — Aadhaar / document verification
The Verify step in onboarding and the VerificationCenter screen are UI-only:
they show a toast but do NOT upload or store anything. There is no documents
table and no aadhaar field. This is step 4 of the plan (separate pass).
