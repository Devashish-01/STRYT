# STRYT — Executive SEO Master Strategy Plan

> **Product Vision**: STRYT is a hyper-local neighborhood commerce, live queue management, appointment booking, local service request (Pillar C), micro-community, and business/provider directory platform built for India and global local economies.
> **Architecture**: React 18 + TypeScript + Vite (CSR / SPA) + Supabase (Postgres + Realtime + Storage + Edge Functions) + Vercel Hosting + Capacitor 8 Mobile Native App.

---

## 1. Product & Architectural Context

### 1.1 Current SEO Baseline & Critical Flaws
1. **CSR / SPA Single Fallback**: Currently, `index.html` serves as a static client-side shell. Every public URL (`/business/:id`, `/provider/:id`, `/category/:id`, `/request/:id`, `/community/:id`) returns identical static fallback metadata (`STRYT — Your street. Your people.`). Search engines (Googlebot, Bingbot, Yandex) and social web scrapers (WhatsApp, Twitter, LinkedIn, iMessage) cannot dynamically parse metadata for individual businesses, doctors, salons, or requests without pre-rendering or SSR.
2. **Harmful `robots.txt` Configuration**: The current `public/robots.txt` explicitly disallows `/explore`, `/search`, `/categories`, `/map`, `/requests`, blocking critical discovery pathways. Furthermore, it omits programmatic directory routes (`/business/*`, `/provider/*`, `/category/*`, `/city/*`).
3. **Static & Hardcoded Sitemap**: `public/sitemap.xml` only lists the homepage (`https://stryt.in/`). Thousands of dynamic business profiles, provider catalogs, neighborhood categories, and public community posts are completely unindexed.
4. **Lack of Dynamic Open Graph & Twitter Cards**: When a merchant shares their STRYT shop (`stryt.in/business/biz_123`) or a provider shares their service link, link previews display generic app brand metadata instead of the shop's name, cover image, rating, address, and live queue status.
5. **Absence of Dedicated Acquisition Landing Pages**: The app currently routes users straight into the product SPA shell (`/`, `/home`, `/explore`). There are zero dedicated programmatic or static SEO acquisition pages for terms like "Queue Management Software India", "Salon Appointment Booking App", "Doctor Clinic Queue System", "Hire Local Electrician Nearby", or "ONDC Local Commerce Integration".

---

## 2. Strategic Objectives & Growth Pillars

```
+-----------------------------------------------------------------------------------+
|                            STRYT SEO GROWTH FLYWHEEL                              |
+-----------------------------------------------------------------------------------+
|  1. Programmatic Local Directory    --->  Captures "Near Me" & City Category Intent|
|  2. Dynamic SSR / Edge Prerender    --->  Indexed Dynamic Profiles & Social Cards |
|  3. Merchant-Led Virality & QR      --->  Backlinks, Social Shares & Brand Signals |
|  4. AEO & GEO Knowledge Graph       --->  Topical Authority in AI Engine Answers    |
+-----------------------------------------------------------------------------------+
```

### Strategic Objective 1: Dominate Hyper-Local & Commercial Intent (Top 1-3 Rankings)
Target 50,000+ localized long-tail terms across Indian metros and Tier-1/2 cities (`[Category] in [City/Area]`, e.g., "Dental Clinic in Indiranagar Bangalore", "Salon Queue Booking Bandra Mumbai").

### Strategic Objective 2: Turn Merchant Profiles into SEO Landing Machines
Transform every business profile (`/business/:id`) and provider profile (`/provider/:id`) into a high-converting, fully schema-validated entity page complete with `LocalBusiness`, `AggregateRating`, `OfferCatalog`, and live queue `OpeningHoursSpecification`.

### Strategic Objective 3: Answer Engine Optimization (AEO) & Generative AI Search (GEO)
Structure product data, Q&A (`business_qna`), FAQs, and local service guides so AI models (ChatGPT, Gemini, Claude, Perplexity) select STRYT as the primary source for local service queries, queues, and appointments in India.

### Strategic Objective 4: B2B Merchant & Partner Acquisition
Rank #1 for small business software keywords ("Free Queue Management App", "Clinic Appointment Scheduling Software India", "Walk-in Queue Token System", "UPI Payment Request App for Freelancers").

---

## 3. High-Level Technical Architecture Transformation

```
  User / Bot Request (stryt.in/business/biz_987)
                      |
                      v
         Vercel Edge Network / Middleware
                      |
         +------------+------------+
         |                         |
  Is Search Bot /          Is Standard User /
  Social Crawler?          Browser?
         |                         |
         v                         v
  Vercel Edge SSR /        Return Vite SPA Shell
  Supabase Edge Functions  (Client-side hydration)
  (Injects JSON-LD, OG,    + React Helmet Dynamic
   Dynamic Meta & HTML)    Title / Meta updates
```

### Core Architecture Upgrade Recommendations:
1. **Vercel Edge Middleware / Prerender Layer**: Intercept requests from bots (`Googlebot`, `bingbot`, `Twitterbot`, `facebookexternalhit`, `WhatsApp`, `LinkedInBot`) and serve pre-rendered HTML with full JSON-LD schema, dynamic OpenGraph image tags, and custom `<title>`/`<meta>` content.
2. **Dynamic Sitemap API (`/api/sitemap.xml`)**: Connect Vercel Edge Functions directly to Supabase DB to dynamically generate paginated XML sitemaps for all active businesses, verified providers, city categories, and public community posts.
3. **React Helmet / Unhead Integration**: Implement client-side head management in the React SPA (`src/components/SEOHead.tsx`) to update page title, meta description, and canonical tag instantaneously on route changes.
4. **Static Landing & Blog Subdirectory (`/blog`, `/features/*`, `/city/*`)**: Build high-speed, SSG/ISR static pages using Next.js / Astro or Vite static prerendering for top-of-funnel organic acquisition.

---

## 4. Key Performance Indicators (KPIs)

| Metric | Current Baseline | 3-Month Target | 12-Month Target |
|---|---|---|---|
| **Indexed Pages (Google GSC)** | < 10 pages | 15,000+ pages | 150,000+ pages |
| **Monthly Organic Traffic** | < 100 visits | 50,000 visits | 500,000+ visits |
| **Merchant Organic Signups** | 0/mo | 500/mo | 5,000/mo |
| **Domain Authority / Rating** | 1-5 | 25+ | 45+ |
| **Rich Snippet Impression Rate** | 0% | 65% | 85%+ |
| **AI Search Referral Visits** | 0 | 5,000/mo | 50,000/mo |
