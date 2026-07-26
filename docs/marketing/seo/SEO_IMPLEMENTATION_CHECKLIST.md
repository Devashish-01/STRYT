# STRYT — Technical SEO Implementation Checklist

> Actionable engineering and technical checklist for developers to bring STRYT up to world-class SEO standards.

---

## 1. Robots & Crawl Infrastructure

- [ ] **Fix `public/robots.txt`**:
  - Remove blanket `Disallow` directives on public browsing routes (`/home`, `/explore`, `/search`, `/categories`, `/map`).
  - Add explicit `Allow` rules for `/business/`, `/provider/`, `/category/`, `/city/`, `/request/`, `/community/`.
  - Disallow strictly private/auth routes: `/auth/`, `/admin/`, `/manage/`, `/business/*/manage`, `/provider/*/manage`, `/settings`, `/account`, `/chats`, `/notifications`, `/bookmarks`, `/wallet`.
  - Declare canonical sitemap location: `Sitemap: https://stryt.in/sitemap.xml`.

- [ ] **Dynamic Sitemap Generation (`/api/sitemap.xml`)**:
  - Create Vercel Edge Function or Supabase Edge Function `api/sitemap.xml`.
  - Create index sitemap listing sub-sitemaps:
    - `/sitemap-static.xml` (Landing pages, core hubs)
    - `/sitemap-categories.xml` (All business categories & subcategories)
    - `/sitemap-cities.xml` (Programmatic city + category combinations)
    - `/sitemap-businesses-1.xml` (Paginated dynamic business profiles)
    - `/sitemap-providers-1.xml` (Paginated dynamic provider profiles)
    - `/sitemap-community.xml` (Public community posts)

---

## 2. Dynamic Head Metadata & SPA Management

- [ ] **Install Head Management Utility**:
  - Add `react-helmet-async` or `@unhead/react` to client SPA.
- [ ] **Build Reusable `<SEOHead />` Component**:
  - Component location: `src/components/SEOHead.tsx`.
  - Props required: `title`, `description`, `canonical`, `ogImage`, `ogType`, `jsonLd`, `noindex`.
  - Automatically append site name suffix: `${title} | STRYT`.
- [ ] **Implement SEOHead in Key Routes**:
  - `src/screens/business/BusinessDetail.tsx`: Dynamic title `"{b.name} ({b.subCategory}) in {b.city} — Live Queue & Appointments | STRYT"`.
  - `src/screens/provider/ProviderDetail.tsx`: Dynamic title `"{p.name} ({p.title}) in {p.city} — Book Appointments | STRYT"`.
  - `src/screens/CategoryListing.tsx`: Dynamic title `"{categoryName} Services & Shops Nearby in {city} | STRYT"`.
  - `src/screens/requests/RequestDetail.tsx`: Dynamic title `"{req.title} in {req.city} — Local Request | STRYT"`.
  - `src/screens/CommunityPostDetail.tsx`: Dynamic title `"{post.title || post.content.slice(0, 50)} | STRYT Community"`.

---

## 3. Bot Prerendering & OpenGraph Meta Ingestion

- [ ] **Vercel Edge Middleware / Prerenderer (`middleware.ts`)**:
  - Detect User-Agent headers matching: `Googlebot`, `bingbot`, `yandex`, `duckduckbot`, `facebookexternalhit`, `Twitterbot`, `WhatsApp`, `LinkedInBot`, `TelegramBot`, `Slackbot`.
  - If Bot detected on dynamic route (`/business/:id`, `/provider/:id`, `/category/:id`):
    - Fetch minimal entity record from Supabase REST API (`/rest/v1/business_profiles?id=eq.:id`).
    - Inject pre-rendered HTML head tags (`og:title`, `og:description`, `og:image`, `twitter:card`, `JSON-LD`).
    - Serve static HTML directly to bot with 200 OK status.

---

## 4. Structured Data & JSON-LD Schemas

- [ ] **Inject Base Organization & WebSite Schema on Index**:
  - Add `Organization` schema with legal entity name, logo, social links.
  - Add `WebSite` schema with `SearchAction` target pointing to `https://stryt.in/search?q={search_term_string}`.
- [ ] **Inject `LocalBusiness` / `MedicalClinic` / `BeautySalon` on Business Detail**:
  - Map Supabase category to appropriate Schema.org type (`LocalBusiness`, `MedicalClinic`, `Dentist`, `BeautySalon`, `BarberShop`, `AutoRepair`, `Restaurant`).
  - Pass `name`, `image`, `telephone`, `address`, `geo` (latitude, longitude), `aggregateRating`, `priceRange`, `openingHoursSpecification`.
- [ ] **Inject `Service` & `Person` Schema on Provider Detail**:
  - Pass provider skills, hourly rates, verified badge status, past portfolio items as `hasOfferCatalog`.
- [ ] **Inject `FAQPage` Schema on Service & Help Pages**:
  - Include question/answer pairs from `business_qna` table directly into structured data.

---

## 5. Performance & Core Web Vitals (CWV)

- [ ] **Image Optimization**:
  - Replace raw img tags with `<SafeImg />` wrapped in responsive webp/avif srcset generator.
  - Add explicit `width` and `height` attributes to prevent Cumulative Layout Shift (CLS).
  - Enforce `loading="lazy"` on all gallery/catalog images below the fold.
  - Set `loading="eager"` and `fetchpriority="high"` for cover images on `/business/:id` and `/provider/:id`.

- [ ] **Code Splitting & Bundle Size Control**:
  - Verify all screen routes in `src/App.tsx` use `React.lazy()` (already implemented).
  - Move heavy third-party map assets (`leaflet`, `react-leaflet`) to dynamic imports on user interaction or viewport intersection in `MiniMap.tsx`.

- [ ] **Font Optimization**:
  - Preload Google Font `Outfit` in `index.html` with `display=swap` to avoid render-blocking text flashes.

---

## 6. Verification & Monitoring Setup

- [ ] **Google Search Console**: Verify domain ownership via DNS TXT record for `stryt.in`.
- [ ] **Bing Webmaster Tools**: Submit sitemap index.
- [ ] **Google Indexing API Integration**: Setup automated webhooks via Supabase Edge Function to ping Google Indexing API instantly when a new business or provider goes live.
